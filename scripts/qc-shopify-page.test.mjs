import assert from 'node:assert/strict';
import test from 'node:test';
import { computeEmptyGaps, deriveMarkersFromTemplate, mergeMarkers, validateCanonicalUrl } from './qc-shopify-page.mjs';

test('validateCanonicalUrl accepts only canonical public URL', () => {
  assert.equal(validateCanonicalUrl('https://everestlabs.co/products/kryo2_'), 'https://everestlabs.co/products/kryo2_');
  assert.throws(() => validateCanonicalUrl('https://everestlabs.co/products/kryo2_?view=default'), /Non-canonical/);
  assert.throws(() => validateCanonicalUrl('https://everestlabs.co/products/kryo2_?preview_theme_id=123'), /Non-canonical/);
});

test('deriveMarkersFromTemplate chooses first, middle and last configured block text', () => {
  const template = {
    sections: {
      blocks_dijJNt: {
        blocks: {
          a: { settings: { heading: 'First visible hero heading', image: 'shopify://shop_images/a.png' } },
          b: { settings: { heading: 'Second block heading' } },
          c: { settings: { heading: 'Middle block heading' } },
          d: { settings: { heading: 'Last proof block heading' } },
        },
        block_order: ['a', 'b', 'c', 'd'],
      },
    },
  };
  const markers = deriveMarkersFromTemplate(template, { sectionId: 'blocks_dijJNt' });
  assert.deepEqual(markers.map((m) => m.text), ['First visible hero heading', 'Middle block heading', 'Last proof block heading']);
});

test('mergeMarkers de-dupes manifest and derived markers', () => {
  const markers = mergeMarkers([{ id: 'a', text: 'Reviews' }], [{ id: 'b', text: 'Reviews' }, { id: 'c', text: 'Designed for the bathroom you already use.' }]);
  assert.deepEqual(markers.map((m) => m.text), ['Reviews', 'Designed for the bathroom you already use.']);
});

test('computeEmptyGaps finds large blank space from missing late section', () => {
  const gaps = computeEmptyGaps([
    { top: 0, bottom: 600 },
    { top: 700, bottom: 1200 },
    { top: 4200, bottom: 5000 },
  ], 5200);
  assert.equal(gaps[0].top, 1200);
  assert.equal(gaps[0].bottom, 4200);
  assert.equal(gaps[0].height, 3000);
});

test('computeEmptyGaps keeps normal stacked content under threshold', () => {
  const intervals = Array.from({ length: 8 }, (_, i) => ({ top: i * 500, bottom: i * 500 + 420 }));
  const gaps = computeEmptyGaps(intervals, 4200);
  assert.ok(gaps[0].height <= 300);
});


test('deriveMarkersFromTemplate ignores design settings and color values', () => {
  const template = {
    sections: {
      blocks_dijJNt: {
        blocks: {
          a: { settings: { text_alignment: 'left', heading_color: '#fafbfc', heading: 'Real first heading' } },
          b: { settings: { eyebrow_color: '#000000', eyebrow: 'REAL MIDDLE EYEBROW' } },
          c: { settings: { text_color: '#ffffff', button_text: 'Real CTA label' } },
        },
        block_order: ['a', 'b', 'c'],
      },
    },
  };
  const markers = deriveMarkersFromTemplate(template, { sectionId: 'blocks_dijJNt' });
  assert.deepEqual(markers.map((m) => m.text), ['Real first heading', 'REAL MIDDLE EYEBROW', 'Real CTA label']);
});
