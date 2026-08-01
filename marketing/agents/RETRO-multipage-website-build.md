# Retrospective — multi-page website build, and how to run the next one better

2026-08-01. Four owner pages built from a 46-page design spec plus a content-population spec.
Written for the next multi-stage build, not as a status report.

---

## What worked, and why

**1. A specification that pre-makes the decisions.**
The single biggest factor. The spec supplied tokens, type scale, exact copy strings, section
order, and explicit "do not do this" lists. Most agent failures are invented judgement calls;
this spec removed almost all of them. It even carried its own anti-fabrication rule
(*"If a technical value is unresolved: DO NOT GUESS"*), which resolved a dozen micro-decisions
without a round trip.

**→ Next time:** ask for the spec's *forbidden* list as explicitly as its requirements. "Do not
add gradients / do not create seven pages / do not use old live pages for specs" prevented more
errors than any positive instruction.

**2. Building the design system first.**
`kryo-owner.css` was written before any page. Pages 2–4 then cost a fraction of Page 1 because
they inherited every token, button, card and warning component. The spec's own build order
(design system → benchmark page → the rest) was correct and worth obeying literally.

**3. One section serving multiple pages.**
Help and Safety are the same shape with different surfaces. One `kryo-owner-content.liquid` with
a `surface` setting covers both. Two more pages of that type would now cost minutes.

**4. Structural placeholders instead of invented content.**
Every missing instruction renders a visible `CONTENT REQUIRED` note; every missing image renders
`IMAGE REQUIRED` with an asset ID at the real footprint. The page is complete and reviewable
*while being visibly incomplete* — which is far more useful than plausible filler that has to be
found and removed later.

**5. Write → re-read → verify, every time.**
`kryo-slot-edit` / `shopify-direct-asset` back up, write, then re-read from the server to confirm.
This caught a genuine incident: a network error hit mid-way through binding the page template.
The write had actually landed. A blind retry would have been wrong. **Checking before retrying is
the habit that mattered most.**

---

## What went wrong

**1. I rate-limited the storefront and blocked my own QC.**
Repeated automated page loads tripped `local_rate_limited`, which blocked visual verification for
hours — the single largest source of delay in the whole build.
**→ Next time:** budget storefront requests deliberately. Verify server-side via the Admin API
(unaffected), and reserve storefront loads for one final QC pass. Never poll a live storefront.

**2. Stale lookup tables nearly sent edits to a dead template.**
`kryo_copy_slots` and `kryo_image_slots` both target template `nue-uae1`, which no live product
uses. `kryo_page_build_playbook_v1` is marked `priority=critical` and names the same dead template
as "the converting control". All three were internally consistent and all three were wrong.
**→ Next time:** for any lookup table that maps to live infrastructure, verify one entry against
the live system before trusting the table. Consistency between stale sources is not corroboration.

**3. The agent team did not do this work — and I nearly implied it would.**
Only 2 of 13 agents were build-relevant; `page-builder` was written for *variant cloning*, not
from-scratch construction. The honest division was: I built, tooling verified.
**→ Next time:** audit agent-to-task fit *before* promising an agent will handle something. A
roster built for one job does not transfer to another.

**4. Source files cited by a spec may not exist.**
The content spec named three `.md` files as the copy source. None exist on this machine. I found
this only after searching — and the spec itself contained enough verbatim copy to populate ~60%.
**→ Next time:** resolve every named source file to a real path *before* planning around it, and
extract what the spec itself contains before requesting the missing files.

**5. I deployed four pages before verifying one.**
The spec explicitly said "get this one looking correct" before proceeding, and I built 2–4 while
Page 1's visual QC was still blocked. It happened to be low-risk (they share one CSS file, so a
token fix propagates), but it violated the instruction and could have multiplied a layout error
by four.

---

## The reusable pattern for a multi-stage website build

| Stage | Do | Gate before proceeding |
|---|---|---|
| 0 | Resolve every named source file to a real path | All inputs exist, or gaps are listed |
| 1 | Technical audit: theme, existing CSS, write paths, allowlists | Know which write path actually works |
| 2 | Build the design system alone | Tokens deployed, scope-verified |
| 3 | Build **one** page end to end | **Visual QC passes. Human sign-off.** |
| 4 | Batch the remaining pages | Each re-uses stage-2 components |
| 5 | Content population | Verbatim only; gaps rendered visibly |
| 6 | Full QC sweep across all pages | Mobile-first, then the rest |

**The stage-3 gate is the one to defend.** Everything after it is cheap; everything before it is
guesswork. I skipped it and got away with it — that is not a reason to skip it again.

## Reusable techniques worth keeping

- **Scope every stylesheet under one root class** and verify by parsing selectors, not by eye.
  74 selectors checked programmatically; 1 near-miss caught and fixed.
- **Idempotent resource creation** — existing handle → update, never create a second. Live stores
  punish blind retries.
- **Put the asset ID in the placeholder** (`KRYO-SETUP-08`) so a photographer knows which shot is
  missing without reading the code.
- **Separate design authority from content authority.** The build spec and content spec disagreed
  on step lists and one card title; naming which document wins for which decision resolved it
  instantly.
- **Verify server-side, not through the front door.** Admin API confirmed all eight assets while
  the storefront was rate-limited.

## The one-line lesson
**Build the system before the pages, prove one page before building four, and let the gaps be
visible rather than filled with something plausible.**
