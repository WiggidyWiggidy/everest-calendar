import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import crypto from 'crypto';

function valid(rawBody: string, header: string | null) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret || !header) return false;
  const computed = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  try { return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(header)); } catch { return false; }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!valid(rawBody, request.headers.get('x-shopify-hmac-sha256'))) {
    return NextResponse.json({ error: 'Invalid HMAC' }, { status: 401 });
  }
  try {
    const refund = JSON.parse(rawBody) as { order_id?: string | number; refund_line_items?: Array<{ subtotal?: number | string }>; transactions?: Array<{ amount?: string | number; kind?: string }> };
    if (!refund.order_id) return NextResponse.json({ error: 'order_id required' }, { status: 400 });
    const amount = (refund.transactions ?? []).filter(t => t.kind === 'refund').reduce((total, t) => total + Number(t.amount ?? 0), 0) ||
      (refund.refund_line_items ?? []).reduce((total, item) => total + Number(item.subtotal ?? 0), 0);
    const sb = createServiceClient();
    const { data: order } = await sb.from('shopify_order_attribution').select('refunds').eq('shopify_order_id', String(refund.order_id)).maybeSingle();
    const { error } = await sb.from('shopify_order_attribution').update({ refunds: Number(order?.refunds ?? 0) + amount, updated_at: new Date().toISOString() }).eq('shopify_order_id', String(refund.order_id));
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, order_id: String(refund.order_id), refund_amount: amount });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
