// /api/marketing/theme/deploy-asset
// PUTs a single asset (Liquid section or JSON template) to the live Shopify theme.
// Strictly additive: rejects any key not under sections/kryo-* or templates/product.kryo-*.
// Skill-mode auth via x-sync-secret.

import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';
import { createClient } from '@supabase/supabase-js';
import { auditLog } from '@/lib/marketing-safety';

const TOM_USER_ID = '174f2dff-7a96-464c-a919-b473c328d531';

function authSkill(request: NextRequest): boolean {
  const secret = request.headers.get('x-sync-secret');
  return Boolean(secret && secret === process.env.MARKETING_SYNC_SECRET);
}

function svcClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

interface DeployRequest {
  theme_id: number;
  key: string;
  value: string;
}

const ALLOWED_PREFIXES = ['sections/kryo-', 'sections/_kryo-', 'templates/product.kryo-'];

function isAllowedKey(key: string): boolean {
  return ALLOWED_PREFIXES.some((p) => key.startsWith(p));
}

export async function POST(request: NextRequest) {
  if (!authSkill(request)) {
    return NextResponse.json({ error: 'Unauthorized — x-sync-secret required' }, { status: 401 });
  }

  let body: DeployRequest;
  try {
    body = (await request.json()) as DeployRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.theme_id || typeof body.theme_id !== 'number') {
    return NextResponse.json({ error: 'theme_id (number) required' }, { status: 400 });
  }
  if (!body.key || typeof body.key !== 'string') {
    return NextResponse.json({ error: 'key (string) required' }, { status: 400 });
  }
  if (!isAllowedKey(body.key)) {
    return NextResponse.json({
      error: 'Refused: key must start with sections/kryo-, sections/_kryo-, or templates/product.kryo-',
      detail: `Got: "${body.key}". This route is strictly additive to protect existing theme files.`,
    }, { status: 422 });
  }
  if (typeof body.value !== 'string' || body.value.length === 0) {
    return NextResponse.json({ error: 'value (non-empty string) required' }, { status: 400 });
  }

  let shopifyUrl: string;
  let shopifyToken: string;
  try {
    shopifyUrl = getShopifyStoreUrl();
    shopifyToken = await getShopifyToken();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  // Read prior asset for rollback context
  let priorValue: string | null = null;
  const priorRes = await fetch(
    `https://${shopifyUrl}/admin/api/2025-04/themes/${body.theme_id}/assets.json?asset[key]=${encodeURIComponent(body.key)}`,
    { headers: { 'X-Shopify-Access-Token': shopifyToken } },
  );
  if (priorRes.ok) {
    const prior = await priorRes.json();
    priorValue = prior.asset?.value ?? null;
  }

  const putRes = await fetch(
    `https://${shopifyUrl}/admin/api/2025-04/themes/${body.theme_id}/assets.json`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': shopifyToken,
      },
      body: JSON.stringify({ asset: { key: body.key, value: body.value } }),
    },
  );

  const putText = await putRes.text();
  let putPayload: unknown = null;
  try { putPayload = JSON.parse(putText); } catch { /* not JSON */ }

  if (!putRes.ok) {
    return NextResponse.json({
      error: `Shopify PUT assets.json HTTP ${putRes.status}`,
      key: body.key,
      detail: putPayload ?? putText.slice(0, 800),
      hint: putRes.status === 403
        ? 'Likely missing write_themes scope. Add via Partner Dashboard → app → Configuration → Additional scopes.'
        : putRes.status === 422
        ? 'Liquid syntax error or invalid JSON. See response detail for line/column.'
        : undefined,
    }, { status: putRes.status });
  }

  // Audit log
  try {
    const sb = svcClient();
    await auditLog(
      sb,
      TOM_USER_ID,
      'theme_asset_deployed',
      'shopify_theme_asset',
      `${body.theme_id}/${body.key}`,
      { value_bytes: priorValue?.length ?? 0, was_present: priorValue !== null },
      { value_bytes: body.value.length },
      'scheduled_agent',
      { theme_id: body.theme_id, key: body.key, prior_existed: priorValue !== null },
    );
  } catch (e) {
    console.warn('audit log failed (non-fatal):', e);
  }

  return NextResponse.json({
    success: true,
    theme_id: body.theme_id,
    key: body.key,
    value_bytes: body.value.length,
    prior_existed: priorValue !== null,
    prior_bytes: priorValue?.length ?? null,
    shopify_response: putPayload,
  });
}
