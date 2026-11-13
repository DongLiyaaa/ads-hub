import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { CodexCliError, getCodexCliPath } from './codex.js';
import { getCodexHome } from './codexHome.js';

const PENDING_STATES = new Set(['starting', 'waiting']);
const FILE_CREDENTIALS = ['-c', 'cli_auth_credentials_store_mode="file"'];
const activeSessions = new Map();

function stripAnsi(value) {
  return value.replaceAll(/\u001b\[[0-9;]*m/g, '');
}

export function parseDeviceAuthOutput(value) {
  const output = stripAnsi(String(value || ''));
  const verificationUrl = output
    .match(/https:\/\/[^\s<>"']+/g)
    ?.map((item) => item.replace(/[),.;]+$/g, ''))
    .find((item) => {
      try {
        const { hostname } = new URL(item);
        return ['openai.com', 'chatgpt.com'].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
      } catch {
        return false;
      }
    }) || null;
  const userCode = output.match(/\b[A-Z0-9]{4,8}-[A-Z0-9]{4,8}\b/)?.[0] || null;
  return { verificationUrl, userCode };
}

function publicSession(session) {
  if (!session) return null;
  const waiting = session.status === 'waiting';
  return {
    id: session.id,
    status: session.status,
    message: session.message,
    verificationUrl: waiting ? session.verificationUrl : null,
    userCode: waiting ? session.userCode : null,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  };
}

export function getCodexOAuthSession(tenantId) {
  return publicSession(activeSessions.get(tenantId));
}

export async function startCodexOAuth(tenantId) {
  const cli = getCodexCliPath();
  if (!cli) throw new CodexCliError('未找到 Codex CLI，无法发起 OAuth 登录。', 503);
  const activeSession = activeSessions.get(tenantId);
  if (activeSession && PENDING_STATES.has(activeSession.status)) return publicSession(activeSession);

  const codexHome = getCodexHome(tenantId);
  await mkdir(codexHome, { recursive: true, mode: 0o700 });
  const seededMarker = path.join(codexHome, '.host-seeded-auth');
  if (existsSync(seededMarker)) {
    try {
      await unlink(path.join(codexHome, 'auth.json')).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
      await unlink(seededMarker);
    } catch {
      throw new CodexCliError('无法安全替换导入的 Codex 凭据，请检查 Codex Home 权限。', 500);
    }
  }

  const session = {
    id: crypto.randomUUID(),
    tenantId,
    status: 'starting',
    message: '正在向 OpenAI 请求设备授权码',
    verificationUrl: null,
    userCode: null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    output: '',
    child: null,
    timeout: null,
    killTimer: null,
  };
  activeSessions.set(tenantId, session);

  try {
    session.child = spawn(cli, ['login', '--device-auth', ...FILE_CREDENTIALS], {
      env: { ...process.env, CODEX_HOME: codexHome, NO_COLOR: '1', TERM: 'dumb' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    activeSessions.delete(tenantId);
    throw new CodexCliError('无法启动 Codex OAuth 登录，请检查 CLI 安装。', 503);
  }

  const consume = (chunk) => {
    if (!PENDING_STATES.has(session.status)) return;
    session.output = (session.output + chunk.toString()).slice(-8192);
    const parsed = parseDeviceAuthOutput(session.output);
    session.verificationUrl = parsed.verificationUrl || session.verificationUrl;
    session.userCode = parsed.userCode || session.userCode;
    if (session.verificationUrl && session.userCode) {
      session.status = 'waiting';
      session.message = '请在浏览器中打开验证地址并输入一次性设备码';
    }
  };
  session.child.stdout.on('data', consume);
  session.child.stderr.on('data', consume);
  session.child.on('error', () => {
    clearTimeout(session.timeout);
    session.status = 'error';
    session.message = 'Codex OAuth 进程无法启动，请检查 CLI 安装';
  });
  session.child.on('close', (code) => {
    clearTimeout(session.timeout);
    clearTimeout(session.killTimer);
    if (session.status === 'cancelled' || session.status === 'error') return;
    session.status = code === 0 ? 'success' : 'error';
    session.message = code === 0
      ? 'ChatGPT OAuth 登录成功，凭据已保存在当前租户 Codex Home'
      : 'OAuth 登录未完成，请重试或改用 API Key';
    session.output = '';
  });
  session.timeout = setTimeout(() => {
    if (!PENDING_STATES.has(session.status)) return;
    session.status = 'error';
    session.message = 'OAuth 设备码已过期，请重新发起登录';
    session.child.kill('SIGTERM');
    session.killTimer = setTimeout(() => session.child.kill('SIGKILL'), 3000);
    session.killTimer.unref();
  }, 15 * 60 * 1000 + 5000);
  session.timeout.unref();

  return publicSession(session);
}

export function cancelCodexOAuth(tenantId) {
  const activeSession = activeSessions.get(tenantId);
  if (!activeSession || !PENDING_STATES.has(activeSession.status)) return publicSession(activeSession);
  clearTimeout(activeSession.timeout);
  activeSession.status = 'cancelled';
  activeSession.message = '已取消本次 OAuth 登录';
  activeSession.child.kill('SIGTERM');
  activeSession.killTimer = setTimeout(() => activeSession.child.kill('SIGKILL'), 3000);
  activeSession.killTimer.unref();
  return publicSession(activeSession);
}

export function getCodexOAuthStatus(tenantId) {
  const cli = getCodexCliPath();
  if (!cli) {
    return Promise.resolve({ available: false, loggedIn: false, status: 'unavailable', checkedAt: new Date().toISOString() });
  }

  return new Promise((resolve) => {
    let output = '';
    let settled = false;
    const child = spawn(cli, ['login', 'status', ...FILE_CREDENTIALS], {
      env: { ...process.env, CODEX_HOME: getCodexHome(tenantId), NO_COLOR: '1', TERM: 'dumb' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const finish = (available, loggedIn, status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ available, loggedIn, status, checkedAt: new Date().toISOString() });
    };
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      finish(false, false, 'error');
    }, 5000);
    const consume = (chunk) => { output = (output + chunk.toString()).slice(-2048); };
    child.stdout.on('data', consume);
    child.stderr.on('data', consume);
    child.on('error', () => finish(false, false, 'error'));
    child.on('close', (code) => {
      if (code === 0) finish(true, /Logged in using ChatGPT/i.test(output), /Logged in using ChatGPT/i.test(output) ? 'logged_in' : 'logged_out');
      else if (/Not logged in/i.test(output)) finish(true, false, 'logged_out');
      else finish(true, false, 'error');
    });
  });
}

export async function getCodexOAuthState(tenantId) {
  const status = await getCodexOAuthStatus(tenantId);
  return { ...status, session: publicSession(activeSessions.get(tenantId)) };
}
