'use client';

// ============================================
// ProgressRing — dual-ring visual indicator
// Shows critical path vs feature work completion
// percentages for the current day
// ============================================
import { FocusTask } from '@/types/focus';

interface Props {
  tasks: FocusTask[];
}

function Ring({
  pct,
  color,
  trackColor,
  size = 80,
  strokeWidth = 8,
  label,
  sub,
}: {
  pct: number;
  color: string;
  trackColor: string;
  size?: number;
  strokeWidth?: number;
  label: string;
  sub: string;
}) {
  const r       = (size - strokeWidth) / 2;
  const circum  = 2 * Math.PI * r;
  const offset  = circum - (Math.min(pct, 100) / 100) * circum;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circum}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-gray-800">
          {Math.round(pct)}%
        </span>
      </div>
      <p className="text-xs font-semibold text-gray-700">{label}</p>
      <p className="text-xs text-gray-400">{sub}</p>
    </div>
  );
}

export default function ProgressRing({ tasks }: Props) {
  const critical       = tasks.filter((t) => t.is_critical_path);
  const feature        = tasks.filter((t) => !t.is_critical_path);
  const criticalDone   = critical.filter((t) => t.status === 'done').length;
  const featureDone    = feature.filter((t) => t.status === 'done').length;
  const criticalPct    = critical.length > 0 ? (criticalDone / critical.length) * 100 : 0;
  const featurePct     = feature.length > 0  ? (featureDone  / feature.length)  * 100 : 0;

  return (
    <div className="flex items-center justify-around py-2">
      <Ring
        pct={criticalPct}
        color="#6366f1"
        trackColor="#e0e7ff"
        label="Critical Path"
        sub={`${criticalDone}/${critical.length} done`}
      />
      <div className="h-16 w-px bg-gray-100" />
      <Ring
        pct={featurePct}
        color="#10b981"
        trackColor="#d1fae5"
        label="Feature Work"
        sub={`${featureDone}/${feature.length} done`}
      />
    </div>
  );
}
