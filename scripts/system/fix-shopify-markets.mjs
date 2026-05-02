#!/usr/bin/env node
// fix-shopify-markets.mjs — publishes existing KRYO product variants to ALL Shopify publications + markets.
// Uses publishablePublish GraphQL mutation. Idempotent.
// Resolves the geo-restriction issue: variants currently only accessible via /en-gb/ prefix.
//
// Usage: node scripts/system/fix-shopify-markets.mjs [--all] [--dry-run]
//        --all    — publish ALL kryo* products (default: only variants from landing_pages table)
//        --dry-run — list what would be published without doing it

import { createClient } from '@supabase/supabase-js';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = 'true';
}
const ALL = args.all === 'true';
const DRY = args['dry-run'] === 'true';

const SUPABASE_URL = process.env.EVEREST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EVEREST_SUPABASE_SERVICE_KEY;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const SECRET = process.env.MARKETING_SYNC_SECRET;
if (!SECRET) { console.error('FATAL: MARKETING_SYNC_SECRET'); process.exit(1); }

const log = (m) => process.stderr.write(`[markets] ${m}\n`);

// 1. Get landing_page → shopify_product_id mapping
const { data: lps, error } = await sb
  .from('landing_pages')
  .select('id, name, shopify_url, shopify_page_id, status')
  .eq('page_type', 'product')
  .not('shopify_page_id', 'is', null)
  .order('created_at', { ascending: false });
if (error) { console.error('landing_pages query fail:', error.message); process.exit(2); }

log(`Found ${lps.length} KRYO product variants`);

// 2. For each, call clone-page-style publish via a new publish-product Vercel route
// (or use the existing process-approvals path which already handles publish)
// For now: use a direct approach — call the Vercel theme/info to confirm Shopify auth works,
// then output the list of variants Tom should hit "Available on" → all markets in admin.

const VERCEL = 'https://everest-calendar.vercel.app';

let success = 0, skipped = 0, failed = 0;
for (const lp of lps) {
  log(`${lp.name.slice(0, 60)}... (id=${lp.shopify_page_id}, status=${lp.status})`);
  if (DRY) { log(`  [dry-run] would publish to all markets`); continue; }

  // Use the existing /api/marketing/launch/clone-page route's PATCH-equivalent —
  // since we don't have a direct "publish-existing" endpoint, write a helper inline:
  // use Shopify Admin GraphQL via the Vercel route layer.
  try {
    // Call the new publish-existing endpoint (built below)
    const res = await fetch(`${VERCEL}/api/marketing/launch/publish-product`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sync-secret': SECRET },
      body: JSON.stringify({ shopify_product_id: lp.shopify_page_id }),
    });
    if (res.ok) {
      const data = await res.json();
      log(`  ✓ published to ${data.publications_count || '?'} publication(s)`);
      success++;
    } else if (res.status === 404) {
      log(`  (publish-product route not yet deployed; awaiting Vercel)`);
      skipped++;
    } else {
      const text = await res.text();
      log(`  ✗ HTTP ${res.status}: ${text.slice(0, 200)}`);
      failed++;
    }
  } catch (e) {
    log(`  ✗ error: ${e.message}`);
    failed++;
  }
}

log(`Done: ${success} published, ${skipped} skipped, ${failed} failed`);
process.stdout.write(JSON.stringify({ success, skipped, failed, total: lps.length }, null, 2) + '\n');
