// screens/PaymentHistoryScreen.tsx
// IDFC clarity + Jupiter numbers as hero: All collected payments with CountUp totals & receipts
// 100% Data Fidelity (Fixing APPROVED status matching database) + Squash & Stretch Jelly Physics

import React, { useState } from 'react';
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
import {
  CheckCircle2,
  Calendar,
  Receipt,
  ShieldCheck,
  Zap,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/AuthContext';
import { CountUp } from '../components/CountUp';
import { ReceiptModal } from '../components/ReceiptModal';
import { JellyCard } from '../components/JellyCard';
import { PressableScale } from '../components/PressableScale';
import { EMIScheduleItem } from '../types';
import { Colors } from '../constants/colors';
import { Spacing, Radius } from '../constants/design';

export const PaymentHistoryScreen = () => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, StatusBar.currentHeight || 28);
  const { customer, emis, refreshData } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedReceiptEmi, setSelectedReceiptEmi] = useState<EMIScheduleItem | null>(null);

  // 100% Data Accurate Filter: includes APPROVED, collected, paid_at, and PARTIALLY_PAID
  const isPaid = (e: EMIScheduleItem) =>
    e.status === 'APPROVED' ||
    e.status === 'collected' ||
    !!e.paid_at ||
    e.status === 'PARTIALLY_PAID' ||
    Number(e.partial_paid_amount || 0) > 0;

  const collectedEmis = emis
    .filter(isPaid)
    .sort((a, b) => {
      const dateA = a.paid_at ? new Date(a.paid_at).getTime() : 0;
      const dateB = b.paid_at ? new Date(b.paid_at).getTime() : 0;
      return dateB - dateA;
    });

  const totalCollectedAmount = collectedEmis.reduce(
    (sum, item) =>
      sum +
      (item.status === 'APPROVED' || item.status === 'collected'
        ? Number(item.amount || 0)
        : Number(item.partial_paid_amount || 0)) +
      Number(item.fine_paid_amount || 0),
    0
  );

  const handleRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  };

  const renderPaymentItem = ({ item }: { item: EMIScheduleItem; index: number }) => {
    const formattedPaidDate = item.paid_at
      ? (() => {
          try {
            return new Date(item.paid_at).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });
          } catch {
            return item.paid_at;
          }
        })()
      : 'Verified Payment';

    const isPartial = item.status === 'PARTIALLY_PAID';
    const amountToShow =
      item.status === 'APPROVED' || item.status === 'collected'
        ? item.amount
        : item.partial_paid_amount || item.amount;

    return (
      <PressableScale
        onPress={() => {
          Haptics.selectionAsync();
          setSelectedReceiptEmi(item);
        }}
        style={styles.paymentCard}
        scaleTo={0.96}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.iconCircle, isPartial && styles.iconCirclePartial]}>
            <CheckCircle2 size={20} color={isPartial ? '#D97706' : '#059669'} />
          </View>
          <View style={styles.cardDetails}>
            <Text style={styles.paymentTitle}>Installment #{item.emi_no}</Text>
            <View style={styles.dateRow}>
              <Calendar size={12} color="#64748B" />
              <Text style={styles.dateText}>{formattedPaidDate}</Text>
            </View>
          </View>

          <View style={styles.amountCol}>
            <Text style={styles.amountText}>
              ₹{amountToShow.toLocaleString('en-IN')}
            </Text>
            <View style={[styles.verifiedTag, isPartial && styles.verifiedTagPartial]}>
              <ShieldCheck size={11} color={isPartial ? '#D97706' : '#059669'} />
              <Text style={[styles.verifiedTagText, isPartial && styles.verifiedTagTextPartial]}>
                {isPartial ? 'PARTIAL' : 'SETTLED'}
              </Text>
            </View>
          </View>
        </View>

        {/* Footer meta */}
        <View style={styles.cardFooter}>
          <Text style={styles.modeText}>
            Mode: <Text style={styles.modeHighlight}>{(item.mode || 'UPI').toUpperCase()}</Text>
          </Text>
          {item.fine_paid_amount > 0 && (
            <Text style={styles.finePaidText}>
              +₹{item.fine_paid_amount} Fine Paid
            </Text>
          )}
          {item.utr ? (
            <Text style={styles.utrText} numberOfLines={1}>
              UTR: {item.utr}
            </Text>
          ) : null}
          <View style={styles.receiptAction}>
            <Receipt size={13} color="#1A6FD6" />
            <Text style={styles.receiptActionText}>Receipt</Text>
          </View>
        </View>
      </PressableScale>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Screen Header with Notch Inset */}
      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        <Text style={styles.headerTitle}>Payment History</Text>
        <Text style={styles.headerSub}>
          Verified EMI transactions & digital receipts
        </Text>
      </View>

      {/* Hero Summary Card */}
      <View style={styles.heroSummaryContainer}>
        <JellyCard accentColor="#059669" style={styles.heroJellyCard}>
          <View style={styles.heroSummaryCard}>
            <View style={styles.heroRow}>
              <View>
                <Text style={styles.heroLabel}>TOTAL COLLECTED</Text>
                <CountUp
                  end={totalCollectedAmount}
                  prefix="₹"
                  style={styles.heroValue}
                  duration={900}
                />
              </View>
              <View style={styles.heroCountPill}>
                <Text style={styles.heroCountText}>
                  {collectedEmis.length} Receipts
                </Text>
              </View>
            </View>

            <View style={styles.heroFooter}>
              <Text style={styles.heroFooterText}>
                All payments recorded directly in Telepoint Ledger
              </Text>
            </View>
          </View>
        </JellyCard>
      </View>

      {/* Payments List */}
      <FlatList
        data={collectedEmis}
        keyExtractor={item => item.id}
        renderItem={renderPaymentItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary, Colors.success]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Receipt size={38} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No Collections Yet</Text>
            <Text style={styles.emptySub}>
              Once installments are approved or paid via UPI, digital receipts will appear here.
            </Text>
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
  heroSummaryContainer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  heroJellyCard: {
    padding: 0,
  },
  heroSummaryCard: {
    padding: Spacing.lg,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  heroValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#059669',
    marginTop: 2,
  },
  heroCountPill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  heroCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  heroFooter: {
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  heroFooterText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: 40,
    gap: 10,
  },
  paymentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCirclePartial: {
    backgroundColor: '#FFFBEB',
  },
  cardDetails: {
    flex: 1,
    marginLeft: 12,
  },
  paymentTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  dateText: {
    fontSize: 11,
    color: '#64748B',
  },
  amountCol: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.full,
    marginTop: 2,
  },
  verifiedTagPartial: {
    backgroundColor: '#FFFBEB',
  },
  verifiedTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#059669',
  },
  verifiedTagTextPartial: {
    color: '#D97706',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  modeText: {
    fontSize: 11,
    color: '#64748B',
  },
  modeHighlight: {
    fontWeight: '700',
    color: '#1E293B',
  },
  finePaidText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  utrText: {
    fontSize: 11,
    color: '#94A3B8',
    maxWidth: 120,
  },
  receiptAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  receiptActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A6FD6',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 6,
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 30,
    lineHeight: 18,
  },
});
