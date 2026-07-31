import { chromium } from 'playwright';

const URL_VARIANT = 'https://everestlabs.co/en-gb/products/kryo-v4-premium-v3-clean-template-2026-05-03-02-27';
const URL_CONTROL = 'https://everestlabs.co/en-gb/products/kryo_';
const OUT = '/Users/happy/Desktop/Claude Project/everest-calendar/screenshots';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

async function capture(label, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  const title = await page.title();
  const h1 = (await page.$eval('h1, h2', el => el.textContent?.trim().slice(0, 100)).catch(() => 'no-h1')) || 'no-h1';
  const sectionCount = await page.$$eval('section, [data-section-type]', els => els.length);
  const hasPixel = await page.evaluate(() => !!document.querySelector('script[id="everest-attribution-pixel"]'));
  await page.screenshot({ path: `${OUT}/atc-loop-day1-${label}-desktop.png`, fullPage: false });
  console.log(`${label}\turl=${url}\tcode=200\ttitle="${title.slice(0,60)}"\th1="${h1}"\tsections=${sectionCount}\tpixel_present=${hasPixel}`);
}

await capture('variant', URL_VARIANT);
await capture('control', URL_CONTROL);

// Mobile capture of variant
await ctx.close();
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
const mp = await mobile.newPage();
await mp.goto(URL_VARIANT, { waitUntil: 'domcontentloaded', timeout: 30000 });
await mp.waitForTimeout(2000);
await mp.screenshot({ path: `${OUT}/atc-loop-day1-variant-mobile.png`, fullPage: false });
console.log('variant-mobile\tcaptured');

await browser.close();
