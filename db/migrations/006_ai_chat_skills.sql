CREATE TABLE ai_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text NOT NULL CHECK (btrim(description) <> ''),
  body text NOT NULL CHECK (btrim(body) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, tenant_id)
);

CREATE TABLE ai_skill_user_access (
  tenant_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  PRIMARY KEY (skill_id, membership_id),
  FOREIGN KEY (skill_id, tenant_id) REFERENCES ai_skills(id, tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (membership_id, tenant_id) REFERENCES tenant_memberships(id, tenant_id) ON DELETE CASCADE
);

CREATE TABLE ai_skill_store_access (
  tenant_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  store_id uuid NOT NULL,
  PRIMARY KEY (skill_id, store_id),
  FOREIGN KEY (skill_id, tenant_id) REFERENCES ai_skills(id, tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (store_id, tenant_id) REFERENCES stores(id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX ai_skills_tenant_owner ON ai_skills(tenant_id, owner_id, updated_at DESC);
CREATE INDEX ai_skill_user_access_member ON ai_skill_user_access(tenant_id, membership_id, skill_id);
CREATE INDEX ai_skill_store_access_store ON ai_skill_store_access(tenant_id, store_id, skill_id);

CREATE TABLE ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, tenant_id) REFERENCES stores(id, tenant_id) ON DELETE RESTRICT,
  UNIQUE (id, tenant_id, user_id)
);

CREATE TABLE ai_conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (btrim(content) <> ''),
  skill_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  data_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  agent_type text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (conversation_id, tenant_id, user_id) REFERENCES ai_conversations(id, tenant_id, user_id) ON DELETE CASCADE
);

CREATE INDEX ai_conversations_user_store ON ai_conversations(tenant_id, user_id, store_id, updated_at DESC);
CREATE INDEX ai_conversation_messages_conversation ON ai_conversation_messages(conversation_id, created_at, id);
