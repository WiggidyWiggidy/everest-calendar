'use client';

// ============================================
// WaveVisualization
// Canvas-based audio level visualization.
// When isActive, draws animated bars; otherwise draws a minimal flat line.
// ============================================

import { useRef, useEffect } from 'react';

interface WaveVisualizationProps {
  isActive: boolean;    // true during recording or TTS playback
  audioLevel?: number;  // 0–1 optional amplitude override
  className?: string;
}

const BAR_COUNT = 28;
const BAR_GAP   = 3;

export default function WaveVisualization({
  isActive,
  audioLevel = 0,
  className = '',
}: WaveVisualizationProps) {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const animFrameRef  = useRef<number>(0);
  const frameRef      = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function draw() {
      if (!canvas || !ctx) return;

      // Device pixel ratio for crisp rendering
      const dpr    = window.devicePixelRatio || 1;
      const rect   = canvas.getBoundingClientRect();
      const width  = rect.width  * dpr;
      const height = rect.height * dpr;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width  = width;
        canvas.height = height;
      }

      ctx.clearRect(0, 0, width, height);

      const barWidth = (width - (BAR_COUNT - 1) * BAR_GAP) / BAR_COUNT;
      frameRef.current++;
      const t = frameRef.current;

      for (let i = 0; i < BAR_COUNT; i++) {
        let level: number;

        if (isActive) {
          // Animated sine wave with slight randomness
          const phase  = (i / BAR_COUNT) * Math.PI * 2;
          const wave   = Math.sin(phase + t * 0.08) * 0.4 + 0.4;
          const jitter = Math.random() * 0.15;
          const amp    = Math.max(0, audioLevel); // 0–1 amplitude hint
          level = Math.max(0.06, wave * (0.5 + amp * 0.5) + jitter);
        } else {
          level = 0.04;
        }

        const barHeight = Math.max(3 * (window.devicePixelRatio || 1), level * height * 0.88);
        const x = i * (barWidth + BAR_GAP);
        const y = (height - barHeight) / 2;

        // Indigo-500 when active, gray-300 when idle
        ctx.fillStyle = isActive ? '#6366f1' : '#d1d5db';

        // Draw bar with manual arc rounding instead of roundRect (Safari compat)
        const r = Math.min(barWidth / 2, barHeight / 2, 3 * dpr);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + barWidth - r, y);
        ctx.arcTo(x + barWidth, y, x + barWidth, y + r, r);
        ctx.lineTo(x + barWidth, y + barHeight - r);
        ctx.arcTo(x + barWidth, y + barHeight, x + barWidth - r, y + barHeight, r);
        ctx.lineTo(x + r, y + barHeight);
        ctx.arcTo(x, y + barHeight, x, y + barHeight - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(draw);
    }

    draw();

    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isActive, audioLevel]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full ${className}`}
      style={{ display: 'block' }}
    />
  );
}
