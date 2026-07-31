#!/usr/bin/env npx tsx
import process from 'node:process';
import { createServiceClient } from '../src/lib/supabase/service';
import { buildKryoDailySummary } from '../src/lib/marketing/kryo-daily-summary';

function pct(value: number | null) {
  if (value == null) return 'n/a';
  return `${(value * 100).toFixed(1)}%`;
}

function money(value: number | null) {
  if (value == null) return 'n/a';
  return `$${value.toFixed(2)}`;
}

function fmt(value: number | null) {
  if (value == null) return 'n/a';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

const json = process.argv.includes('--json');
const timeZoneFlag = process.argv.find((arg) => arg.startsWith('--tz='));
const reportTimeZone = timeZoneFlag?.split('=')[1] || 'Asia/Dubai';

async function main() {
  const summary = await buildKryoDailySummary(createServiceClient(), { reportTimeZone });
  if (json) {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  }

  for (const section of [summary.daily, summary.rolling_5d]) {
    console.log(`# ${section.label}`);
    console.log(`Current: ${section.current_dates.start} to ${section.current_dates.end}`);
    console.log(`Prior:   ${section.prior_dates.start} to ${section.prior_dates.end}`);
    console.log(section.headline);
    console.log(section.diagnosis);
    console.log('');
    console.log(`- Clean users: ${fmt(section.metrics.clean_users.current)} vs ${fmt(section.metrics.clean_users.prior)}`);
    console.log(`- UAE users: ${fmt(section.metrics.uae_users.current)} vs ${fmt(section.metrics.uae_users.prior)}`);
    console.log(`- Returning users: ${fmt(section.metrics.returning_users.current)} vs ${fmt(section.metrics.returning_users.prior)}`);
    console.log(`- Returning rate: ${pct(section.metrics.returning_user_rate.current)} vs ${pct(section.metrics.returning_user_rate.prior)}`);
    console.log(`- Primary KRYO ATC users: ${fmt(section.metrics.primary_atc_users.current)} vs ${fmt(section.metrics.primary_atc_users.prior)}`);
    console.log(`- GA4 checkout events: ${fmt(section.metrics.checkout_events.current)} vs ${fmt(section.metrics.checkout_events.prior)}`);
    console.log(`- GA4 purchase events: ${fmt(section.metrics.purchase_events.current)} vs ${fmt(section.metrics.purchase_events.prior)}`);
    console.log(`- Meta spend: ${money(section.metrics.meta_spend.current)} vs ${money(section.metrics.meta_spend.prior)}`);
    console.log(`- Meta outbound clicks: ${fmt(section.metrics.meta_outbound_clicks.current)} vs ${fmt(section.metrics.meta_outbound_clicks.prior)}`);
    console.log(`- Meta CTR (all): ${pct(section.metrics.meta_ctr_all.current)} vs ${pct(section.metrics.meta_ctr_all.prior)}`);
    console.log(`- Meta outbound CTR: ${pct(section.metrics.meta_outbound_ctr.current)} vs ${pct(section.metrics.meta_outbound_ctr.prior)}`);
    console.log(`- Meta CPC (all): ${money(section.metrics.meta_cpc_all.current)} vs ${money(section.metrics.meta_cpc_all.prior)}`);
    console.log(`- Meta cost per website ATC: ${money(section.metrics.meta_cost_per_website_atc.current)} vs ${money(section.metrics.meta_cost_per_website_atc.prior)}`);
    console.log(`- Site session CVR: ${pct(section.metrics.site_session_conversion_rate.current)} vs ${pct(section.metrics.site_session_conversion_rate.prior)}`);
    console.log(`- Site user CVR: ${pct(section.metrics.site_user_conversion_rate.current)} vs ${pct(section.metrics.site_user_conversion_rate.prior)}`);
    console.log(`- Excluded GA4 sessions: ${fmt(section.metrics.excluded_ga4_sessions.current)} vs ${fmt(section.metrics.excluded_ga4_sessions.prior)}`);
    console.log(`- Excluded touch rows: ${fmt(section.metrics.excluded_touch_rows.current)} vs ${fmt(section.metrics.excluded_touch_rows.prior)}`);
    if (section.top_ad) {
      console.log(`- Top ad: ${section.top_ad.ad_name} | ${section.top_ad.campaign_name} | returners ${section.top_ad.returning_users} | GA4 ATC ${section.top_ad.ga4_add_to_cart_events} | Meta website ATC ${section.top_ad.meta_website_add_to_carts}`);
    }
    console.log('');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
