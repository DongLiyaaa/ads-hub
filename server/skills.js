import { pool } from './db.js';
import { AuthError, getAccessibleStores } from './tenancy.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredText(value, label, maxLength) {
  const text = String(value || '').trim();
  if (!text) throw new AuthError(`请填写${label}`);
  if (text.length > maxLength || text.includes('\u0000')) throw new AuthError(`${label}不能超过 ${maxLength} 个字符或包含无效字符`);
  return text;
}

function requiredIds(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new AuthError(`请至少选择一项${label}`);
  const ids = [...new Set(value)];
  if (ids.length > 500 || ids.some((id) => !UUID_PATTERN.test(id))) throw new AuthError(`${label}包含无效 ID`);
  return ids;
}

export function validateSkillInput(input) {
  return {
    name: requiredText(input?.name, 'Skill 名称', 100),
    description: requiredText(input?.description, 'Skill 描述', 500),
    body: requiredText(input?.body, 'Skill 正文', 20000),
    userIds: requiredIds(input?.userIds, '用户权限'),
    storeIds: requiredIds(input?.storeIds, '站点权限'),
  };
}

export async function getSkillOptions(auth) {
  if (auth.tenant.role === 'admin') {
    const [{ rows: users }, { rows: stores }] = await Promise.all([
      pool.query(
        `SELECT u.id, u.display_name, u.email, m.role FROM tenant_memberships m
         JOIN app_users u ON u.id = m.user_id AND u.active = true
         WHERE m.tenant_id = $1 AND m.active = true ORDER BY u.display_name, u.email`,
        [auth.tenant.id],
      ),
      pool.query('SELECT id, name, code, site FROM stores WHERE tenant_id = $1 AND active = true ORDER BY created_at, name', [auth.tenant.id]),
    ]);
    return {
      users: users.map((row) => ({ id: row.id, displayName: row.display_name, email: row.email, role: row.role })),
      stores,
    };
  }
  return {
    users: [{ id: auth.user.id, displayName: auth.user.displayName, email: auth.user.email, role: 'user' }],
    stores: await getAccessibleStores(auth),
  };
}

function visibilitySql(auth, values) {
  if (auth.tenant.role === 'admin') return { sql: '', values };
  values.push(auth.user.id);
  return {
    sql: `AND (s.owner_id = $${values.length} OR EXISTS (
      SELECT 1 FROM ai_skill_user_access sua
      JOIN tenant_memberships sm ON sm.id = sua.membership_id AND sm.tenant_id = sua.tenant_id
      WHERE sua.skill_id = s.id AND sm.user_id = $${values.length} AND sm.active = true
    ))`,
    values,
  };
}

function mapSkill(row, auth) {
  const canEdit = auth.tenant.role === 'admin' || row.owner_id === auth.user.id;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    body: row.body,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    isOwner: row.owner_id === auth.user.id,
    canEdit,
    userIds: canEdit ? row.user_ids : [],
    storeIds: row.store_ids,
    userCount: Number(row.user_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSkills(auth, { storeId } = {}) {
  const values = [auth.tenant.id];
  const visibility = visibilitySql(auth, values);
  let storeFilter = '';
  if (storeId) {
    if (!UUID_PATTERN.test(storeId)) throw new AuthError('店铺＋站点 ID 无效');
    values.push(storeId);
    storeFilter = `AND EXISTS (SELECT 1 FROM ai_skill_store_access ssa WHERE ssa.skill_id = s.id AND ssa.store_id = $${values.length})`;
  }
  const { rows } = await pool.query(
    `SELECT s.*, u.display_name AS owner_name,
      COALESCE((SELECT array_agg(sm.user_id) FROM ai_skill_user_access sua JOIN tenant_memberships sm ON sm.id = sua.membership_id WHERE sua.skill_id = s.id), '{}') AS user_ids,
      COALESCE((SELECT array_agg(ssa.store_id) FROM ai_skill_store_access ssa WHERE ssa.skill_id = s.id), '{}') AS store_ids,
      (SELECT count(*) FROM ai_skill_user_access sua WHERE sua.skill_id = s.id) AS user_count
     FROM ai_skills s JOIN app_users u ON u.id = s.owner_id
     WHERE s.tenant_id = $1 ${visibility.sql} ${storeFilter}
     ORDER BY s.updated_at DESC, s.name`,
    values,
  );
  return rows.map((row) => mapSkill(row, auth));
}

async function validatePermissions(client, auth, input) {
  if (auth.tenant.role !== 'admin') {
    if (input.userIds.length !== 1 || input.userIds[0] !== auth.user.id) {
      throw new AuthError('普通用户只能将自己填写为用户权限；如需分配给其他用户，请联系管理员', 403);
    }
  }
  const { rows: members } = await client.query(
    `SELECT u.id, m.id AS membership_id FROM tenant_memberships m JOIN app_users u ON u.id = m.user_id
     WHERE m.tenant_id = $1 AND u.id = ANY($2::uuid[]) AND m.active = true AND u.active = true`,
    [auth.tenant.id, input.userIds],
  );
  if (members.length !== input.userIds.length) throw new AuthError('用户权限包含其他租户、已停用或不存在的用户', 403);

  const { rows: stores } = await client.query(
    'SELECT id FROM stores WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND active = true',
    [auth.tenant.id, input.storeIds],
  );
  if (stores.length !== input.storeIds.length) throw new AuthError('站点权限包含其他租户、已停用或不存在的店铺＋站点', 403);

  if (auth.tenant.role !== 'admin') {
    const accessible = new Set((await getAccessibleStores(auth)).map((store) => store.id));
    if (input.storeIds.some((id) => !accessible.has(id))) throw new AuthError('不能把自己无权访问的店铺＋站点写入 Skill 权限', 403);
  }
  return members;
}

async function replaceAccess(client, tenantId, skillId, members, storeIds) {
  await client.query('DELETE FROM ai_skill_user_access WHERE tenant_id = $1 AND skill_id = $2', [tenantId, skillId]);
  await client.query('DELETE FROM ai_skill_store_access WHERE tenant_id = $1 AND skill_id = $2', [tenantId, skillId]);
  await client.query(
    'INSERT INTO ai_skill_user_access (tenant_id, skill_id, membership_id) SELECT $1, $2, unnest($3::uuid[])',
    [tenantId, skillId, members.map((member) => member.membership_id)],
  );
  await client.query(
    'INSERT INTO ai_skill_store_access (tenant_id, skill_id, store_id) SELECT $1, $2, unnest($3::uuid[])',
    [tenantId, skillId, storeIds],
  );
}

export async function saveSkill(auth, input, skillId = null) {
  const normalized = validateSkillInput(input);
  if (skillId && !UUID_PATTERN.test(skillId)) throw new AuthError('Skill ID 无效');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let id = skillId;
    if (id) {
      const { rows } = await client.query('SELECT owner_id FROM ai_skills WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [id, auth.tenant.id]);
      if (!rows[0]) throw new AuthError('Skill 不存在或不在当前租户', 404);
      if (auth.tenant.role !== 'admin' && rows[0].owner_id !== auth.user.id) throw new AuthError('只能编辑自己创建的 Skill', 403);
      await client.query(
        'UPDATE ai_skills SET name = $3, description = $4, body = $5, updated_at = now() WHERE id = $1 AND tenant_id = $2',
        [id, auth.tenant.id, normalized.name, normalized.description, normalized.body],
      );
    } else {
      const { rows } = await client.query(
        'INSERT INTO ai_skills (tenant_id, owner_id, name, description, body) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [auth.tenant.id, auth.user.id, normalized.name, normalized.description, normalized.body],
      );
      id = rows[0].id;
    }
    const members = await validatePermissions(client, auth, normalized);
    await replaceAccess(client, auth.tenant.id, id, members, normalized.storeIds);
    await client.query('COMMIT');
    return id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteSkill(auth, skillId) {
  if (!UUID_PATTERN.test(skillId || '')) throw new AuthError('Skill ID 无效');
  const values = [skillId, auth.tenant.id];
  let ownerFilter = '';
  if (auth.tenant.role !== 'admin') {
    values.push(auth.user.id);
    ownerFilter = 'AND owner_id = $3';
  }
  const result = await pool.query(`DELETE FROM ai_skills WHERE id = $1 AND tenant_id = $2 ${ownerFilter}`, values);
  if (!result.rowCount) throw new AuthError('Skill 不存在或您无权删除', 404);
}

export async function getSkillsForChat(auth, skillIds, storeId) {
  if (!UUID_PATTERN.test(storeId || '')) throw new AuthError('店铺＋站点 ID 无效');
  if (!Array.isArray(skillIds) || skillIds.length > 8 || skillIds.some((id) => !UUID_PATTERN.test(id))) {
    throw new AuthError('最多同时加载 8 个有效 Skill');
  }
  const ids = [...new Set(skillIds)];
  if (!ids.length) return [];
  const values = [auth.tenant.id, ids, storeId];
  const visibility = visibilitySql(auth, values);
  const { rows } = await pool.query(
    `SELECT s.id, s.name, s.description, s.body FROM ai_skills s
     WHERE s.tenant_id = $1 AND s.id = ANY($2::uuid[])
       AND EXISTS (SELECT 1 FROM ai_skill_store_access ssa WHERE ssa.skill_id = s.id AND ssa.store_id = $3)
       ${visibility.sql}`,
    values,
  );
  if (rows.length !== ids.length) throw new AuthError('所选 Skill 不存在、未分配给您或不适用于当前店铺＋站点', 403);
  return rows.map((row) => ({ id: row.id, name: row.name, description: row.description, body: row.body }));
}
