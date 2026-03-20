-- ============================================
-- Cowork: image storage, conversation history RPC,
-- and auto-send support
-- ============================================

-- Add media columns to cowork_messages
ALTER TABLE cowork_messages ADD COLUMN IF NOT EXISTS media_url  TEXT;
ALTER TABLE cowork_messages ADD COLUMN IF NOT EXISTS media_type TEXT;

-- Update process_whatsapp_inbound to accept media + auto_send params
CREATE OR REPLACE FUNCTION process_whatsapp_inbound(
  p_inbound_content  TEXT,
  p_sender_name      TEXT    DEFAULT NULL,
  p_draft_content    TEXT    DEFAULT NULL,
  p_media_url        TEXT    DEFAULT NULL,
  p_media_type       TEXT    DEFAULT NULL,
  p_auto_send        BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID;
  v_inbound_id UUID;
  v_draft_id   UUID;
  v_status     TEXT;
BEGIN
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found in auth.users';
  END IF;

  INSERT INTO cowork_messages (user_id, status, direction, sender_name, content, media_url, media_type)
  VALUES (v_user_id, 'received', 'inbound', p_sender_name, p_inbound_content, p_media_url, p_media_type)
  RETURNING id INTO v_inbound_id;

  IF p_draft_content IS NOT NULL THEN
    v_status := CASE WHEN p_auto_send THEN 'sent' ELSE 'draft' END;
    INSERT INTO cowork_messages (user_id, status, direction, content, parent_id, sent_at)
    VALUES (
      v_user_id,
      v_status,
      'outbound',
      p_draft_content,
      v_inbound_id,
      CASE WHEN p_auto_send THEN NOW() ELSE NULL END
    )
    RETURNING id INTO v_draft_id;
  END IF;

  RETURN json_build_object('inbound_id', v_inbound_id, 'draft_id', v_draft_id);
END;
$$;

GRANT EXECUTE ON FUNCTION process_whatsapp_inbound TO anon;

-- Fetch conversation history for Claude context (last N sent/received messages)
CREATE OR REPLACE FUNCTION get_cowork_history(p_limit INT DEFAULT 20)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_result  JSON;
BEGIN
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  IF v_user_id IS NULL THEN RETURN '[]'::JSON; END IF;

  SELECT json_agg(row_to_json(m) ORDER BY m.created_at ASC)
  INTO v_result
  FROM (
    SELECT id, direction, status, content, media_url, media_type, created_at
    FROM cowork_messages
    WHERE user_id = v_user_id
      AND status IN ('received', 'sent')
    ORDER BY created_at DESC
    LIMIT p_limit
  ) m;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION get_cowork_history TO anon;

-- Supabase Storage bucket for CAD images
INSERT INTO storage.buckets (id, name, public)
VALUES ('cowork-media', 'cowork-media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anon to upload (webhook is secret-protected, paths are random UUIDs)
CREATE POLICY "Allow anon upload to cowork-media"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'cowork-media');

-- Allow public read (bucket is public, paths are non-guessable UUIDs)
CREATE POLICY "Allow public read of cowork-media"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'cowork-media');
