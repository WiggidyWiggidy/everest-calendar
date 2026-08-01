# Instrument validation — the missing contract

**This supersedes the per-error laws accumulated on 2026-07-31.** Those were symptom patches.
This is the root fix.

## The root cause of every wrong output this system has produced

Ten wrong claims were published on 2026-07-31. Every one shares a single mechanism:

> **A measurement was taken, and its output was reported as the state of the world,
> without the measuring instrument itself being validated.**

| Wrong claim | Instrument | Instrument defect |
|---|---|---|
| "6 checkouts = 6 sales" | `shopify_funnel_daily` aggregate | double-counts upsells |
| "July collapse, −80% orders" | monthly spend sums | 28 of 61 days had zero delivery |
| "AOV = A$2,000" | verbal figure ÷ unconfirmed count | both inputs unvalidated |
| "CPA A$177.51" | 3 orders | precision exceeds sample |
| "preview traffic = 24%" | host filter only | anon_id + referrer rules missing |
| "no orders before June" | Shopify `orders.json` | 60-day scope; 786 rows hidden |
| "main is at 6ead431" | local git ref | stale by 42 commits |
| "no sticky CTA bar" | DOM scan filtered on buy-words | bar reads "Choose Model" |
| "no WhatsApp links" | DOM scan filtered on link text | links are `wa.me` hrefs |
| "no merge conflicts" | `merge-tree` vs stale ref | computed on a stale input |

Existing rules all attack the **conclusion** — label it, cite n, red-team it.
**None attack the instrument.** So a filter that excludes its own target, a stale ref, a truncated
response and a double-counting aggregate each produced output that was confident, well-labelled,
correctly cited — and wrong.

**Red-teaming a conclusion drawn from a broken instrument validates the error.**

## The rule

> **No reading enters the evidence chain until its instrument passes validation.
> An unvalidated reading may never be labelled FACT.**

Instrument validation runs **before** interpretation, not after.

## The five checks (all mandatory, all cheap)

**1. COMPLETENESS — is this the whole result?**
Get an independent count and compare. `orders/count.json` vs array length. `count(*)` vs rows
returned. If they disagree → **TRUNCATED**. Report `n visible of N total`.
*Absence is never a finding from a bounded query.*

**2. FRESHNESS — is this reading current?**
Every cached or replicated source (git refs, DB aggregates, synced tables) must be refreshed
immediately before reading, or its as-of timestamp stated. `git fetch` before any ref comparison.

**3a. FILTER FIDELITY — can this query see its target?**
For any filtered/pattern-matched search, prove the filter can match a known-present instance
before concluding absence. A DOM scan filtered on "buy|cart" cannot find a button labelled
"Choose Model". **Enumerate first, filter second.**

**3b. FILTER COMPLETENESS — are ALL the canonical exclusions applied?**
Distinct from fidelity. A filter applying *some* required rules yields a confident, well-sampled,
wrong number. Check the filter against the canonical definition (`metric-definitions.md` §0 /
`marketing_touches_clean`: is_internal · bot · everestlabs.co host · team anon_ids · admin referrers)
before asserting it is complete.
*This check did not exist until the regression suite caught it letting a known-wrong claim through.*

**4. GRAIN & PROVENANCE — does this measure what I think?**
Name the exact source and grain. Is it an aggregate? Derived? What is its own known defect list
(`known-limitations.md`)? An aggregate is never evidence about the thing it aggregates until
reconciled with the source system.

**5. SAMPLE ADEQUACY — can this n support the claim?**
n≤2 → no rate, no verdict. n<30 → directional, no false precision (`≈A$180`, never `A$177.51`).
Precision must degrade with n *mechanically*, not by judgement.

## Derived claims
A claim built from other claims inherits the **weakest** validation state of its inputs.
"AOV = revenue ÷ orders" is only as good as the worse of the two. **Validate every input, or the
output is UNKNOWN.** It is never acceptable to derive a confident figure from unvalidated inputs.

## When a human contradicts the data
**Test the instrument before disputing the human.** The owner has context the API does not.
On 2026-07-31 the owner's sales history was correct and the API was blind; the system told him he
was wrong. That is the most expensive failure available here — it destroys trust in the tool and
in the human's own knowledge.

## Enforcement
Prose does not bind. Run the gate:

```bash
node marketing/evals/validate-claim.mjs --claim "..." --instrument "..." --n <int> [flags]
```

Exit 0 = may be published. Exit 1 = blocked, with the failing check named.
Every agent output carries an `instrument:` block. **Output without one is not evidence.**
