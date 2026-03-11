-- ============================================
-- Everest Calendar - Supabase Schema
-- ============================================
-- Run this SQL in your Supabase SQL Editor:
-- 1. Go to https://supabase.com/dashboard
-- 2. Select your project
-- 3. Click "SQL Editor" in the left sidebar
-- 4. Paste this entire file and click "Run"
-- ============================================

-- Enable UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Table: calendar_events
-- Stores all calendar events for each user
-- ============================================
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  event_time TIME,
  category TEXT NOT NULL CHECK (category IN ('product', 'marketing', 'content', 'meeting', 'deadline')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in-progress', 'done')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Table: chat_messages
-- Stores chat conversation history with Claude
-- ============================================
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Row Level Security (RLS)
-- Users can only access their own data
-- ============================================

-- Enable RLS on both tables
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- calendar_events policies
CREATE POLICY "Users can view their own events"
  ON calendar_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own events"
  ON calendar_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own events"
  ON calendar_events FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own events"
  ON calendar_events FOR DELETE
  USING (auth.uid() = user_id);

-- chat_messages policies
CREATE POLICY "Users can view their own messages"
  ON chat_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own messages"
  ON chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- Auto-update updated_at on calendar_events
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Indexes for performance
-- ============================================
CREATE INDEX idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX idx_calendar_events_date ON calendar_events(event_date);
CREATE INDEX idx_calendar_events_user_date ON calendar_events(user_id, event_date);
CREATE INDEX idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at);

-- ============================================
-- Voice-to-Build Pipeline Tables
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
