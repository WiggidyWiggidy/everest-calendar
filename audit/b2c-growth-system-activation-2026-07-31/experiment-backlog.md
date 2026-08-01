# KRYO Experiment Backlog — prepared 2026-07-31

**None of these is launched. None may launch without Tom's approval.**

---

## Gate: EXP-0 is not an experiment, and it blocks everything else

The brief asked for three experiments (landing-page macro-test, messaging test,
creative-to-page match). **Preparing them as A/B tests right now would be wrong**, and
saying so is more useful than complying.

All three would be measured on qualified-intent or add-to-cart. On mobile — 80% of traffic —
that metric currently reads **0.36%**, and the evidence says the cart itself is the failure
(`cta_to_cart_request_rate` 3% mobile vs 82% desktop). Any challenger page would also score
~0 on mobile. The test would return "no difference" regardless of how good the challenger is,
burn 2–3 weeks of traffic, and produce a false negative that discredits the winning variant.

`.claude/rules/experiment-governance.md`: *"A funnel stage that is not reliably tracked
cannot be an experiment's primary metric."*

The three experiments below are fully specified and **held** pending EXP-0.

---

## EXP-0 — Restore mobile add-to-cart *(fix, not experiment)*

- **ID:** KRYO-FIX-20260731-01 · **Priority: 1** · **Status: awaiting approval**
- **Problem (FACT):** `/products/kryo2` — desktop 10.4% ATC (77 sessions), mobile 0.18%
  (545 sessions). `cta_to_cart_request_rate`: desktop 82% (18/22), mobile 3% (1/30).
- **Step 1 — reproduction test (read-only, no production change):** load the page on a real
  mobile device, tap add-to-cart, check whether the cart updates and whether a
  `cart_add_request` row lands in `attribution_touches`. Resolves broken-vs-untracked.
- **Step 2:** fix on a branch per the outcome. No deploy without approval.
- **Primary metric:** mobile `cta_to_cart_request_rate`. Baseline 3%. Target ≥65%.
- **Guardrail:** desktop ATC must not fall below 10%.
- **Verification:** first-party events **and** `shopify_funnel_daily` checkouts both move.
- **Expected value:** ~100 recovered add-to-carts per 60 days at current traffic.

---

## EXP-1 — Landing-page macro test *(HELD)*

- **ID:** KRYO-EXP-20260731-01 · **Blocked by EXP-0**
- **Hypothesis:** stronger concrete proof and reduced purchasing uncertainty increase
  qualified intent versus the current page.
- **Control:** current `/products/kryo2`.
- **Challenger:** proof-and-certainty page — approved core outcome
  *"Step in tired. Step out switched on."*; real product-use video near the top; plain
  explanation of what KRYO does; real tester evidence; simplified model selection; explicit
  delivery/setup/trial/support terms; direct order CTA; reason-led WhatsApp pathway.
- **Audience:** UAE, mobile + desktop, paid_meta + direct. Assignment persisted by
  `anonymous_id`, 50/50.
- **Primary metric:** `product_page_add_to_cart_rate`. **Report add-to-cart and WhatsApp
  separately — never combined.**
- **Guardrails:** engaged-session rate must not fall >10% relative; page LCP must not regress.
- **Stop condition:** ≥400 sessions per arm or 21 days, fixed in advance.
- **Disproving evidence:** challenger ATC within ±15% relative of control.
- **Note:** do not implement the structure above blindly. Re-brief it against the post-EXP-0
  funnel — the real objection may differ from the assumed one.

## EXP-2 — Messaging / assisted-sales test *(HELD)*

- **ID:** KRYO-EXP-20260731-02 · **Blocked by EXP-0 and by WhatsApp lead capture**
- **Second blocker:** `kryo_leads` and `kryo_whatsapp_conversations` are **both empty**.
  The outcome metric does not exist yet. Lead capture must be deployed and verified first.
- **Hypothesis:** to be set from the strongest *observed* hesitation post-EXP-0 — candidates:
  model recommendation, allocation/availability, delivery certainty, setup certainty,
  trial/risk reversal, product proof. Not chosen until the data names it.
- **Primary metric:** qualified WhatsApp rate — currently **unmeasurable**.
- **Explicitly not:** a button-colour or micro-wording test.

## EXP-3 — Creative-to-page message match *(HELD)*

- **ID:** KRYO-EXP-20260731-03 · **Blocked by EXP-0 and by `meta_ad_breakdowns_daily`**
- **Second blocker:** breakdowns feed orphaned since 2026-05-17 (sync route deleted).
  Creative-level grouping is not currently possible.
- **Hypothesis:** ads whose promise matches the landing page produce higher downstream
  intent, not merely better click metrics.
- **Method:** group ads by promise / use case / message angle; compare downstream
  `product_page_add_to_cart_rate` per angle, not CTR.
- **Primary metric:** add-to-cart rate by angle.

---

## Sequencing

EXP-0 → verify recovery → **EXP-1 alone**.

EXP-1 and EXP-3 must not run simultaneously: EXP-3 changes which creative drives traffic to
the page EXP-1 is testing, confounding both. EXP-2 waits on lead capture regardless.
