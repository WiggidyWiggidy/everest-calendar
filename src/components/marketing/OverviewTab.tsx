'use client';

import { useState } from 'react';
import { Users, DollarSign, TrendingUp, Target, ChevronDown, ChevronUp } from 'lucide-react';
import type { MarketingMetricDaily } from '@/types';

interface Props {
  today: MarketingMetricDaily | null;
  history: MarketingMetricDaily[];
  onMetricsSaved: () => void;
}

function fmt(n: number | null | undefined, prefix = '', suffix = '', decimals = 0): string {
  if (n == null) return '—';
  return `${prefix}${Number(n).toLocaleString('en-AU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
}

function pct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${(Number(n) * 100).toFixed(1)}%`;
}

function MiniChart({ data, field }: { data: MarketingMetricDaily[]; field: keyof MarketingMetricDaily }) {
  const last7 = data.slice(-7);
  const values = last7.map(d => Number(d[field] ?? 0));
  const max = Math.max(...values, 0.001);
  return (
    <div className="flex items-end gap-0.5 h-10 mt-2">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-t bg-indigo-400 opacity-80 min-h-[2px]"
          style={{ height: `${Math.round((v / max) * 100)}%` }}
          title={String(v)}
        />
      ))}
    </div>
  );
}

function HeroCard({ icon, label, value, sublabel, trend }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
  trend?: MarketingMetricDaily[];
  trendField?: keyof MarketingMetricDaily;
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 flex-1 min-w-0">
      <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {sublabel && <div className="text-xs text-gray-400 mt-0.5">{sublabel}</div>}
      {trend && trend.length > 0 && <MiniChart data={trend} field="customers_acquired" />}
    </div>
  );
}

function SourcePill({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
      active ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-50 text-gray-400 border border-gray-200'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-green-500' : 'bg-gray-300'}`} />
      {label}
    </span>
  );
}

function MetricInput({ label, name, defaultValue, prefix, suffix, step }: {
  label: string; name: string; defaultValue?: number | null; prefix?: string; suffix?: string; step?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <div className="relative flex items-center">
        {prefix && <span className="absolute left-2 text-gray-400 text-xs">{prefix}</span>}
        <input
          name={name}
          type="number"
          step={step ?? '1'}
          defaultValue={defaultValue ?? ''}
          className={`w-full text-sm border border-gray-200 rounded-lg py-1.5 pr-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 ${prefix ? 'pl-5' : 'pl-2'}`}
          placeholder="—"
        />
        {suffix && <span className="absolute right-2 text-gray-400 text-xs">{suffix}</span>}
      </div>
    </div>
  );
}

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700"
      >
        {title}
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
      {open && <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">{children}</div>}
    </div>
  );
}

export function OverviewTab({ today, history, onMetricsSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const weekCustomers = history.slice(-7).reduce((s, d) => s + (d.customers_acquired ?? 0), 0);
  const weekRevenue = history.slice(-7).reduce((s, d) => s + (d.shopify_revenue ?? 0), 0);

  const hasShopify = today && today.shopify_revenue != null;
  const hasMeta = today && today.meta_spend != null;
  const hasGA = today && today.ga_sessions != null;
  const hasClarity = today && today.clarity_engagement_score != null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData(e.currentTarget);
      const payload: Record<string, string | number | null> = {
        date: new Date().toISOString().split('T')[0],
        data_source: 'manual',
      };
      fd.forEach((val, key) => {
        const n = parseFloat(val as string);
        payload[key] = isNaN(n) ? null : n;
      });
      payload.date = new Date().toISOString().split('T')[0];

      const res = await fetch('/api/marketing/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Save failed');
      setShowForm(false);
      onMetricsSaved();
    } catch {
      alert('Failed to save metrics. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Hero metrics */}
      <div className="flex gap-3 flex-wrap">
        <HeroCard
          icon={<Users className="h-3.5 w-3.5" />}
          label="Customers This Week"
          value={weekCustomers > 0 ? String(weekCustomers) : '—'}
          sublabel="new paying customers"
        />
        <HeroCard
          icon={<DollarSign className="h-3.5 w-3.5" />}
          label="Revenue This Week"
          value={weekRevenue > 0 ? `$${Math.round(weekRevenue).toLocaleString('en-AU')}` : '—'}
          sublabel="from Shopify"
        />
        <HeroCard
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="ROAS Today"
          value={fmt(today?.meta_roas, '', 'x', 1)}
          sublabel="Meta return on ad spend"
        />
        <HeroCard
          icon={<Target className="h-3.5 w-3.5" />}
          label="Profit / Customer"
          value={fmt(today?.profit_per_customer, '$', '', 0)}
          sublabel="today"
        />
      </div>

      {/* Source status */}
      <div className="flex flex-wrap gap-2">
        <SourcePill label="Shopify" active={!!hasShopify} />
        <SourcePill label="Meta Ads" active={!!hasMeta} />
        <SourcePill label="Google Analytics" active={!!hasGA} />
        <SourcePill label="Clarity" active={!!hasClarity} />
        <span className="text-xs text-gray-400 self-center ml-1">
          {[hasShopify, hasMeta, hasGA, hasClarity].filter(Boolean).length === 0
            ? 'No data for today — enter metrics below or load mock data'
            : 'Today\'s data'}
        </span>
      </div>

      {/* 30-day sparklines */}
      {history.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            { label: 'Revenue', field: 'shopify_revenue' as keyof MarketingMetricDaily, prefix: '$' },
            { label: 'Meta Spend', field: 'meta_spend' as keyof MarketingMetricDaily, prefix: '$' },
            { label: 'ROAS', field: 'meta_roas' as keyof MarketingMetricDaily, suffix: 'x' },
            { label: 'Customers', field: 'customers_acquired' as keyof MarketingMetricDaily },
          ] as Array<{ label: string; field: keyof MarketingMetricDaily; prefix?: string; suffix?: string }>).map(({ label, field, prefix, suffix }) => {
            const last = history[history.length - 1]?.[field];
            return (
              <div key={field} className="bg-white border border-gray-100 rounded-xl p-3">
                <div className="text-xs text-gray-500">{label}</div>
                <div className="text-sm font-semibold text-gray-800">
                  {prefix}{last != null ? Number(last).toLocaleString('en-AU', { maximumFractionDigits: 1 }) : '—'}{suffix}
                </div>
                <MiniChart data={history} field={field} />
              </div>
            );
          })}
        </div>
      )}

      {/* Detailed today view */}
      {today && (
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Today at a glance</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-3 gap-x-4 text-sm">
            <div><span className="text-gray-400 text-xs">Shopify Revenue</span><div className="font-medium">{fmt(today.shopify_revenue, '$')}</div></div>
            <div><span className="text-gray-400 text-xs">Orders</span><div className="font-medium">{fmt(today.shopify_orders)}</div></div>
            <div><span className="text-gray-400 text-xs">Add-to-Cart</span><div className="font-medium">{pct(today.shopify_add_to_cart_rate)}</div></div>
            <div><span className="text-gray-400 text-xs">Conversion Rate</span><div className="font-medium">{pct(today.shopify_conversion_rate)}</div></div>
            <div><span className="text-gray-400 text-xs">Meta Spend</span><div className="font-medium">{fmt(today.meta_spend, '$')}</div></div>
            <div><span className="text-gray-400 text-xs">CTR</span><div className="font-medium">{pct(today.meta_ctr)}</div></div>
            <div><span className="text-gray-400 text-xs">CPP</span><div className="font-medium">{fmt(today.meta_cost_per_purchase, '$')}</div></div>
            <div><span className="text-gray-400 text-xs">Bounce Rate</span><div className="font-medium">{pct(today.ga_bounce_rate)}</div></div>
          </div>
        </div>
      )}

      {/* Manual entry toggle */}
      <div>
        <button
          onClick={() => setShowForm(f => !f)}
          className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          {showForm ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {today ? 'Update Today\'s Metrics' : 'Enter Today\'s Metrics'}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} className="mt-3 space-y-3">
            <Section title="Shopify" defaultOpen>
              <MetricInput label="Revenue ($)" name="shopify_revenue" defaultValue={today?.shopify_revenue} prefix="$" step="0.01" />
              <MetricInput label="Orders" name="shopify_orders" defaultValue={today?.shopify_orders} />
              <MetricInput label="Sessions" name="shopify_sessions" defaultValue={today?.shopify_sessions} />
              <MetricInput label="Add-to-Cart Rate" name="shopify_add_to_cart_rate" defaultValue={today?.shopify_add_to_cart_rate} suffix="%" step="0.0001" />
              <MetricInput label="Conversion Rate" name="shopify_conversion_rate" defaultValue={today?.shopify_conversion_rate} suffix="%" step="0.0001" />
              <MetricInput label="Checkout Rate" name="shopify_checkout_rate" defaultValue={today?.shopify_checkout_rate} suffix="%" step="0.0001" />
            </Section>
            <Section title="Meta Ads">
              <MetricInput label="Spend ($)" name="meta_spend" defaultValue={today?.meta_spend} prefix="$" step="0.01" />
              <MetricInput label="Impressions" name="meta_impressions" defaultValue={today?.meta_impressions} />
              <MetricInput label="Clicks" name="meta_clicks" defaultValue={today?.meta_clicks} />
              <MetricInput label="CTR" name="meta_ctr" defaultValue={today?.meta_ctr} suffix="%" step="0.0001" />
              <MetricInput label="ROAS" name="meta_roas" defaultValue={today?.meta_roas} suffix="x" step="0.01" />
              <MetricInput label="Purchases" name="meta_purchases" defaultValue={today?.meta_purchases} />
              <MetricInput label="Cost per Purchase ($)" name="meta_cost_per_purchase" defaultValue={today?.meta_cost_per_purchase} prefix="$" step="0.01" />
            </Section>
            <Section title="Google Analytics">
              <MetricInput label="Sessions" name="ga_sessions" defaultValue={today?.ga_sessions} />
              <MetricInput label="Users" name="ga_users" defaultValue={today?.ga_users} />
              <MetricInput label="New Users" name="ga_new_users" defaultValue={today?.ga_new_users} />
              <MetricInput label="Bounce Rate" name="ga_bounce_rate" defaultValue={today?.ga_bounce_rate} suffix="%" step="0.0001" />
              <MetricInput label="Avg Session (sec)" name="ga_avg_session_duration" defaultValue={today?.ga_avg_session_duration} />
            </Section>
            <Section title="Top-line KPIs">
              <MetricInput label="Customers Acquired" name="customers_acquired" defaultValue={today?.customers_acquired} />
              <MetricInput label="Gross Profit ($)" name="gross_profit" defaultValue={today?.gross_profit} prefix="$" step="0.01" />
              <MetricInput label="Profit / Customer ($)" name="profit_per_customer" defaultValue={today?.profit_per_customer} prefix="$" step="0.01" />
            </Section>
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Today\'s Metrics'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
