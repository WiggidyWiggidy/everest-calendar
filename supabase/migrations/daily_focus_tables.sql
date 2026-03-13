-- ============================================
-- Daily Focus Sessions + Tasks Tables
-- Migration: daily_focus_tables
-- ============================================

-- Table: daily_focus_sessions
-- One row per user per calendar day storing their time allocations
CREATE TABLE IF NOT EXISTS daily_focus_sessions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date                 DATE NOT NULL,
  critical_path_hours  NUMERIC(4,1) NOT NULL DEFAULT 3,
  feature_limit_hours  NUMERIC(4,1) NOT NULL DEFAULT 1,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, date)
);

-- RLS
ALTER TABLE daily_focus_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own focus sessions"
  ON daily_focus_sessions
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Table: focus_tasks
-- Tasks belonging to a daily focus session
CREATE TABLE IF NOT EXISTS focus_tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id        UUID NOT NULL REFERENCES daily_focus_sessions(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT,
  priority_order    INT NOT NULL DEFAULT 0,
  is_critical_path  BOOLEAN NOT NULL DEFAULT false,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'in-progress', 'done')),
  estimated_minutes INT NOT NULL DEFAULT 30,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE focus_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own focus tasks"
  ON focus_tasks
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_date
  ON daily_focus_sessions (user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_focus_tasks_session
  ON focus_tasks (session_id, priority_order ASC);
