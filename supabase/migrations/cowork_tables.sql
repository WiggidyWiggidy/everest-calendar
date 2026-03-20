-- ============================================
-- WhatsApp Cowork Thread
-- Stores inbound messages from the CAD designer
-- and Claude-drafted replies for Tom to review/send.
-- ============================================

CREATE TABLE cowork_messages (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  -- 'received' = inbound from CAD designer
  -- 'draft'    = Claude's reply awaiting Tom's review
  -- 'sent'     = Tom approved and sent via Green API
  status      TEXT CHECK (status IN ('received', 'draft', 'sent')) NOT NULL,
  direction   TEXT CHECK (direction IN ('inbound', 'outbound')) NOT NULL,
  sender_name TEXT,
  content     TEXT NOT NULL,
  parent_id   UUID REFERENCES cowork_messages(id) ON DELETE CASCADE,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cowork_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own cowork messages"
  ON cowork_messages FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_cowork_messages_user_id ON cowork_messages(user_id);
CREATE INDEX idx_cowork_messages_status  ON cowork_messages(user_id, status);
CREATE INDEX idx_cowork_messages_created ON cowork_messages(user_id, created_at DESC);

-- update_updated_at_column already exists from upwork_candidates migration
-- (CREATE OR REPLACE is safe to run again)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ language 'plpgsql';

CREATE TRIGGER update_cowork_messages_updated_at
  BEFORE UPDATE ON cowork_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================
-- RPC: process_whatsapp_inbound
-- Called by the unauthenticated webhook route.
-- SECURITY DEFINER bypasses RLS.
-- Saves inbound message + Claude draft atomically.
-- ============================================
CREATE OR REPLACE FUNCTION process_whatsapp_inbound(
  p_inbound_content  TEXT,
  p_sender_name      TEXT DEFAULT NULL,
  p_draft_content    TEXT DEFAULT NULL
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
BEGIN
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found in auth.users';
  END IF;

  INSERT INTO cowork_messages (user_id, status, direction, sender_name, content)
  VALUES (v_user_id, 'received', 'inbound', p_sender_name, p_inbound_content)
  RETURNING id INTO v_inbound_id;

  IF p_draft_content IS NOT NULL THEN
    INSERT INTO cowork_messages (user_id, status, direction, content, parent_id)
    VALUES (v_user_id, 'draft', 'outbound', p_draft_content, v_inbound_id)
    RETURNING id INTO v_draft_id;
  END IF;

  RETURN json_build_object('inbound_id', v_inbound_id, 'draft_id', v_draft_id);
END;
$$;

GRANT EXECUTE ON FUNCTION process_whatsapp_inbound TO anon;
