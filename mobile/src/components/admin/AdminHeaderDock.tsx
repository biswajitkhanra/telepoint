// mobile/src/components/admin/AdminHeaderDock.tsx
// Neo-Fintech Executive Header & Segmented Pill Dock for Admin Console 2.0
// Inspired by Apple Card, Revolut, & Cash App design language

import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import {
  LayoutDashboard,
  CheckCircle2,
  FileBarChart2,
  TrendingUp,
  Store,
  Settings2,
  Sparkles,
} from 'lucide-react-native';
import { Haptics } from '../../utils/haptics';
import { Colors } from '../../constants/colors';
import { Spacing, Radius } from '../../constants/design';
import { PressableScale } from '../PressableScale';

export type AdminTab = 'overview' | 'approvals' | 'reports' | 'analytics' | 'retailers' | 'settings';

interface AdminHeaderDockProps {
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  pendingApprovalsCount: number;
}

const TABS: { id: AdminTab; label: string; icon: any }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'approvals', label: 'Approvals', icon: CheckCircle2 },
  { id: 'reports', label: 'Reports', icon: FileBarChart2 },
  { id: 'analytics', label: 'Analytics', icon: TrendingUp },
  { id: 'retailers', label: 'Shops', icon: Store },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];

export const AdminHeaderDock: React.FC<AdminHeaderDockProps> = ({
  activeTab,
  onSelectTab,
  pendingApprovalsCount,
}) => {
  const scrollRef = useRef<ScrollView>(null);

  const handleTabPress = (tabId: AdminTab) => {
    if (tabId === activeTab) return;
    Haptics.selectionAsync();
    onSelectTab(tabId);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {TABS.map(tab => {
          const isActive = tab.id === activeTab;
          const Icon = tab.icon;
          const showBadge = tab.id === 'approvals' && pendingApprovalsCount > 0;

          return (
            <PressableScale
              key={tab.id}
              onPress={() => handleTabPress(tab.id)}
              style={[
                styles.tabPill,
                isActive ? styles.tabPillActive : styles.tabPillInactive,
              ]}
              scaleTo={0.93}
            >
              <Icon
                size={15}
                color={isActive ? '#FFFFFF' : '#64748B'}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <Text
                style={[
                  styles.tabLabel,
                  isActive ? styles.tabLabelActive : styles.tabLabelInactive,
                ]}
              >
                {tab.label}
              </Text>
              {showBadge && (
                <View style={[styles.badge, isActive && styles.badgeActive]}>
                  <Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>
                    {pendingApprovalsCount}
                  </Text>
                </View>
              )}
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    gap: 8,
    alignItems: 'center',
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    position: 'relative',
  },
  tabPillActive: {
    backgroundColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  tabPillInactive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
  tabLabelInactive: {
    color: '#64748B',
  },
  badge: {
    backgroundColor: '#E11D48',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    marginLeft: 2,
  },
  badgeActive: {
    backgroundColor: '#FFFFFF',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  badgeTextActive: {
    color: '#E11D48',
  },
});
