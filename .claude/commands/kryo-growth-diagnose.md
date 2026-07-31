---
description: Evidence-backed KRYO B2C conversion diagnosis from live Supabase data. Validates freshness, reads prior learnings, computes the canonical funnel, isolates the dominant loss, and ranks at most three experiments.
---

# /kryo-growth-diagnose

Produce a conversion diagnosis grounded in measured data.

**Never open with generic CRO advice.** If you have not yet run step 3, you have nothing
to say. Findings come from this repository's data or they are not reported.

Load first: `.claude/rules/evidence-standards.md`,
`marketing/data-contracts/metric-definitions.md`,
`marketing/data-contracts/source-inventory.md`.

---

## Step 1 — Validate source freshness

Query max timestamps for every source in `source-inventory.md`. Print a freshness table.
Mark each source usable / directional / unusable.

**Halt and report** if `attribution_touches` is more than 48h stale — the whole diagnosis
rests on it. Do not substitute another source.

## Step 2 — Read prior findings before proposing anything

```sql
select * from marketing_findings order by refreshed_at desc limit 20;
select * from marketing_learnings order by created_at desc limit 20;
select * from marketing_experiments order by created_at desc limit 20;
```

Do not propose an experiment that duplicates a completed or rejected one. Say what was
already learned and how the new proposal differs.

## Step 3 — Compute the canonical funnel

Apply §0 eligibility **including the `everestlabs.co` host filter**. Session grain.
Compute per §2: engaged rate, CTA click, cart request, add-to-cart, `cta_to_cart_request_rate`,
WhatsApp click, checkout start.

**Always split by device.** A blended figure is not permitted as a headline.

## Step 4 — Identify the largest commercially meaningful drop

Rank stage transitions by absolute lost sessions, not by percentage alone. A 90% drop on
12 sessions matters less than a 60% drop on 700.

## Step 5 — Segment

Mobile vs desktop · new vs returning · landing page · Meta campaign / ad set / ad ·
creative or message angle where available · product variant · date cohort.

**Report sample size in every cell.** Cells under 30 sessions are directional only.

## Step 6 — Compare higher- and lower-intent sessions

Contrast sessions reaching `scroll_depth_90` or a CTA click against those that do not.
What distinguishes them — device, source, page, entry point?

## Step 7 — Clarity evidence

Pull `clarity_friction_elements` and `clarity_section_heatmap` for the affected pages and
devices. Use for friction only, never as a conversion source.

## Step 8 — Separate landing-page friction from checkout friction

Assign the loss to a stage:
- **pre-CTA** — users never ask to buy → page/message problem
- **CTA-to-cart** — users ask but the cart does not accept → functional/tracking problem
- **cart-to-checkout** — cart accepted but checkout not started
- **in-checkout** — Shopify stage

This distinction determines whether the fix is copy or code. Getting it wrong wastes a cycle.

## Step 9 — Research only the observed problem

No broad audits. Investigate the specific mechanism behind the identified drop.

## Step 10 — Rank at most three experiments

Per `.claude/rules/experiment-governance.md`. If the dominant loss is a **measurement or
functional defect**, the correct output is a fix plus verification — **not** an A/B test.
Say so plainly rather than manufacturing three experiments.

## Step 11 — Output

Write to `marketing/reports/investigations/YYYY-MM-DD-<slug>.md`:

1. **Executive diagnosis** — 5 sentences maximum
2. **Canonical funnel** — table, device-split, with sample sizes
3. **Dominant loss** — stage, magnitude in sessions, confidence
4. **Responsible cohorts**
5. **Supporting data** — queries inline
6. **Behavioural evidence** — Clarity
7. **Alternative explanations** — at least one, with what would distinguish them
8. **Missing evidence** — what you could not measure and why
9. **Owner decision** — what Tom must decide
10. **Claude implementation actions** — what runs after approval
11. **Measurement plan** — how the fix is verified

Then append a row to `marketing_findings`.

## Failure behaviour

If a required source is unusable, state which conclusions are consequently unavailable and
produce the diagnosis for the remainder. Never fill a gap with an assumption or a benchmark.
