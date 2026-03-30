-- Safety Guardrails: backup snapshots + immutable audit log
-- Must be run BEFORE any marketing automation goes live

-- 1. Content backups (pre-operation snapshots + daily full backups)
CREATE TABLE IF NOT EXISTS content_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN (
    'shopify_page', 'meta_campaign', 'meta_adset', 'meta_ad', 'meta_creative',
    'landing_page', 'ad_creative', 'full_backup'
  )),
  resource_id TEXT NOT NULL,
  snapshot_data JSONB NOT NULL,
  snapshot_reason TEXT NOT NULL,
  triggered_by TEXT NOT NULL CHECK (triggered_by IN (
    'manual', 'scheduled_backup', 'pre_publish', 'pre_unpublish',
    'pre_pause', 'pre_scale', 'pre_update', 'pre_delete'
  )),
  proposal_id UUID,
  can_restore BOOLEAN DEFAULT true,
  restored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_backups_resource ON content_backups(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_content_backups_created ON content_backups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_backups_user ON content_backups(user_id);

ALTER TABLE content_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own backups" ON content_backups FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create backups" ON content_backups FOR INSERT WITH CHECK (auth.uid() = user_id);
-- No UPDATE or DELETE policies -- backups are immutable from client side

-- 2. Immutable audit log (append-only, no updates or deletes allowed via client)
CREATE TABLE IF NOT EXISTS marketing_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN (
    'page_created', 'page_published', 'page_unpublished',
    'ad_created', 'ad_paused', 'ad_resumed', 'ad_budget_changed',
    'proposal_created', 'proposal_approved', 'proposal_rejected', 'proposal_executed',
    'blog_created', 'backup_created', 'restore_executed',
    'batch_ads_created', 'batch_pages_created', 'batch_blogs_created'
  )),
  resource_type TEXT,
  resource_id TEXT,
  before_state JSONB,
  after_state JSONB,
  metadata JSONB,
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('user', 'scheduled_agent', 'proposal_execution')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_operation ON marketing_audit_log(operation);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON marketing_audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON marketing_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON marketing_audit_log(user_id);

ALTER TABLE marketing_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own audit logs" ON marketing_audit_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert audit logs" ON marketing_audit_log FOR INSERT WITH CHECK (auth.uid() = user_id);
-- No UPDATE or DELETE policies -- audit log is append-only

-- 3. Safety throttle tracking (prevents runaway agent actions)
CREATE TABLE IF NOT EXISTS safety_throttle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('ad_pause', 'ad_scale', 'page_publish', 'page_unpublish')),
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safety_throttle_user_action ON safety_throttle(user_id, action_type, executed_at DESC);

ALTER TABLE safety_throttle ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own throttle" ON safety_throttle FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert throttle" ON safety_throttle FOR INSERT WITH CHECK (auth.uid() = user_id);
