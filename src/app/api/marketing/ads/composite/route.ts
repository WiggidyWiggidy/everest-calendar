import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Composite an ad image using ImageMagick: overlay text on a product/lifestyle image
// Input: asset URL + headline + body + CTA + format
// Output: composited image uploaded to Supabase Storage

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const {
      media_asset_id,
      image_url,
      headline,
      body_text,
      cta_text,
      format = '1080x1080',
      background_color = '#0f1419',
    } = body as {
      media_asset_id?: string;
      image_url?: string;
      headline: string;
      body_text?: string;
      cta_text?: string;
      format?: string;
      background_color?: string;
    };

    if (!headline) {
      return NextResponse.json({ error: 'headline required' }, { status: 400 });
    }

    // Resolve image URL
    let sourceUrl = image_url;
    if (!sourceUrl && media_asset_id) {
      const { data: asset } = await supabase
        .from('media_assets')
        .select('public_url')
        .eq('id', media_asset_id)
        .eq('user_id', user.id)
        .single();
      sourceUrl = asset?.public_url;
    }

    if (!sourceUrl) {
      return NextResponse.json({ error: 'Either image_url or media_asset_id required' }, { status: 400 });
    }

    // Parse dimensions
    const [width, height] = format.split('x').map(Number);
    if (!width || !height) {
      return NextResponse.json({ error: 'Invalid format. Use WxH like 1080x1080' }, { status: 400 });
    }

    // Create temp directory
    const tmpDir = join(tmpdir(), `ad-composite-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    const inputPath = join(tmpDir, 'input.png');
    const outputPath = join(tmpDir, 'output.png');

    try {
      // Download source image
      const imgRes = await fetch(sourceUrl);
      if (!imgRes.ok) {
        return NextResponse.json({ error: 'Failed to download source image' }, { status: 400 });
      }
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      writeFileSync(inputPath, imgBuffer);

      // Build ImageMagick command
      // Create background canvas, resize + center the product image, add text overlays
      const escHeadline = headline.replace(/'/g, "\\'").replace(/"/g, '\\"');
      const escBody = (body_text || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
      const escCta = (cta_text || '').replace(/'/g, "\\'").replace(/"/g, '\\"');

      // Calculate text positions based on format
      const headlineSize = Math.round(width * 0.044); // ~48px at 1080
      const bodySize = Math.round(width * 0.022);      // ~24px at 1080
      const ctaSize = Math.round(width * 0.026);        // ~28px at 1080
      const imgSize = Math.round(width * 0.55);          // product image takes ~55% of width
      const padding = Math.round(width * 0.046);          // ~50px at 1080

      let cmd = `convert -size ${width}x${height} xc:"${background_color}" `;
      // Resize and overlay the product image (centered, upper portion)
      cmd += `\\( "${inputPath}" -resize ${imgSize}x${imgSize} -gravity center \\) -gravity north -geometry +0+${Math.round(height * 0.05)} -composite `;
      // Headline text
      cmd += `-gravity southwest -font Helvetica-Bold -pointsize ${headlineSize} -fill white -annotate +${padding}+${Math.round(height * 0.25)} "${escHeadline}" `;
      // Body text
      if (body_text) {
        cmd += `-gravity southwest -font Helvetica -pointsize ${bodySize} -fill "rgba(255,255,255,0.8)" -annotate +${padding}+${Math.round(height * 0.18)} "${escBody}" `;
      }
      // CTA button area
      if (cta_text) {
        const ctaY = Math.round(height * 0.08);
        cmd += `-gravity southwest -fill "#0d47a1" -draw "roundrectangle ${padding},${ctaY - 5} ${padding + cta_text.length * ctaSize * 0.7 + 40},${ctaY + ctaSize + 20} 20,20" `;
        cmd += `-fill white -font Helvetica-Bold -pointsize ${ctaSize} -annotate +${padding + 20}+${ctaY + 5} "${escCta}" `;
      }
      cmd += `"${outputPath}"`;

      execSync(cmd, { timeout: 30000 });

      // Upload to Supabase Storage
      const outputBuffer = readFileSync(outputPath);
      const timestamp = Date.now();
      const storagePath = `${user.id}/ad-composite-${timestamp}.png`;

      const { error: uploadError } = await supabase.storage
        .from('marketing-assets')
        .upload(storagePath, outputBuffer, {
          contentType: 'image/png',
          upsert: false,
        });

      if (uploadError) {
        return NextResponse.json({ error: 'Upload failed: ' + uploadError.message }, { status: 500 });
      }

      const { data: urlData } = supabase.storage
        .from('marketing-assets')
        .getPublicUrl(storagePath);

      // Insert as media_asset
      const canonicalName = `ad-creative_isu001_${headline.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}_${format}_v1.png`;

      const { data: asset } = await supabase
        .from('media_assets')
        .insert({
          user_id: user.id,
          storage_path: storagePath,
          public_url: urlData.publicUrl,
          filename: `ad-composite-${timestamp}.png`,
          file_size: outputBuffer.length,
          mime_type: 'image/png',
          ai_category: 'ad_creative',
          ai_description: `Ad composite: ${headline}`,
          ai_tags: ['ad', 'composite', format],
          canonical_name: canonicalName,
          dimensions: format,
          product_key: 'isu001',
          status: 'active',
        })
        .select()
        .single();

      return NextResponse.json({
        public_url: urlData.publicUrl,
        storage_path: storagePath,
        media_asset: asset,
        dimensions: format,
      });
    } finally {
      // Cleanup temp files
      try { unlinkSync(inputPath); } catch {}
      try { unlinkSync(outputPath); } catch {}
      try { execSync(`rmdir "${tmpDir}" 2>/dev/null`); } catch {}
    }
  } catch (err) {
    console.error('ads/composite error:', err);
    return NextResponse.json({ error: 'Failed to composite image' }, { status: 500 });
  }
}
