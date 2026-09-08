// components/DaysLeftBadge.tsx
// Urgency badge with pulsing animation when due within 5 days

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { AlertCircle, Clock } from 'lucide-react-native';
import { Haptics } from '../utils/haptics';
import { Colors } from '../constants/colors';

interface DaysLeftBadgeProps {
  daysLeft: number;
  triggerHaptics?: boolean;
}

export const DaysLeftBadge: React.FC<DaysLeftBadgeProps> = ({
  daysLeft,
  triggerHaptics = false,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (daysLeft <= 5) {
      if (triggerHaptics && daysLeft <= 3) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }

      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();

      return () => pulse.stop();
    }
  }, [daysLeft, triggerHaptics]);

  let badgeBg = 'rgba(255, 255, 255, 0.2)';
  let textColor = '#FFFFFF';
  let label = `${daysLeft} days left`;
  let isUrgent = daysLeft <= 5;

  if (daysLeft === 0) {
    badgeBg = '#EF4444';
    label = 'DUE TODAY';
  } else if (daysLeft === 1) {
    badgeBg = '#DC2626';
    label = '1 DAY LEFT';
  } else if (daysLeft <= 3) {
    badgeBg = '#F59E0B';
    label = `${daysLeft} DAYS LEFT`;
  } else if (daysLeft <= 5) {
    badgeBg = '#D97706';
    label = `${daysLeft} DAYS LEFT`;
  }

  return (
    <Animated.View
      style={[
        styles.badge,
        { backgroundColor: badgeBg },
        isUrgent && { transform: [{ scale: pulseAnim }] },
      ]}
    >
      {isUrgent ? (
        <AlertCircle size={12} color={textColor} />
      ) : (
        <Clock size={12} color={textColor} />
      )}
      <Text style={[styles.badgeText, { color: textColor }]}>{label}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
