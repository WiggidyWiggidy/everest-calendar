# Experiment Launch Playbook (multi-agent, gated)

For any live experiment — restart/scale ads, new ad angles, an LP split test, a budget step. A launch is
a **coordinated pipeline**, not one agent's call. Each gate is *produced* by one lens and *challenged* by
a different one before it advances. Nothing is "done" until every gate is green, red-team failed to break
it, and Tom approved the live/spend parts. Bind to `evidence-standards.md`, `experiment-standards.md`,
`source-of-truth.md`. Orchestrated by `conversion-diagnosis-loop.md`; log everything to the findings ledger.

## Principle: no self-certification
The agent that builds a stage cannot be the one that passes it. Every gate has a **producer** and a
**challenger** (a different lens whose job is to break it). Any gate can send the launch back to an
earlier one. Surface UNKNOWNs; never paper over.

## Roles
- **performance-economics** — is this worth doing (expected profit), what's the highest-value metric, what's break-even.
- **design-experiment** — the Experiment Card (hypothesis, primary metric, MDE, sample, time-to-significance, win rule).
- **customer-avatar + consumer-psychology** — the angle/message/offer (who, objection, pre-frame/message-match).
- **meta-ads-expert** — objective, structure, budget step as a hypothesis, kill/scale rules.
- **page-builder** — builds LP variant (draft); **campaign-operator** — builds ads (paused).
- **live-ux-tester + code-tracking-auditor** — QC: render, reachability, tracking firing.
- **red-team-verifier** — attacks every gate; holds the final sign-off.
- **Tom** — approves anything that spends or goes live.

## Gates (each: PRODUCE → CHALLENGE → pass/return)
**G0 Frame & prerequisites** — state the decision + which binding constraint this attacks. Prereqs green:
tracking (`facebook.com/tr` + CAPI landing ATC in Test Events), AOV confirmed from Shopify, branch pushed.
*Challenge:* any prereq red → STOP, no launch.

**G1 Design** — Experiment Card (experiment-standards Rule 2): hypothesis · **primary metric + why it's
highest-value** · guardrails · baseline+MDE · **required sample + time-to-significance** · pre-registered
win/kill rule · rollback. At low volume, primary = highest-funnel metric with adequate n; purchase = guardrail.
*Challenge (red-team):* is the metric right? is the sample reachable in the window? confounds? → return if not.

**G2 Angle & message** — creative angles + LP hypothesis grounded in avatar + objections; **pre-frame /
message-match** between each ad and the page it lands on. Max 1–3 variants (no confounding).
*Challenge (consumer-psychology + red-team):* does the ad promise match the page? one variable per read?

**G3 Build** — page-builder builds LP variant as **DRAFT** + wires experiment assignment (persists across
visits); campaign-operator builds ads **PAUSED**. Nothing live yet.
*Challenge:* control untouched? variant IDs clean (no foreign-ID)? assignment actually persists?

**G4 QC (mandatory, blocks launch)** — operator pre-launch QC + live-ux-tester:
dispatch/shipping date current & consistent ad↔page · UAE served **AED** · scarcity/stock claim real ·
WhatsApp `+447724709585` · tracking (ATC/CAPI) firing on the variant · buy control reachable (Playwright
passes) · no 404s · ad↔page offer consistent.
*Challenge:* re-run independently; any fail → back to G3.

**G5 Red-team sign-off** — attack the whole launch: sample math (Poisson/CI on small n), traffic-mix
confounds, stale data, "what else explains this," downside if wrong. Must FAIL to break it to proceed.

**G6 Tom approval** — present one packet: hypothesis, primary metric, expected profit, time-to-significance,
QC result, budget + daily loss cap, win/kill rule. Tom approves go-live / spend / publish.

**G7 Execute & monitor** — Tom flips ads live / approves publish; operators handle mechanics. Watch leading
indicators daily vs thresholds; **auto-pause losers** on the kill rule; budget steps only per the staged rule.

**G8 Conclude (only when earned)** — read ONLY at the pre-registered sample/time. State significance on the
primary metric, or "inconclusive — extend/stop." Write predicted-vs-actual to `hypothesis_learnings`;
update avatar/winning-hooks + calibration log. A result before the pre-registered n is not a conclusion.

## Definition of LAUNCHED
G0–G4 green · G5 red-team failed to break it · G6 Tom approved. (Built = not launched.)

## Definition of CONCLUDED
Pre-registered sample/time reached · primary-metric significance stated (or explicit inconclusive) ·
guardrails checked · learning written. Never conclude on small-n or before the plan's n.

## Question-before-done rules
- Every gate challenged by a different lens; producer never self-passes.
- Every number: source · window · n · precision capped (experiment-standards Rule 1).
- Every launch names its UNKNOWNs and what would falsify its hypothesis.
- The loop keeps going (re-gate) until LAUNCHED/CONCLUDED is truly met, or escalates a specific blocker to Tom.

## Agent assignment (the four operators the diagnosis loop does not invoke)

The diagnosis loop covers the analytical lenses. These four are reachable only here — if a
procedure never names an agent, that agent is dead code:

| Gate | Agent | Produces |
|---|---|---|
| Angle / message-match | `creative-testing` | ranked creative hypotheses, each with a falsification test |
| Customer language | `voice-of-customer` | verbatim quotes + stated objections, with counts |
| Build (page) | `page-builder` | DRAFT variant + QC evidence |
| Build (ads) | `campaign-operator` | PAUSED ad objects + go-live packet |

Both builders are **build-only**: draft and paused respectively. Neither may publish or set live.
`red-team-verifier` gates the card before build, and is blocking.
