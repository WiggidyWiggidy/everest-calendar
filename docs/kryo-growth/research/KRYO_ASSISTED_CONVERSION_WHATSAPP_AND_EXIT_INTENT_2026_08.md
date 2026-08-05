# KRYO Assisted Conversion: WhatsApp, Live Sales Help & Exit Intent — August 2026

**Status:** source-of-truth research note for KRYO assisted conversion.

**Purpose:** determine whether WhatsApp / expert support and exit-intent capture should be part of the KRYO control, and how to use them without weakening the primary purchase path.

## 1. Executive decision

### WhatsApp / expert support

**Yes: include a persistent assisted-sales pathway on the control.**

But it should be:

- subordinate to Add to Cart;
- specific to purchase-critical objections;
- persistent across sessions;
- measurable as an assisted-sale channel.

Do **not** make WhatsApp an equal-weight hero button or repeatedly interrupt the page with multiple WhatsApp CTAs.

### Exit intent

**Do not make exit-intent a Control v2 requirement yet.**

Research supports the general tactic for recovering some abandoning traffic, but evidence is more context-dependent and often vendor/case-study based. KRYO should first deploy a clean subordinate WhatsApp support path, measure it, and then test a targeted exit-intent WhatsApp capture as a separate assisted-conversion experiment.

## 2. Why assisted sales is strategically relevant to KRYO

KRYO is:

- unfamiliar;
- approximately AED 3,990;
- physically installed/positioned in a bathroom;
- dependent on fit, setup, delivery and trust questions;
- historically multi-session before purchase.

Those characteristics make purchase-critical uncertainty unusually important.

The canonical KRYO analysis found approximately **1-, 3- and 6-day purchase lag** across the three historical winning buyers. The sample is small, but it supports designing for return visits and assisted consideration rather than assuming a one-session funnel.

A persistent WhatsApp thread has a practical advantage over generic web chat: the conversation survives the browser session and gives the prospect a low-friction route back to the product / seller later.

## 3. External research on live assistance

### Academic evidence

A 2019 Information Systems Research paper using granular Alibaba marketplace data controlled for the fact that higher-intent consumers are more likely to initiate chat. It found live chat increased purchase probability for tablets by **15.99%** in that setting. The effect was stronger where seller reputation was weaker.

That is particularly relevant directionally for KRYO because it is a new DTC product with limited independent reputation proof.

A separate 2021 Production and Operations Management study also found live chat can improve traffic-to-sales conversion by informing and persuading, and interacts with existing product information, ratings and reviews.

These studies are not KRYO-specific and should **not** be used as a promise that WhatsApp will lift KRYO conversion by 15.99%.

### Messaging preference evidence

WhatsApp Business's 2026 consumer report surveyed 11,056 consumers across 22 markets and reports:

- 73.3% prefer messaging when communicating with a business;
- 72.4% say they are more likely to buy from brands that offer messaging.

This is useful directional evidence, but it is platform-sponsored survey research rather than a randomized ecommerce conversion experiment.

## 4. What premium competitors do

### Plunge

Plunge's high-ticket All-In page (~US$8k) keeps Add To Cart prominent while also offering:

- "Speak to a Plunge sales specialist";
- Schedule Call;
- dedicated customer support;
- contact-sales routes.

The assisted path exists **beside** the self-serve purchase funnel rather than replacing it.

### Eight Sleep

Eight Sleep uses "Need help choosing?" and offers a sleep expert / virtual visit after the product and mechanism have been explained. The self-serve route remains available.

**Competitive pattern:** premium high-consideration products give hesitant buyers access to a human expert while protecting the primary purchase action.

## 5. Recommended Control v2 WhatsApp architecture

The current control has a generic expert-chat pathway lower in the product information area. Replace/refine that into a single persistent WhatsApp sales-support route.

### Placement 1 — buy area

Directly under the primary purchase / deposit / reassurance area, use a **tertiary text link**, not a second large button:

> **Questions about fit, setup or delivery? WhatsApp a KRYO specialist.**

Visual hierarchy:

1. Add to Cart — dominant
2. Downpay / purchase reassurance — secondary
3. WhatsApp specialist — tertiary

### Placement 2 — optional lower-page repeat

One repeat is acceptable after setup / FAQ content:

> **Still unsure whether KRYO fits your bathroom? Check fit and current Dubai availability on WhatsApp.**

Do not repeat WhatsApp at hero + mid-page + buybox + cart simultaneously.

### What the prefilled message should do

Use specific intent, not generic "Hi" text:

> Hi, I’m considering KRYO for Dubai. I want to check fit/setup and current August availability.

If technically easy using existing attribution data, include the ad/session source in tracking rather than exposing technical IDs to the customer.

## 6. Why the challenger WhatsApp implementation was too aggressive

`kryo2_` added WhatsApp in several places:

- equal-weight hero CTA;
- mid-page 30-day price-lock CTA;
- WhatsApp below Add to Cart;
- additional assistance opportunities.

This created an alternate conversion objective before the user had made the core purchase decision.

For a visitor who is ready to buy, the page effectively asks:

> Buy now, choose a model, or start a conversation and decide later?

That additional decision load likely contributed to the challenger's weak ATC progression, even if WhatsApp itself is strategically valuable.

The correct lesson is **not** "WhatsApp failed." It is:

> Assisted sales should capture hesitant high-consideration buyers without stealing attention from the direct-buy path.

## 7. What to measure

A WhatsApp click is not success by itself.

Track:

1. paid LPVs;
2. WhatsApp click rate;
3. conversation started / response received where measurable;
4. qualified lead rate;
5. Add to Cart after WhatsApp;
6. purchase within 1 / 7 / 30 days;
7. assisted revenue;
8. time from first click to purchase;
9. reason for contact (fit, installation, delivery, price, trust, noise, etc.).

Primary assisted-sales metric:

**revenue per WhatsApp lead / qualified lead**, not raw click rate.

The conversations also become direct qualitative research. Repeated purchase-critical questions should be fed back into the PDP.

## 8. Exit-intent evidence

Exit-intent can work, but published results are context-dependent.

Examples:

- NextAfter experiment #6285: an exit-intent acquisition modal increased email/name conversion from 0.49% to 0.95% (+94% relative) on ~19,944 visits.
- NextAfter experiment #6814: exit intent produced ~50% more email conversions than a slide-out on desktop.
- A recent ecommerce case study from Conversion Rate Store reports a scarcity-based cart exit popup increased conversion by 7% and revenue/user by 4%.

These are not directly transferable to a premium DTC KRYO PDP. Exit-intent often measures **lead capture**, not product purchase, and poor timing can damage UX.

## 9. Recommended future KRYO exit-intent test

Only test this after baseline WhatsApp support is working and measurable.

### Goal

Capture a high-intent visitor who is leaving without ATC or WhatsApp contact.

### Trigger

Do not show on page load.

Suggested eligibility:

- desktop exit intent, OR carefully designed mobile back/engagement trigger;
- meaningful engagement first (e.g. >45 seconds or >50% scroll);
- no Add to Cart;
- no existing WhatsApp click;
- once per visitor over a sensible suppression period;
- never on checkout.

### Offer

Do **not** introduce another discount by default.

Better KRYO offer:

> **Not ready to order? Check fit and current August availability with a KRYO specialist.**

CTA:

> **Continue on WhatsApp**

This uses the popup to reduce uncertainty rather than conditioning customers to abandon for a discount.

### Hypothesis

The visitor was going to leave anyway; a well-timed lower-friction expert conversation may convert some otherwise lost prospects into persistent assisted leads.

## 10. Sources

### Academic / research

- Tan, Wang & Tan (2019), *Impact of Live Chat on Purchase in Electronic Markets*, Information Systems Research: https://pubsonline.informs.org/doi/10.1287/isre.2019.0861
- Sun, Chen & Fan (2021), *Effect of Live Chat on Traffic-to-Sales Conversion*, Production and Operations Management: https://journals.sagepub.com/doi/10.1111/poms.13320

### Platform / market research

- WhatsApp Business, **State of Business Messaging 2026**: https://whatsappbusiness.com/resources/resource-library/state-of-business-messaging/
- Shopify, **Ecommerce Live Chat**: https://www.shopify.com/blog/ecommerce-live-chat

### Competitor architecture

- Plunge All-In: https://plunge.com/products/plunge-all-in/v2
- Plunge Contact / Sales: https://plunge.com/pages/contact
- Eight Sleep product page / expert assistance: https://www.eightsleep.com/product/pod-cover/?gdpid=66f87ab61a4dba246f0d2a4b

### Exit intent

- NextAfter exit-intent test: https://www.nextafter.com/experiments/how-an-exit-intent-popup-impacts-name-conversion/
- NextAfter desktop exit-intent vs slide-out: https://www.nextafter.com/experiments/how-site-flow-interruptor-offers-affect-conversion-on-desktop-devices/
- Conversion Rate Store ecommerce exit-popup case: https://conversionrate.store/case-studies/eldorado

## 11. Confidence grading

- Assisted expert sales is valuable for high-consideration ecommerce: **high confidence**.
- WhatsApp is a good KRYO channel for persistent assisted sales in Dubai: **medium-high confidence**.
- WhatsApp should be subordinate to Add to Cart: **high confidence**, consistent with premium competitor architecture and challenger friction evidence.
- Equal-weight hero WhatsApp CTA: **not recommended**.
- Targeted exit-intent WhatsApp capture: **medium confidence / test**, not baseline.
- Exit-intent discounting: **low priority** because it can damage price integrity and train abandonment.
