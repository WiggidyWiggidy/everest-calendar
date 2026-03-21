// ============================================
// GET /api/cron/cowork-followup
// Vercel cron: runs every 6 hours.
// Checks each cowork contact for silence and
// sends a Claude-generated follow-up if the
// last inbound message was >24h ago with no
// outbound reply since.
// Auth: CRON_SECRET header (set in Vercel env).
// ============================================
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { sendViaGreenApi } from '@/lib/greenApi';

const SILENCE_THRESHOLD_HOURS = 24;

const FOLLOWUP_SYSTEM_PROMPT = `You are Tom, a project manager following up on a WhatsApp conversation that has gone quiet. Write a short, direct follow-up message (1-2 sentences) to prompt a response. Be friendly but businesslike. No emojis. Do not repeat what was already said — just ask for an update or check if they need anything.`;

export async function GET(request: NextRequest) {
  // ── Auth: check CRON_SECRET ─────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided = request.headers.get('x-cron-secret')
      ?? new URL(request.url).searchParams.get('secret');
    if (provided !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const autoSend = process.env.COWORK_AUTO_SEND === 'true';
  if (!autoSend) {
    // Cron is a no-op unless auto-send is enabled
    return NextResponse.json({ ok: true, skipped: 'COWORK_AUTO_SEND not enabled' });
  }

  const supabase = createServiceClient();
  const results: Array<{ contact_key: string; action: string }> = [];

  try {
    // Get all unique users with cowork messages (single-user app, but future-proof)
    const { data: users } = await supabase
      .from('cowork_messages')
      .select('user_id')
      .limit(1);

    if (!users?.length) {
      return NextResponse.json({ ok: true, results: [] });
    }

    const userId = users[0].user_id;

    // Get distinct contact_keys for this user
    const { data: contactRows } = await supabase
      .from('cowork_messages')
      .select('contact_key')
      .eq('user_id', userId);

    const contactKeys = Array.from(new Set((contactRows ?? []).map((r: { contact_key: string }) => r.contact_key)));

    for (const contactKey of contactKeys) {
      // Get last message in this thread
      const { data: lastMessages } = await supabase
        .from('cowork_messages')
        .select('direction, created_at, content')
        .eq('user_id', userId)
        .eq('contact_key', contactKey)
        .in('status', ['received', 'sent'])
        .order('created_at', { ascending: false })
        .limit(5);

      if (!lastMessages?.length) continue;

      const lastInbound = lastMessages.find((m: { direction: string }) => m.direction === 'inbound');
      const lastOutbound = lastMessages.find((m: { direction: string }) => m.direction === 'outbound');

      if (!lastInbound) {
        results.push({ contact_key: contactKey, action: 'skip_no_inbound' });
        continue;
      }

      const inboundAge = Date.now() - new Date(lastInbound.created_at).getTime();
      const inboundAgeHours = inboundAge / (1000 * 60 * 60);

      if (inboundAgeHours < SILENCE_THRESHOLD_HOURS) {
        results.push({ contact_key: contactKey, action: `skip_recent_${Math.round(inboundAgeHours)}h` });
        continue;
      }

      // If there's already an outbound after the last inbound, no follow-up needed
      if (lastOutbound && new Date(lastOutbound.created_at) > new Date(lastInbound.created_at)) {
        results.push({ contact_key: contactKey, action: 'skip_already_replied' });
        continue;
      }

      // ── Generate follow-up with Claude ─────────────────────────────────────
      let followUpText: string | null = null;
      try {
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type':      'application/json',
            'x-api-key':         process.env.ANTHROPIC_API_KEY!,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model:      'claude-sonnet-4-20250514',
            max_tokens: 128,
            system:     FOLLOWUP_SYSTEM_PROMPT,
            messages: [
              {
                role:    'user',
                content: `The last message I received was ${Math.round(inboundAgeHours)} hours ago: "${lastInbound.content}". Write a brief follow-up.`,
              },
            ],
          }),
        });
        if (claudeRes.ok) {
          const json = await claudeRes.json();
          followUpText = (json.content?.[0]?.text as string) ?? null;
        }
      } catch (err) {
        console.error(`/api/cron/cowork-followup Claude error for ${contactKey}:`, err);
      }

      if (!followUpText) {
        results.push({ contact_key: contactKey, action: 'error_claude_failed' });
        continue;
      }

      // ── Send via Green API ──────────────────────────────────────────────────
      const sendError = await sendViaGreenApi(followUpText);
      if (sendError) {
        console.error(`/api/cron/cowork-followup send error for ${contactKey}:`, sendError);
        results.push({ contact_key: contactKey, action: 'error_send_failed' });
        continue;
      }

      // ── Save the sent follow-up ─────────────────────────────────────────────
      await supabase.from('cowork_messages').insert({
        user_id:     userId,
        status:      'sent',
        direction:   'outbound',
        content:     followUpText,
        contact_key: contactKey,
        sent_at:     new Date().toISOString(),
      });

      results.push({ contact_key: contactKey, action: `sent_followup_after_${Math.round(inboundAgeHours)}h` });
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error('/api/cron/cowork-followup unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
