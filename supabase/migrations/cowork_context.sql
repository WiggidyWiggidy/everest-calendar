-- ============================================
-- Cowork design brief / context per contact
-- Stores a live editable brief that gets injected
-- into Claude's system prompt before every draft reply.
-- ============================================

CREATE TABLE cowork_context (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  contact_key TEXT NOT NULL DEFAULT 'cad_designer',
  brief       TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, contact_key)
);

ALTER TABLE cowork_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own cowork context"
  ON cowork_context FOR ALL
  USING (auth.uid() = user_id);

-- SECURITY DEFINER so the webhook (anon client) can read the brief
CREATE OR REPLACE FUNCTION get_cowork_context(
  p_contact_key TEXT DEFAULT 'cad_designer'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_brief   TEXT;
BEGIN
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  IF v_user_id IS NULL THEN RETURN ''; END IF;
  SELECT brief INTO v_brief
  FROM cowork_context
  WHERE user_id = v_user_id AND contact_key = p_contact_key;
  RETURN COALESCE(v_brief, '');
END;
$$;

GRANT EXECUTE ON FUNCTION get_cowork_context TO anon;
