# Claude Code Master Hand-off — KRYO B2C: preserve, diagnose to completion, prepare fixes
Date: 2026-07-31 · Repo: `~/Desktop/Claude Project/everest-calendar` · Owner: Tom

You are running in Claude Code with native shell, git, Playwright/Chrome, and the ability to spawn
subagents. Do the phases in order. **Hard rules:** never merge to `main`; never deploy to production
or change live Shopify/Meta/GA4/Vercel without Tom's explicit approval; never commit secrets; prepare
all code/SQL on a branch for review. Separate "Tom decisions" from "agent actions" in every report.

Context you can trust (already established, don't re-derive):
- kryo2_ (new page) went live to real Meta traffic **~2026-07-26** (data-confirmed: ~0 sessions/day
  before, 21–45/day after). Old page = kryo2.
- **Dominant loss is add-to-cart**, corroborated by 3 independent sources over the kryo2_ live window
  (~180 real Meta sessions): first-party pixel ~0, Meta ~1, **Shopify server-side 0 checkouts** — vs
  old page's **6 completed checkouts**. Not a tracking artifact.
- **OPEN question (the whole point of Phase 3):** is add-to-cart *technically broken* (H1: variant
  picker disables/breaks the buy button — a documented custom-theme bug) or *behavioural* (H2: cold
  traffic won't add at AED 3,990)? Needs a live browser test — that's your job.
- Theme fires **no Meta browser pixel** (`fbq` absent); first-party relies on Shopify analytics + a
  `/cart/add` fetch hook; CAPI creds exist but are wired only to WhatsApp leads.
- Internal/test traffic pollutes first-party data; exclude anon_ids `elv_1779869995748*`,
  `elv_1779806210806*`, and referrers `myshopify.com` / `admin.shopify.com`.

Governance files to load first (they bind your analysis):
`.claude/rules/evidence-standards.md`, `marketing/data-contracts/{source-of-truth,confirmed-facts,diagnostic-protocol}.md`,
`marketing/agents/conversion-diagnosis-loop.md`, `marketing/agents/lenses/README.md`.

---

## Phase 1 — Unblock git + preserve the work (do first)
1. Clear the stale lock: `ps aux | grep '[g]it'` (stop if a real git process); `lsof .git/index.lock`;
   `chflags noschg,nouchg .git/index.lock 2>/dev/null`; `rm -f .git/index.lock` (sudo if needed).
2. `git switch -c consolidation/b2c-marketing-2026-07-31`.
3. Verify `.gitignore` ignores: `.env*`, `.vercel`, `.claude/settings.local.json`, `tmp/`, `reports/`,
   `screenshots/`, `supabase/.temp/`, `$CODEX_HOME/`. Add any missing.
4. `git add -A`; then `git restore --staged docs/SHOPIFY_WEB_PIXEL.md src/app/api/marketing/sync/meta-breakdowns/route.ts audit/`.
5. Secret-scan staged diff (`eyJ…`, `EAAG…`, `sk-…`, `AIza…`, `-----BEGIN`). If any → STOP.
6. Commit (logical groups if you like) and `git push -u origin consolidation/b2c-marketing-2026-07-31`.
   Do NOT touch main. Do NOT commit the meta-breakdowns deletion.

## Phase 2 — Make the governance load automatically
- Add ONE line to the repo `CLAUDE.md` entry point: "Before any conversion analysis, run
  `marketing/data-contracts/diagnostic-protocol.md`." (If `CLAUDE.md` is protected, propose the diff to Tom.)
- Mirror the five lenses to real subagents: create `.claude/agents/{data-analyst,code-tracking-auditor,
  live-ux-tester,cro-researcher,red-team-verifier}.md` from `marketing/agents/lenses/README.md`, each
  with frontmatter (name, description, scoped tools).

## Phase 3 — Run the conversion-diagnosis loop to completion (the core task)
Follow `marketing/agents/conversion-diagnosis-loop.md`. The blackboard is
`marketing/findings/2026-07-31-kryo2_-atc-blackboard.md` — update it as you go; do not conclude while
any dominant-loss hypothesis is OPEN.
1. **Confirm remaining facts** (record in `confirmed-facts.md`): exact cart-tracking-broken window
   (Tom said May–early June); confirm kryo2_ launch date with Tom.
2. **live-ux-tester lens (the unblock):** run `tests/kryo-atc-tracking.spec.ts` against
   `https://everestlabs.co/products/kryo2_`, **desktop AND mobile** (`--project="Mobile Safari"`).
   Capture for each: is Add-to-Cart enabled? does selecting a model enable/disable it? does
   `/cart/add` return 200 with a real line (`/cart.js` item_count > 0)? do `fbq`/CAPI/Shopify
   `product_added_to_cart` fire? console errors? Record pass/fail per step.
   - Add-to-cart fails/disabled → **H1 CONFIRMED** (technical bug). Add-to-cart works cleanly →
     **H1 REFUTED**, promote H2, and segment data for a demand/message diagnosis.
3. **code-tracking-auditor lens:** if H1 confirmed, find the exact file/line in the variant-picker /
   buy-buttons handling; identify the minimal fix.
4. **red-team-verifier lens:** attack the confirmed cause (small-n Poisson, traffic-mix confounds,
   window). Loop stays open until it fails to break it.
5. Reach the Definition of Done (all six boxes). If still blocked, escalate to Tom precisely.

## Phase 4 — Prepare the highest-leverage fixes ON A BRANCH (review-only, no deploy)
Prioritise by the Phase 3 result:
- **If H1 confirmed (technical ATC break):** (a) preselect a default model so the buy button is always
  live; (b) add a working mobile **sticky add-to-cart** (est. +12–25% mobile ATC on long high-ticket
  pages). Prepare the theme diff + a Playwright test proving mobile add-to-cart now creates a real line.
- **Meta CAPI (measurement):** wire `src/lib/marketing/meta-capi.ts` (already written) into
  `src/app/api/marketing/sync/storefront-event/route.ts` for AddToCart/InitiateCheckout/Purchase
  (snippet in `audit/b2c-growth-system-activation-2026-07-31/meta-atc-fix-and-verify.md`). Set
  `META_TEST_EVENT_CODE`; verify in Meta Events Manager Test Events.
- **Internal-traffic exclusion:** implement the rule from `source-of-truth.md` as a reusable SQL
  view/filter so funnel reports auto-exclude team testing.
- **WhatsApp lead instrumentation:** capture click→message→lead into `kryo_leads` (repo has the
  `meta-whatsapp` webhook + `kryo_whatsapp_*` tables); send a Lead conversion via CAPI.
- **meta-breakdowns:** decide restore vs retire (it's orphaned; a downstream skill expects the table).

## Phase 5 — Validate before declaring done
`npm run build`, `npm run typecheck`/`tsc --noEmit`, relevant tests; confirm scripts resolve; markdown
links valid; the Phase 3 diagnosis passes the `diagnostic-protocol.md` self-check. Report results.

## Phase 6 — Report (fixed shape)
- Git: branch + commit SHAs + push URL. (No main merge.)
- Diagnosis: dominant loss, cause (CONFIRMED/label), evidence (source·window·n), red-team result,
  updated blackboard, what's still UNKNOWN.
- Fixes prepared (files/diffs), each mapped to the confirmed cause + measurement plan.
- **Tom decisions required:** revert ads to old page now? approve each deploy? restore/retire
  meta-breakdowns? confirm cart-tracking-bad window + launch date?
- **Agent actions ready on approval:** the prepared branch changes.
- Confirm: main not merged; no production system modified; no work discarded.

## Approval gates (never cross without Tom)
Deploy to Vercel/production · live Shopify theme/product change · Meta campaign edits or restart ·
production Supabase schema/policy change · any spend change.
