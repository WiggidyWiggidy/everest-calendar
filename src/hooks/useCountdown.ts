'use client';

import { useState, useEffect } from 'react';

interface CountdownResult {
  days: number;
  hours: number;
}

export function useCountdown(targetDate: Date): CountdownResult {
  const [timeLeft, setTimeLeft] = useState<CountdownResult>({ days: 0, hours: 0 });

  useEffect(() => {
    function calculate() {
      const now = new Date();
      const diff = targetDate.getTime() - now.getTime();
      if (diff <= 0) return { days: 0, hours: 0 };
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      return { days, hours };
    }

    setTimeLeft(calculate());
    const id = setInterval(() => setTimeLeft(calculate()), 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  return timeLeft;
}
