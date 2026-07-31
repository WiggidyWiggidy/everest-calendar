import type { SupabaseClient } from '@supabase/supabase-js';

export type MarketingChangeInput = {
  actor?: string;
  source: string;
  surface: string;
  objectType: string;
  objectId?: string | null;
  objectName?: string | null;
  market?: string;
  productHandle?: string;
  changeType: string;
  beforePayload?: Record<string, unknown> | null;
  afterPayload?: Record<string, unknown> | null;
  note?: string | null;
  experimentId?: string | null;
  autoLogged?: boolean;
  metadata?: Record<string, unknown> | null;
};

export async function logMarketingChange(supabase: SupabaseClient, input: MarketingChangeInput) {
  const { error } = await supabase.from('marketing_change_log').insert({
    actor: input.actor ?? 'scheduled_agent',
    source: input.source,
    surface: input.surface,
    object_type: input.objectType,
    object_id: input.objectId ?? null,
    object_name: input.objectName ?? null,
    market: input.market ?? 'AE',
    product_handle: input.productHandle ?? 'kryo2',
    change_type: input.changeType,
    before_payload: input.beforePayload ?? null,
    after_payload: input.afterPayload ?? null,
    note: input.note ?? null,
    experiment_id: input.experimentId ?? null,
    auto_logged: input.autoLogged ?? true,
    metadata: input.metadata ?? {},
  });
  if (error) {
    throw new Error(`marketing_change_log insert failed: ${error.message}`);
  }
}
