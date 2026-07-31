# Metric Definitions — pointer

The canonical dictionary is **`marketing/data-contracts/metric-definitions.md`**.

Rules:
- Every skill, command and report uses those definitions verbatim.
- Silent redefinition is prohibited — including changing a denominator.
- Superseded: `marketing/analytics/metric-definitions.md` and `.claude/meta/metric-dictionary.md`.
  Those two remain valid **only** for mapping Meta platform API fields; they may not
  define funnel rates.
- Session eligibility (§0) — including the mandatory `everestlabs.co` host filter that
  excludes Shopify theme-preview traffic — applies to every metric without exception.
- A metric listed as unmeasurable (§4) is reported as UNKNOWN, never proxied.
