import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Execute an approved marketing proposal by chaining the appropriate API calls
// Proposal types: page_variant, new_blog, new_creative, pause_ad, scale_ad, new_campaign

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { proposal_id } = await request.json();
    if (!proposal_id) {
      return NextResponse.json({ error: 'proposal_id required' }, { status: 400 });
    }

    // Fetch the proposal
    const { data: proposal, error: fetchErr } = await supabase
      .from('marketing_proposals')
      .select('*')
      .eq('id', proposal_id)
      .eq('user_id', user.id)
      .single();

    if (fetchErr || !proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    if (proposal.status !== 'approved') {
      return NextResponse.json({ error: `Proposal status is '${proposal.status}', must be 'approved'` }, { status: 400 });
    }

    const actionData = proposal.action_data ?? {};
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://everest-calendar.vercel.app';
    const results: Record<string, unknown> = { proposal_type: proposal.proposal_type };

    switch (proposal.proposal_type) {
      case 'page_variant': {
        // Chain: analyse existing page -> generate variation -> create on Shopify
        const { landing_page_id, variant_instructions } = actionData as {
          landing_page_id?: string;
          variant_instructions?: string;
        };

        if (!landing_page_id) {
          return NextResponse.json({ error: 'action_data.landing_page_id required for page_variant' }, { status: 400 });
        }

        // Step 1: Generate variation using the AI
        const variationRes = await fetch(`${baseUrl}/api/marketing/shopify/generate-variation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: request.headers.get('cookie') || '',
          },
          body: JSON.stringify({
            landing_page_id,
            proposal_id,
            instructions: variant_instructions || proposal.reasoning,
          }),
        });

        if (!variationRes.ok) {
          const err = await variationRes.json().catch(() => ({}));
          results.variation_error = err;
          break;
        }

        const variationData = await variationRes.json();
        results.variation = variationData;

        // Step 2: Create as Shopify draft
        if (variationData.body_html) {
          const shopifyRes = await fetch(`${baseUrl}/api/marketing/shopify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              cookie: request.headers.get('cookie') || '',
            },
            body: JSON.stringify({
              landing_page_id,
              page_title: `${actionData.page_title || 'Variant'} - ${new Date().toLocaleDateString()}`,
              body_html: variationData.body_html,
            }),
          });

          if (shopifyRes.ok) {
            results.shopify = await shopifyRes.json();
          } else {
            results.shopify_error = await shopifyRes.json().catch(() => ({}));
          }
        }
        break;
      }

      case 'new_blog': {
        // Chain: generate blog structure -> create on Shopify
        const { topic, keywords, tone, product_angle } = actionData as {
          topic?: string; keywords?: string[]; tone?: string; product_angle?: string;
        };

        if (!topic) {
          return NextResponse.json({ error: 'action_data.topic required for new_blog' }, { status: 400 });
        }

        // Step 1: Generate blog structure via AI
        const generateRes = await fetch(`${baseUrl}/api/marketing/blog/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: request.headers.get('cookie') || '',
          },
          body: JSON.stringify({ topic, keywords, tone, product_angle }),
        });

        if (!generateRes.ok) {
          results.generate_error = await generateRes.json().catch(() => ({}));
          break;
        }

        const blogData = await generateRes.json();
        results.generated = blogData;

        // Step 2: Create on Shopify as draft
        if (blogData.title && blogData.sections) {
          const createRes = await fetch(`${baseUrl}/api/marketing/blog/create`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              cookie: request.headers.get('cookie') || '',
            },
            body: JSON.stringify({
              title: blogData.title,
              sections: blogData.sections,
              meta_title: blogData.meta_title,
              meta_description: blogData.meta_description,
              proposal_id,
            }),
          });

          if (createRes.ok) {
            results.shopify = await createRes.json();
          } else {
            results.shopify_error = await createRes.json().catch(() => ({}));
          }
        }
        break;
      }

      case 'new_creative': {
        // Chain: find matching asset -> composite if template -> create Meta ad
        const { headline, body_copy, cta_text, target_audience, daily_budget, asset_category, template_id } = actionData as {
          headline?: string; body_copy?: string; cta_text?: string;
          target_audience?: Record<string, unknown>; daily_budget?: number;
          asset_category?: string; template_id?: string;
        };

        if (!headline || !body_copy) {
          return NextResponse.json({ error: 'action_data.headline and body_copy required for new_creative' }, { status: 400 });
        }

        // Step 1: Find best matching asset
        let assetQuery = supabase
          .from('media_assets')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('performance_score', { ascending: false, nullsFirst: false })
          .limit(1);

        if (asset_category) {
          assetQuery = assetQuery.eq('ai_category', asset_category);
        }

        const { data: assets } = await assetQuery;
        const asset = assets?.[0];

        if (!asset) {
          // Create asset request instead
          await supabase.from('asset_requests').insert({
            user_id: user.id,
            description: `Need ${asset_category || 'product'} image for ad: "${headline}"`,
            asset_type: 'image',
            status: 'requested',
          });
          results.asset_gap = `No matching ${asset_category || ''} asset found. Asset request created.`;
          break;
        }

        results.asset_used = { id: asset.id, canonical_name: asset.canonical_name, public_url: asset.public_url };

        // Step 2: Create the ad creative record + push to Meta
        const adRes = await fetch(`${baseUrl}/api/marketing/ads/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: request.headers.get('cookie') || '',
          },
          body: JSON.stringify({
            headline,
            body_copy,
            cta_text: cta_text || 'Shop Now',
            image_url: asset.public_url,
            media_asset_id: asset.id,
            template_id,
            target_audience,
            daily_budget: daily_budget || 10,
          }),
        });

        if (adRes.ok) {
          results.ad = await adRes.json();
        } else {
          results.ad_error = await adRes.json().catch(() => ({}));
        }
        break;
      }

      case 'pause_ad': {
        // Update ad_creatives status to paused
        const { ad_creative_id } = actionData as { ad_creative_id?: string };
        if (!ad_creative_id) {
          return NextResponse.json({ error: 'action_data.ad_creative_id required' }, { status: 400 });
        }

        const { error: pauseErr } = await supabase
          .from('ad_creatives')
          .update({ status: 'paused', updated_at: new Date().toISOString() })
          .eq('id', ad_creative_id)
          .eq('user_id', user.id);

        results.paused = !pauseErr;
        if (pauseErr) results.error = pauseErr.message;
        break;
      }

      case 'scale_ad': {
        // Update ad budget
        const { ad_creative_id, new_budget } = actionData as { ad_creative_id?: string; new_budget?: number };
        if (!ad_creative_id || !new_budget) {
          return NextResponse.json({ error: 'action_data.ad_creative_id and new_budget required' }, { status: 400 });
        }

        const { error: scaleErr } = await supabase
          .from('ad_creatives')
          .update({ daily_budget: new_budget, updated_at: new Date().toISOString() })
          .eq('id', ad_creative_id)
          .eq('user_id', user.id);

        results.scaled = !scaleErr;
        if (scaleErr) results.error = scaleErr.message;
        break;
      }

      default:
        results.message = `Proposal type '${proposal.proposal_type}' execution not yet implemented`;
    }

    // Mark proposal as executed
    await supabase
      .from('marketing_proposals')
      .update({ status: 'executed', executed_at: new Date().toISOString() })
      .eq('id', proposal_id)
      .eq('user_id', user.id);

    return NextResponse.json({ executed: true, ...results });
  } catch (err) {
    console.error('execute-proposal error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
