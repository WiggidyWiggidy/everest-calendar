-- ============================================
-- Web Push Subscriptions
-- Stores browser push subscription objects
-- so the server can send notifications.
-- ============================================

CREATE TABLE push_subscriptions (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- User can manage their own subscriptions
CREATE POLICY "Users manage own push subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.uid() = user_id);

-- SECURITY DEFINER: webhook (anon client) reads all subscriptions to send push
CREATE OR REPLACE FUNCTION get_push_subscriptions()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_agg(json_build_object(
    'endpoint', endpoint,
    'p256dh',   p256dh,
    'auth',     auth
  ))
  INTO v_result
  FROM push_subscriptions;
  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION get_push_subscriptions TO anon;
