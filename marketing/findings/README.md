---
depends-on: [site.buy_control_position, site.live_pdp, site.tracking_capi]
---

# KRYO Findings Ledger

Persistent record of conversion findings. **No silent reversals** — a finding is superseded only by
a new entry that cites it and reconciles the difference (which source, window, sample, why they differ).

Entry format:
```
## <date> — <finding title>
Label: FACT | PATTERN | HYPOTHESIS | UNKNOWN
Claim: <one line>
Source: <table> | Window: <start–end> | n: <sample> | Exclusions: <internal filters applied>
Reconciliation: <if this changes a prior finding, name it and explain the difference>
Discriminating test: <what would confirm/refute>
```

---

## 2026-07-31 — Corrections + current honest state of the kryo2_ conversion question
Label: UNKNOWN (analysis reset — prior confident claims retracted)

Retracted this session (all were made on unvalidated data / inferred facts):
- "Mobile add-to-cart is 0.14%" — from first-party pixel, which UNDERCOUNTS add-to-cart. Not a valid source for this. RETRACTED.
- "The old page never converted / both pages ~0 real Meta ATC" — first-party was blind to old-page adds. Meta's own data shows the old page tracked meaningful add-to-carts. RETRACTED.
- "kryo2_ launched ~Jul 6" — INFERRED, wrong. Tom: launched ~last 7 days (≈Jul 24). Every old-vs-new comparison built on Jul 6 is INVALID. RETRACTED.
- "The buy is gated by model selection" — asserted without checking the live page. UNCONFIRMED. RETRACTED.
- Cost-per-ATC verdicts ($9 / $15 / $60) — built on the above. RETRACTED.

Also unreliable: Meta `add_to_carts` in **May–early June 2026** — Tom reports cart tracking was wrong
then, so those counts are UNVALIDATED too.

Net current state: **the true old-vs-new conversion comparison is UNKNOWN** until:
1. confirmed exact kryo2_ launch date,
2. confirmed valid/invalid windows for cart tracking,
3. a clean recompute using only in-contract sources over a valid, post-launch window, with internal
   traffic excluded and sample-size caps applied,
4. live-page verification (Playwright) of the actual buy mechanism.

Next test: fill `confirmed-facts.md` with Tom, then re-run `diagnose-conversion` under the protocol.
Do not issue any cost-per-ATC or old-vs-new verdict before then.
