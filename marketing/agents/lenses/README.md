# Diagnosis Lenses (specialised checkers)

Five roles the orchestrator (`../conversion-diagnosis-loop.md`) invokes on demand. In Claude Code,
mirror each to `.claude/agents/<name>.md` with frontmatter so it becomes a real subagent with scoped
tools. Every lens returns the same contract: **claim · method · evidence (source/query/n) ·
confidence · what would falsify it.** No lens may declare a hypothesis CONFIRMED alone — corroboration
is the orchestrator's job.

## 1. data-analyst
- Job: quantify the funnel from canonical sources; cohort splits (device, new/returning, page, ad);
  cross-source reconciliation.
- Tools: Supabase SQL (read-only). Binds to `source-of-truth.md`. Applies sample caps.
- Must: report n for every cell; never use first-party for paid verdicts; flag source disagreements.
- Falsification duty: state the query another analyst could run to reproduce or break each number.

## 2. code-tracking-auditor
- Job: read theme + app code for logic bugs and tracking gaps (e.g. add-to-cart handler, variant
  picker enable/disable state, whether `fbq`/Shopify `product_added_to_cart`/CAPI fire).
- Tools: repo read (Grep/Read), Supabase schema. No writes.
- Must: distinguish "event not firing" (tracking) from "action not happening" (funnel) — and say which.
- Output: exact file/line of the suspect + the mechanism it would break.

## 3. live-ux-tester  (Claude Code only — needs a browser)
- Job: reproduce the funnel on the live site, desktop AND mobile viewport; capture network
  (`/cart/add` status, `fbq`/CAPI calls), console errors, and whether a real cart line is created.
- Tools: Playwright / Chrome MCP.
- Must: run the orchestrator's discriminating test verbatim and report pass/fail.
- This lens is what turns a code/data HYPOTHESIS into CONFIRMED or REFUTED.

## 4. cro-researcher
- Job: find documented failure modes + best practices for the specific symptom (not generic CRO).
  Ground hypotheses in known patterns and quantify expected lift ranges for proposed fixes.
- Tools: web search/fetch. Cite sources.
- Must: never present a benchmark as proof KRYO has a problem — only as a candidate mechanism to test.

## 5. red-team-verifier
- Job: try to break every CONFIRMED finding. Argue the strongest alternative, check sample math
  (Poisson/CI on small n), look for confounds (time window, traffic mix, internal pollution).
- Tools: SQL + read.
- Authority: can send any finding back to OPEN. Enforces evidence-standards. The loop cannot reach
  "Done" until red-team has tried and failed on the top conclusion.

## How they cross-check (the point of having lenses)
- data says "ATC ≈ 0" → code-tracking-auditor asks "real or untracked?" → live-ux-tester settles it →
  cro-researcher supplies the known failure mode + fix → red-team-verifier attacks the whole chain.
- A single agent can role-play all five sequentially; the value is that each *claim* is challenged by
  a different method before it counts. Corroboration, not headcount.
