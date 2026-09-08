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
  /** Delay before mount animation (ms). Stagger this for list cascade. */
  mountDelay?: number;
}

export const JellyCard: React.FC<JellyCardProps> = ({
  children,
  style,
  onPress,
  accentColor = Colors.primary,
  glow = true,
  breathing = true,
  activeScale = 0.96,
  mountDelay = 0,
}) => {
  const pressScale = useSharedValue(1);

  // Mount animation: smooth silky fluid slide-up
  const mountTranslateY = useSharedValue(16);
  const mountOpacity = useSharedValue(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      mountTranslateY.value = withSpring(0, { damping: 24, stiffness: 180, mass: 0.8 });
      mountOpacity.value = withTiming(1, { duration: 240 });
    }, mountDelay);

    return () => clearTimeout(timer);
  }, [mountDelay]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: mountTranslateY.value },
        { scale: pressScale.value },
      ],
      opacity: mountOpacity.value,
    };
  });

  const handlePressIn = () => {
    pressScale.value = withSpring(activeScale || 0.98, { damping: 20, stiffness: 350 });
    if (onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handlePressOut = () => {
    pressScale.value = withSpring(1, { damping: 22, stiffness: 300 });
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

