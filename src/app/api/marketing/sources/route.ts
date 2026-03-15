import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SOURCES = {
  shopify: {
    name: 'Shopify',
    vars: ['SHOPIFY_ACCESS_TOKEN', 'SHOPIFY_STORE_URL'],
  },
  meta: {
    name: 'Meta Ads',
    vars: ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID'],
  },
  google_analytics: {
    name: 'Google Analytics',
    vars: ['GA_PROPERTY_ID', 'GA_SERVICE_ACCOUNT_JSON'],
  },
  clarity: {
    name: 'Microsoft Clarity',
    vars: ['CLARITY_API_TOKEN', 'CLARITY_PROJECT_ID'],
  },
} as const;

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const status = Object.fromEntries(
      Object.entries(SOURCES).map(([key, { vars }]) => {
        const missing = vars.filter(v => !process.env[v]);
        return [key, { connected: missing.length === 0, missing }];
      })
    );

    return NextResponse.json({ sources: status });
  } catch (err) {
    console.error('marketing/sources GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
