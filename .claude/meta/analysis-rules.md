# Decision rules

## Evidence hierarchy

1. Business economics and verified purchase value
2. Purchase/CPA/ROAS with adequate spend and data maturity
3. Funnel evidence: LPV, ATC, checkout and purchase rates
4. Traffic evidence: link CTR, CPC and LPV rate
5. Delivery evidence: CPM, reach, frequency and spend allocation

Do not let a lower-level metric overrule adequate purchase evidence without a clear causal reason.

## Diagnose before recommending

Classify the primary issue as one or more of:

- Delivery: rising CPM, constrained delivery, audience saturation or allocation
- Creative: falling link CTR, rising CPC, weak hook or fatigue
- Click quality/page load: clicks not becoming LPVs
- Landing page/offer: LPVs not becoming ATCs/checkouts/purchases
- Checkout: ATCs/checkouts not becoming purchases
- Measurement: event, attribution, deduplication or reporting issue
- Insufficient evidence: spend/conversions too low or window incomplete

## Decision confidence

- High: adequate spend/conversions, stable comparison and direct purchase evidence
- Medium: strong funnel evidence but limited purchase volume, or one material confounder
- Low: small sample, incomplete day, recent major change, mixed attribution, or tracking concern

Every action recommendation must include confidence and the evidence that would falsify it.

## Scaling and pausing

Use thresholds from `account-context.md`, not universal rules.

- Scale only when performance clears the target with enough purchases and no obvious one-day distortion.
- Prefer incremental changes consistent with the configured budget-change constraint.
- A no-purchase object becomes a pause candidate only after meaningful spend relative to target/break-even CPA, unless upstream metrics are catastrophically broken.
- Protect controlled tests from premature edits. Note learning status and recent changes where available.
- Do not recommend changing audience, creative, budget and landing page simultaneously when causal learning matters.
