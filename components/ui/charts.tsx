'use client';

/**
 * Themed Recharts building blocks.
 *
 * Design rules baked in (dataviz method):
 *  - one axis per chart, never dual-scale;
 *  - ≤2 concurrent series: current period = indigo, comparison = neutral slate,
 *    so identity survives every kind of color-vision deficiency;
 *  - text wears ink tokens, marks carry color; legend + direct value labels;
 *  - recessive grid, rounded bar ends, 2px line weight;
 *  - loaded lazily (next/dynamic) so charts never block first paint.
 */

import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, AreaChart, Area, Cell, LabelList,
} from 'recharts';

export const SERIES = {
  current: '#6366f1',      // indigo-500 — “this period”
  currentDark: '#818cf8',
  compare: '#94a3b8',      // slate-400 — “last period”
  compareDark: '#64748b',
  emerald: '#10b981',
  rose: '#f43f5e',
  amber: '#f59e0b',
  sky: '#0ea5e9',
};

/** Watch <html class="dark"> so charts restyle live with the theme toggle. */
export function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setDark(el.classList.contains('dark'));
    update();
    const obs = new MutationObserver(update);
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export function chartInk(dark: boolean) {
  return {
    axis: dark ? '#94a3b8' : '#64748b',
    grid: dark ? 'rgba(148,163,184,0.14)' : 'rgba(100,116,139,0.14)',
    tooltipBg: dark ? '#1e293b' : '#ffffff',
    tooltipBorder: dark ? '#475569' : '#e2e8f0',
    tooltipText: dark ? '#f1f5f9' : '#0f172a',
  };
}

export function tooltipStyle(dark: boolean): React.CSSProperties {
  const ink = chartInk(dark);
  return {
    background: ink.tooltipBg,
    border: `1px solid ${ink.tooltipBorder}`,
    borderRadius: 12,
    color: ink.tooltipText,
    fontSize: 12,
    boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
    padding: '8px 12px',
  };
}

/** Grouped two-series comparison (e.g. this year vs last year). */
export function CompareBars({
  data, currentLabel, compareLabel, format, height = 260,
}: {
  data: { name: string; current: number; compare: number }[];
  currentLabel: string;
  compareLabel: string;
  format: (v: number) => string;
  height?: number;
}) {
  const dark = useIsDark();
  const ink = chartInk(dark);
  const cur = dark ? SERIES.currentDark : SERIES.current;
  const cmp = dark ? SERIES.compareDark : SERIES.compare;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 22, right: 8, left: 8, bottom: 0 }} barGap={6}>
        <CartesianGrid stroke={ink.grid} vertical={false} />
        <XAxis dataKey="name" tick={{ fill: ink.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(v: number) => format(v)} tick={{ fill: ink.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={72} />
        <Tooltip
          cursor={{ fill: dark ? 'rgba(148,163,184,0.08)' : 'rgba(100,116,139,0.07)' }}
          contentStyle={tooltipStyle(dark)}
          formatter={(v) => format(Number(v))}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: ink.axis }} iconType="circle" iconSize={9} />
        <Bar dataKey="compare" name={compareLabel} fill={cmp} radius={[4, 4, 0, 0]} maxBarSize={44} animationDuration={420} animationEasing="ease-out">
          <LabelList dataKey="compare" position="top" formatter={(v) => format(Number(v))} style={{ fill: ink.axis, fontSize: 10, fontWeight: 700 }} />
        </Bar>
        <Bar dataKey="current" name={currentLabel} fill={cur} radius={[4, 4, 0, 0]} maxBarSize={44} animationDuration={420} animationEasing="ease-out">
          <LabelList dataKey="current" position="top" formatter={(v) => format(Number(v))} style={{ fill: dark ? '#c7d2fe' : '#4338ca', fontSize: 10, fontWeight: 700 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Single-hue monthly trend area (e.g. fine collected per month). */
export function TrendArea({
  data, format, height = 240, color,
}: {
  data: { name: string; value: number }[];
  format: (v: number) => string;
  height?: number;
  color?: string;
}) {
  const dark = useIsDark();
  const ink = chartInk(dark);
  const c = color ?? (dark ? SERIES.currentDark : SERIES.current);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="tp-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c} stopOpacity={0.28} />
            <stop offset="100%" stopColor={c} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={ink.grid} vertical={false} />
        <XAxis dataKey="name" tick={{ fill: ink.axis, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={(v: number) => format(v)} tick={{ fill: ink.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={68} />
        <Tooltip contentStyle={tooltipStyle(dark)} formatter={(v) => format(Number(v))} />
        <Area
          type="monotone" dataKey="value" stroke={c} strokeWidth={2}
          fill="url(#tp-trend-fill)" activeDot={{ r: 4 }} animationDuration={420}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Year-wise profit vs loss paired bars (green / rose, direct-labelled). */
export function ProfitLossBars({
  data, format, height = 240,
}: {
  data: { name: string; profit: number; loss: number }[];
  format: (v: number) => string;
  height?: number;
}) {
  const dark = useIsDark();
  const ink = chartInk(dark);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 20, right: 8, left: 8, bottom: 0 }} barGap={6}>
        <CartesianGrid stroke={ink.grid} vertical={false} />
        <XAxis dataKey="name" tick={{ fill: ink.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(v: number) => format(v)} tick={{ fill: ink.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={72} />
        <Tooltip
          cursor={{ fill: dark ? 'rgba(148,163,184,0.08)' : 'rgba(100,116,139,0.07)' }}
          contentStyle={tooltipStyle(dark)}
          formatter={(v) => format(Number(v))}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: ink.axis }} iconType="circle" iconSize={9} />
        <Bar dataKey="profit" name="Profit" fill={SERIES.emerald} radius={[4, 4, 0, 0]} maxBarSize={40} animationDuration={420} animationEasing="ease-out" />
        <Bar dataKey="loss" name="Loss booked" fill={SERIES.rose} radius={[4, 4, 0, 0]} maxBarSize={40} animationDuration={420} animationEasing="ease-out" />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal single-hue ranked bars with per-row emphasis on the selection. */
export function RankedBars({
  data, format, height, selected,
}: {
  data: { name: string; value: number }[];
  format: (v: number) => string;
  height?: number;
  selected?: string;
}) {
  const dark = useIsDark();
  const ink = chartInk(dark);
  const base = dark ? SERIES.currentDark : SERIES.current;
  const h = height ?? Math.max(120, data.length * 34 + 30);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 60, left: 8, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={120} tick={{ fill: ink.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: dark ? 'rgba(148,163,184,0.08)' : 'rgba(100,116,139,0.07)' }}
          contentStyle={tooltipStyle(dark)}
          formatter={(v) => format(Number(v))}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18} animationDuration={420}>
          {data.map(d => (
            <Cell key={d.name} fill={base} opacity={selected && d.name !== selected ? 0.45 : 1} />
          ))}
          <LabelList dataKey="value" position="right" formatter={(v) => format(Number(v))} style={{ fill: ink.axis, fontSize: 10, fontWeight: 700 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
