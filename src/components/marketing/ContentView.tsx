'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { BlogTab } from './BlogTab';
import { AssetsTab } from './AssetsTab';
import type { LandingPage } from '@/types';

type ContentTab = 'blog' | 'assets';

interface Props {
  pages: LandingPage[];
}

export function ContentView({ pages }: Props) {
  const [tab, setTab] = useState<ContentTab>('blog');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {([
          { key: 'blog' as ContentTab, label: 'Blog Engine' },
          { key: 'assets' as ContentTab, label: 'Asset Library' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'text-xs px-4 py-1.5 rounded-md font-medium transition-all',
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'blog' && <BlogTab />}
      {tab === 'assets' && <AssetsTab pages={pages} />}
    </div>
  );
}
