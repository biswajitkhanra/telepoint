// components/JellyCard.tsx
// Living, fluid Jelly Card container with continuous subtle breathing,
// specular light sheen track, layered ambient glow, and squash & stretch touch response.

import React, { useEffect } from 'react';
import {
  View,
  StyleSheet,
  StyleProp,
  ViewStyle,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withSpring,
  withDelay,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Haptics } from '../utils/haptics';
import { Colors } from '../constants/colors';
import { Radius, Shadow } from '../constants/design';

interface JellyCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accentColor?: string;
  glow?: boolean;
  breathing?: boolean;
  activeScale?: number;
}

export const JellyCard: React.FC<JellyCardProps> = ({
  children,
  style,
  onPress,
  accentColor = Colors.primary,
  glow = true,
  breathing = true,
  activeScale = 0.96,
}) => {
  const breathAnim = useSharedValue(1);
  const sheenAnim = useSharedValue(0);

  const pressScaleX = useSharedValue(1);
  const pressScaleY = useSharedValue(1);

  useEffect(() => {
    if (!breathing) return;

    breathAnim.value = withRepeat(
      withSequence(
        withTiming(1.012, { duration: 1800 }),
        withTiming(1.0, { duration: 1800 })
      ),
      -1,
      true
    );

    sheenAnim.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200 }),
        withDelay(4000, withTiming(0, { duration: 0 }))
      ),
      -1,
      false
    );
  }, [breathing, breathAnim, sheenAnim]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: breathAnim.value },
        { scaleX: pressScaleX.value },
        { scaleY: pressScaleY.value },
      ],
    };
  });

  const handlePressIn = () => {
    pressScaleX.value = withSpring(1 + (1 - activeScale) * 0.7, { damping: 10, stiffness: 240, mass: 0.5 });
    pressScaleY.value = withSpring(activeScale, { damping: 10, stiffness: 240, mass: 0.5 });

    if (onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handlePressOut = () => {
    pressScaleX.value = withSpring(1, { damping: 6, stiffness: 200, mass: 1 });
    pressScaleY.value = withSpring(1, { damping: 6, stiffness: 200, mass: 1 });
  };

  const cardContent = (
    <Animated.View
      style={[
        styles.cardOuter,
        glow && {
          shadowColor: accentColor,
          shadowOpacity: 0.16,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
        },
        animatedStyle,
        style,
      ]}
    >
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.98)', 'rgba(247, 250, 255, 0.94)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientSurface}
      >
        {/* Specular top rim shine */}
        <View style={styles.topRimShine} />

        {/* Ambient colored side glow indicator */}
        <View style={[styles.sideAccentBar, { backgroundColor: accentColor }]} />

        {children}
      </LinearGradient>
    </Animated.View>
  );

  if (onPress) {
    return (
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
      >
        {cardContent}
      </Pressable>
    );
  }

  return cardContent;
};

const styles = StyleSheet.create({
  cardOuter: {
    borderRadius: 24,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: 'rgba(215, 226, 248, 0.75)',
    overflow: 'hidden',
    elevation: 4,
  },
  gradientSurface: {
    borderRadius: 24,
    padding: 16,
    position: 'relative',
  },
  topRimShine: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 1,
  },
  sideAccentBar: {
    position: 'absolute',
    left: 0,
    top: 14,
    bottom: 14,
    width: 3.5,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    opacity: 0.85,
  },
});

