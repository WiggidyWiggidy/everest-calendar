-- ============================================
-- Platform Inbox v2 — metadata + Realtime
-- Adds metadata JSONB, transitioned status,
-- enables REPLICA IDENTITY FULL for Realtime.
-- ============================================

-- Add metadata column for agent-supplied context
-- (e.g. manufacturer_id, quote data, Alibaba listing URL)
ALTER TABLE platform_inbox ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add 'transitioned' status for "Move to WhatsApp" action
ALTER TABLE platform_inbox DROP CONSTRAINT IF EXISTS platform_inbox_status_check;
ALTER TABLE platform_inbox ADD CONSTRAINT platform_inbox_status_check
  CHECK (status IN ('pending','approved','edited','rejected','auto_sent','snoozed','transitioned'));

-- Enable full row in Realtime UPDATE payloads
-- (without this, UPDATE events only carry the PK)
ALTER TABLE platform_inbox REPLICA IDENTITY FULL;

-- ── Updated create_inbox_item RPC ────────────────────────────────────────────
-- Adds p_metadata parameter (backward-compatible — defaults to NULL)
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
  p_candidate_id              UUID DEFAULT NULL,
  p_metadata                  JSONB DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id  UUID;
  v_inbox_id UUID;
BEGIN
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
    candidate_id,
    metadata
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
    p_candidate_id,
    p_metadata
  )
  RETURNING id INTO v_inbox_id;

  RETURN json_build_object('inbox_id', v_inbox_id);
END;
$$;

GRANT EXECUTE ON FUNCTION create_inbox_item TO anon;
