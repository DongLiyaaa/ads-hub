ALTER TABLE ai_conversation_messages
  ADD COLUMN ui_protocol_version text,
  ADD COLUMN ui_catalog_id text,
  ADD COLUMN ui_payload jsonb,
  ADD COLUMN ui_status text CHECK (ui_status IN ('ready', 'fallback')),
  ADD COLUMN ui_error_code text;
