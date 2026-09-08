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
    // Jelly squash & stretch: compresses vertically, bulges horizontally
    const targetY = scaleTo;
    const targetX = jelly ? 1 + (1 - scaleTo) * 0.75 : scaleTo;

    // Anti-gravity spring physics: custom damping for fluid response
    scaleX.value = withSpring(targetX, { damping: 12, stiffness: 280, mass: 0.4 });
    scaleY.value = withSpring(targetY, { damping: 12, stiffness: 280, mass: 0.4 });
    pressOpacity.value = withSpring(0.85, { damping: 20, stiffness: 300 });

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
    // Anti-gravity release: low damping (5) for pronounced wobble overshoot
    scaleX.value = withSpring(1, { damping: 5, stiffness: 180, mass: 0.9 });
    scaleY.value = withSpring(1, { damping: 5, stiffness: 180, mass: 0.9 });
    pressOpacity.value = withSpring(1, { damping: 15, stiffness: 200 });

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

