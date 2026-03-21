-- agent_activity_log: unified activity log for both Vercel and Cowork agents
-- Applied directly via Supabase MCP (not run manually)

CREATE TABLE IF NOT EXISTS agent_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT '174f2dff-7a96-464c-a919-b473c328d531',
  agent_name TEXT NOT NULL,
  agent_source TEXT NOT NULL DEFAULT 'cowork' CHECK (agent_source IN ('cowork', 'vercel')),
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'decision', 'learning', 'error', 'handoff', 'draft', 'approval', 'auto_action', 'info'
  )),
  description TEXT NOT NULL,
  domain TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_created ON agent_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_agent ON agent_activity_log(agent_name, created_at DESC);

ALTER TABLE agent_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own activity" ON agent_activity_log
  FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Service role write activity" ON agent_activity_log
  FOR INSERT WITH CHECK (true);

-- log_activity RPC — anon-accessible so Cowork agents can write activity entries
CREATE OR REPLACE FUNCTION log_activity(
  p_agent_name TEXT,
  p_agent_source TEXT,
  p_activity_type TEXT,
  p_description TEXT,
  p_domain TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO agent_activity_log (agent_name, agent_source, activity_type, description, domain, metadata)
  VALUES (p_agent_name, p_agent_source, p_activity_type, p_description, p_domain, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION log_activity TO anon;
