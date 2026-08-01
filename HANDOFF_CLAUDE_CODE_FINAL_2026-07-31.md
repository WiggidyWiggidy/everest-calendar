# KRYO B2C — FINAL Hand-off (supersedes MASTER, v1, v2)
Repo: `~/Desktop/Claude Project/everest-calendar` · Owner: Tom · 2026-07-31

Goal: build + verify the growth system ONCE (Part I), then run it forever as a god-tier marketer that
diagnoses critically, proposes + drafts changes, and executes under Tom's approval (Part II). Steady
state = a continuous stream of landing-page split tests, new ad angles, and creative/messaging tests,
ranked by expected profit, measured honestly, with winners scaled and losers cut fast.

## Operating principles (bind to these always)
- Load `.claude/rules/evidence-standards.md` + `marketing/data-contracts/*`; run diagnosis through
  `marketing/agents/conversion-diagnosis-loop.md`. Confirm facts (never infer); label FACT/PATTERN/
  HYPOTHESIS/UNKNOWN; cap confidence by sample size; reconcile sources; red-team before concluding.
- **Autonomy split:** DO the reversible/no-spend work (analysis, build ads PAUSED, build pages DRAFT,
  pause losing ads); PREPARE the money/live actions (go-live, budget up, publish) for Tom's one-click
  approval. Never spend or publish without it. Never merge `main`. Never commit secrets.

## The 3 unlocks only Tom gives (surface first; proceed on everything else in parallel)
1. Approve the git push (31 commits stranded).
2. Fill economics in `.claude/meta/account-context.md` (COGS, margin, break-even CPA, target CPA) —
   switches on the confidence thresholds.
3. Approve restart of the winner ad + ATC objective + starting budget.

## Trusted context (don't re-derive)
Binding constraint = **volume** (~1 order/mo, 5 lifetime customers, all Meta; winner off since ~Jul 15;
account **AUD**). Cart works (H1 refuted); buy button at 97% depth (H5). Tracking broken: `facebook.com/tr`
aborts, Clarity fails, Chatway 422. `/products/kryo2` = 404. **Optimise for Add to Cart, ladder to Purchase.**

---

# PART I — Build & verify the system (do once, confirm each with its acceptance test)

## 1. Preserve
Push the branch (unlock #1). **Done:** on origin, main untouched, URL reported.

## 2. Activate + verify the scaffolding (make it correct)
Mirror all lenses/operators into `.claude/agents/*.md` with frontmatter so Claude Code can spawn them.
Confirm **11 agents** load: data-analyst · code-tracking-auditor · live-ux-tester · cro-researcher ·
red-team-verifier · consumer-psychology · performance-economics · customer-avatar · meta-ads-expert ·
**campaign-operator · page-builder**. Confirm CLAUDE.md loads the protocol; `/memory` shows the intended
hierarchy; no CAD/supplier/B2B bleed. **Done:** all 11 resolve; a dry-run of the loop reads the rules + contracts.

## 3. Tracking prerequisites (can't optimise for or trust ATC until green)
Fix `facebook.com/tr` abort + wire `src/lib/marketing/meta-capi.ts` into `sync/storefront-event`
(AddToCart/IC/Purchase); internal-traffic exclusion filter; verify UAE served AED; fix Clarity + Chatway.
**Done:** a live add-to-cart shows a server AddToCart in Meta Events Manager → Test Events; funnel query
via the internal filter returns clean counts. (Prepared on branch; deploy needs Tom.)

## 4. Economics → thresholds (unlock #2)
Compute break-even CPA, target CPA, target cost-per-ATC. **Done:** thresholds written to config the
dashboard reads.

## 5. Verify the execution (write) routes work end-to-end
- Meta: confirm token has `ads_management`; `campaign-operator` does a **dry-run** create (PAUSED) +
  immediate pause/delete of the test object. **Done:** a PAUSED test campaign is created then cleaned up, logged.
- Shopify: `page-builder` clones a **DRAFT** variant from `kryo_`, runs QC (render + Playwright), then
  deletes it. **Done:** draft variant created + QC passes + removed, logged. (No live publish in this step.)

## 6. Predictability dashboard
Daily leading indicators (cost-per-ATC, cost-per-IC, CTR, hook rate) vs thresholds (green/amber/red),
where Tom checks it. **Done:** renders live with the staging + kill rules written beside it.

## 7. First real actions (Tom approves the live/spend parts)
- `campaign-operator`: restart the winner in Ben Heath structure (Scaling ~80% / Testing ~20%),
  objective = ATC, built PAUSED → Tom flips live at the starting budget.
- `page-builder`: build the **sticky-CTA variant** as variant B of an experiment vs current control,
  DRAFT + QC pass → Tom approves publish. Primary metric = qualified-intent.
**Done:** ads live (Tom), experiment running with persistent assignment, dashboard tracking both.

Part I complete when: branch pushed · 11 agents live · tracking verified in Test Events · thresholds set ·
write routes proven (dry-run) · dashboard live · winner ad live · first LP split test running.

---

# PART II — The steady-state operating loop (the god-tier marketer)

Run this continuously (weekly cadence + anomaly triggers). This is the engine that tests many LP
variants, ad angles, and creatives to find what moves the needle.

1. **Monitor** — dashboard leading indicators; flag anomalies/regressions (uptime, cost-per-ATC drift).
2. **Diagnose** — run the loop across all lenses: data (funnel/cohorts), performance-economics (ROAS,
   buying cycle), consumer-psychology (pre-frame/message-match/objections), customer-avatar. Identify the
   current biggest lever, corroborated ≥2 sources, red-teamed. Update the blackboard + findings ledger.
3. **Hypothesise** — generate the next tests: LP variants, new ad angles, creatives, messaging — grounded
   in the avatar + winning-hooks + psychology, each with an expected mechanism and a falsification test.
4. **Rank** — by expected profit (Δrate × traffic × margin), max 1–3 live at once (avoid confounding).
5. **Draft** — `page-builder` builds the LP variant (draft) with sticky CTA; creative/copy drafted to the
   avatar; `campaign-operator` builds the new ad/angle PAUSED.
6. **Propose** — one-screen packet per test: hypothesis, expected lift, leading indicator to watch,
   guardrails, cost. **Tom approves.**
7. **Execute** — Tom flips ads live / approves publish; agents handle the mechanics. Losers are paused
   autonomously on the kill rule.
8. **Measure** — experiment engine + `compute_significance` (with pre-set MDE/sample); leading indicators
   for early signal. Judge on the right KPI for the buying cycle (assisted conversion if multi-day).
9. **Scale** — winners: staged budget +20–30% / 3–4 days while cost-per-ATC ≤ target, under the daily loss cap.
10. **Learn** — write predicted-vs-actual to `hypothesis_learnings`; update avatar, winning-hooks, and the
    calibration log so confidence gets tuned. Then back to 1.

## Guardrails (always)
Autonomous: analysis, build-paused ads, build-draft pages, pause losers, run experiments/QC.
Tom-approved: go-live, budget set/increase, publish, objective/audience changes, prod schema, git push.
Every conclusion honest per evidence-standards; small-sample results labelled directional, never certain.

## Honest constraints to keep the team calibrated
5 lifetime customers → everything is directional until volume grows; the loop's job is to create testable
volume. Treat the first 2 weeks post-restart as the real test; let leading indicators (not optimism)
drive each budget step. The winner ad + avatar are inferred from thin data — validate as data accrues.

## Report shape (every cycle)
What was diagnosed (labelled + evidence) · tests proposed/ranked · what was built (draft/paused) ·
**Tom approvals needed** vs **actions taken** · results vs prediction · learnings written · next lever.
