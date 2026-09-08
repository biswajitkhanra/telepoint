// components/AnimatedList.tsx
// Staggered float-in wrapper — wraps children and animates each one floating up with spring physics.
// Each item gets an increasing delay for a cascading "anti-gravity" entrance effect.

import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withDelay,
  FadeIn,
  SlideInDown,
} from 'react-native-reanimated';

interface AnimatedListItemProps {
  children: React.ReactNode;
  index: number;
  baseDelay?: number;
  staggerMs?: number;
  offsetY?: number;
  style?: StyleProp<ViewStyle>;
}

const SPRING_CONFIG = {
  damping: 14,
  stiffness: 90,
  mass: 0.7,
  overshootClamping: false,
};

/**
 * Wrap individual list items with this to get staggered float-in animations.
 * Usage:
 * ```
 * {items.map((item, i) => (
 *   <AnimatedListItem key={item.id} index={i}>
 *     <YourCard data={item} />
 *   </AnimatedListItem>
 * ))}
 * ```
 */
export const AnimatedListItem: React.FC<AnimatedListItemProps> = ({
  children,
  index,
  baseDelay = 80,
  staggerMs = 60,
  offsetY = 30,
  style,
}) => {
  const delay = baseDelay + index * staggerMs;

  return (
    <Animated.View
      entering={SlideInDown.delay(delay)
        .springify()
        .damping(SPRING_CONFIG.damping)
        .stiffness(SPRING_CONFIG.stiffness)
        .mass(SPRING_CONFIG.mass)}
      style={style}
    >
      {children}
    </Animated.View>
  );
};

/**
 * Simple fade+slide entering animation for section headers and standalone elements.
 */
export const AnimatedFadeIn: React.FC<{
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}> = ({ children, delay = 0, style }) => (
  <Animated.View
    entering={FadeIn.delay(delay).duration(400)}
    style={style}
  >
    {children}
  </Animated.View>
);
