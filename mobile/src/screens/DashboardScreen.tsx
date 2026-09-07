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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  Megaphone,
  ChevronRight,
  ShieldCheck,
  Clock,
  CheckCircle2,
  Receipt,
  Sparkles,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { TitaniumLoanCard } from '../components/TitaniumLoanCard';
import { EmiProgressRing } from '../components/EmiProgressRing';
import { EmiHeroCard } from '../components/EmiHeroCard';
import { QuickActionDock } from '../components/QuickActionDock';
import { ReceiptModal } from '../components/ReceiptModal';
import { BroadcastModal } from '../components/BroadcastModal';
import { BroadcastItem, EMIScheduleItem } from '../types';
import { THEME } from '../config';

export const DashboardScreen = ({ navigation }: { navigation: any }) => {
  const { customer, emis, breakdown, broadcasts, refreshData } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [activeBroadcast, setActiveBroadcast] = useState<BroadcastItem | null>(null);
  const [receiptEmi, setReceiptEmi] = useState<EMIScheduleItem | null>(null);

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refreshData();
    setRefreshing(false);
  };

  if (!customer) return null;

  // Split paid vs unpaid EMIs
  const paidEmis = emis.filter(e => e.status === 'APPROVED');
  const unpaidEmis = emis.filter(e => e.status === 'UNPAID' || e.status === 'PARTIALLY_PAID');
  const nextEmi = unpaidEmis.length > 0 ? unpaidEmis[0] : null;

  const totalEmisCount = customer.emi_tenure || Math.max(emis.length, 1);
  const totalLoanAmount = customer.purchase_value || (customer.emi_amount * totalEmisCount);
  const paidAmount = paidEmis.reduce((sum, e) => sum + (e.amount || 0), 0);

  const formatInr = (n: number) =>
    `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;

  // Handle direct UPI Payment intent
  const handlePayUpi = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const payeeMobile = customer.retailer?.mobile;
    const amount = nextEmi?.amount || breakdown?.total_payable || customer.emi_amount;

    if (payeeMobile) {
      const upiUrl = `upi://pay?pa=${payeeMobile}@paytm&pn=Telepoint&am=${amount}&cu=INR&tn=${encodeURIComponent(
        `EMI ${nextEmi?.emi_no || 1} | ${customer.customer_name}`
      )}`;
      Linking.canOpenURL(upiUrl).then(supported => {
        if (supported) {
          Linking.openURL(upiUrl);
        } else {
          Alert.alert(
            'Retailer UPI Details',
            `Pay via any UPI App:\nVPA: ${payeeMobile}@paytm\nAmount: ${formatInr(amount)}\nRetailer: ${customer.retailer?.name}`
          );
        }
      });
    } else {
      Alert.alert(
        'Store Payment',
        `Please contact ${customer.retailer?.name || 'your retailer'} to complete this installment payment.`
      );
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={THEME.accent.primary}
            colors={[THEME.accent.primary, THEME.accent.success]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header Bar */}
        <View style={styles.topHeader}>
          <View>
            <View style={styles.greetingRow}>
              <Text style={styles.greetingText}>HELLO,</Text>
              <View style={styles.kycShield}>
                <ShieldCheck size={12} color="#34D399" />
                <Text style={styles.kycText}>VERIFIED</Text>
              </View>
            </View>
            <Text style={styles.customerName}>{customer.customer_name}</Text>
          </View>

          <View style={styles.retailerPill}>
            <Text style={styles.retailerLabel}>PARTNER STORE</Text>
            <Text style={styles.retailerName} numberOfLines={1}>
              {customer.retailer?.name || 'Telepoint Network'}
            </Text>
          </View>
        </View>

        {/* Live Broadcast / Store Offer Announcement */}
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
              colors={['rgba(245, 158, 11, 0.22)', 'rgba(217, 119, 6, 0.12)']}
              style={styles.broadcastGradient}
            >
              <View style={styles.broadcastLeft}>
                <View style={styles.broadcastIconBox}>
                  <Megaphone size={16} color="#FBBF24" />
                </View>
                <View style={styles.broadcastTextCol}>
                  <Text style={styles.broadcastTag}>STORE BROADCAST</Text>
                  <Text style={styles.broadcastMessage} numberOfLines={1}>
                    {broadcasts[0].message}
                  </Text>
                </View>
              </View>
              <ChevronRight size={18} color="#FBBF24" />
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* 3D Titanium Device Passbook Card */}
        <TitaniumLoanCard customer={customer} />

        {/* Next EMI Urgency Hero Card */}
        <EmiHeroCard
          customer={customer}
          nextEmi={nextEmi}
          paidCount={paidEmis.length}
          totalTenure={totalEmisCount}
          breakdown={breakdown}
          onPayPress={handlePayUpi}
        />

        {/* Amortization Progress Visualizer */}
        <EmiProgressRing
          totalEmis={totalEmisCount}
          paidEmis={paidEmis.length}
          totalAmount={totalLoanAmount}
          paidAmount={paidAmount}
        />

        {/* Fintech Quick Action Dock */}
        <QuickActionDock
          onPayUpi={handlePayUpi}
          onViewReceipts={() => navigation.navigate('Schedule')}
          retailerPhone={customer.retailer?.mobile}
          retailerName={customer.retailer?.name}
        />

        {/* Recent Installment Activity Feed */}
        <View style={styles.activitySection}>
          <View style={styles.activityHeader}>
            <Text style={styles.activityTitle}>INSTALLMENT ACTIVITY</Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate('Schedule');
              }}
            >
              <Text style={styles.viewAllText}>View All ({emis.length})</Text>
            </TouchableOpacity>
          </View>

          {emis.slice(0, 3).map(emi => {
            const isPaid = emi.status === 'APPROVED';
            return (
              <TouchableOpacity
                key={emi.id}
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (isPaid) {
                    setReceiptEmi(emi);
                  } else {
                    navigation.navigate('Schedule');
                  }
                }}
                style={styles.activityItem}
              >
                <View style={styles.activityLeft}>
                  <View
                    style={[
                      styles.activityIconBox,
                      isPaid ? styles.iconPaid : styles.iconPending,
                    ]}
                  >
                    {isPaid ? (
                      <CheckCircle2 size={18} color="#10B981" />
                    ) : (
                      <Clock size={18} color="#F59E0B" />
                    )}
                  </View>
                  <View>
                    <Text style={styles.activityItemTitle}>
                      Installment #{emi.emi_no}
                    </Text>
                    <Text style={styles.activityItemSub}>
                      {isPaid ? `Paid on ${emi.due_date}` : `Due by ${emi.due_date}`}
                    </Text>
                  </View>
                </View>

                <View style={styles.activityRight}>
                  <Text style={styles.activityAmount}>{formatInr(emi.amount)}</Text>
                  {isPaid ? (
                    <View style={styles.receiptChip}>
                      <Receipt size={10} color="#6EE7B7" />
                      <Text style={styles.receiptChipText}>SLIP</Text>
                    </View>
                  ) : (
                    <Text style={styles.pendingTag}>PENDING</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Security Watermark */}
        <View style={styles.footerNote}>
          <Sparkles size={14} color="#64748B" />
          <Text style={styles.footerNoteText}>
            Telepoint Smart Finance • Secured by Hardware Device Lock
          </Text>
        </View>
      </ScrollView>

      {/* Broadcast Detail Modal */}
      <BroadcastModal
        visible={!!activeBroadcast}
        broadcast={activeBroadcast}
        onClose={() => setActiveBroadcast(null)}
      />

      {/* Digital Bank Receipt Modal */}
      <ReceiptModal
        visible={!!receiptEmi}
        emi={receiptEmi}
        customer={customer}
        onClose={() => setReceiptEmi(null)}
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
    paddingBottom: 40,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  greetingText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  kycShield: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  kycText: {
    color: '#34D399',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  customerName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  retailerPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'flex-end',
    maxWidth: 160,
  },
  retailerLabel: {
    color: '#64748B',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  retailerName: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '700',
  },
  broadcastBanner: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  broadcastGradient: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
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
    borderRadius: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  broadcastTextCol: {
    flex: 1,
  },
  broadcastTag: {
    color: '#FBBF24',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  broadcastMessage: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  activitySection: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: 'rgba(14, 19, 31, 0.6)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  activityTitle: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  viewAllText: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '700',
  },
  activityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  activityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  activityIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconPaid: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  iconPending: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  activityItemTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  activityItemSub: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  activityRight: {
    alignItems: 'flex-end',
  },
  activityAmount: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 3,
  },
  receiptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  receiptChipText: {
    color: '#6EE7B7',
    fontSize: 9,
    fontWeight: '800',
  },
  pendingTag: {
    color: '#FBBF24',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  footerNote: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
    marginBottom: 8,
  },
  footerNoteText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
  },
});
