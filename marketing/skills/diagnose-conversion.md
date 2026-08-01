# Skill: diagnose-conversion

Rigorous, auditable KRYO B2C conversion diagnosis. Use whenever asked why add-to-cart, checkout,
WhatsApp lead, or purchase rates are what they are, whether a landing-page/ad change helped or hurt,
or before recommending an experiment. Enforces the evidence standards + data contracts so
conclusions are labelled and checkable, not confident guesses.

(If skill loading from `.claude/skills/` is enabled, mirror this there; that path is
write-protected in some sessions, so this canonical copy lives under `marketing/skills/`.)

## When to run
"Why is <funnel metric> low/dropping", "did <change> help or hurt", "should we restart ads",
"what should we test next".

## Load first (do not skip)
1. `.claude/rules/evidence-standards.md` (binding)
2. `marketing/data-contracts/source-of-truth.md`
3. `marketing/data-contracts/confirmed-facts.md`
4. `marketing/data-contracts/diagnostic-protocol.md`

## Process
Run `diagnostic-protocol.md` Steps 0–9 in order, honouring every HARD STOP. Non-negotiables:
- Canonical source per metric — paid add-to-cart = Meta `meta_ad_metrics_daily`, never first-party.
- Confirm facts (launch dates, config, tracking validity) — never infer from data timing.
- Exclude internal/test traffic before any funnel number.
- Sample caps: ≤2 conversions → no verdict; <10 → directional; <30 → not FACT.
- Reconcile disagreeing sources before concluding; never silently reverse a prior finding.
- Red-team + name the discriminating test before presenting.

## Output
Labelled findings (source · window · n · exclusions), explicit UNKNOWNs, the discriminating next
test, and Owner-decisions vs agent-actions separated. Write to `marketing/findings/` as a dated entry.

## Failure behaviour
- UNKNOWN decision-critical fact → STOP, ask Tom, record answer in confirmed-facts.md.
- Source in KNOWN-BAD window / out of contract → label UNVALIDATED, do not conclude.
- Sample below threshold → "insufficient data" + how much is needed. No forced verdict.
- Live-page mechanism unverifiable here → hand to Claude Code + Playwright; label HYPOTHESIS meanwhile.

## Approval boundaries
Read-only analysis is autonomous. Any code/experiment/theme/campaign change is prepared on a branch
for Tom's approval — never deployed. No production writes.
