import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

// Public endpoint for landing page forms and surveys
// No auth required -- this receives form submissions from Shopify/landing pages
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.responses || typeof body.responses !== 'object') {
      return NextResponse.json({ error: 'responses object required' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Extract UTM params from referrer or body
    const utmSource = body.utm_source || null;
    const utmCampaign = body.utm_campaign || null;

    const { error } = await supabase
      .from('customer_feedback')
      .insert({
        source: body.source || 'optin_form',
        responses: body.responses,
        customer_email: body.email || null,
        customer_phone: body.phone || null,
        meta_ad_id: body.meta_ad_id || null,
        utm_source: utmSource,
        utm_campaign: utmCampaign,
      });

    if (error) {
      console.error('survey insert error:', error.message);
      return NextResponse.json({ error: 'Failed to save response' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('survey error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// CORS preflight for cross-origin form submissions
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
