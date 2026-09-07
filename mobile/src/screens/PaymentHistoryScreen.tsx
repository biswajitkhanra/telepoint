// screens/PaymentHistoryScreen.tsx
// IDFC clarity + Jupiter numbers as hero: All collected payments with CountUp totals & receipts

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CheckCircle2,
  Calendar,
  Receipt,
  Download,
  CreditCard,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/AuthContext';
import { CountUp } from '../components/CountUp';
import { ReceiptModal } from '../components/ReceiptModal';
import { EMIScheduleItem } from '../types';
import { Colors } from '../constants/colors';
import { Spacing, Radius, Shadow } from '../constants/design';

export const PaymentHistoryScreen = () => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight || 28 : 0);
  const { customer, emis, refreshData } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedReceiptEmi, setSelectedReceiptEmi] = useState<EMIScheduleItem | null>(null);

  const collectedEmis = emis
    .filter(e => e.status === 'collected')
    .sort((a, b) => {
      const dateA = a.paid_at ? new Date(a.paid_at).getTime() : 0;
      const dateB = b.paid_at ? new Date(b.paid_at).getTime() : 0;
      return dateB - dateA;
    });

  const totalCollectedAmount = collectedEmis.reduce(
    (sum, item) => sum + (item.amount || 0) + (item.fine_paid_amount || 0),
    0
  );

  const handleRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  };

  const renderPaymentItem = ({ item, index }: { item: EMIScheduleItem; index: number }) => {
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

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          Haptics.selectionAsync();
          setSelectedReceiptEmi(item);
        }}
        style={styles.paymentCard}
      >
        <View style={styles.cardHeader}>
          <View style={styles.iconCircle}>
            <CheckCircle2 size={20} color="#059669" />
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
              ₹{item.amount.toLocaleString('en-IN')}
            </Text>
            <View style={styles.verifiedTag}>
              <ShieldCheck size={11} color="#059669" />
              <Text style={styles.verifiedTagText}>SETTLED</Text>
            </View>
          </View>
        </View>

        {/* Footer meta */}
        <View style={styles.cardFooter}>
          <Text style={styles.modeText}>
            Mode: <Text style={styles.modeHighlight}>{(item.mode || 'UPI').toUpperCase()}</Text>
          </Text>
          {item.utr && (
            <Text style={styles.utrText} numberOfLines={1}>
              UTR: {item.utr}
            </Text>
          )}
          <View style={styles.receiptAction}>
            <Receipt size={13} color="#1A6FD6" />
            <Text style={styles.receiptActionText}>Receipt</Text>
          </View>
        </View>
      </TouchableOpacity>
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
        <View style={styles.heroSummaryCard}>
          <View style={styles.summaryTopRow}>
            <View style={styles.summaryLabelRow}>
              <TrendingUp size={16} color="#1A6FD6" />
              <Text style={styles.summaryLabel}>TOTAL REPAYMENT TO DATE</Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>
                {collectedEmis.length} Payments
              </Text>
            </View>
          </View>

          <CountUp
            end={totalCollectedAmount}
            prefix="₹"
            style={styles.heroAmount}
            duration={800}
          />

          <View style={styles.heroSubRow}>
            <Text style={styles.heroSubText}>
              Device: {customer?.model_no || 'Financed Smartphone'}
            </Text>
            <Text style={styles.heroSubTenure}>
              {collectedEmis.length}/{customer?.emi_tenure || emis.length} Settled
            </Text>
          </View>
        </View>
      </View>

      {/* Transactions List */}
      <FlatList
        data={collectedEmis}
        keyExtractor={item => item.id}
        renderItem={renderPaymentItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#1A6FD6']}
            tintColor="#1A6FD6"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <CreditCard size={48} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No Payments Collected Yet</Text>
            <Text style={styles.emptySub}>
              Once your first installment is paid and verified by your store retailer, your receipts will appear here.
            </Text>
          </View>
        }
      />

      {/* Digital Receipt Modal */}
      {selectedReceiptEmi && (
        <ReceiptModal
          visible={!!selectedReceiptEmi}
          emi={selectedReceiptEmi}
          customer={customer}
          onClose={() => setSelectedReceiptEmi(null)}
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
  heroSummaryContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  heroSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 3,
    shadowColor: '#1A6FD6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  summaryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A6FD6',
    letterSpacing: 0.6,
  },
  countBadge: {
    backgroundColor: '#EFF5FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(26, 111, 214, 0.2)',
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1A6FD6',
  },
  heroAmount: {
    fontSize: 34,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
    marginVertical: 4,
  },
  heroSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: Spacing.sm,
    marginTop: Spacing.sm,
  },
  heroSubText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  heroSubTenure: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 40,
  },
  paymentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  cardDetails: {
    flex: 1,
  },
  paymentTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  dateText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  amountCol: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    fontVariant: ['tabular-nums'],
  },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  verifiedTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
    paddingTop: Spacing.sm,
    marginTop: Spacing.sm,
  },
  modeText: {
    fontSize: 11,
    color: '#64748B',
  },
  modeHighlight: {
    fontWeight: '700',
    color: '#0F172A',
  },
  utrText: {
    fontSize: 10,
    color: '#64748B',
    maxWidth: 120,
    fontVariant: ['tabular-nums'],
  },
  receiptAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF5FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  receiptActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A6FD6',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },
});
