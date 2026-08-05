# KRYO Fortnightly Dispatch Urgency System — August 2026

**Status:** source-of-truth research note for using real production/dispatch timing as a premium urgency mechanism.

**Purpose:** convert KRYO's genuine two-week dispatch cadence and constrained stock into truthful urgency on the product page and in Meta creative, without fake countdowns or permanently resetting deadlines.

## 1. Executive decision

KRYO should use **real dispatch cadence + real allocation scarcity** as the default urgency system.

If KRYO dispatches Dubai orders approximately every two weeks, delaying a purchase creates a genuine downside: the customer can miss the next dispatch and wait roughly another two weeks.

This is stronger and more defensible than generic recurring copy such as:

- `OFFER ENDS FRIDAY`
- permanently resetting countdowns;
- invented stock pressure.

The two urgency mechanisms are distinct:

1. **Quantity scarcity:** how many units remain in the current allocation.
2. **Time scarcity:** which dispatch the customer can still make.

Use both only when both are operationally true.

## 2. Why this is commercially relevant

KRYO historically showed delayed conversion rather than a one-click purchase pattern. The three historical winning buyers converted over approximately 1, 3 and 6 days.

That means a truthful near-term deadline can be particularly valuable for prospects who already understand the product but need a reason to act now.

Broader research supports the underlying mechanisms:

- Baymard repeatedly finds that users care about **when they will receive an order** and that clear estimated dates reduce hesitation; shipping-speed language forces users to calculate dates themselves.
- Baymard also finds delivery dates are interpreted as promises, so they must be accurate. Excessive safety margins can make delivery seem too slow and contribute to abandonment.
- Baymard reports slow delivery as a meaningful abandonment reason and recommends surfacing delivery information earlier.
- Field research on scarcity promotions finds both limited-quantity and limited-time scarcity can affect purchase behaviour.
- Shopify's merchant guidance recommends specific, genuine end dates / limited stock when using urgency and warns that excessively short time windows can provoke resistance.

The evidence supports **accurate operational deadlines**, not manufactured pressure.

## 3. Recommended KRYO cadence

User operating decision: Dubai dispatch approximately every two weeks for now.

At the current date, the control already references an August 15 dispatch.

If operations confirm this schedule, the next cadence would be approximately:

- 15 August
- 29 August
- 12 September
- 26 September

These dates must be treated as operational promises, not auto-generated marketing copy. Confirm each date before publishing.

## 4. Product-page hierarchy

Near the Buy decision, show one concise operational strip.

Recommended format while current inventory and schedule remain true:

> **NEXT DUBAI DISPATCH: 15 AUGUST · 7 OF 10 ALLOCATIONS REMAIN**

Then a lower-key second line where useful:

> **Miss this dispatch and the next scheduled dispatch is 29 August.**

This makes the cost of waiting explicit without inventing an offer expiry.

Do not say `delivered 15 August` if 15 August is only the warehouse dispatch date.

If a reliable Dubai delivery range is known, prefer customer-centric arrival wording separately because Baymard research finds exact delivery dates/ranges easier for customers to interpret than business-centric shipping speeds.

## 5. Through-cycle message system

### Days 14–6 before dispatch

Use low-pressure availability information:

> `Next Dubai dispatch: 15 August · 7 of 10 allocations remain`

Goal:
- establish operational reality;
- give the customer a planning date;
- avoid premature pressure.

### Days 5–3 before dispatch

Increase salience:

> `Order for the 15 August Dubai dispatch. Next scheduled dispatch: 29 August.`

If stock is low, combine truthfully:

> `4 allocations remain for 15 August dispatch.`

### Final 48 hours

Only if fulfilment operations genuinely have an order cutoff:

> `Final 48 hours for the 15 August dispatch.`

or

> `Order by [true cutoff time/date] for 15 August dispatch.`

Do not use a countdown timer unless the cutoff is real and the system will automatically / reliably remove or update it at expiry.

### Immediately after cutoff

Remove expired urgency immediately.

Roll the site and ads to the next confirmed dispatch, e.g.:

> `Next Dubai dispatch: 29 August.`

Never leave an expired date or `final hours` message live.

## 6. Meta creative role

Dispatch urgency should be treated as a **time-window pre-frame**, not the only evergreen acquisition message.

Recommended structure in the winning Purchase ad set:

- evergreen control: category disruption / anti-plunge;
- evergreen challenger: Morning Purpose;
- optional temporary third creative in the final 3–5 days before dispatch: Dispatch Deadline.

The deadline creative can be especially informative for a multi-session audience because existing prospects may re-encounter KRYO near the point where the cost of delay becomes real.

Important: same-ad-set delivery does not guarantee Meta will show the deadline creative specifically to returning visitors. Meta chooses based on predicted outcome. Measure actual session history before claiming sequencing.

## 7. Dispatch creative examples

### Low-pressure version

Primary:
> **Next Dubai dispatch: 15 August.**
>
> KRYO is produced in limited allocations. 7 of 10 remain for the current Dubai batch.

Headline:
> **15 August Dubai dispatch**

### Deadline version

Primary:
> **Want KRYO in the next Dubai dispatch?**
>
> The current batch dispatches 15 August. Miss this allocation and the next scheduled dispatch is 29 August.

Headline:
> **Order for 15 August dispatch**

### Education + deadline version

Primary:
> KRYO chills its own water down to 1°C and delivers controlled cold through the KRYO Halo inside the bathroom you already use.
>
> The next Dubai dispatch leaves 15 August. The following batch is scheduled for 29 August.

Purpose:
- useful when a returning buyer needs both category comprehension and a reason to act.

## 8. Scarcity rules

Inventory copy must always come from live Shopify immediately before deployment.

If Shopify has 7 sellable KRYO units and the operational allocation started at 10, then `7 of 10 allocations remain` is currently defensible.

After a sale:
- update the message promptly;
- never hard-code a stale number for weeks.

If the operational allocation does not map cleanly to Shopify sellable inventory, do not claim a quantity until operations define the true number.

## 9. What not to do

Do not:

- permanently repeat `OFFER ENDS FRIDAY`;
- invent a price-expiry date when price does not change;
- reset countdowns when they expire;
- use fake viewer / cart activity counts;
- claim delivery by a dispatch date;
- create artificial stock scarcity by hiding sellable inventory;
- push so much urgency that category education disappears.

## 10. Measurement

Measure dispatch urgency at two levels.

### Page level

- LPV→ATC;
- cost/ATC;
- ATC→IC;
- checkout→purchase;
- purchase timing relative to dispatch cutoff;
- return-session purchase rate.

### Ad level

- spend;
- CTR / CPC;
- cost/LPV;
- LPV→ATC;
- cost/ATC;
- checkout / purchase after lag;
- proportion of converters whose first visit predates the urgency creative.

The strategic learning question is:

> Does a real near-term dispatch deadline disproportionately convert prospects who were already in consideration?

## 11. Research references

- Baymard, `Use Delivery Date Not Shipping Speed`: https://baymard.com/blog/shipping-speed-vs-delivery-date
- Baymard, Luxury Ecommerce Benchmark / Delivery Date: https://baymard.com/blog/2021-luxury-ecommerce-benchmark
- Baymard, Cart Abandonment / slow delivery: https://baymard.com/learn/reduce-cart-abandonment
- Baymard, Handling temporarily unavailable products: https://baymard.com/blog/handling-out-of-stock-products
- Wu et al. (2021), *How does scarcity promotion lead to impulse purchase in the online market? A field experiment*: https://www.sciencedirect.com/science/article/pii/S0378720619302095
- Shopify, scarcity / urgency guidance: https://www.shopify.com/blog/using-scarcity-urgency-increase-sales
- Shopify, limited-time offers: https://www.shopify.com/blog/limited-time-offer

## 12. Confidence grading

- Clear accurate dispatch date near purchase: **high confidence**.
- Truthful allocation count: **high confidence** when live inventory matches the claim.
- Two-week cadence creates a legitimate cost of delay: **high confidence** operationally if cadence is consistently honoured.
- Stronger deadline messaging in final 3–5 days: **medium-high confidence**, should be measured in KRYO.
- Deadline creative specifically closes returning visitors: **medium confidence until session-level KRYO data proves it**.
- Fake recurring urgency: **rejected**.
