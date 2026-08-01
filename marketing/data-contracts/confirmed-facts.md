# KRYO B2C — Confirmed-Facts Register

**Facts here are either CONFIRMED (by Tom or a definitive system source) or they are UNKNOWN.**
The agent may NOT infer a fact from data timing, file dates, or memory. If a decision-critical
fact is UNKNOWN, the diagnosis STOPS and asks Tom.

Legend: ✅ CONFIRMED · ❓ UNKNOWN / NEEDS CONFIRMATION · ⚠️ ASSUMED (unverified, do not rely on)

## Facts the agent got wrong on 2026-07-31 (seeded here so they are never guessed again)
| Fact | Status | Value / question | Why it matters |
|---|---|---|---|
| kryo2_ (new page) go-live date | ❓ | Tom says "last ~7 days" (≈2026-07-24?). **Need exact date.** | Every old-vs-new comparison is invalid without it. The agent wrongly assumed ~Jul 6. |
| Cart-tracking valid windows | ❓ | May–early June 2026 tracked cart **incorrectly** (Tom). Need exact bad window + what was wrong. | Those ATC numbers may be inflated/invalid. |
| Which page each ad pointed to, by date | ❓ | Map ad-set → landing page over time. | Can't attribute Meta metrics to a page without it. |
| Is the add-to-cart gated by model selection? | ❓ | Tom believes NOT gated. Must verify on the live page (Playwright). | Agent asserted "gated" without checking. |
| First-party pixel deploy date on each page | ❓ | When did `everest-attribution-pixel` go live on old vs new page? | Determines when first-party ATC is even meaningful. |

## Business facts (confirm current values against source-of-truth docs)
| Fact | Status | Value |
|---|---|---|
| Product / price | ⚠️ | AED 3,990 (from `marketing/foundation/offer.md`) — confirm still current |
| Target geo | ⚠️ | Dubai / UAE (ads) — confirm |
| Primary paid objective | ❓ | Purchase? Add-to-cart? Lead? — confirm what campaigns optimise for |
| Definition of a "lead" | ❓ | WhatsApp message sent? Deposit? Phone captured? — confirm |
| Account currency | ⚠️ | AUD (from `.claude/meta/account-context.md`) — confirm |

## Known internal/test identities (keep current)
| Identifier | Status | Note |
|---|---|---|
| `elv_1779869995748…` | ⚠️ | 89 sessions across TH/SG/JP — assumed team/Tom. Confirm. |
| `elv_1779806210806…` | ⚠️ | 57 sessions, myshopify referrer — assumed backend/preview. Confirm. |
| referrers `myshopify.com`, `admin.shopify.com` | ✅ | backend/preview traffic — exclude |

## How to use
- Before diagnosing, the agent lists which of these it needs and their status.
- Any ❓ that is decision-critical → **STOP and ask Tom**; record the answer here (with date).
- Never promote ⚠️ to ✅ without an explicit confirmation.

## KRYO sales record — CONFIRMED 2026-07-31
| Fact | Status | Value |
|---|---|---|
| KRYO unit sales, lifetime | ✅ CONFIRMED (Tom + API) | **5** — Feb A$1,500 · Mar A$4,600 · Jun A$1,540.92 · Jun A$1,541.81 · Jul A$1,566.09 |
| Total KRYO revenue | ✅ | **A$10,748.82** |
| KRYO AOV | ✅ | **A$2,149.76** |
| MER (revenue / A$1,023.83 spend) | ✅ | **10.50x** |
| CPA per KRYO unit | ✅ | **≈A$205** (n=5, directional) |
| Small orders A$213.99 / A$114.99 | ✅ CONFIRMED (Tom) | **Replacement parts. EXCLUDE from acquisition maths.** |
| Feb/Mar sales visible via API? | ✅ | **No** — 60-day scope limit. Tom-attested. |
| Account + shop currency | ✅ | **AUD** |
