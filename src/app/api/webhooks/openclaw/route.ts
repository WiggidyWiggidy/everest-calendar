// ============================================
// POST /api/webhooks/openclaw
// Receives build status updates FROM OpenClaw skills as they run.
// Stages: queued → building → pr_raised → failed
// (approved/rejected are handled by the GitHub webhook)
// Secured via Bearer token in Authorization header.
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.OPENCLAW_WEBHOOK_SECRET;

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      task_id,
      build_status,
      branch_name,
      pr_url,
      pr_number,
      error_message,
    } = await request.json();

    if (!task_id || !build_status) {
      return NextResponse.json(
        { error: 'task_id and build_status required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const updatePayload: Record<string, unknown> = { build_status };
    if (branch_name)  updatePayload.branch_name = branch_name;
    if (pr_url)       updatePayload.pr_url = pr_url;
    if (pr_number)    updatePayload.pr_number = pr_number;

    // Side effects on task status
    if (build_status === 'building') updatePayload.status = 'in-progress';
    if (build_status === 'failed') {
      updatePayload.status = 'pending';
      if (error_message) updatePayload.build_context = error_message;
    }

    const { error } = await supabase
      .from('task_backlog')
      .update(updatePayload)
      .eq('id', task_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('openclaw webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
