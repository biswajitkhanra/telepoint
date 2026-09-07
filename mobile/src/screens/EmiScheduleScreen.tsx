// screens/EmiScheduleScreen.tsx
// Full month-by-month EMI schedule with IDFC clarity, filter chips & EMIRow drawer

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Calendar, Filter, CheckCircle2, Clock } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { EMIRow } from '../components/EMIRow';
import { CountUp } from '../components/CountUp';
import { ReceiptModal } from '../components/ReceiptModal';
import { EMIScheduleItem } from '../types';
import { Colors } from '../constants/colors';
import { Spacing, Radius, Shadow } from '../constants/design';

type FilterTab = 'ALL' | 'DUE' | 'PAID';

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

  const isEmiPaid = (e: EMIScheduleItem) =>
    e.status === 'collected' || e.status === 'APPROVED' || !!e.paid_at;

  const paidEmis = emis.filter(isEmiPaid);
  const unpaidEmis = emis.filter(e => !isEmiPaid(e));

  const filteredEmis =
    activeTab === 'ALL'
      ? emis
      : activeTab === 'PAID'
      ? paidEmis
      : unpaidEmis;

  const totalPaidAmount = paidEmis.reduce(
    (sum, e) => sum + (e.amount || 0) + (e.fine_paid_amount || 0),
    0
  );

  const totalOutstanding = unpaidEmis.reduce(
    (sum, e) => sum + Math.max(0, (e.amount || 0) - (e.partial_paid_amount || 0)),
    0
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Screen Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>EMI Schedule</Text>
          <Text style={styles.headerSub}>
            Complete installment breakdown & ledger
          </Text>
        </View>
        <View style={styles.tenurePill}>
          <Text style={styles.tenurePillText}>
            {paidEmis.length}/{customer?.emi_tenure || emis.length} Months
          </Text>
        </View>
      </View>

      {/* Summary Stat Card */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>TOTAL SETTLED</Text>
            <CountUp
              end={totalPaidAmount}
              prefix="₹"
              style={[styles.summaryValue, { color: '#059669' }]}
              duration={700}
            />
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>TOTAL OUTSTANDING</Text>
            <CountUp
              end={totalOutstanding}
              prefix="₹"
              style={[styles.summaryValue, { color: '#1A6FD6' }]}
              duration={700}
            />
          </View>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterBar}>
        <TouchableOpacity
          style={[styles.filterChip, activeTab === 'ALL' && styles.filterChipActive]}
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab('ALL');
          }}
        >
          <Text
            style={[
              styles.filterChipText,
              activeTab === 'ALL' && styles.filterChipTextActive,
            ]}
          >
            All ({emis.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, activeTab === 'DUE' && styles.filterChipActive]}
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab('DUE');
          }}
        >
          <Text
            style={[
              styles.filterChipText,
              activeTab === 'DUE' && styles.filterChipTextActive,
            ]}
          >
            Due / Upcoming ({unpaidEmis.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, activeTab === 'PAID' && styles.filterChipActive]}
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab('PAID');
          }}
        >
          <Text
            style={[
              styles.filterChipText,
              activeTab === 'PAID' && styles.filterChipTextActive,
            ]}
          >
            Settled ({paidEmis.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Schedule FlatList */}
      <FlatList
        data={filteredEmis}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => (
          <EMIRow
            item={item}
            index={index}
            onReceiptPress={emi => setSelectedReceiptEmi(emi)}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#1A6FD6']}
            tintColor="#1A6FD6"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Calendar size={44} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No Installments in this Filter</Text>
            <Text style={styles.emptySub}>
              Switch filters to view all scheduled or settled payments.
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  tenurePill: {
    backgroundColor: '#EFF5FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(26, 111, 214, 0.2)',
  },
  tenurePillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1A6FD6',
  },
  summaryContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  summaryCard: {
    flexDirection: 'row',
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
  summaryCol: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#1A6FD6',
    borderColor: '#1A6FD6',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 40,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 12,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
  },
});
