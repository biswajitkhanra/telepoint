import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { THEME } from '../config';
import { Card3D } from './Card3D';

interface EmiProgressRingProps {
  totalEmis: number;
  paidEmis: number;
  totalAmount: number;
  paidAmount: number;
}

export const EmiProgressRing: React.FC<EmiProgressRingProps> = ({
  totalEmis,
  paidEmis,
  totalAmount,
  paidAmount,
}) => {
  const safeTotalEmis = Math.max(1, totalEmis);
  const percentage = Math.min(100, Math.round((paidEmis / safeTotalEmis) * 100));
  const remainingAmount = Math.max(0, totalAmount - paidAmount);

  // SVG circular geometry
  const size = 110;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * percentage) / 100;

  const formatInr = (n: number) =>
    `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;

  return (
    <Card3D
      style={styles.card}
      gradientColors={['#101626', '#090D17']}
      elevated={true}
    >
      <View style={styles.container}>
        {/* Left: Circular Progress Ring */}
        <View style={styles.ringWrapper}>
          <Svg width={size} height={size}>
            <Defs>
              <LinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#34D399" />
                <Stop offset="1" stopColor="#10B981" />
              </LinearGradient>
            </Defs>

            {/* Background Track */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth={strokeWidth}
              fill="none"
            />

            {/* Active Progress Fill */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="url(#ringGrad)"
              strokeWidth={strokeWidth}
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="none"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </Svg>

          {/* Center Percentage Label */}
          <View style={styles.centerTextContainer}>
            <Text style={styles.percentNumber}>{percentage}%</Text>
            <Text style={styles.percentSub}>PAID</Text>
          </View>
        </View>

        {/* Right: Loan Amortization Breakdown */}
        <View style={styles.infoColumn}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>LOAN AMORTIZATION</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>
                {paidEmis}/{totalEmis} EMIs
              </Text>
            </View>
          </View>

          <View style={styles.dataRow}>
            <View>
              <Text style={styles.dataLabel}>Repaid So Far</Text>
              <Text style={styles.dataValueRepaid}>{formatInr(paidAmount)}</Text>
            </View>
            <View>
              <Text style={styles.dataLabel}>Remaining</Text>
              <Text style={styles.dataValueRemaining}>{formatInr(remainingAmount)}</Text>
            </View>
          </View>

          {/* Micro Progress Bar */}
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${percentage}%` }]} />
          </View>
        </View>
      </View>
    </Card3D>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 6,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  ringWrapper: {
    position: 'relative',
    width: 110,
    height: 110,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerTextContainer: {
    position: 'absolute',
    alignItems: 'center',
  },
  percentNumber: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  percentSub: {
    color: '#34D399',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  infoColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  countBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  countText: {
    color: '#93C5FD',
    fontSize: 10,
    fontWeight: '800',
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  dataLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
  },
  dataValueRepaid: {
    color: '#34D399',
    fontSize: 14,
    fontWeight: '800',
  },
  dataValueRemaining: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
  },
  barTrack: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 2,
  },
});
