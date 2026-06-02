export const META_ATTRIBUTION_WINDOW = ['7d_click', '1d_view'];

export const META_URL_TAGS = [
  'utm_source=meta',
  'utm_medium=paid_social',
  'utm_id={{campaign.id}}',
  'utm_campaign={{campaign.id}}',
  'utm_content={{ad.id}}',
  'utm_campaign_id={{campaign.id}}',
  'utm_adset_id={{adset.id}}',
  'utm_ad_id={{ad.id}}',
].join('&');

export function addMetaAttributionParams(rawUrl: string) {
  const url = new URL(rawUrl);
  url.searchParams.set('utm_source', 'meta');
  url.searchParams.set('utm_medium', 'paid_social');
  url.searchParams.set('utm_id', '{{campaign.id}}');
  url.searchParams.set('utm_campaign', '{{campaign.id}}');
  url.searchParams.set('utm_content', '{{ad.id}}');
  url.searchParams.set('utm_campaign_id', '{{campaign.id}}');
  url.searchParams.set('utm_adset_id', '{{adset.id}}');
  url.searchParams.set('utm_ad_id', '{{ad.id}}');
  return url.toString();
}

export function isCanonicalMetaTags(rawTags: string | null | undefined) {
  if (!rawTags) return false;
  const decoded = decodeURIComponent(rawTags);
  return [
    'utm_source=meta',
    'utm_medium=paid_social',
    'utm_campaign_id={{campaign.id}}',
    'utm_adset_id={{adset.id}}',
    'utm_ad_id={{ad.id}}',
  ].every(part => decoded.includes(part));
}
