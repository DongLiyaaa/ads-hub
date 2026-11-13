CREATE TABLE agent_configurations (
  agent_type text PRIMARY KEY CHECK (agent_type IN ('codex', 'claude-code')),
  protocol text NOT NULL CHECK (protocol IN ('openai', 'anthropic')),
  base_url text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  wire_api text NOT NULL DEFAULT 'responses' CHECK (wire_api IN ('responses', 'chat')),
  api_key_encrypted text,
  api_key_hint text,
  timeout_seconds integer NOT NULL DEFAULT 180 CHECK (timeout_seconds BETWEEN 15 AND 600),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  last_check_status text CHECK (last_check_status IN ('success', 'error')),
  last_check_message text,
  last_check_at timestamptz,
  last_check_duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO agent_configurations (agent_type, protocol, model, wire_api) VALUES
  ('codex', 'openai', '', 'responses'),
  ('claude-code', 'anthropic', 'claude-opus-5-5', 'responses');

CREATE TABLE agent_preferences (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  active_agent text NOT NULL REFERENCES agent_configurations(agent_type),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO agent_preferences (id, active_agent) VALUES (true, 'codex');

ALTER TABLE ai_analysis_runs ADD COLUMN agent_type text NOT NULL DEFAULT 'codex';
ALTER TABLE ai_analysis_runs ADD COLUMN config_revision integer;
