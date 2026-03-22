import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const VISION_PROMPT = `You are categorising a marketing image for an ice shower / cold therapy product company called Everest Labs. Their target audience is health-conscious, performance-oriented consumers — athletes, biohackers, wellness enthusiasts.

Return ONLY valid JSON — no markdown, no code fences, no commentary. Exactly this structure:
{
  "ai_category": "product_hero",
  "ai_description": "Short 1-2 sentence description of what the image shows",
  "ai_tags": ["tag1", "tag2", "tag3"],
  "ai_suitable_for": ["hero", "key_benefits"]
}

Category options (pick exactly one):
- product_hero: The ice shower product itself as the main subject
- lifestyle: Person using the product or in a wellness/performance context
- feature: Close-up of a specific product feature or detail
- social_proof: Testimonial image, before/after, real person review
- packaging: Product packaging, box, branding materials
- ingredient: Specific component, technology detail, material
- other: Anything else

ai_suitable_for options (pick 1-4 that apply):
hero, key_benefits, how_it_works, science_proof, social_proof, comparison, faq, cta_banner`;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    // Read file as buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = file.type || 'image/jpeg';
    const isImage = mimeType.startsWith('image/');

    // Build storage path
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${user.id}/${timestamp}-${safeName}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('marketing-assets')
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json({ error: 'Upload failed: ' + uploadError.message }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('marketing-assets')
      .getPublicUrl(storagePath);
    const publicUrl = urlData.publicUrl;

    // AI categorisation for images
    let aiCategory: string | null = null;
    let aiDescription: string | null = null;
    let aiTags: string[] | null = null;
    let aiSuitableFor: string[] | null = null;

    if (isImage && process.env.ANTHROPIC_API_KEY) {
      try {
        const base64 = buffer.toString('base64');
        const visionResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 400,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                      data: base64,
                    },
                  },
                  { type: 'text', text: VISION_PROMPT },
                ],
              },
            ],
          }),
        });

        if (visionResponse.ok) {
          const visionData = await visionResponse.json();
          const visionText = visionData.content?.[0]?.text ?? '';
          try {
            const parsed = JSON.parse(visionText);
            aiCategory = parsed.ai_category ?? null;
            aiDescription = parsed.ai_description ?? null;
            aiTags = parsed.ai_tags ?? null;
            aiSuitableFor = parsed.ai_suitable_for ?? null;

            // Log tokens
            const usage = visionData.usage ?? { input_tokens: 0, output_tokens: 0 };
            const costUsd = (usage.input_tokens / 1_000_000) * 3.0 + (usage.output_tokens / 1_000_000) * 15.0;
            void supabase.from('ai_usage_log').insert({
              user_id: user.id,
              operation: 'media_asset_vision',
              input_tokens: usage.input_tokens,
              output_tokens: usage.output_tokens,
              cost_usd: costUsd,
            });
          } catch {
            console.warn('Could not parse vision JSON:', visionText);
          }
        }
      } catch (visionErr) {
        console.warn('Vision categorisation failed (non-fatal):', visionErr);
      }
    }

    // Insert into media_assets
    const { data: asset, error: insertError } = await supabase
      .from('media_assets')
      .insert({
        user_id: user.id,
        storage_path: storagePath,
        public_url: publicUrl,
        filename: file.name,
        file_size: buffer.length,
        mime_type: mimeType,
        ai_category: aiCategory,
        ai_description: aiDescription,
        ai_tags: aiTags,
        ai_suitable_for: aiSuitableFor,
        status: 'active',
      })
      .select()
      .single();

    if (insertError) {
      console.error('DB insert error:', insertError);
      return NextResponse.json({ error: 'Failed to save asset record' }, { status: 500 });
    }

    return NextResponse.json({ asset });
  } catch (err) {
    console.error('media-assets upload error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
