-- ============================================
-- Multi-contact Cowork
-- Stores named contacts (CAD designer, manufacturer, etc.)
-- matched by WhatsApp phone number.
-- Adds contact_key to cowork_messages for thread isolation.
-- ============================================

-- Named contacts registry
CREATE TABLE cowork_contacts (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  key         TEXT NOT NULL,           -- e.g. 'cad_designer', 'manufacturer_a'
  display_name TEXT NOT NULL,
  phone       TEXT,                    -- digits only, no +, used to match inbound
  system_prompt TEXT,                  -- agent context override for this contact
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, key)
);

ALTER TABLE cowork_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cowork contacts"
  ON cowork_contacts FOR ALL
  USING (auth.uid() = user_id);

-- Add contact_key to messages (default = 'cad_designer' for backwards compat)
ALTER TABLE cowork_messages ADD COLUMN IF NOT EXISTS contact_key TEXT NOT NULL DEFAULT 'cad_designer';
CREATE INDEX idx_cowork_messages_contact ON cowork_messages(user_id, contact_key);

-- SECURITY DEFINER: lookup contact by phone (used by webhook, anon client)
CREATE OR REPLACE FUNCTION get_contact_by_phone(p_phone TEXT)
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
  IF v_user_id IS NULL THEN RETURN NULL; END IF;
  SELECT row_to_json(c) INTO v_result
  FROM cowork_contacts c
  WHERE c.user_id = v_user_id AND c.phone = p_phone
  LIMIT 1;
  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION get_contact_by_phone TO anon;

-- Update process_whatsapp_inbound to store contact_key
CREATE OR REPLACE FUNCTION process_whatsapp_inbound(
  p_inbound_content  TEXT,
  p_sender_name      TEXT    DEFAULT NULL,
  p_draft_content    TEXT    DEFAULT NULL,
  p_media_url        TEXT    DEFAULT NULL,
  p_media_type       TEXT    DEFAULT NULL,
  p_auto_send        BOOLEAN DEFAULT FALSE,
  p_contact_key      TEXT    DEFAULT 'cad_designer'
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

  INSERT INTO cowork_messages (user_id, status, direction, sender_name, content, media_url, media_type, contact_key)
  VALUES (v_user_id, 'received', 'inbound', p_sender_name, p_inbound_content, p_media_url, p_media_type, p_contact_key)
  RETURNING id INTO v_inbound_id;

  IF p_draft_content IS NOT NULL THEN
    v_status := CASE WHEN p_auto_send THEN 'sent' ELSE 'draft' END;
    INSERT INTO cowork_messages (user_id, status, direction, content, parent_id, sent_at, contact_key)
    VALUES (
      v_user_id, v_status, 'outbound', p_draft_content, v_inbound_id,
      CASE WHEN p_auto_send THEN NOW() ELSE NULL END,
      p_contact_key
    )
    RETURNING id INTO v_draft_id;
  END IF;

  RETURN json_build_object('inbound_id', v_inbound_id, 'draft_id', v_draft_id);
END;
$$;
GRANT EXECUTE ON FUNCTION process_whatsapp_inbound TO anon;

-- Update get_cowork_history to support contact_key filtering
CREATE OR REPLACE FUNCTION get_cowork_history(
  p_limit       INT    DEFAULT 20,
  p_contact_key TEXT   DEFAULT 'cad_designer'
)
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
    SELECT id, direction, status, content, media_url, media_type, contact_key, created_at
    FROM cowork_messages
    WHERE user_id = v_user_id
      AND status IN ('received', 'sent')
      AND contact_key = p_contact_key
    ORDER BY created_at DESC
    LIMIT p_limit
  ) m;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;
GRANT EXECUTE ON FUNCTION get_cowork_history TO anon;
