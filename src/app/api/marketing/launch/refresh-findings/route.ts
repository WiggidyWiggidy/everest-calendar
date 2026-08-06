import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MESSAGE = 'Legacy marketing findings refresh is disabled. It previously wiped and rebuilt marketing_findings from old SQL logic, which could overwrite current audit findings. Findings should now be written intentionally from current source-health-gated analysis.';

export async function GET() {
  return NextResponse.json({ success: false, disabled: true, message: MESSAGE }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ success: false, disabled: true, message: MESSAGE }, { status: 410 });
}
