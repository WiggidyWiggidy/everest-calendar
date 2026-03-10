'use client';

// ============================================
// Supabase queries for analyst_config
// Voice-to-Build Pipeline — Stage 1 DAL
// ============================================
import { createClient } from '@/lib/supabase/client';
import { AnalystConfig } from '@/types';

const supabase = createClient();

const DEFAULT_MASTER_PROMPT =
  `You are the Lead Technical Analyst scaling global physical product brands (Europe/US focus). Review these raw brain dumps. Break them into distinct technical tasks. Score each task (1-10) based strictly on: 1. Automating workflows to save the founder time. 2. Improving conversion rates and revenue systems. Return a strict JSON array with objects containing: "title" (string), "category" (string), "description" (string, exactly 2 sentences), "priority_score" (integer 1-10). Return ONLY the JSON array. No preamble. No markdown code fences.`;

// Fetch the user's analyst config, creating it with the default prompt if it doesn't exist
export async function getAnalystConfig(): Promise<AnalystConfig> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Try to fetch existing config
  const { data: existing, error: fetchError } = await supabase
    .from('analyst_config')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (existing) return existing;

  // No config exists yet — create one with the default prompt
  if (fetchError && fetchError.code !== 'PGRST116') {
    // PGRST116 = "0 rows" — any other error is unexpected
    console.error('getAnalystConfig fetch error:', fetchError);
    throw fetchError;
  }

  const { data: created, error: insertError } = await supabase
    .from('analyst_config')
    .insert({ user_id: user.id, master_prompt: DEFAULT_MASTER_PROMPT })
    .select()
    .single();

  if (insertError) {
    console.error('getAnalystConfig insert error:', insertError);
    throw insertError;
  }

  return created;
}

// Overwrite the master_prompt and refresh updated_at
export async function updateAnalystConfig(masterPrompt: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from('analyst_config')
    .update({ master_prompt: masterPrompt, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);

  if (error) { console.error('updateAnalystConfig error:', error); return false; }
  return true;
}
