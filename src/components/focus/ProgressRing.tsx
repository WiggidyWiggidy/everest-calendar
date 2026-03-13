'use client';

// ============================================
// ProgressRing — dual SVG ring showing critical-path vs feature completion
// ============================================

interface RingProps {
  /** 0–100 */
  percentage: number;
  color: string;
  radius?: number;
  stroke?: number;
}

function Ring({ percentage, color, radius = 44, stroke = 8 }: RingProps) {
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <circle
      cx="50"
      cy="50"
      r={radius}
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeDasharray={circumference}
      strokeDashoffset={offset}
      strokeLinecap="round"
      style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      transform="rotate(-90 50 50)"
    />
  );
}

interface ProgressRingProps {
  criticalDone: number;
  criticalTotal: number;
  featureDone: number;
  featureTotal: number;
  size?: number;
}

export default function ProgressRing({
  criticalDone,
  criticalTotal,
  featureDone,
  featureTotal,
  size = 140,
}: ProgressRingProps) {
  const criticalPct = criticalTotal > 0 ? Math.round((criticalDone / criticalTotal) * 100) : 0;
  const featurePct  = featureTotal  > 0 ? Math.round((featureDone  / featureTotal)  * 100) : 0;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 100 100">
          {/* Track rings */}
          <circle cx="50" cy="50" r="44" fill="none" stroke="#e5e7eb" strokeWidth="8" />
          <circle cx="50" cy="50" r="32" fill="none" stroke="#e5e7eb" strokeWidth="8" />

          {/* Outer ring = critical path (indigo) */}
          <Ring percentage={criticalPct} color="#4f46e5" radius={44} stroke={8} />

          {/* Inner ring = feature work (amber) */}
          <Ring percentage={featurePct} color="#d97706" radius={32} stroke={8} />
        </svg>

        {/* Centre label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-black text-gray-900">{criticalPct}%</span>
          <span className="text-xs text-gray-400">critical</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-indigo-600 inline-block" />
          <span className="text-gray-600">
            Critical&nbsp;
            <span className="font-semibold text-gray-900">{criticalDone}/{criticalTotal}</span>
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
          <span className="text-gray-600">
            Feature&nbsp;
            <span className="font-semibold text-gray-900">{featureDone}/{featureTotal}</span>
          </span>
        </span>
      </div>
    </div>
  );
}
