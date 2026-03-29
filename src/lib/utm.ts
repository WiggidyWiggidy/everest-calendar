// UTM parameter builder + parser
// Auto-injected into ad links, page CTAs, and blog links

interface UTMParams {
  source: string;      // meta, google, email, organic
  medium: string;      // paid, cpc, email, social
  campaign?: string;   // campaign name
  content?: string;    // ad creative ID or page variant
  term?: string;       // keyword (for search)
}

export function buildUTMUrl(baseUrl: string, params: UTMParams): string {
  const url = new URL(baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`);
  url.searchParams.set('utm_source', params.source);
  url.searchParams.set('utm_medium', params.medium);
  if (params.campaign) url.searchParams.set('utm_campaign', params.campaign);
  if (params.content) url.searchParams.set('utm_content', params.content);
  if (params.term) url.searchParams.set('utm_term', params.term);
  return url.toString();
}

export function parseUTMParams(url: string): Partial<UTMParams> {
  try {
    const parsed = new URL(url);
    return {
      source: parsed.searchParams.get('utm_source') || undefined,
      medium: parsed.searchParams.get('utm_medium') || undefined,
      campaign: parsed.searchParams.get('utm_campaign') || undefined,
      content: parsed.searchParams.get('utm_content') || undefined,
      term: parsed.searchParams.get('utm_term') || undefined,
    };
  } catch {
    return {};
  }
}

// Build Meta ad link with UTMs
export function buildMetaAdUrl(
  destinationUrl: string,
  campaignName: string,
  creativeId: string
): string {
  return buildUTMUrl(destinationUrl, {
    source: 'meta',
    medium: 'paid',
    campaign: campaignName,
    content: creativeId,
  });
}

// Build blog CTA link with UTMs
export function buildBlogCTAUrl(
  destinationUrl: string,
  blogSlug: string
): string {
  return buildUTMUrl(destinationUrl, {
    source: 'blog',
    medium: 'organic',
    campaign: 'content',
    content: blogSlug,
  });
}
