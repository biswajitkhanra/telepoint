import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Receipt,
  Calendar,
  Layers,
  ChevronRight,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { Card3D } from '../components/Card3D';
import { ReceiptModal } from '../components/ReceiptModal';
import { EMIScheduleItem } from '../types';
import { THEME } from '../config';

type FilterTab = 'ALL' | 'PENDING' | 'PAID';

export const EmiScheduleScreen = () => {
  const { customer, emis, refreshData } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [selectedReceiptEmi, setSelectedReceiptEmi] = useState<EMIScheduleItem | null>(null);

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refreshData();
    setRefreshing(false);
  };

  const formatInr = (n: number) =>
    `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;

  const paidEmis = emis.filter(e => e.status === 'APPROVED');
  const unpaidEmis = emis.filter(e => e.status !== 'APPROVED');

  const filteredEmis =
    activeTab === 'ALL'
      ? emis
      : activeTab === 'PAID'
      ? paidEmis
      : unpaidEmis;

  const totalPaidAmount = paidEmis.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalUnpaidAmount = unpaidEmis.reduce(
    (sum, e) => sum + Math.max(0, Number(e.amount || 0) - Number(e.partial_paid_amount || 0)),
    0
  );

  const renderEmiItem = ({ item, index }: { item: EMIScheduleItem; index: number }) => {
    const isPaid = item.status === 'APPROVED';
    const isPartial = item.status === 'PARTIALLY_PAID';
    const isPending = item.status === 'PENDING_APPROVAL';

    return (
      <View style={styles.timelineRow}>
        {/* Left Timeline Stem & Node */}
        <View style={styles.timelineCol}>
          <View
            style={[
              styles.timelineDot,
              isPaid
                ? styles.dotPaid
                : isPartial
                ? styles.dotPartial
                : styles.dotUnpaid,
            ]}
          >
            {isPaid ? (
              <CheckCircle2 size={12} color="#FFFFFF" />
            ) : isPartial ? (
              <Clock size={12} color="#FFFFFF" />
            ) : (
              <View style={styles.dotInner} />
            )}
          </View>
          {index < filteredEmis.length - 1 && <View style={styles.timelineLine} />}
        </View>

        {/* Right Content Card */}
        <View style={styles.cardCol}>
          <Card3D
            style={styles.emiCard}
            gradientColors={isPaid ? ['#FFFFFF', '#F0FDF4'] : ['#FFFFFF', '#F8FAFC']}
            onPress={() => {
              if (isPaid) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedReceiptEmi(item);
              }
            }}
          >
            <View style={styles.cardHeader}>
              <View style={styles.emiNoPill}>
                <Text style={styles.emiNoText}>INSTALLMENT #{item.emi_no}</Text>
              </View>

              {isPaid ? (
                <View style={[styles.statusBadge, styles.badgePaid]}>
                  <CheckCircle2 size={11} color="#059669" />
                  <Text style={styles.textPaid}>PAID</Text>
                </View>
              ) : isPartial ? (
                <View style={[styles.statusBadge, styles.badgePartial]}>
                  <Clock size={11} color="#D97706" />
                  <Text style={styles.textPartial}>PARTIAL</Text>
                </View>
              ) : isPending ? (
                <View style={[styles.statusBadge, styles.badgePending]}>
                  <Clock size={11} color="#2563EB" />
                  <Text style={styles.textPending}>VERIFYING</Text>
                </View>
              ) : (
                <View style={[styles.statusBadge, styles.badgeUnpaid]}>
                  <Text style={styles.textUnpaid}>UPCOMING</Text>
                </View>
              )}
            </View>

            <View style={styles.amountRow}>
              <View>
                <Text style={styles.amountLabel}>AMOUNT</Text>
                <Text style={styles.amountValue}>{formatInr(item.amount)}</Text>
              </View>

              <View style={styles.dueCol}>
                <View style={styles.calendarRow}>
                  <Calendar size={11} color="#64748B" />
                  <Text style={styles.dueDateLabel}>DUE DATE</Text>
                </View>
                <Text style={styles.dueDateValue}>{item.due_date}</Text>
              </View>
            </View>

            {/* Overdue Fine Notice */}
            {item.fine_amount > 0 && (
              <View style={styles.fineBox}>
                <AlertTriangle size={12} color="#DC2626" />
                <Text style={styles.fineText}>
                  Late Fine: {formatInr(item.fine_amount)}{' '}
                  {item.fine_waived ? '(Waived)' : '(Pending)'}
                </Text>
              </View>
            )}

            {/* Tap for Slip Prompt for paid installments */}
            {isPaid && (
              <View style={styles.slipFooter}>
                <Receipt size={12} color="#059669" />
                <Text style={styles.slipFooterText}>View Official Slip</Text>
                <ChevronRight size={12} color="#059669" />
              </View>
            )}
          </Card3D>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Amortization Summary Card */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View>
              <Text style={styles.summaryLabel}>PAID EMIs</Text>
              <Text style={styles.paidVal}>{formatInr(totalPaidAmount)}</Text>
              <Text style={styles.summarySub}>
                {paidEmis.length} of {emis.length} Completed
              </Text>
            </View>
            <View style={styles.verticalSep} />
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.summaryLabel}>REMAINING</Text>
              <Text style={styles.unpaidVal}>{formatInr(totalUnpaidAmount)}</Text>
              <Text style={styles.summarySub}>
                {unpaidEmis.length} Installments Left
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Segmented Filter Controls */}
      <View style={styles.tabsWrapper}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab('ALL');
          }}
          style={[styles.tabBtn, activeTab === 'ALL' && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === 'ALL' && styles.tabTextActive]}>
            All ({emis.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab('PENDING');
          }}
          style={[styles.tabBtn, activeTab === 'PENDING' && styles.tabActive]}
        >
          <Text
            style={[styles.tabText, activeTab === 'PENDING' && styles.tabTextActive]}
          >
            Pending ({unpaidEmis.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab('PAID');
          }}
          style={[styles.tabBtn, activeTab === 'PAID' && styles.tabActive]}
        >
          <Text
            style={[styles.tabText, activeTab === 'PAID' && styles.tabTextActive]}
          >
            Paid ({paidEmis.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* FlatList Installment Timeline */}
      <FlatList
        data={filteredEmis}
        keyExtractor={item => item.id}
        renderItem={renderEmiItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={THEME.accent.primary}
            colors={[THEME.accent.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Receipt Modal */}
      <ReceiptModal
        visible={!!selectedReceiptEmi}
        emi={selectedReceiptEmi}
        customer={customer}
        onClose={() => setSelectedReceiptEmi(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg.darkest, // #F8FAFC
  },
  summaryContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  verticalSep: {
    width: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
  },
  summaryLabel: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  paidVal: {
    color: '#059669',
    fontSize: 20,
    fontWeight: '900',
  },
  unpaidVal: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '900',
  },
  summarySub: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  tabsWrapper: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  timelineRow: {
    flexDirection: 'row',
  },
  timelineCol: {
    alignItems: 'center',
    width: 24,
    marginRight: 10,
  },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    zIndex: 2,
  },
  dotPaid: {
    borderColor: '#10B981',
    backgroundColor: '#10B981',
  },
  dotPartial: {
    borderColor: '#F59E0B',
    backgroundColor: '#F59E0B',
  },
  dotUnpaid: {
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  dotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#94A3B8',
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    marginVertical: 4,
  },
  cardCol: {
    flex: 1,
    marginBottom: 12,
  },
  emiCard: {
    borderRadius: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  emiNoPill: {
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  emiNoText: {
    color: '#2563EB',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgePaid: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  badgePartial: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  badgePending: {
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
  badgeUnpaid: {
    backgroundColor: '#F1F5F9',
  },
  textPaid: {
    color: '#059669',
    fontSize: 10,
    fontWeight: '800',
  },
  textPartial: {
    color: '#D97706',
    fontSize: 10,
    fontWeight: '800',
  },
  textPending: {
    color: '#2563EB',
    fontSize: 10,
    fontWeight: '800',
  },
  textUnpaid: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  amountLabel: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  amountValue: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  dueCol: {
    alignItems: 'flex-end',
  },
  calendarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dueDateLabel: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '700',
  },
  dueDateValue: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  fineBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    marginTop: 10,
  },
  fineText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '700',
  },
  slipFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15, 23, 42, 0.05)',
  },
  slipFooterText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '800',
    flex: 1,
  },
});
