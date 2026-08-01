# KRYO Copy Constitution
**Status:** v1, 2026-07-06. Every piece of KRYO marketing copy — ads, page sections, emails, WhatsApp templates — must comply before it reaches Tom's approval queue. Writers (Claude sessions, spawned agents, Codex writers) read this first. Amend via PR + change-log entry, never silently.

---

## 1. The buyer (evidence-based, not persona-fiction)

A 35–54 year old male in Dubai with disposable income. **Every recorded ATC in 90 days of ad data came from this segment** (meta_ad_breakdowns_daily). At AED 3,990 he is not impulse-buying: the funnel data shows him reading deep (63% of scrollers reach 90% depth), adding to cart, then **auditing** — median 24s in cart, 89.3% exit, and 3× more chat clicks than checkout clicks. He deliberates across visits: returning visitors reach cart at 4× the first-visit rate.

**Write for the audit, not the impulse.** He is asking: Is this company real? Does the machine exist? Will it arrive? Who fixes it? Is it safe in a bathroom? Copy that doesn't advance one of those answers is decoration.

## 2. Persuasion hierarchy (in order of what converts this buyer)

1. **Proof** — real footage, real unit counts, real customers with names/locations. One frame of real water beats any adjective. (Founder face/name was the original plan for this tier; superseded 2026-07-14, see §4 — the site currently runs unsigned "the team" voice instead.)
2. **Mechanism** — how it physically works: chills its own 12L reservoir, 1°C–15°C controlled output, 48V bathroom-side with mains outside the wet area, no drilling, no plumbing. Specifics are trust.
3. **Guarantee** — mechanical, not conditional on feelings: any reason, we collect from your door, full refund, you pay nothing. Unsigned ("the team"), not a named human — see §4.
4. **Identity** — the disciplined-morning self-image ("step in tired, step out switched on"). Supporting note, never the lead for cold traffic at this price.
5. **Urgency** — ONLY real, dated, specific ("July batch ships July 15; after that, September"). Real scarcity stated calmly outperforms manufactured pressure with this buyer.

## 3. Voice

The register of the current page's best sections ("Built for Dubai", the setup steps): **calm, specific, domestic, founder-honest.** Short sentences. Concrete nouns. First person allowed and encouraged when the founder speaks. The brand is **KRYO by Everest Labs** — the names NUE and EverestPod are retired and must never appear.

## 4. Hard bans (auto-reject, no discussion)

- Unverifiable stats: "530% more focus", "180 hours of productivity" — any number without a source in product data or a cited study
- Fake or vague scarcity: "almost full", "limited units" without a real number. **BUT NOTE (confirmed by Tom 2026-07-16): the batch limit is REAL — production capacity is genuinely only 5-10 units per fortnight to start, and units have genuinely sold.** So "only 5 this batch", "5 units left", "limited to what we can make each fortnight" are all legitimate, evidence-backed claims. Subtle demand markers like "left" are FINE (real sales exist) — do not over-police them. What stays banned is only *fabricated specific figures* ("187 reserved", "sold out in 6 days") invented rather than measured.
- Stacked urgency ("TODAY" + "ENDS FRIDAY" together)
- Feeling-conditioned guarantees ("if it doesn't make you feel X")
- Biohacker hype register: "superhuman", "unlock", "game-changing", warning-emoji openers
- Medical/therapeutic claims (treats, cures, clinically proven)
- Any price, spec, or date that doesn't match product_context / the spec table (1°C–15°C, 12L reservoir, 8L/min, IPX4, AED 3,990, current ship date)
- Currency other than AED in UAE-targeted copy
- **Em dash (—) or Chinese double dash (——) anywhere on-site.** Use commas, colons, periods, or the middle-dot (·) instead. (Added 2026-07-14; also applies to all outreach messages per user memory.)
- **A named individual (e.g. "Tom") anywhere on-site**, including WhatsApp CTAs, signatures, and founder-voice copy. Speak as "the team" / "we" / unsigned. Real founder-name-and-face proof is on hold pending a deliberate scope decision, not a default writers should reach for. (Added 2026-07-14.)

## 5. The adversarial gate (runs before any copy reaches approval)

A second pass — different session/agent than the author — attacks the draft:

1. **Claim audit:** every factual claim traced to product data or killed.
2. **Trust smell test:** read as the skeptical 45-year-old. Does anything trip the BS detector? (The test that would have caught "3-person feedback sample".)
3. **Voice conformance:** §3 register, §4 bans.
4. **One-variable discipline:** if this copy is a test arm, it changes exactly one persuasion lever vs control.
5. **Audit answered:** which of the §1 buyer questions does this copy advance? If none — reject.

Verdict PASS / REVISE / REJECT recorded with the experiment or inbox row.

## 6. Cognitive load, scannability, and the decision test (added 2026-07-07 after Tom's page review)

Truthful copy can still fail by making the buyer *process*. Every element must pass:

1. **One idea per element.** If the information already exists on the page (e.g., the crossed-out compare-at price IS the list-price proof), do not restate it. Repetition is load, not reinforcement.
2. **No adjacent duplication.** A heading and the line under it must not repeat each other's words ("Have Questions?" + "Have a question? Ask us…" = fail).
3. **Scan in three seconds.** Read each element as the 35–54 Dubai male mid-scroll on an iPhone: does it advance his decision, or does it ask him to parse? Parentheticals, pipes chaining 3+ facts, and stacked qualifiers fail this.
4. **Element budgets.** Accordion: max 4 tabs. CTA repetition: the same CTA text at most twice per viewport-length. If adding an element, name which one is being removed or merged.
5. **Sibling consistency.** New elements must match their siblings: same casing convention, comparable heading length, icon present and valid for the theme's icon set (verify the icon renders — "shield" does not exist in this theme; check before shipping).
6. **Premium register test.** All-caps only where the theme styles it; no shouting in body copy; whitespace is part of the message.

## 7. Render QC is mandatory — strings are not the unit of review

String-level review cannot catch duplication-in-context, tab counts, missing icons, or casing clashes. After ANY page deploy: fetch the rendered page (correct market, mobile UA), audit the changed elements IN CONTEXT against §6, and where layout is in question, screenshot. The gate verdict is not complete until the rendered check passes. Today's lesson: the copy passed, the page didn't.

## 8. Copy is graded by numbers, not taste

Every shipped piece is scored post-hoc by its per-ad ATC/LPV, cost per ATC, and downstream cart→checkout (vw_kryo_intent_daily + meta_ad_metrics_daily). Predicted vs actual lift goes to hypothesis_learnings on experiment close. The constitution itself is subject to revision by evidence: when data contradicts a rule here, the data wins and the rule gets amended.
