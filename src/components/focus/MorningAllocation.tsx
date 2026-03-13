'use client';

// ============================================
// MorningAllocation — time-block setup form for the focus session
// Critical path: 2–4 h | Feature limit: 0–4 h
// ============================================
import { useState } from 'react';
import { Clock, Zap, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FocusSession } from '@/types/focus';
import { cn } from '@/lib/utils';

interface Props {
  session: FocusSession | null;
  saving: boolean;
  onSave: (criticalHours: number, featureHours: number) => Promise<void>;
}

const CRITICAL_OPTIONS = [2, 2.5, 3, 3.5, 4];
const FEATURE_OPTIONS  = [0.5, 1, 1.5, 2];

export default function MorningAllocation({ session, saving, onSave }: Props) {
  const [criticalHours, setCriticalHours] = useState<number>(session?.critical_path_hours ?? 3);
  const [featureHours,  setFeatureHours]  = useState<number>(session?.feature_limit_hours ?? 1);

  async function handleSave() {
    await onSave(criticalHours, featureHours);
  }

  const isConfigured = session !== null;

  return (
    <Card className={cn(isConfigured && 'border-indigo-200 bg-indigo-50/30')}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-indigo-600" />
          Morning Allocation
          {isConfigured && (
            <span className="ml-auto text-xs font-normal text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
              Set for today
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">

        {/* Critical path hours */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-3.5 w-3.5 text-indigo-600" />
            <p className="text-sm font-medium text-gray-700">Critical path block</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {CRITICAL_OPTIONS.map((h) => (
              <button
                key={h}
                onClick={() => setCriticalHours(h)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                  criticalHours === h
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'border-gray-200 text-gray-600 hover:border-indigo-400 hover:text-indigo-600',
                )}
              >
                {h}h
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            Deep work reserved for launch-critical tasks
          </p>
        </div>

        {/* Feature work limit */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-3.5 h-3.5 rounded-full bg-amber-500 inline-block" />
            <p className="text-sm font-medium text-gray-700">Feature work limit</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {FEATURE_OPTIONS.map((h) => (
              <button
                key={h}
                onClick={() => setFeatureHours(h)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                  featureHours === h
                    ? 'bg-amber-500 border-amber-500 text-white'
                    : 'border-gray-200 text-gray-600 hover:border-amber-400 hover:text-amber-600',
                )}
              >
                {h}h
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            Max time allowed on non-critical feature work
          </p>
        </div>

        {/* Summary + save */}
        <div className="flex items-center gap-3 pt-1">
          <div className="flex-1 text-xs text-gray-500">
            <span className="font-medium text-gray-700">{criticalHours + featureHours}h</span> total
            &nbsp;·&nbsp;
            <span className="text-indigo-600 font-medium">{criticalHours}h</span> critical
            &nbsp;·&nbsp;
            <span className="text-amber-600 font-medium">{featureHours}h</span> feature
          </div>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="shrink-0"
          >
            {saving
              ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              : null}
            {isConfigured ? 'Update' : 'Lock In'}
          </Button>
        </div>

      </CardContent>
    </Card>
  );
}
