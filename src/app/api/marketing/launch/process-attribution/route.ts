import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MESSAGE = 'Legacy attribution batch is disabled. It previously called stale external-table RPCs such as compute_ad_metrics_daily. Rebuild only after official Meta, GA4 and GSC sources are fresh and every output is gated by vw_kryo_source_health.';

export async function GET() {
  return NextResponse.json({ success: false, disabled: true, message: MESSAGE }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ success: false, disabled: true, message: MESSAGE }, { status: 410 });
}
