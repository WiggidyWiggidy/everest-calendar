import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';
import { auditLog } from '@/lib/marketing-safety';

const TOM_USER_ID = '174f2dff-7a96-464c-a919-b473c328d531';

function svcClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(request: NextRequest) {
  if (request.headers.get('x-sync-secret') !== process.env.MARKETING_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized — x-sync-secret required' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as { theme_id?: number };
  if (!body.theme_id || typeof body.theme_id !== 'number') {
    return NextResponse.json({ error: 'theme_id (number) required' }, { status: 400 });
  }
  const storeUrl = getShopifyStoreUrl();
  const token = await getShopifyToken();
  const themesRes = await fetch(`https://${storeUrl}/admin/api/2025-04/themes.json`, {
    headers: { 'X-Shopify-Access-Token': token },
  });
  if (!themesRes.ok) return NextResponse.json({ error: `Shopify themes GET HTTP ${themesRes.status}` }, { status: 502 });
  const themesPayload = await themesRes.json();
  const main = themesPayload.themes?.find((theme: { role: string }) => theme.role === 'main');
  if (!main || main.id !== body.theme_id) {
    return NextResponse.json({
      error: 'Refused: requested theme is not the currently published main theme',
      requested_theme_id: body.theme_id,
      current_main_theme_id: main?.id ?? null,
    }, { status: 422 });
  }
  const refreshRes = await fetch(`https://${storeUrl}/admin/api/2025-04/themes/${body.theme_id}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ theme: { id: body.theme_id, role: 'main' } }),
  });
  const text = await refreshRes.text();
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { payload = text; }
  if (!refreshRes.ok) return NextResponse.json({ error: `Shopify theme refresh HTTP ${refreshRes.status}`, detail: payload }, { status: 502 });
  await auditLog(
    svcClient(), TOM_USER_ID, 'live_theme_cache_refreshed', 'shopify_theme', String(body.theme_id),
    { role: main.role }, { role: 'main' }, 'scheduled_agent',
    { guard: 'verified_existing_main_theme_only', content_changed: false },
  );
  return NextResponse.json({
    success: true,
    theme_id: body.theme_id,
    mutation_scope: 'republished_existing_main_theme_only',
    content_changed: false,
    shopify_response: payload,
  });
}
