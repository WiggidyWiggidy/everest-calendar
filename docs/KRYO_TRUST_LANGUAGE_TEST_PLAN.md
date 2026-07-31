# KRYO Trust-Language Test — Full Plan (for Tom's approval)
**Date:** 2026-07-06 | **Experiment:** `88b8f027` (marketing_experiments, hypothesis updated to language-only Phase A)
**Control:** https://everestlabs.co/products/kryo2 (untouched) | **Treatment:** https://everestlabs.co/products/kryo2_
**Status:** PLAN — nothing builds until Tom approves the plan; nothing goes live until Tom approves the build.
**SUPERSEDED 2026-07-14:** the batch facts below ("25 units," "ships July 15") are from the original draft. What's actually live on kryo2_ is 5 units, dispatches August 30, plus a WhatsApp concierge (3 glyph placements) and no founder name on-site — see docs/KRYO_WHATSAPP_PLAYBOOK.md and docs/KRYO_COPY_CONSTITUTION.md for current facts and rules. Treat this file as historical reasoning, not current spec.

---

## 0. Strategy in one paragraph

The funnel currently impersonates an established brand (deadline discounts, review blocks, "almost full") while being verifiably new — the mismatch is what the auditing buyer's gut flags in the cart (89.3% cart exit, 24s median, chat clicks 3× checkout clicks). Phase A tests **language only**: confess newness first and convert it into the buyer's advantage (founding batch, founder access, reasoned pricing). Same page architecture, same images, same sections — only the words change. Tom's demo video is **Phase B**, added to the winner later, so the language effect reads clean.

## 1. Exact page changes on kryo2_ (7 changes, everything else identical to control)

| # | Element | Control says | kryo2_ will say |
|---|---|---|---|
| 1 | Announcement bar | "AED 1,500 OFF APPLIED \| OFFER ENDS FRIDAY" | "FOUNDING BATCH — [N] OF 25 UNITS — SHIPS JULY 15" |
| 2 | Hero ship-line | "Ships July 15 \| July Dubai batch almost full." | "First Dubai batch: [N] of 25 units remaining. Ships July 15." |
| 3 | Price block | "ONLY AED 3,990 TODAY" | "Founding batch price: AED 3,990. Batch 3 lists at AED 5,490." |
| 4 | Reviews section (the 3 placeholder quotes) | "Early KRYO feedback…" + 3 unverifiable 5-star quotes | **Provenance block** (full copy §2) — reuses the same section slot so the existing `reviews_section_view` pixel event becomes the provenance-view metric |
| 5 | Guarantee | "If it does not help you move from half-awake to switched on, we'll collect it and refund" | "30 days in your own bathroom. Any reason, or no reason: message us, full refund, and we arrange the pickup. You pay nothing for the return." + signed with founder name |
| 6 | Chat CTA | "Chat with a KRYO Expert Now" | "WhatsApp Tom — the founder. Replies fast." (fallback if no WhatsApp: "Ask us anything — a human replies, usually within the hour") |
| 7 | All other scarcity strings | "almost full" instances | removed |

## 2. The provenance block (final copy, passes constitution §1–§5)

> ### No reviews yet. Here's why — and what you get instead.
>
> KRYO is new. The July batch is the first 25 units we're shipping in Dubai. We could fill this section with five-star quotes you can't verify. Instead, here's what buying from the first batch actually gets you:
>
> **A direct line to the founder.** My personal WhatsApp is on this page. Ask the awkward questions — power, water, installation, returns.
>
> **A serial number under 25.** First-batch units are checked individually before they ship.
>
> **A guarantee I answer for personally.** 30 days in your bathroom. Any reason, full refund, we arrange the pickup.
>
> **Founding pricing with a reason.** Batch 3 will list at AED 5,490 with a longer wait. The first 25 buyers get AED 3,990 — and my number.
>
> — Tom, founder, Everest Labs [photo]

## 3. The matching ad (scent continuity — copy change only, same winning image)

Clone of winner ad `120249120433950279`, same creative asset, same ad set, destination `kryo2_` with `utm_content=trust_language`. Lands **PAUSED**.

**Primary text:**
> I'm Tom. I make KRYO — a cold shower system that chills its own water to 1°C, built for Dubai bathrooms. No tub, no drilling, no plumbing.
>
> We're new. You won't find hundreds of reviews. What I can give you instead: a 30-day any-reason refund, and my personal WhatsApp for the awkward questions.
>
> First Dubai batch: 25 units, ships July 15. Founding price AED 3,990 — batch 3 lists at AED 5,490.

**Headline:** "First Dubai Batch — 25 Units — AED 3,990" | **CTA button:** Learn More (considered purchase, not Shop Now)

Control ad continues unchanged → kryo2. Traffic split = two ads in one ad set; if Meta starves either arm below 30% of LPV for 3+ consecutive days, I duplicate into equal-budget ad sets to force the split (staged for approval like everything else).

## 4. Build sequence (after plan approval — all staged, nothing live)

1. Make kryo2_ purchasable (it currently shows Sold out — publish + inventory for AE market; confirm AED 3,990/5,490 pricing renders)
2. Apply the 7 changes via `kryo/update-page` slot edits + `update-body-html` (every change logged in `kryo_page_change_log` → one-call rollback)
3. Run **kryo-copy-gate** on every new string; attach PASS verdicts to the approval card
4. QC: AE-market render check (Dhs prices, no AUD), mobile layout, pixel verification (internal-flagged session must appear in `vw_kryo_intent_daily` under `/products/kryo2_`)
5. Stage the trust ad (paused) + clone-ad-qc PASS
6. Lighthouse both pages (mobile) — variant must be within 10 perf points of control
7. Deliver ONE approval card: screenshots, gate verdicts, QC results, the go-live switch

## 5. Measurement — proving "desire" fast (bootstrapped budget, ~25 LPV/day total)

**Primary:** ATC-session rate per variant (`vw_kryo_intent_daily`) + Meta ATC/LPV per ad (baseline 14.07%).
**Desire panel (daily brief, pooled):** median dwell (22s), scroll90 (26.4%), provenance-view rate (vs reviews-view 0% control — any engagement is upside), hero CTA (26.5%), cart-view (27.7%), cart→checkout (7.2% pre-fix), WhatsApp/chat clicks, returning share (7.4%).
**Guardrails:** ATC/LPV must not sit >30% relative below control sustained; `atc_failed_sessions` = 0; no perf regression.

**Decision timeline:**
- **Day 3 sanity gate:** variant receiving traffic, pixel rows present, no ATC failures, currencies correct → continue or halt
- **Day ~8 (≥100 LPV/arm):** first directional read — desire panel deltas with noise labels
- **Runaway early-stop:** if variant ≥2× control on primary with ≥150 LPV/arm, chi-square (`compute_significance` RPC) p<0.05 → call it early
- **Day ~30 (≥395 LPV/arm):** full verdict at 80% power for +50% relative; result + predicted-vs-actual written to `hypothesis_learnings`
- Daily 07:00 brief reports both arms throughout; weekly digest adds per-ad post-click quality (the trust ad is allowed to lose CTR if it sends better traffic)

**Rollback:** ad pause (instant) + `kryo_page_change_log` rebind (one call). Control is never touched, so worst case = variant off, zero impact on live funnel.

## 6. Inputs needed from Tom at build time (not blockers to approving the plan)

1. **Real batch size** — is 25 true? The counter must be real and maintained (constitution: no fake scarcity)
2. **Founder presence** — name "Tom" public? Photo? Personal WhatsApp number on the page, or fallback wording?
3. **Returns logistics** — can you truthfully commit to "we arrange the pickup, you pay nothing"? (Copy-gate flagged this; the wording above is the softer, likely-true version — confirm or I soften further)
4. **Batch-3 price commitment** — "lists at AED 5,490" is a forward promise; only ships if you mean it (it matches the current compare-at, so it's plausible — but it must be a real intention)
5. **kryo2_ ownership** — confirm Codex hands the page to me for this test (no concurrent edits during the run, or the variable isn't clean)
