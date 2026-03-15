'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface ReadinessIndicatorProps {
  percentage: number;
  loading: boolean;
}

export default function ReadinessIndicator({ percentage, loading }: ReadinessIndicatorProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wide">
          Launch Readiness
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-8 bg-slate-100 rounded animate-pulse" />
        ) : (
          <>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-4xl font-bold text-slate-900">{percentage}%</span>
              <span className="text-sm text-slate-400">complete</span>
            </div>
            <Progress value={percentage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
