// ============================================
// logAgentActivity — Unified agent observability utility
// Uses the service role client so it always writes regardless of RLS.
// Call this from any API route at key decision points.
// ============================================
import { createServiceClient } from '@/lib/supabase/service';

export type ActivityType =
  | 'decision'
  | 'learning'
  | 'error'
  | 'handoff'
  | 'draft'
  | 'approval'
  | 'auto_action'
  | 'info';

export type ActivitySource = 'cowork' | 'vercel';

interface LogActivityOptions {
  agentName:    string;
  agentSource?: ActivitySource;
  activityType: ActivityType;
  description:  string;
  domain?:      string;
  metadata?:    Record<string, unknown>;
}

/**
 * Logs a row to agent_activity_log.
 * Never throws — failures are swallowed so they don't break the calling route.
 */
export async function logAgentActivity(opts: LogActivityOptions): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from('agent_activity_log').insert({
      agent_name:    opts.agentName,
      agent_source:  opts.agentSource ?? 'cowork',
      activity_type: opts.activityType,
      description:   opts.description,
      domain:        opts.domain ?? null,
      metadata:      opts.metadata ?? {},
    });
    if (error) {
      console.error('[logAgentActivity] insert error:', error.message);
    }
  } catch (err) {
    console.error('[logAgentActivity] unexpected error:', err);
  }
}
