// SEO tag generators for Shopify pages
// Injected into every page the system creates

interface SEOInput {
  title: string;
  description?: string;
  imageUrl?: string;
  url?: string;
  type?: 'product' | 'article';
  price?: string;
  currency?: string;
}

export function generateOpenGraphTags(input: SEOInput): string {
  const { title, description, imageUrl, url, type = 'product' } = input;
  const ogType = type === 'article' ? 'article' : 'product';

  const tags = [
    `<meta property="og:title" content="${escHtml(title)}" />`,
    `<meta property="og:type" content="${ogType}" />`,
    description ? `<meta property="og:description" content="${escHtml(description)}" />` : '',
    imageUrl ? `<meta property="og:image" content="${escHtml(imageUrl)}" />` : '',
    url ? `<meta property="og:url" content="${escHtml(url)}" />` : '',
    `<meta property="og:site_name" content="Everest Labs" />`,
    // Twitter Card
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escHtml(title)}" />`,
    description ? `<meta name="twitter:description" content="${escHtml(description)}" />` : '',
    imageUrl ? `<meta name="twitter:image" content="${escHtml(imageUrl)}" />` : '',
  ].filter(Boolean);

  return tags.join('\n');
}

export function generateProductJsonLD(input: {
  name: string;
  description: string;
  imageUrl?: string;
  price?: string;
  currency?: string;
  url?: string;
  brand?: string;
}): string {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    description: input.description,
    brand: { '@type': 'Brand', name: input.brand || 'Everest Labs' },
    ...(input.imageUrl && { image: input.imageUrl }),
    ...(input.url && { url: input.url }),
    ...(input.price && {
      offers: {
        '@type': 'Offer',
        price: input.price,
        priceCurrency: input.currency || 'AUD',
        availability: 'https://schema.org/PreOrder',
      },
    }),
  };

  return `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;
}

export function generateArticleJsonLD(input: {
  title: string;
  description: string;
  imageUrl?: string;
  url?: string;
  datePublished?: string;
}): string {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description,
    author: { '@type': 'Organization', name: 'Everest Labs' },
    publisher: { '@type': 'Organization', name: 'Everest Labs' },
    ...(input.imageUrl && { image: input.imageUrl }),
    ...(input.url && { url: input.url }),
    ...(input.datePublished && { datePublished: input.datePublished }),
  };

  return `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;
}

function escHtml(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
