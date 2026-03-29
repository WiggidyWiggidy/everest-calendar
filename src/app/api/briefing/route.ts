// ============================================
// GET /api/briefing — today's brief + live stats
// Combines: daily_briefs table + live inbox/supplier/contact data
// ============================================
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch today's brief (if morning-digest has run)
  const today = new Date().toISOString().split('T')[0];
  const { data: brief } = await supabase
    .from('daily_briefs')
    .select('*')
    .eq('brief_date', today)
    .maybeSingle();

  // Live inbox counts
  const { count: pendingCount } = await supabase
    .from('platform_inbox')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'pending');

  const { count: readyCount } = await supabase
    .from('platform_inbox')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .in('status', ['approved', 'edited'])
    .in('platform', ['alibaba', 'upwork']);

  // Supplier pipeline summary
  const { data: conversations } = await supabase
    .from('supplier_conversations')
    .select('negotiation_phase, current_quote_usd, updated_at');

  const supplierSummary = {
    total: conversations?.length ?? 0,
    discovery: 0,
    quoting: 0,
    with_quotes: 0,
    stale: 0,
  };

  const now = Date.now();
  for (const c of conversations ?? []) {
    if (c.negotiation_phase === 'discovery') supplierSummary.discovery++;
    else if (['quote_collection', 'production_terms', 'factory_visit'].includes(c.negotiation_phase)) supplierSummary.quoting++;
    if (c.current_quote_usd) supplierSummary.with_quotes++;
    const age = (now - new Date(c.updated_at).getTime()) / (1000 * 60 * 60);
    if (age > 72) supplierSummary.stale++;
  }

  // Stale contacts (no activity in 48h+)
  const { data: contacts } = await supabase
    .from('contact_activity')
    .select('contact_key, direction, platform, summary, created_at')
    .order('created_at', { ascending: false });

  const latestByContact: Record<string, { contact_key: string; last_activity: string; hours_ago: number; summary: string; platform: string }> = {};
  for (const c of contacts ?? []) {
    if (!latestByContact[c.contact_key]) {
      const hoursAgo = Math.round((now - new Date(c.created_at).getTime()) / (1000 * 60 * 60));
      latestByContact[c.contact_key] = {
        contact_key: c.contact_key,
        last_activity: c.created_at,
        hours_ago: hoursAgo,
        summary: c.summary,
        platform: c.platform,
      };
    }
  }
  const staleContacts = Object.values(latestByContact)
    .filter(c => c.hours_ago > 48)
    .sort((a, b) => b.hours_ago - a.hours_ago);

  // Yesterday's session summaries
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const { data: yesterdayMemory } = await supabase
    .from('openclaw_memory')
    .select('content')
    .eq('category', 'handoff')
    .gte('date', yesterday)
    .order('created_at', { ascending: false })
    .limit(3);

  // Launch countdown
  const launchDate = new Date('2026-03-29');
  const daysToLaunch = Math.ceil((launchDate.getTime() - now) / (1000 * 60 * 60 * 24));

  return NextResponse.json({
    brief: brief?.content ?? null,
    briefText: brief?.raw_text ?? null,
    live: {
      pendingInbox: pendingCount ?? 0,
      readyToSend: readyCount ?? 0,
      suppliers: supplierSummary,
      staleContacts,
      daysToLaunch: Math.max(0, daysToLaunch),
      yesterdaySummary: yesterdayMemory?.map(m => m.content) ?? [],
    },
  });
}
