// components/BottomTabBar.tsx
// Custom animated bottom tab bar with spring sliding indicator & tactile haptics

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Haptics } from '../utils/haptics';
import {
  LayoutDashboard,
  CalendarDays,
  History,
  User,
} from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { Radius, Spacing, Shadow } from '../constants/design';

import { useWindowDimensions } from 'react-native';

export const BottomTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const { width: windowWidth } = useWindowDimensions();
  const containerWidth = Math.min(windowWidth, 520);
  const totalTabs = state.routes.length;
  const tabWidth = Math.max(0, (containerWidth - Spacing.lg * 2) / totalTabs);
  const translateX = useRef(new Animated.Value(state.index * tabWidth)).current;

  useEffect(() => {
    Animated.spring(translateX, {
      toValue: state.index * tabWidth,
      tension: 320,
      friction: 26,
      useNativeDriver: true,
    }).start();
  }, [state.index, tabWidth]);

  return (
    <View style={styles.tabBarWrapper}>
      <View style={styles.tabBarContainer}>
        {/* Animated Sliding Active Indicator Pill */}
        <Animated.View
          style={[
            styles.activeIndicatorPill,
            {
              width: tabWidth - 12,
              transform: [{ translateX }],
            },
          ]}
        />

        {/* Tab Buttons */}
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const onPress = () => {
            Haptics.selectionAsync();

            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const label =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
              ? options.title
              : route.name;

          const getIcon = (color: string) => {
            const size = 20;
            switch (route.name) {
              case 'Dashboard':
                return <LayoutDashboard size={size} color={color} />;
              case 'EmiSchedule':
                return <CalendarDays size={size} color={color} />;
              case 'History':
                return <History size={size} color={color} />;
              case 'Profile':
                return <User size={size} color={color} />;
              default:
                return <LayoutDashboard size={size} color={color} />;
            }
          };

          const iconColor = isFocused ? Colors.primary : Colors.textSecondary;

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarTestID}
              onPress={onPress}
              style={[styles.tabButton, { width: tabWidth }]}
              activeOpacity={0.8}
            >
              <View style={styles.tabContent}>
                {getIcon(iconColor)}
                <Text
                  style={[
                    styles.tabLabel,
                    { color: iconColor },
                    isFocused && styles.tabLabelFocused,
                  ]}
                >
                  {String(label)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  tabBarWrapper: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    paddingTop: 8,
    paddingHorizontal: Spacing.lg,
    elevation: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
  },
  tabBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    position: 'relative',
  },
  activeIndicatorPill: {
    position: 'absolute',
    left: 6,
    height: 46,
    borderRadius: Radius.xl,
    backgroundColor: '#EFF5FF',
    borderWidth: 1,
    borderColor: 'rgba(26, 111, 214, 0.15)',
  },
  tabButton: {
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  tabLabelFocused: {
    fontWeight: '800',
  },
});
