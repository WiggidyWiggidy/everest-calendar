import { NextRequest, NextResponse } from 'next/server';

const META_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID?.startsWith('act_')
  ? process.env.META_AD_ACCOUNT_ID
  : process.env.META_AD_ACCOUNT_ID
    ? `act_${process.env.META_AD_ACCOUNT_ID}`
    : null;

function sanitise(text: string, secret: string) {
  return text.split(secret).join('[REDACTED]').slice(0, 500);
}

export async function POST(request: NextRequest) {
  const syncSecret = request.headers.get('x-sync-secret');
  if (!syncSecret || syncSecret !== process.env.MARKETING_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const relatedEnvNames = Object.keys(process.env)
    .filter((name) => /(META|FACEBOOK|^FB_|ADS)/i.test(name))
    .sort();

  const tokenNames = relatedEnvNames.filter((name) =>
    /TOKEN/i.test(name) && !/VERIFY|WEBHOOK|CRON|SYNC|PIPEBOARD/i.test(name)
  );

  const checks: Array<Record<string, unknown>> = [];

  for (const name of tokenNames) {
    const token = process.env[name];
    if (!token || token.length < 20) {
      checks.push({ name, configured: Boolean(token), plausible_token: false });
      continue;
    }

    let basicOk = false;
    let adsReadOk = false;
    let basicError: string | null = null;
    let adsError: string | null = null;

    try {
      const basic = await fetch(
        `https://graph.facebook.com/v25.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`,
        { cache: 'no-store' }
      );
      basicOk = basic.ok;
      if (!basic.ok) basicError = sanitise(await basic.text(), token);
    } catch (error) {
      basicError = sanitise(String(error), token);
    }

    if (META_ACCOUNT_ID) {
      try {
        const url = new URL(`https://graph.facebook.com/v25.0/${META_ACCOUNT_ID}/insights`);
        url.searchParams.set('fields', 'spend,impressions,clicks');
        url.searchParams.set('date_preset', 'last_7d');
        url.searchParams.set('limit', '1');
        url.searchParams.set('access_token', token);
        const ads = await fetch(url.toString(), { cache: 'no-store' });
        adsReadOk = ads.ok;
        if (!ads.ok) adsError = sanitise(await ads.text(), token);
      } catch (error) {
        adsError = sanitise(String(error), token);
      }
    }

    checks.push({
      name,
      configured: true,
      plausible_token: true,
      basic_ok: basicOk,
      ads_read_ok: adsReadOk,
      basic_error: basicError,
      ads_error: adsError,
    });
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  let appCredentialsOk = false;
  let appCredentialError: string | null = null;

  if (appId && appSecret) {
    const appToken = `${appId}|${appSecret}`;
    try {
      const url = new URL('https://graph.facebook.com/v25.0/app');
      url.searchParams.set('fields', 'id,name');
      url.searchParams.set('access_token', appToken);
      const res = await fetch(url.toString(), { cache: 'no-store' });
      appCredentialsOk = res.ok;
      if (!res.ok) appCredentialError = sanitise(await res.text(), appToken);
    } catch (error) {
      appCredentialError = sanitise(String(error), appToken);
    }
  }

  return NextResponse.json({
    related_env_names: relatedEnvNames,
    account_id_configured: Boolean(META_ACCOUNT_ID),
    app_credentials_configured: Boolean(appId && appSecret),
    app_credentials_ok: appCredentialsOk,
    app_credentials_error: appCredentialError,
    token_checks: checks,
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
