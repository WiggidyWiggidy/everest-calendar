// ============================================
// POST /api/webhooks/github
// Receives GitHub pull_request events.
// - PR merged into main → marks task done + build_status = 'approved'
// - PR closed without merge → marks build_status = 'rejected'
// Verified via HMAC-SHA256 signature if GITHUB_WEBHOOK_SECRET is set.
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

function verifyGitHubSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(digest),
    Buffer.from(signature)
  );
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256') || '';
    const secret = process.env.GITHUB_WEBHOOK_SECRET || '';

    if (secret && !verifyGitHubSignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = request.headers.get('x-github-event');
    const payload = JSON.parse(rawBody);

    const supabase = await createClient();

    // PR merged into main → task done
    if (
      event === 'pull_request' &&
      payload.action === 'closed' &&
      payload.pull_request?.merged === true &&
      payload.pull_request?.base?.ref === 'main'
    ) {
      const prNumber = payload.pull_request.number as number;
      const branchName = payload.pull_request.head.ref as string;

      await supabase
        .from('task_backlog')
        .update({ status: 'done', build_status: 'approved' })
        .or(`pr_number.eq.${prNumber},branch_name.eq.${branchName}`);
    }

    // PR closed without merge → rejected
    if (
      event === 'pull_request' &&
      payload.action === 'closed' &&
      payload.pull_request?.merged === false
    ) {
      const prNumber = payload.pull_request.number as number;

      await supabase
        .from('task_backlog')
        .update({ build_status: 'rejected' })
        .eq('pr_number', prNumber);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('github webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'webhook endpoint active' });
}
