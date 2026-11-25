import { pool } from './db.js';
import { AuthError, requireStoreAccess } from './tenancy.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapMessage(row) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    skills: row.skill_snapshot,
    data: row.data_snapshot,
    agentType: row.agent_type,
    model: row.model,
    ui: row.ui_payload ? {
      ...row.ui_payload,
      protocolVersion: row.ui_protocol_version,
      catalogId: row.ui_catalog_id,
      status: row.ui_status,
      errorCode: row.ui_error_code,
    } : null,
    createdAt: row.created_at,
  };
}

export async function listConversations(auth, storeId) {
  await requireStoreAccess(auth, storeId);
  const { rows } = await pool.query(
    `SELECT id, title, store_id, created_at, updated_at FROM ai_conversations
     WHERE tenant_id = $1 AND user_id = $2 AND store_id = $3
     ORDER BY updated_at DESC, id DESC LIMIT 100`,
    [auth.tenant.id, auth.user.id, storeId],
  );
  return rows.map((row) => ({ id: row.id, title: row.title, storeId: row.store_id, createdAt: row.created_at, updatedAt: row.updated_at }));
}

export async function getConversation(auth, conversationId, storeId) {
  if (!UUID_PATTERN.test(conversationId || '')) throw new AuthError('会话 ID 无效');
  await requireStoreAccess(auth, storeId);
  const { rows } = await pool.query(
    `SELECT id, title, store_id, created_at, updated_at FROM ai_conversations
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND store_id = $4`,
    [conversationId, auth.tenant.id, auth.user.id, storeId],
  );
  if (!rows[0]) throw new AuthError('会话不存在或您无权访问', 404);
  const conversation = rows[0];
  const { rows: messages } = await pool.query(
    `SELECT * FROM ai_conversation_messages
     WHERE conversation_id = $1 AND tenant_id = $2 AND user_id = $3
     ORDER BY created_at, CASE role WHEN 'user' THEN 0 ELSE 1 END, id LIMIT 200`,
    [conversationId, auth.tenant.id, auth.user.id],
  );
  return {
    conversation: { id: conversation.id, title: conversation.title, storeId: conversation.store_id, createdAt: conversation.created_at, updatedAt: conversation.updated_at },
    messages: messages.map(mapMessage),
  };
}

export async function getRecentMessages(auth, conversationId, storeId) {
  if (!conversationId) return [];
  const result = await getConversation(auth, conversationId, storeId);
  return result.messages.slice(-12).map(({ role, content }) => ({ role, content }));
}

export async function saveChatExchange(auth, input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let conversationId = input.conversationId;
    if (conversationId) {
      const { rows } = await client.query(
        `SELECT id FROM ai_conversations
         WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND store_id = $4 FOR UPDATE`,
        [conversationId, auth.tenant.id, auth.user.id, input.storeId],
      );
      if (!rows[0]) throw new AuthError('会话不存在、店铺不匹配或您无权写入', 403);
    } else {
      const title = input.message.replace(/\s+/g, ' ').trim().slice(0, 42) || '新对话';
      const { rows } = await client.query(
        'INSERT INTO ai_conversations (tenant_id, user_id, store_id, title) VALUES ($1, $2, $3, $4) RETURNING id',
        [auth.tenant.id, auth.user.id, input.storeId, title],
      );
      conversationId = rows[0].id;
    }
    const common = [conversationId, auth.tenant.id, auth.user.id];
    await client.query(
      `INSERT INTO ai_conversation_messages (conversation_id, tenant_id, user_id, role, content, skill_snapshot, data_snapshot)
       VALUES ($1, $2, $3, 'user', $4, $5::jsonb, $6::jsonb)`,
      [...common, input.message, JSON.stringify(input.skills), JSON.stringify(input.dataSnapshot)],
    );
    const { rows: assistantRows } = await client.query(
      `INSERT INTO ai_conversation_messages
        (conversation_id, tenant_id, user_id, role, content, skill_snapshot, data_snapshot, agent_type, model,
         ui_protocol_version, ui_catalog_id, ui_payload, ui_status, ui_error_code)
       VALUES ($1, $2, $3, 'assistant', $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11::jsonb, $12, $13) RETURNING *`,
      [...common, input.answer, JSON.stringify(input.skills), JSON.stringify(input.dataSnapshot), input.agentType, input.model,
        input.ui?.protocolVersion || null, input.ui?.catalogId || null,
        input.ui ? JSON.stringify({ messages: input.ui.messages }) : null,
        input.ui?.status || null, input.ui?.errorCode || null],
    );
    const { rows: conversations } = await client.query(
      'UPDATE ai_conversations SET updated_at = now() WHERE id = $1 AND tenant_id = $2 AND user_id = $3 RETURNING id, title, store_id, created_at, updated_at',
      [conversationId, auth.tenant.id, auth.user.id],
    );
    await client.query('COMMIT');
    const conversation = conversations[0];
    return {
      conversation: { id: conversation.id, title: conversation.title, storeId: conversation.store_id, createdAt: conversation.created_at, updatedAt: conversation.updated_at },
      assistantMessage: mapMessage(assistantRows[0]),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
