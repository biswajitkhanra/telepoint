import React, { useRef } from 'react';
import {
  Animated,
  TouchableWithoutFeedback,
  StyleSheet,
  ViewStyle,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Haptics } from '../utils/haptics';
import { THEME, SPRING_CONFIG } from '../config';

interface Card3DProps {
  children: React.ReactNode;
  style?: ViewStyle;
  gradientColors?: [string, string, ...string[]];
  onPress?: () => void;
  elevated?: boolean;
}

/**
 * 3D Neo-Fintech Card with hardware-accelerated spring touch physics.
 * Gives butter-smooth tactile feedback and dimensional depth on Android with light pearl aesthetics.
 */
export const Card3D: React.FC<Card3DProps> = ({
  children,
  style,
  gradientColors = ['#FFFFFF', '#FFFFFF'],
  onPress,
  elevated = true,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Animated.spring(scaleAnim, {
        toValue: 0.98,
        tension: SPRING_CONFIG.touchDown.tension,
        friction: SPRING_CONFIG.touchDown.friction,
        useNativeDriver: true,
      }).start();
    }
  };

  const handlePressOut = () => {
    if (onPress) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: SPRING_CONFIG.touchUp.tension,
        friction: SPRING_CONFIG.touchUp.friction,
        useNativeDriver: true,
      }).start();
    }
  };

  const content = (
    <Animated.View
      style={[
        styles.outerContainer,
        elevated && styles.elevatedShadow,
        { transform: [{ scale: scaleAnim }] },
        style,
      ]}
    >
      {/* 3D Top Bevel Highlight */}
      <View style={styles.topBevel} />

      {/* Diagonal Sheen Gradient */}
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {children}
      </LinearGradient>

      {/* 3D Bottom Edge Shadow */}
      <View style={styles.bottomEdge} />
    </Animated.View>
  );

  if (onPress) {
    return (
      <TouchableWithoutFeedback
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {content}
      </TouchableWithoutFeedback>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  outerContainer: {
    borderRadius: 22,
    backgroundColor: THEME.bg.card,
    borderWidth: 1,
    borderColor: THEME.bg.border,
    overflow: 'hidden',
    position: 'relative',
  },
  elevatedShadow: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  topBevel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    zIndex: 2,
  },
  bottomEdge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(15, 23, 42, 0.04)',
    zIndex: 2,
  },
  gradient: {
    padding: 18,
    borderRadius: 22,
  },
});
