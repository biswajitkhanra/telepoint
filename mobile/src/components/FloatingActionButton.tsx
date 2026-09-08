// components/FloatingActionButton.tsx
// Anti-Gravity Floating Action Button — spring-based idle hover, scale+rotate press, mount float-in

import React, { useEffect } from 'react';
import { StyleSheet, Pressable, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withDelay,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Haptics } from '../utils/haptics';
import { Colors } from '../constants/colors';
import { Radius, Shadow } from '../constants/design';

interface FloatingActionButtonProps {
  children: React.ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  size?: number;
  gradientColors?: string[];
  mountDelay?: number;
  disabled?: boolean;
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  children,
  onPress,
  style,
  size = 56,
  gradientColors = [Colors.gradientStart, Colors.accent],
  mountDelay = 0,
  disabled = false,
}) => {
  // Mount animation — float up from below
  const mountProgress = useSharedValue(0);
  // Idle hover — subtle float up/down
  const hoverY = useSharedValue(0);
  // Press feedback
  const pressScale = useSharedValue(1);
  const pressRotate = useSharedValue(0);
  // Ambient glow pulse
  const glowOpacity = useSharedValue(0.3);

  useEffect(() => {
    // Mount: spring from below
    mountProgress.value = withDelay(
      mountDelay,
      withSpring(1, { damping: 12, stiffness: 100, mass: 0.8 })
    );

    // Idle hover: continuous subtle float
    hoverY.value = withDelay(
      mountDelay + 300,
      withRepeat(
        withSequence(
          withSpring(-4, { damping: 8, stiffness: 40, mass: 1.2 }),
          withSpring(0, { damping: 8, stiffness: 40, mass: 1.2 })
        ),
        -1,
        true
      )
    );

    // Ambient glow pulse
    glowOpacity.value = withRepeat(
      withSequence(
        withSpring(0.5, { damping: 15, stiffness: 30 }),
        withSpring(0.25, { damping: 15, stiffness: 30 })
      ),
      -1,
      true
    );
  }, [mountDelay]);

  const animatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      mountProgress.value,
      [0, 1],
      [60, 0],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(
      mountProgress.value,
      [0, 0.5, 1],
      [0, 0.6, 1],
      Extrapolation.CLAMP
    );

    return {
      transform: [
        { translateY: translateY + hoverY.value },
        { scale: pressScale.value },
        { rotate: `${pressRotate.value}deg` },
      ],
      opacity,
    };
  });

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value * mountProgress.value,
  }));

  const handlePressIn = () => {
    pressScale.value = withSpring(0.85, { damping: 10, stiffness: 300, mass: 0.4 });
    pressRotate.value = withSpring(-8, { damping: 10, stiffness: 300, mass: 0.4 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handlePressOut = () => {
    pressScale.value = withSpring(1, { damping: 6, stiffness: 180, mass: 0.8 });
    pressRotate.value = withSpring(0, { damping: 6, stiffness: 180, mass: 0.8 });
  };

  return (
    <Animated.View style={[styles.container, style, animatedStyle]}>
      {/* Ambient glow behind the button */}
      <Animated.View
        style={[
          styles.glow,
          {
            width: size + 20,
            height: size + 20,
            borderRadius: (size + 20) / 2,
            backgroundColor: gradientColors[0],
          },
          glowStyle,
        ]}
      />

      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        disabled={disabled}
      >
        <LinearGradient
          colors={gradientColors as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.button,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
            },
          ]}
        >
          {children}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    ...Shadow.glowPrimary,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.heavy,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
});
