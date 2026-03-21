-- ============================================
-- Task Runs — Agent Health Monitoring
-- Logs every agent run (Upwork, Alibaba,
-- WhatsApp, cron jobs) for health tracking.
-- ============================================

CREATE TABLE IF NOT EXISTS task_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  agent_name      TEXT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  status          TEXT NOT NULL CHECK (status IN ('running','success','error')),
  items_processed INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE task_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own task_runs"
  ON task_runs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_task_runs_agent
  ON task_runs(agent_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_runs_user
  ON task_runs(user_id, started_at DESC);

-- ── SECURITY DEFINER RPC ────────────────────────────────────────────────────
-- Used by external agents (API-key routes run as anon — no session).
-- Logs a completed agent run for the single app user.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION log_agent_run(
  p_agent_name      TEXT,
  p_status          TEXT,
  p_items_processed INTEGER    DEFAULT 0,
  p_error_message   TEXT       DEFAULT NULL,
  p_metadata        JSONB      DEFAULT NULL,
  p_started_at      TIMESTAMPTZ DEFAULT NOW(),
  p_completed_at    TIMESTAMPTZ DEFAULT NOW()
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_id      UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;

  INSERT INTO task_runs (
    user_id,
    agent_name,
    started_at,
    completed_at,
    status,
    items_processed,
    error_message,
    metadata
  ) VALUES (
    v_user_id,
    p_agent_name,
    p_started_at,
    p_completed_at,
    p_status,
    p_items_processed,
    p_error_message,
    p_metadata
  )
  RETURNING id INTO v_id;

  RETURN json_build_object('id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION log_agent_run TO anon;
