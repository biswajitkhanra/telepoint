// mobile/src/screens/RetailerConsoleView.tsx
// 100% Native Mobile App Experience for Retailers (No Webview feel)
// IDFC Clarity + Jupiter Delight: Real-time MTD stats, Live Due Collections, Call & WhatsApp Actions, Instant Payment Logging

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Linking,
  RefreshControl,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Haptics } from '../utils/haptics';
import {
  PhoneCall,
  MessageCircle,
  CreditCard,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronRight,
  Sparkles,
  Users,
  Store,
  PlusCircle,
  X,
  Send,
  Calendar,
  Layers,
} from 'lucide-react-native';
import { CountUp } from '../components/CountUp';
import { JellyCard } from '../components/JellyCard';
import { PressableScale } from '../components/PressableScale';
import { CustomerDetailModal } from '../components/CustomerDetailModal';
import { CollectPaymentSheet } from '../components/CollectPaymentSheet';
import { PORTAL_BASE_URL } from '../config';
import { Colors } from '../constants/colors';
import { Spacing, Radius, Shadow } from '../constants/design';
import { useAuth } from '../context/AuthContext';

interface MtdStats {
  disbursedAmount: number;
  collectedAmount: number;
  activePhones: number;
  pendingApprovals: number;
}

interface OverdueCustomer {
  customer_id: string;
  customer_name: string;
  mobile: string;
  imei: string;
  overdue_count: number;
  earliest_due_date: string;
  total_fine: number;
  total_due: number;
  total_outstanding: number;
}

interface UpcomingLoan {
  customer_id: string;
  customer_name: string;
  mobile: string;
  imei: string;
  due_date: string;
  emi_no: number;
  emi_amount: number;
  remaining_balance: number;
  days_remaining: number;
}

interface CustomerSummary {
  id: string;
  customer_name: string;
  mobile: string | null;
  imei: string | null;
  status: string;
}

interface PaymentRecord {
  id: string;
  total_amount: number | null;
  mode: string | null;
  status: string | null;
  utr: string | null;
  created_at: string | null;
  customer?: { customer_name?: string; imei?: string };
}

interface RetailerConsoleViewProps {
  onSwitchAccount?: () => void;
  onSwitchToCustomer?: () => void;
}

export const RetailerConsoleView: React.FC<RetailerConsoleViewProps> = ({
  onSwitchAccount,
  onSwitchToCustomer,
}) => {
  const { staffUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'due' | 'upcoming' | 'ledger' | 'customers'>('due');
  const [searchQuery, setSearchQuery] = useState('');
  const insets = useSafeAreaInsets();

  // Smooth tab animation physics
  const tabFadeAnim = useSharedValue(1);
  const tabSlideAnim = useSharedValue(0);

  const tabAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: tabFadeAnim.value,
      transform: [{ translateY: tabSlideAnim.value }],
    };
  });

  const handleSelectTab = (tab: 'due' | 'upcoming' | 'ledger' | 'customers') => {
    if (tab === activeTab) return;
    Haptics.selectionAsync();
    tabFadeAnim.value = 0;
    tabSlideAnim.value = 10;
    setActiveTab(tab);
    
    tabFadeAnim.value = withTiming(1, { duration: 200 });
    tabSlideAnim.value = withSpring(0, { damping: 15, stiffness: 300, mass: 1 });
  };

  // Data states
  const [mtdStats, setMtdStats] = useState<MtdStats>({
    disbursedAmount: 0,
    collectedAmount: 0,
    activePhones: 0,
    pendingApprovals: 0,
  });
  const [dueList, setDueList] = useState<OverdueCustomer[]>([]);
  const [upcomingList, setUpcomingList] = useState<UpcomingLoan[]>([]);
  const [customerList, setCustomerList] = useState<CustomerSummary[]>([]);
  const [recentPayments, setRecentPayments] = useState<PaymentRecord[]>([]);

  // Customer Detail Ledger Modal
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);

  const handleOpenCustomerDetail = (id: string) => {
    Haptics.selectionAsync();
    setSelectedCustomerId(id);
    setCustomerModalVisible(true);
  };

  // Collect Payment Bottom Sheet / Modal
  const [collectModalVisible, setCollectModalVisible] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [collectTargetCustomer, setCollectTargetCustomer] = useState<{
    id: string;
    name: string;
    amount: string;
    emiNo: string;
  }>({ id: '', name: '', amount: '', emiNo: '1' });
  const [collectMode, setCollectMode] = useState<'CASH' | 'UPI'>('CASH');
  const [collectUtr, setCollectUtr] = useState('');

  const loadRetailerData = useCallback(async () => {
    try {
      const username = staffUser?.username || '';
      const res = await fetch(
        `${PORTAL_BASE_URL}/api/mobile/retailer?username=${encodeURIComponent(username)}`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.mtdStats) setMtdStats(data.mtdStats);
        if (data.due) setDueList(data.due);
        if (data.upcoming) setUpcomingList(data.upcoming);
        if (data.customers) setCustomerList(data.customers);
        if (data.recentPayments) setRecentPayments(data.recentPayments);
      }
    } catch (e) {
      console.warn('Failed to load retailer mobile data:', e);
    } finally {
      setLoading(false);
    }
  }, [staffUser]);

  useEffect(() => {
    loadRetailerData();
  }, [loadRetailerData]);

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadRetailerData();
    setRefreshing(false);
  };

  // Direct Call Action
  const handleCallCustomer = (mobile: string | null | undefined, name: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!mobile) {
      Alert.alert('No Mobile Number', `No phone number registered for ${name}.`);
      return;
    }
    const cleanNum = mobile.replace(/\D/g, '');
    const finalNum = cleanNum.length >= 10 ? cleanNum.slice(-10) : cleanNum;
    Linking.openURL(`tel:${finalNum}`).catch(() => {
      Alert.alert('Call Failed', 'Unable to initiate call on this device.');
    });
  };

  // Direct WhatsApp Reminder Action
  const handleWhatsAppReminder = (mobile: string | null | undefined, name: string, dueAmount: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!mobile) {
      Alert.alert('No Mobile Number', `No phone number registered for ${name}.`);
      return;
    }
    const cleanNum = mobile.replace(/\D/g, '').slice(-10);
    const msg = encodeURIComponent(
      dueAmount > 0
        ? `Dear ${name}, this is a gentle reminder from Telepoint regarding your pending EMI of ₹${dueAmount.toLocaleString(
            'en-IN'
          )}. Please clear your dues at our store or pay online to keep your mobile active. Helpline: 7003617029.`
        : `Hello ${name}, greetings from Telepoint! Please let us know if you need any assistance regarding your device EMI account.`
    );
    const waUrl = `whatsapp://send?phone=91${cleanNum}&text=${msg}`;
    const webUrl = `https://wa.me/91${cleanNum}?text=${msg}`;
    Linking.canOpenURL(waUrl)
      .then(supported => {
        if (supported) {
          return Linking.openURL(waUrl);
        } else {
          return Linking.openURL(webUrl);
        }
      })
      .catch(() => {
        Linking.openURL(webUrl).catch(() => {
          Alert.alert('WhatsApp Error', 'Could not open WhatsApp on this device.');
        });
      });
  };

  // Open Collect Modal pre-filled
  const openCollectModal = (customerId: string, customerName: string, defaultAmount: number) => {
    Haptics.selectionAsync();
    setCollectTargetCustomer({
      id: customerId,
      name: customerName,
      amount: String(Math.round(defaultAmount || 0)),
      emiNo: '1',
    });
    setCollectMode('CASH');
    setCollectUtr('');
    setCollectModalVisible(true);
  };

  // Submit Collect Payment Request to Server
  const handleSubmitPayment = async () => {
    if (!collectTargetCustomer.id || !collectTargetCustomer.amount) {
      Alert.alert('Incomplete Details', 'Please specify customer and collection amount.');
      return;
    }

    const amt = parseFloat(collectTargetCustomer.amount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid positive number.');
      return;
    }

    setSubmittingPayment(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const res = await fetch(`${PORTAL_BASE_URL}/api/mobile/retailer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retailer_id: staffUser?.retailerId || '00000000-0000-0000-0000-000000000000',
          customer_id: collectTargetCustomer.id,
          amount: amt,
          mode: collectMode,
          utr: collectUtr.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Payment Recorded!', `₹${amt} collected successfully. It is now queued for admin approval.`);
        setCollectModalVisible(false);
        loadRetailerData();
      } else {
        Alert.alert('Submission Failed', json.error || 'Failed to record payment.');
      }
    } catch (e: any) {
      Alert.alert('Network Error', e?.message || 'Unable to connect to server.');
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Search filtered results
  const filteredDue = useMemo(() => {
    if (!searchQuery.trim()) return dueList;
    const q = searchQuery.toLowerCase().trim();
    return dueList.filter(
      item =>
        item.customer_name?.toLowerCase().includes(q) ||
        item.mobile?.includes(q) ||
        item.imei?.includes(q)
    );
  }, [dueList, searchQuery]);

  const filteredUpcoming = useMemo(() => {
    if (!searchQuery.trim()) return upcomingList;
    const q = searchQuery.toLowerCase().trim();
    return upcomingList.filter(
      item =>
        item.customer_name?.toLowerCase().includes(q) ||
        item.mobile?.includes(q) ||
        item.imei?.includes(q)
    );
  }, [upcomingList, searchQuery]);

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customerList;
    const q = searchQuery.toLowerCase().trim();
    return customerList.filter(
      item =>
        item.customer_name?.toLowerCase().includes(q) ||
        item.mobile?.includes(q) ||
        item.imei?.includes(q)
    );
  }, [customerList, searchQuery]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading Retailer Store Portal...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, styles.mainWrapper]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary, '#10B981']}
          />
        }
      >
        {/* Store Welcome Card */}
        <LinearGradient
          colors={['#0A2540', '#0F172A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.storeHeaderCard}
        >
          <View style={styles.storeHeaderRow}>
            <View style={styles.storeIconWrap}>
              <Store size={22} color="#38BDF8" />
            </View>
            <View style={styles.storeHeaderInfo}>
              <View style={styles.storePill}>
                <Text style={styles.storePillText}>PARTNER STORE DASHBOARD</Text>
              </View>
              <Text style={styles.storeNameText}>
                {staffUser?.name || staffUser?.username || 'Telepoint Partner Store'}
              </Text>
            </View>
          </View>

        </LinearGradient>

        {/* Store Performance Metrics */}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>STORE PERFORMANCE (THIS MONTH)</Text>
            <View style={styles.liveBadge}>
              <Sparkles size={11} color="#10B981" />
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          </View>
          <View style={styles.syncStatusRow}>
            <View style={styles.greenDot} />
            <Text style={styles.syncStatusText}>Connected</Text>
          </View>
        </View>

        <View style={styles.kpiGrid}>
          <View style={styles.kpiRow}>
            <JellyCard accentColor="#1A6FD6" style={styles.kpiCard} mountDelay={100}>
              <Text style={styles.kpiLabel}>DISBURSED (THIS MONTH)</Text>
              <CountUp
                end={mtdStats.disbursedAmount}
                prefix="₹"
                style={[styles.kpiValue, { color: '#1A6FD6' }]}
                duration={700}
              />
              <Text style={styles.kpiSub}>New loans financed</Text>
            </JellyCard>

            <JellyCard accentColor="#10B981" style={styles.kpiCard} mountDelay={180}>
              <Text style={styles.kpiLabel}>COLLECTED (THIS MONTH)</Text>
              <CountUp
                end={mtdStats.collectedAmount}
                prefix="₹"
                style={[styles.kpiValue, { color: '#059669' }]}
                duration={700}
              />
              <Text style={styles.kpiSub}>Settled installments</Text>
            </JellyCard>
          </View>

          <View style={styles.kpiRow}>
            <JellyCard accentColor="#8B5CF6" style={styles.kpiCard} mountDelay={260}>
              <Text style={styles.kpiLabel}>ACTIVE LOANS</Text>
              <Text style={[styles.kpiValue, { color: '#7C3AED' }]}>{mtdStats.activePhones}</Text>
              <Text style={styles.kpiSub}>Active customer devices</Text>
            </JellyCard>

            <JellyCard accentColor="#F59E0B" style={styles.kpiCard} mountDelay={340}>
              <Text style={styles.kpiLabel}>PENDING APPROVAL</Text>
              <Text style={[styles.kpiValue, { color: '#D97706' }]}>
                {mtdStats.pendingApprovals}
              </Text>
              <Text style={styles.kpiSub}>Awaiting admin approval</Text>
            </JellyCard>
          </View>
        </View>

        {/* Global Search Bar */}
        <View style={styles.searchContainer}>
          <Search size={18} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by customer name, mobile, IMEI..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={16} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Operational Segment Tabs */}
        <View style={styles.tabBar}>
          <PressableScale
            onPress={() => handleSelectTab('due')}
            style={[styles.tabBtn, activeTab === 'due' && styles.tabBtnActive]}
            scaleTo={0.94}
          >
            <AlertCircle
              size={15}
              color={activeTab === 'due' ? '#E11D48' : '#64748B'}
            />
            <Text
              style={[styles.tabBtnText, activeTab === 'due' && styles.tabBtnTextActiveDue]}
            >
              Overdue ({filteredDue.length})
            </Text>
          </PressableScale>

          <PressableScale
            onPress={() => handleSelectTab('upcoming')}
            style={[styles.tabBtn, activeTab === 'upcoming' && styles.tabBtnActive]}
            scaleTo={0.94}
          >
            <Clock
              size={15}
              color={activeTab === 'upcoming' ? '#1A6FD6' : '#64748B'}
            />
            <Text
              style={[
                styles.tabBtnText,
                activeTab === 'upcoming' && styles.tabBtnTextActiveUpcoming,
              ]}
            >
              Upcoming ({filteredUpcoming.length})
            </Text>
          </PressableScale>

          <PressableScale
            onPress={() => handleSelectTab('ledger')}
            style={[styles.tabBtn, activeTab === 'ledger' && styles.tabBtnActive]}
            scaleTo={0.94}
          >
            <Layers
              size={15}
              color={activeTab === 'ledger' ? '#059669' : '#64748B'}
            />
            <Text
              style={[
                styles.tabBtnText,
                activeTab === 'ledger' && styles.tabBtnTextActiveLedger,
              ]}
            >
              Ledger ({recentPayments.length})
            </Text>
          </PressableScale>

          <PressableScale
            onPress={() => handleSelectTab('customers')}
            style={[styles.tabBtn, activeTab === 'customers' && styles.tabBtnActive]}
            scaleTo={0.94}
          >
            <Users
              size={15}
              color={activeTab === 'customers' ? '#7C3AED' : '#64748B'}
            />
            <Text
              style={[
                styles.tabBtnText,
                activeTab === 'customers' && styles.tabBtnTextActiveCustomers,
              ]}
            >
              Customers
            </Text>
          </PressableScale>
        </View>

        {/* Animated Tab Content with Smooth Transitions */}
        <Animated.View
          style={[
            styles.tabContentContainer,
            tabAnimatedStyle,
          ]}
        >
        {/* TAB 1: OVERDUE ACCOUNTS (Living Jelly Cards with WhatsApp / Call / Collect) */}
        {activeTab === 'due' && (
          <View style={styles.tabContent}>
            {filteredDue.length === 0 ? (
              <View style={styles.emptyCard}>
                <CheckCircle2 size={36} color="#10B981" />
                <Text style={styles.emptyTitle}>Zero Overdue Accounts!</Text>
                <Text style={styles.emptySub}>All customers under your store are currently up to date on their EMIs.</Text>
              </View>
            ) : (
              filteredDue.map((item, idx) => (
                <JellyCard
                  key={item.customer_id}
                  accentColor="#E11D48"
                  style={styles.customerJellyCard}
                  mountDelay={Math.min(idx, 6) * 50}
                >
                  <TouchableOpacity
                    onPress={() => handleOpenCustomerDetail(item.customer_id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.cardTopRow}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={styles.customerName}>{item.customer_name}</Text>
                        <Text style={styles.customerSub}>
                          {item.mobile ? `📱 ${item.mobile} • ` : ''}IMEI: {item.imei || 'N/A'} • {item.overdue_count} EMI{item.overdue_count > 1 ? 's' : ''} Overdue
                        </Text>
                      </View>
                      <View style={styles.dueBadge}>
                        <Text style={styles.dueBadgeText}>₹{item.total_due.toLocaleString('en-IN')}</Text>
                      </View>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Earliest Due Date:</Text>
                      <Text style={styles.detailValueOverdue}>{item.earliest_due_date}</Text>
                    </View>

                    {item.total_fine > 0 && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Late Fine Accrued:</Text>
                        <Text style={styles.detailValueFine}>+ ₹{item.total_fine.toLocaleString('en-IN')}</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* 1-Tap Quick Action Row: Call, WhatsApp Reminder, Collect Payment */}
                  <View style={styles.actionButtonRow}>
                    <PressableScale
                      onPress={() => handleCallCustomer(item.mobile, item.customer_name)}
                      style={styles.callButton}
                      scaleTo={0.92}
                    >
                      <PhoneCall size={14} color="#1A6FD6" />
                      <Text style={styles.callButtonText}>Call</Text>
                    </PressableScale>

                    <PressableScale
                      onPress={() => handleWhatsAppReminder(item.mobile, item.customer_name, item.total_due)}
                      style={styles.whatsAppButton}
                      scaleTo={0.92}
                    >
                      <MessageCircle size={14} color="#059669" />
                      <Text style={styles.whatsAppButtonText}>WhatsApp</Text>
                    </PressableScale>

                    <PressableScale
                      onPress={() => openCollectModal(item.customer_id, item.customer_name, item.total_due)}
                      style={styles.collectButton}
                      scaleTo={0.94}
                    >
                      <CreditCard size={14} color="#FFFFFF" />
                      <Text style={styles.collectButtonText}>Collect</Text>
                    </PressableScale>
                  </View>
                </JellyCard>
              ))
            )}
          </View>
        )}

        {/* TAB 2: UPCOMING EMIS (Next 5 Days) */}
        {activeTab === 'upcoming' && (
          <View style={styles.tabContent}>
            {filteredUpcoming.length === 0 ? (
              <View style={styles.emptyCard}>
                <Clock size={36} color="#1A6FD6" />
                <Text style={styles.emptyTitle}>No Upcoming EMIs in 5 Days</Text>
                <Text style={styles.emptySub}>No installments are maturing within the upcoming 5 days.</Text>
              </View>
            ) : (
              filteredUpcoming.map((item, idx) => (
                <JellyCard
                  key={`${item.customer_id}-${item.emi_no}`}
                  accentColor="#1A6FD6"
                  style={styles.customerJellyCard}
                  mountDelay={Math.min(idx, 6) * 50}
                >
                  <TouchableOpacity
                    onPress={() => handleOpenCustomerDetail(item.customer_id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.cardTopRow}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={styles.customerName}>{item.customer_name}</Text>
                        <Text style={styles.customerSub}>
                          {item.mobile ? `📱 ${item.mobile} • ` : ''}IMEI: {item.imei || 'N/A'} • EMI #{item.emi_no}
                        </Text>
                      </View>
                      <View style={styles.upcomingBadge}>
                        <Text style={styles.upcomingBadgeText}>₹{item.emi_amount.toLocaleString('en-IN')}</Text>
                      </View>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Maturing On:</Text>
                      <Text style={styles.detailValuePrimary}>
                        {item.due_date} ({item.days_remaining === 0 ? 'Today' : `in ${item.days_remaining}d`})
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* 1-Tap Quick Action Row: Call, WhatsApp Reminder, Collect */}
                  <View style={styles.actionButtonRow}>
                    <PressableScale
                      onPress={() => handleCallCustomer(item.mobile, item.customer_name)}
                      style={styles.callButton}
                      scaleTo={0.92}
                    >
                      <PhoneCall size={14} color="#1A6FD6" />
                      <Text style={styles.callButtonText}>Call</Text>
                    </PressableScale>

                    <PressableScale
                      onPress={() => handleWhatsAppReminder(item.mobile, item.customer_name, item.emi_amount)}
                      style={styles.whatsAppButton}
                      scaleTo={0.92}
                    >
                      <MessageCircle size={14} color="#059669" />
                      <Text style={styles.whatsAppButtonText}>WhatsApp</Text>
                    </PressableScale>

                    <PressableScale
                      onPress={() => openCollectModal(item.customer_id, item.customer_name, item.emi_amount)}
                      style={styles.collectButton}
                      scaleTo={0.94}
                    >
                      <CreditCard size={14} color="#FFFFFF" />
                      <Text style={styles.collectButtonText}>Collect</Text>
                    </PressableScale>
                  </View>
                </JellyCard>
              ))
            )}
          </View>
        )}

        {/* TAB 3: RECENT STORE COLLECTION LEDGER */}
        {activeTab === 'ledger' && (
          <View style={styles.tabContent}>
            {recentPayments.length === 0 ? (
              <View style={styles.emptyCard}>
                <Layers size={36} color="#64748B" />
                <Text style={styles.emptyTitle}>No Collections Recorded</Text>
                <Text style={styles.emptySub}>Collections submitted via this app will appear here with live verification status.</Text>
              </View>
            ) : (
              recentPayments.map(pay => {
                const cust = Array.isArray(pay.customer) ? pay.customer[0] : pay.customer;
                const isApproved = pay.status === 'APPROVED';
                const isPending = pay.status === 'PENDING';
                const isRejected = pay.status === 'REJECTED';

                return (
                  <View key={pay.id} style={styles.ledgerRowCard}>
                    <View style={styles.ledgerTop}>
                      <View>
                        <Text style={styles.ledgerCustomerName}>
                          {cust?.customer_name || 'Customer Payment'}
                        </Text>
                        <Text style={styles.ledgerSub}>
                          {pay.mode || 'CASH'} • {pay.created_at ? new Date(pay.created_at).toLocaleDateString('en-IN') : 'Recent'}
                        </Text>
                      </View>
                      <View style={styles.ledgerAmountCol}>
                        <Text style={styles.ledgerAmount}>₹{Number(pay.total_amount || 0).toLocaleString('en-IN')}</Text>
                        <View
                          style={[
                            styles.statusBadge,
                            isApproved && styles.statusBadgeApproved,
                            isPending && styles.statusBadgePending,
                            isRejected && styles.statusBadgeRejected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              isApproved && styles.statusBadgeTextApproved,
                              isPending && styles.statusBadgeTextPending,
                              isRejected && styles.statusBadgeTextRejected,
                            ]}
                          >
                            {pay.status || 'PENDING'}
                          </Text>
                        </View>
                      </View>
                    </View>
                    {pay.utr && (
                      <Text style={styles.utrText}>UTR/Ref: {pay.utr}</Text>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* TAB 4: STORE CUSTOMER DIRECTORY */}
        {activeTab === 'customers' && (
          <View style={styles.tabContent}>
            {filteredCustomers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Users size={36} color="#64748B" />
                <Text style={styles.emptyTitle}>No Customers Found</Text>
              </View>
            ) : (
              filteredCustomers.map(c => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => handleOpenCustomerDetail(c.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.customerDirectoryCard}>
                    <View style={styles.custDirLeft}>
                      <Text style={styles.custDirName}>{c.customer_name}</Text>
                      <Text style={styles.custDirSub}>
                        {c.mobile ? `📱 ${c.mobile}` : 'No Mobile'} • IMEI: {c.imei || 'N/A'}
                      </Text>
                    </View>
                    <View style={styles.custDirRight}>
                      {c.mobile ? (
                        <>
                          <PressableScale
                            onPress={() => handleCallCustomer(c.mobile, c.customer_name)}
                            style={styles.custDirCallBtn}
                            scaleTo={0.88}
                          >
                            <PhoneCall size={15} color="#1A6FD6" />
                          </PressableScale>
                          <PressableScale
                            onPress={() => handleWhatsAppReminder(c.mobile, c.customer_name, 0)}
                            style={styles.custDirWaBtn}
                            scaleTo={0.88}
                          >
                            <MessageCircle size={15} color="#059669" />
                          </PressableScale>
                        </>
                      ) : null}
                      <View style={{ justifyContent: 'center', paddingLeft: 4 }}>
                        <ChevronRight size={18} color="#CBD5E1" />
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
        </Animated.View>
      </ScrollView>

      {/* FULL CUSTOMER & LOAN LEDGER DETAIL MODAL */}
      <CustomerDetailModal
        visible={customerModalVisible}
        customerId={selectedCustomerId}
        onClose={() => setCustomerModalVisible(false)}
        onCollectPayment={target =>
          openCollectModal(target.id, target.name, target.dueAmount)
        }
        onRefreshParent={loadRetailerData}
      />

      {/* 100% NATIVE FULL-FEATURED COLLECT PAYMENT SHEET */}
      <CollectPaymentSheet
        visible={collectModalVisible}
        onClose={() => setCollectModalVisible(false)}
        customerId={collectTargetCustomer.id}
        customerName={collectTargetCustomer.name}
        initialAmount={parseFloat(collectTargetCustomer.amount) || undefined}
        isAdmin={false}
        retailerId={staffUser?.retailerId}
        onPaymentSuccess={() => {
          loadRetailerData();
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  mainWrapper: {
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: Spacing.xl,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: 40,
  },
  storeHeaderCard: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  storeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  storeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  storeHeaderInfo: {
    flex: 1,
  },
  storePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  storePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#38BDF8',
    letterSpacing: 0.5,
  },
  storeNameText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  recordPaymentHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#38BDF8',
    paddingVertical: 10,
    borderRadius: Radius.md,
    gap: 8,
  },
  recordPaymentHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  syncStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  syncStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  tabContentContainer: {
    flex: 1,
  },
  kpiGrid: {
    gap: 10,
    marginBottom: Spacing.md,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    padding: 14,
    borderRadius: Radius.md,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 19,
    fontWeight: '800',
    marginTop: 4,
  },
  kpiSub: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    padding: 4,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: Radius.sm,
    gap: 4,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    ...Shadow.sm,
  },
  tabBtnText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  tabBtnTextActiveDue: {
    color: '#E11D48',
    fontWeight: '700',
  },
  tabBtnTextActiveUpcoming: {
    color: '#1A6FD6',
    fontWeight: '700',
  },
  tabBtnTextActiveLedger: {
    color: '#059669',
    fontWeight: '700',
  },
  tabBtnTextActiveCustomers: {
    color: '#7C3AED',
    fontWeight: '700',
  },
  tabContent: {
    gap: 10,
  },
  customerJellyCard: {
    padding: 14,
    borderRadius: Radius.md,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  customerSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  dueBadge: {
    backgroundColor: '#FFE4E6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dueBadgeText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#E11D48',
  },
  upcomingBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  upcomingBadgeText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1A6FD6',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  detailLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  detailValueOverdue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E11D48',
  },
  detailValueFine: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D97706',
  },
  detailValuePrimary: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1A6FD6',
  },
  actionButtonRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  callButton: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: Radius.md,
    gap: 5,
  },
  callButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A6FD6',
  },
  whatsAppButton: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: Radius.md,
    gap: 5,
  },
  whatsAppButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  collectButton: {
    flex: 1.2,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A6FD6',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: Radius.md,
    gap: 5,
    shadowColor: '#1A6FD6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  collectButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
  ledgerRowCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  ledgerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ledgerCustomerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  ledgerSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  ledgerAmountCol: {
    alignItems: 'flex-end',
  },
  ledgerAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  statusBadgeApproved: {
    backgroundColor: '#ECFDF5',
  },
  statusBadgePending: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeRejected: {
    backgroundColor: '#FFE4E6',
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  statusBadgeTextApproved: {
    color: '#059669',
  },
  statusBadgeTextPending: {
    color: '#D97706',
  },
  statusBadgeTextRejected: {
    color: '#E11D48',
  },
  utrText: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 6,
  },
  customerDirectoryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  custDirLeft: {
    flex: 1,
  },
  custDirName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  custDirSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  custDirRight: {
    flexDirection: 'row',
    gap: 8,
  },
  custDirCallBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  custDirCollectBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  custDirWaBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalCustomerName: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: Spacing.md,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: Spacing.md,
  },
  rupeePrefix: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: Spacing.md,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  modeBtnActive: {
    borderColor: '#1A6FD6',
    backgroundColor: '#EFF6FF',
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  modeBtnTextActive: {
    color: '#1A6FD6',
    fontWeight: '700',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: Spacing.md,
  },
  submitPaymentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: Radius.md,
    gap: 8,
    marginTop: 6,
  },
  submitPaymentBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
