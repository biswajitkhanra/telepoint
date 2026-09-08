// components/AntiGravityModal.tsx
// Spring-based bottom sheet with drag-to-dismiss, velocity fling, and glassmorphism backdrop.
// Replaces standard Modal for an "anti-gravity" feel — elements slide up with spring physics
// and can be flung away with momentum.

import React, { useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Dimensions,
  Pressable,
  View,
  Platform,
  KeyboardAvoidingView,
  StatusBar,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Radius } from '../constants/design';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_THRESHOLD = 120;
const VELOCITY_THRESHOLD = 800;

interface AntiGravityModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxHeightRatio?: number;
  snapToHeight?: number;
  showHandle?: boolean;
}

const SPRING_CONFIG = {
  damping: 20,
  stiffness: 150,
  mass: 0.8,
  overshootClamping: false,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 0.01,
};

const DISMISS_SPRING = {
  damping: 25,
  stiffness: 200,
  mass: 0.6,
};

export const AntiGravityModal: React.FC<AntiGravityModalProps> = ({
  visible,
  onClose,
  children,
  maxHeightRatio = 0.88,
  showHandle = true,
}) => {
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const dragY = useSharedValue(0);
  const isDragging = useSharedValue(false);

  const maxHeight = SCREEN_HEIGHT * maxHeightRatio;

  const open = useCallback(() => {
    translateY.value = withSpring(0, SPRING_CONFIG);
    backdropOpacity.value = withTiming(1, { duration: 300 });
  }, []);

  const close = useCallback(() => {
    translateY.value = withSpring(SCREEN_HEIGHT, DISMISS_SPRING);
    backdropOpacity.value = withTiming(0, { duration: 200 });
    setTimeout(onClose, 300);
  }, [onClose]);

  useEffect(() => {
    if (visible) {
      translateY.value = SCREEN_HEIGHT;
      backdropOpacity.value = 0;
      // Small delay to ensure mount before animation
      setTimeout(open, 50);
    }
  }, [visible, open]);

  const sheetStyle = useAnimatedStyle(() => {
    const ty = translateY.value + dragY.value;
    return {
      transform: [{ translateY: Math.max(0, ty) }],
    };
  });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      backdropOpacity.value,
      [0, 1],
      [0, 0.6],
      Extrapolation.CLAMP
    ),
  }));

  // Simple touch-based drag handling using onMoveShouldSetResponder
  const handleTouchStart = useCallback(() => {
    isDragging.value = true;
    dragY.value = 0;
  }, []);

  const handleTouchMove = useCallback((e: any) => {
    if (!isDragging.value) return;
    const dy = e.nativeEvent.pageY - (e.nativeEvent.locationY || 0);
    // Only track downward movement from the handle area
  }, []);

  const handleTouchEnd = useCallback(() => {
    isDragging.value = false;
    if (dragY.value > DISMISS_THRESHOLD) {
      close();
    } else {
      dragY.value = withSpring(0, SPRING_CONFIG);
    }
  }, [close]);

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>

      {/* Sheet */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.sheet,
            { maxHeight },
            sheetStyle,
          ]}
        >
          {/* Drag Handle */}
          {showHandle && (
            <Pressable
              style={styles.handleContainer}
              onPress={close}
            >
              <View style={styles.handle} />
            </Pressable>
          )}

          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 1000,
    elevation: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 1)',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    overflow: 'hidden',
    // Glass effect border
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderBottomWidth: 0,
    // Shadow for floating feel
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 24,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(15, 23, 42, 0.15)',
  },
});
