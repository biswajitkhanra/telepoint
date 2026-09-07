import React, { useRef } from 'react';
import {
  Animated,
  TouchableWithoutFeedback,
  StyleSheet,
  ViewStyle,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
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
 * Gives butter-smooth tactile feedback and dimensional depth on Android.
 */
export const Card3D: React.FC<Card3DProps> = ({
  children,
  style,
  gradientColors = ['#131927', '#0E131F'],
  onPress,
  elevated = true,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Animated.spring(scaleAnim, {
        toValue: 0.97,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 8,
  },
  topBevel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    zIndex: 2,
  },
  bottomEdge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 2,
  },
  gradient: {
    padding: 18,
    borderRadius: 22,
  },
});
