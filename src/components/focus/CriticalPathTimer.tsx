'use client';

// ============================================
// CriticalPathTimer — pomodoro-style timer
// Counts down the critical path time block.
// Locks feature work section when time expires.
// ============================================
import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Timer, Play, Pause, RotateCcw, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  criticalPathHours: number;
  onExpire?: () => void;
}

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function CriticalPathTimer({ criticalPathHours, onExpire }: Props) {
  const totalSeconds = Math.round(criticalPathHours * 3600);
  const [remaining, setRemaining] = useState(totalSeconds);
  const [running, setRunning]     = useState(false);
  const [expired, setExpired]     = useState(false);
  const intervalRef               = useRef<NodeJS.Timeout | null>(null);

  // Reset when criticalPathHours changes
  useEffect(() => {
    setRemaining(totalSeconds);
    setExpired(false);
    setRunning(false);
  }, [totalSeconds]);

  // Tick
  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          setRunning(false);
          setExpired(true);
          onExpire?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, onExpire]);

  function handleReset() {
    setRemaining(totalSeconds);
    setExpired(false);
    setRunning(false);
  }

  const pct = totalSeconds > 0 ? ((totalSeconds - remaining) / totalSeconds) * 100 : 0;
  const radius  = 40;
  const circum  = 2 * Math.PI * radius;
  const strokeOffset = circum - (pct / 100) * circum;

  return (
    <Card className={cn(expired && 'border-red-300 bg-red-50')}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Timer className={cn('h-4 w-4', expired ? 'text-red-500' : 'text-indigo-500')} />
          Critical Path Timer
          {expired && (
            <span className="ml-auto flex items-center gap-1 text-xs text-red-600 font-semibold">
              <Lock className="h-3.5 w-3.5" />
              Feature work locked
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          {/* SVG ring */}
          <div className="relative shrink-0">
            <svg width="96" height="96" className="-rotate-90">
              <circle
                cx="48" cy="48" r={radius}
                fill="none"
                stroke={expired ? '#fee2e2' : '#e0e7ff'}
                strokeWidth="8"
              />
              <circle
                cx="48" cy="48" r={radius}
                fill="none"
                stroke={expired ? '#ef4444' : '#6366f1'}
                strokeWidth="8"
                strokeDasharray={circum}
                strokeDashoffset={strokeOffset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-lg font-mono font-bold text-gray-800">
              {formatTime(remaining)}
            </span>
          </div>

          <div className="flex-1 space-y-3">
            <p className="text-sm text-gray-500">
              {expired
                ? 'Critical path block complete. Feature work is now locked.'
                : running
                ? 'Critical path block in progress…'
                : `${criticalPathHours}h block ready to start`}
            </p>
            <div className="flex gap-2">
              {!expired && (
                <Button
                  size="sm"
                  variant={running ? 'outline' : 'default'}
                  onClick={() => setRunning((v) => !v)}
                >
                  {running
                    ? <><Pause className="h-3.5 w-3.5 mr-1.5" />Pause</>
                    : <><Play className="h-3.5 w-3.5 mr-1.5" />Start</>}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={handleReset}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Reset
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
