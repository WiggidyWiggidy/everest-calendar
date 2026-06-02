import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

const PAGE_PATH = '/products/kryo2';
const EVENT_TYPES = new Set(['section_view', 'click', 'dead_click', 'rage_click', 'scroll_abandon']);

function text(value: unknown, max = 200) {
  return typeof value === 'string' ? value.slice(0, max) : null;
}
function num(value: unknown, max = 1_800) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.min(n, max)) : 0;
}
function bool(value: unknown) { return value === true; }
function list(value: unknown) {
  return Array.isArray(value) ? Array.from(new Set(value.map(item => text(item, 100)).filter(Boolean))).slice(0, 80) : [];
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (body.page_path !== PAGE_PATH || !body.session_id) return NextResponse.json({ ignored: true });
  const sb = createServiceClient();
  const now = new Date().toISOString();
  const isInternal = bool(body.is_internal);
  const summary = {
    session_id: text(body.session_id, 160),
    page_path: PAGE_PATH,
    anonymous_id: text(body.anonymous_id, 160),
    meta_campaign_id: text(body.meta_campaign_id, 64),
    meta_adset_id: text(body.meta_adset_id, 64),
    meta_ad_id: text(body.meta_ad_id, 64),
    first_touch_meta_ad_id: text(body.first_touch_meta_ad_id, 64),
    current_touch_meta_ad_id: text(body.current_touch_meta_ad_id, 64),
    device_type: text(body.device_type, 32),
    is_internal: isInternal,
    elapsed_time_sec: num(body.elapsed_time_sec),
    active_time_sec: num(body.active_time_sec),
    max_scroll_depth_pct: num(body.max_scroll_depth_pct, 100),
    total_clicks: num(body.total_clicks, 500),
    interactive_clicks: num(body.interactive_clicks, 500),
    dead_clicks: num(body.dead_clicks, 500),
    rage_clicks: num(body.rage_clicks, 500),
    scroll_25: bool(body.scroll_25), scroll_50: bool(body.scroll_50),
    scroll_75: bool(body.scroll_75), scroll_90: bool(body.scroll_90),
    offer_viewed: bool(body.offer_viewed), guarantee_viewed: bool(body.guarantee_viewed),
    cta_clicks: num(body.cta_clicks, 500),
    sections_viewed: list(body.sections_viewed),
    sections_clicked: list(body.sections_clicked),
    last_seen_at: now,
  };
  const { error } = await sb.rpc('upsert_kryo_pdp_session_quality', { p_row: summary });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const events = Array.isArray(body.events) ? body.events.slice(0, 50) as Array<Record<string, unknown>> : [];
  const eventRows = events.filter(event => EVENT_TYPES.has(String(event.event_type))).map(event => ({
    ts: text(event.ts, 40) || now, session_id: summary.session_id, page_path: PAGE_PATH,
    meta_ad_id: summary.meta_ad_id, section_id: text(event.section_id, 100) || 'unknown',
    event_type: event.event_type, x_pct: num(event.x_pct, 100), y_pct: num(event.y_pct, 100),
    scroll_depth_pct: num(event.scroll_depth_pct, 100), target_role: text(event.target_role, 60),
    is_interactive: bool(event.is_interactive), is_internal: isInternal,
  }));
  if (eventRows.length) {
    const { error: eventsError } = await sb.from('kryo_pdp_section_events').insert(eventRows);
    if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, events_written: eventRows.length });
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: {
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400',
  }});
}
