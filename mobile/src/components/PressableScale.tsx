// components/PressableScale.tsx
// Tactile pressable wrapper with authentic Jelly Squash & Stretch physics & haptic micro-delight

import React from 'react';
import {
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
  GestureResponderEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
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
  const scaleX = useSharedValue(1);
  const scaleY = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scaleX: scaleX.value },
        { scaleY: scaleY.value },
      ],
    };
  });

  const handlePressIn = (e: GestureResponderEvent) => {
    // Jelly squash & stretch: compresses vertically, bulges horizontally
    const targetY = scaleTo;
    const targetX = jelly ? 1 + (1 - scaleTo) * 0.75 : scaleTo;

    scaleX.value = withSpring(targetX, { damping: 10, stiffness: 240, mass: 0.5 });
    scaleY.value = withSpring(targetY, { damping: 10, stiffness: 240, mass: 0.5 });

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
    scaleX.value = withSpring(1, { damping: 6, stiffness: 200, mass: 1 });
    scaleY.value = withSpring(1, { damping: 6, stiffness: 200, mass: 1 });

    if (onPressOut) onPressOut(e);
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      {...rest}
    >
      <Animated.View style={[style, animatedStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

