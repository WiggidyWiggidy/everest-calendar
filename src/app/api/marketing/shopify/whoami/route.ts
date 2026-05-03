// /api/marketing/shopify/whoami
// Diagnostic: returns the connected Shopify shop + app identity + current API scopes.
// Used to verify which Shopify app is wired to this system before granting new scopes.
//
// Auth: x-sync-secret.
// Cache-bust: 2026-05-03T01:11Z (force fresh deploy → cold-start lambdas → fresh shopify token)

import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';

function authOk(req: NextRequest): boolean {
  const secret = req.headers.get('x-sync-secret');
  return Boolean(secret && secret === process.env.MARKETING_SYNC_SECRET);
}

export async function GET(request: NextRequest) {
  if (!authOk(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let shopifyUrl: string, shopifyToken: string;
  try {
    shopifyUrl = getShopifyStoreUrl();
    shopifyToken = await getShopifyToken();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const out: Record<string, unknown> = {
    shop_url: shopifyUrl,
    shopify_client_id: process.env.SHOPIFY_CLIENT_ID || null,  // public-side ID, not secret
    has_client_secret: Boolean(process.env.SHOPIFY_CLIENT_SECRET),
  };

  // 1. Shop identity (always works with any scope)
  try {
    const shopRes = await fetch(`https://${shopifyUrl}/admin/api/2024-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': shopifyToken },
    });
    if (shopRes.ok) {
      const shopPayload = await shopRes.json();
      out.shop = {
        id: shopPayload.shop?.id,
        name: shopPayload.shop?.name,
        domain: shopPayload.shop?.domain,
        myshopify_domain: shopPayload.shop?.myshopify_domain,
        primary_locale: shopPayload.shop?.primary_locale,
        country_name: shopPayload.shop?.country_name,
        plan_name: shopPayload.shop?.plan_name,
        plan_display_name: shopPayload.shop?.plan_display_name,
      };
    } else {
      out.shop_error = `HTTP ${shopRes.status}`;
    }
  } catch (e) {
    out.shop_error = (e as Error).message;
  }

  // 2. Current OAuth access scopes (no scope required, exposes what we have)
  try {
    const scopesRes = await fetch(`https://${shopifyUrl}/admin/oauth/access_scopes.json`, {
      headers: { 'X-Shopify-Access-Token': shopifyToken },
    });
    if (scopesRes.ok) {
      const scopesPayload = await scopesRes.json();
      out.current_scopes = (scopesPayload.access_scopes || []).map((s: { handle: string }) => s.handle).sort();
    } else {
      out.scopes_error = `HTTP ${scopesRes.status}`;
    }
  } catch (e) {
    out.scopes_error = (e as Error).message;
  }

  // 3. App identity via GraphQL — currentAppInstallation returns the app this token belongs to
  try {
    const appRes = await fetch(`https://${shopifyUrl}/admin/api/2025-04/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': shopifyToken,
      },
      body: JSON.stringify({
        query: `
          query {
            currentAppInstallation {
              id
              app {
                id
                handle
                title
                description
                appStoreAppUrl
                installUrl
                developerName
              }
              accessScopes {
                handle
                description
              }
              launchUrl
              uninstallUrl
            }
          }
        `,
      }),
    });
    if (appRes.ok) {
      const appPayload = await appRes.json();
      const inst = appPayload?.data?.currentAppInstallation;
      if (inst) {
        out.app = {
          installation_id: inst.id,
          app_id: inst.app?.id,
          app_handle: inst.app?.handle,
          app_title: inst.app?.title,
          app_description: inst.app?.description?.slice(0, 200),
          app_store_url: inst.app?.appStoreAppUrl,
          install_url: inst.app?.installUrl,
          developer_name: inst.app?.developerName,
          launch_url: inst.launchUrl,
          uninstall_url: inst.uninstallUrl,
          access_scopes_count: (inst.accessScopes || []).length,
        };
      }
    } else {
      out.app_error = `HTTP ${appRes.status}: ${(await appRes.text()).slice(0, 200)}`;
    }
  } catch (e) {
    out.app_error = (e as Error).message;
  }

  // 4. Required scopes diff — what the system needs vs what's granted
  const required = [
    'write_products', 'read_products',
    'read_publications', 'write_publications',
    'read_themes', 'write_themes',
    'read_files', 'write_files',
  ];
  const current = (out.current_scopes as string[] | undefined) || [];
  out.scope_audit = {
    required,
    granted: required.filter((s) => current.includes(s)),
    missing: required.filter((s) => !current.includes(s)),
  };

  return NextResponse.json(out);
}
