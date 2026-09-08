// mobile/src/components/admin/LeaderboardPodium.tsx
// High-energy fintech leaderboard with podium ranks and direct store communication

import React from 'react';
import { View, Text, StyleSheet, Linking, Alert } from 'react-native';
import { Trophy, Crown, PhoneCall, MessageCircle } from 'lucide-react-native';
import { JellyCard } from '../JellyCard';
import { PressableScale } from '../PressableScale';
import { Haptics } from '../../utils/haptics';
import { Radius, Spacing } from '../../constants/design';

interface LeaderboardItem {
  retailerId: string;
  name: string;
  value: number;
  mobile?: string;
}

interface LeaderboardPodiumProps {
  title: string;
  subtitle: string;
  items: LeaderboardItem[];
  valuePrefix?: string;
  valueSuffix?: string;
  accentColor?: string;
}

export const LeaderboardPodium: React.FC<LeaderboardPodiumProps> = ({
  title,
  subtitle,
  items,
  valuePrefix = '',
  valueSuffix = '',
  accentColor = '#F59E0B',
}) => {
  if (!items || items.length === 0) return null;

  const handleCall = (mobile?: string, name?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!mobile) {
      Alert.alert('No Mobile Number', `No phone registered for ${name || 'store'}.`);
      return;
    }
    const clean = mobile.replace(/\D/g, '').slice(-10);
    Linking.openURL(`tel:${clean}`).catch(() => {
      Alert.alert('Call Failed', 'Unable to initiate call.');
    });
  };

  const handleWhatsApp = (mobile?: string, name?: string, val?: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!mobile) {
      Alert.alert('No Mobile Number', `No phone registered for ${name || 'store'}.`);
      return;
    }
    const clean = mobile.replace(/\D/g, '').slice(-10);
    const msg = encodeURIComponent(
      `Congratulations ${name || 'Partner Store'}! You are currently among the top leaders on Telepoint with ${valuePrefix}${Math.round(val || 0).toLocaleString('en-IN')}${valueSuffix}. Keep up the stellar performance!`
    );
    const waUrl = `whatsapp://send?phone=91${clean}&text=${msg}`;
    const webUrl = `https://wa.me/91${clean}?text=${msg}`;
    Linking.canOpenURL(waUrl)
      .then(sup => (sup ? Linking.openURL(waUrl) : Linking.openURL(webUrl)))
      .catch(() => Linking.openURL(webUrl));
  };

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <JellyCard accentColor={accentColor} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Trophy size={18} color="#D97706" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>

      <View style={styles.list}>
        {items.slice(0, 5).map((item, idx) => {
          const isTop3 = idx < 3;
          return (
            <View
              key={item.retailerId || `${idx}-${item.name}`}
              style={[styles.row, isTop3 && styles.topRow]}
            >
              <View style={styles.rankCol}>
                {isTop3 ? (
                  <Text style={styles.medalText}>{medals[idx]}</Text>
                ) : (
                  <Text style={styles.rankNum}>#{idx + 1}</Text>
                )}
              </View>

              <View style={styles.infoCol}>
                <Text style={[styles.nameText, isTop3 && styles.topNameText]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.valueText}>
                  {valuePrefix}
                  {Math.round(item.value).toLocaleString('en-IN')}
                  {valueSuffix}
                </Text>
              </View>

              {item.mobile ? (
                <View style={styles.actionsCol}>
                  <PressableScale
                    onPress={() => handleCall(item.mobile, item.name)}
                    style={styles.callBtn}
                    scaleTo={0.88}
                  >
                    <PhoneCall size={12} color="#1A6FD6" />
                  </PressableScale>
                  <PressableScale
                    onPress={() => handleWhatsApp(item.mobile, item.name, item.value)}
                    style={styles.waBtn}
                    scaleTo={0.88}
                  >
                    <MessageCircle size={12} color="#059669" />
                  </PressableScale>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </JellyCard>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: Radius.lg,
    backgroundColor: '#FFFFFF',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  list: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  topRow: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rankCol: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalText: {
    fontSize: 18,
  },
  rankNum: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  infoCol: {
    flex: 1,
    paddingHorizontal: 8,
  },
  nameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  topNameText: {
    color: '#0F172A',
    fontWeight: '800',
  },
  valueText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#D97706',
    marginTop: 2,
  },
  actionsCol: {
    flexDirection: 'row',
    gap: 6,
  },
  callBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  waBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
