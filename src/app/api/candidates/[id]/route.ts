// ============================================
// /api/candidates/[id]
// PATCH — Update tier, status, or notes (session auth)
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logAgentActivity } from '@/lib/logAgentActivity';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { tier, status, evaluator_notes } = body;

    // Validate enum values
    if (tier && !['top', 'maybe', 'reject'].includes(tier)) {
      return NextResponse.json({ error: 'Invalid tier value' }, { status: 400 });
    }
    if (status && !['new', 'messaged', 'trialled', 'hired', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (tier !== undefined) updates.tier = tier;
    if (status !== undefined) updates.status = status;
    if (evaluator_notes !== undefined) updates.evaluator_notes = evaluator_notes;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('upwork_candidates')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)  // RLS double-check
      .select()
      .single();

    if (error) {
      console.error('/api/candidates/[id] PATCH error:', error);
      return NextResponse.json({ error: 'Failed to update candidate' }, { status: 500 });
    }

    const changedFields = Object.keys(updates).join(', ');
    await logAgentActivity({
      agentName:    'tom',
      agentSource:  'cowork',
      activityType: 'decision',
      description:  `Candidate ${data?.name ?? id} updated: ${changedFields}`,
      domain:       'hiring',
      metadata:     { candidate_id: id, updates },
    });

    return NextResponse.json({ success: true, candidate: data });
  } catch (err) {
    console.error('/api/candidates/[id] PATCH unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
