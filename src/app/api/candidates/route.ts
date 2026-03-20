// ============================================
// /api/candidates
// POST — Claude in Chrome ingestion (X-API-Key auth)
//   Uses ingest_upwork_candidate RPC (SECURITY DEFINER)
//   so no service role key is needed.
// GET  — UI retrieval (session auth)
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAnonClient } from '@supabase/supabase-js';

// ── POST: Ingest a candidate from Claude in Chrome ──────────────────────────
export async function POST(request: NextRequest) {
  try {
    // Authenticate via shared API key (Claude in Chrome has no session)
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey || apiKey !== process.env.CANDIDATE_INGEST_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      upwork_profile_url,
      hourly_rate,
      job_success_score,
      location,
      score,
      tier = 'maybe',
      proposal_snippet,
      strengths,
      weaknesses,
      manufacturing_experience,
      cad_software,
      enclosures_count,
      evaluator_notes,
    } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const validTiers = ['top', 'maybe', 'reject'];
    if (!validTiers.includes(tier)) {
      return NextResponse.json(
        { error: `tier must be one of: ${validTiers.join(', ')}` },
        { status: 400 }
      );
    }

    // Use anon client + SECURITY DEFINER RPC (no service role key needed)
    const supabase = createAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase.rpc('ingest_upwork_candidate', {
      p_name:                     name.trim(),
      p_upwork_profile_url:       upwork_profile_url ?? null,
      p_hourly_rate:              hourly_rate ?? null,
      p_job_success_score:        job_success_score ?? null,
      p_location:                 location ?? null,
      p_score:                    score ?? null,
      p_tier:                     tier,
      p_proposal_snippet:         proposal_snippet ?? null,
      p_strengths:                strengths ?? null,
      p_weaknesses:               weaknesses ?? null,
      p_manufacturing_experience: manufacturing_experience ?? null,
      p_cad_software:             cad_software ?? null,
      p_enclosures_count:         enclosures_count ?? null,
      p_evaluator_notes:          evaluator_notes ?? null,
    });

    if (error) {
      console.error('/api/candidates POST rpc error:', error);
      return NextResponse.json({ error: 'Failed to save candidate' }, { status: 500 });
    }

    const result = data as { id: string; created_at: string };
    return NextResponse.json({ success: true, id: result.id, created_at: result.created_at });
  } catch (err) {
    console.error('/api/candidates POST unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── GET: Retrieve candidates for the UI ────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tier = searchParams.get('tier');
    const status = searchParams.get('status');
    const maxRate = searchParams.get('max_rate');

    let query = supabase
      .from('upwork_candidates')
      .select('*')
      .eq('user_id', user.id)
      .order('score', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (tier) query = query.eq('tier', tier);
    if (status) query = query.eq('status', status);
    if (maxRate) query = query.lte('hourly_rate', parseFloat(maxRate));

    const { data, error } = await query;

    if (error) {
      console.error('/api/candidates GET error:', error);
      return NextResponse.json({ error: 'Failed to fetch candidates' }, { status: 500 });
    }

    return NextResponse.json({ candidates: data });
  } catch (err) {
    console.error('/api/candidates GET unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
