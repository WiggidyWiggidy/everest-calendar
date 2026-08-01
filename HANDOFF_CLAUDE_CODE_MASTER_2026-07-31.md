# KRYO B2C — MASTER Hand-off (supersedes v1 + v2)
Repo: `~/Desktop/Claude Project/everest-calendar` · Owner: Tom · 2026-07-31

Mission: get Tom to three outcomes, fast and safely —
**(A) Meta ads running well, (B) landing-page experiments running, (C) budget scaling with confidence.**

Hard rules: never merge `main`; **no spend/budget/campaign change, deploy, or live Shopify/Meta/Supabase
change without Tom's explicit approval**; never commit secrets; prepare code/SQL on the branch for review.
Bind every analysis to `.claude/rules/evidence-standards.md` + `marketing/data-contracts/*`, and run
diagnostic work through `marketing/agents/conversion-diagnosis-loop.md`. When a fact is uncertain,
confirm it (don't infer) or label it UNKNOWN.

---

## 0. The 3 unlocks only Tom can give (surface these first, then proceed on the rest)
1. **Approve the git push** — 31 commits (`consolidation/b2c-marketing-2026-07-31`) are stranded locally.
2. **Fill the economics** in `.claude/meta/account-context.md` — variable cost/COGS, gross margin per
   unit, break-even CPA, target CPA. **This one input turns on the whole confidence system** (thresholds).
3. **Approve restarting the winner ad + the ATC objective switch + the starting budget.** The winner has
   been OFF since ~Jul 15; every dark day costs orders.
Proceed with all non-gated work in parallel; escalate these three clearly in the final report.

## 1. Trusted corrected context (do not re-derive)
- Binding constraint = **VOLUME**. ~1 order/mo on ~A$113/wk; **5 lifetime customers, all from Meta**.
  Ads dark 28/61 days; winner off since ~Jul 15. Account currency **AUD**. kryo2_ live to traffic ~**Jul 26**.
- **Cart works** (H1 refuted). Buy button buried at **97% depth** (H5) — real defect, not the constraint.
- **Tracking broken (blocks scaling):** `fbq` present but `facebook.com/tr` **aborts**; Clarity fails; Chatway 422.
- `/products/kryo2` is **404** (no revert option).
- **Optimise for Add to Cart, ladder to Purchase** (at ~1 sale/mo, Purchase can't exit Meta's ~50-events/wk
  learning phase; ATC fires far more often). Consider **Advantage+** (pools signal, exits learning faster).

## 2. Activate the agents (one-time — I couldn't; `.claude/` is write-protected from Cowork)
Mirror the four newer lenses into real subagents so Claude Code can spawn them:
`marketing/agents/lenses/{consumer-psychology,performance-economics,customer-avatar,meta-ads-expert}.md`
→ `.claude/agents/<name>.md` with frontmatter (name, description, scoped tools). Confirm all nine exist:
data-analyst · code-tracking-auditor · live-ux-tester · cro-researcher · red-team-verifier ·
consumer-psychology · performance-economics · customer-avatar · meta-ads-expert. Add the CLAUDE.md line
"before any conversion analysis, run diagnostic-protocol.md" if not already present.

## 3. Execution — each phase has an ACCEPTANCE CRITERION (self-verify before moving on)

### P0 — Preserve
Push the branch (needs unlock #1). **Done when:** branch on origin, `main` untouched, push URL reported.

### P1 — Tracking prerequisites (you cannot optimise for or trust ATC until these pass)
- Fix `facebook.com/tr` abort; wire `src/lib/marketing/meta-capi.ts` into `sync/storefront-event` for
  AddToCart/InitiateCheckout/Purchase (snippet in `audit/b2c-growth-system-activation-2026-07-31/meta-atc-fix-and-verify.md`).
- Implement the internal-traffic exclusion filter (`data-contracts/source-of-truth.md`).
- Verify UAE is served **AED** (JPY was likely a JP-VPN artifact — confirm from a UAE IP).
- Fix Clarity pixel + Chatway 422.
**Done when:** an add-to-cart on the live page shows a server **AddToCart** in Meta Events Manager → Test
Events (`META_TEST_EVENT_CODE`), and a funnel query run through the internal filter returns clean counts.
(Prepared on branch; live deploy needs Tom.)

### P2 — Economics → thresholds
With unlock #2 filled, compute: break-even CPA, target CPA, and a **target cost-per-ATC** (break-even CPA
× ATC→purchase rate). **Done when:** the three thresholds are written to a config the dashboard reads.

### P3 — Meta ads live + the confidence system (`meta-ads-expert` lens)
- Set objective = **Add to Cart** (Advantage+ or manual). Structure: **Scaling ~80%** (winner, broad) +
  **Testing ~20%** (several radically different creative angles from `customer-avatar` + winning-hooks).
- Restart the winner (unlock #3).
- **Build the predictability dashboard** (§4). **Done when:** it renders daily leading indicators vs
  thresholds (green/amber/red) where Tom checks it, and the staging + kill rules are written down.

### P4 — Landing-page experiment #1 (sticky CTA)
- Ship a working mobile **sticky add-to-cart** (fixes 97% reachability). Wire the experiment engine:
  persist `experiment_id` + variant on the session (survives return visits), expose to Supabase +
  funnel reporting. Primary metric = qualified-intent (ATC + WhatsApp lead), reported separately.
- **Done when:** `tests/kryo-atc-tracking.spec.ts` passes (sticky/above-fold control present),
  variant assignment persists, and `compute_significance` can read the arms. (Deploy needs Tom.)

### P5 — Demand agents → experiment #2
Run `performance-economics` (verify 3-mo ROAS, reconcile revenue source, buying-cycle length — if
multi-day, judge on assisted conversion not first-session), `consumer-psychology` (pull winner ad
creative; score **pre-frame / message-match**; audit the **30-day dispatch** objection), and
`customer-avatar` (populate from the 5 buyers + fresh Meta demographic sync). Output experiment #2
(message-match or offer/dispatch test), ranked by expected profit. **Done when:** the loop's full
Definition of Done (incl. demand-side + right-KPI boxes) is satisfied on the blackboard.

### P6 — Validate + report
`npm run build` + `tsc --noEmit` + tests; scripts resolve; links valid; protocol self-check.

## 4. The confidence system (how Tom scales budget without fear)
Confidence fails today because only lagging sales (weeks apart) are visible. Fix = leading signals + bounded steps:
- **Leading indicators** (move in days, forecast CPA): cost-per-ATC, cost-per-IC, link CTR, 3s hook rate,
  cost-per-landing-view.
- **Thresholds** from P2: green if cost-per-ATC ≤ target, red if above.
- **Staged scaling:** start ~AUD $56–85/day (learning-exit); **+20–30% every 3–4 days ONLY while
  cost-per-ATC ≤ target**; breach → hold/rollback.
- **Daily loss cap** (hard ceiling) + **fast-kill** (cut an ad at ~1–1.5× target cost-per-ATC with 0 ATC).
- Result: every budget increase is *earned by a leading metric*, not hoped for — bounded downside, visible trajectory.

## 5. Approval gates (never cross without Tom)
Git push · deploy to Vercel/prod · live Shopify theme/product change · **Meta objective/budget/restart or
any spend change** · production Supabase schema/policy change.

## 6. Report shape
Push SHA/URL; agents activated; tracking verification (Test Events screenshot/log); thresholds computed;
dashboard link; experiment #1 status + Playwright result; demand-agent findings + experiment #2;
**Tom decisions outstanding** vs **agent actions ready on approval**; confirm main not merged, no prod
changed without approval, no work discarded.

## 7. Honest constraints (keep the team calibrated)
- **5 lifetime customers** → all conclusions are directional; the plan's job is to *create volume* so
  they become testable. Do not present small-sample results as certainty (evidence-standards caps apply).
- The winner ad + avatar are inferred from thin data — treat the first 2 weeks post-restart as the real
  test; let the leading-indicator staging rule (not optimism) drive each budget step.
- Two environments: keep the blackboard + findings ledger updated so Cowork (data/analysis) and Claude
  Code (hands) stay in sync.

## One-line strategy
Activate agents → push → fix tracking → optimise for ATC → restart winner in Scaling/Testing → run the
sticky-CTA experiment → scale in small steps gated by leading indicators under a loss cap. That gets Tom
running ads + experiments now, and scaling with earned confidence — while building the volume everything
else needs.
