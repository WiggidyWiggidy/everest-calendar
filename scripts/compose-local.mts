// Local body_html composer — uses src/lib/page-composer directly so newly-added section types
// (press_logos, lifestyle_strip, etc) render even before they're deployed to Vercel.
//
// Usage:   npx tsx scripts/compose-local.mts <spec.json>
// Outputs: { body_html, byteLength, sectionCount, schemaCount } JSON to stdout.

import { readFile } from 'node:fs/promises';

// Use dynamic import with relative paths — tsx handles .ts resolution at runtime.
const composer: any = await import('../src/lib/page-composer/index.js');
const composeBodyHtml = composer.composeBodyHtml;

if (typeof composeBodyHtml !== 'function') {
  console.error('FATAL: composeBodyHtml not exported. Got:', Object.keys(composer));
  process.exit(1);
}

const path = process.argv[2];
if (!path) {
  console.error('Usage: compose-local.mts <spec.json>');
  process.exit(2);
}
const spec = JSON.parse(await readFile(path, 'utf-8'));
const out = composeBodyHtml(spec);
process.stdout.write(JSON.stringify({
  body_html: out.body_html,
  byte_length: out.byteLength,
  section_count: out.sectionCount,
  schema_count: out.schemaCount,
}) + '\n');
