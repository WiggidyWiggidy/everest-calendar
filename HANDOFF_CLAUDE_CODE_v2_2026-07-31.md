# Claude Code Hand-off v2 — KRYO B2C: scale with predictability (SUPERSEDES v1)
Repo: `~/Desktop/Claude Project/everest-calendar` · Owner: Tom · 2026-07-31

v1 (`HANDOFF_CLAUDE_CODE_2026-07-31.md`) assumed a broken cart and a page-level conversion crisis.
Both were disproved. Use THIS file. Hard rules: never merge `main`; **no spend/budget/campaign change,
deploy, or live Shopify/Meta/Supabase change without Tom's explicit approval**; never commit secrets;
prepare code/SQL on the branch for review. Bind all analysis to `.claude/rules/evidence-standards.md`
and `marketing/data-contracts/*`. Run through `marketing/agents/conversion-diagnosis-loop.md`.

## Corrected context — trust these (don't re-derive)
- **Binding constraint = VOLUME, not page layout.** ~1 order/month on ~A$113/wk; 5 lifetime customers,
  all from Meta. Ads were dark **28 of 61 days**; the purchase-producing **winner ad has been OFF since ~Jul 15**.
- **Cart works** (H1 refuted: `/cart/add.js` → 200, real line). Buy button buried at **97% depth** (H5) —
  a real defect but NOT the binding constraint.
- **Tracking defects (real, blocking scale):** `fbq` present but `facebook.com/tr` **aborts** (events don't
  land); Clarity pixel fails; Chatway proxy 422.
- `/products/kryo2` (old page) is **404** — reverting isn't available.
- **Account currency = AUD.** kryo2_ went live to traffic ~**Jul 26**.
- Branch `consolidation/b2c-marketing-2026-07-31` = **31 commits, unpushed** (permission denied 3×).
- **Bootstrapped:** cannot bleed for 14 days; needs **predictability** to raise budget with confidence.

## Optimisation answer (settled, research-backed)
Optimise for **Add to Cart now, ladder to Purchase later.** At ~1 purchase/mo you can't feed Purchase
optimisation the ~50 conversions/wk/ad-set to exit learning; ATC fires 5–10× more often. Consider
**Advantage+ Shopping** (pools signal at campaign level, exits learning faster for low volume).
Prerequisite: the `facebook.com/tr` + CAPI fix — can't optimise for an event Meta isn't receiving.

---

## P0 — Preserve (do first)
Push the branch so 31 commits aren't stranded on one machine. Needs Tom to approve the push permission.
No `main` merge. Report the push URL + SHA.

## P1 — Measurement prerequisites (unlock safe scaling)
1. Fix `facebook.com/tr` abort; wire `src/lib/marketing/meta-capi.ts` into `sync/storefront-event` for
   AddToCart/InitiateCheckout/Purchase (snippet in `audit/b2c-growth-system-activation-2026-07-31/meta-atc-fix-and-verify.md`).
   Verify events land in Meta Events Manager → Test Events (`META_TEST_EVENT_CODE`).
2. Implement the internal-traffic exclusion filter (`marketing/data-contracts/source-of-truth.md`).
3. Verify UAE visitors are served **AED** (the JPY finding is likely a JP-VPN test artifact — confirm from a UAE IP).
4. Fix Clarity pixel + Chatway 422 (cheap; restores friction data).
All prepared on branch; deploy only with Tom's approval.

## P2 — Economics input (blocks the predictability math — get from Tom, ~30 min)
Fill `.claude/meta/account-context.md`: variable cost/COGS, gross margin per unit, break-even CPA,
target CPA, break-even/target ROAS, min conversions before a winner call. Without these the
leading-indicator thresholds can't be computed.

## P3 — Acquisition / scale (the growth lever) — run `meta-ads-expert` lens
1. **Switch objective to Add to Cart** (Advantage+ or manual per the lens). Ladder to Purchase once ATC
   volume supports it.
2. **Ben Heath 2026 structure:** Scaling campaign ~80% (winner, broad cold+warm) + Testing ~20% (several
   *radically different* creative angles seeded from `customer-avatar` + winning-hooks).
3. **Restart the winner ad** (Tom approves — it's been off since ~Jul 15, costing orders daily).
4. **Predictability dashboard** (the confidence tool): daily leading indicators — cost-per-ATC,
   cost-per-IC, link CTR, 3s hook rate — vs break-even thresholds (green/amber/red). Reuse
   `kryo-source-health`/analytics-ops patterns; surface it where Tom checks daily.
5. **Bootstrap-safe scaling rule:** start ~AUD $56–85/day (learning-exit); **+20–30% every 3–4 days ONLY
   while cost-per-ATC stays under target**; breach → hold/rollback. **Daily loss cap.** Fast-kill losing
   ads on leading indicators (spend ~1–1.5× target cost-per-ATC with 0 ATC → cut).

## P4 — Cheap page insurance (parallel, low-risk, prepared on branch)
Ship a working mobile **sticky add-to-cart** (fixes the 97% reachability defect). Regression guard:
`tests/kryo-atc-tracking.spec.ts` must pass (sticky/above-fold control present). Deploy with approval.

## P5 — Demand agents (run once volume exists to test against)
- `customer-avatar`: populate from the 5 real buyers + a fresh Meta demographic breakdown sync; validate
  the draft (skeptical UAE male ~35–54, mobile, Instagram). Label n and confidence.
- `consumer-psychology`: pull the winner ad creative; score **pre-frame / message-match** to the LP first
  screen (Tom wants this tested); audit objection stack incl. the **30-day dispatch wait**.
- `performance-economics`: verify 3-month ROAS (reconcile the revenue source) and **buying-cycle length**
  — if multi-day/multi-touch, first-session CVR is the wrong KPI; use assisted conversion + add retargeting.

## P6 — Validate + report (fixed shape)
`npm run build` + `tsc --noEmit` + tests; scripts resolve; markdown links valid; diagnosis passes the
protocol self-check. Report: push SHA/URL; what's prepared vs deployed; the predictability dashboard;
**Tom decisions** (approve push; fill economics; approve restart + objective switch + budget; confirm
winner ad id) vs **agent actions ready on approval**. Confirm: main not merged; no prod changed without
approval; no work discarded.

## Approval gates (never cross without Tom)
Git push · deploy to Vercel/prod · live Shopify theme/product change · **Meta objective/budget/restart or
any spend change** · production Supabase schema/policy change.

## The one-line strategy
Fix tracking → optimise for ATC → restart the winner in a Scaling/Testing structure → scale in small
steps gated by leading indicators, under a daily loss cap. That converts "can't risk 14 dark days" into
confident, evidence-gated scaling — and gives volume, which every other improvement needs to be testable.
