# Claude Code Task — Make KRYO analysis trustworthy and effective TODAY
Repo: `~/Desktop/Claude Project/everest-calendar` · Owner: Tom · 2026-07-31

Goal: turn Claude from a careful-but-often-wrong reasoner into a reliable marketing analyst by
fixing the two foundations (trustworthy data + economic context) and removing the tooling hand-offs.
Priorities: **P0 = do today**, P1 = this week. Guardrails: no production deploy / schema / ad change
without Tom's approval; prepare all SQL + code on the consolidation branch for review; never commit secrets.

Load first: `.claude/rules/evidence-standards.md`, `marketing/data-contracts/*`,
`marketing/agents/conversion-diagnosis-loop.md`.

---

## PART A (P0) — One environment: give Claude Code the analyst's tools
**HAS:** repo + shell + git + Playwright/Chrome + web search; `.env.prod.local` with
`EVEREST_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Meta/Shopify/Google/Clarity creds; scripts in
`scripts/kryo-*`; Supabase project `oksemtvjcfzicksmukmz`.
**NEEDS:**
1. Wire read-only DB access into Claude Code: load `.env.prod.local`, connect with `psql`/supabase CLI
   or a tiny query helper, verify `select 1`. This makes the **data-analyst lens** runnable here
   (today it required Cowork). Confirm Playwright runs (`npx playwright --version`).
2. Verify network reach to graph.facebook.com, the Shopify store, Google, Clarity (the readiness
   scripts). Result: one agent can do SQL + live browser + code + web without hand-off.

## PART B (P0) — Trustworthy, reconciled measurement layer (the #1 lever)
Everything I got wrong traced to unreliable data. Build the semantic layer so every metric is defined
once, sourced correctly, and reconciled.
**HAS (already in Supabase, mostly empty/unused):** `analytics_metric_dictionary` (9),
`analytics_reconciliation_daily`, `analytics_identity_registry` (0), `benchmark_registry`;
truth sources `meta_ad_metrics_daily` (paid ATC/checkout/purchase), `shopify_funnel_daily`
(server-side checkout), `attribution_touches` (on-site behaviour); compute RPCs
`compute_ad_metrics_daily`, `compute_lp_funnel_daily`, `compute_significance`.
**NEEDS (prepare as migrations for review — do NOT apply to prod without Tom):**
1. **Canonical source binding** — encode `marketing/data-contracts/source-of-truth.md` as the metric
   dictionary rows: for each metric → canonical table, valid window, known-bad periods
   (cart tracking May–early June 2026), grain, join keys.
2. **Internal-traffic exclusion view** — reusable, filters anon_ids `elv_1779869995748*`,
   `elv_1779806210806*`, referrers `myshopify.com`/`admin.shopify.com`, `is_internal`. Every funnel
   query uses it. (Confirm the fingerprint list with Tom; auto-flag any anon with outlier session counts.)
3. **`kryo_funnel_truth` view** — one row per (date × page × device), pulling each step from its
   CANONICAL source (paid ATC/checkout/purchase = Meta + Shopify server-side; engagement = first-party),
   internal excluded, known-bad windows flagged, with sample sizes.
4. **Reconciliation view** — per metric per day, show each source's value + the divergence; expose it
   so no claim rests on a single source. (This is what would have stopped my flip-flops.)
5. **Fix tracking forward** so first-party stops undercounting: wire `src/lib/marketing/meta-capi.ts`
   into `storefront-event` for AddToCart/InitiateCheckout/Purchase (snippet in
   `audit/b2c-growth-system-activation-2026-07-31/meta-atc-fix-and-verify.md`); ensure the custom
   add-to-cart fires a reliable event. Verify in Meta Events Manager Test Events.

## PART C (P0) — Encode the economic model (defines "good")
**HAS:** `.claude/meta/account-context.md` with the economic fields present but blank (REQUIRED).
**NEEDS:** fill with Tom (30 min): selling price (AED 3,990), COGS/variable cost, gross margin per
unit, break-even CPA, target CPA, break-even & target ROAS, min spend before judging a no-purchase ad,
min conversions before a winner call. Then a **leverage calculator** that ranks any proposed fix by
expected $ impact (Δrate × traffic × margin), so recommendations are ordered by money, not vibes.

## PART D (P0) — Finish the live diagnosis that's still OPEN
**HAS:** `tests/kryo-atc-tracking.spec.ts`; blackboard
`marketing/findings/2026-07-31-kryo2_-atc-blackboard.md` with the dominant loss confirmed and cause OPEN.
**NEEDS:** run the Playwright test desktop + **mobile** on `everestlabs.co/products/kryo2_`; settle
H1 (variant picker breaks/disables add-to-cart) vs H2 (demand). Update blackboard; reach Definition of
Done. This is the one thing Cowork could not do.

## PART E (P1) — Close the loop + memory + monitoring
**HAS:** `marketing_experiments`, `experiment_daily_metrics`, `compute_significance`,
`marketing_learnings`/`findings`, `marketing/findings/` ledger, `kryo-source-health.mjs`, the daily
`marketing-analytics-sync` cron, `marketing_guardrail_alerts`.
**NEEDS:**
1. **Experiment loop** — design → persist `experiment_id` + variant on the session → measure via
   `kryo_funnel_truth` → readout with `compute_significance` (power/MDE computed up front for small
   samples). Record predicted-vs-actual lift in `hypothesis_learnings`.
2. **Session memory** — add a `CLAUDE.md` pointer so every session loads confirmed-facts, the findings
   ledger, and active learnings. Curate `marketing_learnings` (drop stale/unsafe rows).
3. **Calibration log** — track each prediction's confidence vs outcome so "high confidence" earns meaning.
4. **Proactive monitor** — daily job: source-health + `kryo_funnel_truth` deltas + anomaly flags →
   surface breaks (like the ATC-zero that ran for days) before they burn budget.

## PART F — Validate + report
- Prepare all migrations/views + code on the branch; `npm run build` + `tsc --noEmit` + tests pass.
- Report: what's built vs prepared-for-review; the settled H1/H2 result with evidence; the ranked,
  $-weighted fixes; **Tom decisions** (fill economics; confirm fingerprints + known-bad window; approve
  each migration/deploy; revert ads?) vs **agent actions ready on approval**.
- Confirm: main not merged; no prod system changed without approval; no work discarded.

## Sequencing for today
A (tools) → C-economics input from Tom (parallel) → B (measurement layer, prepared for review) →
D (live ATC test) → then P1. The moment A+B+D are done, every future diagnosis runs on clean data,
in one environment, with the loop that won't let it conclude prematurely.
