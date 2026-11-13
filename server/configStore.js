import crypto from 'node:crypto';
import { pool } from './db.js';

export const AGENT_TYPES = new Set(['codex', 'claude-code']);
const PROTOCOLS = { codex: 'openai', 'claude-code': 'anthropic' };

export class AgentConfigError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'AgentConfigError';
    this.status = status;
  }
}

function encryptionKey() {
  const value = process.env.MODEL_CONFIG_ENCRYPTION_KEY || '';
  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new AgentConfigError('服务端尚未配置模型密钥加密参数', 503);
  }
  return Buffer.from(value, 'hex');
}

function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptSecret(value) {
  if (!value) return '';
  const [version, iv, tag, encrypted] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !encrypted) throw new AgentConfigError('模型密钥格式无效', 500);
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : value || null;
}

function publicConfig(row) {
  return {
    agentType: row.agent_type,
    name: row.agent_type === 'codex' ? 'Codex CLI' : 'Claude Code',
    protocol: row.protocol,
    baseUrl: row.base_url,
    model: row.model,
    wireApi: row.wire_api,
    timeoutSeconds: row.timeout_seconds,
    authMethod: row.agent_type === 'codex' ? (row.auth_method || 'api_key') : 'api_key',
    hasApiKey: Boolean(row.api_key_encrypted),
    apiKeyHint: row.api_key_hint,
    revision: row.revision,
    updatedAt: iso(row.updated_at),
    lastCheck: row.last_check_at ? {
      status: row.last_check_status,
      message: row.last_check_message,
      checkedAt: iso(row.last_check_at),
      durationMs: row.last_check_duration_ms,
    } : null,
  };
}

function validateUrl(value) {
  if (!value) return '';
  if (value.length > 2048) throw new AgentConfigError('Base URL 过长');
  let url;
  try { url = new URL(value); } catch { throw new AgentConfigError('Base URL 格式无效'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new AgentConfigError('Base URL 仅支持 HTTP/HTTPS，且不能包含账号密码');
  }
  return value;
}

function validateInput(agentType, input) {
  if (!AGENT_TYPES.has(agentType) || !input || typeof input !== 'object') throw new AgentConfigError('Agent 类型无效');
  if (input.protocol !== PROTOCOLS[agentType]) throw new AgentConfigError('Agent 与模型协议不匹配');
  const model = String(input.model || '').trim();
  const apiKey = input.apiKey == null ? '' : String(input.apiKey).trim();
  const authMethod = agentType === 'codex' ? (input.authMethod || 'api_key') : 'api_key';
  const wireApi = input.wireApi || 'responses';
  const timeoutSeconds = Number(input.timeoutSeconds || 180);
  if (!['api_key', 'oauth'].includes(authMethod)) throw new AgentConfigError('Codex 认证方式无效');
  if (agentType !== 'codex' && input.authMethod && input.authMethod !== 'api_key') throw new AgentConfigError('Claude Code 仅支持 API Key 认证');
  if (model.length > 200) throw new AgentConfigError('模型名称过长');
  if (apiKey.length > 4096 || apiKey.includes('\u0000')) throw new AgentConfigError('API Key 格式无效');
  if (wireApi !== 'responses') throw new AgentConfigError('当前 Codex CLI 仅支持 Responses API');
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 15 || timeoutSeconds > 600) throw new AgentConfigError('超时时间需在 15–600 秒之间');
  return { baseUrl: validateUrl(String(input.baseUrl || '').trim()), model, apiKey, authMethod, wireApi, timeoutSeconds, clearApiKey: input.clearApiKey === true };
}

export async function getAgentSettings(tenantId) {
  const [{ rows: preferenceRows }, { rows }] = await Promise.all([
    pool.query('SELECT active_agent FROM agent_preferences WHERE tenant_id = $1', [tenantId]),
    pool.query('SELECT * FROM agent_configurations WHERE tenant_id = $1 ORDER BY agent_type', [tenantId]),
  ]);
  return { activeAgent: preferenceRows[0]?.active_agent || 'codex', configs: rows.map(publicConfig) };
}

export async function getActiveAgentConfig(tenantId, agentType) {
  let selected = agentType;
  if (!selected) {
    const { rows } = await pool.query('SELECT active_agent FROM agent_preferences WHERE tenant_id = $1', [tenantId]);
    selected = rows[0]?.active_agent || 'codex';
  }
  if (!AGENT_TYPES.has(selected)) throw new AgentConfigError('Agent 类型无效');
  const { rows } = await pool.query('SELECT * FROM agent_configurations WHERE tenant_id = $1 AND agent_type = $2', [tenantId, selected]);
  if (!rows[0]) throw new AgentConfigError('Agent 配置不存在', 404);
  return { ...publicConfig(rows[0]), tenantId, apiKey: decryptSecret(rows[0].api_key_encrypted) };
}

export async function saveAgentSettings(tenantId, activeAgent, input) {
  if (!AGENT_TYPES.has(activeAgent)) throw new AgentConfigError('当前 Agent 类型无效');
  const config = validateInput(activeAgent, input);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM agent_configurations WHERE tenant_id = $1 AND agent_type = $2 FOR UPDATE', [tenantId, activeAgent]);
    const previous = rows[0];
    if (!previous) throw new AgentConfigError('Agent 配置不存在', 404);
    let encrypted = previous.api_key_encrypted;
    let hint = previous.api_key_hint;
    if (config.clearApiKey) {
      encrypted = null;
      hint = null;
    } else if (config.apiKey) {
      encrypted = encryptSecret(config.apiKey);
      hint = `••••${config.apiKey.slice(-4)}`;
    }
    const { rows: updated } = await client.query(
      `UPDATE agent_configurations SET
        base_url = $3, model = $4, wire_api = $5, timeout_seconds = $6,
        api_key_encrypted = $7, api_key_hint = $8, auth_method = $9,
        revision = revision + 1, updated_at = now(),
        last_check_status = NULL, last_check_message = NULL, last_check_at = NULL, last_check_duration_ms = NULL
      WHERE tenant_id = $1 AND agent_type = $2 RETURNING *`,
      [tenantId, activeAgent, config.baseUrl, config.model, config.wireApi, config.timeoutSeconds, encrypted, hint, config.authMethod],
    );
    await client.query(
      'INSERT INTO agent_preferences (tenant_id, active_agent, updated_at) VALUES ($1, $2, now()) ON CONFLICT (tenant_id) DO UPDATE SET active_agent = EXCLUDED.active_agent, updated_at = now()',
      [tenantId, activeAgent],
    );
    await client.query('COMMIT');
    return publicConfig(updated[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function recordAgentCheck(tenantId, agentType, result) {
  await pool.query(
    `UPDATE agent_configurations SET last_check_status = $3, last_check_message = $4,
      last_check_at = now(), last_check_duration_ms = $5 WHERE tenant_id = $1 AND agent_type = $2`,
    [tenantId, agentType, result.status, result.message, result.durationMs],
  );
}
