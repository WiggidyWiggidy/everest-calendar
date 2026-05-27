#!/usr/bin/env node
import process from 'node:process';

const secret = process.env.MARKETING_SYNC_SECRET;
if (!secret) {
  console.error('Missing MARKETING_SYNC_SECRET. Source .env.local first.');
  process.exit(1);
}

const prod = process.env.PROD || process.env.NEXT_PUBLIC_SITE_URL || 'https://everest-calendar.vercel.app';
const refresh = process.argv.includes('--no-refresh') ? 'false' : 'true';
const started = Date.now();
const res = await fetch(`${prod}/api/marketing/ga4-48h-snapshot?refresh=${refresh}`, {
  method: 'POST',
  headers: {
    'x-sync-secret': secret,
    'Content-Type': 'application/json',
  },
});
const text = await res.text();
if (!res.ok && res.status !== 207) {
  console.error(`Snapshot failed ${res.status}: ${text}`);
  process.exit(1);
}
const payload = JSON.parse(text);
const snapshot = payload.snapshot || {};
const elapsed = Date.now() - started;

const totals = snapshot.totals || {};
const freshness = snapshot.freshness || {};
const refreshBody = payload.refresh?.body || {};
console.log(`# GA4 48h snapshot (${elapsed}ms)`);
console.log(`Generated: ${snapshot.generated_at}`);
console.log(`Refresh before read: ${payload.refreshed_before_read ? 'yes' : 'no'}`);
console.log(`Refresh status: ${payload.refresh?.status || (payload.refresh?.skipped ? 'skipped' : 'unknown')}`);
console.log(`Refresh latest report hour: ${refreshBody.latest_report_hour || 'none'}`);
console.log(`Refresh same-day ready: ${refreshBody.same_day_ready ?? 'unknown'}`);
console.log(`Latest synced: ${freshness.latest_synced_at || 'none'}`);
console.log(`Latest report hour: ${freshness.latest_report_hour || 'none'}`);
console.log(`Warnings: ${[...(freshness.warnings || []), ...(refreshBody.warnings || [])].join(', ') || 'none'}`);
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
