// Playwright verification for KRYO add-to-cart + buy-control reachability.
// Runs against the LIVE site. Read-only: adds to cart in an ephemeral session, never checks out.
//
//   npx playwright test tests/kryo-atc-tracking.spec.ts --project=chromium
//   npx playwright test tests/kryo-atc-tracking.spec.ts --project="Mobile Safari"
//
// HISTORY — why this file was rewritten on 2026-07-31:
// The original version reported `finalCartItemCount: 0` and `cartAddResponses: []`, which reads
// as "add-to-cart is broken". It was a test defect, not a site defect:
//   1. It checked `typeof fbq` at `domcontentloaded`, before the pixel had loaded  -> false negative.
//   2. It clicked a fuzzy-matched button without scrolling. The only Add-to-cart on this page sits
//      at ~97% page depth (11,731px), so nothing was ever clicked and no /cart/add was ever sent.
//   3. It read `/cart.js` during the post-submit navigation, which returns a stale/empty cart.
// Acting on that output would have produced a false "variant picker breaks the buy button".
// Verified truth (2026-07-31): POST /cart/add.js -> 200 and a real line item IS created.
//
// This version therefore: waits for load, measures buy-control geometry, adds via XHR (no
// navigation), and reads the cart before/after.

import { test, expect, type Page } from '@playwright/test';

const PRODUCT = 'https://everestlabs.co/products/kryo2_';

interface Diagnostic {
  viewport: { w: number; h: number };
  documentHeight: number;
  addBtnFound: boolean;
  addBtnDisabled: boolean | null;
  addBtnAbsoluteY: number | null;
  pctDownPage: number | null;
  screensToReach: number | null;
  stickyBuyControls: number;
  aboveFoldBuyAffordance: boolean;
  variantId: string | null;
  cartBefore: number;
  cartAfter: number;
  addStatus: number | null;
  fbqPresent: boolean;
}

async function diagnose(page: Page): Promise<Diagnostic> {
  await page.goto(PRODUCT, { waitUntil: 'load' });
  // Give third-party pixels a fair chance before asserting their absence.
  await page.waitForTimeout(3000);

  return page.evaluate(async () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const docH = document.documentElement.scrollHeight;

    const btn = document.querySelector<HTMLButtonElement>('button[name="add"]');
    const rect = btn?.getBoundingClientRect() ?? null;
    const absY = rect ? rect.top + window.scrollY : null;

    let sticky = 0;
    document.querySelectorAll('*').forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.position === 'sticky') {
        if (/add to cart|buy|reserve/i.test((el as HTMLElement).innerText || '')) sticky++;
      }
    });

    // Any commercial affordance in the first screen?
    let aboveFold = false;
    document.querySelectorAll('a,button,input[type=submit]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top >= 0 && r.top < vh && r.width > 20 && r.height > 15) {
        if (/add to cart|buy|reserve|order|shop now/i.test((el as HTMLElement).innerText || '')) {
          aboveFold = true;
        }
      }
    });

    const idInput = document.querySelector<HTMLInputElement>('form[action*="/cart/add"] [name="id"]');
    const variantId = idInput?.value ?? null;

    const before = await (await fetch('/cart.js')).json();
    let addStatus: number | null = null;
    if (variantId) {
      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items: [{ id: Number(variantId), quantity: 1 }] }),
      });
      addStatus = res.status;
    }
    const after = await (await fetch('/cart.js')).json();

    return {
      viewport: { w: vw, h: vh },
      documentHeight: docH,
      addBtnFound: !!btn,
      addBtnDisabled: btn ? btn.disabled : null,
      addBtnAbsoluteY: absY !== null ? Math.round(absY) : null,
      pctDownPage: absY !== null ? +((100 * absY) / docH).toFixed(1) : null,
      screensToReach: absY !== null ? +(absY / vh).toFixed(1) : null,
      stickyBuyControls: sticky,
      aboveFoldBuyAffordance: aboveFold,
      variantId,
      cartBefore: before.item_count,
      cartAfter: after.item_count,
      addStatus,
      fbqPresent: typeof (window as unknown as { fbq?: unknown }).fbq === 'function',
    };
  });
}

test('KRYO add-to-cart works, and buy-control reachability is measured', async ({ page }) => {
  const d = await diagnose(page);
  console.log('DIAGNOSTIC', JSON.stringify(d, null, 2));

  // --- H1: is the cart technically functional? ---
  expect(d.addBtnFound, 'an add-to-cart button should exist').toBe(true);
  expect(d.addBtnDisabled, 'add-to-cart should not be disabled (a variant must be preselected)').toBe(false);
  expect(d.variantId, 'the product form should carry a variant id').toBeTruthy();
  expect(d.addStatus, '/cart/add.js should return 200').toBe(200);
  expect(d.cartAfter, 'add-to-cart must create a real cart line').toBeGreaterThan(d.cartBefore);

  // --- Reachability: this is the regression guard for the sticky-CTA fix. ---
  // Currently FAILS by design on the unfixed page (button at ~97%, no sticky bar).
  // After kryo-sticky-atc.liquid ships, these must pass.
  expect(
    d.stickyBuyControls > 0 || d.aboveFoldBuyAffordance,
    `no reachable buy control: add-to-cart sits at ${d.pctDownPage}% of the page ` +
      `(${d.screensToReach} screens down), with ${d.stickyBuyControls} sticky controls ` +
      `and aboveFold=${d.aboveFoldBuyAffordance}`
  ).toBe(true);
});
