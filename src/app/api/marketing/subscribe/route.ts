import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

// Public email capture endpoint -- no auth required
// Called from Shopify pages, landing pages, blog posts

export async function POST(request: NextRequest) {
  try {
    const { email, source_page, source_ad, utm_source, utm_medium, utm_campaign, utm_content } = await request.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    // Use service client since this is a public endpoint
    const supabase = createServiceClient();

    const { error } = await supabase
      .from('email_subscribers')
      .upsert({
        email: email.toLowerCase().trim(),
        source_page,
        source_ad,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content,
        subscribed_at: new Date().toISOString(),
      }, { onConflict: 'email' });

    if (error) {
      console.error('Subscribe error:', error);
      return NextResponse.json({ error: 'Subscription failed' }, { status: 500 });
    }

    // CORS headers for cross-origin calls from Shopify
    return NextResponse.json(
      { subscribed: true },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  } catch (err) {
    console.error('subscribe error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// GET: subscriber count (for waitlist counter)
export async function GET() {
  try {
    const supabase = createServiceClient();
    const { count } = await supabase
      .from('email_subscribers')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    return NextResponse.json(
      { count: count ?? 0 },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=60',
        },
      }
    );
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
