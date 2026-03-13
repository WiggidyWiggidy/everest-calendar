-- ============================================
-- Daily Focus Control Dashboard Tables
-- Apply in Supabase dashboard: SQL Editor
-- ============================================

-- Daily session: records the user's intended time allocation for the day
CREATE TABLE IF NOT EXISTS daily_focus_sessions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date                 DATE NOT NULL,
  critical_path_hours  NUMERIC(4,2) NOT NULL DEFAULT 2.0,
  feature_limit_hours  NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

-- RLS
ALTER TABLE daily_focus_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own focus sessions"
  ON daily_focus_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast "get today's session" lookup
CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_date
  ON daily_focus_sessions (user_id, date DESC);

-- ─────────────────────────────────────────────────────────────────────────────

-- Tasks queued for a specific focus session (today's ranked task list)
CREATE TABLE IF NOT EXISTS focus_tasks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id         UUID NOT NULL REFERENCES daily_focus_sessions(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  description        TEXT,
  priority_order     INTEGER NOT NULL DEFAULT 0,
  is_critical_path   BOOLEAN NOT NULL DEFAULT false,
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'in-progress', 'done', 'skipped')),
  estimated_minutes  INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE focus_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own focus tasks"
  ON focus_tasks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for listing tasks within a session
CREATE INDEX IF NOT EXISTS idx_focus_tasks_session
  ON focus_tasks (session_id, priority_order ASC);
