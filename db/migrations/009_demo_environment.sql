ALTER TABLE tenants
  ADD COLUMN environment text NOT NULL DEFAULT 'formal'
  CHECK (environment IN ('formal', 'demo'));

INSERT INTO tenants (id, name, environment) VALUES
  ('00000000-0000-4000-8000-00000000d001', 'ShareScope Demo', 'demo');

INSERT INTO stores (id, tenant_id, name, code, site) VALUES
  ('00000000-0000-4000-8000-00000000d101', '00000000-0000-4000-8000-00000000d001', '演示店铺', 'DEMO-US', 'Amazon.com');

UPDATE report_datasets
SET tenant_id = '00000000-0000-4000-8000-00000000d001',
    store_id = '00000000-0000-4000-8000-00000000d101',
    metadata = metadata || '{"environment":"demo"}'::jsonb
WHERE tenant_id = '00000000-0000-4000-8000-000000000001'
  AND store_id = '00000000-0000-4000-8000-000000000101';

INSERT INTO agent_configurations (tenant_id, agent_type, protocol, model, wire_api, auth_method) VALUES
  ('00000000-0000-4000-8000-00000000d001', 'codex', 'openai', '', 'responses', 'oauth'),
  ('00000000-0000-4000-8000-00000000d001', 'claude-code', 'anthropic', 'claude-opus-5-5', 'responses', 'api_key');
INSERT INTO agent_preferences (tenant_id, active_agent) VALUES
  ('00000000-0000-4000-8000-00000000d001', 'codex');

CREATE INDEX tenants_environment ON tenants(environment);
