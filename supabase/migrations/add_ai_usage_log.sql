CREATE TABLE IF NOT EXISTS ai_usage_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  operation TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd DECIMAL(10,6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own ai usage" ON ai_usage_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ai usage" ON ai_usage_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_user_date ON ai_usage_log(user_id, created_at DESC);
