#!/usr/bin/env node
import process from 'node:process';

const url = process.env.EVEREST_SUPABASE_URL;
const key = process.env.EVEREST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing EVEREST_SUPABASE_URL or service key. Source .env.local first.');
  process.exit(1);
}

const includeInternal = process.argv.includes('--raw') || process.argv.includes('--include-internal');
const started = Date.now();
const res = await fetch(`${url}/rest/v1/rpc/get_ga4_48h_snapshot`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ include_internal: includeInternal }),
});
const text = await res.text();
if (!res.ok) {
  console.error(`Snapshot failed ${res.status}: ${text}`);
  process.exit(1);
}
const snapshot = JSON.parse(text);
const elapsed = Date.now() - started;

const totals = snapshot.totals || {};
const freshness = snapshot.freshness || {};
const internal = snapshot.internal_exclusion || {};
console.log(`# GA4 48h snapshot (${elapsed}ms)`);
console.log(`Generated: ${snapshot.generated_at}`);
console.log(`Latest synced: ${freshness.latest_synced_at || 'none'}`);
console.log(`Latest report hour: ${freshness.latest_report_hour || 'none'}`);
console.log(`Filters: ${(snapshot.filters_applied || []).join(', ') || 'none'}`);
if (!includeInternal) {
  console.log(`Internal traffic removed: ${internal.sessions_removed ?? 0} China sessions, ${internal.pageviews_removed ?? 0} pageviews, ${internal.add_to_carts_removed ?? 0} ATCs`);
}
console.log(`Warnings: ${(freshness.warnings || []).join(', ') || 'none'}`);
console.log('');
console.log(`Sessions: ${totals.sessions ?? 0}`);
console.log(`Pageviews: ${totals.screen_page_views ?? 0}`);
console.log(`ATC: ${totals.add_to_carts ?? 0}`);
console.log(`Checkouts: ${totals.begin_checkouts ?? 0}`);
console.log(`Purchases: ${totals.purchases ?? 0}`);
console.log(`Revenue: ${totals.purchase_revenue ?? 0}`);
console.log('');
console.log('## Route flags');
for (const row of (snapshot.route_flags || []).slice(0, 12)) {
  console.log(`- ${row.sessions} sessions | ${row.page_path} | ${(row.flags || []).join(', ')} | ${row.page_title || ''}`);
}
console.log('');
console.log('## 404 pages');
for (const row of (snapshot.not_found_pages || []).slice(0, 12)) {
  console.log(`- ${row.sessions} sessions | ${row.page_path} | ${row.page_title || ''}`);
}
console.log('');
console.log('## Top KRYO pages');
for (const row of (snapshot.kryo_pages || []).slice(0, 12)) {
  console.log(`- ${row.sessions} sessions | ${row.page_path} | ATC ${row.add_to_carts} | checkout ${row.begin_checkouts} | purchase ${row.purchases} | ${row.page_title || ''}`);
}
