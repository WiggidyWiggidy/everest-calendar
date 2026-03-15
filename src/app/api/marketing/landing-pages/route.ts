import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: pages, error } = await supabase
      .from('landing_pages')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    // Fetch latest proposal status per page
    const pageIds = (pages ?? []).map((p: { id: string }) => p.id);
    let latestProposals: Array<{ landing_page_id: string; status: string; id: string }> = [];
    if (pageIds.length > 0) {
      const { data: proposals } = await supabase
        .from('page_proposals')
        .select('id, landing_page_id, status, created_at')
        .in('landing_page_id', pageIds)
        .order('created_at', { ascending: false });
      // Keep only the latest per landing_page_id
      const seen = new Set<string>();
      latestProposals = (proposals ?? []).filter((p: { landing_page_id: string }) => {
        if (seen.has(p.landing_page_id)) return false;
        seen.add(p.landing_page_id);
        return true;
      });
    }

    const proposalMap = Object.fromEntries(
      latestProposals.map((p) => [p.landing_page_id, { id: p.id, status: p.status }])
    );

    const enriched = (pages ?? []).map((page: { id: string }) => ({
      ...page,
      latest_proposal: proposalMap[page.id] ?? null,
    }));

    return NextResponse.json({ pages: enriched });
  } catch (err) {
    console.error('landing-pages GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch landing pages' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { name, shopify_url, notes } = body;

    if (!name || !shopify_url) {
      return NextResponse.json({ error: 'name and shopify_url are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('landing_pages')
      .insert({ name, shopify_url, notes: notes ?? null, user_id: user.id })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ page: data });
  } catch (err) {
    console.error('landing-pages POST error:', err);
    return NextResponse.json({ error: 'Failed to create landing page' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const allowed = ['name', 'shopify_url', 'status', 'notes', 'shopify_page_id'];
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([k]) => allowed.includes(k))
    );

    const { error } = await supabase
      .from('landing_pages')
      .update({ ...filtered, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('landing-pages PATCH error:', err);
    return NextResponse.json({ error: 'Failed to update landing page' }, { status: 500 });
  }
}
