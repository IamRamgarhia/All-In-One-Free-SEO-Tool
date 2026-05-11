"use client";

/**
 * Count-up animation for numeric stats. Renders a number that animates
 * from 0 (or a configured start) to the target over `duration` ms with
 * an ease-out curve. Falls back gracefully for SSR — initial paint
 * shows the final value, then re-animates client-side.
 */

import { useEffect, useRef, useState } from "react";

type Props = {
  value: number;
  duration?: number;
  /** Locale-aware formatter, default toLocaleString() */
  format?: (n: number) => string;
  className?: string;
};

export function CountUp({
  value,
  duration = 700,
  format = (n) => n.toLocaleString(),
  className,
}: Props) {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    // Run animation only on first mount; subsequent value changes snap.
    if (startedRef.current) {
      setDisplay(value);
      return;
    }
    startedRef.current = true;
    const start = performance.now();
    const from = 0;
    const to = value;
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return <span className={className}>{format(display)}</span>;
}
