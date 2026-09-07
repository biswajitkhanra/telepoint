// screens/LoginScreen.tsx
// IDFC clarity + Jupiter Neo bold: Welcome back, mobile/Aadhaar switcher, animated focus & continue button

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
  Modal,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Shield,
  Smartphone,
  CreditCard,
  ChevronRight,
  AlertCircle,
  Sparkles,
  Fingerprint,
  CheckCircle2,
  Users,
  X,
  Lock,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/AuthContext';
import { TelepointLogo } from '../components/TelepointLogo';
import { MultiLoanCustomer } from '../types';
import { Colors } from '../constants/colors';
import { Spacing, Radius, Shadow } from '../constants/design';

export const LoginScreen = () => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight || 28 : 0);
  const { login, isLoading, resetRolePreference, setRolePreference } = useAuth();
  const [authMode, setAuthMode] = useState<'mobile' | 'aadhaar'>('mobile');
  const [mobile, setMobile] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Multi-loan selection state
  const [multiLoans, setMultiLoans] = useState<MultiLoanCustomer[]>([]);
  const [showMultiModal, setShowMultiModal] = useState(false);

  // Format inputs with user-friendly spacing
  const handleMobileChange = (text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 10);
    setMobile(cleaned);
  };

  const handleAadhaarChange = (text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 12);
    setAadhaar(cleaned);
  };

  const formatMobileDisplay = (raw: string) => {
    if (raw.length > 5) {
      return `${raw.slice(0, 5)} ${raw.slice(5)}`;
    }
    return raw;
  };

  const formatAadhaarDisplay = (raw: string) => {
    const parts = [];
    for (let i = 0; i < raw.length; i += 4) {
      parts.push(raw.slice(i, i + 4));
    }
    return parts.join(' ');
  };

  const handleLogin = async (customerId?: string) => {
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (customerId) {
        await login({ customer_id: customerId });
        setShowMultiModal(false);
        return;
      }

      if (authMode === 'mobile') {
        const cleanMobile = mobile.replace(/\D/g, '');
        if (cleanMobile.length !== 10) {
          setError('Please enter a valid 10-digit registered mobile number');
          return;
        }
        const res = await login({ mobile: cleanMobile });
        if (res.multi && res.customers) {
          setMultiLoans(res.customers);
          setShowMultiModal(true);
        }
      } else {
        const cleanAadhaar = aadhaar.replace(/\D/g, '');
        if (cleanAadhaar.length !== 12) {
          setError('Please enter a valid 12-digit Aadhaar number');
          return;
        }
        const res = await login({ aadhaar: cleanAadhaar });
        if (res.multi && res.customers) {
          setMultiLoans(res.customers);
          setShowMultiModal(true);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Verification failed. Please check details or contact your retailer.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: topInset + 16 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Subtle decorative pastel ambient orbs */}
          <View style={styles.orbTopLeft} pointerEvents="none" />
          <View style={styles.orbBottomRight} pointerEvents="none" />

          {/* Top Switch to Staff Portal Pill */}
          <View style={styles.topSwitchRoleContainer}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                await setRolePreference('staff');
              }}
              style={styles.topRoleSwitchPill}
            >
              <Users size={12} color="#1A6FD6" />
              <Text style={styles.topRoleSwitchPillText}>Staff or Store Owner? Login here ➔</Text>
            </TouchableOpacity>
          </View>

          {/* Brand Header */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <TelepointLogo size={68} />
            </View>
            <Text style={styles.brandTitle}>TelePoint</Text>
            <Text style={styles.brandSubtitle}>Mobile EMI Payments</Text>
          </View>

          {/* Headline */}
          <View style={styles.headlineContainer}>
            <Text style={styles.headlineText}>Welcome back</Text>
            <Text style={styles.headlineSub}>
              Enter your registered mobile or Aadhaar number to view your EMI details
            </Text>
          </View>

          {/* Segment Toggle: Mobile | Aadhaar */}
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[styles.toggleBtn, authMode === 'mobile' && styles.toggleBtnActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setAuthMode('mobile');
                setError(null);
              }}
            >
              <Smartphone
                size={15}
                color={authMode === 'mobile' ? '#FFFFFF' : '#64748B'}
              />
              <Text
                style={[
                  styles.toggleText,
                  authMode === 'mobile' && styles.toggleTextActive,
                ]}
              >
                Mobile Number
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.toggleBtn, authMode === 'aadhaar' && styles.toggleBtnActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setAuthMode('aadhaar');
                setError(null);
              }}
            >
              <CreditCard
                size={15}
                color={authMode === 'aadhaar' ? '#FFFFFF' : '#64748B'}
              />
              <Text
                style={[
                  styles.toggleText,
                  authMode === 'aadhaar' && styles.toggleTextActive,
                ]}
              >
                Aadhaar Number
              </Text>
            </TouchableOpacity>
          </View>

          {/* Input Card */}
          <View style={styles.card}>
            {authMode === 'mobile' ? (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>REGISTERED MOBILE NUMBER</Text>
                <View
                  style={[
                    styles.inputWrapper,
                    isFocused && styles.inputWrapperFocused,
                  ]}
                >
                  <Text style={styles.prefix}>+91</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="98765 43210"
                    placeholderTextColor="#94A3B8"
                    keyboardType="phone-pad"
                    maxLength={11}
                    value={formatMobileDisplay(mobile)}
                    onChangeText={handleMobileChange}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    editable={!isLoading}
                  />
                </View>
                <Text style={styles.helperText}>
                  The phone number provided during financing at the store
                </Text>
              </View>
            ) : (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>12-DIGIT AADHAAR NUMBER</Text>
                <View
                  style={[
                    styles.inputWrapper,
                    isFocused && styles.inputWrapperFocused,
                  ]}
                >
                  <TextInput
                    style={styles.input}
                    placeholder="0000 0000 0000"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    maxLength={14}
                    value={formatAadhaarDisplay(aadhaar)}
                    onChangeText={handleAadhaarChange}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    editable={!isLoading}
                  />
                </View>
                <Text style={styles.helperText}>
                  Your Aadhaar card number submitted at the retailer counter
                </Text>
              </View>
            )}

            {error && (
              <View style={styles.errorContainer}>
                <AlertCircle size={16} color="#DC2626" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Submit Button */}
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => handleLogin()}
              disabled={isLoading}
              style={styles.continueBtn}
            >
              <LinearGradient
                colors={[Colors.primary, Colors.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.btnGradient}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <View style={styles.btnContent}>
                    <Text style={styles.btnText}>Access Dashboard</Text>
                    <ChevronRight size={18} color="#FFFFFF" />
                  </View>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.sessionLockRow}>
              <Fingerprint size={15} color="#1A6FD6" />
              <Text style={styles.sessionLockText}>
                Persistent device lockdown • Kept signed in safely
              </Text>
            </View>
          </View>

          {/* Mode Switcher Option (For Staff / Admins) */}
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.switchStaffBtn}
            onPress={async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              await setRolePreference('staff');
            }}
          >
            <Users size={15} color="#1A6FD6" />
            <Text style={styles.switchStaffText}>
              Are you a Store Retailer or Super Admin? Open Staff Login →
            </Text>
          </TouchableOpacity>

          {/* Footer note with fixed central helpline */}
          <View style={styles.footerNote}>
            <Sparkles size={13} color="#64748B" />
            <Text style={styles.footerText}>
              Need assistance? Central Helpline: +91 70036 17029
            </Text>
          </View>
        </ScrollView>

        {/* Multi-Loan Selection Modal */}
        <Modal
          visible={showMultiModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowMultiModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Financed Device</Text>
                <TouchableOpacity onPress={() => setShowMultiModal(false)}>
                  <X size={20} color="#64748B" />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalSubtitle}>
                We found multiple smartphone finance accounts linked to your profile.
              </Text>

              <ScrollView style={{ maxHeight: 350 }}>
                {multiLoans.map(loan => (
                  <TouchableOpacity
                    key={loan.id}
                    style={styles.loanCard}
                    activeOpacity={0.8}
                    onPress={() => handleLogin(loan.id)}
                  >
                    <View style={styles.loanCardHeader}>
                      <Smartphone size={18} color="#1A6FD6" />
                      <View style={styles.loanCardTextCol}>
                        <Text style={styles.loanDeviceModel}>
                          {loan.model_no || 'Financed Smartphone'}
                        </Text>
                        <Text style={styles.loanImei}>IMEI: {loan.imei}</Text>
                      </View>
                      <ChevronRight size={18} color="#94A3B8" />
                    </View>
                    <View style={styles.loanFooter}>
                      <Text style={styles.loanStatusTag}>
                        {(loan.status || 'ACTIVE LOAN').toUpperCase()}
                      </Text>
                      <Text style={styles.loanRetailer}>
                        {typeof loan.retailer === 'object' && loan.retailer && 'name' in loan.retailer
                          ? String((loan.retailer as any).name)
                          : 'Retailer Partner'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowMultiModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F8FF', // Light IDFC blue-white canvas
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 30,
    paddingBottom: 40,
    justifyContent: 'center',
  },
  orbTopLeft: {
    position: 'absolute',
    top: -40,
    left: -40,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#DBEAFE',
    opacity: 0.6,
  },
  orbBottomRight: {
    position: 'absolute',
    bottom: -40,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#EEF2FF',
    opacity: 0.6,
  },
  topSwitchRoleContainer: {
    alignItems: 'center',
    marginBottom: 14,
  },
  topRoleSwitchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF5FF',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(26, 111, 214, 0.25)',
  },
  topRoleSwitchPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A6FD6',
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoContainer: {
    marginBottom: 10,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 1.5,
  },
  brandSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  securityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EFF5FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(26, 111, 214, 0.2)',
  },
  securityPillText: {
    color: '#1A6FD6',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  headlineContainer: {
    marginBottom: 16,
  },
  headlineText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  headlineSub: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 18,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#F0F4FF',
    borderRadius: Radius.lg,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  toggleBtnActive: {
    backgroundColor: '#1A6FD6',
    elevation: 2,
    shadowColor: '#1A6FD6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  toggleText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 4,
    shadowColor: '#1A6FD6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
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
  },
  inputWrapperFocused: {
    borderColor: '#1A6FD6',
    backgroundColor: '#FFFFFF',
  },
  prefix: {
    color: '#1A6FD6',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
    paddingVertical: 12,
    letterSpacing: 0.5,
  },
  helperText: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 6,
  },
  errorContainer: {
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
  continueBtn: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#1A6FD6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
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
  sessionLockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  sessionLockText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  switchStaffBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 14,
    borderRadius: Radius.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(26, 111, 214, 0.2)',
  },
  switchStaffText: {
    color: '#1A6FD6',
    fontSize: 12,
    fontWeight: '700',
  },
  footerNote: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
  },
  footerText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    padding: Spacing.xl,
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 14,
  },
  loanCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  loanCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  loanCardTextCol: {
    flex: 1,
  },
  loanDeviceModel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  loanImei: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  loanFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 6,
  },
  loanStatusTag: {
    fontSize: 9,
    fontWeight: '800',
    color: '#059669',
  },
  loanRetailer: {
    fontSize: 11,
    color: '#64748B',
  },
  modalCancelBtn: {
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    marginTop: 8,
  },
  modalCancelText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '700',
  },
});
