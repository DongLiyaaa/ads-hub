import { spawn } from 'node:child_process';
import { getCodexCliPath, isCodexCliAvailable, runCodexAnalysis } from './codex.js';
import { getClaudeCodePath, isClaudeCodeAvailable, runClaudeCodeAnalysis } from './claude.js';

export function isAgentAvailable(agentType) {
  return agentType === 'claude-code' ? isClaudeCodeAvailable() : isCodexCliAvailable();
}

export function runAgentAnalysis(payload, configuration) {
  return configuration.agentType === 'claude-code'
    ? runClaudeCodeAnalysis(payload, configuration)
    : runCodexAnalysis(payload, configuration);
}

function cliVersion(cli) {
  return new Promise((resolve, reject) => {
    const child = spawn(cli, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('version timeout'));
    }, 5000);
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(output.trim().split('\n')[0].slice(0, 160));
      else reject(new Error('version failed'));
    });
  });
}

export async function checkAgentConnection(configuration) {
  const startedAt = Date.now();
  const name = configuration.agentType === 'claude-code' ? 'Claude Code' : 'Codex CLI';
  const cli = configuration.agentType === 'claude-code' ? getClaudeCodePath() : getCodexCliPath();
  const checks = [];
  if (!cli) {
    const result = {
      status: 'error', message: `未找到 ${name} 可执行文件`, durationMs: Date.now() - startedAt,
      checks: [
        { id: 'cli', label: 'CLI 运行时', status: 'error', detail: '未安装或未配置可执行文件路径' },
        { id: 'auth', label: '认证配置', status: 'skipped', detail: '未执行' },
        { id: 'model', label: '模型连通性', status: 'skipped', detail: '未执行' },
      ],
    };
    return { ...result, agentType: configuration.agentType, checkedAt: new Date().toISOString() };
  }

  try {
    const version = await cliVersion(cli);
    checks.push({ id: 'cli', label: 'CLI 运行时', status: 'success', detail: version });
  } catch {
    checks.push({ id: 'cli', label: 'CLI 运行时', status: 'error', detail: 'CLI 存在，但版本检查失败' });
    const result = { status: 'error', message: `${name} 无法启动`, durationMs: Date.now() - startedAt, checks };
    return { ...result, agentType: configuration.agentType, checkedAt: new Date().toISOString() };
  }

  checks.push({
    id: 'auth', label: '认证配置', status: 'success',
    detail: configuration.apiKey ? `使用已保存密钥 ${configuration.apiKeyHint || '••••'}` : '未保存密钥，将使用 CLI 已有登录或免认证服务',
  });
  try {
    const generated = configuration.agentType === 'claude-code'
      ? await runClaudeCodeAnalysis({}, configuration, true)
      : await runCodexAnalysis({}, configuration, true);
    checks.push({ id: 'model', label: '模型连通性', status: 'success', detail: `${generated.model} 已返回自检响应` });
    const result = { status: 'success', message: `${name} 与模型服务连接正常`, durationMs: Date.now() - startedAt, checks };
    return { ...result, agentType: configuration.agentType, checkedAt: new Date().toISOString() };
  } catch (error) {
    checks.push({ id: 'model', label: '模型连通性', status: 'error', detail: error.message || '模型请求失败' });
    const result = { status: 'error', message: `${name} 模型服务自检失败`, durationMs: Date.now() - startedAt, checks };
    return { ...result, agentType: configuration.agentType, checkedAt: new Date().toISOString() };
  }
}
