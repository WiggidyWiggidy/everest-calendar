---
depends-on: [constraint.binding, site.buy_control_position, site.live_pdp, site.tracking_capi]
---

# Deploy log — 2026-07-31

## Change #1 — WhatsApp click tracking  ·  DEPLOYED

**Approved by Tom:** "Ok do #1 now"
**Theme:** `167131775284` (live) · **File:** `layout/theme.liquid`

### Root cause (proven, not inferred)
The inline pixel (`data-pixel-version="2.4"`) tested:

```js
if (/wa\\.me|whatsapp/.test(text)) {     // double backslash
```

In JavaScript `\\.` matches a literal backslash followed by any character — which never
occurs in a URL. The `|whatsapp` alternative could not save it either: the links use the
**`wa.me`** short domain, which contains no "whatsapp" substring.

Verified in the live browser before the change:
- `doubleBackslashRegexMatches` (what was live) → **false**
- `singleBackslashRegexMatches` (correct) → **true**

**One character. Every WhatsApp lead has been invisible since the pixel shipped.**

Note: the repo mirror `theme-assets/snippets/everest-attribution-pixel.liquid` is **v1.2** and
tests `combined` (href + text) correctly. Live is **v2.4** and regressed to a broken regex.
The mirror had drifted from production — earlier analysis based on the mirror was reading
code that is not what runs.

### The fix
```diff
-    if (/wa\\.me|whatsapp/.test(text)) {
+    if (/wa\.me|whatsapp/.test(text)) {
```
Exactly one line, one byte. Nothing else touched.

### Verification
| Check | Result |
|---|---|
| Backup taken before write | `theme.liquid.pre-20260731-backup` (48,647 b) |
| Diff scope | 1 line, 1 byte |
| PUT | `bytes=48644 updated=2026-07-31T21:48:03+10:00` |
| **Admin API re-GET (authoritative)** | line 695 = `if (/wa\.me|whatsapp/.test(text)) {` ✅ |
| Server file matches intended file | 48,646 b both ✅ |
| Live storefront render | ⚠️ **NOT YET CONFIRMED** — see below |

### Outstanding
Live storefront verification is blocked: the storefront returns HTTP 429
`local_rate_limited` (18-byte body) from my own automated test volume earlier in the session.
The browser was also serving cached HTML.

**The server-side state is confirmed correct.** What remains unconfirmed is CDN propagation.
Re-check after the rate limit clears:

```bash
curl -s "https://everestlabs.co/products/kryo2_" | grep -c 'wa\\.me|whatsapp'
```
Expect 1 occurrence with a SINGLE backslash. Then click a WhatsApp CTA and confirm a
`whatsapp_click` row lands in `attribution_touches`.

### Not deployed
The `kryo-whatsapp-tracking.liquid` snippet (lead-ref stamping + placement attribution)
was NOT deployed. With the root cause fixed in one character, adding a second listener would
double-count `whatsapp_click`. The snippet is retained for the lead-ref attribution feature,
to be reworked as ref-stamping only.

### Rollback
```bash
node scripts/shopify-direct-asset.mjs put --key layout/theme.liquid \
  --file theme-assets/layout/theme.liquid.pre-20260731-backup \
  --theme 167131775284 --allow-live --vercel-env production
```

## Recorded but NOT deployed
- True allocation number confirmed by Tom: **7 OF 10**. Live bar still says "8 OF 10";
  template config says "16 / 50". To be applied with change #5 when approved.
