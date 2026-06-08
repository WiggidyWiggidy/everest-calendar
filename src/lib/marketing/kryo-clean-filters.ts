export type KRYOTouchLike = {
  ip_country?: string | null;
  user_agent?: string | null;
  traffic_class?: string | null;
  is_internal?: boolean | null;
  referrer?: string | null;
  event_metadata?: {
    internal_reason?: string | null;
  } | null;
};

export type ExclusionReason =
  | 'country_hong_kong'
  | 'country_china'
  | 'internal_flag'
  | 'traffic_class_internal_qa'
  | 'traffic_class_bot'
  | 'crawler_user_agent'
  | 'admin_shopify_referral'
  | 'tom_laptop_pattern';

const HK_VALUES = new Set(['HK', 'HKG', 'Hong Kong']);
const CN_VALUES = new Set(['CN', 'CHN', 'China']);
const CRAWLER_PATTERNS = [/applebot/i, /bingbot/i, /bot/i, /crawler/i, /spider/i, /headlesschrome/i, /curl\//i];

function isMacChrome(ua: string) {
  return /Macintosh; Intel Mac OS X/i.test(ua) && /Chrome\//i.test(ua);
}

export function getKryoExclusionReasons(row: KRYOTouchLike): ExclusionReason[] {
  const reasons: ExclusionReason[] = [];
  const country = String(row.ip_country ?? '').trim();
  const ua = String(row.user_agent ?? '');
  const trafficClass = String(row.traffic_class ?? '').trim();
  const referrer = String(row.referrer ?? '');
  const internalReason = String(row.event_metadata?.internal_reason ?? '');

  if (HK_VALUES.has(country)) reasons.push('country_hong_kong');
  if (CN_VALUES.has(country)) reasons.push('country_china');
  if (row.is_internal || internalReason) reasons.push('internal_flag');
  if (trafficClass === 'internal_qa') reasons.push('traffic_class_internal_qa');
  if (trafficClass === 'bot') reasons.push('traffic_class_bot');
  if (CRAWLER_PATTERNS.some((pattern) => pattern.test(ua))) reasons.push('crawler_user_agent');
  if (/admin\.shopify\.com|adsmanager\.facebook\.com/i.test(referrer)) reasons.push('admin_shopify_referral');
  if ((HK_VALUES.has(country) || CN_VALUES.has(country)) && isMacChrome(ua)) reasons.push('tom_laptop_pattern');

  return Array.from(new Set(reasons));
}

export function shouldExcludeKryoTouch(row: KRYOTouchLike) {
  return getKryoExclusionReasons(row).length > 0;
}

export function shouldExcludeGaCountry(country: string | null | undefined) {
  const value = String(country ?? '').trim();
  return HK_VALUES.has(value) || CN_VALUES.has(value);
}

export function summarizeExclusionReasons(rows: KRYOTouchLike[]) {
  const counts = new Map<ExclusionReason, number>();
  for (const row of rows) {
    for (const reason of getKryoExclusionReasons(row)) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([reason, rows]) => ({ reason, rows }))
    .sort((a, b) => b.rows - a.rows);
}
