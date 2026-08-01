import { defineConfig, devices } from '@playwright/test';

// Config for KRYO live-site verification tests (tests/kryo-atc-tracking.spec.ts).
// These run against the LIVE storefront and are read-only: they add to cart in an
// ephemeral browser session and never complete a checkout.
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Chromium-based mobile emulation — runs without a WebKit download.
    // Sufficient for layout/geometry and cart-API assertions.
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
    // True WebKit/iOS. Requires `npx playwright install webkit`.
    // Prefer this when testing iOS-specific behaviour (safe-area, momentum scroll).
    { name: 'Mobile Safari', use: { ...devices['iPhone 13'] } },
  ],
});
