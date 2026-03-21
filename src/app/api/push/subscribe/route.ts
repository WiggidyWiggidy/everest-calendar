// ============================================
// POST /api/push/subscribe   — save a push subscription
// DELETE /api/push/subscribe — remove a push subscription
// (session auth)
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { endpoint, keys } = body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription object' }, { status: 400 });
    }

    const userAgent = request.headers.get('user-agent') ?? null;

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id:    user.id,
          endpoint,
          p256dh:     keys.p256dh,
          auth:       keys.auth,
          user_agent: userAgent,
        },
        { onConflict: 'endpoint' }
      );

    if (error) {
      console.error('/api/push/subscribe POST error:', error);
      return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('/api/push/subscribe POST unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { endpoint } = body;
    if (!endpoint) return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });

    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('/api/push/subscribe DELETE unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
