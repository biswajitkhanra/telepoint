// components/GradientCard.tsx
// IDFC + Jupiter Neo Hero Card: Numbers as heroes, vibrant gradient, 3D tilt & delight

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkles, ArrowUpRight } from 'lucide-react-native';
import { CountUp } from './CountUp';
import { DaysLeftBadge } from './DaysLeftBadge';
import { Colors } from '../constants/colors';
import { Radius, Spacing, Shadow } from '../constants/design';
import { Typography } from '../constants/typography';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface GradientCardProps {
  loanAmount: number;
  paidAmount: number;
  nextEmiAmount: number;
  nextDueDate?: string;
  daysLeft: number;
  tenureMonths: number;
  paidMonths: number;
  onPayPress?: () => void;
}

export const GradientCard: React.FC<GradientCardProps> = ({
  loanAmount,
  paidAmount,
  nextEmiAmount,
  nextDueDate,
  daysLeft,
  tenureMonths,
  paidMonths,
  onPayPress,
}) => {
  // Floating luminous glow animation
  const glowAnim = useRef(new Animated.Value(0.25)).current;

  // 3D perspective tilt values
  const tiltX = useRef(new Animated.Value(0)).current;
  const tiltY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.5,
          duration: 2600,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.25,
          duration: 2600,
          useNativeDriver: true,
        }),
      ])
    );
    glow.start();
    return () => glow.stop();
  }, []);

  // Pan responder for subtle 3D tilt on touch
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        const rotateY = Math.max(Math.min(gestureState.dx / 25, 8), -8);
        const rotateX = Math.max(Math.min(-gestureState.dy / 25, 8), -8);
        tiltX.setValue(rotateX);
        tiltY.setValue(rotateY);
      },
      onPanResponderRelease: () => {
        Animated.parallel([
          Animated.spring(tiltX, {
            toValue: 0,
            tension: 200,
            friction: 12,
            useNativeDriver: true,
          }),
          Animated.spring(tiltY, {
            toValue: 0,
            tension: 200,
            friction: 12,
            useNativeDriver: true,
          }),
        ]).start();
      },
    })
  ).current;

  const paidPercentage = loanAmount > 0 ? Math.min((paidAmount / loanAmount) * 100, 100) : 0;

  const rotateXInterpolated = tiltX.interpolate({
    inputRange: [-10, 10],
    outputRange: ['-8deg', '8deg'],
  });

  const rotateYInterpolated = tiltY.interpolate({
    inputRange: [-10, 10],
    outputRange: ['-8deg', '8deg'],
  });

  return (
    <View style={styles.outerContainer}>
      {/* Background ambient glow */}
      <Animated.View
        style={[
          styles.ambientGlow,
          {
            opacity: glowAnim,
          },
        ]}
      />

      {/* Interactive 3D tilt card */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.cardWrapper,
          {
            transform: [
              { perspective: 800 },
              { rotateX: rotateXInterpolated },
              { rotateY: rotateYInterpolated },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={[Colors.gradientStart, Colors.gradientMid, Colors.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientCard}
        >
          {/* Subtle top-left gloss highlight */}
          <View style={styles.glossHighlight} />

          {/* Top row: Brand & Status Tag */}
          <View style={styles.topRow}>
            <View style={styles.loanTypePill}>
              <Sparkles size={13} color="#FFFFFF" />
              <Text style={styles.loanTypeText}>SMARTPHONE FINANCE</Text>
            </View>

            <DaysLeftBadge daysLeft={daysLeft} triggerHaptics={true} />
          </View>

          {/* Hero amount section — Jupiter Principle #1 */}
          <View style={styles.heroAmountSection}>
            <Text style={styles.heroLabel}>TOTAL LOAN DISBURSED</Text>
            <View style={styles.amountRow}>
              <CountUp
                end={loanAmount}
                prefix="₹"
                style={styles.heroAmountText}
                duration={900}
              />
            </View>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressSection}>
            <View style={styles.progressLabelRow}>
              <Text style={styles.progressLabelText}>
                Repayment: {paidMonths}/{tenureMonths} EMIs
              </Text>
              <Text style={styles.progressPercentageText}>
                {Math.round(paidPercentage)}% Paid
              </Text>
            </View>

            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${paidPercentage}%` },
                ]}
              />
            </View>
          </View>

          {/* Divider */}
          <View style={styles.cardDivider} />

          {/* Bottom stats row */}
          <View style={styles.bottomStatsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>NEXT EMI AMOUNT</Text>
              <CountUp
                end={nextEmiAmount}
                prefix="₹"
                style={styles.statValue}
                duration={600}
              />
            </View>

            <View style={styles.statColRight}>
              <Text style={styles.statLabel}>DUE DATE</Text>
              <Text style={styles.statValueDate}>
                {nextDueDate || 'Fully Paid'}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ambientGlow: {
    position: 'absolute',
    width: '92%',
    height: '92%',
    borderRadius: Radius['2xl'],
    backgroundColor: '#1A6FD6',
    shadowColor: '#1A6FD6',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
    elevation: 8,
  },
  cardWrapper: {
    width: '100%',
  },
  gradientCard: {
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    elevation: 6,
    shadowColor: '#1A6FD6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
  },
  glossHighlight: {
    position: 'absolute',
    top: -50,
    left: -50,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  loanTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  loanTypeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  heroAmountSection: {
    marginVertical: Spacing.sm,
  },
  heroLabel: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  heroAmountText: {
    fontSize: 38,
    lineHeight: 46,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  progressSection: {
    marginTop: Spacing.md,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabelText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  progressPercentageText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#34D399', // Emerald shine
    borderRadius: Radius.full,
  },
  cardDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    marginVertical: Spacing.base,
  },
  bottomStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statCol: {
    flex: 1,
  },
  statColRight: {
    alignItems: 'flex-end',
  },
  statLabel: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  statValueDate: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
