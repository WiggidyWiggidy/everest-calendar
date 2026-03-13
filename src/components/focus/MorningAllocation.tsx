'use client';

// ============================================
// MorningAllocation — time block input form
// Lets the user set today's critical-path hours
// and feature work limit before the day starts
// ============================================
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Sunrise } from 'lucide-react';
import { FocusSession } from '@/types/focus';

interface Props {
  session: FocusSession | null;
  saving: boolean;
  onSave: (criticalHours: number, featureHours: number) => void;
}

const HOUR_OPTIONS = [1, 1.5, 2, 2.5, 3, 3.5, 4];
const FEATURE_OPTIONS = [0, 0.5, 1, 1.5, 2];

export default function MorningAllocation({ session, saving, onSave }: Props) {
  const [criticalHours, setCriticalHours] = useState(
    session?.critical_path_hours ?? 3
  );
  const [featureHours, setFeatureHours] = useState(
    session?.feature_limit_hours ?? 1
  );

  function handleSave() {
    onSave(criticalHours, featureHours);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sunrise className="h-4 w-4 text-amber-500" />
          Morning Allocation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Critical Path Block */}
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            Critical path work
            <span className="text-gray-400 font-normal ml-1">(2–4 hour blocks)</span>
          </Label>
          <div className="flex flex-wrap gap-2">
            {HOUR_OPTIONS.map((h) => (
              <button
                key={h}
                onClick={() => setCriticalHours(h)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  criticalHours === h
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'border-gray-200 text-gray-600 hover:border-indigo-300 hover:bg-indigo-50'
                }`}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>

        {/* Feature Limit */}
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            Feature work limit
            <span className="text-gray-400 font-normal ml-1">(max daily cap)</span>
          </Label>
          <div className="flex flex-wrap gap-2">
            {FEATURE_OPTIONS.map((h) => (
              <button
                key={h}
                onClick={() => setFeatureHours(h)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  featureHours === h
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'border-gray-200 text-gray-600 hover:border-emerald-300 hover:bg-emerald-50'
                }`}
              >
                {h === 0 ? 'None' : `${h}h`}
              </button>
            ))}
          </div>
        </div>

        {/* Summary + save */}
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-gray-400">
            Total: {criticalHours + featureHours}h allocated
          </p>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving
              ? <><Loader2 className="h-3 w-3 animate-spin mr-1.5" />Saving…</>
              : session ? 'Update' : 'Start Day'}
          </Button>
        </div>

      </CardContent>
    </Card>
  );
}
