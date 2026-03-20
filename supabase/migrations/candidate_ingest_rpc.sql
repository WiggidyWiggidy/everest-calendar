-- ============================================
-- Candidate Ingestion RPC Function
-- SECURITY DEFINER bypasses RLS so the anon key
-- can insert rows — no service role key needed.
-- The API route validates the X-API-Key header
-- before calling this function.
-- ============================================

CREATE OR REPLACE FUNCTION ingest_upwork_candidate(
  p_name                    TEXT,
  p_upwork_profile_url      TEXT    DEFAULT NULL,
  p_hourly_rate             DECIMAL DEFAULT NULL,
  p_job_success_score       DECIMAL DEFAULT NULL,
  p_location                TEXT    DEFAULT NULL,
  p_score                   INTEGER DEFAULT NULL,
  p_tier                    TEXT    DEFAULT 'maybe',
  p_status                  TEXT    DEFAULT 'new',
  p_proposal_snippet        TEXT    DEFAULT NULL,
  p_strengths               TEXT[]  DEFAULT NULL,
  p_weaknesses              TEXT[]  DEFAULT NULL,
  p_manufacturing_experience TEXT   DEFAULT NULL,
  p_cad_software            TEXT[]  DEFAULT NULL,
  p_enclosures_count        INTEGER DEFAULT NULL,
  p_evaluator_notes         TEXT    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER  -- runs as DB owner, bypasses RLS
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_result  JSON;
BEGIN
  -- Get Tom's user_id (sole user of this single-user app)
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found in auth.users';
  END IF;

  INSERT INTO upwork_candidates (
    user_id, name, upwork_profile_url, hourly_rate, job_success_score,
    location, score, tier, status, proposal_snippet, strengths, weaknesses,
    manufacturing_experience, cad_software, enclosures_count, evaluator_notes
  ) VALUES (
    v_user_id,
    p_name,
    p_upwork_profile_url,
    p_hourly_rate,
    p_job_success_score,
    p_location,
    p_score,
    p_tier,
    p_status,
    p_proposal_snippet,
    p_strengths,
    p_weaknesses,
    p_manufacturing_experience,
    p_cad_software,
    p_enclosures_count,
    p_evaluator_notes
  )
  RETURNING json_build_object('id', id, 'created_at', created_at) INTO v_result;

  RETURN v_result;
END;
$$;

-- Allow the anon role to call this function
-- (API route validates the X-API-Key header before calling)
GRANT EXECUTE ON FUNCTION ingest_upwork_candidate TO anon;
