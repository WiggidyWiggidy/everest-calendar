// ============================================
// /api/candidates
// POST — Claude in Chrome ingestion (X-API-Key auth)
// GET  — UI retrieval (session auth)
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

// ── POST: Ingest a candidate from Claude in Chrome ──────────────────────────
export async function POST(request: NextRequest) {
  try {
    // Authenticate via shared API key (Claude in Chrome has no session)
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey || apiKey !== process.env.CANDIDATE_INGEST_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = process.env.CANDIDATE_USER_ID;
    if (!userId) {
      return NextResponse.json(
        { error: 'CANDIDATE_USER_ID is not configured' },
        { status: 500 }
      );
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

    // Use service client to bypass RLS (no user session from Claude in Chrome)
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('upwork_candidates')
      .insert({
        user_id: userId,
        name: name.trim(),
        upwork_profile_url: upwork_profile_url ?? null,
        hourly_rate: hourly_rate ?? null,
        job_success_score: job_success_score ?? null,
        location: location ?? null,
        score: score ?? null,
        tier,
        proposal_snippet: proposal_snippet ?? null,
        strengths: strengths ?? null,
        weaknesses: weaknesses ?? null,
        manufacturing_experience: manufacturing_experience ?? null,
        cad_software: cad_software ?? null,
        enclosures_count: enclosures_count ?? null,
        evaluator_notes: evaluator_notes ?? null,
      })
      .select('id, created_at')
      .single();

    if (error) {
      console.error('/api/candidates POST error:', error);
      return NextResponse.json({ error: 'Failed to save candidate' }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id, created_at: data.created_at });
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
