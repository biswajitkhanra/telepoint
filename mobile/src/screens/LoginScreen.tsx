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
import { Shield, Smartphone, CreditCard, ChevronRight, AlertCircle, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/AuthContext';
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
      const msg = err instanceof Error ? err.message : 'Invalid credentials. Please verify and retry.';
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
        {/* Ambient Top Glow */}
        <View style={styles.glowCircle} />

        {/* Brand Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={['#3B82F6', '#1D4ED8']}
              style={styles.logoGradient}
            >
              <Shield size={34} color="#FFFFFF" />
            </LinearGradient>
          </View>
          <Text style={styles.appName}>TELEPOINT</Text>
          <View style={styles.securityTag}>
            <Sparkles size={12} color="#60A5FA" />
            <Text style={styles.securityText}>BANK-GRADE EMI PORTAL</Text>
          </View>
        </View>

        {/* Auth Mode Toggle */}
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              setAuthMode('mobile');
              setError(null);
            }}
            style={[styles.toggleBtn, authMode === 'mobile' && styles.toggleBtnActive]}
          >
            <Smartphone size={16} color={authMode === 'mobile' ? '#FFFFFF' : '#94A3B8'} />
            <Text style={[styles.toggleText, authMode === 'mobile' && styles.toggleTextActive]}>
              Mobile Number
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              setAuthMode('aadhaar');
              setError(null);
            }}
            style={[styles.toggleBtn, authMode === 'aadhaar' && styles.toggleBtnActive]}
          >
            <CreditCard size={16} color={authMode === 'aadhaar' ? '#FFFFFF' : '#94A3B8'} />
            <Text style={[styles.toggleText, authMode === 'aadhaar' && styles.toggleTextActive]}>
              Aadhaar Card
            </Text>
          </TouchableOpacity>
        </View>

        {/* Input Card */}
        <View style={styles.card}>
          <View style={styles.topBevel} />

          {authMode === 'mobile' ? (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>REGISTERED MOBILE NUMBER</Text>
              <View style={styles.inputWrapper}>
                <Text style={styles.prefixText}>+91</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter 10-digit mobile"
                  placeholderTextColor="#64748B"
                  keyboardType="numeric"
                  maxLength={10}
                  value={mobile}
                  onChangeText={setMobile}
                />
              </View>
            </View>
          ) : (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>AADHAAR NUMBER</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter 12-digit Aadhaar number"
                  placeholderTextColor="#64748B"
                  keyboardType="numeric"
                  maxLength={12}
                  value={aadhaar}
                  onChangeText={setAadhaar}
                />
              </View>
            </View>
          )}

          {error && (
            <View style={styles.errorBox}>
              <AlertCircle size={15} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Submit Button */}
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
              style={styles.loginGradient}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.loginBtnText}>Access My Account</Text>
                  <ChevronRight size={18} color="#FFFFFF" />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.footerNote}>
            🔒 End-to-end encrypted · Official customer device portal
          </Text>
        </View>

        {/* Multi-Loan Selection Modal */}
        <Modal visible={showMultiModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.multiCard}>
              <Text style={styles.multiTitle}>Select Your Loan Account</Text>
              <Text style={styles.multiSubtitle}>
                Multiple devices were found linked to your credentials. Select the loan you wish to view:
              </Text>

              <ScrollView style={styles.multiList}>
                {multiLoans.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.loanItem}
                    onPress={() => handleLogin(item.id)}
                  >
                    <View>
                      <Text style={styles.loanModel}>{item.model_no || 'Smartphone'}</Text>
                      <Text style={styles.loanImei}>IMEI: {item.imei}</Text>
                      <Text style={styles.loanStatus}>Status: {item.status}</Text>
                    </View>
                    <ChevronRight size={20} color="#60A5FA" />
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowMultiModal(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
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
    paddingTop: 60,
    paddingBottom: 40,
    justifyContent: 'center',
  },
  glowCircle: {
    position: 'absolute',
    top: -50,
    alignSelf: 'center',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logoContainer: {
    marginBottom: 14,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 8,
  },
  logoGradient: {
    width: 68,
    height: 68,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  appName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  securityTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
  },
  securityText: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
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
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 14,
  },
  prefixText: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 52,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  loginBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 6,
  },
  loginGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  footerNote: {
    color: '#64748B',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 20,
  },
  multiCard: {
    backgroundColor: '#0F172A',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    maxHeight: '75%',
  },
  multiTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  multiSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  multiList: {
    marginBottom: 16,
  },
  loanItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  loanModel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  loanImei: {
    color: '#94A3B8',
    fontSize: 12,
  },
  loanStatus: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontWeight: '600',
  },
});
