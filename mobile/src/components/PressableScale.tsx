// components/PressableScale.tsx
// Tactile pressable wrapper with spring physics & haptic micro-delight

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
import { SPRING_SNAP } from '../constants/animations';

interface PressableScaleProps extends PressableProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  hapticStyle?: 'light' | 'medium' | 'heavy' | 'selection' | 'none';
}

export const PressableScale: React.FC<PressableScaleProps> = ({
  children,
  style,
  scaleTo = 0.96,
  hapticStyle = 'medium',
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = (e: GestureResponderEvent) => {
    Animated.spring(scaleAnim, {
      toValue: scaleTo,
      tension: SPRING_SNAP.tension,
      friction: SPRING_SNAP.friction,
      useNativeDriver: true,
    }).start();

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
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: SPRING_SNAP.tension,
      friction: SPRING_SNAP.friction,
      useNativeDriver: true,
    }).start();

    if (onPressOut) onPressOut(e);
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      {...rest}
    >
      <Animated.View style={[style, { transform: [{ scale: scaleAnim }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};
