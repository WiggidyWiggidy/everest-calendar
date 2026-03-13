-- ============================================
-- voice_conversations table
-- Apply this migration in the Supabase SQL editor.
-- ============================================

CREATE TABLE IF NOT EXISTS voice_conversations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transcript       TEXT NOT NULL,
  assistant_response TEXT,
  audio_duration   NUMERIC,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE voice_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own voice conversations"
  ON voice_conversations
  FOR ALL
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS voice_conversations_user_id_idx
  ON voice_conversations (user_id, created_at DESC);
