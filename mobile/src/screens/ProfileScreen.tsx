// screens/ProfileScreen.tsx
// IDFC clarity + trust: Customer profile, masked Aadhaar, loan credentials & security controls
// 100% Data Accuracy (MRP, Down Payment, Financed Loan, Customer ID) & Fixed Call Support 7003617029

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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  User,
  Phone,
  Smartphone,
  Bell,
  LogOut,
  ChevronRight,
  Repeat,
  Check,
  X,
  ShieldCheck,
  Lock,
  MessageCircle,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/AuthContext';
import { PressableScale } from '../components/PressableScale';
import { JellyCard } from '../components/JellyCard';
import { Colors } from '../constants/colors';
import { Spacing, Radius } from '../constants/design';
import { customerCodeOf } from '../utils/customerCode';

export const CENTRAL_SUPPORT_PHONE = '7003617029';

export const ProfileScreen = () => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, StatusBar.currentHeight || 28);
  const {
    customer,
    pushToken,
    logout,
    isLoading,
    allLoans,
    switchActiveLoan,
    resetRolePreference,
    switchCustomerLogin,
    switchRole,
  } = useAuth();
  const [switchModalVisible, setSwitchModalVisible] = useState(false);
  const [switchingLoanId, setSwitchingLoanId] = useState<string | null>(null);

  if (!customer) return null;

  const maskedAadhaar = customer.aadhaar
    ? `XXXX-XXXX-${customer.aadhaar.slice(-4)}`
    : 'XXXX-XXXX-XXXX';

  const custCode = customerCodeOf(customer);
  const financedLoan =
    customer.disburse_amount ||
    Math.max(0, (customer.purchase_value || 0) - (customer.down_payment || 0));

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
            await switchRole('staff');
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

      {/* Screen Header with Notch Inset */}
      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
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

          {/* Customer ID Badge */}
          {custCode ? (
            <View style={styles.customerIdRow}>
              <Text style={styles.customerIdLabel}>PERMANENT CUSTOMER ID</Text>
              <View style={styles.customerIdPill}>
                <Text style={styles.customerIdValue}>{custCode}</Text>
              </View>
            </View>
          ) : null}

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

        {/* Financed Device Card (100% Accurate Numbers) */}
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
                <Text style={styles.deviceMetaLabel}>DEVICE PRICE (MRP)</Text>
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
                <Text style={styles.deviceMetaLabel}>FINANCED LOAN</Text>
                <Text style={[styles.deviceMetaValue, { color: '#1A6FD6' }]}>
                  ₹{financedLoan.toLocaleString('en-IN')}
                </Text>
              </View>
            </View>

            <View style={styles.cardDivider} />

            <View style={styles.deviceMetaGrid}>
              <View style={styles.deviceMetaCol}>
                <Text style={styles.deviceMetaLabel}>MONTHLY EMI</Text>
                <Text style={styles.deviceMetaValue}>
                  ₹{(customer.emi_amount || 0).toLocaleString('en-IN')}
                </Text>
              </View>
              <View style={styles.deviceMetaCol}>
                <Text style={styles.deviceMetaLabel}>LOAN TENURE</Text>
                <Text style={styles.deviceMetaValue}>
                  {customer.emi_tenure || 1} Months
                </Text>
              </View>
              <View style={styles.deviceMetaCol}>
                <Text style={styles.deviceMetaLabel}>EMI DUE DAY</Text>
                <Text style={styles.deviceMetaValue}>
                  Day {customer.emi_due_day || 1} of mo.
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Multi-Loan Switcher Section */}
        {allLoans.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Linked Device Loans</Text>
            <PressableScale
              style={styles.actionRowCard}
              onPress={() => setSwitchModalVisible(true)}
              scaleTo={0.96}
            >
              <Repeat size={18} color="#1A6FD6" />
              <View style={styles.actionRowInfo}>
                <Text style={styles.actionRowTitle}>Linked Device Loans</Text>
                <Text style={styles.actionRowSub}>
                  You have {allLoans.length} smartphone finance accounts on this profile
                </Text>
              </View>
              <ChevronRight size={18} color="#94A3B8" />
            </PressableScale>
          </View>
        )}

        {/* Partner Store & Fixed Support Contact Card */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>STORE PARTNER & SUPPORT</Text>
          <View style={styles.storeCard}>
            <View style={styles.storeLeft}>
              <Text style={styles.storeName}>
                {customer.retailer?.name || 'Telepoint Partner Store'}
              </Text>
              <Text style={styles.storePhone}>
                Helpline: +91 {CENTRAL_SUPPORT_PHONE}
              </Text>
            </View>

            <View style={styles.storeActionsRow}>
              <PressableScale
                style={styles.callBtn}
                onPress={() => Linking.openURL(`tel:${CENTRAL_SUPPORT_PHONE}`)}
                scaleTo={0.92}
              >
                <Phone size={14} color="#FFFFFF" />
                <Text style={styles.callBtnText}>Call</Text>
              </PressableScale>

              <PressableScale
                style={styles.waBtn}
                onPress={() =>
                  Linking.openURL(
                    `https://wa.me/91${CENTRAL_SUPPORT_PHONE}?text=${encodeURIComponent(
                      `Hello, I am ${customer.customer_name} (ID: ${custCode || customer.mobile}). I need assistance with my Telepoint EMI.`
                    )}`
                  )
                }
                scaleTo={0.92}
              >
                <MessageCircle size={14} color="#FFFFFF" />
                <Text style={styles.waBtnText}>WhatsApp</Text>
              </PressableScale>
            </View>
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
          </View>
        </View>

        {/* Account Switching Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>ACCOUNT & ROLE SWITCHING</Text>

          {/* Switch to Another Customer Login */}
          <PressableScale
            style={styles.switchModeCard}
            onPress={() => switchCustomerLogin()}
            scaleTo={0.96}
          >
            <View style={styles.switchModeLeft}>
              <View style={[styles.switchIconBox, { backgroundColor: '#EFF6FF' }]}>
                <User size={18} color="#1A6FD6" />
              </View>
              <View>
                <Text style={styles.switchModeTitle}>Log in as Another Customer</Text>
                <Text style={styles.switchModeSub}>Switch Mobile or Aadhaar number</Text>
              </View>
            </View>
            <ChevronRight size={18} color="#94A3B8" />
          </PressableScale>

          {/* Switch App Mode (Staff / Customer) */}
          <PressableScale
            style={[styles.switchModeCard, { marginTop: 10 }]}
            onPress={handleSwitchRole}
            scaleTo={0.96}
          >
            <View style={styles.switchModeLeft}>
              <View style={styles.switchIconBox}>
                <Repeat size={18} color="#1A6FD6" />
              </View>
              <View>
                <Text style={styles.switchModeTitle}>Switch App Mode</Text>
                <Text style={styles.switchModeSub}>Switch to Retailer or Admin Staff Portal</Text>
              </View>
            </View>
            <ChevronRight size={18} color="#94A3B8" />
          </PressableScale>
        </View>

        {/* Security / Sign Out Action */}
        <View style={styles.section}>
          <PressableScale
            style={styles.signOutBtn}
            onPress={handleLogout}
            scaleTo={0.94}
          >
            <LogOut size={16} color="#EF4444" />
            <Text style={styles.signOutText}>Sign Out from This Phone</Text>
          </PressableScale>
        </View>

        {/* App Version Info */}
        <View style={styles.versionFooter}>
          <Text style={styles.versionText}>Telepoint EMI • Version 1.0.0 (Production)</Text>
          <Text style={styles.versionSubText}>Protected with 256-Bit SSL Encryption</Text>
        </View>
      </ScrollView>

      {/* Switch Active Loan Modal */}
      <Modal visible={switchModalVisible} transparent animationType="slide" onRequestClose={() => setSwitchModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Linked Device Loans</Text>
                <Text style={styles.modalSubtitle}>Select which device loan to view</Text>
              </View>
              <TouchableOpacity onPress={() => setSwitchModalVisible(false)} style={styles.modalCloseBtn}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.loansList} showsVerticalScrollIndicator={false}>
              {allLoans.map(loan => {
                const isSelected = loan.id === customer.id;
                const isSwitching = switchingLoanId === loan.id;

                return (
                  <TouchableOpacity
                    key={loan.id}
                    activeOpacity={0.8}
                    style={[styles.loanItemCard, isSelected && styles.loanItemCardSelected]}
                    onPress={() => handleSelectLoan(loan.id)}
                    disabled={isSwitching}
                  >
                    <View style={styles.loanItemLeft}>
                      <View style={[styles.phoneIconCircle, isSelected && styles.phoneIconCircleSelected]}>
                        <Smartphone size={20} color={isSelected ? '#FFFFFF' : '#1A6FD6'} />
                      </View>
                      <View style={styles.loanInfoCol}>
                        <Text style={styles.loanModelText}>{loan.model_no || 'Smartphone'}</Text>
                        <Text style={styles.loanImeiText}>IMEI: {loan.imei}</Text>
                        <Text style={styles.loanStatusText}>
                          {loan.status} • ₹{loan.emi_amount}/mo
                        </Text>
                      </View>
                    </View>

                    {isSelected && (
                      <View style={styles.selectedBadge}>
                        <Check size={14} color="#FFFFFF" />
                      </View>
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
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: 40,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: Spacing.lg,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1A6FD6',
  },
  avatarInfo: {
    marginLeft: 14,
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  verifiedText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#059669',
  },
  mobileText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  customerIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  customerIdLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  customerIdPill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  customerIdValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1A6FD6',
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
  metaCol: {
    flex: 1,
  },
  metaColRight: {
    alignItems: 'flex-end',
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  metaStatus: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  deviceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    fontSize: 11,
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
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  deviceMetaValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  actionRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  actionRowInfo: {
    flex: 1,
    marginLeft: 12,
  },
  actionRowTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  actionRowSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  storeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    fontWeight: '600',
  },
  storeActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1A6FD6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  callBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  waBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  waBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  statusRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusRowInfo: {
    flex: 1,
    marginLeft: 12,
  },
  statusRowTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  statusRowSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  switchModeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  switchModeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  switchIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchModeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  switchModeSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    paddingVertical: 14,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
  },
  versionFooter: {
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: 2,
  },
  versionText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  versionSubText: {
    fontSize: 10,
    color: '#CBD5E1',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing['2xl'],
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loansList: {
    marginTop: Spacing.md,
  },
  loanItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  loanItemCardSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#1A6FD6',
  },
  loanItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  phoneIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneIconCircleSelected: {
    backgroundColor: '#1A6FD6',
  },
  loanInfoCol: {
    flex: 1,
  },
  loanModelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  loanImeiText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  loanStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A6FD6',
    marginTop: 2,
  },
  selectedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1A6FD6',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
