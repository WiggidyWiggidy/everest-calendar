import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const DEFAULT_USER_ID = '174f2dff-7a96-464c-a919-b473c328d531';

async function authenticateSync(request: NextRequest) {
  const syncSecret = request.headers.get('x-sync-secret');
  if (syncSecret && syncSecret === process.env.MARKETING_SYNC_SECRET) {
    return { authenticated: true, userId: null };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return { authenticated: true, userId: user.id };
  return { authenticated: false, userId: null };
}

// Resolve asset hash to readable label using asset_feed_spec
function resolveAssetLabel(
  spec: Record<string, unknown> | null,
  elementType: string,
  value: string
): string | null {
  if (!spec) return null;

  // Map breakdown types to asset_feed_spec keys
  const specKeyMap: Record<string, string> = {
    title_asset: 'titles',
    body_asset: 'bodies',
    image_asset: 'images',
    call_to_action_type: 'call_to_action_types',
  };

  const specKey = specKeyMap[elementType];
  if (!specKey || !spec[specKey]) return null;

  const items = spec[specKey] as Array<{ text?: string; url?: string; hash?: string; type?: string }>;
  if (!Array.isArray(items)) return null;

  // Try matching by hash or value
  for (const item of items) {
    if (item.hash === value) return item.text ?? item.url ?? null;
    if (item.text === value) return item.text;
    if (item.type === value) return item.type;
  }

  return null;
}

// Map Meta breakdown types to our element_type values
function normalizeElementType(breakdownType: string): string {
  const map: Record<string, string> = {
    title_asset: 'headline',
    body_asset: 'body',
    image_asset: 'image',
    call_to_action_type: 'call_to_action',
  };
  return map[breakdownType] ?? breakdownType;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateSync(request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const metaToken = process.env.META_ACCESS_TOKEN;
    if (!metaToken) {
      return NextResponse.json({ error: 'META_ACCESS_TOKEN not configured' }, { status: 400 });
    }

    const { createServiceClient } = await import('@/lib/supabase/service');
    const supabase = auth.userId ? await createClient() : createServiceClient();

    let days = 7;
    try {
      const body = await request.json().catch(() => ({}));
      if (body.days) days = Math.min(Math.max(parseInt(body.days), 1), 30);
    } catch { /* use default */ }

    // Get dynamic creative ads
    const { data: dceAds, error: dceErr } = await supabase
      .from('meta_ads')
      .select('meta_ad_id, asset_feed_spec')
      .eq('is_dynamic_creative', true);

    if (dceErr) {
      return NextResponse.json({ error: dceErr.message }, { status: 500 });
    }

    if (!dceAds || dceAds.length === 0) {
      return NextResponse.json({ synced: 0, message: 'No dynamic creative ads found.' });
    }

    const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    const until = new Date().toISOString().split('T')[0];
    const breakdowns = ['title_asset', 'body_asset', 'image_asset', 'call_to_action_type'];

    let totalSynced = 0;
    const errors: string[] = [];

    // Process max 25 ads per run to avoid rate limits
    const adsToProcess = dceAds.slice(0, 25);

    for (const ad of adsToProcess) {
      for (const breakdown of breakdowns) {
        try {
          // Rate limit: 200ms between requests
          await new Promise(resolve => setTimeout(resolve, 200));

          const url = `https://graph.facebook.com/v25.0/${ad.meta_ad_id}/insights?` +
            `fields=impressions,clicks,spend,ctr,actions,action_values` +
            `&breakdowns=${breakdown}` +
            `&time_increment=1` +
            `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
            `&limit=100` +
            `&access_token=${metaToken}`;

          const res = await fetch(url);
          if (!res.ok) {
            const errText = await res.text();
            // Some breakdown types may not be available for all ads
            if (res.status === 400) continue;
            errors.push(`${ad.meta_ad_id}/${breakdown}: ${errText}`);
            continue;
          }

          const json = await res.json();
          const rows = json.data ?? [];

          for (const row of rows) {
            const elementValue = row[breakdown] ?? 'unknown';
            const elementLabel = resolveAssetLabel(
              ad.asset_feed_spec as Record<string, unknown> | null,
              breakdown,
              elementValue
            );

            const actions = (row.actions ?? []) as { action_type: string; value: string }[];
            const actionValues = (row.action_values ?? []) as { action_type: string; value: string }[];
            const purchases = actions.find(a => a.action_type === 'purchase')?.value;
            const revenue = actionValues.find(a => a.action_type === 'purchase')?.value;

            const record = {
              meta_ad_id: ad.meta_ad_id,
              date: row.date_start,
              element_type: normalizeElementType(breakdown),
              element_value: elementValue,
              element_label: elementLabel,
              impressions: parseInt(row.impressions ?? '0', 10),
              clicks: parseInt(row.clicks ?? '0', 10),
              spend: parseFloat(row.spend ?? '0'),
              ctr: row.ctr ? parseFloat(row.ctr) / 100 : null,
              purchases: purchases ? parseInt(purchases, 10) : 0,
              revenue: revenue ? parseFloat(revenue) : 0,
            };

            const { error: upsertErr } = await supabase
              .from('meta_dce_metrics')
              .upsert(record, { onConflict: 'meta_ad_id,date,element_type,element_value' });

            if (upsertErr) {
              errors.push(`${ad.meta_ad_id}/${breakdown}/${row.date_start}: ${upsertErr.message}`);
            } else {
              totalSynced++;
            }
          }
        } catch (err) {
          errors.push(`${ad.meta_ad_id}/${breakdown}: ${String(err)}`);
        }
      }
    }

    return NextResponse.json({
      synced: totalSynced,
      dce_ads_processed: adsToProcess.length,
      dce_ads_total: dceAds.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('sync/meta-dce error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
