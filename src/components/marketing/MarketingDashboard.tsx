'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MarketingMetricDaily, MarketingExperiment, ExperimentType, LandingPage } from '@/types';
import { OverviewTab } from './OverviewTab';
import { ExperimentsTab } from './ExperimentsTab';
import { InsightsTab } from './InsightsTab';
import { AssetsTab } from './AssetsTab';
import { SourcesTab } from './SourcesTab';
import { PagesTab } from './PagesTab';
import { AnalystTab } from './AnalystTab';
import { PageBuilderTab } from './PageBuilderTab';
import { AdsTab } from './AdsTab';
import { BlogTab } from './BlogTab';
import { VelocityTab } from './VelocityTab';

type Tab = 'overview' | 'velocity' | 'ads' | 'blog' | 'pages' | 'analyst' | 'assets' | 'page_builder' | 'experiments' | 'insights' | 'sources';

interface SourceStatus { connected: boolean; missing: string[] }
interface SourcesData {
  shopify: SourceStatus;
  meta: SourceStatus;
  google_analytics: SourceStatus;
  clarity: SourceStatus;
}

interface PageWithProposal extends LandingPage {
  latest_proposal: { id: string; status: string } | null;
}

export function MarketingDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<MarketingMetricDaily[]>([]);
  const [today, setToday] = useState<MarketingMetricDaily | null>(null);
  const [experiments, setExperiments] = useState<MarketingExperiment[]>([]);
  const [sources, setSources] = useState<SourcesData | null>(null);
  const [prefillExpType, setPrefillExpType] = useState<ExperimentType | null>(null);
  const [pages, setPages] = useState<PageWithProposal[]>([]);
  const [analystPageId, setAnalystPageId] = useState<string | null>(null);
  const [builderPageId, setBuilderPageId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [metricsRes, experimentsRes, sourcesRes, pagesRes] = await Promise.all([
        fetch('/api/marketing/metrics?days=30'),
        fetch('/api/marketing/experiments'),
        fetch('/api/marketing/sources'),
        fetch('/api/marketing/landing-pages'),
      ]);

      const [metricsData, experimentsData, sourcesData, pagesData] = await Promise.all([
        metricsRes.json(),
        experimentsRes.json(),
        sourcesRes.json(),
        pagesRes.json(),
      ]);

      const rows: MarketingMetricDaily[] = metricsData.metrics ?? [];
      setHistory(rows);

      const todayStr = new Date().toISOString().split('T')[0];
      setToday(rows.find(r => r.date === todayStr) ?? null);
      setExperiments(experimentsData.experiments ?? []);
      setSources(sourcesData.sources ?? null);
      setPages(pagesData.pages ?? []);
    } catch (err) {
      console.error('MarketingDashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleCreateExperiment(type: ExperimentType) {
    setPrefillExpType(type);
    setActiveTab('experiments');
  }

  function handleAnalysePage(pageId: string) {
    setAnalystPageId(pageId);
    setActiveTab('analyst');
  }

  function handleBuildPage(pageId: string) {
    setBuilderPageId(pageId);
    setActiveTab('page_builder');
  }

  function handlePageCreated(page: LandingPage) {
    setPages(prev => [{ ...page, latest_proposal: null }, ...prev]);
  }

  function handlePageUpdated(id: string, updates: Partial<LandingPage>) {
    setPages(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }

  const shopifyConnected = !!(sources?.shopify?.connected);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'velocity', label: 'Velocity' },
    { key: 'ads', label: 'Ads' },
    { key: 'blog', label: 'Blog' },
    { key: 'pages', label: `Pages${pages.length > 0 ? ` (${pages.length})` : ''}` },
    { key: 'analyst', label: 'Analyst' },
    { key: 'assets', label: 'Assets' },
    { key: 'page_builder', label: 'Page Builder' },
    { key: 'experiments', label: `Experiments${experiments.filter(e => e.status === 'running').length > 0 ? ` (${experiments.filter(e => e.status === 'running').length})` : ''}` },
    { key: 'insights', label: 'Insights' },
    { key: 'sources', label: 'Sources' },
  ];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 sm:p-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Marketing</h1>
        <p className="text-sm text-gray-400 mt-0.5">Track, diagnose, and test — all in one place.</p>
      </div>

      {/* Tab nav */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 mb-5 overflow-x-auto shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'text-xs px-3 py-1.5 rounded-md font-medium transition-all whitespace-nowrap',
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'overview' && (
          <OverviewTab today={today} history={history} onMetricsSaved={load} />
        )}
        {activeTab === 'velocity' && <VelocityTab />}
        {activeTab === 'ads' && <AdsTab />}
        {activeTab === 'blog' && <BlogTab />}
        {activeTab === 'pages' && (
          <PagesTab
            pages={pages}
            today={today}
            onPageCreated={handlePageCreated}
            onPageUpdated={handlePageUpdated}
            onAnalyse={handleAnalysePage}
            onBuild={handleBuildPage}
          />
        )}
        {activeTab === 'analyst' && (
          <AnalystTab pages={pages} preselectedPageId={analystPageId} />
        )}
        {activeTab === 'assets' && <AssetsTab pages={pages} />}
        {activeTab === 'page_builder' && (
          <PageBuilderTab
            pages={pages}
            preselectedPageId={builderPageId}
            shopifyConnected={shopifyConnected}
          />
        )}
        {activeTab === 'experiments' && (
          <ExperimentsTab experiments={experiments} onRefresh={load} prefillType={prefillExpType} />
        )}
        {activeTab === 'insights' && (
          <InsightsTab today={today} onCreateExperiment={handleCreateExperiment} />
        )}
        {activeTab === 'sources' && (
          <SourcesTab sources={sources} onMockLoaded={load} />
        )}
      </div>
    </div>
  );
}
