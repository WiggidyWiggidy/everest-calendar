-- ============================================
-- Voice-to-Build Pipeline — Database Schema
-- ============================================

-- Raw thoughts captured via voice or text input
CREATE TABLE raw_thoughts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unprocessed' CHECK (status IN ('unprocessed', 'processed', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE raw_thoughts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own thoughts" ON raw_thoughts FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_raw_thoughts_user_status ON raw_thoughts(user_id, status);
CREATE INDEX idx_raw_thoughts_created ON raw_thoughts(created_at DESC);

-- Processed task backlog items
CREATE TABLE task_backlog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  priority_score INTEGER NOT NULL CHECK (priority_score >= 1 AND priority_score <= 10),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'in-progress', 'done', 'dismissed')),
  source_thought_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE task_backlog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own tasks" ON task_backlog FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_task_backlog_user_status ON task_backlog(user_id, status);
CREATE INDEX idx_task_backlog_priority ON task_backlog(priority_score DESC);

-- Editable master prompt config for the System Analyst (one row per user)
CREATE TABLE analyst_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  master_prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE analyst_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own config" ON analyst_config FOR ALL USING (auth.uid() = user_id);

-- Add agent_type column to existing agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS agent_type TEXT NOT NULL DEFAULT 'chat' CHECK (agent_type IN ('chat', 'analyst'));
