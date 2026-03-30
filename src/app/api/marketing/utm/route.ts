import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// UTM Link Builder -- generates properly tagged URLs for attribution tracking
// Every link to the site should go through this so we can attribute every sale
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { base_url, source, medium, campaign, content, term } = body;

    if (!base_url || !source || !medium || !campaign) {
      return NextResponse.json({
        error: 'Required: base_url, source, medium, campaign',
      }, { status: 400 });
    }

    // Build UTM URL
    const url = new URL(base_url);
    url.searchParams.set('utm_source', source);
    url.searchParams.set('utm_medium', medium);
    url.searchParams.set('utm_campaign', campaign);
    if (content) url.searchParams.set('utm_content', content);
    if (term) url.searchParams.set('utm_term', term);

    // Log the link creation for tracking
    await supabase.from('marketing_audit_log').insert({
      user_id: user.id,
      action: 'utm_link_created',
      resource_type: 'utm_link',
      details: {
        base_url,
        source,
        medium,
        campaign,
        content: content || null,
        term: term || null,
        full_url: url.toString(),
      },
    });

    return NextResponse.json({
      url: url.toString(),
      params: {
        utm_source: source,
        utm_medium: medium,
        utm_campaign: campaign,
        utm_content: content || null,
        utm_term: term || null,
      },
    });
  } catch (err) {
    console.error('utm builder error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET -- returns common UTM presets for quick link generation
export async function GET() {
  const presets = [
    {
      name: 'Meta Ad - Cold Traffic',
      source: 'facebook',
      medium: 'paid',
      campaign: 'prospecting',
      content: '', // fill with ad creative name
    },
    {
      name: 'Meta Ad - Retargeting',
      source: 'facebook',
      medium: 'paid',
      campaign: 'retargeting',
      content: '',
    },
    {
      name: 'Instagram Story',
      source: 'instagram',
      medium: 'paid',
      campaign: 'stories',
      content: '',
    },
    {
      name: 'Email - Klaviyo',
      source: 'klaviyo',
      medium: 'email',
      campaign: '', // fill with email name
      content: '',
    },
    {
      name: 'WhatsApp Lead Ad',
      source: 'facebook',
      medium: 'paid',
      campaign: 'lead_gen',
      content: 'whatsapp',
    },
    {
      name: 'Influencer',
      source: 'influencer',
      medium: 'referral',
      campaign: '', // fill with influencer name
      content: '',
    },
    {
      name: 'Google Ads',
      source: 'google',
      medium: 'cpc',
      campaign: '', // fill with campaign name
      term: '', // fill with keyword
    },
  ];

  return NextResponse.json({ presets });
}
