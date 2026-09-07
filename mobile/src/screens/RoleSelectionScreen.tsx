import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  Smartphone,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  Lock,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { TelepointLogo } from '../components/TelepointLogo';
import { THEME } from '../config';

export const RoleSelectionScreen = () => {
  const { setRolePreference } = useAuth();

  const handleSelectRole = (role: 'customer' | 'staff') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRolePreference(role);
  };

  const RoleCard = ({
    title,
    subtitle,
    tag,
    icon,
    accentColor,
    tagBg,
    tagColor,
    onPress,
  }: {
    title: string;
    subtitle: string;
    tag: string;
    icon: React.ReactNode;
    accentColor: string;
    tagBg: string;
    tagColor: string;
    onPress: () => void;
  }) => {
    return (
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={onPress}
        style={styles.cardWrapper}
      >
        <View style={styles.cardContainer}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconBox, { backgroundColor: `${accentColor}14` }]}>
              {icon}
            </View>
            <View style={[styles.tagPill, { backgroundColor: tagBg }]}>
              <Text style={[styles.tagText, { color: tagColor }]}>{tag}</Text>
            </View>
          </View>

          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSubtitle}>{subtitle}</Text>

          <View style={styles.cardActionRow}>
            <Text style={[styles.cardActionText, { color: accentColor }]}>
              Continue as {title}
            </Text>
            <ChevronRight size={18} color={accentColor} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <TelepointLogo size={68} />
          </View>
          <Text style={styles.appName}>TELEPOINT</Text>
          <Text style={styles.appTagline}>Bank-Grade Secure EMI Platform</Text>
        </View>

        {/* Onboarding Heading */}
        <View style={styles.introBox}>
          <Text style={styles.introTitle}>Who is using this phone?</Text>
          <Text style={styles.introSubtitle}>
            Select your account type to customize your experience. This will be
            remembered for this phone.
          </Text>
        </View>

        {/* Role Cards */}
        <View style={styles.cardsContainer}>
          <RoleCard
            title="Customer / Borrower"
            tag="SMARTPHONE EMI"
            subtitle="Track your financed phone installment schedules, upcoming dues, pay directly via UPI, and download payment receipts."
            icon={<Smartphone size={28} color="#2563EB" />}
            accentColor="#2563EB"
            tagBg="rgba(37, 99, 235, 0.1)"
            tagColor="#1D4ED8"
            onPress={() => handleSelectRole('customer')}
          />

          <RoleCard
            title="Retailer or Admin"
            tag="STORE / MANAGEMENT"
            subtitle="Manage store phone loans, verify customer payments, view live collection reports, borrower ledgers, and platform analytics."
            icon={<ShieldCheck size={28} color="#059669" />}
            accentColor="#059669"
            tagBg="rgba(16, 185, 129, 0.12)"
            tagColor="#047857"
            onPress={() => handleSelectRole('staff')}
          />
        </View>

        {/* Security & Memory Guarantee Note */}
        <View style={styles.guaranteeBox}>
          <Lock size={14} color="#64748B" />
          <Text style={styles.guaranteeText}>
            Your role preference is saved securely on this device. You can easily switch accounts or roles later in settings.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC', // Pure Light Pearl Canvas
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 54,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoContainer: {
    marginBottom: 12,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 6,
  },
  appName: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 2.5,
  },
  appTagline: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '500',
  },
  introBox: {
    marginBottom: 24,
  },
  introTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  introSubtitle: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
  },
  cardsContainer: {
    gap: 16,
  },
  cardWrapper: {
    borderRadius: 22,
  },
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 19,
    marginBottom: 16,
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15, 23, 42, 0.05)',
  },
  cardActionText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  guaranteeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 28,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  guaranteeText: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    maxWidth: 290,
  },
});
