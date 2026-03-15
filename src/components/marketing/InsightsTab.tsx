'use client';

import type { MarketingMetricDaily, ExperimentType } from '@/types';

interface DiagnosisRule {
  id: string;
  label: string;
  check: (m: MarketingMetricDaily) => boolean;
  currentValue: (m: MarketingMetricDaily) => string;
  threshold: string;
  severity: 'critical' | 'warning';
  action: string;
  experiment_type: ExperimentType;
}

const RULES: DiagnosisRule[] = [
  {
    id: 'meta_ctr_low',
    label: 'Meta CTR below 1%',
    check: m => m.meta_ctr !== null && m.meta_ctr < 0.01,
    currentValue: m => m.meta_ctr != null ? `${(m.meta_ctr * 100).toFixed(2)}%` : '—',
    threshold: '< 1%',
    severity: 'critical',
    action: 'Creative fatigue detected — test new visual formats (UGC, static vs video, different hooks).',
    experiment_type: 'creative',
  },
  {
    id: 'roas_low',
    label: 'ROAS below 2×',
    check: m => m.meta_roas !== null && m.meta_roas < 2.0,
    currentValue: m => m.meta_roas != null ? `${Number(m.meta_roas).toFixed(1)}x` : '—',
    threshold: '< 2×',
    severity: 'critical',
    action: 'Pause scaling. Review audience overlap and creative mix before increasing budget.',
    experiment_type: 'audience',
  },
  {
    id: 'cpa_high',
    label: 'Cost per acquisition above $50',
    check: m => m.meta_cost_per_purchase !== null && m.meta_cost_per_purchase > 50,
    currentValue: m => m.meta_cost_per_purchase != null ? `$${Number(m.meta_cost_per_purchase).toFixed(0)}` : '—',
    threshold: '> $50',
    severity: 'critical',
    action: 'Audience too broad or creative mismatch — test lookalike audiences from recent purchasers.',
    experiment_type: 'audience',
  },
  {
    id: 'add_to_cart_low',
    label: 'Add-to-cart rate below 3%',
    check: m => m.shopify_add_to_cart_rate !== null && m.shopify_add_to_cart_rate < 0.03,
    currentValue: m => m.shopify_add_to_cart_rate != null ? `${(m.shopify_add_to_cart_rate * 100).toFixed(1)}%` : '—',
    threshold: '< 3%',
    severity: 'warning',
    action: 'New landing page split test recommended — focus on product page CTA and hero imagery.',
    experiment_type: 'landing_page',
  },
  {
    id: 'conversion_rate_low',
    label: 'Shopify conversion rate below 2%',
    check: m => m.shopify_conversion_rate !== null && m.shopify_conversion_rate < 0.02,
    currentValue: m => m.shopify_conversion_rate != null ? `${(m.shopify_conversion_rate * 100).toFixed(1)}%` : '—',
    threshold: '< 2%',
    severity: 'warning',
    action: 'Checkout friction or pricing issue — review abandonment flow and offer.',
    experiment_type: 'offer',
  },
  {
    id: 'bounce_rate_high',
    label: 'Bounce rate above 70%',
    check: m => m.ga_bounce_rate !== null && m.ga_bounce_rate > 0.70,
    currentValue: m => m.ga_bounce_rate != null ? `${(m.ga_bounce_rate * 100).toFixed(0)}%` : '—',
    threshold: '> 70%',
    severity: 'warning',
    action: 'Landing page is losing visitors immediately — check page speed, above-the-fold content, and mobile experience.',
    experiment_type: 'landing_page',
  },
];

interface Props {
  today: MarketingMetricDaily | null;
  onCreateExperiment: (type: ExperimentType) => void;
}

export function InsightsTab({ today, onCreateExperiment }: Props) {
  if (!today) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-3xl mb-3">📊</div>
        <div className="font-medium text-gray-600 mb-1">No data for today yet</div>
        <div className="text-sm">Enter today&apos;s metrics in the Overview tab, or load mock data from the Sources tab to see diagnosis.</div>
      </div>
    );
  }

  const triggered = RULES.filter(r => r.check(today));
  const passing = RULES.filter(r => !r.check(today) && (
    (r.id === 'meta_ctr_low' && today.meta_ctr !== null) ||
    (r.id === 'roas_low' && today.meta_roas !== null) ||
    (r.id === 'cpa_high' && today.meta_cost_per_purchase !== null) ||
    (r.id === 'add_to_cart_low' && today.shopify_add_to_cart_rate !== null) ||
    (r.id === 'conversion_rate_low' && today.shopify_conversion_rate !== null) ||
    (r.id === 'bounce_rate_high' && today.ga_bounce_rate !== null)
  ));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-gray-900">Diagnosis</div>
          <div className="text-xs text-gray-400">Based on today&apos;s metrics</div>
        </div>
        {triggered.length === 0 && (
          <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full font-medium">
            ✅ All metrics healthy
          </span>
        )}
      </div>

      {triggered.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Needs attention ({triggered.length})
          </div>
          {triggered.map(rule => (
            <div
              key={rule.id}
              className={`rounded-xl border p-4 ${
                rule.severity === 'critical'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-amber-50 border-amber-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm">{rule.severity === 'critical' ? '🔴' : '⚠️'}</span>
                    <span className="text-sm font-semibold text-gray-800">{rule.label}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      rule.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {rule.currentValue(today)} (threshold {rule.threshold})
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">{rule.action}</div>
                </div>
                <button
                  onClick={() => onCreateExperiment(rule.experiment_type)}
                  className="shrink-0 text-xs bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap"
                >
                  + Experiment
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {passing.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">On target</div>
          {passing.map(rule => (
            <div key={rule.id} className="flex items-center gap-3 py-2 px-3 bg-green-50 border border-green-100 rounded-lg">
              <span className="text-sm">✅</span>
              <span className="text-sm text-gray-700">{rule.label}</span>
              <span className="text-xs text-green-600 font-medium ml-auto">{rule.currentValue(today)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
