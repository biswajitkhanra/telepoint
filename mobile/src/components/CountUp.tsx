// components/CountUp.tsx
// Jupiter Principle #1: Numbers are heroes — animated count-up with tabular digits

import React, { useEffect, useState, useRef } from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';

interface CountUpProps {
  end?: number;
  value?: number;
  start?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  style?: StyleProp<TextStyle>;
  decimals?: number;
  formatter?: (v: number) => string;
}

export const CountUp: React.FC<CountUpProps> = ({
  end,
  value,
  start = 0,
  duration = 800,
  prefix = '',
  suffix = '',
  style,
  decimals = 0,
  formatter,
}) => {
  const targetEnd = value !== undefined ? value : (end ?? 0);
  const [displayValue, setDisplayValue] = useState(start);
  const startTimeRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    const startValue = start;
    const targetValue = targetEnd;
    const change = targetValue - startValue;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out quad interpolation
      const easeOut = 1 - (1 - progress) * (1 - progress);
      const current = startValue + change * easeOut;

      if (isMounted) {
        setDisplayValue(current);
      }

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        if (isMounted) setDisplayValue(targetValue);
      }
    };

    startTimeRef.current = null;
    frameRef.current = requestAnimationFrame(animate);

    return () => {
      isMounted = false;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [targetEnd, start, duration]);

  const formatted = formatter
    ? formatter(displayValue)
    : decimals > 0
    ? displayValue.toLocaleString('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : Math.round(displayValue).toLocaleString('en-IN');

  return (
    <Text style={style}>
      {prefix}
      {formatted}
      {suffix}
    </Text>
  );
};
