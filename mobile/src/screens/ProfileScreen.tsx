// screens/ProfileScreen.tsx
// IDFC clarity + trust: Customer profile, masked Aadhaar, loan credentials & security controls

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  Modal,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import {
  User,
  Phone,
  Shield,
  Smartphone,
  Bell,
  LogOut,
  ChevronRight,
  Repeat,
  Sparkles,
  Check,
  X,
  ShieldCheck,
  Lock,
  ExternalLink,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/colors';
import { Spacing, Radius, Shadow } from '../constants/design';

export const ProfileScreen = () => {
  const { customer, pushToken, logout, isLoading, allLoans, switchActiveLoan, resetRolePreference } = useAuth();
  const [switchModalVisible, setSwitchModalVisible] = useState(false);
  const [switchingLoanId, setSwitchingLoanId] = useState<string | null>(null);

  if (!customer) return null;

  const maskedAadhaar = customer.aadhaar
    ? `XXXX-XXXX-${customer.aadhaar.slice(-4)}`
    : 'XXXX-XXXX-XXXX';

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Sign Out Confirmation',
      'Your session is securely saved on this device. You will need your registered Mobile or Aadhaar number to log in again. Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => logout(),
        },
      ]
    );
  };

  const handleSwitchRole = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Switch App Mode',
      'Do you want to switch to the Retailer & Admin Staff Portal? You can return to Customer mode anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch to Staff Mode',
          onPress: async () => {
            await resetRolePreference();
          },
        },
      ]
    );
  };

  const handleSelectLoan = async (loanId: string) => {
    if (loanId === customer.id) {
      setSwitchModalVisible(false);
      return;
    }
    try {
      setSwitchingLoanId(loanId);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await switchActiveLoan(loanId);
    } finally {
      setSwitchingLoanId(null);
      setSwitchModalVisible(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Screen Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Account & Security</Text>
        <Text style={styles.headerSub}>
          Verified borrower profile & loan credentials
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Identity Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitial}>
                {customer.customer_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.avatarInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.profileName}>{customer.customer_name}</Text>
                <View style={styles.verifiedBadge}>
                  <ShieldCheck size={11} color="#059669" />
                  <Text style={styles.verifiedText}>KYC VERIFIED</Text>
                </View>
              </View>
              <Text style={styles.mobileText}>+91 {customer.mobile}</Text>
            </View>
          </View>

          <View style={styles.cardDivider} />

          <View style={styles.metaRow}>
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>AADHAAR NUMBER</Text>
              <Text style={styles.metaValue}>{maskedAadhaar}</Text>
            </View>
            <View style={styles.metaColRight}>
              <Text style={styles.metaLabel}>ACCOUNT STATUS</Text>
              <Text style={styles.metaStatus}>
                {(customer.status || 'Active Loan').toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        {/* Financed Device Card */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>FINANCED SMARTPHONE</Text>
          <View style={styles.deviceCard}>
            <View style={styles.deviceHeader}>
              <Smartphone size={20} color="#1A6FD6" />
              <View style={styles.deviceTitleCol}>
                <Text style={styles.deviceModel}>
                  {customer.model_no || 'Financed Smartphone'}
                </Text>
                <Text style={styles.deviceImei}>IMEI: {customer.imei}</Text>
              </View>
            </View>

            <View style={styles.cardDivider} />

            <View style={styles.deviceMetaGrid}>
              <View style={styles.deviceMetaCol}>
                <Text style={styles.deviceMetaLabel}>FINANCED VALUE</Text>
                <Text style={styles.deviceMetaValue}>
                  ₹{(customer.purchase_value || 0).toLocaleString('en-IN')}
                </Text>
              </View>
              <View style={styles.deviceMetaCol}>
                <Text style={styles.deviceMetaLabel}>DOWN PAYMENT</Text>
                <Text style={styles.deviceMetaValue}>
                  ₹{(customer.down_payment || 0).toLocaleString('en-IN')}
                </Text>
              </View>
              <View style={styles.deviceMetaCol}>
                <Text style={styles.deviceMetaLabel}>MONTHLY EMI</Text>
                <Text style={styles.deviceMetaValue}>
                  ₹{(customer.emi_amount || 0).toLocaleString('en-IN')}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Multi-Loan Switcher Section */}
        {allLoans.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Linked Device Loans</Text>
            <TouchableOpacity
              style={styles.actionRowCard}
              activeOpacity={0.8}
              onPress={() => setSwitchModalVisible(true)}
            >
              <Repeat size={18} color="#1A6FD6" />
              <View style={styles.actionRowInfo}>
                <Text style={styles.actionRowTitle}>Linked Device Loans</Text>
                <Text style={styles.actionRowSub}>
                  You have {allLoans.length} smartphone finance accounts on this profile
                </Text>
              </View>
              <ChevronRight size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        )}

        {/* Partner Store Card */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>RETAILER PARTNER</Text>
          <View style={styles.storeCard}>
            <View style={styles.storeLeft}>
              <Text style={styles.storeName}>
                {customer.retailer?.name || 'Telepoint Partner Store'}
              </Text>
              {customer.retailer?.mobile && (
                <Text style={styles.storePhone}>
                  Contact: +91 {customer.retailer.mobile}
                </Text>
              )}
            </View>

            {customer.retailer?.mobile && (
              <TouchableOpacity
                style={styles.callBtn}
                onPress={() => Linking.openURL(`tel:${customer.retailer?.mobile}`)}
              >
                <Phone size={15} color="#1A6FD6" />
                <Text style={styles.callBtnText}>Call Store</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Notifications & System */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>ALERTS & NOTIFICATIONS</Text>
          <View style={styles.statusRowCard}>
            <Bell size={18} color="#059669" />
            <View style={styles.statusRowInfo}>
              <Text style={styles.statusRowTitle}>Automated EMI Reminders</Text>
              <Text style={styles.statusRowSub}>
                5-day lookahead push notification alerts enabled
              </Text>
            </View>
            <View style={styles.activeDot} />
          </View>
        </View>

        {/* Actions & Role Switcher */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>APP MODE & LOGOUT</Text>

          <TouchableOpacity
            style={styles.actionRowCard}
            activeOpacity={0.8}
            onPress={handleSwitchRole}
          >
            <Sparkles size={18} color="#1A6FD6" />
            <View style={styles.actionRowInfo}>
              <Text style={styles.actionRowTitle}>Switch App Mode</Text>
              <Text style={styles.actionRowSub}>
                Access Retailer or Admin operational web portal
              </Text>
            </View>
            <ChevronRight size={18} color="#94A3B8" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRowCard, styles.logoutCard]}
            activeOpacity={0.8}
            onPress={handleLogout}
          >
            <LogOut size={18} color="#DC2626" />
            <View style={styles.actionRowInfo}>
              <Text style={styles.logoutTitle}>Sign Out from Device</Text>
              <Text style={styles.actionRowSub}>
                Clears stored session and push credentials
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Footer info */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Telepoint EMI Mobile v1.0.0 • Connected to Live Production
          </Text>
          <Text style={styles.footerSub}>
            Bank-grade 256-bit encryption • RBI Compliant EMI Framework
          </Text>
        </View>
      </ScrollView>

      {/* Multi-Loan Selection Modal */}
      <Modal
        visible={switchModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSwitchModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Switch Financed Device</Text>
              <TouchableOpacity onPress={() => setSwitchModalVisible(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>
              Tap on any device to view its EMI schedule and loan passbook.
            </Text>

            <ScrollView style={{ maxHeight: 360 }}>
              {allLoans.map(loan => {
                const isActive = loan.id === customer.id;
                return (
                  <TouchableOpacity
                    key={loan.id}
                    style={[styles.loanItemCard, isActive && styles.loanItemActive]}
                    activeOpacity={0.8}
                    onPress={() => handleSelectLoan(loan.id)}
                  >
                    <Smartphone size={18} color={isActive ? '#1A6FD6' : '#64748B'} />
                    <View style={styles.loanItemInfo}>
                      <Text style={styles.loanItemModel}>{loan.model_no || 'Smartphone'}</Text>
                      <Text style={styles.loanItemImei}>IMEI: {loan.imei}</Text>
                    </View>
                    {isActive ? (
                      <View style={styles.activeTag}>
                        <Check size={12} color="#1A6FD6" />
                        <Text style={styles.activeTagText}>Active</Text>
                      </View>
                    ) : (
                      <ChevronRight size={16} color="#94A3B8" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F8FF', // Light IDFC blue-white canvas
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.sm,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 40,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 3,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    marginBottom: Spacing.md,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1A6FD6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  avatarInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: Radius.sm,
  },
  verifiedText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.5,
  },
  mobileText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: Spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaCol: {},
  metaColRight: {
    alignItems: 'flex-end',
  },
  metaLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    fontVariant: ['tabular-nums'],
  },
  metaStatus: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
  section: {
    marginBottom: Spacing.md,
  },
  sectionHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginLeft: 4,
  },
  deviceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deviceTitleCol: {
    flex: 1,
  },
  deviceModel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  deviceImei: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  deviceMetaGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  deviceMetaCol: {
    flex: 1,
  },
  deviceMetaLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  deviceMetaValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    fontVariant: ['tabular-nums'],
  },
  storeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  storeLeft: {
    flex: 1,
  },
  storeName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  storePhone: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF5FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(26, 111, 214, 0.2)',
  },
  callBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A6FD6',
  },
  actionRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  actionRowInfo: {
    flex: 1,
  },
  actionRowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  actionRowSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  statusRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusRowInfo: {
    flex: 1,
  },
  statusRowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  statusRowSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  logoutCard: {
    borderColor: '#FEE2E2',
    backgroundColor: '#FEF2F2',
  },
  logoutTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#DC2626',
  },
  footer: {
    alignItems: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  footerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  footerSub: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
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
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    marginBottom: Spacing.md,
  },
  loanItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  loanItemActive: {
    backgroundColor: '#EFF5FF',
    borderColor: '#1A6FD6',
  },
  loanItemInfo: {
    flex: 1,
  },
  loanItemModel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  loanItemImei: {
    fontSize: 11,
    color: '#64748B',
  },
  activeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  activeTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1A6FD6',
  },
});
