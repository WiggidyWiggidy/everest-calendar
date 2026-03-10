'use client';

// ============================================
// Supabase queries for raw_thoughts
// Voice-to-Build Pipeline — Stage 1 DAL
// ============================================
import { createClient } from '@/lib/supabase/client';
import { RawThought } from '@/types';

const supabase = createClient();

// Insert a new raw thought for the current user
export async function insertThought(text: string): Promise<RawThought | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('raw_thoughts')
    .insert({ user_id: user.id, text, status: 'unprocessed' })
    .select()
    .single();

  if (error) { console.error('insertThought error:', error); return null; }
  return data;
}

// Fetch all unprocessed thoughts ordered oldest-first (for batch processing)
export async function getUnprocessedThoughts(): Promise<RawThought[]> {
  const { data, error } = await supabase
    .from('raw_thoughts')
    .select('*')
    .eq('status', 'unprocessed')
    .order('created_at', { ascending: true });

  if (error) { console.error('getUnprocessedThoughts error:', error); return []; }
  return data || [];
}

// Returns the count of unprocessed thoughts (cheap HEAD request — no row data)
export async function getUnprocessedCount(): Promise<number> {
  const { count, error } = await supabase
    .from('raw_thoughts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'unprocessed');

  if (error) { console.error('getUnprocessedCount error:', error); return 0; }
  return count ?? 0;
}

// Batch-update a list of thought IDs to status 'processed'
export async function markThoughtsProcessed(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;

  const { error } = await supabase
    .from('raw_thoughts')
    .update({ status: 'processed' })
    .in('id', ids);

  if (error) { console.error('markThoughtsProcessed error:', error); return false; }
  return true;
}
