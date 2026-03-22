-- ============================================
-- Orchestration Wiring — 2026-03-22
-- 1. system_proposals table (self-improvement loop)
-- 2. task_runs: next_directive_type + next_directive_metadata columns
--    (loop closure: completed task run → auto-create next directive)
-- Applied via Supabase MCP (not pasted manually)
-- ============================================

-- 1. system_proposals
CREATE TABLE IF NOT EXISTS public.system_proposals (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id              UUID DEFAULT '174f2dff-7a96-464c-a919-b473c328d531'::uuid,
  proposed_by          TEXT NOT NULL,
  proposal_type        TEXT NOT NULL CHECK (proposal_type = ANY (ARRAY[
    'schema_change', 'prompt_update', 'new_directive', 'code_change',
    'process_improvement', 'bug_fix'
  ])),
  title                TEXT NOT NULL,
  description          TEXT NOT NULL,
  rationale            TEXT,
  evidence             TEXT,
  estimated_impact     TEXT,
  implementation_notes TEXT,
  status               TEXT DEFAULT 'pending' CHECK (status = ANY (ARRAY[
    'pending', 'approved', 'rejected', 'feedback_given', 'queued', 'implemented', 'verified'
  ])),
  whatsapp_message_id  TEXT,
  whatsapp_sent_at     TIMESTAMPTZ,
  your_feedback        TEXT,
  approved_at          TIMESTAMPTZ,
  implemented_at       TIMESTAMPTZ,
  metadata             JSONB DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.system_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_owns_proposals" ON public.system_proposals;
CREATE POLICY "user_owns_proposals" ON public.system_proposals
  FOR ALL USING (user_id = auth.uid());

-- Allow service role + anon (for API route inserts via log_activity pattern)
CREATE POLICY "service_write_proposals" ON public.system_proposals
  FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_system_proposals_status ON public.system_proposals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_proposals_created ON public.system_proposals(created_at DESC);

-- 2. task_runs: loop closure columns
ALTER TABLE public.task_runs
  ADD COLUMN IF NOT EXISTS next_directive_type TEXT,
  ADD COLUMN IF NOT EXISTS next_directive_metadata JSONB;
