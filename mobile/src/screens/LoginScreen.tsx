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
} from 'react-native';
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
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/AuthContext';
import { TelepointLogo } from '../components/TelepointLogo';
import { MultiLoanCustomer } from '../types';
import { THEME } from '../config';

export const LoginScreen = () => {
  const { login, isLoading } = useAuth();
  const [authMode, setAuthMode] = useState<'mobile' | 'aadhaar'>('mobile');
  const [mobile, setMobile] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [error, setError] = useState<string | null>(null);

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
          setError('Please enter a valid 10-digit mobile number');
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
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Invalid credentials. Please verify and retry.';
      setError(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
        {/* Ambient Top Sapphire Halo */}
        <View style={styles.glowCircle} />

        {/* Telepoint Brand Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <TelepointLogo size={68} />
          </View>
          <Text style={styles.appName}>TELEPOINT</Text>
          <Text style={styles.appTagline}>Bank-Grade Secure EMI Portal</Text>

          <View style={styles.securityTag}>
            <Shield size={12} color="#60A5FA" />
            <Text style={styles.securityText}>256-BIT ENCRYPTED SESSION</Text>
          </View>
        </View>

        {/* Mode Switcher Pill */}
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleBtn, authMode === 'mobile' && styles.toggleBtnActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAuthMode('mobile');
              setError(null);
            }}
          >
            <Smartphone
              size={16}
              color={authMode === 'mobile' ? '#FFFFFF' : '#94A3B8'}
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
            style={[
              styles.toggleBtn,
              authMode === 'aadhaar' && styles.toggleBtnActive,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAuthMode('aadhaar');
              setError(null);
            }}
          >
            <CreditCard
              size={16}
              color={authMode === 'aadhaar' ? '#FFFFFF' : '#94A3B8'}
            />
            <Text
              style={[
                styles.toggleText,
                authMode === 'aadhaar' && styles.toggleTextActive,
              ]}
            >
              Aadhaar Card
            </Text>
          </TouchableOpacity>
        </View>

        {/* Glassmorphic Form Card */}
        <View style={styles.card}>
          <View style={styles.topBevel} />

          {authMode === 'mobile' ? (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>REGISTERED MOBILE NUMBER</Text>
              <View style={styles.inputWrapper}>
                <Text style={styles.prefix}>+91</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter 10-digit number"
                  placeholderTextColor="#64748B"
                  keyboardType="numeric"
                  maxLength={11}
                  value={formatMobileDisplay(mobile)}
                  onChangeText={handleMobileChange}
                  editable={!isLoading}
                />
              </View>
              <Text style={styles.helperText}>
                The mobile number registered during your smartphone financing
              </Text>
            </View>
          ) : (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>12-DIGIT AADHAAR NUMBER</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="0000 0000 0000"
                  placeholderTextColor="#64748B"
                  keyboardType="numeric"
                  maxLength={14}
                  value={formatAadhaarDisplay(aadhaar)}
                  onChangeText={handleAadhaarChange}
                  editable={!isLoading}
                />
              </View>
              <Text style={styles.helperText}>
                Your Aadhaar provided at the retailer store counter
              </Text>
            </View>
          )}

          {error && (
            <View style={styles.errorContainer}>
              <AlertCircle size={16} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Login Submit Button */}
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => handleLogin()}
            disabled={isLoading}
            style={styles.loginBtn}
          >
            <LinearGradient
              colors={['#2563EB', '#1D4ED8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.btnGradient}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <View style={styles.btnContent}>
                  <Text style={styles.btnText}>Access EMI Dashboard</Text>
                  <ChevronRight size={18} color="#FFFFFF" />
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Biometric Shield Prompt */}
          <View style={styles.biometricPrompt}>
            <Fingerprint size={16} color="#60A5FA" />
            <Text style={styles.biometricText}>
              Permanent login enabled • Protected until app data cleared
            </Text>
          </View>
        </View>

        {/* Footer Support Notice */}
        <View style={styles.footerNote}>
          <Sparkles size={14} color="#64748B" />
          <Text style={styles.footerText}>
            Facing issues? Contact your device financing retailer
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
            <Text style={styles.modalTitle}>Select Financed Device</Text>
            <Text style={styles.modalSubtitle}>
              We found multiple active loans associated with this profile.
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
                    <Smartphone size={20} color="#60A5FA" />
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
                      {loan.status || 'ACTIVE LOAN'}
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
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg.darkest,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 50,
    paddingBottom: 40,
    justifyContent: 'center',
  },
  glowCircle: {
    position: 'absolute',
    top: -50,
    alignSelf: 'center',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    marginBottom: 12,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 8,
  },
  appName: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 3,
  },
  appTagline: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  securityTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
  },
  securityText: {
    color: '#93C5FD',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#0E131F',
    borderRadius: 16,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  toggleBtnActive: {
    backgroundColor: '#2563EB',
  },
  toggleText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#0E131F',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
    overflow: 'hidden',
  },
  topBevel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131927',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 14,
  },
  prefix: {
    color: '#60A5FA',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    paddingVertical: 14,
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
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  loginBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  btnGradient: {
    paddingVertical: 16,
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
  biometricPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
  },
  biometricText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
  },
  footerNote: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 28,
  },
  footerText: {
    color: '#64748B',
    fontSize: 11,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0E131F',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  modalSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 18,
  },
  loanCard: {
    backgroundColor: '#131927',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  loanCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loanCardTextCol: {
    flex: 1,
  },
  loanDeviceModel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  loanImei: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  loanFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
  },
  loanStatusTag: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  loanRetailer: {
    color: '#94A3B8',
    fontSize: 11,
  },
  modalCancelBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  modalCancelText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '700',
  },
});
