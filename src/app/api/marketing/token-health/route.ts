import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';

// Check Meta access token expiry + validity
// Called by: scheduled task or manually via GET
// Returns: { valid, expires_at, days_remaining, data_access_expires_at, scopes, warning }

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-sync-secret');
  const supabase = createServiceClient();

  if (secret !== process.env.MARKETING_SYNC_SECRET) {
    const sessionSupabase = await createClient();
    const { data: { user } } = await sessionSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const metaToken = process.env.META_ACCESS_TOKEN;
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!metaToken) {
    return NextResponse.json({
      valid: false,
      error: 'META_ACCESS_TOKEN not configured',
      action_required: 'Add META_ACCESS_TOKEN to Vercel environment variables',
    });
  }

  if (!appId || !appSecret) {
    // Can still inspect the token, just without app token
    return inspectTokenSelf(metaToken);
  }

  // Use app access token to inspect user token — more reliable
  const appToken = `${appId}|${appSecret}`;
  const inspectUrl = new URL('https://graph.facebook.com/debug_token');
  inspectUrl.searchParams.set('input_token', metaToken);
  inspectUrl.searchParams.set('access_token', appToken);

  const res = await fetch(inspectUrl.toString());
  if (!res.ok) {
    return inspectTokenSelf(metaToken);
  }

  const body = await res.json();
  const data = body.data ?? {};

  const expiresAt = data.expires_at ? new Date(data.expires_at * 1000) : null;
  const dataAccessExpiresAt = data.data_access_expiration_time
    ? new Date(data.data_access_expiration_time * 1000)
    : null;
  const now = Date.now();

  const daysRemaining = expiresAt
    ? Math.ceil((expiresAt.getTime() - now) / 86400000)
    : null;

  const dataAccessDaysRemaining = dataAccessExpiresAt
    ? Math.ceil((dataAccessExpiresAt.getTime() - now) / 86400000)
    : null;

  // Determine warning level
  let warning: string | null = null;
  let severity: 'ok' | 'warning' | 'critical' = 'ok';

  if (!data.is_valid) {
    severity = 'critical';
    warning = 'Token is INVALID. Ads syncs will fail. Generate a new long-lived token immediately.';
  } else if (daysRemaining !== null && daysRemaining <= 0) {
    severity = 'critical';
    warning = 'Token has EXPIRED. Generate a new long-lived token immediately.';
  } else if (daysRemaining !== null && daysRemaining <= 7) {
    severity = 'critical';
    warning = `Token expires in ${daysRemaining} days. Renew NOW.`;
  } else if (daysRemaining !== null && daysRemaining <= 14) {
    severity = 'warning';
    warning = `Token expires in ${daysRemaining} days. Renew within the next week.`;
  } else if (dataAccessDaysRemaining !== null && dataAccessDaysRemaining <= 7) {
    severity = 'warning';
    warning = `Data access window expires in ${dataAccessDaysRemaining} days. Ad insights will stop syncing.`;
  }

  // If critical, create an inbox alert (once per day)
  if (severity === 'critical' && warning) {
    const today = new Date().toISOString().split('T')[0];
    const { data: existing } = await supabase
      .from('platform_inbox')
      .select('id')
      .eq('platform', 'system')
      .eq('contact_name', 'Token Monitor')
      .gte('created_at', `${today}T00:00:00Z`)
      .limit(1);

    if (!existing || existing.length === 0) {
      await supabase.from('platform_inbox').insert({
        platform: 'system',
        contact_name: 'Token Monitor',
        message_preview: `CRITICAL: Meta token ${daysRemaining !== null && daysRemaining <= 0 ? 'expired' : `expires in ${daysRemaining}d`}`,
        draft_response: `${warning}\n\nTo renew:\n1. Go to developers.facebook.com/tools/explorer\n2. Generate new user token with ads_read, ads_management scopes\n3. Exchange for long-lived token: GET https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=***&fb_exchange_token=SHORT_LIVED_TOKEN\n4. Update META_ACCESS_TOKEN in Vercel environment variables\n5. Redeploy`,
        status: 'pending',
        metadata: { alert_type: 'token_expiry', severity: 'critical', days_remaining: daysRemaining },
      });
    }
  }

  return NextResponse.json({
    valid: data.is_valid ?? false,
    app_id: data.app_id,
    user_id: data.user_id,
    scopes: data.scopes ?? [],
    expires_at: expiresAt?.toISOString() ?? null,
    days_remaining: daysRemaining,
    data_access_expires_at: dataAccessExpiresAt?.toISOString() ?? null,
    data_access_days_remaining: dataAccessDaysRemaining,
    severity,
    warning,
  });
}

// Fallback: inspect token against itself (works without app secret)
async function inspectTokenSelf(token: string): Promise<NextResponse> {
  const res = await fetch(
    `https://graph.facebook.com/me?fields=id,name&access_token=${encodeURIComponent(token)}`
  );
  if (!res.ok) {
    return NextResponse.json({
      valid: false,
      severity: 'critical',
      warning: 'Token rejected by Meta API. May be expired or invalid.',
    });
  }
  return NextResponse.json({
    valid: true,
    severity: 'ok',
    warning: null,
    note: 'Basic validation only -- add META_APP_ID and META_APP_SECRET for full expiry details',
  });
}
