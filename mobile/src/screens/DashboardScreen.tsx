import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Smartphone,
  Phone,
  Megaphone,
  CreditCard,
  AlertTriangle,
  Receipt,
  HelpCircle,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { Card3D } from '../components/Card3D';
import { EmiHeroCard } from '../components/EmiHeroCard';
import { BroadcastModal } from '../components/BroadcastModal';
import { BroadcastItem } from '../types';
import { THEME } from '../config';

export const DashboardScreen = ({ navigation }: { navigation: any }) => {
  const { customer, emis, breakdown, broadcasts, refreshData, isLoading } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [activeBroadcast, setActiveBroadcast] = useState<BroadcastItem | null>(null);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  };

  if (!customer) return null;

  // Filter unpaid & paid EMIs
  const paidEmis = emis.filter(e => e.status === 'APPROVED');
  const unpaidEmis = emis.filter(e => e.status === 'UNPAID' || e.status === 'PARTIALLY_PAID');
  const nextEmi = unpaidEmis.length > 0 ? unpaidEmis[0] : null;

  // Format currency
  const formatInr = (n: number) =>
    `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;

  // First EMI charge remaining
  const firstChargeRemaining = Math.max(
    0,
    Number(customer.first_emi_charge_amount || 0) - Number(customer.first_emi_charge_paid_amount || 0)
  );

  // Total payable
  const totalPayable =
    (breakdown?.total_payable ??
      (nextEmi?.amount || 0) + (breakdown?.fine_due || 0) + firstChargeRemaining);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#3B82F6"
            colors={['#3B82F6']}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header */}
        <View style={styles.topHeader}>
          <View>
            <Text style={styles.greetingText}>Welcome back,</Text>
            <Text style={styles.customerName}>{customer.customer_name}</Text>
          </View>
          <View style={styles.retailerPill}>
            <Text style={styles.retailerLabel}>RETAILER</Text>
            <Text style={styles.retailerName} numberOfLines={1}>
              {customer.retailer?.name || 'Telepoint Partner'}
            </Text>
          </View>
        </View>

        {/* Live Broadcast Banner (if any) */}
        {broadcasts.length > 0 && (
          <TouchableOpacity
            activeOpacity={0.88}
            style={styles.broadcastBanner}
            onPress={() => setActiveBroadcast(broadcasts[0])}
          >
            <LinearGradient
              colors={['rgba(245, 158, 11, 0.2)', 'rgba(217, 119, 6, 0.1)']}
              style={styles.broadcastGradient}
            >
              <Megaphone size={16} color="#FBBF24" />
              <Text style={styles.broadcastText} numberOfLines={1}>
                {broadcasts[0].message}
              </Text>
              <Text style={styles.broadcastAction}>View</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* 3D Upcoming EMI Hero Card */}
        <EmiHeroCard
          customer={customer}
          nextEmi={nextEmi}
          paidCount={paidEmis.length}
          totalTenure={customer.emi_tenure}
          breakdown={breakdown}
          onPayPress={() => navigation.navigate('EmiSchedule')}
        />

        {/* Total Outstanding Breakdown Card */}
        <Card3D style={styles.breakdownCard}>
          <Text style={styles.sectionTitle}>Total Outstanding Due</Text>
          <Text style={styles.totalDueAmount}>{formatInr(totalPayable)}</Text>

          <View style={styles.divider} />

          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Next EMI Installment</Text>
            <Text style={styles.breakdownValue}>{formatInr(nextEmi?.amount || 0)}</Text>
          </View>

          {breakdown && breakdown.fine_due > 0 && (
            <View style={styles.breakdownRow}>
              <View style={styles.fineLabelRow}>
                <AlertTriangle size={13} color="#EF4444" />
                <Text style={[styles.breakdownLabel, { color: '#FCA5A5' }]}>Late Overdue Fine</Text>
              </View>
              <Text style={[styles.breakdownValue, { color: '#EF4444' }]}>
                {formatInr(breakdown.fine_due)}
              </Text>
            </View>
          )}

          {firstChargeRemaining > 0 && (
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>1st EMI Setup Charge</Text>
              <Text style={styles.breakdownValue}>{formatInr(firstChargeRemaining)}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.viewScheduleBtn}
            onPress={() => navigation.navigate('EmiSchedule')}
          >
            <Receipt size={16} color="#60A5FA" />
            <Text style={styles.viewScheduleText}>View Full Installment Schedule ({emis.length} months)</Text>
          </TouchableOpacity>
        </Card3D>

        {/* Device & Loan Details */}
        <Card3D style={styles.deviceCard}>
          <Text style={styles.sectionTitle}>Financed Device</Text>
          <View style={styles.deviceRow}>
            <View style={styles.deviceIconBox}>
              <Smartphone size={24} color="#60A5FA" />
            </View>
            <View style={styles.deviceMeta}>
              <Text style={styles.deviceModel}>{customer.model_no || 'Smartphone'}</Text>
              <Text style={styles.deviceImei}>IMEI: {customer.imei}</Text>
              <Text style={styles.deviceLoanStatus}>
                Status: <Text style={{ color: '#10B981', fontWeight: '700' }}>{customer.status}</Text>
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.loanDetailGrid}>
            <View style={styles.loanGridItem}>
              <Text style={styles.gridLabel}>Purchase Value</Text>
              <Text style={styles.gridValue}>{formatInr(customer.purchase_value)}</Text>
            </View>
            <View style={styles.loanGridItem}>
              <Text style={styles.gridLabel}>Down Payment</Text>
              <Text style={styles.gridValue}>{formatInr(customer.down_payment)}</Text>
            </View>
            <View style={styles.loanGridItem}>
              <Text style={styles.gridLabel}>Disbursed</Text>
              <Text style={styles.gridValue}>{formatInr(customer.disburse_amount || 0)}</Text>
            </View>
            <View style={styles.loanGridItem}>
              <Text style={styles.gridLabel}>Monthly Due Day</Text>
              <Text style={styles.gridValue}>{customer.emi_due_day}th of Month</Text>
            </View>
          </View>

          {customer.retailer?.mobile && (
            <TouchableOpacity
              style={styles.retailerCallBtn}
              onPress={() => Linking.openURL(`tel:${customer.retailer?.mobile}`)}
            >
              <Phone size={15} color="#93C5FD" />
              <Text style={styles.retailerCallText}>Call Store: {customer.retailer.mobile}</Text>
            </TouchableOpacity>
          )}
        </Card3D>
      </ScrollView>

      {/* Broadcast Detail Modal */}
      <BroadcastModal
        broadcast={activeBroadcast}
        visible={!!activeBroadcast}
        onClose={() => setActiveBroadcast(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg.darkest,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 54,
    paddingBottom: 30,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  greetingText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '500',
  },
  customerName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  retailerPill: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    maxWidth: 140,
  },
  retailerLabel: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  retailerName: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '700',
  },
  broadcastBanner: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  broadcastGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  broadcastText: {
    flex: 1,
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '600',
  },
  broadcastAction: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  breakdownCard: {
    marginVertical: 10,
  },
  sectionTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  totalDueAmount: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 14,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  fineLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  breakdownLabel: {
    color: '#94A3B8',
    fontSize: 13,
  },
  breakdownValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  viewScheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
  },
  viewScheduleText: {
    color: '#93C5FD',
    fontSize: 13,
    fontWeight: '700',
  },
  deviceCard: {
    marginVertical: 10,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  deviceIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  deviceMeta: {
    flex: 1,
  },
  deviceModel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  deviceImei: {
    color: '#94A3B8',
    fontSize: 12,
  },
  deviceLoanStatus: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  loanDetailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  loanGridItem: {
    width: '47%',
    backgroundColor: '#1E293B',
    padding: 10,
    borderRadius: 12,
  },
  gridLabel: {
    color: '#64748B',
    fontSize: 11,
    marginBottom: 4,
  },
  gridValue: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  retailerCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
  },
  retailerCallText: {
    color: '#93C5FD',
    fontSize: 13,
    fontWeight: '600',
  },
});
