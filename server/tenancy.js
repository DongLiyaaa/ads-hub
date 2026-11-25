import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { pool } from './db.js';

const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = 'sharescope_session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_TENANT_ID = '00000000-0000-4000-8000-000000000001';
const DEFAULT_STORE_ID = '00000000-0000-4000-8000-000000000101';
const DEMO_TENANT_ID = '00000000-0000-4000-8000-00000000d001';
const DEMO_STORE_ID = '00000000-0000-4000-8000-00000000d101';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const loginAttempts = new Map();

export class AuthError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError('请输入有效邮箱');
  return email;
}

function requiredText(value, label, maxLength = 100) {
  const text = String(value || '').trim();
  if (!text || text.length > maxLength || text.includes('\u0000')) throw new AuthError(`${label}不能为空或超过 ${maxLength} 个字符`);
  return text;
}

function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 12 || password.length > 128 || password.includes('\u0000')) throw new AuthError('密码需为 12–128 个字符');
  return password;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(validatePassword(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt:16384:8:1:${salt.toString('base64url')}:${Buffer.from(hash).toString('base64url')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, n, r, p, salt, expected] = String(stored || '').split(':');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const actual = await scrypt(String(password || ''), Buffer.from(salt, 'base64url'), 64, { N: Number(n), r: Number(r), p: Number(p) });
  const expectedBuffer = Buffer.from(expected, 'base64url');
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseCookies(header) {
  return Object.fromEntries(String(header || '').split(';').map((item) => {
    const index = item.indexOf('=');
    if (index < 0) return null;
    try { return [item.slice(0, index).trim(), decodeURIComponent(item.slice(index + 1))]; } catch { return null; }
  }).filter(Boolean));
}

export function setSessionCookie(request, response, token) {
  const secure = request.secure || request.headers['x-forwarded-proto'] === 'https';
  response.append('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DURATION_MS / 1000}${secure ? '; Secure' : ''}`);
}

export function clearSessionCookie(response) {
  response.append('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

async function insertSession(userId, tenantId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const { rows } = await pool.query(
    'INSERT INTO app_sessions (token_hash, user_id, active_tenant_id, expires_at) VALUES ($1, $2, $3, $4) RETURNING id, expires_at',
    [tokenHash(token), userId, tenantId, new Date(Date.now() + SESSION_DURATION_MS)],
  );
  return { token, sessionId: rows[0].id, expiresAt: rows[0].expires_at };
}

const FORMAL_ADMIN_QUERY = `SELECT EXISTS (
  SELECT 1 FROM tenant_memberships m
  JOIN tenants t ON t.id = m.tenant_id AND t.environment = 'formal'
  JOIN app_users u ON u.id = m.user_id AND u.active = true
  WHERE m.role = 'admin' AND m.active = true
) AS configured`;

export async function getSetupStatus() {
  const { rows } = await pool.query(FORMAL_ADMIN_QUERY);
  return { needsSetup: !rows[0].configured };
}

export async function setupAdministrator(input) {
  const email = normalizeEmail(input?.email);
  const displayName = requiredText(input?.displayName, '管理员姓名');
  const workspaceName = requiredText(input?.workspaceName, '租户名称');
  const passwordHash = await hashPassword(input?.password);
  const client = await pool.connect();
  let userId;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['sharescope-bootstrap']);
    const { rows } = await client.query(FORMAL_ADMIN_QUERY);
    if (rows[0].configured) throw new AuthError('管理员已完成初始化，请直接登录', 409);
    const { rows: users } = await client.query(
      'INSERT INTO app_users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [email, displayName, passwordHash],
    );
    userId = users[0].id;
    await client.query('UPDATE tenants SET name = $2 WHERE id = $1', [DEFAULT_TENANT_ID, workspaceName]);
    await client.query(
      'INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)',
      [DEFAULT_TENANT_ID, userId, 'admin'],
    );
    await client.query(
      'INSERT INTO user_store_access (tenant_id, membership_id, store_id) SELECT $1, id, $3 FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2',
      [DEFAULT_TENANT_ID, userId, DEFAULT_STORE_ID],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return insertSession(userId, DEFAULT_TENANT_ID);
}

function attemptKey(request, email) {
  return `${request.ip || 'local'}:${email}`;
}

function checkLoginRate(key) {
  const entry = loginAttempts.get(key);
  if (entry && entry.resetAt > Date.now() && entry.count >= 10) throw new AuthError('登录尝试过多，请稍后再试', 429);
  if (entry?.resetAt <= Date.now()) loginAttempts.delete(key);
}

export async function loginAdministratorOrUser(request, input) {
  const email = normalizeEmail(input?.email);
  const key = attemptKey(request, email);
  checkLoginRate(key);
  const { rows } = await pool.query('SELECT * FROM app_users WHERE email = $1', [email]);
  const user = rows[0];
  const valid = user ? await verifyPassword(input?.password, user.password_hash) : false;
  if (!user || !valid || !user.active) {
    const current = loginAttempts.get(key) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
    loginAttempts.set(key, { ...current, count: current.count + 1 });
    throw new AuthError('邮箱或密码错误', 401);
  }
  loginAttempts.delete(key);
  const { rows: memberships } = await pool.query(
    `SELECT m.tenant_id FROM tenant_memberships m JOIN tenants t ON t.id = m.tenant_id
      WHERE m.user_id = $1 AND m.active = true AND t.active = true ORDER BY m.created_at LIMIT 1`,
    [user.id],
  );
  if (!memberships[0]) throw new AuthError('账号尚未分配可用租户，请联系管理员', 403);
  return insertSession(user.id, memberships[0].tenant_id);
}

export async function loginDemo() {
  const client = await pool.connect();
  let userId;
  try {
    await client.query('BEGIN');
    const { rows: tenants } = await client.query("SELECT id FROM tenants WHERE id = $1 AND environment = 'demo' AND active = true", [DEMO_TENANT_ID]);
    if (!tenants[0]) throw new AuthError('Demo 暂不可用，请稍后重试', 503);
    const email = `demo-${crypto.randomUUID()}@demo.sharescope.local`;
    const { rows: users } = await client.query(
      'INSERT INTO app_users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [email, 'Demo 访客', `demo-only:${crypto.randomBytes(32).toString('base64url')}`],
    );
    userId = users[0].id;
    const { rows: memberships } = await client.query(
      "INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, 'user') RETURNING id",
      [DEMO_TENANT_ID, userId],
    );
    await client.query(
      'INSERT INTO user_store_access (tenant_id, membership_id, store_id) VALUES ($1, $2, $3)',
      [DEMO_TENANT_ID, memberships[0].id, DEMO_STORE_ID],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return insertSession(userId, DEMO_TENANT_ID);
}

export async function authenticate(request, response, next) {
  try {
    const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
    if (!token) throw new AuthError('请先登录', 401);
    const { rows } = await pool.query(
      `SELECT s.id AS session_id, s.expires_at, u.id AS user_id, u.email, u.display_name,
        t.id AS tenant_id, t.name AS tenant_name, t.environment AS tenant_environment, m.role
       FROM app_sessions s
       JOIN app_users u ON u.id = s.user_id AND u.active = true
       JOIN tenant_memberships m ON m.tenant_id = s.active_tenant_id AND m.user_id = s.user_id AND m.active = true
       JOIN tenants t ON t.id = s.active_tenant_id AND t.active = true
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [tokenHash(token)],
    );
    if (!rows[0]) throw new AuthError('登录已失效，请重新登录', 401);
    const row = rows[0];
    request.auth = {
      sessionId: row.session_id,
      expiresAt: row.expires_at,
      user: { id: row.user_id, email: row.email, displayName: row.display_name },
      tenant: { id: row.tenant_id, name: row.tenant_name, role: row.role, environment: row.tenant_environment },
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(request, response, next) {
  if (request.auth?.tenant.role !== 'admin') return next(new AuthError('仅租户管理员可执行此操作', 403));
  return next();
}

export function requireSameSiteRequest(request, response, next) {
  if (request.headers['x-sharescope-request'] !== '1') return next(new AuthError('请求校验失败，请刷新页面后重试', 403));
  return next();
}

export async function getAccessibleStores(auth) {
  const values = [auth.tenant.id];
  let join = '';
  if (auth.tenant.role !== 'admin') {
    join = 'JOIN user_store_access a ON a.store_id = s.id AND a.tenant_id = s.tenant_id JOIN tenant_memberships m ON m.id = a.membership_id AND m.user_id = $2';
    values.push(auth.user.id);
  }
  const { rows } = await pool.query(
    `SELECT s.id, s.name, s.code, s.site FROM stores s ${join}
      WHERE s.tenant_id = $1 AND s.active = true ORDER BY s.created_at, s.name`,
    values,
  );
  return rows.map((row) => ({ id: row.id, name: row.name, code: row.code, site: row.site }));
}

export async function getSessionPayload(auth) {
  const [{ rows: tenants }, stores] = await Promise.all([
    pool.query(
      `SELECT t.id, t.name, t.environment, m.role FROM tenant_memberships m JOIN tenants t ON t.id = m.tenant_id
        WHERE m.user_id = $1 AND m.active = true AND t.active = true ORDER BY t.created_at, t.name`,
      [auth.user.id],
    ),
    getAccessibleStores(auth),
  ]);
  return { authenticated: true, needsSetup: false, user: auth.user, currentTenant: auth.tenant, tenants, stores, expiresAt: auth.expiresAt };
}

export async function switchTenant(auth, tenantId) {
  if (!UUID_PATTERN.test(tenantId || '')) throw new AuthError('租户无效');
  const { rows } = await pool.query(
    `SELECT 1 FROM tenant_memberships m JOIN tenants t ON t.id = m.tenant_id
      WHERE m.user_id = $1 AND m.tenant_id = $2 AND m.active = true AND t.active = true`,
    [auth.user.id, tenantId],
  );
  if (!rows[0]) throw new AuthError('没有该租户的访问权限', 403);
  await pool.query('UPDATE app_sessions SET active_tenant_id = $2 WHERE id = $1', [auth.sessionId, tenantId]);
}

export async function logout(auth) {
  await pool.query('DELETE FROM app_sessions WHERE id = $1', [auth.sessionId]);
}

async function initializeTenant(client, tenantId, activeAgent = 'codex') {
  await client.query(
    `INSERT INTO agent_configurations (tenant_id, agent_type, protocol, model, wire_api) VALUES
      ($1, 'codex', 'openai', '', 'responses'),
      ($1, 'claude-code', 'anthropic', 'claude-opus-5-5', 'responses')`,
    [tenantId],
  );
  await client.query('INSERT INTO agent_preferences (tenant_id, active_agent) VALUES ($1, $2)', [tenantId, activeAgent]);
}

export async function createTenant(auth, input) {
  const name = requiredText(input?.name, '租户名称');
  const storeName = requiredText(input?.storeName, '首个店铺名称');
  const code = requiredText(input?.code, '店铺编码', 40);
  const site = requiredText(input?.site, '站点', 80);
  const client = await pool.connect();
  let tenantId;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('INSERT INTO tenants (name) VALUES ($1) RETURNING id', [name]);
    tenantId = rows[0].id;
    await client.query('INSERT INTO stores (tenant_id, name, code, site) VALUES ($1, $2, $3, $4)', [tenantId, storeName, code, site]);
    await client.query('INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)', [tenantId, auth.user.id, 'admin']);
    await initializeTenant(client, tenantId);
    await client.query('UPDATE app_sessions SET active_tenant_id = $2 WHERE id = $1', [auth.sessionId, tenantId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw new AuthError('租户内该店铺编码与站点组合已存在', 409);
    throw error;
  } finally {
    client.release();
  }
  return tenantId;
}

export async function listTenantAdmin(auth) {
  const [{ rows: stores }, { rows: members }] = await Promise.all([
    pool.query('SELECT id, name, code, site, active FROM stores WHERE tenant_id = $1 ORDER BY created_at, name', [auth.tenant.id]),
    pool.query(
      `SELECT m.id AS membership_id, u.id AS user_id, u.email, u.display_name, m.role, m.active,
        COALESCE((SELECT array_agg(a.store_id) FROM user_store_access a WHERE a.membership_id = m.id), '{}') AS store_ids
       FROM tenant_memberships m JOIN app_users u ON u.id = m.user_id
       WHERE m.tenant_id = $1 ORDER BY m.created_at, u.email`,
      [auth.tenant.id],
    ),
  ]);
  return {
    tenant: auth.tenant,
    stores,
    users: members.map((row) => ({ membershipId: row.membership_id, userId: row.user_id, email: row.email, displayName: row.display_name, role: row.role, active: row.active, storeIds: row.store_ids })),
  };
}

function validateStoreIds(storeIds) {
  if (!Array.isArray(storeIds)) throw new AuthError('店铺＋站点分配格式无效');
  const unique = [...new Set(storeIds)];
  if (unique.some((id) => !UUID_PATTERN.test(id))) throw new AuthError('店铺＋站点分配包含无效 ID');
  return unique;
}

async function replaceStoreAccess(client, tenantId, membershipId, storeIds) {
  const ids = validateStoreIds(storeIds);
  if (ids.length) {
    const { rows } = await client.query('SELECT id FROM stores WHERE tenant_id = $1 AND id = ANY($2::uuid[])', [tenantId, ids]);
    if (rows.length !== ids.length) throw new AuthError('不能分配其他租户或不存在的店铺＋站点', 403);
  }
  await client.query('DELETE FROM user_store_access WHERE tenant_id = $1 AND membership_id = $2', [tenantId, membershipId]);
  if (ids.length) {
    await client.query(
      'INSERT INTO user_store_access (tenant_id, membership_id, store_id) SELECT $1, $2, unnest($3::uuid[])',
      [tenantId, membershipId, ids],
    );
  }
}

export async function createTenantUser(auth, input) {
  const email = normalizeEmail(input?.email);
  const displayName = requiredText(input?.displayName, '用户姓名');
  const role = input?.role || 'user';
  if (!['admin', 'user'].includes(role)) throw new AuthError('用户角色无效');
  const passwordHash = await hashPassword(input?.password);
  const storeIds = validateStoreIds(input?.storeIds || []);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: existing } = await client.query('SELECT id FROM app_users WHERE email = $1', [email]);
    if (existing[0]) throw new AuthError('邮箱已存在，请使用其他邮箱', 409);
    const { rows } = await client.query(
      'INSERT INTO app_users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [email, displayName, passwordHash],
    );
    const { rows: memberships } = await client.query(
      'INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, $3) RETURNING id',
      [auth.tenant.id, rows[0].id, role],
    );
    await replaceStoreAccess(client, auth.tenant.id, memberships[0].id, storeIds);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw new AuthError('邮箱或用户分配已存在', 409);
    throw error;
  } finally {
    client.release();
  }
}

export async function updateTenantUser(auth, membershipId, input) {
  if (!UUID_PATTERN.test(membershipId || '')) throw new AuthError('成员 ID 无效');
  const role = input?.role || 'user';
  const active = input?.active !== false;
  if (!['admin', 'user'].includes(role)) throw new AuthError('用户角色无效');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`sharescope-membership:${auth.tenant.id}`]);
    const { rows } = await client.query(
      'SELECT * FROM tenant_memberships WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [membershipId, auth.tenant.id],
    );
    const target = rows[0];
    if (!target) throw new AuthError('成员不存在', 404);
    if (target.role === 'admin' && (role !== 'admin' || !active)) {
      const { rows: admins } = await client.query(
        "SELECT count(*)::int AS count FROM tenant_memberships WHERE tenant_id = $1 AND role = 'admin' AND active = true",
        [auth.tenant.id],
      );
      if (admins[0].count <= 1) throw new AuthError('租户至少需要保留一名启用中的管理员', 409);
    }
    await client.query('UPDATE tenant_memberships SET role = $3, active = $4 WHERE id = $1 AND tenant_id = $2', [membershipId, auth.tenant.id, role, active]);
    await replaceStoreAccess(client, auth.tenant.id, membershipId, input?.storeIds || []);
    if (!active) await client.query('DELETE FROM app_sessions WHERE user_id = $1 AND active_tenant_id = $2', [target.user_id, auth.tenant.id]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createStore(auth, input) {
  const name = requiredText(input?.name, '店铺名称');
  const code = requiredText(input?.code, '店铺编码', 40);
  const site = requiredText(input?.site, '站点', 80);
  try {
    await pool.query('INSERT INTO stores (tenant_id, name, code, site) VALUES ($1, $2, $3, $4)', [auth.tenant.id, name, code, site]);
  } catch (error) {
    if (error.code === '23505') throw new AuthError('当前租户内该店铺编码与站点组合已存在', 409);
    throw error;
  }
}

export async function requireStoreAccess(auth, storeId) {
  if (!UUID_PATTERN.test(storeId || '')) throw new AuthError('请选择有效店铺');
  const values = [auth.tenant.id, storeId];
  let accessJoin = '';
  if (auth.tenant.role !== 'admin') {
    accessJoin = 'JOIN user_store_access a ON a.store_id = s.id AND a.tenant_id = s.tenant_id JOIN tenant_memberships m ON m.id = a.membership_id AND m.user_id = $3 AND m.active = true';
    values.push(auth.user.id);
  }
  const { rows } = await pool.query(
    `SELECT s.id, s.name, s.code, s.site FROM stores s ${accessJoin}
      WHERE s.tenant_id = $1 AND s.id = $2 AND s.active = true`,
    values,
  );
  if (!rows[0]) throw new AuthError('没有该店铺的访问权限', 403);
  return rows[0];
}
