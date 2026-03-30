// Marketing Safety Guardrails
// Protects existing Shopify pages, Meta ads, and product data from
// accidental deletion, modification, or degradation by AI agents.
//
// Rules enforced:
// 1. NEVER delete a Shopify page. No DELETE endpoint exists.
// 2. NEVER update an existing Shopify page's body_html. Only create new pages.
// 3. All new pages created as drafts. Publishing requires separate explicit action.
// 4. All new Meta ads created PAUSED.
// 5. Budget changes capped at 50% increase per day.
// 6. Max 3 ad pauses per day from automated agents.
// 7. Proposals expire after 48 hours.

import { SupabaseClient } from '@supabase/supabase-js';

// ── Snapshot: capture state before any destructive operation ─────────────────

export async function snapshotBeforeWrite(
  supabase: SupabaseClient,
  userId: string,
  resourceType: string,
  resourceId: string,
  snapshotData: Record<string, unknown>,
  reason: string,
  proposalId?: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('content_backups')
    .insert({
      user_id: userId,
      resource_type: resourceType,
      resource_id: resourceId,
      snapshot_data: snapshotData,
      snapshot_reason: reason,
      triggered_by: reason.startsWith('pre_') ? reason : `pre_${reason}`,
      proposal_id: proposalId || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create safety snapshot:', error);
    return null;
  }
  return data.id;
}

// ── Snapshot a Shopify page before publish/unpublish ─────────────────────────

export async function snapshotShopifyPage(
  supabase: SupabaseClient,
  userId: string,
  shopifyPageId: string,
  shopifyUrl: string,
  shopifyToken: string,
  reason: 'pre_publish' | 'pre_unpublish' | 'pre_update'
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://${shopifyUrl}/admin/api/2024-01/pages/${shopifyPageId}.json`,
      { headers: { 'X-Shopify-Access-Token': shopifyToken } }
    );
    if (!res.ok) {
      console.error('Failed to fetch Shopify page for snapshot:', res.status);
      return null;
    }
    const data = await res.json();
    return snapshotBeforeWrite(supabase, userId, 'shopify_page', shopifyPageId, data.page, reason);
  } catch (err) {
    console.error('Shopify snapshot error:', err);
    return null;
  }
}

// ── Audit log: immutable record of every operation ──────────────────────────

export async function auditLog(
  supabase: SupabaseClient,
  userId: string,
  operation: string,
  resourceType: string,
  resourceId: string,
  beforeState: Record<string, unknown> | null,
  afterState: Record<string, unknown> | null,
  triggeredBy: 'user' | 'scheduled_agent' | 'proposal_execution',
  metadata?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from('marketing_audit_log')
    .insert({
      user_id: userId,
      operation,
      resource_type: resourceType,
      resource_id: resourceId,
      before_state: beforeState,
      after_state: afterState,
      triggered_by: triggeredBy,
      metadata: metadata || null,
    });

  if (error) {
    console.error('Audit log write failed:', error);
  }
}

// ── Throttle check: prevent runaway agent actions ───────────────────────────

const DAILY_LIMITS: Record<string, number> = {
  ad_pause: 3,
  ad_scale: 5,
  page_publish: 10,
  page_unpublish: 5,
};

export async function checkThrottle(
  supabase: SupabaseClient,
  userId: string,
  actionType: string
): Promise<{ allowed: boolean; count: number; limit: number }> {
  const limit = DAILY_LIMITS[actionType] ?? 10;
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('safety_throttle')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action_type', actionType)
    .gte('executed_at', since.toISOString());

  const currentCount = error ? 0 : (count ?? 0);
  return { allowed: currentCount < limit, count: currentCount, limit };
}

export async function recordThrottle(
  supabase: SupabaseClient,
  userId: string,
  actionType: string
): Promise<void> {
  await supabase.from('safety_throttle').insert({
    user_id: userId,
    action_type: actionType,
  });
}

// ── Budget change validation ────────────────────────────────────────────────

export function validateBudgetChange(
  currentBudget: number,
  newBudget: number
): { valid: boolean; reason?: string } {
  if (newBudget <= 0) {
    return { valid: false, reason: 'Budget must be greater than $0' };
  }
  if (newBudget > currentBudget * 1.5) {
    return {
      valid: false,
      reason: `Budget increase capped at 50% per change. Current: $${currentBudget}, max: $${(currentBudget * 1.5).toFixed(2)}, requested: $${newBudget}`,
    };
  }
  return { valid: true };
}

// ── Proposal validation ─────────────────────────────────────────────────────

export function validateProposal(proposal: {
  proposal_type: string;
  action_data: Record<string, unknown>;
  created_at: string;
}): { valid: boolean; reason?: string } {
  // Check expiry (48 hours)
  const created = new Date(proposal.created_at).getTime();
  const now = Date.now();
  const hours48 = 48 * 60 * 60 * 1000;

  if (now - created > hours48) {
    return { valid: false, reason: 'Proposal expired (older than 48 hours). Create a new one.' };
  }

  // Validate specific fields per type
  const data = proposal.action_data;

  switch (proposal.proposal_type) {
    case 'pause_ad':
      if (!data.ad_creative_id) return { valid: false, reason: 'Missing ad_creative_id' };
      break;
    case 'scale_ad':
      if (!data.ad_creative_id) return { valid: false, reason: 'Missing ad_creative_id' };
      if (typeof data.new_budget !== 'number' || data.new_budget <= 0) {
        return { valid: false, reason: 'new_budget must be a positive number' };
      }
      break;
    case 'page_variant':
      if (!data.landing_page_id) return { valid: false, reason: 'Missing landing_page_id' };
      break;
    case 'new_blog':
      if (!data.topic) return { valid: false, reason: 'Missing topic' };
      break;
    case 'new_creative':
      if (!data.headline || !data.body_copy) return { valid: false, reason: 'Missing headline or body_copy' };
      break;
  }

  return { valid: true };
}

// ── PAUSED enforcement for Meta ads ─────────────────────────────────────────

export function enforceAdPaused(adPayload: Record<string, unknown>): Record<string, unknown> {
  return { ...adPayload, status: 'PAUSED' };
}

// ── Draft enforcement for Shopify pages ─────────────────────────────────────

export function enforceDraft(pagePayload: Record<string, unknown>): Record<string, unknown> {
  return { ...pagePayload, published: false };
}
