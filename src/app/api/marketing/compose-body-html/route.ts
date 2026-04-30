// /api/marketing/compose-body-html
// Takes a BodyHtmlSpec JSON and returns the composed body_html string (and metadata).
// The /launch-kryo skill curls this between picking the variant spec and calling clone-page.
//
// Auth: x-sync-secret. No DB writes. Pure transformation endpoint.

import { NextRequest, NextResponse } from 'next/server';
import { composeBodyHtml } from '@/lib/page-composer';
import type { BodyHtmlSpec } from '@/lib/page-sections';

function authSkill(request: NextRequest): boolean {
  const secret = request.headers.get('x-sync-secret');
  return Boolean(secret && secret === process.env.MARKETING_SYNC_SECRET);
}

export async function POST(request: NextRequest) {
  if (!authSkill(request)) {
    return NextResponse.json({ error: 'Unauthorized — x-sync-secret required' }, { status: 401 });
  }

  let body: BodyHtmlSpec;
  try {
    body = (await request.json()) as BodyHtmlSpec;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || !Array.isArray(body.sections)) {
    return NextResponse.json({ error: 'BodyHtmlSpec.sections (array) is required' }, { status: 400 });
  }
  if (body.sections.length === 0) {
    return NextResponse.json({ error: 'At least one section required' }, { status: 400 });
  }

  try {
    const out = composeBodyHtml(body);
    return NextResponse.json({
      success: true,
      body_html: out.body_html,
      byte_length: out.byteLength,
      schema_count: out.schemaCount,
      section_count: out.sectionCount,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Compose failed', detail: (err as Error).message }, { status: 422 });
  }
}
