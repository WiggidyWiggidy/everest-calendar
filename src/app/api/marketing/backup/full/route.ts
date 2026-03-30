import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// POST: Full backup of all Shopify pages + local marketing data
// Called daily by scheduled task or manually
// Uses service role client when called via sync-secret (bypasses RLS)

export async function POST(request: NextRequest) {
  try {
    let supabase;
    let userId: string | undefined;

    const syncSecret = request.headers.get('x-sync-secret');
    const isSyncAuth = syncSecret === process.env.MARKETING_SYNC_SECRET;

    if (isSyncAuth) {
      // Use service role client to bypass RLS
      supabase = createServiceClient();
      // Single-tenant: get user_id from existing data (service role bypasses RLS)
      const { data: row } = await supabase
        .from('calendar_events')
        .select('user_id')
        .limit(1)
        .single();
      userId = row?.user_id;
    } else {
      supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      userId = user.id;
    }

    const results: Record<string, unknown> = { timestamp: new Date().toISOString() };
    const dateStr = new Date().toISOString().split('T')[0];

    // 1. Backup Shopify pages
    let shopifyPages: Record<string, unknown>[] = [];
    try {
      const shopifyUrl = getShopifyStoreUrl();
      const shopifyToken = await getShopifyToken();

      let hasMore = true;
      let sinceId = '0';
      while (hasMore) {
        const res = await fetch(
          `https://${shopifyUrl}/admin/api/2024-01/pages.json?limit=50&since_id=${sinceId}`,
          { headers: { 'X-Shopify-Access-Token': shopifyToken } }
        );

        if (!res.ok) {
          results.shopify_error = `API error: ${res.status}`;
          break;
        }

        const data = await res.json();
        const pages = data.pages ?? [];
        shopifyPages = [...shopifyPages, ...pages];

        if (pages.length < 50) {
          hasMore = false;
        } else {
          sinceId = String(pages[pages.length - 1].id);
        }
      }

      // Store each page as a snapshot
      if (userId && shopifyPages.length > 0) {
        const backupRows = shopifyPages.map((page: Record<string, unknown>) => ({
          user_id: userId,
          resource_type: 'shopify_page',
          resource_id: String(page.id),
          snapshot_data: page,
          snapshot_reason: `Full backup ${dateStr}`,
          triggered_by: 'scheduled_backup',
        }));

        await supabase.from('content_backups').insert(backupRows);
      }

      results.shopify_pages_backed_up = shopifyPages.length;
    } catch (e) {
      results.shopify_error = (e as Error).message;
    }

    // 2. Backup local marketing data
    let landingPages: Record<string, unknown>[] = [];
    let adCreatives: Record<string, unknown>[] = [];

    if (userId) {
      const { data: lp } = await supabase
        .from('landing_pages')
        .select('*')
        .eq('user_id', userId);
      landingPages = lp ?? [];

      const { data: ac } = await supabase
        .from('ad_creatives')
        .select('*')
        .eq('user_id', userId);
      adCreatives = ac ?? [];
    }

    results.landing_pages_backed_up = landingPages.length;
    results.ad_creatives_backed_up = adCreatives.length;

    // 3. Write local JSON files (belt + suspenders)
    try {
      const backupDir = join(process.cwd(), '..', 'backups');
      await mkdir(backupDir, { recursive: true });

      if (shopifyPages.length > 0) {
        await writeFile(
          join(backupDir, `shopify-pages-${dateStr}.json`),
          JSON.stringify(shopifyPages, null, 2)
        );
      }

      if (landingPages.length > 0) {
        await writeFile(
          join(backupDir, `landing-pages-${dateStr}.json`),
          JSON.stringify(landingPages, null, 2)
        );
      }

      if (adCreatives.length > 0) {
        await writeFile(
          join(backupDir, `ad-creatives-${dateStr}.json`),
          JSON.stringify(adCreatives, null, 2)
        );
      }

      results.local_files_written = true;
    } catch {
      // Local file write might fail on Vercel (read-only FS), that's OK
      results.local_files_written = false;
      results.local_files_note = 'Vercel has read-only filesystem. DB backups are the primary store.';
    }

    // 4. Audit log
    if (userId) {
      await supabase.from('marketing_audit_log').insert({
        user_id: userId,
        operation: 'backup_created',
        resource_type: 'full_backup',
        resource_id: dateStr,
        after_state: results,
        triggered_by: isSyncAuth ? 'scheduled_agent' : 'user',
      });
    }

    return NextResponse.json({ backed_up: true, ...results });
  } catch (err) {
    console.error('backup/full error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
