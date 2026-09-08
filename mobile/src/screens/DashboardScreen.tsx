// screens/DashboardScreen.tsx
// IDFC First Bank clarity + Jupiter Neo delight: Numbers as heroes, 3D tilt Hero Gradient Card, quick stats & multi-loan switching
// 100% Data Precision matching Web Engine + Livable Fluid Jelly Physics

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Linking,
  Modal,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Haptics } from '../utils/haptics';
import {
  Megaphone,
  ChevronRight,
  ShieldCheck,
  Receipt,
  Smartphone,
  Check,
  X,
  PhoneCall,
  Calendar,
  AlertCircle,
  Zap,
  QrCode,
  User,
  ArrowRight,
  Clock,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { GradientCard } from '../components/GradientCard';
import { CountUp } from '../components/CountUp';
import { ReceiptModal } from '../components/ReceiptModal';
import { BroadcastModal } from '../components/BroadcastModal';
import { PaymentModal } from '../components/PaymentModal';
import { JellyCard } from '../components/JellyCard';
import { PressableScale } from '../components/PressableScale';
import { BroadcastItem, EMIScheduleItem } from '../types';
import { Colors } from '../constants/colors';
import { Spacing, Radius } from '../constants/design';
import { getPerEmiFineBreakdown } from '../utils/fineCalc';
import { firstChargeRemaining } from '../utils/firstCharge';
import { toISTDateString, diffDaysIST } from '../utils/ist';
import { customerCodeOf } from '../utils/customerCode';

export const DashboardScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight || 28 : 0);
  const {
    customer,
    emis,
    breakdown,
    broadcasts,
    refreshData,
    allLoans,
    switchActiveLoan,
    switchCustomerLogin,
    switchRole,
  } = useAuth();

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

  // 1. Sorted EMIs by due date
  const sortedEmis = useMemo(() => {
    return [...emis].sort(
      (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    );
  }, [emis]);

  // 2. Exact IST month calculation
  const currentMonth = toISTDateString(new Date()).slice(0, 7);

  // 3. Exact Fine Breakdown
  const fineRows = useMemo(() => getPerEmiFineBreakdown(sortedEmis), [sortedEmis]);
  const totalFineRemaining = useMemo(
    () => fineRows.reduce((sum, row) => sum + row.remaining, 0),
    [fineRows]
  );
  const fineEmiNos = useMemo(
    () => fineRows.filter(r => r.remaining > 0).map(r => r.emi_no),
    [fineRows]
  );

  // 4. First EMI charge
  const firstChargeDue = useMemo(
    () => firstChargeRemaining(customer),
    [customer]
  );

  // 5. Unpaid EMIs eligible for immediate payment
  const dueEmis = useMemo(() => {
    let list = sortedEmis.filter(
      e =>
        (e.status === 'UNPAID' ||
          e.status === 'PARTIALLY_PAID' ||
          e.status === 'overdue' ||
          (e.status !== 'collected' && e.status !== 'APPROVED')) &&
        toISTDateString(e.due_date).slice(0, 7) <= currentMonth
    );
    if (list.length === 0) {
      const nextUp = sortedEmis.find(
        e =>
          e.status === 'UNPAID' ||
          e.status === 'PARTIALLY_PAID' ||
          e.status === 'overdue' ||
          (e.status !== 'collected' && e.status !== 'APPROVED')
      );
      if (nextUp) list = [nextUp];
    }
    return list;
  }, [sortedEmis, currentMonth]);

  const emiDue = useMemo(() => {
    return dueEmis.reduce(
      (sum, e) =>
        sum +
        Math.max(
          0,
          Number(e.amount || 0) - Math.max(0, Number(e.partial_paid_amount || 0))
        ),
      0
    );
  }, [dueEmis]);

  const totalDue = emiDue + totalFineRemaining + firstChargeDue;

  // 6. Paid vs Unpaid EMIs
  const isEmiPaid = (e: EMIScheduleItem) =>
    e.status === 'collected' || e.status === 'APPROVED' || !!e.paid_at;

  const paidEmis = sortedEmis.filter(isEmiPaid);
  const unpaidEmis = sortedEmis.filter(e => !isEmiPaid(e));
  const earliestDueEmi = dueEmis[0] || unpaidEmis[0];

  // 7. Accurate Financial Totals (Fixing down payment distortion)
  const totalEmisCount = customer.emi_tenure || Math.max(emis.length, 1);
  const totalLoanAmount =
    emis.length > 0
      ? emis.reduce((sum, e) => sum + Number(e.amount || 0), 0)
      : customer.emi_amount * totalEmisCount;

  const paidAmount = emis.reduce(
    (sum, e) =>
      isEmiPaid(e)
        ? sum + Number(e.amount || 0)
        : sum + Math.max(0, Number(e.partial_paid_amount || 0)),
    0
  );

  const remainingBalance = Math.max(totalLoanAmount - paidAmount, 0);

  // 8. Accurate Days Left via IST
  const nextDueDate = earliestDueEmi?.due_date || breakdown?.next_emi_due_date;
  const daysLeft = nextDueDate ? diffDaysIST(nextDueDate, new Date()) : 999;

  const formattedDueDate = nextDueDate
    ? (() => {
        try {
          return new Date(nextDueDate).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          });
        } catch {
          return nextDueDate;
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
              <Text style={styles.greetingText}>Welcome,</Text>
            </View>
            <Text style={styles.customerName}>{customer.customer_name}</Text>

            {/* Multi-Loan Switcher Pill */}
            {allLoans.length > 1 && (
              <PressableScale
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSwitchModalVisible(true);
                }}
                style={styles.switchLoanPill}
                scaleTo={0.94}
              >
                <Smartphone size={12} color="#1A6FD6" />
                <Text style={styles.switchLoanPillText}>
                  {customer.model_no || 'Active Device'} • Switch ({allLoans.length}) ▾
                </Text>
              </PressableScale>
            )}
          </View>

          <View style={styles.headerRightCol}>
            {/* Account & Role Switcher Pill */}
            <PressableScale
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setAccountMenuVisible(true);
              }}
              style={styles.accountActionPill}
              scaleTo={0.92}
            >
              <User size={12} color="#1A6FD6" />
              <Text style={styles.accountActionPillText}>Account ▾</Text>
            </PressableScale>

            <View style={styles.retailerPill}>
              <Text style={styles.retailerLabel}>PURCHASED FROM</Text>
              <Text style={styles.retailerName} numberOfLines={1}>
                {customer.retailer?.name || 'Telepoint Store'}
              </Text>
            </View>
          </View>
        </View>

        {/* Live Broadcast / Announcement Banner */}
        {broadcasts.length > 0 && (
          <PressableScale
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveBroadcast(broadcasts[0]);
            }}
            style={styles.broadcastBanner}
            scaleTo={0.97}
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
                  <Text style={styles.broadcastTag}>STORE NOTICE</Text>
                  <Text style={styles.broadcastMessage} numberOfLines={1}>
                    {broadcasts[0].message}
                  </Text>
                </View>
              </View>
              <ChevronRight size={18} color="#D97706" />
            </LinearGradient>
          </PressableScale>
        )}

        {/* Hero 3D Gradient Card — Numbers as heroes with 100% data precision */}
        <GradientCard
          loanAmount={totalLoanAmount}
          paidAmount={paidAmount}
          nextEmiAmount={earliestDueEmi ? Number(earliestDueEmi.amount || 0) : customer.emi_amount}
          nextDueDate={formattedDueDate}
          daysLeft={daysLeft}
          tenureMonths={totalEmisCount}
          paidMonths={paidEmis.length}
          onPayPress={handlePayUpi}
        />

        {/* Living Outstanding Dues Jelly Card (when dues exist) */}
        {totalDue > 0 && (
          <View style={styles.dueAlertCardContainer}>
            <JellyCard
              accentColor="#EF4444"
              onPress={handlePayUpi}
              style={styles.dueJellyCard}
            >
              <View style={styles.dueCardHeader}>
                <View style={styles.dueCardBadgeRow}>
                  <View style={styles.dueWarningDot} />
                  <Text style={styles.dueCardBadgeText}>AMOUNT DUE NOW</Text>
                </View>
                {customerCodeOf(customer) ? (
                  <View style={styles.customerCodePill}>
                    <Text style={styles.customerCodeText}>{customerCodeOf(customer)}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.dueAmountRow}>
                <View>
                  <CountUp
                    end={totalDue}
                    prefix="₹"
                    style={styles.dueAmountHero}
                    duration={800}
                  />
                  <Text style={styles.dueSubtitle}>
                    {dueEmis.length > 1
                      ? `${dueEmis.length} EMIs overdue • `
                      : earliestDueEmi
                      ? `EMI #${earliestDueEmi.emi_no} • `
                      : ''}
                    Pay before due date
                  </Text>
                </View>

                <PressableScale onPress={handlePayUpi} style={styles.duePayCtaPill} scaleTo={0.92}>
                  <Zap size={14} color="#FFFFFF" />
                  <Text style={styles.duePayCtaText}>Pay Now</Text>
                </PressableScale>
              </View>

              {/* Breakdown chips */}
              <View style={styles.dueBreakdownChipsRow}>
                {emiDue > 0 && (
                  <View style={styles.dueMiniChip}>
                    <Text style={styles.dueMiniChipLabel}>EMI:</Text>
                    <Text style={styles.dueMiniChipValue}>₹{emiDue.toLocaleString('en-IN')}</Text>
                  </View>
                )}
                {totalFineRemaining > 0 && (
                  <View style={[styles.dueMiniChip, styles.dueMiniChipFine]}>
                    <Text style={styles.dueMiniChipLabelDanger}>Fine:</Text>
                    <Text style={styles.dueMiniChipValueDanger}>₹{totalFineRemaining.toLocaleString('en-IN')}</Text>
                  </View>
                )}
                {firstChargeDue > 0 && (
                  <View style={[styles.dueMiniChip, styles.dueMiniChipGold]}>
                    <Text style={styles.dueMiniChipLabelGold}>1st Chg:</Text>
                    <Text style={styles.dueMiniChipValueGold}>₹{firstChargeDue.toLocaleString('en-IN')}</Text>
                  </View>
                )}
              </View>
            </JellyCard>
          </View>
        )}

        {/* Quick Stats Mini Cards */}
        <View style={styles.quickStatsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickStatsScroll}
          >
            {/* Stat 1: Total Paid */}
            <JellyCard accentColor="#10B981" style={styles.statJellyCard}>
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
              <Text style={styles.statSubText}>{paidEmis.length} installments paid</Text>
            </JellyCard>

            {/* Stat 2: Remaining Balance */}
            <JellyCard accentColor="#1A6FD6" style={styles.statJellyCard}>
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
              <Text style={styles.statSubText}>{unpaidEmis.length} EMIs left</Text>
            </JellyCard>

            {/* Stat 3: Tenure Progress */}
            <JellyCard accentColor="#4F46E5" style={styles.statJellyCard}>
              <View style={styles.statHeaderRow}>
                <View style={[styles.statDot, { backgroundColor: '#4F46E5' }]} />
                <Text style={styles.statLabelText}>LOAN TENURE</Text>
              </View>
              <Text style={[styles.statNumberText, { color: '#4F46E5' }]}>
                {paidEmis.length}/{totalEmisCount}
              </Text>
              <Text style={styles.statSubText}>
                {Math.round((paidEmis.length / totalEmisCount) * 100)}% completed
              </Text>
            </JellyCard>
          </ScrollView>
        </View>

        {/* Action Dock */}
        <View style={styles.actionDock}>
          <PressableScale
            style={[styles.actionBtn, styles.actionBtnPrimary]}
            onPress={handlePayUpi}
            scaleTo={0.92}
          >
            <Zap size={17} color="#FFFFFF" />
            <Text style={styles.actionBtnPrimaryText}>Pay EMI</Text>
          </PressableScale>

          <PressableScale
            style={[styles.actionBtn, styles.actionBtnQr]}
            onPress={handlePayUpi}
            scaleTo={0.92}
          >
            <QrCode size={17} color="#1A6FD6" />
            <Text style={styles.actionBtnQrText}>Show QR</Text>
          </PressableScale>

          <PressableScale
            style={styles.actionBtnSecondary}
            onPress={() => navigation.navigate('EmiSchedule')}
            scaleTo={0.92}
          >
            <Calendar size={17} color="#1A6FD6" />
            <Text style={styles.actionBtnSecondaryText}>Schedule</Text>
          </PressableScale>

          <PressableScale
            style={styles.actionBtnIcon}
            onPress={() => Linking.openURL('tel:7003617029')}
            scaleTo={0.88}
          >
            <PhoneCall size={18} color="#0F172A" />
          </PressableScale>
        </View>

        {/* Next 3 Installments Activity Feed */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>MONTHLY INSTALLMENTS</Text>
            <TouchableOpacity onPress={() => navigation.navigate('EmiSchedule')}>
              <Text style={styles.seeAllText}>View All ({emis.length}) →</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.installmentsList}>
            {sortedEmis.slice(0, 3).map(emi => {
              const paid = isEmiPaid(emi);
              const isOverdue = !paid && new Date(emi.due_date) < new Date();

              return (
                <PressableScale
                  key={emi.id}
                  style={[
                    styles.installmentItem,
                    paid && styles.installmentItemPaid,
                    isOverdue && styles.installmentItemOverdue,
                  ]}
                  onPress={() => {
                    if (paid) setReceiptEmi(emi);
                    else handlePayUpi();
                  }}
                  scaleTo={0.97}
                >
                  <View style={styles.installmentLeft}>
                    <View
                      style={[
                        styles.installmentIconBox,
                        paid && styles.iconBoxPaid,
                        isOverdue && styles.iconBoxOverdue,
                      ]}
                    >
                      {paid ? (
                        <Check size={16} color="#059669" />
                      ) : isOverdue ? (
                        <AlertCircle size={16} color="#DC2626" />
                      ) : (
                        <Clock size={16} color="#1A6FD6" />
                      )}
                    </View>

                    <View>
                      <Text style={styles.installmentTitle}>Installment #{emi.emi_no}</Text>
                      <Text style={styles.installmentDate}>
                        {paid && emi.paid_at
                          ? `Paid on ${new Date(emi.paid_at).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                            })}`
                          : `Due on ${new Date(emi.due_date).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                            })}`}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.installmentRight}>
                    <Text style={styles.installmentAmount}>
                      ₹{(emi.amount || customer.emi_amount).toLocaleString('en-IN')}
                    </Text>

                    {paid ? (
                      <View style={styles.receiptActionRow}>
                        <Receipt size={12} color="#059669" />
                        <Text style={styles.receiptActionText}>Receipt</Text>
                      </View>
                    ) : (
                      <View style={styles.payActionRow}>
                        <Zap size={12} color="#1A6FD6" />
                        <Text style={styles.payActionText}>Pay</Text>
                      </View>
                    )}
                  </View>
                </PressableScale>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Switch Active Loan Modal (QA Audit 2 Match) */}
      <Modal visible={switchModalVisible} transparent animationType="slide" onRequestClose={() => setSwitchModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Switch Financed Device</Text>
                <Text style={styles.modalSubtitle}>Select which loan to manage on this phone</Text>
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

      {/* Account Options Quick Menu */}
      <Modal visible={accountMenuVisible} transparent animationType="fade" onRequestClose={() => setAccountMenuVisible(false)}>
        <TouchableOpacity
          activeOpacity={1}
          style={styles.menuOverlay}
          onPress={() => setAccountMenuVisible(false)}
        >
          <View style={[styles.menuSheet, { top: topInset + 60 }]}>
            <Text style={styles.menuHeaderTitle}>Account Options</Text>

            {allLoans.length > 1 && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setAccountMenuVisible(false);
                  setSwitchModalVisible(true);
                }}
              >
                <Smartphone size={16} color="#1A6FD6" />
                <Text style={styles.menuItemText}>Switch Financed Device ({allLoans.length})</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setAccountMenuVisible(false);
                switchCustomerLogin();
              }}
            >
              <User size={16} color="#1A6FD6" />
              <Text style={styles.menuItemText}>Log in as Another Customer</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setAccountMenuVisible(false);
                switchRole('staff');
              }}
            >
              <Zap size={16} color="#4F46E5" />
              <Text style={styles.menuItemText}>Switch to Staff Mode (Retailer/Admin)</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Interactive Payment Intent & Dynamic QR Modal */}
      <PaymentModal
        visible={paymentModalVisible}
        onClose={() => setPaymentModalVisible(false)}
        customer={customer}
        emis={emis}
        breakdown={breakdown}
      />

      {/* Receipt Modal */}
      {receiptEmi && (
        <ReceiptModal
          visible={!!receiptEmi}
          onClose={() => setReceiptEmi(null)}
          customer={customer}
          emi={receiptEmi}
        />
      )}

      {/* Broadcast Modal */}
      {activeBroadcast && (
        <BroadcastModal
          visible={!!activeBroadcast}
          onClose={() => setActiveBroadcast(null)}
          broadcast={activeBroadcast}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingBottom: 40,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
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
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  kycShield: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.full,
  },
  kycText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#059669',
  },
  customerName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  switchLoanPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
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
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  accountActionPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A6FD6',
  },
  retailerPill: {
    alignItems: 'flex-end',
  },
  retailerLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  retailerName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    maxWidth: 120,
  },
  broadcastBanner: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    borderRadius: Radius.lg,
    overflow: 'hidden',
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
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  broadcastTextCol: {
    flex: 1,
  },
  broadcastTag: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.5,
  },
  broadcastMessage: {
    fontSize: 12,
    fontWeight: '600',
    color: '#78350F',
    marginTop: 1,
  },
  dueAlertCardContainer: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
  },
  dueJellyCard: {
    padding: 14,
  },
  dueCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dueCardBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dueWarningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  dueCardBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.6,
  },
  customerCodePill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  customerCodeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1A6FD6',
  },
  dueAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  dueAmountHero: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
  },
  dueSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  duePayCtaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EF4444',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  duePayCtaText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  dueBreakdownChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  dueMiniChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dueMiniChipFine: {
    backgroundColor: '#FEF2F2',
  },
  dueMiniChipGold: {
    backgroundColor: '#FFFBEB',
  },
  dueMiniChipLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  dueMiniChipValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  dueMiniChipLabelDanger: {
    fontSize: 10,
    fontWeight: '600',
    color: '#EF4444',
  },
  dueMiniChipValueDanger: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  dueMiniChipLabelGold: {
    fontSize: 10,
    fontWeight: '600',
    color: '#D97706',
  },
  dueMiniChipValueGold: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  quickStatsContainer: {
    marginTop: Spacing.md,
  },
  quickStatsScroll: {
    paddingHorizontal: Spacing.xl,
    gap: 12,
  },
  statJellyCard: {
    width: 144,
    padding: 14,
  },
  statHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  statDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statLabelText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  statNumberText: {
    fontSize: 18,
    fontWeight: '800',
  },
  statSubText: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 4,
  },
  actionDock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
  },
  actionBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionBtnPrimary: {
    backgroundColor: '#1A6FD6',
    shadowColor: '#1A6FD6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  actionBtnPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  actionBtnQr: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
  },
  actionBtnQrText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A6FD6',
  },
  actionBtnSecondary: {
    height: 48,
    paddingHorizontal: 16,
    borderRadius: Radius.lg,
    backgroundColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionBtnSecondaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A6FD6',
  },
  actionBtnIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.lg,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionContainer: {
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.xl,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A6FD6',
  },
  installmentsList: {
    gap: 10,
  },
  installmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  installmentItemPaid: {
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  installmentItemOverdue: {
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  installmentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  installmentIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxPaid: {
    backgroundColor: '#ECFDF5',
  },
  iconBoxOverdue: {
    backgroundColor: '#FEF2F2',
  },
  installmentTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  installmentDate: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  installmentRight: {
    alignItems: 'flex-end',
  },
  installmentAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  receiptActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  receiptActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  payActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  payActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A6FD6',
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
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
  },
  menuSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: 12,
    width: 250,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  menuHeaderTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
    paddingHorizontal: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  menuItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
});
