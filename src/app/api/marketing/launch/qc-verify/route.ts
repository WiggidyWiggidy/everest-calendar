// /api/marketing/launch/qc-verify
// Hard gate between clone-page (which writes status='qc_pending') and inbox-write (which only
// fires when status='testing'). The slash command runs the 3 inspectors LOCALLY (Playwright +
// content scan) and POSTs their JSON outputs here. This route is the rubric layer:
//
//   1. Receives PartialVerdicts from the 3 local inspectors + the variant/control body_html
//   2. Runs inspectCreative() (pure TS, no browser) on the body_html pair
//   3. Unifies all 3 via rubric.ts → QcResult
//   4. PASS  → PATCH landing_pages.status='testing'; return verdict for slash command to call inbox-write.
//   5. FAIL  → INSERT qc_rejected_variants; PATCH landing_pages.status='qc_rejected'; return verdict.
//
// Auth: x-sync-secret (matches existing launch routes).
// No LLM calls. No Playwright. Pure logic + DB writes.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { auditLog } from '@/lib/marketing-safety';
import { unify, PartialVerdict } from '@/lib/qc/rubric';
import { inspectCreative } from '@/lib/qc/inspect-creative';

const TOM_USER_ID = '174f2dff-7a96-464c-a919-b473c328d531';

function authSkill(request: NextRequest): boolean {
  const secret = request.headers.get('x-sync-secret');
  return Boolean(secret && secret === process.env.MARKETING_SYNC_SECRET);
}

function svcClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

interface QcVerifyRequest {
  landing_page_id: string;
  shopify_product_id?: string;
  shopify_handle?: string;
  preview_url: string;
  variant_angle?: string;
  experiment_id?: string;

  // PartialVerdict from qc-visual.mjs (the slash command shells out + pastes the JSON here)
  visual_inspector: PartialVerdict;
  // PartialVerdict from qc-functional.mjs
  functional_inspector: PartialVerdict;

  // For inspectCreative — runs server-side (pure TS, no browser)
  variant_body_html: string;
  variant_title: string;
  control_body_html?: string;
  control_title?: string;
  ad_headlines?: string[];
  ad_primary_texts?: string[];

  // Artifact URLs (slash command uploaded to storage, passes URLs)
  desktop_screenshot_url?: string;
  mobile_screenshot_url?: string;
  diagnostics_path?: string;
}

export async function POST(request: NextRequest) {
  try {
    if (!authSkill(request)) {
      return NextResponse.json({ error: 'Unauthorized — x-sync-secret required' }, { status: 401 });
    }

    const body = (await request.json()) as QcVerifyRequest;
    if (!body.landing_page_id || !body.preview_url || !body.visual_inspector || !body.functional_inspector || !body.variant_body_html) {
      return NextResponse.json({
        error: 'landing_page_id, preview_url, visual_inspector, functional_inspector, variant_body_html required',
      }, { status: 400 });
    }

    // Sanity check the inspector shapes
    for (const [k, v] of [['visual_inspector', body.visual_inspector], ['functional_inspector', body.functional_inspector]] as const) {
      if (!Array.isArray((v as PartialVerdict).failed_checks) || !Array.isArray((v as PartialVerdict).passed_checks)) {
        return NextResponse.json({ error: `${k} missing failed_checks/passed_checks arrays` }, { status: 400 });
      }
    }

    // 1. Run creative inspector server-side
    const creative = inspectCreative({
      variant_body_html: body.variant_body_html,
      variant_title: body.variant_title ?? '',
      control_body_html: body.control_body_html,
      control_title: body.control_title,
      ad_headlines: body.ad_headlines,
      ad_primary_texts: body.ad_primary_texts,
    });

    // 2. Unify via rubric
    const verdict = unify(body.visual_inspector, body.functional_inspector, creative);

    // 3. Update landing_pages + write rejection if needed
    const sb = svcClient();

    if (verdict.pass) {
      // PASS — flip to testing so inbox-write can fire
      const { error: updateErr } = await sb
        .from('landing_pages')
        .update({ status: 'testing' })
        .eq('id', body.landing_page_id);
      if (updateErr) {
        console.error('landing_pages PATCH failed:', updateErr);
      }

      await auditLog(
        sb, TOM_USER_ID, 'qc_passed', 'landing_page', body.landing_page_id,
        { status: 'qc_pending' },
        { status: 'testing', score: verdict.total_score, max: verdict.total_max },
        'scheduled_agent',
        {
          variant_angle: body.variant_angle,
          inspectors: {
            visual: { score: body.visual_inspector.score, max: body.visual_inspector.max_score, pass: body.visual_inspector.pass },
            functional: { score: body.functional_inspector.score, max: body.functional_inspector.max_score, pass: body.functional_inspector.pass },
            creative: { score: creative.score, max: creative.max_score, pass: creative.pass },
          },
        },
      );

      return NextResponse.json({
        success: true,
        pass: true,
        unanimous: verdict.unanimous,
        verdict: {
          total_score: verdict.total_score,
          total_max: verdict.total_max,
          pass_threshold: verdict.pass_threshold,
          one_line_summary: verdict.one_line_summary,
          inspectors: {
            visual: { pass: body.visual_inspector.pass, score: body.visual_inspector.score, max: body.visual_inspector.max_score },
            functional: { pass: body.functional_inspector.pass, score: body.functional_inspector.score, max: body.functional_inspector.max_score },
            creative: { pass: creative.pass, score: creative.score, max: creative.max_score, failed_checks: creative.failed_checks },
          },
        },
        next_step: 'Call /api/marketing/launch/inbox-write to surface to Tom.',
      });
    }

    // FAIL — write qc_rejected_variants + flip status
    const { data: rejection, error: rejErr } = await sb
      .from('qc_rejected_variants')
      .insert({
        landing_page_id: body.landing_page_id,
        shopify_product_id: body.shopify_product_id ?? null,
        shopify_handle: body.shopify_handle ?? null,
        preview_url: body.preview_url,
        variant_angle: body.variant_angle ?? null,
        experiment_id: body.experiment_id ?? null,
        inspector_visual: body.visual_inspector,
        inspector_functional: body.functional_inspector,
        inspector_creative: creative,
        failed_checks: verdict.failed_checks.map((c) => c.check),
        total_score: verdict.total_score,
        pass_threshold: verdict.pass_threshold,
        desktop_screenshot_url: body.desktop_screenshot_url ?? null,
        mobile_screenshot_url: body.mobile_screenshot_url ?? null,
        diagnostics_json_path: body.diagnostics_path ?? null,
        one_line_summary: verdict.one_line_summary,
        surfaced_to_tom: false,
      })
      .select('id')
      .single();

    if (rejErr) {
      console.error('qc_rejected_variants insert failed:', rejErr);
    }

    const { error: updateErr } = await sb
      .from('landing_pages')
      .update({ status: 'qc_rejected' })
      .eq('id', body.landing_page_id);
    if (updateErr) {
      console.error('landing_pages PATCH (qc_rejected) failed:', updateErr);
    }

    await auditLog(
      sb, TOM_USER_ID, 'qc_rejected', 'landing_page', body.landing_page_id,
      { status: 'qc_pending' },
      { status: 'qc_rejected', qc_rejected_id: rejection?.id },
      'scheduled_agent',
      {
        variant_angle: body.variant_angle,
        failed_checks: verdict.failed_checks.map((c) => ({ check: c.check, detail: c.detail?.slice(0, 200) })),
        score: verdict.total_score,
        max: verdict.total_max,
      },
    );

    return NextResponse.json({
      success: true,
      pass: false,
      unanimous: verdict.unanimous,
      qc_rejected_id: rejection?.id ?? null,
      verdict: {
        total_score: verdict.total_score,
        total_max: verdict.total_max,
        pass_threshold: verdict.pass_threshold,
        one_line_summary: verdict.one_line_summary,
        failed_checks: verdict.failed_checks,
        inspectors: {
          visual: { pass: body.visual_inspector.pass, score: body.visual_inspector.score, max: body.visual_inspector.max_score, failed_checks: body.visual_inspector.failed_checks },
          functional: { pass: body.functional_inspector.pass, score: body.functional_inspector.score, max: body.functional_inspector.max_score, failed_checks: body.functional_inspector.failed_checks },
          creative: { pass: creative.pass, score: creative.score, max: creative.max_score, failed_checks: creative.failed_checks },
        },
      },
      next_step: 'Hard reject. Page WILL NOT reach Tom\'s inbox. Surface one-line summary via Telegram.',
    });
  } catch (err) {
    console.error('qc-verify error:', err);
    return NextResponse.json({ error: 'Internal server error', detail: (err as Error).message }, { status: 500 });
  }
}
