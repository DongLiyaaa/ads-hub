import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodexCliError, getSystemPrompt } from './codex.js';

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

export async function runClaudeCodeAnalysis(payload, configuration = {}, selfCheck = false) {
  if (!CLAUDE_CLI) throw new CodexCliError('未找到 Claude Code CLI，请先安装运行时。', 503);
  const workdir = await mkdtemp(path.join(os.tmpdir(), 'sharescope-claude-'));
  const prompt = selfCheck
    ? '这是连通性自检。只回复 OK，不要调用任何工具。'
    : `${getSystemPrompt(payload)}\n\n请分析以下当前筛选范围内的完整汇总数据：\n${JSON.stringify(payload)}`;
  const timeoutMs = Math.min(Number(configuration.timeoutSeconds || 180), selfCheck ? 45 : 600) * 1000;
  const args = [
    '--print', '--output-format', 'text', '--no-session-persistence',
    '--safe-mode', '--setting-sources', '', '--disable-slash-commands', '--strict-mcp-config',
    '--mcp-config', '{"mcpServers":{}}', '--tools', '',
    '--permission-prompts', 'none',
  ];
  if (configuration.model) args.push('--model', configuration.model);

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
      let output = '';
      let killTimer;
      const appendOutput = (chunk) => {
        if (output.length < 65536) output = (output + chunk.toString()).slice(0, 65536);
      };
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearTimeout(killTimer);
        callback(value);
      };
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        finish(reject, new CodexCliError('Claude Code 请求超时，请检查模型服务。', 504));
        killTimer = setTimeout(() => child.kill('SIGKILL'), 3000);
        killTimer.unref();
      }, timeoutMs);
      child.stdout.on('data', appendOutput);
      child.stderr.on('data', appendOutput);
      child.stdin.on('error', () => {});
      child.on('error', () => finish(reject, new CodexCliError('无法启动 Claude Code CLI。', 503)));
      child.on('close', (code) => {
        if (code !== 0) {
          finish(reject, new CodexCliError('Claude Code 连接或模型请求失败，请检查地址、密钥与模型名称。'));
          return;
        }
        finish(resolve, output.trim());
      });
      child.stdin.end(prompt);
    });
    if (!analysis) throw new CodexCliError('Claude Code 返回了空内容，请重试。');
    return { analysis, model: `Claude Code · ${configuration.model || 'CLI 默认模型'}` };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
