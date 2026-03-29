'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const Loading = () => (
  <div className="flex items-center justify-center h-64">
    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
  </div>
);

const SuppliersTab = dynamic(() => import('@/app/(app)/suppliers/page'), { loading: Loading });
const ManufacturersTab = dynamic(() => import('@/app/(app)/manufacturers/page'), { loading: Loading });
const CoworkTab = dynamic(() => import('@/app/(app)/cowork/page'), { loading: Loading });

type Tab = 'suppliers' | 'manufacturers' | 'cowork';

const tabs: { key: Tab; label: string }[] = [
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'manufacturers', label: 'Manufacturers' },
  { key: 'cowork', label: 'Cowork' },
];

export default function SupplyChainPage() {
  const [activeTab, setActiveTab] = useState<Tab>('suppliers');

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 sm:p-6 max-w-6xl mx-auto w-full">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Supply Chain</h1>
        <p className="text-sm text-gray-400 mt-0.5">Suppliers, manufacturers, and contractor collaboration.</p>
      </div>

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

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'suppliers' && <SuppliersTab />}
        {activeTab === 'manufacturers' && <ManufacturersTab />}
        {activeTab === 'cowork' && <CoworkTab />}
      </div>
    </div>
  );
}
