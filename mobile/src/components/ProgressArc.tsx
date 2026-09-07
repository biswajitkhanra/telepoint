// components/ProgressArc.tsx
// Circular progress arc for loan completion metrics

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors } from '../constants/colors';

interface ProgressArcProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  bgColor?: string;
  showText?: boolean;
}

export const ProgressArc: React.FC<ProgressArcProps> = ({
  percentage,
  size = 76,
  strokeWidth = 7,
  color = Colors.primary,
  bgColor = '#E2E8F0',
  showText = true,
}) => {
  const cleanPct = Math.min(Math.max(percentage, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (cleanPct / 100) * circumference;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* Background track circle */}
        <Circle
          stroke={bgColor}
          fill="none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        {/* Active progress stroke */}
        <Circle
          stroke={color}
          fill="none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {showText && (
        <View style={styles.centerTextContainer}>
          <Text style={[styles.percentageText, { color }]}>
            {Math.round(cleanPct)}%
          </Text>
          <Text style={styles.labelText}>PAID</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerTextContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentageText: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  labelText: {
    fontSize: 7,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
});
