// components/JellyCard.tsx
// Living, fluid Jelly Card container with continuous subtle breathing,
// specular light sheen track, layered ambient glow, and squash & stretch touch response.

import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  StyleProp,
  ViewStyle,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
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
  // Breathing scale oscillation
  const breathAnim = useRef(new Animated.Value(1)).current;
  const sheenAnim = useRef(new Animated.Value(0)).current;

  // Touch squash & stretch
  const pressScaleX = useRef(new Animated.Value(1)).current;
  const pressScaleY = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!breathing) return;

    // Gentle 3-second breathing pulse that gives cards a living feel
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(breathAnim, {
          toValue: 1.012,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(breathAnim, {
          toValue: 1.0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    );
    breathe.start();

    // Occasional gentle sheen sweep
    const sheen = Animated.loop(
      Animated.sequence([
        Animated.timing(sheenAnim, {
          toValue: 1,
          duration: 2200,
          useNativeDriver: true,
        }),
        Animated.delay(4000),
        Animated.timing(sheenAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    sheen.start();

    return () => {
      breathe.stop();
      sheen.stop();
    };
  }, [breathing]);

  const handlePressIn = () => {
    Animated.parallel([
      Animated.spring(pressScaleX, {
        toValue: 1 + (1 - activeScale) * 0.7,
        tension: 240,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.spring(pressScaleY, {
        toValue: activeScale,
        tension: 240,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    if (onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.spring(pressScaleX, {
        toValue: 1,
        tension: 180,
        friction: 4.5,
        useNativeDriver: true,
      }),
      Animated.spring(pressScaleY, {
        toValue: 1,
        tension: 180,
        friction: 4.5,
        useNativeDriver: true,
      }),
    ]).start();
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
        {
          transform: [
            { scale: breathAnim },
            { scaleX: pressScaleX },
            { scaleY: pressScaleY },
          ],
        },
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
