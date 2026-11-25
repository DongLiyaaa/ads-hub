import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCodexPrompt, CodexCliError } from './codex.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLAUDE_CANDIDATES = [
  process.env.CLAUDE_CLI_PATH,
  path.resolve(__dirname, '../node_modules/.bin/claude'),
  '/Users/dongli/.claude/local/claude',
].filter(Boolean);
const CLAUDE_CLI = CLAUDE_CANDIDATES.find((candidate) => existsSync(candidate));

export function isClaudeCodeAvailable() {
  return Boolean(CLAUDE_CLI);
}

export function getClaudeCodePath() {
  return CLAUDE_CLI || null;
}

export function buildClaudeCodeArgs(configuration = {}) {
  const effort = configuration.effort || 'low';
  const args = [
    '--print', '--output-format', 'text', '--no-session-persistence',
    '--safe-mode', '--setting-sources', '', '--disable-slash-commands', '--strict-mcp-config',
    '--mcp-config', '{"mcpServers":{}}', '--tools', '',
    '--permission-prompts', 'none', '--effort', effort,
  ];
  if (configuration.model) args.push('--model', configuration.model);
  return args;
}

export async function runClaudeCodeAnalysis(payload, configuration = {}, selfCheck = false, options = {}) {
  if (!CLAUDE_CLI) throw new CodexCliError('未找到 Claude Code CLI，请先安装运行时。', 503);
  const { signal } = options;
  if (signal?.aborted) throw new CodexCliError('分析请求已取消。', 499);
  const workdir = await mkdtemp(path.join(os.tmpdir(), 'sharescope-claude-'));
  const prompt = buildCodexPrompt(payload, selfCheck);
  const timeoutMs = Math.min(Number(configuration.timeoutSeconds || 180), selfCheck ? 45 : 600) * 1000;
  const args = buildClaudeCodeArgs(configuration);

  try {
    const analysis = await new Promise((resolve, reject) => {
      const env = { ...process.env, NO_COLOR: '1' };
      if (configuration.baseUrl) env.ANTHROPIC_BASE_URL = configuration.baseUrl;
      if (configuration.apiKey) {
        env.ANTHROPIC_API_KEY = configuration.apiKey;
        delete env.ANTHROPIC_AUTH_TOKEN;
      }
      const child = spawn(CLAUDE_CLI, args, { cwd: workdir, env, stdio: ['pipe', 'pipe', 'pipe'] });
      let settled = false;
      let stdoutText = '';
      let stderrText = '';
      let killTimer;
      const appendStdout = (chunk) => {
        if (stdoutText.length < 262144) stdoutText = (stdoutText + chunk.toString()).slice(0, 262144);
      };
      const appendStderr = (chunk) => {
        if (stderrText.length < 65536) stderrText = (stderrText + chunk.toString()).slice(0, 65536);
      };
      const terminateChild = () => {
        child.kill('SIGTERM');
        killTimer = setTimeout(() => child.kill('SIGKILL'), 3000);
        killTimer.unref();
      };
      const onAbort = () => {
        terminateChild();
        finish(reject, new CodexCliError('分析请求已取消。', 499));
      };
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearTimeout(killTimer);
        signal?.removeEventListener('abort', onAbort);
        callback(value);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) {
        onAbort();
        return;
      }
      const timeout = setTimeout(() => {
        terminateChild();
        finish(reject, new CodexCliError('Claude Code 请求超时，请检查模型服务或适当调大超时时间。', 504));
      }, timeoutMs);
      child.stdout.on('data', appendStdout);
      child.stderr.on('data', appendStderr);
      child.stdin.on('error', () => {});
      child.on('error', () => finish(reject, new CodexCliError('无法启动 Claude Code CLI。', 503)));
      child.on('close', (code) => {
        if (code !== 0) {
          finish(reject, new CodexCliError('Claude Code 连接或模型请求失败，请检查地址、密钥与模型名称。'));
          return;
        }
        finish(resolve, stdoutText.trim());
      });
      try {
        child.stdin.end(prompt);
      } catch {
        // Ignore synchronous write failures if child already exited.
      }
    });
    if (!analysis) throw new CodexCliError('Claude Code 返回了空内容，请重试。');
    return { analysis, model: `Claude Code · ${configuration.model || 'CLI 默认模型'}` };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
