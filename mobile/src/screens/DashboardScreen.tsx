// screens/DashboardScreen.tsx
// IDFC First Bank clarity + Jupiter Neo delight: Numbers as heroes, 3D tilt Hero Gradient Card, quick stats & multi-loan switching

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Linking,
  Alert,
  Modal,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  Megaphone,
  ChevronRight,
  ShieldCheck,
  Clock,
  CheckCircle2,
  Receipt,
  Smartphone,
  Check,
  X,
  CreditCard,
  PhoneCall,
  Calendar,
  AlertCircle,
  TrendingUp,
  Zap,
  QrCode,
  User,
  Users,
  ArrowLeftRight,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { GradientCard } from '../components/GradientCard';
import { CountUp } from '../components/CountUp';
import { ReceiptModal } from '../components/ReceiptModal';
import { BroadcastModal } from '../components/BroadcastModal';
import { PaymentModal } from '../components/PaymentModal';
import { BroadcastItem, EMIScheduleItem } from '../types';
import { Colors } from '../constants/colors';
import { Spacing, Radius, Shadow } from '../constants/design';
import { Typography } from '../constants/typography';

export const DashboardScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight || 28 : 0);
  const { customer, emis, breakdown, broadcasts, refreshData, allLoans, switchActiveLoan, switchCustomerLogin, switchRole } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [activeBroadcast, setActiveBroadcast] = useState<BroadcastItem | null>(null);
  const [receiptEmi, setReceiptEmi] = useState<EMIScheduleItem | null>(null);
  const [switchModalVisible, setSwitchModalVisible] = useState(false);
  const [switchingLoanId, setSwitchingLoanId] = useState<string | null>(null);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [accountMenuVisible, setAccountMenuVisible] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refreshData();
    setRefreshing(false);
  };

  if (!customer) return null;

  // Split paid vs unpaid EMIs (supporting both 'collected' and 'APPROVED')
  const isEmiPaid = (e: EMIScheduleItem) =>
    e.status === 'collected' || e.status === 'APPROVED' || !!e.paid_at;

  const paidEmis = emis.filter(isEmiPaid);
  const unpaidEmis = emis.filter(e => !isEmiPaid(e));
  const nextEmi = unpaidEmis.length > 0 ? unpaidEmis[0] : null;

  const totalEmisCount = customer.emi_tenure || Math.max(emis.length, 1);
  const totalLoanAmount = customer.purchase_value || customer.emi_amount * totalEmisCount;
  const paidAmount = paidEmis.reduce(
    (sum, e) => sum + (e.amount || 0) + (e.fine_paid_amount || 0),
    0
  );
  const remainingBalance = Math.max(totalLoanAmount - paidAmount, 0);

  // Calculate days left until next EMI due date
  const calculateDaysLeft = () => {
    if (!nextEmi?.due_date) return 999;
    try {
      const due = new Date(nextEmi.due_date);
      const now = new Date();
      const diffTime = due.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return Math.max(diffDays, 0);
    } catch {
      return 999;
    }
  };

  const daysLeft = calculateDaysLeft();

  const formattedDueDate = nextEmi?.due_date
    ? (() => {
        try {
          return new Date(nextEmi.due_date).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          });
        } catch {
          return nextEmi.due_date;
        }
      })()
    : undefined;

  // Handle direct UPI Payment intent & Dynamic QR modal (Payee: biswajit.khanra82@axl)
  const handlePayUpi = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPaymentModalVisible(true);
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

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary, Colors.success]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header Bar with Dynamic Safe Area Inset */}
        <View style={[styles.topHeader, { paddingTop: topInset + 8 }]}>
          <View style={styles.headerLeft}>
            <View style={styles.greetingRow}>
              <Text style={styles.greetingText}>HELLO,</Text>
              <View style={styles.kycShield}>
                <ShieldCheck size={11} color="#059669" />
                <Text style={styles.kycText}>VERIFIED</Text>
              </View>
            </View>
            <Text style={styles.customerName}>{customer.customer_name}</Text>

            {/* Multi-Loan Switcher Pill */}
            {allLoans.length > 1 && (
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.switchLoanPill}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSwitchModalVisible(true);
                }}
              >
                <Smartphone size={12} color="#1A6FD6" />
                <Text style={styles.switchLoanPillText}>
                  {customer.model_no || 'Active Device'} • Switch ({allLoans.length}) ▾
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.headerRightCol}>
            {/* Account & Role Switcher Pill */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setAccountMenuVisible(true);
              }}
              style={styles.accountActionPill}
            >
              <User size={12} color="#1A6FD6" />
              <Text style={styles.accountActionPillText}>Account ▾</Text>
            </TouchableOpacity>

            <View style={styles.retailerPill}>
              <Text style={styles.retailerLabel}>PARTNER STORE</Text>
              <Text style={styles.retailerName} numberOfLines={1}>
                {customer.retailer?.name || 'Telepoint Partner'}
              </Text>
            </View>
          </View>
        </View>

        {/* Live Broadcast / Announcement Banner */}
        {broadcasts.length > 0 && (
          <TouchableOpacity
            activeOpacity={0.88}
            style={styles.broadcastBanner}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveBroadcast(broadcasts[0]);
            }}
          >
            <LinearGradient
              colors={['#FEF3C7', '#FDE68A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.broadcastGradient}
            >
              <View style={styles.broadcastLeft}>
                <View style={styles.broadcastIconBox}>
                  <Megaphone size={16} color="#D97706" />
                </View>
                <View style={styles.broadcastTextCol}>
                  <Text style={styles.broadcastTag}>STORE ANNOUNCEMENT</Text>
                  <Text style={styles.broadcastMessage} numberOfLines={1}>
                    {broadcasts[0].message}
                  </Text>
                </View>
              </View>
              <ChevronRight size={18} color="#D97706" />
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Hero 3D Gradient Card — IDFC + Jupiter Neo */}
        <GradientCard
          loanAmount={totalLoanAmount}
          paidAmount={paidAmount}
          nextEmiAmount={nextEmi?.amount || customer.emi_amount}
          nextDueDate={formattedDueDate}
          daysLeft={daysLeft}
          tenureMonths={totalEmisCount}
          paidMonths={paidEmis.length}
          onPayPress={handlePayUpi}
        />

        {/* Quick Stats Mini Cards — Horizontal Scroll */}
        <View style={styles.quickStatsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickStatsScroll}
          >
            {/* Stat 1: Total Paid */}
            <View style={styles.statCard}>
              <View style={styles.statHeaderRow}>
                <View style={[styles.statDot, { backgroundColor: '#10B981' }]} />
                <Text style={styles.statLabelText}>TOTAL PAID</Text>
              </View>
              <CountUp
                end={paidAmount}
                prefix="₹"
                style={[styles.statNumberText, { color: '#059669' }]}
                duration={700}
              />
              <Text style={styles.statSubText}>{paidEmis.length} installments settled</Text>
            </View>

            {/* Stat 2: Remaining Balance */}
            <View style={styles.statCard}>
              <View style={styles.statHeaderRow}>
                <View style={[styles.statDot, { backgroundColor: '#1A6FD6' }]} />
                <Text style={styles.statLabelText}>REMAINING</Text>
              </View>
              <CountUp
                end={remainingBalance}
                prefix="₹"
                style={[styles.statNumberText, { color: '#1A6FD6' }]}
                duration={700}
              />
              <Text style={styles.statSubText}>{unpaidEmis.length} installments due</Text>
            </View>

            {/* Stat 3: Tenure Progress */}
            <View style={styles.statCard}>
              <View style={styles.statHeaderRow}>
                <View style={[styles.statDot, { backgroundColor: '#4F46E5' }]} />
                <Text style={styles.statLabelText}>TENURE</Text>
              </View>
              <Text style={[styles.statNumberText, { color: '#4F46E5' }]}>
                {paidEmis.length}/{totalEmisCount}
              </Text>
              <Text style={styles.statSubText}>
                {Math.round((paidEmis.length / totalEmisCount) * 100)}% loan completed
              </Text>
            </View>
          </ScrollView>
        </View>

        {/* Fintech Quick Action Dock */}
        <View style={styles.actionDock}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnPrimary]}
            activeOpacity={0.88}
            onPress={handlePayUpi}
          >
            <Zap size={17} color="#FFFFFF" />
            <Text style={styles.actionBtnPrimaryText}>Pay EMI</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnQr]}
            activeOpacity={0.88}
            onPress={handlePayUpi}
          >
            <QrCode size={17} color="#1A6FD6" />
            <Text style={styles.actionBtnQrText}>Scan QR</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtnSecondary}
            activeOpacity={0.88}
            onPress={() => navigation.navigate('EmiSchedule')}
          >
            <Calendar size={17} color="#1A6FD6" />
            <Text style={styles.actionBtnSecondaryText}>Schedule</Text>
          </TouchableOpacity>

          {customer.retailer?.mobile && (
            <TouchableOpacity
              style={styles.actionBtnIcon}
              activeOpacity={0.88}
              onPress={() => Linking.openURL(`tel:${customer.retailer?.mobile}`)}
            >
              <PhoneCall size={18} color="#0F172A" />
            </TouchableOpacity>
          )}
        </View>

        {/* Next 3 Installments Activity Feed */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>INSTALLMENT SCHEDULE</Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate('EmiSchedule');
              }}
            >
              <Text style={styles.sectionViewAllText}>View All ({emis.length})</Text>
            </TouchableOpacity>
          </View>

          {emis.slice(0, 3).map((emi, index) => {
            const isPaid = isEmiPaid(emi);
            return (
              <TouchableOpacity
                key={emi.id}
                activeOpacity={0.85}
                onPress={() => {
                  Haptics.selectionAsync();
                  if (isPaid) {
                    setReceiptEmi(emi);
                  } else {
                    navigation.navigate('EmiSchedule');
                  }
                }}
                style={styles.activityCard}
              >
                <View style={styles.activityLeft}>
                  <View
                    style={[
                      styles.activityIconCircle,
                      isPaid ? styles.iconCirclePaid : styles.iconCircleDue,
                    ]}
                  >
                    {isPaid ? (
                      <CheckCircle2 size={18} color="#059669" />
                    ) : (
                      <Clock size={18} color="#1A6FD6" />
                    )}
                  </View>
                  <View style={styles.activityTextCol}>
                    <Text style={styles.activityEmiTitle}>EMI #{emi.emi_no}</Text>
                    <Text style={styles.activityDate}>
                      Due: {emi.due_date}
                    </Text>
                  </View>
                </View>

                <View style={styles.activityRight}>
                  <Text
                    style={[
                      styles.activityAmount,
                      isPaid && { color: '#059669' },
                    ]}
                  >
                    ₹{emi.amount.toLocaleString('en-IN')}
                  </Text>
                  <View
                    style={[
                      styles.statusPill,
                      isPaid ? styles.statusPillPaid : styles.statusPillDue,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        isPaid ? styles.statusTextPaid : styles.statusTextDue,
                      ]}
                    >
                      {isPaid ? '✓ PAID' : 'DUE'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
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
              <View style={styles.modalTitleRow}>
                <Smartphone size={20} color="#1A6FD6" />
                <Text style={styles.modalTitle}>Switch Financed Device</Text>
              </View>
              <TouchableOpacity onPress={() => setSwitchModalVisible(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>
              Select which smartphone loan account you want to manage on this device.
            </Text>

            <ScrollView style={{ maxHeight: 360 }}>
              {allLoans.map(loan => {
                const isActive = loan.id === customer.id;
                return (
                  <TouchableOpacity
                    key={loan.id}
                    style={[styles.loanCard, isActive && styles.loanCardActive]}
                    activeOpacity={0.8}
                    onPress={() => handleSelectLoan(loan.id)}
                  >
                    <View style={styles.loanCardLeft}>
                      <Smartphone size={18} color={isActive ? '#1A6FD6' : '#64748B'} />
                      <View style={styles.loanCardInfo}>
                        <Text style={styles.loanModel}>
                          {loan.model_no || 'Financed Smartphone'}
                        </Text>
                        <Text style={styles.loanImei}>IMEI: {loan.imei}</Text>
                      </View>
                    </View>
                    {isActive ? (
                      <View style={styles.activePill}>
                        <Check size={14} color="#1A6FD6" />
                        <Text style={styles.activePillText}>Active</Text>
                      </View>
                    ) : (
                      <ChevronRight size={18} color="#94A3B8" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Account & Role Switcher Sheet */}
      <Modal
        visible={accountMenuVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAccountMenuVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <User size={20} color="#1A6FD6" />
                <Text style={styles.modalTitle}>Borrower Account & Role</Text>
              </View>
              <TouchableOpacity onPress={() => setAccountMenuVisible(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>
              Signed in as {customer.customer_name} (+91 {customer.mobile})
            </Text>

            {/* Option 1: Switch Financed Device if multiple loans */}
            {allLoans.length > 1 && (
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.menuOptionBtn}
                onPress={() => {
                  setAccountMenuVisible(false);
                  setTimeout(() => setSwitchModalVisible(true), 300);
                }}
              >
                <Smartphone size={18} color="#1A6FD6" />
                <View style={styles.menuOptionInfo}>
                  <Text style={styles.menuOptionTitle}>Switch Financed Device</Text>
                  <Text style={styles.menuOptionSub}>Toggle among {allLoans.length} active device loans</Text>
                </View>
                <ChevronRight size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}

            {/* Option 2: Log in as Another Customer */}
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.menuOptionBtn}
              onPress={() => {
                setAccountMenuVisible(false);
                Alert.alert(
                  'Switch Customer Account',
                  'Do you want to sign in with a different registered Mobile or Aadhaar number?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Switch Customer',
                      onPress: async () => {
                        await switchCustomerLogin();
                      },
                    },
                  ]
                );
              }}
            >
              <ArrowLeftRight size={18} color="#059669" />
              <View style={styles.menuOptionInfo}>
                <Text style={styles.menuOptionTitle}>Log in as Another Customer</Text>
                <Text style={styles.menuOptionSub}>Sign in with a different Mobile or Aadhaar</Text>
              </View>
              <ChevronRight size={18} color="#94A3B8" />
            </TouchableOpacity>

            {/* Option 3: Switch to Staff Mode (Retailer / Admin) */}
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.menuOptionBtn}
              onPress={() => {
                setAccountMenuVisible(false);
                Alert.alert(
                  'Switch to Staff Mode',
                  'Do you want to switch this phone to Retailer or Admin mode?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Open Staff Portal',
                      onPress: async () => {
                        await switchRole('staff');
                      },
                    },
                  ]
                );
              }}
            >
              <Users size={18} color="#4F46E5" />
              <View style={styles.menuOptionInfo}>
                <Text style={styles.menuOptionTitle}>Switch App Mode (Staff)</Text>
                <Text style={styles.menuOptionSub}>Access Retailer or Admin store operations</Text>
              </View>
              <ChevronRight size={18} color="#94A3B8" />
            </TouchableOpacity>

            {/* Option 4: Full Profile */}
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.menuOptionBtn}
              onPress={() => {
                setAccountMenuVisible(false);
                navigation.navigate('Profile');
              }}
            >
              <ShieldCheck size={18} color="#1A6FD6" />
              <View style={styles.menuOptionInfo}>
                <Text style={styles.menuOptionTitle}>View Profile & Security</Text>
                <Text style={styles.menuOptionSub}>Masked Aadhaar, loan terms & partner store</Text>
              </View>
              <ChevronRight size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Dynamic UPI Payment & QR Modal (Payee: biswajit.khanra82@axl) */}
      <PaymentModal
        visible={paymentModalVisible}
        onClose={() => setPaymentModalVisible(false)}
        customer={customer}
        emis={emis}
        breakdown={breakdown}
        onSubmitUtr={({ amount, utr, paymentType }) => {
          console.log('[DashboardScreen] Customer submitted payment UTR:', { amount, utr, paymentType });
        }}
      />

      {/* Receipt Modal */}
      {receiptEmi && (
        <ReceiptModal
          visible={!!receiptEmi}
          emi={receiptEmi}
          customer={customer}
          onClose={() => setReceiptEmi(null)}
        />
      )}

      {/* Store Announcement Broadcast Modal */}
      {activeBroadcast && (
        <BroadcastModal
          visible={!!activeBroadcast}
          broadcast={activeBroadcast}
          onClose={() => setActiveBroadcast(null)}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F8FF', // Light IDFC blue-white canvas
  },
  scrollContent: {
    paddingBottom: 40,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.sm,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerLeft: {
    flex: 1,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  greetingText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  kycShield: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: Radius.sm,
  },
  kycText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.5,
  },
  customerName: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.4,
    marginTop: 2,
  },
  switchLoanPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF5FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(26, 111, 214, 0.2)',
  },
  switchLoanPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A6FD6',
  },
  headerRightCol: {
    alignItems: 'flex-end',
    gap: 6,
  },
  accountActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF5FF',
    borderWidth: 1,
    borderColor: 'rgba(26, 111, 214, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  accountActionPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1A6FD6',
  },
  retailerPill: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'flex-end',
    maxWidth: 140,
  },
  retailerLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  retailerName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },
  broadcastBanner: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  broadcastGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  broadcastLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  broadcastIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(217, 119, 6, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  broadcastTextCol: {
    flex: 1,
  },
  broadcastTag: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.6,
  },
  broadcastMessage: {
    fontSize: 12,
    fontWeight: '700',
    color: '#78350F',
    marginTop: 1,
  },
  quickStatsContainer: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  quickStatsScroll: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing.base,
    minWidth: 140,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  statHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  statDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statLabelText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  statNumberText: {
    fontSize: 20,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    marginVertical: 2,
  },
  statSubText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  actionDock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.md,
  },
  actionBtnPrimary: {
    backgroundColor: '#1A6FD6',
    elevation: 3,
    shadowColor: '#1A6FD6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  actionBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  actionBtnQr: {
    backgroundColor: '#EFF5FF',
    borderWidth: 1,
    borderColor: 'rgba(26, 111, 214, 0.25)',
  },
  actionBtnQrText: {
    color: '#1A6FD6',
    fontSize: 13,
    fontWeight: '800',
  },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  actionBtnSecondaryText: {
    color: '#1A6FD6',
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtnIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionContainer: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  sectionViewAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A6FD6',
  },
  activityCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 1,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
  },
  activityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  activityIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCirclePaid: {
    backgroundColor: '#ECFDF5',
  },
  iconCircleDue: {
    backgroundColor: '#EFF5FF',
  },
  activityTextCol: {},
  activityEmiTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  activityDate: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  activityRight: {
    alignItems: 'flex-end',
  },
  activityAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    fontVariant: ['tabular-nums'],
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    marginTop: 2,
  },
  statusPillPaid: {
    backgroundColor: '#ECFDF5',
  },
  statusPillDue: {
    backgroundColor: '#EFF5FF',
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  statusTextPaid: {
    color: '#059669',
  },
  statusTextDue: {
    color: '#1A6FD6',
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
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  loanCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  loanCardActive: {
    backgroundColor: '#EFF5FF',
    borderColor: '#1A6FD6',
  },
  loanCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loanCardInfo: {},
  loanModel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  loanImei: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  activePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A6FD6',
  },
  menuOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: Radius.lg,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  menuOptionInfo: {
    flex: 1,
  },
  menuOptionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  menuOptionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
});
