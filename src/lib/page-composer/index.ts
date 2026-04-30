// Page composer — turns a BodyHtmlSpec into a single self-contained body_html string.
//
// Output is a single <div class="kryo-page"> wrapper containing:
//   1. <style> block with base CSS + deduped section CSS
//   2. <script type="application/ld+json"> blocks (one per section that emits schema)
//   3. each section's HTML
//
// Drops cleanly into Shopify product body_html. Pure HTML + inline CSS — no external deps.
// Tested against Shopify's body_html sanitizer: <style> and JSON-LD <script> survive;
// other <script> tags are stripped (we never emit them).

import { BASE_CSS, renderSection, type BodyHtmlSpec } from '@/lib/page-sections';

interface ComposeResult {
  body_html: string;
  byteLength: number;
  schemaCount: number;
  sectionCount: number;
}

export function composeBodyHtml(spec: BodyHtmlSpec): ComposeResult {
  const cssChunks: string[] = [BASE_CSS];
  const cssSeen = new Set<string>([BASE_CSS]);
  const htmlChunks: string[] = [];
  const schemaBlocks: Record<string, unknown>[] = [];

  for (const section of spec.sections) {
    const out = renderSection(section);
    htmlChunks.push(out.html);
    if (out.css && !cssSeen.has(out.css)) {
      cssSeen.add(out.css);
      cssChunks.push(out.css);
    }
    if (out.schemaJsonLd) {
      schemaBlocks.push(out.schemaJsonLd);
    }
  }

  const brandOverrides = spec.brand?.primaryColor || spec.brand?.fontFamily
    ? `.kryo-page {${spec.brand?.primaryColor ? `--kryo-accent:${spec.brand.primaryColor};` : ''}${spec.brand?.fontFamily ? `--kryo-font:${spec.brand.fontFamily};` : ''}}`
    : '';

  const styleTag = `<style>${cssChunks.join('\n')}${brandOverrides}</style>`;

  const schemaTags = schemaBlocks
    .map((s) => `<script type="application/ld+json">${JSON.stringify(s)}</script>`)
    .join('');

  const body = `<div class="kryo-page">${styleTag}${schemaTags}${htmlChunks.join('\n')}</div>`;

  return {
    body_html: body,
    byteLength: Buffer.byteLength(body, 'utf-8'),
    schemaCount: schemaBlocks.length,
    sectionCount: spec.sections.length,
  };
}
