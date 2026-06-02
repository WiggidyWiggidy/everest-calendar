#!/usr/bin/env python3
"""Upgrade the deployed v2 attribution pixel without replacing its proven behavior."""
from pathlib import Path
import sys

source = Path(sys.argv[1])
target = Path(sys.argv[2])
pixel = source.read_text()

replacements = [
    (
        "      fbc: getCookie('_fbc'),\n",
        "      fbc: getCookie('_fbc'),\n      fbclid: qAny(p, ['fbclid']),\n",
    ),
    (
        "  var currentTouch = readAttribution();\n",
        "  if (getQuery().get('el_internal') === '1') setCookie('__el_internal', '1', 395);\n"
        "  var currentTouch = readAttribution();\n",
    ),
    (
        "    fbc: sessionTouch.fbc || firstTouch.fbc || getCookie('_fbc'),\n",
        "    fbc: sessionTouch.fbc || firstTouch.fbc || getCookie('_fbc'),\n"
        "    fbclid: sessionTouch.fbclid || firstTouch.fbclid || null,\n"
        "    is_internal: getCookie('__el_internal') === '1',\n",
    ),
    (
        "  function once(key, fn) { var k='__el_once_'+key; if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k,'1'); fn(); }\n",
        "  function once(key, fn) { var k='__el_once_'+key; if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k,'1'); fn(); }\n"
        "  function syncCartAttributes() {\n"
        "    var attrs = { el_visitor_id__: ctx.anonymous_id, el_session_id__: ctx.session_id,\n"
        "      el_first_meta_ad_id__: firstTouch.ad_id || '', el_last_meta_ad_id__: sessionTouch.ad_id || '',\n"
        "      el_meta_campaign_id__: sessionTouch.campaign_id || '', el_meta_adset_id__: sessionTouch.adset_id || '' };\n"
        "    try { fetch('/cart/update.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attributes: attrs }) }).catch(function() {}); } catch(e) {}\n"
        "  }\n",
    ),
    (
        "  if (ctx.shopify_product_id || /^\\/products\\//.test(window.location.pathname)) send('product_viewed');\n",
        "  if (ctx.shopify_product_id || /^\\/products\\//.test(window.location.pathname)) send('product_viewed');\n"
        "  syncCartAttributes();\n",
    ),
    (
        "        p.then(function(res) { if (res && res.ok) send('product_added_to_cart'); else send('cart_add_failed', { event_properties: { status: res && res.status } }); }).catch(function() { send('cart_add_failed'); });\n",
        "        p.then(function(res) { if (res && res.ok) { send('product_added_to_cart'); syncCartAttributes(); } else send('cart_add_failed', { event_properties: { status: res && res.status } }); }).catch(function() { send('cart_add_failed'); });\n",
    ),
    (
        "        var label = ((el.id || '') + ' ' + (el.className || '') + ' ' + (el.getAttribute('data-section-type') || '')).toLowerCase();\n",
        "        var label = ((el.id || '') + ' ' + (el.className || '') + ' ' + (el.getAttribute('data-section-type') || '')).toLowerCase();\n"
        "        var milestone = (el.getAttribute('data-analytics-milestone') || '').toLowerCase();\n"
        "        if (milestone === 'offer_section_view' || milestone === 'guarantee_section_view') once(milestone, function(){ send(milestone); });\n",
    ),
    (
        "    Array.prototype.slice.call(document.querySelectorAll('section, [id], [class*=\"review\"], [class*=\"comparison\"], [class*=\"testimonial\"]')).forEach(function(el) { observer.observe(el); });\n",
        "    Array.prototype.slice.call(document.querySelectorAll('section, [id], [data-analytics-milestone], [class*=\"review\"], [class*=\"comparison\"], [class*=\"testimonial\"]')).forEach(function(el) { observer.observe(el); });\n",
    ),
]

for old, new in replacements:
    if new in pixel:
        continue
    if old not in pixel:
        raise SystemExit(f"Expected pixel contract missing: {old[:90]!r}")
    pixel = pixel.replace(old, new, 1)

pixel = pixel.replace('data-pixel-version="2.0"', 'data-pixel-version="2.1"', 1)
target.write_text(pixel)
print(f"Wrote {target} ({len(pixel)} bytes)")
