import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    disabled: true,
    reason: 'legacy_meta_asset_extraction_disabled_after_2026_08_06_source_health_cleanup',
    current_rule: 'Do not extract Meta creative assets from stale snapshots. Re-enable only after official Meta Graph sync is healthy and source-health allows Meta decisions.',
  }, { status: 410 });
}

export async function POST() {
  return GET();
}
