import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

// Meta sends a verification challenge on setup
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// Meta sends lead form submissions here
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Verify this is a leadgen event
    const entries = body.entry ?? [];
    const supabase = createServiceClient();
    let processed = 0;

    for (const entry of entries) {
      const changes = entry.changes ?? [];
      for (const change of changes) {
        if (change.field !== 'leadgen') continue;

        const leadgenId = change.value?.leadgen_id;
        const formId = change.value?.form_id;
        const adId = change.value?.ad_id;
        const createdTime = change.value?.created_time;

        if (!leadgenId) continue;

        // Fetch full lead data from Meta
        const metaToken = process.env.META_ACCESS_TOKEN;
        if (!metaToken) {
          console.error('META_ACCESS_TOKEN not configured for lead retrieval');
          continue;
        }

        const leadRes = await fetch(
          `https://graph.facebook.com/v25.0/${leadgenId}?access_token=${metaToken}`
        );

        if (!leadRes.ok) {
          console.error('Failed to fetch lead data:', await leadRes.text());
          continue;
        }

        const leadData = await leadRes.json();
        const fieldData = leadData.field_data ?? [];

        // Parse form fields into structured responses
        const responses: Record<string, string> = {};
        let email: string | null = null;
        let phone: string | null = null;

        for (const field of fieldData) {
          const name = field.name?.toLowerCase() ?? '';
          const value = field.values?.[0] ?? '';
          responses[name] = value;

          if (name === 'email') email = value;
          if (name === 'phone_number' || name === 'phone') phone = value;
        }

        // Store in customer_feedback
        const { error } = await supabase
          .from('customer_feedback')
          .insert({
            source: 'whatsapp_lead_ad',
            responses: {
              ...responses,
              form_id: formId,
              leadgen_id: leadgenId,
              created_time: createdTime,
            },
            customer_email: email,
            customer_phone: phone,
            meta_ad_id: adId,
          });

        if (error) {
          console.error('Failed to store lead:', error.message);
        } else {
          processed++;
        }

        // Create inbox item for Tom
        await supabase
          .from('platform_inbox')
          .insert({
            platform: 'system',
            contact_name: 'Meta Lead Ad',
            message_preview: `New lead: ${email || phone || 'unknown'}`,
            draft_response: `New WhatsApp lead ad submission.\nEmail: ${email || 'not provided'}\nPhone: ${phone || 'not provided'}\nResponses: ${JSON.stringify(responses, null, 2)}`,
            status: 'pending',
            metadata: {
              type: 'lead_ad',
              ad_id: adId,
              form_id: formId,
            },
          });
      }
    }

    return NextResponse.json({ processed });
  } catch (err) {
    console.error('meta-leads webhook error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
