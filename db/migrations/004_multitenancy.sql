CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('admin', 'user')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id),
  UNIQUE (id, tenant_id)
);

CREATE TABLE stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  code text NOT NULL,
  site text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (id, tenant_id)
);

CREATE TABLE user_store_access (
  tenant_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  store_id uuid NOT NULL,
  PRIMARY KEY (membership_id, store_id),
  FOREIGN KEY (membership_id, tenant_id) REFERENCES tenant_memberships(id, tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (store_id, tenant_id) REFERENCES stores(id, tenant_id) ON DELETE CASCADE
);

CREATE TABLE app_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash char(64) NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  active_tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX app_sessions_expiry ON app_sessions(expires_at);
CREATE INDEX tenant_memberships_user ON tenant_memberships(user_id, active);
CREATE INDEX user_store_access_store ON user_store_access(store_id, membership_id);

INSERT INTO tenants (id, name) VALUES
  ('00000000-0000-4000-8000-000000000001', '默认工作区');
INSERT INTO stores (id, tenant_id, name, code, site) VALUES
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', '默认店铺', 'US11', 'Amazon.com');

ALTER TABLE report_datasets ADD COLUMN tenant_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE report_datasets ADD COLUMN store_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000101';
ALTER TABLE report_datasets ADD CONSTRAINT report_dataset_store_tenant_match
  FOREIGN KEY (store_id, tenant_id) REFERENCES stores(id, tenant_id) ON DELETE RESTRICT;
ALTER TABLE report_datasets DROP CONSTRAINT report_datasets_report_type_source_sha256_key;
ALTER TABLE report_datasets ADD CONSTRAINT report_datasets_tenant_store_source_unique
  UNIQUE (tenant_id, store_id, report_type, source_sha256);
CREATE INDEX report_datasets_tenant_store_latest
  ON report_datasets (tenant_id, store_id, report_type, imported_at DESC);

ALTER TABLE agent_preferences DROP CONSTRAINT agent_preferences_active_agent_fkey;

ALTER TABLE agent_configurations ADD COLUMN tenant_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE agent_configurations DROP CONSTRAINT agent_configurations_pkey;
ALTER TABLE agent_configurations ADD PRIMARY KEY (tenant_id, agent_type);

ALTER TABLE agent_preferences ADD COLUMN tenant_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES tenants(id) ON DELETE RESTRICT;
ALTER TABLE agent_preferences DROP CONSTRAINT agent_preferences_pkey;
ALTER TABLE agent_preferences DROP COLUMN id;
ALTER TABLE agent_preferences ADD PRIMARY KEY (tenant_id);
ALTER TABLE agent_preferences ADD CONSTRAINT agent_preferences_agent_check CHECK (active_agent IN ('codex', 'claude-code'));
