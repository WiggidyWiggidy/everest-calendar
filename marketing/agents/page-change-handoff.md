# Landing-page change → UX verification handoff

The loop that lets an agent change the live page safely. Two agents, one gate, Tom in the middle.

## Why addressable edits, not liquid rewrites

Every known KRYO page defect is **one setting at one address**:

| Defect | Address (`section / block / key`) |
|---|---|
| Sticky bar says "Choose Model" instead of adding to cart | `blocks_dijJNt / ai_gen_block_55e2f8d_jEB4tB / cta_text` |
| Scarcity claim wrong (says 8, true is 7) | `blocks_dijJNt / ai_gen_block_d4edf68_nV8nd6 / announcement_text` |
| Pre-cart WhatsApp CTA | `blocks_dijJNt / ai_gen_block_a… / secondary_btn_text` |
| "Hold My Price for 30 Days" | `blocks_dijJNt / ai_gen_block_85a4796_foundAccessA / button_text` |

A rewrite of the section liquid is unreviewable and hard to revert. A single-setting diff is
both. **The live template `product.kryo2_.json` has 163 editable slots** — enumerate before editing.

## The loop

**1. DIAGNOSE** → `data-analyst` + `red-team-verifier` establish the defect with n and instrument block.
No change proceeds from an unvalidated finding.

**2. LOCATE** → `page-builder` runs:
```bash
node scripts/kryo-slot-edit.mjs map --template kryo2_ --grep "<text to find>"
```
Read-only. Returns the exact address. **Never guess an address** — the copy-slot map in Supabase
(`kryo_copy_slots`) covers template `nue-uae1`, which no live product uses. It is stale. Read the
live template, not the table.

**3. PROPOSE** → `page-builder` produces a dry run (the tool's default):
```bash
node scripts/kryo-slot-edit.mjs set --template kryo2_ --section … --block … --key … --value "…"
```
Prints BEFORE/AFTER and writes nothing. This is the change proposal.

**4. TOM APPROVES.** The agent may not pass `--allow-live`. The tool refuses `--confirm` alone.
This is enforced in code, not by convention.

**5. APPLY** → on approval, `--confirm --allow-live`. The tool automatically:
- writes a timestamped backup to `theme-assets/backups/`
- applies the single setting
- **re-reads from the server to verify** the value actually landed
- prints the exact rollback command

**6. UX VERIFY (the handoff)** → `live-ux-tester` MUST confirm on the live storefront:
- the changed text renders at **mobile and desktop** viewports
- the control still works — for a CTA, `/cart/add` returns 200 **and `/cart.js` item_count increments**
- no new console errors
- nothing above or below the change shifted or broke
- a screenshot at both viewports

**A change is not "done" when the write succeeds. It is done when UX verification passes.**
The write only proves the JSON changed; it does not prove the page works.

**7. RECORD** → append to `marketing/findings/` with `depends-on:`, log predicted-vs-actual to
`marketing/agents/calibration-log.md`, and add the rollback command to the record.

## Failure behaviour
- Verify step fails → **roll back immediately** using the printed command, then diagnose. Do not
  attempt a forward fix on a live page.
- Address not found → the template changed. Re-run `map`. Do not guess.
- Value identical → tool no-ops and says so.

## Hard limits
- `page-builder` builds and proposes. It never passes `--allow-live`.
- `live-ux-tester` verifies. It never edits.
- Producer ≠ verifier. The agent that made the change may not be the one that signs it off.
