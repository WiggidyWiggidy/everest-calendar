import { createClient } from '@/lib/supabase/client';
import type { MarketingMetricDaily, MarketingExperiment, MarketingAsset, ExperimentStatus } from '@/types';

// ── Metrics ────────────────────────────────────────────────────────────────

export async function getMetricsHistory(days: number = 30): Promise<MarketingMetricDaily[]> {
  const supabase = createClient();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from('marketing_metrics_daily')
    .select('*')
    .gte('date', since.toISOString().split('T')[0])
    .order('date', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MarketingMetricDaily[];
}

export async function getTodayMetrics(): Promise<MarketingMetricDaily | null> {
  const supabase = createClient();
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('marketing_metrics_daily')
    .select('*')
    .eq('date', today)
    .maybeSingle();
  if (error) throw error;
  return data as MarketingMetricDaily | null;
}

export async function upsertMetrics(metrics: Partial<MarketingMetricDaily> & { date: string }): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { error } = await supabase
    .from('marketing_metrics_daily')
    .upsert({ ...metrics, user_id: user.id }, { onConflict: 'user_id,date' });
  if (error) throw error;
}

// ── Experiments ────────────────────────────────────────────────────────────

export async function getExperiments(status?: ExperimentStatus): Promise<MarketingExperiment[]> {
  const supabase = createClient();
  let query = supabase.from('marketing_experiments').select('*').order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as MarketingExperiment[];
}

export async function createExperiment(exp: Omit<MarketingExperiment, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<MarketingExperiment> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('marketing_experiments')
    .insert({ ...exp, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data as MarketingExperiment;
}

export async function updateExperiment(id: string, updates: Partial<MarketingExperiment>): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('marketing_experiments')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ── Assets (Phase 1 scaffold) ──────────────────────────────────────────────

export async function getAssets(): Promise<MarketingAsset[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('marketing_assets')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MarketingAsset[];
}
