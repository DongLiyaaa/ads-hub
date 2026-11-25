ALTER TABLE ai_conversation_messages
  ADD COLUMN view_state jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(view_state) = 'object');
