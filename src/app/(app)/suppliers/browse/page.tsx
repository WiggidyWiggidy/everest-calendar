'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Droplets, ShowerHead, Zap, Box, Package, Wrench,
  ExternalLink, MapPin, Star, ChevronDown, ChevronRight,
  Search
} from 'lucide-react';

interface SupplierOption {
  id: string;
  component_key: string;
  supplier_group: string;
  rank: number;
  recommendation: string;
  why_ranked: string;
  supplier_name: string;
  supplier_location_city: string;
  supplier_location_province: string;
  product_url: string;
  product_title: string;
  unit_price_rmb: number | null;
  unit_price_usd: number | null;
  store_rating: number | null;
  data_source: string;
}

const GROUP_CONFIG: Record<string, { label: string; icon: typeof Droplets; color: string; bg: string }> = {
  water_system: { label: 'Water System', icon: Droplets, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
  bathroom: { label: 'Bathroom', icon: ShowerHead, color: 'text-cyan-600', bg: 'bg-cyan-50 border-cyan-200' },
  electrical: { label: 'Electrical', icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  foam: { label: 'Foam & Seals', icon: Box, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
  packaging: { label: 'Packaging', icon: Package, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
  hardware: { label: 'Hardware', icon: Wrench, color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200' },
};

const COMPONENT_LABELS: Record<string, string> = {
  diaphragm_pump: 'Diaphragm Pump 24V',
  circulation_pump: 'Circulation Pump 24V',
  shower_rail: 'Shower Rail Set',
  sp21_connector: 'SP21 Waterproof Connector',
  power_switch: '22mm Push Button Switch',
  meanwell_psu: 'MeanWell LRS-250-24',
  fuse_box: '4-Way ATO Fuse Box',
  xpe_foam: 'XPE Closed-Cell Foam',
  eva_foam: 'EVA High-Density Foam',
  epdm_gasket: 'EPDM Seal Strip',
  fill_cap_gland: 'M50 Cable Gland / Fill Cap',
  handles: 'Recessed Handle (Nylon)',
  braided_hose: 'Braided Hose 1/2"',
  inline_strainer: 'Y-Strainer 1/2"',
  push_fit_fittings: '12mm Push-Fit Fittings',
  rivet_nuts: 'M5 Rivet Nuts (SS)',
  cable_cover: 'Cable Trunking (PVC)',
  bulkhead_fitting: 'Bulkhead Fitting 1/2"',
  flat_dc_cable: 'Flat DC Cable 16AWG',
  corrugated_box: 'Corrugated Box (Custom)',
  carry_handles: 'Carry Handles',
  fill_cap: 'Fill Cap (M50)',
  plumbing_fittings: 'Plumbing Fittings',
  power_adapter: 'Power Adapter / PSU',
  power_inlet_connector: 'Power Inlet Connector',
  shower_hose_head: 'Shower Hose & Head',
  top_insulation_foam: 'Top Insulation Foam',
};

function formatPrice(rmb: number | null, usd: number | null) {
  if (!rmb && !usd) return '-';
  const parts = [];
  if (rmb) parts.push(`\u00a5${rmb.toFixed(rmb < 1 ? 2 : 0)}`);
  if (usd) parts.push(`$${usd.toFixed(2)}`);
  return parts.join(' / ');
}

export default function SupplierBrowsePage() {
  const [options, setOptions] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(Object.keys(GROUP_CONFIG)));
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'apify_1688' | 'agent_research'>('all');

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('supplier_options')
        .select('*')
        .order('supplier_group')
        .order('component_key')
        .order('rank');

      if (!error && data) {
        setOptions(data);
      }
      setLoading(false);
    }
    load();
  }, []);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  // Filter
  const filtered = options.filter(o => {
    if (sourceFilter !== 'all' && o.data_source !== sourceFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        o.supplier_name.toLowerCase().includes(q) ||
        o.component_key.toLowerCase().includes(q) ||
        (o.product_title || '').toLowerCase().includes(q) ||
        (o.supplier_location_city || '').includes(q) ||
        (COMPONENT_LABELS[o.component_key] || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Group by supplier_group -> component_key
  const grouped: Record<string, Record<string, SupplierOption[]>> = {};
  for (const o of filtered) {
    const g = o.supplier_group || 'other';
    if (!grouped[g]) grouped[g] = {};
    if (!grouped[g][o.component_key]) grouped[g][o.component_key] = [];
    grouped[g][o.component_key].push(o);
  }

  // Stats
  const gdCount = filtered.filter(o => o.supplier_location_province === '\u5e7f\u4e1c').length;
  const componentCount = new Set(filtered.map(o => o.component_key)).size;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">1688 Supplier Browser</h1>
        <p className="text-sm text-gray-500 mt-1">
          {filtered.length} suppliers across {componentCount} components
          {gdCount > 0 && <span className="ml-2 text-green-600 font-medium">({gdCount} Guangdong)</span>}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search supplier, component, city..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'apify_1688', 'agent_research'] as const).map(f => (
            <button
              key={f}
              onClick={() => setSourceFilter(f)}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                sourceFilter === f
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {f === 'all' ? 'All' : f === 'apify_1688' ? '1688 Scrape' : 'Research'}
            </button>
          ))}
        </div>
      </div>

      {/* Groups */}
      <div className="space-y-4">
        {Object.entries(GROUP_CONFIG).map(([groupKey, config]) => {
          const components = grouped[groupKey];
          if (!components) return null;
          const Icon = config.icon;
          const isExpanded = expandedGroups.has(groupKey);
          const groupItems = Object.values(components).flat();
          const groupGd = groupItems.filter(o => o.supplier_location_province === '\u5e7f\u4e1c').length;

          return (
            <div key={groupKey} className={`border rounded-xl overflow-hidden ${config.bg}`}>
              {/* Group header */}
              <button
                onClick={() => toggleGroup(groupKey)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Icon className={`h-5 w-5 ${config.color}`} />
                  <span className="font-semibold text-gray-900">{config.label}</span>
                  <span className="text-xs text-gray-500">
                    {Object.keys(components).length} components, {groupItems.length} suppliers
                  </span>
                  {groupGd > 0 && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                      {groupGd} GD
                    </span>
                  )}
                </div>
                {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
              </button>

              {/* Component cards */}
              {isExpanded && (
                <div className="px-5 pb-5 space-y-4">
                  {Object.entries(components).map(([compKey, suppliers]) => (
                    <div key={compKey} className="bg-white rounded-lg border border-gray-100 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                        <h3 className="font-medium text-sm text-gray-900">
                          {COMPONENT_LABELS[compKey] || compKey}
                        </h3>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {suppliers.map((s, i) => (
                          <div key={s.id || i} className="px-4 py-3 hover:bg-gray-50/50 transition-colors">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${
                                    s.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                                    s.rank === 2 ? 'bg-gray-100 text-gray-600' :
                                    'bg-orange-50 text-orange-600'
                                  }`}>
                                    {s.rank}
                                  </span>
                                  <span className="font-medium text-sm text-gray-900 truncate">{s.supplier_name}</span>
                                  {s.supplier_location_province === '\u5e7f\u4e1c' && (
                                    <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                                      <MapPin className="h-3 w-3" />GD
                                    </span>
                                  )}
                                  {s.store_rating && s.store_rating >= 4.5 && (
                                    <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-xs text-amber-600">
                                      <Star className="h-3 w-3 fill-amber-400" />{s.store_rating}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 truncate" title={s.product_title}>
                                  {s.product_title}
                                </p>
                                <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                                  {s.supplier_location_city && (
                                    <span className="flex items-center gap-0.5">
                                      <MapPin className="h-3 w-3" />
                                      {s.supplier_location_city}
                                    </span>
                                  )}
                                  {s.why_ranked && (
                                    <span className="text-gray-400 truncate" title={s.why_ranked}>{s.why_ranked}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0">
                                <span className="text-sm font-mono font-medium text-gray-900 whitespace-nowrap">
                                  {formatPrice(s.unit_price_rmb, s.unit_price_usd)}
                                </span>
                                {s.product_url && (
                                  <a
                                    href={s.product_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
                                  >
                                    1688
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
