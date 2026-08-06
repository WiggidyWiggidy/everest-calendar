export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

function envPresent(name: string) {
  return Boolean(process.env[name] && String(process.env[name]).trim().length > 0);
}

function envEnabled(name: string) {
  return process.env[name] === 'true';
}

async function authenticate(request: NextRequest) {
  const syncSecret = process.env.MARKETING_SYNC_SECRET;
  if (syncSecret && request.headers.get('x-sync-secret') === syncSecret) {
    return { authenticated: true, service: true };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return { authenticated: true, service: false };
  return { authenticated: false, service: false };
}

export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth.authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = auth.service ? createServiceClient() : await createClient();
  const { data, error } = await supabase
    .from('vw_kryo_source_health')
    .select('*')
    .order('source_name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const env = {
    meta: {
      enabled: envEnabled('MARKETING_SYNC_META_ENABLED'),
      has_META_ACCESS_TOKEN: envPresent('META_ACCESS_TOKEN'),
      has_META_AD_ACCOUNT_ID: envPresent('META_AD_ACCOUNT_ID'),
    },
    ga4: {
      enabled: envEnabled('MARKETING_SYNC_GA4_ENABLED'),
      has_GA_PROPERTY_ID: envPresent('GA_PROPERTY_ID'),
      has_GA_SERVICE_ACCOUNT_JSON: envPresent('GA_SERVICE_ACCOUNT_JSON'),
      has_GOOGLE_OAUTH_FALLBACK: envPresent('GOOGLE_OAUTH_CLIENT_ID') && envPresent('GOOGLE_OAUTH_CLIENT_SECRET') && envPresent('GOOGLE_OAUTH_REFRESH_TOKEN'),
    },
    gsc: {
      enabled: envEnabled('MARKETING_SYNC_GSC_ENABLED'),
      has_GSC_SITE_URL: envPresent('GSC_SITE_URL'),
      has_GOOGLE_OAUTH_REFRESH_TOKEN: envPresent('GOOGLE_OAUTH_REFRESH_TOKEN'),
    },
    clarity: {
      enabled: envEnabled('MARKETING_SYNC_CLARITY_ENABLED'),
    },
  };

  const rows = data ?? [];
  const decisionAllowed = rows.filter((row) => row.decision_allowed).map((row) => row.source_name);
  const blocked = rows.filter((row) => !row.decision_allowed).map((row) => ({
    source_name: row.source_name,
    trust_state: row.trust_state,
    stale_reason: row.stale_reason,
  }));

  return NextResponse.json({
    ok: true,
    generated_at: new Date().toISOString(),
    rule: 'Do not use a source for experiment decisions unless decision_allowed=true.',
    env,
    decision_allowed_sources: decisionAllowed,
    blocked_sources: blocked,
    sources: rows,
  });
}
