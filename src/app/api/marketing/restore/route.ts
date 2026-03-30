import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getShopifyToken, getShopifyStoreUrl } from '@/lib/shopify-auth';
import { auditLog } from '@/lib/marketing-safety';

// POST: Restore from a backup snapshot
// SAFETY: Does NOT overwrite existing pages. Creates a NEW draft page with the backed-up content.
// For Meta ads: preserves the config for manual re-creation (no API restore possible).

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { backup_id } = await request.json();
    if (!backup_id) {
      return NextResponse.json({ error: 'backup_id required' }, { status: 400 });
    }

    // Fetch the backup
    const { data: backup, error: fetchErr } = await supabase
      .from('content_backups')
      .select('*')
      .eq('id', backup_id)
      .eq('user_id', user.id)
      .single();

    if (fetchErr || !backup) {
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    }

    if (!backup.can_restore) {
      return NextResponse.json({ error: 'This backup cannot be restored' }, { status: 400 });
    }

    const snapshotData = backup.snapshot_data as Record<string, unknown>;
    const results: Record<string, unknown> = {
      backup_id,
      resource_type: backup.resource_type,
      resource_id: backup.resource_id,
    };

    switch (backup.resource_type) {
      case 'shopify_page': {
        // Create a NEW draft page with the backed-up HTML (never overwrite existing)
        let shopifyUrl: string;
        let shopifyToken: string;
        try {
          shopifyUrl = getShopifyStoreUrl();
          shopifyToken = await getShopifyToken();
        } catch (e) {
          return NextResponse.json({ error: (e as Error).message }, { status: 400 });
        }

        const originalTitle = (snapshotData.title as string) || 'Restored Page';
        const restoredTitle = `${originalTitle} (Restored ${new Date().toLocaleDateString()})`;

        const shopifyRes = await fetch(
          `https://${shopifyUrl}/admin/api/2024-01/pages.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': shopifyToken,
            },
            body: JSON.stringify({
              page: {
                title: restoredTitle,
                body_html: snapshotData.body_html,
                published: false, // ALWAYS draft
              },
            }),
          }
        );

        if (!shopifyRes.ok) {
          const err = await shopifyRes.text();
          return NextResponse.json({ error: 'Shopify restore failed: ' + err }, { status: 500 });
        }

        const newPage = await shopifyRes.json();
        results.restored_page_id = newPage.page?.id;
        results.admin_url = `https://${shopifyUrl}/admin/pages/${newPage.page?.id}`;
        results.note = 'Restored as a NEW draft page. The original page was not modified.';
        break;
      }

      case 'ad_creative':
      case 'meta_ad':
      case 'meta_campaign': {
        // Meta ads can't be programmatically restored. Preserve config for manual re-creation.
        results.restored = false;
        results.config_preserved = snapshotData;
        results.note = 'Meta ads cannot be restored via API. The full configuration is preserved above for manual re-creation.';
        break;
      }

      case 'landing_page': {
        // Restore the local record (create a new one, don't overwrite)
        const { data: restored, error: restoreErr } = await supabase
          .from('landing_pages')
          .insert({
            user_id: user.id,
            name: `${(snapshotData.name as string) || 'Restored'} (Restored)`,
            url: snapshotData.url,
            status: 'draft',
            page_type: snapshotData.page_type || 'product',
          })
          .select('id')
          .single();

        results.restored_landing_page_id = restored?.id;
        if (restoreErr) results.error = restoreErr.message;
        results.note = 'Restored as a NEW draft landing page record.';
        break;
      }

      default:
        results.note = `Restore not supported for resource type: ${backup.resource_type}`;
    }

    // Mark backup as restored
    await supabase
      .from('content_backups')
      .update({ restored_at: new Date().toISOString() })
      .eq('id', backup_id);

    // Audit log
    await auditLog(supabase, user.id, 'restore_executed', backup.resource_type, backup.resource_id,
      null, results as Record<string, unknown>, 'user', { backup_id });

    return NextResponse.json({ restored: true, ...results });
  } catch (err) {
    console.error('restore error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
