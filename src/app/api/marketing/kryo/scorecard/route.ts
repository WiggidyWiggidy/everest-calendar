import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MESSAGE = 'Legacy KRYO scorecard route is disabled. It previously read Meta, GA4 and GSC tables directly and could represent blocked sources as zeros. Use Supabase vw_kryo_source_health plus Shopify/Admin and first-party attribution readouts until a source-health-gated scorecard is rebuilt.';

export async function GET() {
  return NextResponse.json({ success: false, disabled: true, message: MESSAGE }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ success: false, disabled: true, message: MESSAGE }, { status: 410 });
}
