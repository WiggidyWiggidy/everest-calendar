-- ============================================
-- Platform Inbox — Decision Queue
-- Unified approval queue across WhatsApp,
-- Upwork, and Alibaba intake channels.
-- ============================================

CREATE TABLE IF NOT EXISTS platform_inbox (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  platform                  TEXT NOT NULL CHECK (platform IN ('whatsapp', 'upwork', 'alibaba')),
  contact_name              TEXT,
  contact_identifier        TEXT,
  raw_content               TEXT,
  media_url                 TEXT,
  media_type                TEXT,
  ai_summary                TEXT,
  ai_recommendation         TEXT,
  draft_reply               TEXT,
  approval_tier             INTEGER NOT NULL CHECK (approval_tier BETWEEN 0 AND 3),
  status                    TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','approved','edited','rejected','auto_sent','snoozed')),
  approved_at               TIMESTAMPTZ,
  final_reply               TEXT,
  cowork_message_inbound_id UUID REFERENCES cowork_messages(id) ON DELETE SET NULL,
  candidate_id              UUID REFERENCES upwork_candidates(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at                TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- updated_at trigger reuses the function from cowork_tables.sql
CREATE TRIGGER platform_inbox_updated_at
  BEFORE UPDATE ON platform_inbox
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE platform_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own inbox items"
  ON platform_inbox
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── SECURITY DEFINER RPC ────────────────────────────────────────────────────
-- Used by the WhatsApp webhook (runs as anon — no session).
-- Finds the single app user and inserts the inbox item.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_inbox_item(
  p_platform                  TEXT,
  p_contact_name              TEXT,
  p_contact_identifier        TEXT,
  p_raw_content               TEXT,
  p_media_url                 TEXT,
  p_media_type                TEXT,
  p_ai_summary                TEXT,
  p_ai_recommendation         TEXT,
  p_draft_reply               TEXT,
  p_approval_tier             INTEGER,
  p_cowork_message_inbound_id UUID DEFAULT NULL,
  p_candidate_id              UUID DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_inbox_id UUID;
BEGIN
  -- Single-tenant: find the one app user
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;

  INSERT INTO platform_inbox (
    user_id,
    platform,
    contact_name,
    contact_identifier,
    raw_content,
    media_url,
    media_type,
    ai_summary,
    ai_recommendation,
    draft_reply,
    approval_tier,
    cowork_message_inbound_id,
    candidate_id
  ) VALUES (
    v_user_id,
    p_platform,
    p_contact_name,
    p_contact_identifier,
    p_raw_content,
    p_media_url,
    p_media_type,
    p_ai_summary,
    p_ai_recommendation,
    p_draft_reply,
    p_approval_tier,
    p_cowork_message_inbound_id,
    p_candidate_id
  )
  RETURNING id INTO v_inbox_id;

  RETURN json_build_object('inbox_id', v_inbox_id);
END;
$$;

GRANT EXECUTE ON FUNCTION create_inbox_item TO anon;
