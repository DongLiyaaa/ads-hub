ALTER TABLE agent_configurations
  ADD COLUMN auth_method text NOT NULL DEFAULT 'api_key'
  CHECK (auth_method IN ('api_key', 'oauth'));

ALTER TABLE agent_configurations
  ADD CONSTRAINT agent_auth_method_matches_type
  CHECK (agent_type = 'codex' OR auth_method = 'api_key');
