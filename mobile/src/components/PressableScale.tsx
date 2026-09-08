// components/PressableScale.tsx
// Tactile pressable wrapper with authentic Jelly Squash & Stretch physics & haptic micro-delight

import React from 'react';
import {
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
  GestureResponderEvent,
  StyleSheet,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Haptics } from '../utils/haptics';

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
  const scaleX = useSharedValue(1);
  const scaleY = useSharedValue(1);
  const pressOpacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scaleX: scaleX.value },
        { scaleY: scaleY.value },
      ],
      opacity: pressOpacity.value,
    };
  });

  const handlePressIn = (e: GestureResponderEvent) => {
    const target = scaleTo;
    scaleX.value = withSpring(target, { damping: 20, stiffness: 350, mass: 0.5 });
    scaleY.value = withSpring(target, { damping: 20, stiffness: 350, mass: 0.5 });
    pressOpacity.value = withSpring(0.92, { damping: 20, stiffness: 300 });

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
    // Pure fluid release: critical damping 24 for instant zero-wobble recovery
    scaleX.value = withSpring(1, { damping: 24, stiffness: 300, mass: 0.6 });
    scaleY.value = withSpring(1, { damping: 24, stiffness: 300, mass: 0.6 });
    pressOpacity.value = withSpring(1, { damping: 20, stiffness: 300 });

    if (onPressOut) onPressOut(e);
  };

  const flatStyle = (StyleSheet.flatten(style) || {}) as ViewStyle;
  const containerFlexStyle: ViewStyle = {};
  if (flatStyle.flex !== undefined) containerFlexStyle.flex = flatStyle.flex;
  if (flatStyle.flexGrow !== undefined) containerFlexStyle.flexGrow = flatStyle.flexGrow;
  if (flatStyle.flexShrink !== undefined) containerFlexStyle.flexShrink = flatStyle.flexShrink;
  if (flatStyle.width !== undefined) containerFlexStyle.width = flatStyle.width;

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      style={containerFlexStyle}
      {...rest}
    >
      <Animated.View style={[style, animatedStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

