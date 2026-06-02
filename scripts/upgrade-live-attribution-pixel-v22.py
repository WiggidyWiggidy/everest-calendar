#!/usr/bin/env python3
import json, os, urllib.parse, urllib.request, hashlib, datetime
BASE='https://everest-calendar.vercel.app'
SECRET=os.environ['MARKETING_SYNC_SECRET']
THEME=167131775284

def req(path, method='GET', body=None):
    data=None if body is None else json.dumps(body).encode()
    r=urllib.request.Request(BASE+path, data=data, method=method, headers={'x-sync-secret':SECRET,'Content-Type':'application/json'})
    with urllib.request.urlopen(r, timeout=30) as x: return json.loads(x.read())

def get(key): return req('/api/marketing/theme/asset?theme_id=%s&key=%s'%(THEME,urllib.parse.quote(key,safe='')))['value']
def deploy(key,value): return req('/api/marketing/theme/deploy-asset','POST',{'theme_id':THEME,'key':key,'value':value})
def h(s): return hashlib.sha256(s.encode()).hexdigest()[:16]

def patch(pixel):
    original=pixel
    pixel=pixel.replace('data-pixel-version="2.0"','data-pixel-version="2.2"',1).replace('data-pixel-version="2.1"','data-pixel-version="2.2"',1)
    # Keep the proven v2.1 reliability upgrades if the live inline block is still v2.0.
    if "      fbclid: qAny(p, ['fbclid'])," not in pixel:
        pixel=pixel.replace("      fbc: getCookie('_fbc'),\n", "      fbc: getCookie('_fbc'),\n      fbclid: qAny(p, ['fbclid']),\n",1)
    if "getQuery().get('el_internal')" not in pixel:
        pixel=pixel.replace("  var currentTouch = readAttribution();\n", "  if (getQuery().get('el_internal') === '1') setCookie('__el_internal', '1', 395);\n  var currentTouch = readAttribution();\n",1)
    if "    is_internal: getCookie('__el_internal') === '1'," not in pixel:
        pixel=pixel.replace("    fbc: sessionTouch.fbc || firstTouch.fbc || getCookie('_fbc'),\n", "    fbc: sessionTouch.fbc || firstTouch.fbc || getCookie('_fbc'),\n    fbclid: sessionTouch.fbclid || firstTouch.fbclid || null,\n    is_internal: getCookie('__el_internal') === '1',\n",1)
    marker="  function once(key, fn) { var k='__el_once_'+key; if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k,'1'); fn(); }\n"
    helpers="""  function once(key, fn) { var k='__el_once_'+key; if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k,'1'); fn(); }
  var lastAtcAt = 0;
  var observedCartCount = null;
  function syncCartAttributes() {
    var attrs = { el_visitor_id__: ctx.anonymous_id, el_session_id__: ctx.session_id,
      el_first_meta_ad_id__: firstTouch.ad_id || '', el_last_meta_ad_id__: sessionTouch.ad_id || '',
      el_meta_campaign_id__: sessionTouch.campaign_id || '', el_meta_adset_id__: sessionTouch.adset_id || '' };
    try { fetch('/cart/update.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attributes: attrs }) }).catch(function() {}); } catch(e) {}
  }
  function fireAtc(source, extra) {
    var now = Date.now();
    if (now - lastAtcAt < 2500) return;
    lastAtcAt = now;
    extra = extra || {};
    extra.event_properties = Object.assign({}, extra.event_properties || {}, { tracking_source: source });
    send('product_added_to_cart', extra);
    syncCartAttributes();
  }
  function readCartCount(done) {
    try { fetch('/cart.js', { headers: { 'Accept': 'application/json' } }).then(function(r){ return r.ok ? r.json() : null; }).then(function(cart){ done(cart && typeof cart.item_count === 'number' ? cart.item_count : null); }).catch(function(){ done(null); }); } catch(e) { done(null); }
  }
  function refreshCartBaseline() { readCartCount(function(count){ if (count !== null) observedCartCount = count; }); }
  function verifyCartDelta(source) {
    setTimeout(function(){ readCartCount(function(count){
      if (count !== null && observedCartCount !== null && count > observedCartCount) fireAtc(source, { event_properties: { prior_cart_count: observedCartCount, cart_count: count } });
      if (count !== null) observedCartCount = count;
    }); }, 700);
  }
"""
    if 'function fireAtc(source, extra)' not in pixel:
        if marker not in pixel: raise SystemExit('once marker missing')
        # remove existing v2.1 cart attribute helper so helpers install one canonical copy
        old_sync="""  function syncCartAttributes() {
    var attrs = { el_visitor_id__: ctx.anonymous_id, el_session_id__: ctx.session_id,
      el_first_meta_ad_id__: firstTouch.ad_id || '', el_last_meta_ad_id__: sessionTouch.ad_id || '',
      el_meta_campaign_id__: sessionTouch.campaign_id || '', el_meta_adset_id__: sessionTouch.adset_id || '' };
    try { fetch('/cart/update.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attributes: attrs }) }).catch(function() {}); } catch(e) {}
  }
"""
        pixel=pixel.replace(marker+old_sync, helpers, 1) if marker+old_sync in pixel else pixel.replace(marker, helpers,1)
    if "  refreshCartBaseline();\n" not in pixel:
        pixel=pixel.replace("  if (ctx.shopify_product_id || /^\\/products\\//.test(window.location.pathname)) send('product_viewed');\n", "  if (ctx.shopify_product_id || /^\\/products\\//.test(window.location.pathname)) send('product_viewed');\n  syncCartAttributes();\n  refreshCartBaseline();\n",1)
    pixel=pixel.replace("        send('product_added_to_cart', { shopify_variant_id: line.merchandise && line.merchandise.id, quantity: line.quantity, event_value: line.cost && line.cost.totalAmount && line.cost.totalAmount.amount });", "        fireAtc('shopify_analytics_subscribe', { shopify_variant_id: line.merchandise && line.merchandise.id, quantity: line.quantity, event_value: line.cost && line.cost.totalAmount && line.cost.totalAmount.amount });")
    pixel=pixel.replace("        p.then(function(res) { if (res && res.ok) send('product_added_to_cart'); else send('cart_add_failed', { event_properties: { status: res && res.status } }); }).catch(function() { send('cart_add_failed'); });", "        p.then(function(res) { if (res && res.ok) fireAtc('fetch_cart_add'); else send('cart_add_failed', { event_properties: { status: res && res.status } }); }).catch(function() { send('cart_add_failed'); });")
    pixel=pixel.replace("        p.then(function(res) { if (res && res.ok) { send('product_added_to_cart'); syncCartAttributes(); } else send('cart_add_failed', { event_properties: { status: res && res.status } }); }).catch(function() { send('cart_add_failed'); });", "        p.then(function(res) { if (res && res.ok) fireAtc('fetch_cart_add'); else send('cart_add_failed', { event_properties: { status: res && res.status } }); }).catch(function() { send('cart_add_failed'); });")
    xhr_block="""
  if (window.XMLHttpRequest && !window.__el_xhr_patched) {
    window.__el_xhr_patched = true;
    var xhrOpen = XMLHttpRequest.prototype.open;
    var xhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) { this.__el_cart_add = /\\/cart\\/add/.test(String(url || '')); return xhrOpen.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function() {
      if (this.__el_cart_add) {
        send('cart_add_request', { event_properties: { tracking_source: 'xhr_cart_add' } });
        this.addEventListener('load', function(){ if (this.status >= 200 && this.status < 400) fireAtc('xhr_cart_add'); else send('cart_add_failed', { event_properties: { status: this.status, tracking_source: 'xhr_cart_add' } }); });
      }
      return xhrSend.apply(this, arguments);
    };
  }

  document.addEventListener('submit', function(e) {
    var form = e.target;
    var action = form && form.getAttribute ? (form.getAttribute('action') || '') : '';
    if (/\\/cart\\/add/.test(action)) { send('cart_add_request', { event_properties: { tracking_source: 'native_cart_form' } }); verifyCartDelta('native_cart_form_delta'); }
  }, true);

"""
    click_marker="  document.addEventListener('click', function(e) {\n"
    if 'window.__el_xhr_patched' not in pixel:
        if click_marker not in pixel: raise SystemExit('click marker missing')
        pixel=pixel.replace(click_marker,xhr_block+click_marker,1)
    if "verifyCartDelta('cta_cart_delta')" not in pixel:
        needle="    var text = ((el.getAttribute('data-analytics-event') || '') + ' ' + (el.textContent || '') + ' ' + (el.id || '') + ' ' + (el.className || '')).toLowerCase();\n"
        pixel=pixel.replace(needle, needle+"    if (/add to cart|order now|buy now|reserve now/.test(text)) verifyCartDelta('cta_cart_delta');\n",1)
    return pixel

keys=['layout/theme.liquid','snippets/everest-attribution-pixel.liquid']
summary=[]
for key in keys:
    prior=get(key)
    nxt=patch(prior)
    open('/tmp/'+key.replace('/','__')+'.bak','w').write(prior)
    changed = nxt != prior
    result=deploy(key,nxt) if changed else {'success': True, 'skipped': True, 'reason': 'already_v22'}
    reread=get(key)
    assert 'data-pixel-version="2.2"' in reread and 'window.__el_xhr_patched' in reread and "verifyCartDelta('cta_cart_delta')" in reread
    summary.append({'key':key,'prior_bytes':len(prior),'next_bytes':len(reread),'prior_sha256_16':h(prior),'next_sha256_16':h(reread),'changed':changed,'verified_semantics':True,'deploy_success':result.get('success')})
print(json.dumps({'success':True,'theme_id':THEME,'deployed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'assets':summary},indent=2))
