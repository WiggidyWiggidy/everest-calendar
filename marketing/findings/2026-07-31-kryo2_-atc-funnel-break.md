# 2026-07-31 — kryo2_ add-to-cart funnel break (protocol-compliant diagnosis)

Ran under `diagnostic-protocol.md`. Sources bound per `source-of-truth.md`. Sample caps applied.

## Step 1 — Facts (confirmed from sources, not inferred)
- **kryo2_ go-live-to-traffic ≈ 2026-07-26** (data-derived, high confidence): real external Meta PDP
  sessions were ~0/day through Jul 25, then 21 (Jul26), 31, 45, 33, 34, 16. Matches Tom's "last 7 days".
  Corrects the earlier wrong assumption of Jul 6. Status ⚠️→ pending Tom's one-word confirm.
- Old page (kryo2) was the live page before that.
- "Is add-to-cart gated by model selection?" — still ❓ UNCONFIRMED (Tom believes not). Discriminating
  test named below.

## Step 3–5 — Three-source triangulation, kryo2_ live window Jul 26–31 (~180 real Meta sessions)
| Source (independent) | Add-to-cart | Checkout |
|---|---|---|
| First-party pixel (`attribution_touches`) | ~0–1 | 0 |
| Meta pixel (`meta_ad_metrics_daily`) | ~1 | — |
| **Shopify server-side (`shopify_funnel_daily`)** | — | **0 started, 0 completed** |
| Old page (Jun1–Jul25), Shopify | — | **7 started, 6 completed** |

**Reconciliation:** all three independent sources agree the new-page funnel produced ~0 adds and
**0 server-side checkouts**. Shopify checkout is server-side and cannot be blocked by a mobile pixel,
so this is **not** a tracking artifact. The old page produced 6 completed checkouts. → the new page
funnel is failing at or before add-to-cart.

## Findings (labelled)
- **FACT:** kryo2_ went live to real traffic ≈Jul 26; ~180 real Meta PDP sessions Jul26–31.
- **PATTERN (cross-validated, 3 sources):** new-page funnel produced 0 server-side checkouts vs old
  page's 6. Funnel breaks at/before add-to-cart. *Sample caveat: 0 conversions on ~180 sessions has
  a wide interval, but 3-source agreement + old-page contrast make the "material suppression" real.*
- **HYPOTHESIS (research-grounded, needs live confirm):** the two-model variant-picker buy flow has
  the documented custom-theme bug where Add-to-Cart is disabled/broken on variant selection, so
  mobile users cannot complete the add. Matches multiple Shopify community reports of this exact failure.
- **FACT (tracking, secondary):** theme fires no Meta browser pixel (`fbq` absent); first-party
  relies on `Shopify.analytics` + a `/cart/add` fetch hook. So ATC is under-instrumented even when it
  works — but this is secondary to the server-side-confirmed funnel break.
- **UNKNOWN:** WhatsApp lead volume (off-site, `kryo_leads`=0). The 4 messages Tom received are untracked.

## Step 8 — Red-team + discriminating test
Strongest case against the bug hypothesis: 180 sessions of cold traffic could genuinely convert
<1%, making 0 adds unlucky-but-possible (Poisson P(0) at 2% ≈ 3%). Cannot rule out "genuinely low
demand + small sample" from data alone.
**Discriminating test (definitive):** live-page test on mobile via Claude Code + Playwright —
load kryo2_, attempt add-to-cart with and without selecting a model; observe (a) button enabled?
(b) `/cart/add` returns 200 with a real line? (c) cart count increments? If the add fails/disabled →
bug confirmed. If it works cleanly → falsified, problem is behavioral/traffic. This also settles the
open "is it gated?" fact.

## Where precisely the funnel fails
Impression → click (cheap, healthy) → landing/engagement (good; deep scroll) → **ADD-TO-CART = break
point** → checkout (0) → purchase (0). The leak is the add-to-cart step on the new page.

## Recommendations (Owner decision vs agent action)
- **Tom decision:** revert ads to the old page (kryo2) to stop the bleed — it has 6 proven checkouts;
  then fix the new page and re-test. (Fastest positive-EV move; data-backed.)
- **Agent action after approval:** (1) run the live Playwright test to confirm/refute the ATC bug;
  (2) if confirmed, fix = preselect a default model so the buy button is always live + add a working
  mobile **sticky add-to-cart** (research: +12–25% mobile ATC on long high-ticket pages); (3) wire
  Meta CAPI + fix pixel (secondary); (4) instrument WhatsApp lead capture. All prepared on branch,
  no live deploy without approval.

## Self-check
- [x] No fact inferred; launch date derived from data + flagged for confirm.
- [x] Paid verdict uses Shopify server-side + Meta, not first-party alone.
- [x] Sample cap honoured — no ATC *rate* verdict stated on 0–1 conversions; labelled PATTERN/HYPOTHESIS.
- [x] Sources reconciled (3-way); tracking-vs-real separated by server-side check.
- [x] Tom's "not gated" belief flagged as open, not overridden; discriminating test named.
- [x] Red-team + falsification test stated.
