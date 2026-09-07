import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { CheckCircle2, Clock, AlertTriangle, ArrowDownRight, ShieldAlert } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { Card3D } from '../components/Card3D';
import { EMIScheduleItem } from '../types';
import { THEME } from '../config';

export const EmiScheduleScreen = () => {
  const { customer, emis, refreshData } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  };

  const formatInr = (n: number) =>
    `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;

  const paidCount = emis.filter(e => e.status === 'APPROVED').length;
  const totalPaidAmount = emis
    .filter(e => e.status === 'APPROVED')
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalUnpaidAmount = emis
    .filter(e => e.status !== 'APPROVED')
    .reduce((sum, e) => sum + Math.max(0, Number(e.amount || 0) - Number(e.partial_paid_amount || 0)), 0);

  const renderEmiItem = ({ item }: { item: EMIScheduleItem }) => {
    const isPaid = item.status === 'APPROVED';
    const isPartial = item.status === 'PARTIALLY_PAID';
    const isPending = item.status === 'PENDING_APPROVAL';

    return (
      <Card3D style={styles.emiCard}>
        <View style={styles.cardHeader}>
          <View style={styles.emiNoPill}>
            <Text style={styles.emiNoText}>EMI #{item.emi_no}</Text>
          </View>

          {isPaid ? (
            <View style={[styles.statusBadge, styles.badgePaid]}>
              <CheckCircle2 size={12} color="#10B981" />
              <Text style={[styles.statusText, { color: '#10B981' }]}>PAID</Text>
            </View>
          ) : isPartial ? (
            <View style={[styles.statusBadge, styles.badgePartial]}>
              <Clock size={12} color="#F59E0B" />
              <Text style={[styles.statusText, { color: '#F59E0B' }]}>PARTIAL</Text>
            </View>
          ) : isPending ? (
            <View style={[styles.statusBadge, styles.badgePending]}>
              <Clock size={12} color="#60A5FA" />
              <Text style={[styles.statusText, { color: '#60A5FA' }]}>VERIFYING</Text>
            </View>
          ) : (
            <View style={[styles.statusBadge, styles.badgeUnpaid]}>
              <Text style={[styles.statusText, { color: '#94A3B8' }]}>UNPAID</Text>
            </View>
          )}
        </View>

        <View style={styles.amountRow}>
          <View>
            <Text style={styles.amountLabel}>INSTALLMENT AMOUNT</Text>
            <Text style={styles.amountValue}>{formatInr(item.amount)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.dueDateLabel}>DUE DATE</Text>
            <Text style={styles.dueDateValue}>{item.due_date}</Text>
          </View>
        </View>

        {/* Partial payment details */}
        {isPartial && item.partial_paid_amount ? (
          <View style={styles.partialBox}>
            <ArrowDownRight size={14} color="#FBBF24" />
            <Text style={styles.partialText}>
              Paid {formatInr(item.partial_paid_amount)} · Balance {formatInr(item.amount - item.partial_paid_amount)} remaining
            </Text>
          </View>
        ) : null}

        {/* Paid receipt details */}
        {isPaid && (
          <View style={styles.paidDetailsRow}>
            <Text style={styles.paidDetailText}>
              Paid on: {item.paid_at ? new Date(item.paid_at).toLocaleDateString() : 'Confirmed'}
            </Text>
            {item.mode && (
              <Text style={styles.paidDetailText}>Mode: {item.mode}</Text>
            )}
            {item.utr && (
              <Text style={styles.paidDetailText} numberOfLines={1}>
                UTR: {item.utr}
              </Text>
            )}
          </View>
        )}

        {/* Late Fine Warning on this installment */}
        {item.fine_amount > 0 && (
          <View style={styles.fineBox}>
            <ShieldAlert size={14} color="#EF4444" />
            <Text style={styles.fineText}>
              Overdue Fine: {formatInr(item.fine_amount)}{' '}
              {item.fine_paid_amount >= item.fine_amount ? '(Fine Paid)' : '(Fine Pending)'}
            </Text>
          </View>
        )}
      </Card3D>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Portfolio Summary */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>PAID SO FAR</Text>
          <Text style={[styles.summaryValue, { color: '#10B981' }]}>
            {formatInr(totalPaidAmount)}
          </Text>
          <Text style={styles.summarySub}>{paidCount} Installments</Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>BALANCE DUE</Text>
          <Text style={[styles.summaryValue, { color: '#F59E0B' }]}>
            {formatInr(totalUnpaidAmount)}
          </Text>
          <Text style={styles.summarySub}>{emis.length - paidCount} Remaining</Text>
        </View>
      </View>

      <FlatList
        data={emis}
        keyExtractor={item => item.id}
        renderItem={renderEmiItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#3B82F6"
            colors={['#3B82F6']}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg.darkest,
  },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    marginHorizontal: 18,
    marginTop: 54,
    marginBottom: 14,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: 10,
  },
  summaryLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  summarySub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 30,
  },
  emiCard: {
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  emiNoPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  emiNoText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgePaid: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  badgePartial: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  badgePending: {
    backgroundColor: 'rgba(96, 165, 250, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.3)',
  },
  badgeUnpaid: {
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2,
  },
  amountValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  dueDateLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2,
  },
  dueDateValue: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  partialBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    padding: 8,
    borderRadius: 10,
    marginTop: 10,
  },
  partialText: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '500',
  },
  paidDetailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  paidDetailText: {
    color: '#64748B',
    fontSize: 11,
  },
  fineBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: 8,
    borderRadius: 10,
    marginTop: 8,
  },
  fineText: {
    color: '#FCA5A5',
    fontSize: 11,
    fontWeight: '600',
  },
});
