'use client';

import { ImageIcon, Type, Globe, Video, Mail } from 'lucide-react';

export function AssetsTab() {
  return (
    <div className="space-y-6">
      <div>
        <div className="font-semibold text-gray-900">Asset Library</div>
        <div className="text-xs text-gray-400">Coming in Phase 2</div>
      </div>

      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5">
        <div className="text-sm font-semibold text-gray-700 mb-3">
          🗂 What this will be
        </div>
        <div className="text-sm text-gray-600 space-y-2">
          <p>Your central control station for all marketing assets — where you review and approve everything before it goes live.</p>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { icon: <ImageIcon className="h-4 w-4" />, label: 'Creatives', desc: 'Images and videos with approval workflow. Approve → auto-publish to Meta.' },
            { icon: <Type className="h-4 w-4" />, label: 'Copy', desc: 'Ad copy, headlines, CTAs linked to split tests. Track which copy wins.' },
            { icon: <Globe className="h-4 w-4" />, label: 'Landing Pages', desc: 'URLs tracked against conversion metrics. See which page wins before scaling.' },
            { icon: <Video className="h-4 w-4" />, label: 'Videos', desc: 'Raw → edited → approved pipeline. Drop raw footage, get finished ad.' },
            { icon: <Mail className="h-4 w-4" />, label: 'Email', desc: 'Email sequences linked to campaigns and revenue attributed per email.' },
          ].map(({ icon, label, desc }) => (
            <div key={label} className="bg-white border border-gray-100 rounded-lg p-3 flex gap-3">
              <div className="mt-0.5 text-indigo-500 shrink-0">{icon}</div>
              <div>
                <div className="text-sm font-medium text-gray-700">{label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
        ✓ The <code className="text-xs bg-gray-100 px-1 rounded">marketing_assets</code> table is already in the database and linked to your experiments — no rework needed when we build this.
      </div>
    </div>
  );
}
