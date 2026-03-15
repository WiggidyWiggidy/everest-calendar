'use client';

import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useCountdown } from '@/hooks/useCountdown';

const LAUNCH_DATE = new Date('2026-03-29T00:00:00');

export default function CountdownTimer() {
  const target = useMemo(() => LAUNCH_DATE, []);
  const { days, hours } = useCountdown(target);

  return (
    <Card className="bg-gradient-to-br from-indigo-600 to-indigo-800 border-0 text-white">
      <CardContent className="py-8 text-center">
        <p className="text-indigo-200 text-sm font-medium uppercase tracking-widest mb-4">
          Ice Showers Launch
        </p>
        <div className="flex items-end justify-center gap-6">
          <div>
            <span className="text-7xl font-extrabold tabular-nums leading-none">{days}</span>
            <p className="text-indigo-200 text-sm mt-1">days</p>
          </div>
          <span className="text-5xl font-bold text-indigo-300 pb-5">:</span>
          <div>
            <span className="text-7xl font-extrabold tabular-nums leading-none">{hours}</span>
            <p className="text-indigo-200 text-sm mt-1">hours</p>
          </div>
        </div>
        <p className="text-indigo-300 text-xs mt-6">March 29, 2026</p>
      </CardContent>
    </Card>
  );
}
