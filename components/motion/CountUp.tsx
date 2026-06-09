'use client';

import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';

interface Props {
  /** Final numeric value to animate to. */
  value: number;
  /** Formats the in-flight number for display (e.g. currency / percent). */
  format?: (n: number) => string;
  /** Animation duration in seconds. */
  duration?: number;
  className?: string;
}

/**
 * Animated number that counts up from its previous value to the new one with
 * an ease-out curve — gives statistics cards a "live, alive" feel. Re-animates
 * smoothly whenever `value` changes (e.g. after a refresh or a new period).
 *
 * Respects prefers-reduced-motion by snapping straight to the final value.
 */
export default function CountUp({ value, format, duration = 1.1, className }: Props) {
  const reduce = useReducedMotion();
  const fmt = format ?? ((n: number) => String(Math.round(n)));
  const prev = useRef(0);
  const [text, setText] = useState(() => fmt(reduce ? value : 0));

  useEffect(() => {
    if (reduce) {
      setText(fmt(value));
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setText(fmt(v)),
      onComplete: () => { prev.current = value; },
    });
    prev.current = value;
    return () => controls.stop();
    // Re-run only when the target value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, reduce]);

  return <span className={className}>{text}</span>;
}
