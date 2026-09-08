// screens/EmiScheduleScreen.tsx
// Full month-by-month EMI schedule with IDFC clarity, filter chips & EMIRow drawer
// 100% Data Precision + Squash & Stretch Jelly Interactions

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Haptics } from '../utils/haptics';
import { Zap } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { EMIRow } from '../components/EMIRow';
import { CountUp } from '../components/CountUp';
import { ReceiptModal } from '../components/ReceiptModal';
import { PaymentModal } from '../components/PaymentModal';
import { JellyCard } from '../components/JellyCard';
import { PressableScale } from '../components/PressableScale';
import { EMIScheduleItem } from '../types';
import { Colors } from '../constants/colors';
import { Spacing, Radius } from '../constants/design';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { calculateTotalFineFromEmis } from '../utils/fineCalc';
import { firstChargeRemaining } from '../utils/firstCharge';

type FilterTab = 'ALL' | 'DUE' | 'PAID';

export const EmiScheduleScreen = () => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, StatusBar.currentHeight || 28);
  const { customer, emis, breakdown, refreshData } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [selectedReceiptEmi, setSelectedReceiptEmi] = useState<EMIScheduleItem | null>(null);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refreshData();
    setRefreshing(false);
  };

  const isEmiPaid = (e: EMIScheduleItem) =>
    e.status === 'collected' || e.status === 'APPROVED' || !!e.paid_at;

  const sortedEmis = useMemo(() => {
    return [...emis].sort(
      (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    );
  }, [emis]);

  const paidEmis = sortedEmis.filter(isEmiPaid);
  const unpaidEmis = sortedEmis.filter(e => !isEmiPaid(e));

  const filteredEmis =
    activeTab === 'ALL'
      ? sortedEmis
      : activeTab === 'PAID'
      ? paidEmis
      : unpaidEmis;

  // Accurate settled sum
  const totalPaidAmount = emis.reduce(
    (sum, e) =>
      isEmiPaid(e)
        ? sum + Number(e.amount || 0)
        : sum + Math.max(0, Number(e.partial_paid_amount || 0)),
    0
  );

  // Accurate remaining EMI principal + fines + 1st charge
  const totalFineRemaining = useMemo(() => calculateTotalFineFromEmis(emis), [emis]);
  const firstChargeDue = useMemo(() => firstChargeRemaining(customer), [customer]);
  const emiOutstanding = unpaidEmis.reduce(
    (sum, e) => sum + Math.max(0, Number(e.amount || 0) - Number(e.partial_paid_amount || 0)),
    0
  );
  const totalOutstanding = emiOutstanding + totalFineRemaining + firstChargeDue;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top Header with Notch Inset */}
      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View>
          <Text style={styles.headerTitle}>EMI Schedule</Text>
          <Text style={styles.headerSub}>
            Track and pay your monthly installments
          </Text>
        </View>
        <View style={styles.tenurePill}>
          <Text style={styles.tenurePillText}>
            {paidEmis.length}/{customer?.emi_tenure || emis.length} Months
          </Text>
        </View>
      </View>

      {/* Summary Jelly Card */}
      <View style={styles.summaryContainer}>
        <JellyCard accentColor="#1A6FD6" style={styles.summaryJellyCard} mountDelay={150}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>TOTAL PAID</Text>
              <CountUp
                end={totalPaidAmount}
                prefix="₹"
                style={[styles.summaryValue, { color: '#059669' }]}
                duration={700}
              />
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>REMAINING</Text>
              <CountUp
                end={totalOutstanding}
                prefix="₹"
                style={[styles.summaryValue, { color: '#1A6FD6' }]}
                duration={700}
              />
            </View>
          </View>
        </JellyCard>

        {unpaidEmis.length > 0 && customer && (
          <PressableScale
            style={styles.payDuesBanner}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setPaymentModalVisible(true);
            }}
            scaleTo={0.94}
          >
            <View style={styles.payDuesLeft}>
              <Zap size={16} color="#FFFFFF" />
              <Text style={styles.payDuesText}>Pay Due EMI via UPI / QR</Text>
            </View>
            <Text style={styles.payDuesCta}>Pay Now ➔</Text>
          </PressableScale>
        )}
      </View>

      {/* Filter Tabs with Jelly Touch */}
      <View style={styles.filterBar}>
        <PressableScale
          style={[styles.filterChip, activeTab === 'ALL' && styles.filterChipActive]}
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab('ALL');
          }}
          scaleTo={0.92}
        >
          <Text
            style={[
              styles.filterChipText,
              activeTab === 'ALL' && styles.filterChipTextActive,
            ]}
          >
            All ({emis.length})
          </Text>
        </PressableScale>

        <PressableScale
          style={[styles.filterChip, activeTab === 'DUE' && styles.filterChipActiveDue]}
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab('DUE');
          }}
          scaleTo={0.92}
        >
          <Text
            style={[
              styles.filterChipText,
              activeTab === 'DUE' && styles.filterChipTextDue,
            ]}
          >
            Pending ({unpaidEmis.length})
          </Text>
        </PressableScale>

        <PressableScale
          style={[styles.filterChip, activeTab === 'PAID' && styles.filterChipActivePaid]}
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab('PAID');
          }}
          scaleTo={0.92}
        >
          <Text
            style={[
              styles.filterChipText,
              activeTab === 'PAID' && styles.filterChipTextPaid,
            ]}
          >
            Collected ({paidEmis.length})
          </Text>
        </PressableScale>
      </View>

      {/* EMI Rows List */}
      <FlatList
        data={filteredEmis}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary, Colors.success]}
          />
        }
        renderItem={({ item, index }) => (
          <Animated.View
            entering={FadeInDown.delay(Math.min(index, 10) * 45).springify().damping(14).stiffness(110).mass(0.7)}
          >
            <EMIRow
              item={item}
              index={index}
              onReceiptPress={() => setSelectedReceiptEmi(item)}
            />
          </Animated.View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No installments found for this filter</Text>
          </View>
        }
      />

      {/* Receipt Modal */}
      {selectedReceiptEmi && customer && (
        <ReceiptModal
          visible={!!selectedReceiptEmi}
          onClose={() => setSelectedReceiptEmi(null)}
          customer={customer}
          emi={selectedReceiptEmi}
        />
      )}

      {/* Payment Modal */}
      {customer && (
        <PaymentModal
          visible={paymentModalVisible}
          onClose={() => setPaymentModalVisible(false)}
          customer={customer}
          emis={emis}
          breakdown={breakdown}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  tenurePill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  tenurePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A6FD6',
  },
  summaryContainer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
  },
  summaryJellyCard: {
    padding: 0,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  summaryCol: {
    alignItems: 'center',
    flex: 1,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 19,
    fontWeight: '800',
  },
  summaryDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#E2E8F0',
  },
  payDuesBanner: {
    marginTop: 10,
    backgroundColor: '#1A6FD6',
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#1A6FD6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  payDuesLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  payDuesText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  payDuesCta: {
    fontSize: 12,
    fontWeight: '800',
    color: '#EFF6FF',
  },
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  filterChipActiveDue: {
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
  },
  filterChipActivePaid: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  filterChipTextDue: {
    color: '#EF4444',
    fontWeight: '700',
  },
  filterChipTextPaid: {
    color: '#059669',
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: 40,
    gap: 10,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
});
