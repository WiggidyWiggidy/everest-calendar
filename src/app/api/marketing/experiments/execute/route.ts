import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { auditLog, checkThrottle, recordThrottle } from '@/lib/marketing-safety';
import type { PageExecutionSpec, CreativeExecutionSpec } from '@/types';

// Execute an approved experiment by calling the appropriate builder
// landing_page -> Shopify page builder
// creative -> Ad creative + Meta ad creation
// copy -> AI variation of existing page
// Supports both user session auth and sync secret auth

export async function POST(request: NextRequest) {
  try {
    let userId: string;
    let supabase;
    const syncSecret = request.headers.get('x-sync-secret');

    if (syncSecret === process.env.MARKETING_SYNC_SECRET) {
      userId = '174f2dff-7a96-464c-a919-b473c328d531';
      supabase = createServiceClient();
    } else {
      supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      userId = user.id;
    }

    const { experiment_id } = await request.json();
    if (!experiment_id) {
      return NextResponse.json({ error: 'experiment_id required' }, { status: 400 });
    }

    // Fetch experiment
    const { data: experiment, error: fetchErr } = await supabase
      .from('marketing_experiments')
      .select('*')
      .eq('id', experiment_id)
      .eq('user_id', userId)
      .single();

    if (fetchErr || !experiment) {
      return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });
    }

    if (experiment.status !== 'draft') {
      return NextResponse.json({ error: `Experiment status is '${experiment.status}', must be 'draft' to execute` }, { status: 400 });
    }

    if (!experiment.execution_spec) {
      return NextResponse.json({ error: 'Experiment has no execution_spec -- cannot auto-execute' }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://everest-calendar.vercel.app';
    const results: Record<string, unknown> = { experiment_type: experiment.type };

    switch (experiment.type) {
      case 'landing_page': {
        const spec = experiment.execution_spec as PageExecutionSpec;
        if (!spec.sections || spec.sections.length === 0) {
          return NextResponse.json({ error: 'execution_spec.sections required for landing_page experiments' }, { status: 400 });
        }

        // Throttle check
        const throttle = await checkThrottle(supabase, userId, 'page_publish');
        if (!throttle.allowed) {
          return NextResponse.json({ error: `Page creation throttled (${throttle.count}/${throttle.limit} today)` }, { status: 429 });
        }

        // Create a landing_pages record
        const pageName = spec.page_title || experiment.name;
        const { data: pageRecord, error: pageErr } = await supabase
          .from('landing_pages')
          .insert({
            user_id: userId,
            name: pageName,
            shopify_url: `https://everestlabs.co/pages/${pageName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            status: 'testing',
            notes: `Auto-created from experiment: ${experiment.name}`,
          })
          .select()
          .single();

        if (pageErr) {
          results.page_error = pageErr.message;
          break;
        }

        // Call the Shopify page builder
        const shopifyRes = await fetch(`${baseUrl}/api/marketing/shopify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: request.headers.get('cookie') || '',
            'x-sync-secret': process.env.MARKETING_SYNC_SECRET || '',
          },
          body: JSON.stringify({
            landing_page_id: pageRecord.id,
            page_title: pageName,
            variant_id: spec.variant_id,
            product_price: spec.product_price,
            sections: spec.sections,
          }),
        });

        if (shopifyRes.ok) {
          const shopifyData = await shopifyRes.json();
          results.shopify = shopifyData;
          results.preview_url = shopifyData.preview_url;
          results.admin_url = shopifyData.admin_url;
        } else {
          const errData = await shopifyRes.json().catch(() => ({}));
          results.shopify_error = errData;
        }

        await recordThrottle(supabase, userId, 'page_publish');
        break;
      }

      case 'creative': {
        const spec = experiment.execution_spec as CreativeExecutionSpec;
        if (!spec.creatives || spec.creatives.length === 0) {
          return NextResponse.json({ error: 'execution_spec.creatives required for creative experiments' }, { status: 400 });
        }

        const createdAds: Array<Record<string, unknown>> = [];

        for (const creative of spec.creatives) {
          // Create ad_creatives record
          const { data: adCreative, error: adErr } = await supabase
            .from('ad_creatives')
            .insert({
              user_id: userId,
              experiment_id: experiment.id,
              headline: creative.headline,
              body_copy: creative.body_copy,
              cta_text: creative.cta_text || 'Shop Now',
              target_audience: creative.target_audience || {
                geo_locations: { countries: ['AE'] },
                age_min: 25,
                age_max: 55,
              },
              daily_budget: creative.daily_budget || 15,
              status: 'draft',
            })
            .select()
            .single();

          if (adErr) {
            createdAds.push({ error: adErr.message, headline: creative.headline });
            continue;
          }

          // If image URL provided, try to composite
          if (creative.image_url) {
            try {
              const compositeRes = await fetch(`${baseUrl}/api/marketing/ads/composite`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  cookie: request.headers.get('cookie') || '',
            'x-sync-secret': process.env.MARKETING_SYNC_SECRET || '',
                },
                body: JSON.stringify({
                  image_url: creative.image_url,
                  headline: creative.headline,
                  body_text: creative.body_copy,
                  cta_text: creative.cta_text || 'Shop Now',
                  format: creative.format || '1080x1080',
                }),
              });

              if (compositeRes.ok) {
                const compositeData = await compositeRes.json();
                // Update ad creative with composite image
                await supabase
                  .from('ad_creatives')
                  .update({ composite_image_url: compositeData.public_url })
                  .eq('id', adCreative.id);
                createdAds.push({
                  ad_creative_id: adCreative.id,
                  headline: creative.headline,
                  composite_url: compositeData.public_url,
                  status: 'draft_with_image',
                });
              } else {
                createdAds.push({
                  ad_creative_id: adCreative.id,
                  headline: creative.headline,
                  status: 'draft_no_image',
                  note: 'Composite failed -- ad brief created without image',
                });
              }
            } catch {
              createdAds.push({
                ad_creative_id: adCreative.id,
                headline: creative.headline,
                status: 'draft_no_image',
              });
            }
          } else {
            createdAds.push({
              ad_creative_id: adCreative.id,
              headline: creative.headline,
              status: 'draft_no_image',
              note: 'No image_url in spec -- ad brief only',
            });
          }
        }

        results.creatives = createdAds;
        break;
      }

      case 'copy': {
        // AI variation of existing page
        const spec = experiment.execution_spec as Record<string, unknown>;
        const landingPageId = spec.landing_page_id as string;
        if (!landingPageId) {
          return NextResponse.json({ error: 'execution_spec.landing_page_id required for copy experiments' }, { status: 400 });
        }

        // Create a page_proposal from the experiment hypothesis
        const { data: proposal } = await supabase
          .from('page_proposals')
          .insert({
            user_id: userId,
            landing_page_id: landingPageId,
            diagnosis: experiment.hypothesis || 'AI-generated variation based on experiment hypothesis',
            proposed_sections: spec.proposed_sections || [],
            status: 'approved',
          })
          .select()
          .single();

        if (!proposal) {
          results.proposal_error = 'Failed to create page proposal';
          break;
        }

        // Generate variation
        const variationRes = await fetch(`${baseUrl}/api/marketing/shopify/generate-variation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: request.headers.get('cookie') || '',
            'x-sync-secret': process.env.MARKETING_SYNC_SECRET || '',
          },
          body: JSON.stringify({
            landing_page_id: landingPageId,
            proposal_id: proposal.id,
          }),
        });

        if (variationRes.ok) {
          const variationData = await variationRes.json();
          results.variation = variationData;

          // Create as Shopify draft
          if (variationData.body_html) {
            const shopifyRes = await fetch(`${baseUrl}/api/marketing/shopify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                cookie: request.headers.get('cookie') || '',
            'x-sync-secret': process.env.MARKETING_SYNC_SECRET || '',
              },
              body: JSON.stringify({
                landing_page_id: landingPageId,
                page_title: `${experiment.name} - ${new Date().toLocaleDateString()}`,
                body_html: variationData.body_html,
              }),
            });

            if (shopifyRes.ok) {
              const shopifyData = await shopifyRes.json();
              results.shopify = shopifyData;
              results.preview_url = shopifyData.preview_url;
              results.admin_url = shopifyData.admin_url;
            }
          }
        } else {
          results.variation_error = await variationRes.json().catch(() => ({}));
        }
        break;
      }

      default: {
        results.message = `Experiment type '${experiment.type}' does not have auto-execution yet. Execution spec saved for manual implementation.`;
        break;
      }
    }

    // Update experiment status to running
    await supabase
      .from('marketing_experiments')
      .update({
        status: 'running',
        start_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
      })
      .eq('id', experiment_id)
      .eq('user_id', userId);

    // Audit log
    await auditLog(
      supabase, userId,
      'experiment_executed',
      'marketing_experiment',
      experiment_id,
      { status: 'draft', type: experiment.type },
      { status: 'running', ...results },
      'user',
      { experiment_name: experiment.name }
    );

    return NextResponse.json({
      success: true,
      experiment_id,
      experiment_name: experiment.name,
      ...results,
    });
  } catch (err) {
    console.error('experiments/execute POST error:', err);
    return NextResponse.json({ error: 'Experiment execution failed' }, { status: 500 });
  }
}
