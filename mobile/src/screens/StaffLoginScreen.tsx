// screens/StaffLoginScreen.tsx
// Dedicated Production Staff Authentication Screen (Admin vs Retailer Dual Tabs)
// IDFC Trust + Jupiter Neo Delight: Distinct Role Security, Squash-and-Stretch Touch Physics,
// Specular Sheen & Zero-Friction Navigation back to Customer Login

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  Shield,
  Store,
  Lock,
  Eye,
  EyeOff,
  ChevronRight,
  ArrowLeft,
  Smartphone,
  Sparkles,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { TelepointLogo } from '../components/TelepointLogo';
import { PressableScale } from '../components/PressableScale';
import { Colors } from '../constants/colors';
import { Spacing, Radius } from '../constants/design';

type StaffTab = 'admin' | 'retailer';

export const StaffLoginScreen = () => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight || 28 : 0);
  const { loginStaff, setRolePreference, resetRolePreference } = useAuth();

  const [activeTab, setActiveTab] = useState<StaffTab>('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTabChange = (tab: StaffTab) => {
    Haptics.selectionAsync();
    setActiveTab(tab);
    setError(null);
    setUsername('');
    setPassword('');
  };

  const handleBackToCustomer = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await setRolePreference('customer');
  };

  const handleLogin = async () => {
    if (!username.trim()) {
      setError(`Please enter your ${activeTab === 'admin' ? 'admin' : 'retailer'} username`);
      return;
    }
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setError(null);
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await loginStaff(activeTab, username.trim(), password);
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = activeTab === 'admin';
  const themeAccent = isAdmin ? '#2563EB' : '#059669';
  const gradientColors: [string, string] = isAdmin
    ? ['#2563EB', '#1D4ED8']
    : ['#059669', '#047857'];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: topInset + 12 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Top Quick Back to Customer Bar */}
          <View style={styles.topBar}>
            <PressableScale
              onPress={handleBackToCustomer}
              style={styles.backToCustomerBtn}
              scaleTo={0.92}
            >
              <ArrowLeft size={15} color="#2563EB" />
              <Text style={styles.backToCustomerText}>← Back to Customer Login</Text>
            </PressableScale>

            <View style={styles.secureTag}>
              <Lock size={12} color="#64748B" />
              <Text style={styles.secureTagText}>STAFF ACCESS</Text>
            </View>
          </View>

          {/* Brand & Emblem Header */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <TelepointLogo size={62} />
            </View>
            <Text style={styles.brandTitle}>TELEPOINT STAFF</Text>
            <Text style={styles.brandSubtitle}>Management & Partner Operations Console</Text>
          </View>

          {/* Dual Tab Switcher: Admin vs Retailer */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => handleTabChange('admin')}
              style={[styles.tabBtn, isAdmin && styles.tabBtnActiveAdmin]}
            >
              <Shield size={16} color={isAdmin ? '#FFFFFF' : '#64748B'} />
              <Text style={[styles.tabText, isAdmin && styles.tabTextActive]}>
                Admin Login
              </Text>
              {isAdmin && <View style={styles.activeDotAdmin} />}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => handleTabChange('retailer')}
              style={[styles.tabBtn, !isAdmin && styles.tabBtnActiveRetailer]}
            >
              <Store size={16} color={!isAdmin ? '#FFFFFF' : '#64748B'} />
              <Text style={[styles.tabText, !isAdmin && styles.tabTextActive]}>
                Retailer Login
              </Text>
              {!isAdmin && <View style={styles.activeDotRetailer} />}
            </TouchableOpacity>
          </View>

          {/* Role Information Card */}
          <View style={[styles.roleInfoCard, { borderColor: `${themeAccent}33` }]}>
            <View style={[styles.roleIconCircle, { backgroundColor: `${themeAccent}14` }]}>
              {isAdmin ? (
                <Shield size={22} color="#2563EB" />
              ) : (
                <Store size={22} color="#059669" />
              )}
            </View>
            <View style={styles.roleTextCol}>
              <View style={styles.roleTitleRow}>
                <Text style={styles.roleTitle}>
                  {isAdmin ? 'Super Admin Portal' : 'Retailer Store Counter'}
                </Text>
                <View
                  style={[
                    styles.roleBadgePill,
                    { backgroundColor: isAdmin ? '#EFF6FF' : '#ECFDF5' },
                  ]}
                >
                  <Text
                    style={[
                      styles.roleBadgeText,
                      { color: isAdmin ? '#1D4ED8' : '#047857' },
                    ]}
                  >
                    {isAdmin ? 'CENTRAL' : 'STORE'}
                  </Text>
                </View>
              </View>
              <Text style={styles.roleDesc}>
                {isAdmin
                  ? 'Access customer files, approve payments, manage retailer stores & analytics.'
                  : 'Track store smartphone financing, collections, upcoming EMIs & payment requests.'}
              </Text>
            </View>
          </View>

          {/* Credentials Input Card */}
          <View style={styles.card}>
            {/* Username Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                {isAdmin ? 'ADMIN USERNAME' : 'RETAILER STORE USERNAME'}
              </Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder={isAdmin ? 'e.g. telepoint or admin username' : 'e.g. your store username'}
                  placeholderTextColor="#94A3B8"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
              </View>
            </View>

            {/* Password Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>PASSWORD</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[styles.input, { paddingRight: 40 }]}
                  placeholder="••••••••••••"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(prev => !prev)}
                  style={styles.eyeBtn}
                  activeOpacity={0.7}
                >
                  {showPassword ? (
                    <EyeOff size={18} color="#64748B" />
                  ) : (
                    <Eye size={18} color="#64748B" />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Error Banner */}
            {error && (
              <View style={styles.errorBox}>
                <AlertCircle size={16} color="#DC2626" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Submit Button */}
            <PressableScale
              onPress={handleLogin}
              disabled={loading}
              style={styles.submitBtn}
              scaleTo={0.94}
            >
              <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.btnGradient}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <View style={styles.btnContent}>
                    <Text style={styles.btnText}>
                      Sign In as {isAdmin ? 'Admin' : 'Retailer'}
                    </Text>
                    <ChevronRight size={18} color="#FFFFFF" />
                  </View>
                )}
              </LinearGradient>
            </PressableScale>
          </View>

          {/* Switch Back to Customer Mode Footer Card */}
          <PressableScale
            onPress={handleBackToCustomer}
            style={styles.customerSwitchCard}
            scaleTo={0.95}
          >
            <Smartphone size={18} color="#2563EB" />
            <View style={styles.customerSwitchTextCol}>
              <Text style={styles.customerSwitchTitle}>Looking for your financed phone?</Text>
              <Text style={styles.customerSwitchSub}>
                Borrowers & customers tap here to view EMI schedule & pay
              </Text>
            </View>
            <ChevronRight size={16} color="#94A3B8" />
          </PressableScale>

          <View style={styles.footerNote}>
            <Sparkles size={12} color="#64748B" />
            <Text style={styles.footerNoteText}>
              Telepoint Production • Bank-Grade 256-Bit SSL Secured
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingBottom: 40,
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backToCustomerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#EFF6FF',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
  },
  backToCustomerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  secureTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  secureTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoContainer: {
    marginBottom: 10,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 1.2,
  },
  brandSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: Radius.lg,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  tabBtnActiveAdmin: {
    backgroundColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  tabBtnActiveRetailer: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  activeDotAdmin: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#93C5FD',
  },
  activeDotRetailer: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#A7F3D0',
  },
  roleInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1.5,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  roleIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleTextCol: {
    flex: 1,
  },
  roleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  roleTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  roleBadgePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  roleDesc: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 3,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    position: 'relative',
  },
  input: {
    flex: 1,
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 12,
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    padding: 6,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    padding: 10,
    borderRadius: Radius.md,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  submitBtn: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    marginTop: 4,
  },
  btnGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  customerSwitchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
  },
  customerSwitchTextCol: {
    flex: 1,
  },
  customerSwitchTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  customerSwitchSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
  },
  footerNoteText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
});
