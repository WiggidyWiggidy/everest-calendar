import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';

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

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateSync(request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { createServiceClient } = await import('@/lib/supabase/service');
    const supabase = auth.userId ? await createClient() : createServiceClient();
    const userId = auth.userId || DEFAULT_USER_ID;

    // Accept optional date or days param
    let dateStr: string;
    let days = 1;
    try {
      const body = await request.json().catch(() => ({}));
      if (body.date) {
        dateStr = body.date;
      } else {
        if (body.days) days = Math.min(Math.max(parseInt(body.days), 1), 30);
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        dateStr = yesterday.toISOString().split('T')[0];
      }
    } catch {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      dateStr = yesterday.toISOString().split('T')[0];
    }

    const token = await getShopifyToken();
    const storeUrl = getShopifyStoreUrl();
    let totalSynced = 0;
    const errors: string[] = [];

    // Process each day
    for (let d = 0; d < days; d++) {
      const date = new Date(dateStr);
      date.setDate(date.getDate() - d);
      const day = date.toISOString().split('T')[0];
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayStr = nextDay.toISOString().split('T')[0];

      try {
        // Fetch abandoned checkouts for this day
        const checkoutsRes = await fetch(
          `https://${storeUrl}/admin/api/2024-01/checkouts.json?` +
          `created_at_min=${day}T00:00:00&created_at_max=${nextDayStr}T00:00:00&limit=250`,
          { headers: { 'X-Shopify-Access-Token': token } }
        );

        let abandonedCount = 0;
        let abandonedValue = 0;

        if (checkoutsRes.ok) {
          const checkoutsData = await checkoutsRes.json();
          const checkouts = checkoutsData.checkouts ?? [];
          // Shopify checkouts endpoint returns abandoned checkouts
          abandonedCount = checkouts.length;
          abandonedValue = checkouts.reduce((sum: number, c: { total_price?: string }) =>
            sum + parseFloat(c.total_price ?? '0'), 0);
        } else {
          // Endpoint may not be available -- log but continue
          const errText = await checkoutsRes.text();
          errors.push(`${day}: Shopify checkouts API ${checkoutsRes.status}: ${errText.slice(0, 100)}`);
        }

        // Get completed orders from marketing_metrics_daily
        const { data: metricsRow } = await supabase
          .from('marketing_metrics_daily')
          .select('shopify_orders')
          .eq('user_id', userId)
          .eq('date', day)
          .single();

        const completedOrders = metricsRow?.shopify_orders ?? 0;
        const checkoutsStarted = abandonedCount + completedOrders;
        const abandonmentRate = checkoutsStarted > 0 ? abandonedCount / checkoutsStarted : 0;

        const { error: upsertErr } = await supabase
          .from('shopify_funnel_daily')
          .upsert({
            user_id: userId,
            date: day,
            checkouts_started: checkoutsStarted,
            checkouts_completed: completedOrders,
            checkouts_abandoned: abandonedCount,
            abandonment_rate: abandonmentRate,
            abandoned_value: abandonedValue,
          }, { onConflict: 'user_id,date' });

        if (upsertErr) {
          errors.push(`${day}: ${upsertErr.message}`);
        } else {
          totalSynced++;
        }
      } catch (err) {
        errors.push(`${day}: ${String(err)}`);
      }
    }

    return NextResponse.json({
      synced: totalSynced,
      days_processed: days,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('sync/shopify-funnel error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
