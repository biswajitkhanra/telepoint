// components/PressableScale.tsx
// Tactile pressable wrapper with authentic Jelly Squash & Stretch physics & haptic micro-delight

import React, { useRef } from 'react';
import {
  Pressable,
  Animated,
  PressableProps,
  StyleProp,
  ViewStyle,
  GestureResponderEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';

interface PressableScaleProps extends PressableProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  jelly?: boolean;
  hapticStyle?: 'light' | 'medium' | 'heavy' | 'selection' | 'none';
}

export const PressableScale: React.FC<PressableScaleProps> = ({
  children,
  style,
  scaleTo = 0.94,
  jelly = true,
  hapticStyle = 'medium',
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}) => {
  const scaleXAnim = useRef(new Animated.Value(1)).current;
  const scaleYAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = (e: GestureResponderEvent) => {
    // Jelly squash & stretch: compresses vertically, bulges horizontally
    const targetY = scaleTo;
    const targetX = jelly ? 1 + (1 - scaleTo) * 0.75 : scaleTo;

    Animated.parallel([
      Animated.spring(scaleXAnim, {
        toValue: targetX,
        tension: 240,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.spring(scaleYAnim, {
        toValue: targetY,
        tension: 240,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    if (hapticStyle === 'light') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else if (hapticStyle === 'medium') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else if (hapticStyle === 'heavy') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else if (hapticStyle === 'selection') {
      Haptics.selectionAsync();
    }

    if (onPressIn) onPressIn(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    // Spring release with low friction for authentic jelly wobble
    Animated.parallel([
      Animated.spring(scaleXAnim, {
        toValue: 1,
        tension: 180,
        friction: 4.5,
        useNativeDriver: true,
      }),
      Animated.spring(scaleYAnim, {
        toValue: 1,
        tension: 180,
        friction: 4.5,
        useNativeDriver: true,
      }),
    ]).start();

    if (onPressOut) onPressOut(e);
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      {...rest}
    >
      <Animated.View
        style={[
          style,
          {
            transform: [
              { scaleX: scaleXAnim },
              { scaleY: scaleYAnim },
            ],
          },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
};
