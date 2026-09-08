// mobile/src/components/admin/YoYComparisonCard.tsx
// Comparative Year-over-Year Card with dual-tone progress bars & delta pill

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react-native';
import { JellyCard } from '../JellyCard';
import { CountUp } from '../CountUp';
import { Radius, Spacing } from '../../constants/design';

interface YoYComparisonCardProps {
  title: string;
  thisVal: number;
  lastVal: number;
  isCurrency?: boolean;
  isPercent?: boolean;
  accentColor?: string;
  mountDelay?: number;
}

export const YoYComparisonCard: React.FC<YoYComparisonCardProps> = ({
  title,
  thisVal,
  lastVal,
  isCurrency = true,
  isPercent = false,
  accentColor = '#1A6FD6',
  mountDelay = 0,
}) => {
  const diff = thisVal - lastVal;
  const pct = lastVal > 0 ? Math.round((diff / lastVal) * 100) : thisVal > 0 ? 100 : 0;
  const isPositive = pct > 0;
  const isNeutral = pct === 0;

  const maxVal = Math.max(thisVal, lastVal, 1);
  const thisWidth = Math.min(100, Math.max(8, Math.round((thisVal / maxVal) * 100)));
  const lastWidth = Math.min(100, Math.max(8, Math.round((lastVal / maxVal) * 100)));

  const formatValue = (v: number) => {
    if (isCurrency) return `₹${Math.round(v).toLocaleString('en-IN')}`;
    if (isPercent) return `${v.toFixed(1)}%`;
    return Math.round(v).toLocaleString('en-IN');
  };

  return (
    <JellyCard accentColor={accentColor} style={styles.card} mountDelay={mountDelay}>
      <View style={styles.topRow}>
        <Text style={styles.title}>{title}</Text>
        <View
          style={[
            styles.deltaPill,
            isPositive && styles.deltaPositive,
            !isPositive && !isNeutral && styles.deltaNegative,
            isNeutral && styles.deltaNeutral,
          ]}
        >
          {isPositive ? (
            <TrendingUp size={12} color="#059669" />
          ) : isNeutral ? (
            <Minus size={12} color="#64748B" />
          ) : (
            <TrendingDown size={12} color="#E11D48" />
          )}
          <Text
            style={[
              styles.deltaText,
              isPositive && styles.deltaTextPositive,
              !isPositive && !isNeutral && styles.deltaTextNegative,
            ]}
          >
            {isPositive ? `+${pct}%` : `${pct}%`} YoY
          </Text>
        </View>
      </View>

      <View style={styles.valueRow}>
        <Text style={styles.thisValuePrefix}>{isCurrency ? '₹' : ''}</Text>
        <CountUp
          value={thisVal}
          style={styles.thisValue}
          formatter={v =>
            isCurrency
              ? Math.round(v).toLocaleString('en-IN')
              : isPercent
              ? `${v.toFixed(1)}%`
              : Math.round(v).toLocaleString('en-IN')
          }
        />
      </View>

      {/* Visual Bars Comparison */}
      <View style={styles.barsContainer}>
        {/* Current Year Bar */}
        <View style={styles.barRow}>
          <Text style={styles.barLabel}>THIS YEAR</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFillThis, { width: `${thisWidth}%`, backgroundColor: accentColor }]} />
          </View>
          <Text style={styles.barValue}>{formatValue(thisVal)}</Text>
        </View>

        {/* Last Year Bar */}
        <View style={styles.barRow}>
          <Text style={styles.barLabel}>LAST YEAR</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFillLast, { width: `${lastWidth}%` }]} />
          </View>
          <Text style={styles.barValueMuted}>{formatValue(lastVal)}</Text>
        </View>
      </View>
    </JellyCard>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: Radius.lg,
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  deltaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  deltaPositive: {
    backgroundColor: '#ECFDF5',
  },
  deltaNegative: {
    backgroundColor: '#FFE4E6',
  },
  deltaNeutral: {
    backgroundColor: '#F1F5F9',
  },
  deltaText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  deltaTextPositive: {
    color: '#059669',
  },
  deltaTextNegative: {
    color: '#E11D48',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  thisValuePrefix: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginRight: 2,
  },
  thisValue: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  barsContainer: {
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barLabel: {
    width: 68,
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
  },
  barTrack: {
    flex: 1,
    height: 7,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFillThis: {
    height: '100%',
    borderRadius: 4,
  },
  barFillLast: {
    height: '100%',
    backgroundColor: '#CBD5E1',
    borderRadius: 4,
  },
  barValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
    minWidth: 70,
    textAlign: 'right',
  },
  barValueMuted: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    minWidth: 70,
    textAlign: 'right',
  },
});
