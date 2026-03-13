'use client';

// ============================================
// CriticalPathTimer — pomodoro-style countdown for critical-path work block
// Fires notifications when critical path expires or feature limit approached
// ============================================
import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FocusSession } from '@/types/focus';
import {
  notifyCriticalPathExpired,
  notifyApproachingFeatureLimit,
  notifyFeatureLimitReached,
  getFeatureLimitState,
} from '@/lib/notifications/focus';
import { cn } from '@/lib/utils';

interface Props {
  session: FocusSession | null;
  /** called when the critical-path block expires so parent can lock feature work */
  onCriticalExpired?: () => void;
  /** elapsed feature-work minutes tracked by parent */
  featureMinutesElapsed: number;
}

type TimerMode = 'critical' | 'feature' | 'idle';

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function CriticalPathTimer({
  session,
  onCriticalExpired,
  featureMinutesElapsed,
}: Props) {
  const criticalSeconds = session ? session.critical_path_hours * 3600 : 3 * 3600;
  const featureLimitMin = session ? session.feature_limit_hours * 60 : 60;

  const [mode,      setMode]      = useState<TimerMode>('idle');
  const [running,   setRunning]   = useState(false);
  const [remaining, setRemaining] = useState(criticalSeconds);
  const [expired,   setExpired]   = useState(false);

  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const notifiedRef  = useRef({ approaching: false, exceeded: false });

  // Reset if session changes
  useEffect(() => {
    setRemaining(criticalSeconds);
    setExpired(false);
    setRunning(false);
    setMode('idle');
    notifiedRef.current = { approaching: false, exceeded: false };
  }, [criticalSeconds]);

  // Watch feature minutes for limit alerts
  useEffect(() => {
    const state = getFeatureLimitState(featureMinutesElapsed, featureLimitMin / 60);
    if (state === 'approaching' && !notifiedRef.current.approaching) {
      notifiedRef.current.approaching = true;
      const left = Math.round(featureLimitMin - featureMinutesElapsed);
      notifyApproachingFeatureLimit(left);
    }
    if (state === 'exceeded' && !notifiedRef.current.exceeded) {
      notifiedRef.current.exceeded = true;
      notifyFeatureLimitReached();
    }
  }, [featureMinutesElapsed, featureLimitMin]);

  const tick = useCallback(() => {
    setRemaining((prev) => {
      if (prev <= 1) {
        setRunning(false);
        setExpired(true);
        notifyCriticalPathExpired();
        onCriticalExpired?.();
        return 0;
      }
      return prev - 1;
    });
  }, [onCriticalExpired]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(tick, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, tick]);

  function handleStart(m: TimerMode) {
    if (m === 'critical') setRemaining(criticalSeconds);
    setMode(m);
    setRunning(true);
    setExpired(false);
  }

  function handleReset() {
    setRunning(false);
    setRemaining(criticalSeconds);
    setExpired(false);
    setMode('idle');
    notifiedRef.current = { approaching: false, exceeded: false };
  }

  const featureState = getFeatureLimitState(featureMinutesElapsed, featureLimitMin / 60);
  const featureUsedPct = Math.min(100, (featureMinutesElapsed / featureLimitMin) * 100);

  return (
    <Card className={cn(
      expired && 'border-red-300 bg-red-50/30',
      mode === 'critical' && running && 'border-indigo-300',
    )}>
      <CardContent className="p-4">

        <div className="flex items-center gap-2 mb-3">
          <Zap className={cn(
            'h-4 w-4',
            mode === 'critical' && running ? 'text-indigo-600' : 'text-gray-400',
          )} />
          <p className="text-sm font-semibold text-gray-700">Critical Path Timer</p>
          {expired && (
            <span className="ml-auto text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
              Expired
            </span>
          )}
          {mode === 'critical' && running && !expired && (
            <span className="ml-auto text-xs font-medium text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
              Running
            </span>
          )}
        </div>

        {/* Big countdown */}
        <div className={cn(
          'text-4xl font-black text-center py-2 transition-colors',
          expired ? 'text-red-600' : mode === 'critical' && running ? 'text-indigo-600' : 'text-gray-700',
        )}>
          {formatTime(remaining)}
        </div>

        {/* Controls */}
        <div className="flex gap-2 justify-center mt-3">
          {!running ? (
            <>
              <Button
                size="sm"
                onClick={() => handleStart('critical')}
                disabled={!session}
                className="gap-1"
              >
                <Play className="h-3.5 w-3.5" />
                {mode === 'idle' ? 'Start' : 'Resume'}
              </Button>
              <Button size="sm" variant="outline" onClick={handleReset} className="gap-1">
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setRunning(false)} className="gap-1">
              <Pause className="h-3.5 w-3.5" />
              Pause
            </Button>
          )}
        </div>

        {/* Feature work budget bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-500">Feature work budget</p>
            <p className={cn(
              'text-xs font-medium',
              featureState === 'exceeded'   ? 'text-red-600'    :
              featureState === 'approaching' ? 'text-amber-600' : 'text-gray-500',
            )}>
              {Math.round(featureMinutesElapsed)}m / {featureLimitMin}m
            </p>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className={cn(
                'h-2 rounded-full transition-all duration-500',
                featureState === 'exceeded'    ? 'bg-red-500'    :
                featureState === 'approaching' ? 'bg-amber-500' : 'bg-amber-400',
              )}
              style={{ width: `${featureUsedPct}%` }}
            />
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
