// ============================================
// POST /api/candidates/[id]/transition
// Sends intro WhatsApp message, logs to cowork_messages,
// and marks candidate as hired.
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendViaGreenApi } from '@/lib/greenApi';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { phone, intro_message } = body as { phone?: string; intro_message?: string };

  if (!phone?.trim() || !intro_message?.trim()) {
    return NextResponse.json({ error: 'phone and intro_message are required' }, { status: 400 });
  }

  // Digits only validation
  if (!/^\d+$/.test(phone.trim())) {
    return NextResponse.json({ error: 'phone must contain digits only' }, { status: 400 });
  }

  // Fetch candidate to verify ownership
  const { data: candidate, error: fetchErr } = await supabase
    .from('upwork_candidates')
    .select('id, name')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchErr || !candidate) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
  }

  // Send WhatsApp message
  const sendErr = await sendViaGreenApi(intro_message.trim(), phone.trim());
  if (sendErr) {
    console.error('/api/candidates/[id]/transition send error:', sendErr);
    return NextResponse.json({ error: `WhatsApp send failed: ${sendErr}` }, { status: 502 });
  }

  const now = new Date().toISOString();

  // Log to cowork_messages
  await supabase.from('cowork_messages').insert({
    user_id:     user.id,
    status:      'sent',
    direction:   'outbound',
    sender_name: null,
    content:     intro_message.trim(),
    sent_at:     now,
  });

  // Mark candidate as hired
  await supabase
    .from('upwork_candidates')
    .update({ status: 'hired' })
    .eq('id', id);

  return NextResponse.json({ success: true });
}
