# Scaffolding audit — will this build multiple setup-guide pages first time?

**2026-08-01. Audit against agent-reliability best practice + what we learned from the 13 agents.**

Short answer: **not yet, and the biggest blocker is not the agents.**

---

## Part 1 — measured state of the 13 agents

| Property | Result | Verdict |
|---|---|---|
| Description length (routing quality) | 228–323 chars, all well above the ~120 weak-routing threshold | **PASS** |
| Tool scoping (least privilege) | 2–5 tools each, no agent has `*` | **PASS** |
| Deterministic output contract | 13/13 carry OUTPUT SCHEMA | **PASS** |
| Explicit failure/refusal behaviour | 13/13 | **PASS** |
| **Worked example (input → output)** | **1 of 13** | **FAIL** |
| **Idempotency / resumability** | **0 of 13** | **FAIL** |
| Producer ≠ verifier | enforced (red-team blocking, live-ux-tester verifies) | PASS |

The two failures are precisely the two that matter for a **multi-item batch job**.

### Why "no worked example" breaks first-time success
An agent with a schema but no example infers the format. Across N pages that inference drifts —
page 1 and page 5 come out structurally different. A single concrete input→output pair is the
cheapest reliability upgrade available and the one we skipped 12 times.

### Why "no idempotency" is dangerous here
Every page-creation route **creates a Shopify product**. With no "already exists → skip" contract:
- a retry after a partial failure creates **duplicate live products**
- a resumed run cannot tell page 3 from page 3-attempt-2
- there is no manifest recording which of N pages are done

For a single A/B clone that was tolerable. For 6 setup guides it is a live-store hazard.

---

## Part 2 — the actual blocker: the content does not exist

I searched `product_context` (112 rows). **There is no setup or installation content.**
The corpus is manufacturing, CAD, suppliers, sourcing — the B2B side.

The only adjacent material is `research_self_service` (2026-04-05), which covers **service and
parts**, not first-time setup:
- three service tiers (customer-replaceable / video-guided / ship-new-unit)
- four parts kits with costs
- WhatsApp support with a 3-question diagnostic
- a reference to a **"7-step Quick Start card"** — *the reference exists; the seven steps do not.*

**If an agent is told to write setup guides today, it will invent the steps.** That is the exact
failure mode this whole session has been about, and no amount of agent scaffolding prevents it —
an agent cannot validate an instrument that does not exist.

**This is a content-supply problem, not a tooling problem.**

---

## Part 3 — what else is missing for multi-page specifically

| Gap | Consequence |
|---|---|
| No **page manifest** (list + status per page) | run is not resumable; no way to see 4 of 6 done |
| No **sibling-consistency contract** | page 5 drifts from page 1 in structure and tone |
| No **pilot-first rule** | 6 pages built on an unproven pattern, 6 to redo |
| **Brand contract is post-hoc only** | `qc-checklist.md` scores *after* build; the writer never sees the rules first |
| Setup guides are **Shopify pages, not products** | the whole existing pipeline clones *products*. Untested for `/pages/*` |

That last one is important and easy to miss: `/clone-product` and its three routes operate on
**products**. A setup guide is a **page**. The existing, validated pipeline may not apply at all.

---

## Part 4 — the stale-control problem, again

`kryo_page_build_playbook_v1` (priority **critical**, active, 13.9 KB, updated 2026-05-04) is the
authoritative build playbook and contains genuinely hard-won rules:
- do **not** compose `body_html` via `src/lib/page-sections/*` — renders narrow, abandoned 30 Apr
- do **not** clone product `9331613204788` — stuck per-market template binding
- always clone fresh from `kryo_`
- filter images on `tom_approved=true` — added 4 May *after shipping a variant with bad images*

**But it names `templates/product.nue-uae1.json` as the converting control.** The live page today is
`kryo2_` on template suffix `kryo2_`. The playbook is ~3 months stale on the single most important
fact it carries — and it is marked `critical`, so an agent will trust it.

This is the same failure as `kryo_image_slots` and `kryo_copy_slots`: **the era matches, so all
three are stale together.** Anything built from them targets a template nobody sees.

---

## Part 5 — what to do, in order

**Before any agent work:**
1. **Supply the content.** The seven Quick Start steps, per-model differences, what's in the box,
   the QR video. Without this the agents cannot succeed and should refuse.
2. **Confirm the page type.** Shopify *pages* or *products*? Decides whether the existing
   validated pipeline applies at all.
3. **Refresh the control fact** in the playbook (`nue-uae1` → the real current control), or every
   downstream step targets the wrong template.

**Then, scaffolding fixes (cheap, high leverage):**
4. Add **one worked example** to each agent that will touch this job.
5. Add an **idempotency contract**: check-before-create, and a manifest with per-page status.
6. Give the writer the **brand contract up front** (`brand-voice.md` + the 48-point checklist),
   not only as a post-build score.
7. **Pilot rule: build page 1 alone, QC it, get sign-off, then batch the rest.** One page proves
   the pattern; six pages prove nothing except that a mistake scales.

## Honest probability assessment
With the content supplied and fixes 4–7 in place: **high** for a batch of similar pages.
Without the content: **near zero** — the agents will produce confident, well-formatted,
invented setup instructions, which is worse than producing nothing.
