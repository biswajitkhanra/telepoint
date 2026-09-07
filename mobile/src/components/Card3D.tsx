import React from 'react';
import { View, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { THEME } from '../config';

interface Card3DProps {
  children: React.ReactNode;
  style?: ViewStyle;
  gradientColors?: [string, string, ...string[]];
  onPress?: () => void;
  elevated?: boolean;
}

export const Card3D: React.FC<Card3DProps> = ({
  children,
  style,
  gradientColors = ['#131D33', '#0B1120'],
  onPress,
  elevated = true,
}) => {
  const handlePress = () => {
    if (onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  const content = (
    <View style={[styles.outerContainer, elevated && styles.elevatedShadow, style]}>
      {/* 3D Top Bevel Highlight */}
      <View style={styles.topBevel} />
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
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.88} onPress={handlePress}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  outerContainer: {
    borderRadius: 20,
    backgroundColor: THEME.bg.card,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
    overflow: 'hidden',
    position: 'relative',
  },
  elevatedShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  topBevel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    zIndex: 2,
  },
  bottomEdge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    zIndex: 2,
  },
  gradient: {
    padding: 18,
    borderRadius: 20,
  },
});
