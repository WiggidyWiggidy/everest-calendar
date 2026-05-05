# Shopify Web Pixel — paste-ready setup

This installs the storefront pixel that fires events into `/api/marketing/track/session` →
`attribution_touches` → `compute_lp_funnel_daily` → Skill C's split-test reports.

## 1. Install the custom pixel (5 min)

Shopify Admin → **Settings** → **Customer events** → top right **Add custom pixel**.

- **Pixel name:** `Everest Attribution Pixel`
- **Permission:** Not requiring customer permission (this is first-party analytics, our own server)
- **Code:** paste the entire script below.

```javascript
// Everest Attribution Pixel
// Bridges Shopify Customer Events → /api/marketing/track/session → attribution_touches.
// Captures: page_view, add_to_cart, checkout_start, order_placed, remove_from_cart.
// Persists session_id across pages. UTM-aware. Pure storefront, no PII.

const ENDPOINT = "https://everest-calendar.vercel.app/api/marketing/track/session";

function getOrMakeSessionId() {
  try {
    let id = browser.sessionStorage.getItem("evrt_sid");
    if (!id) {
      id = "s_" + Math.random().toString(36).slice(2, 12) + "_" + Date.now().toString(36);
      browser.sessionStorage.setItem("evrt_sid", id);
    }
    return id;
  } catch (e) {
    return "fallback_" + Date.now().toString(36);
  }
}

function parseUtmsFromUrl(url) {
  try {
    const u = new URL(url);
    return {
      source: u.searchParams.get("utm_source") || null,
      medium: u.searchParams.get("utm_medium") || null,
      campaign: u.searchParams.get("utm_campaign") || null,
      content: u.searchParams.get("utm_content") || null,
      term: u.searchParams.get("utm_term") || null,
    };
  } catch {
    return {};
  }
}

function getStoredUtms() {
  try {
    const stored = browser.sessionStorage.getItem("evrt_utm");
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function storeUtms(utms) {
  try {
    if (utms && Object.values(utms).some(v => v)) {
      browser.sessionStorage.setItem("evrt_utm", JSON.stringify(utms));
    }
  } catch {}
}

function handleFromUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/products\/([^/?#]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function send(eventType, ctx, extra) {
  const url = (ctx && ctx.context && ctx.context.window && ctx.context.window.location && ctx.context.window.location.href) || "";
  const referrer = (ctx && ctx.context && ctx.context.document && ctx.context.document.referrer) || "";

  // Capture and persist UTMs from first hit in the session
  const fresh = parseUtmsFromUrl(url);
  let utms = getStoredUtms();
  if (!utms || !utms.source) {
    utms = fresh;
    storeUtms(utms);
  }

  const payload = {
    session_id: getOrMakeSessionId(),
    event_type: eventType,
    page_path: url ? new URL(url).pathname + (new URL(url).search || "") : null,
    utms: utms || {},
    referrer: referrer || null,
    landing_page_handle: handleFromUrl(url),
    ...(extra || {}),
  };

  try {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch (e) {
    // never throw from the pixel — silent failure is correct
  }
}

// === Subscribe to Shopify Customer Events ===

analytics.subscribe("page_viewed", event => {
  send("page_view", event);
});

analytics.subscribe("product_viewed", event => {
  send("page_view", event, {
    shopify_product_id: event.data?.productVariant?.product?.id || null,
  });
});

analytics.subscribe("product_added_to_cart", event => {
  send("add_to_cart", event, {
    shopify_product_id: event.data?.cartLine?.merchandise?.product?.id || null,
    event_value: Number(event.data?.cartLine?.cost?.totalAmount?.amount) || null,
  });
});

analytics.subscribe("product_removed_from_cart", event => {
  send("remove_from_cart", event, {
    shopify_product_id: event.data?.cartLine?.merchandise?.product?.id || null,
  });
});

analytics.subscribe("checkout_started", event => {
  send("checkout_start", event, {
    event_value: Number(event.data?.checkout?.totalPrice?.amount) || null,
  });
});

analytics.subscribe("checkout_completed", event => {
  send("order_placed", event, {
    event_value: Number(event.data?.checkout?.totalPrice?.amount) || null,
    event_metadata: { order_id: event.data?.checkout?.order?.id || null },
  });
});
```

- **Save** → **Connect** the pixel.

## 2. Verify (1 min)

In Safari, open `https://everestlabs.co/en-gb/products/kryo_` then DevTools → Network → filter `track/session`. Should see a `POST` with HTTP 200. Reload — second `POST`. Click "Add to Cart" — third `POST`.

Then in Supabase:
```sql
SELECT event_type, count(*), MAX(ts)
FROM attribution_touches
WHERE ts > NOW() - INTERVAL '5 minutes'
GROUP BY event_type;
```
Should show real rows.

## 3. Register the order webhook (3 min)

The Vercel route at `/api/webhooks/shopify/order-created` already exists. You just need to wire the webhook in Shopify Admin.

Shopify Admin → **Settings** → **Notifications** → scroll to **Webhooks** → **Create webhook**.

- **Event:** Order creation
- **Format:** JSON
- **URL:** `https://everest-calendar.vercel.app/api/webhooks/shopify/order-created`
- **Webhook API version:** Latest stable
- **Secret:** copy this value to Vercel env as `SHOPIFY_WEBHOOK_SECRET` (the route validates HMAC using it).

Once saved, place a real test order. Confirm:
```sql
SELECT event_type, event_value, ts
FROM attribution_touches
WHERE event_type = 'order_placed'
ORDER BY ts DESC LIMIT 5;
```

## What this unlocks

- `lp_funnel_daily` view starts populating per LP per day
- Skill C reads real per-arm metrics (sessions, ATC rate, bounce, conversion)
- Skill D (LP friction watcher) starts producing real friction-zone test hypotheses
- The morning-briefing rollup includes real ROAS / CPA per LP arm
