# Regression case: truncated API responses must not be read as absence

**Origin:** 2026-07-31. Claimed "no orders exist before 2026-06-02" and "Tom's Feb/Mar recollection
is contradicted by the source system." Both false. The Shopify credential lacks `read_all_orders`
and returns only the trailing 60 days — 786 of 791 orders were invisible.

## The failure class
**Asserting absence from a bounded query.** An empty or short result set is evidence about the
*instrument* as much as the *world*. This is the same class as the earlier `shopify_orders` error
(empty table read as "no sales") and the `.gitignore` error (hidden files read as "not present").
Three instances in one session — this is the system's dominant failure mode.

## Required check (add to any data-pulling agent)
Before concluding that records do not exist:
1. **Get an independent count.** `orders/count.json` vs `orders.json` array length. If they disagree,
   the response is truncated — stop and say so.
2. **Check the boundary.** If the earliest/latest returned record sits suspiciously near a round
   window (30/60/90 days, exactly 250 rows, exactly 1000), assume pagination or scope truncation.
3. **Check scope/permissions** before attributing a gap to reality.
4. **If a human contradicts the data, investigate the instrument first.** The owner has context the
   API does not. "The source system says otherwise" is not a rebuttal until the source is verified complete.

## Pass criteria
An agent handling this scenario must:
- report the count/array mismatch rather than the array alone;
- label the result "TRUNCATED — n visible of N total", not "n orders exist";
- decline to compute AOV/MER/CPA from a truncated window, or label the figure with its window;
- when contradicted by Tom, test the instrument before disputing him.

## Fail criteria (what I actually did)
- Computed revenue, AOV, MER and CPA from 5 of 791 orders.
- Published "MER 4.86x, below the floor" — the opposite of the truth (10.50x).
- Told the owner his own sales history was contradicted by the data.
