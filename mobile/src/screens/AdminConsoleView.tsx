// mobile/src/screens/AdminConsoleView.tsx
// 100% Native Mobile App Experience for Super Admin
// Executive Command Center: Real Portfolio KPIs, 1-Tap Approvals Queue, Retailer Directory, Customer Master & Push Broadcasts

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
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  PhoneCall,
  Search,
  Users,
  Store,
  Send,
  AlertTriangle,
  TrendingUp,
  Sparkles,
  ChevronRight,
  X,
  Bell,
  Check,
} from 'lucide-react-native';
import { CountUp } from '../components/CountUp';
import { JellyCard } from '../components/JellyCard';
import { PressableScale } from '../components/PressableScale';
import { PORTAL_BASE_URL } from '../config';
import { Colors } from '../constants/colors';
import { Spacing, Radius, Shadow } from '../constants/design';
import { useAuth } from '../context/AuthContext';

interface AdminSummary {
  totalCustomers: number;
  runningCount: number;
  completedCount: number;
  settledCount: number;
  totalDisbursed: number;
  totalCollected: number;
  overdueCount: number;
  overdueAmount: number;
  pendingApprovalsCount: number;
  retailersCount: number;
}

interface PendingApproval {
  id: string;
  customer_id: string;
  customer_name: string;
  mobile: string;
  imei: string;
  retailer_name: string;
  total_amount: number;
  fine_amount: number;
  mode: string;
  utr: string;
  created_at: string;
}

interface RetailerPartner {
  id: string;
  name: string;
  username: string;
  mobile: string | null;
  isActive: boolean;
  activeCount: number;
  disbursed: number;
  collected: number;
}

interface AdminCustomer {
  id: string;
  customer_name: string;
  mobile: string | null;
  imei: string | null;
  status: string;
  purchase_value: number | null;
  retailer_name: string;
  created_at: string | null;
}

interface AdminConsoleViewProps {
  onSwitchAccount?: () => void;
  onSwitchToCustomer?: () => void;
}

export const AdminConsoleView: React.FC<AdminConsoleViewProps> = ({
  onSwitchAccount,
  onSwitchToCustomer,
}) => {
  const { staffUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'approvals' | 'retailers' | 'customers'>('approvals');
  const [searchQuery, setSearchQuery] = useState('');

  // Smooth tab transition physics
  const tabFadeAnim = useRef(new Animated.Value(1)).current;
  const tabSlideAnim = useRef(new Animated.Value(0)).current;

  const handleSelectTab = (tab: 'approvals' | 'retailers' | 'customers') => {
    if (tab === activeTab) return;
    Haptics.selectionAsync();
    tabFadeAnim.setValue(0);
    tabSlideAnim.setValue(10);
    setActiveTab(tab);
    Animated.parallel([
      Animated.timing(tabFadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(tabSlideAnim, {
        toValue: 0,
        tension: 300,
        friction: 20,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Data states
  const [summary, setSummary] = useState<AdminSummary>({
    totalCustomers: 0,
    runningCount: 0,
    completedCount: 0,
    settledCount: 0,
    totalDisbursed: 0,
    totalCollected: 0,
    overdueCount: 0,
    overdueAmount: 0,
    pendingApprovalsCount: 0,
    retailersCount: 0,
  });
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [retailers, setRetailers] = useState<RetailerPartner[]>([]);
  const [recentCustomers, setRecentCustomers] = useState<AdminCustomer[]>([]);

  // Action states
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Reject Modal
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState('');
  const [rejectReason, setRejectReason] = useState('Payment details verification failed');

  // Broadcast Modal
  const [broadcastModalVisible, setBroadcastModalVisible] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  const loadAdminData = useCallback(async () => {
    try {
      const res = await fetch(`${PORTAL_BASE_URL}/api/mobile/admin`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.summary) setSummary(data.summary);
        if (data.pendingApprovals) setPendingApprovals(data.pendingApprovals);
        if (data.retailers) setRetailers(data.retailers);
        if (data.recentCustomers) setRecentCustomers(data.recentCustomers);
      }
    } catch (e) {
      console.warn('Failed to load admin mobile data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadAdminData();
    setRefreshing(false);
  };

  // 1-Tap Approve Action
  const handleApprove = async (item: PendingApproval) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setProcessingId(item.id);

    try {
      const res = await fetch(`${PORTAL_BASE_URL}/api/mobile/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          request_id: item.id,
          remark: 'Approved via Native Admin App',
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Remove approved item immediately from list
        setPendingApprovals(prev => prev.filter(p => p.id !== item.id));
        setSummary(prev => ({
          ...prev,
          pendingApprovalsCount: Math.max(0, prev.pendingApprovalsCount - 1),
          totalCollected: prev.totalCollected + item.total_amount,
        }));
        Alert.alert('Approved!', `Payment of ₹${item.total_amount} approved and settled.`);
      } else {
        Alert.alert('Approval Failed', json.error || 'Server error.');
      }
    } catch (e: any) {
      Alert.alert('Network Error', e?.message || 'Failed to connect to server.');
    } finally {
      setProcessingId(null);
    }
  };

  // Open Reject Modal
  const openRejectModal = (id: string) => {
    Haptics.selectionAsync();
    setRejectTargetId(id);
    setRejectReason('Payment details verification failed');
    setRejectModalVisible(true);
  };

  // Confirm Reject Action
  const handleConfirmReject = async () => {
    if (!rejectTargetId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setProcessingId(rejectTargetId);
    setRejectModalVisible(false);

    try {
      const res = await fetch(`${PORTAL_BASE_URL}/api/mobile/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          request_id: rejectTargetId,
          reason: rejectReason.trim() || 'Payment verification rejected by admin',
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setPendingApprovals(prev => prev.filter(p => p.id !== rejectTargetId));
        setSummary(prev => ({
          ...prev,
          pendingApprovalsCount: Math.max(0, prev.pendingApprovalsCount - 1),
        }));
        Alert.alert('Payment Rejected', 'Request rejected and customer balance restored.');
      } else {
        Alert.alert('Rejection Failed', json.error || 'Server error.');
      }
    } catch (e: any) {
      Alert.alert('Network Error', e?.message || 'Failed to connect.');
    } finally {
      setProcessingId(null);
    }
  };

  // Send Broadcast
  const handleSendBroadcast = async () => {
    if (!broadcastMessage.trim()) {
      Alert.alert('Empty Message', 'Please enter a message to broadcast.');
      return;
    }

    setSendingBroadcast(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const res = await fetch(`${PORTAL_BASE_URL}/api/mobile/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'broadcast',
          message: broadcastMessage.trim(),
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Broadcast Sent!', 'Push notification dispatched across the network.');
        setBroadcastMessage('');
        setBroadcastModalVisible(false);
      } else {
        Alert.alert('Broadcast Failed', json.error || 'Could not send broadcast.');
      }
    } catch (e: any) {
      Alert.alert('Network Error', e?.message || 'Failed to send.');
    } finally {
      setSendingBroadcast(false);
    }
  };

  // Call Action
  const handleCall = (mobile: string | null, name: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!mobile) {
      Alert.alert('No Mobile', `No phone registered for ${name}.`);
      return;
    }
    Linking.openURL(`tel:${mobile}`);
  };

  // Filtered queries
  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return recentCustomers;
    const q = searchQuery.toLowerCase().trim();
    return recentCustomers.filter(
      c =>
        c.customer_name?.toLowerCase().includes(q) ||
        c.mobile?.includes(q) ||
        c.imei?.includes(q) ||
        c.retailer_name?.toLowerCase().includes(q)
    );
  }, [recentCustomers, searchQuery]);

  const filteredRetailers = useMemo(() => {
    if (!searchQuery.trim()) return retailers;
    const q = searchQuery.toLowerCase().trim();
    return retailers.filter(
      r =>
        r.name?.toLowerCase().includes(q) ||
        r.username?.toLowerCase().includes(q) ||
        r.mobile?.includes(q)
    );
  }, [retailers, searchQuery]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Initializing Super Admin Console...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary, '#8B5CF6']}
          />
        }
      >
        {/* Executive Header Banner */}
        <LinearGradient
          colors={['#0F172A', '#1E1B4B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerCard}
        >
          <View style={styles.headerRow}>
            <View style={styles.headerShieldBox}>
              <Shield size={24} color="#A855F7" />
            </View>
            <View style={styles.headerInfo}>
              <View style={styles.adminBadge}>
                <Text style={styles.adminBadgeText}>ADMIN CONTROL CENTER</Text>
              </View>
              <Text style={styles.adminTitle}>Telepoint Administrator</Text>
            </View>
          </View>

          {/* Broadcast Quick Action Button */}
          <PressableScale
            onPress={() => {
              Haptics.selectionAsync();
              setBroadcastModalVisible(true);
            }}
            style={styles.broadcastBannerBtn}
            scaleTo={0.95}
          >
            <Bell size={16} color="#FFFFFF" />
            <Text style={styles.broadcastBannerBtnText}>Send Push Notification</Text>
          </PressableScale>
        </LinearGradient>

        {/* Portfolio Living Jelly Cards */}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>PORTFOLIO OVERVIEW</Text>
            <View style={styles.livePulsePill}>
              <Sparkles size={11} color="#10B981" />
              <Text style={styles.livePulseText}>LIVE</Text>
            </View>
          </View>
          <View style={styles.syncStatusRow}>
            <View style={styles.purpleDot} />
            <Text style={styles.syncStatusText}>Central HQ Active</Text>
          </View>
        </View>

        <View style={styles.kpiGrid}>
          {/* Disbursed */}
          <JellyCard accentColor="#1A6FD6" style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>TOTAL FINANCED</Text>
            <CountUp
              end={summary.totalDisbursed}
              prefix="₹"
              style={[styles.kpiValue, { color: '#1A6FD6' }]}
              duration={700}
            />
            <Text style={styles.kpiSub}>Disbursed customer loans</Text>
          </JellyCard>

          {/* Collected */}
          <JellyCard accentColor="#10B981" style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>TOTAL COLLECTED</Text>
            <CountUp
              end={summary.totalCollected}
              prefix="₹"
              style={[styles.kpiValue, { color: '#059669' }]}
              duration={700}
            />
            <Text style={styles.kpiSub}>Received EMI payments</Text>
          </JellyCard>

          {/* Overdue Risk */}
          <JellyCard accentColor="#E11D48" style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>OVERDUE DUES</Text>
            <CountUp
              end={summary.overdueAmount}
              prefix="₹"
              style={[styles.kpiValue, { color: '#E11D48' }]}
              duration={700}
            />
            <Text style={styles.kpiSub}>{summary.overdueCount} accounts overdue</Text>
          </JellyCard>

          {/* Running Portfolios */}
          <JellyCard accentColor="#8B5CF6" style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>ACTIVE LOANS</Text>
            <Text style={[styles.kpiValue, { color: '#7C3AED' }]}>
              {summary.runningCount}
            </Text>
            <Text style={styles.kpiSub}>{summary.retailersCount} partner stores</Text>
          </JellyCard>
        </View>

        {/* Global Search Bar */}
        <View style={styles.searchContainer}>
          <Search size={18} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search accounts, retailers, mobile..."
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

        {/* Segmented Navigation Tabs */}
        <View style={styles.tabBar}>
          <PressableScale
            onPress={() => handleSelectTab('approvals')}
            style={[styles.tabBtn, activeTab === 'approvals' && styles.tabBtnActive]}
            scaleTo={0.94}
          >
            <CheckCircle2
              size={15}
              color={activeTab === 'approvals' ? '#059669' : '#64748B'}
            />
            <Text
              style={[
                styles.tabBtnText,
                activeTab === 'approvals' && styles.tabBtnTextActiveApprovals,
              ]}
            >
              Approvals ({pendingApprovals.length})
            </Text>
          </PressableScale>

          <PressableScale
            onPress={() => handleSelectTab('retailers')}
            style={[styles.tabBtn, activeTab === 'retailers' && styles.tabBtnActive]}
            scaleTo={0.94}
          >
            <Store
              size={15}
              color={activeTab === 'retailers' ? '#1A6FD6' : '#64748B'}
            />
            <Text
              style={[
                styles.tabBtnText,
                activeTab === 'retailers' && styles.tabBtnTextActiveRetailers,
              ]}
            >
              Stores ({retailers.length})
            </Text>
          </PressableScale>

          <PressableScale
            onPress={() => handleSelectTab('customers')}
            style={[styles.tabBtn, activeTab === 'customers' && styles.tabBtnActive]}
            scaleTo={0.94}
          >
            <Users
              size={15}
              color={activeTab === 'customers' ? '#8B5CF6' : '#64748B'}
            />
            <Text
              style={[
                styles.tabBtnText,
                activeTab === 'customers' && styles.tabBtnTextActiveCustomers,
              ]}
            >
              Customers ({recentCustomers.length})
            </Text>
          </PressableScale>
        </View>

        {/* Animated Tab Content with Smooth Transitions */}
        <Animated.View
          style={[
            styles.tabContentContainer,
            { opacity: tabFadeAnim, transform: [{ translateY: tabSlideAnim }] },
          ]}
        >
        {/* TAB 1: APPROVALS QUEUE (Priority 1-Tap Actions) */}
        {activeTab === 'approvals' && (
          <View style={styles.tabContent}>
            {pendingApprovals.length === 0 ? (
              <View style={styles.emptyCard}>
                <CheckCircle2 size={36} color="#10B981" />
                <Text style={styles.emptyTitle}>Approvals Queue Clear!</Text>
                <Text style={styles.emptySub}>
                  No payment collections are pending administrative review.
                </Text>
              </View>
            ) : (
              pendingApprovals.map(item => {
                const isProcessing = processingId === item.id;

                return (
                  <JellyCard
                    key={item.id}
                    accentColor="#F59E0B"
                    style={styles.approvalJellyCard}
                  >
                    <View style={styles.approvalTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.approvalCustomer}>{item.customer_name}</Text>
                        <Text style={styles.approvalSub}>
                          Store: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{item.retailer_name}</Text>
                        </Text>
                        <Text style={styles.approvalSub}>
                          IMEI: {item.imei || 'N/A'} • {item.mode || 'CASH'}
                        </Text>
                      </View>
                      <View style={styles.amountCol}>
                        <Text style={styles.approvalAmount}>
                          ₹{item.total_amount.toLocaleString('en-IN')}
                        </Text>
                        <View style={styles.pendingBadge}>
                          <Text style={styles.pendingBadgeText}>PENDING</Text>
                        </View>
                      </View>
                    </View>

                    {item.utr ? (
                      <View style={styles.utrBox}>
                        <Text style={styles.utrLabel}>UTR / Reference:</Text>
                        <Text style={styles.utrVal}>{item.utr}</Text>
                      </View>
                    ) : null}

                    {/* 1-Tap Action Controls */}
                    <View style={styles.approvalActionRow}>
                      <PressableScale
                        onPress={() => openRejectModal(item.id)}
                        disabled={isProcessing}
                        style={styles.rejectBtn}
                        scaleTo={0.92}
                      >
                        <XCircle size={15} color="#E11D48" />
                        <Text style={styles.rejectBtnText}>Reject</Text>
                      </PressableScale>

                      <PressableScale
                        onPress={() => handleApprove(item)}
                        disabled={isProcessing}
                        style={styles.approveBtn}
                        scaleTo={0.92}
                      >
                        {isProcessing ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <>
                            <Check size={16} color="#FFFFFF" />
                            <Text style={styles.approveBtnText}>Approve Payment</Text>
                          </>
                        )}
                      </PressableScale>
                    </View>
                  </JellyCard>
                );
              })
            )}
          </View>
        )}

        {/* TAB 2: PARTNER RETAILERS DIRECTORY */}
        {activeTab === 'retailers' && (
          <View style={styles.tabContent}>
            {filteredRetailers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Store size={36} color="#64748B" />
                <Text style={styles.emptyTitle}>No Retailers Found</Text>
              </View>
            ) : (
              filteredRetailers.map(r => (
                <JellyCard key={r.id} accentColor="#1A6FD6" style={styles.retailerCard}>
                  <View style={styles.retailerTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.retailerName}>{r.name}</Text>
                      <Text style={styles.retailerUsername}>
                        Username: @{r.username}
                      </Text>
                    </View>
                    <PressableScale
                      onPress={() => handleCall(r.mobile, r.name)}
                      style={styles.callStoreBtn}
                      scaleTo={0.9}
                    >
                      <PhoneCall size={15} color="#FFFFFF" />
                      <Text style={styles.callStoreBtnText}>Call Store</Text>
                    </PressableScale>
                  </View>

                  <View style={styles.retailerStatsRow}>
                    <View style={styles.retailerStatBox}>
                      <Text style={styles.retStatLabel}>ACTIVE PHONES</Text>
                      <Text style={styles.retStatVal}>{r.activeCount}</Text>
                    </View>
                    <View style={styles.retailerStatBox}>
                      <Text style={styles.retStatLabel}>DISBURSED</Text>
                      <Text style={styles.retStatVal}>
                        ₹{r.disbursed.toLocaleString('en-IN')}
                      </Text>
                    </View>
                    <View style={styles.retailerStatBox}>
                      <Text style={styles.retStatLabel}>COLLECTED</Text>
                      <Text style={[styles.retStatVal, { color: '#059669' }]}>
                        ₹{r.collected.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>
                </JellyCard>
              ))
            )}
          </View>
        )}

        {/* TAB 3: BORROWERS DIRECTORY */}
        {activeTab === 'customers' && (
          <View style={styles.tabContent}>
            {filteredCustomers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Users size={36} color="#64748B" />
                <Text style={styles.emptyTitle}>No Customers Found</Text>
              </View>
            ) : (
              filteredCustomers.map(c => {
                const isRunning = c.status === 'RUNNING';
                const isCompleted = c.status === 'COMPLETED';

                return (
                  <View key={c.id} style={styles.borrowerCard}>
                    <View style={styles.borrowerLeft}>
                      <Text style={styles.borrowerName}>{c.customer_name}</Text>
                      <Text style={styles.borrowerSub}>
                        {c.mobile || 'No Phone'} • Store: {c.retailer_name}
                      </Text>
                      <Text style={styles.borrowerImei}>IMEI: {c.imei || 'N/A'}</Text>
                    </View>
                    <View style={styles.borrowerRight}>
                      <View
                        style={[
                          styles.statusPill,
                          isRunning && styles.statusPillRunning,
                          isCompleted && styles.statusPillCompleted,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            isRunning && styles.statusPillTextRunning,
                            isCompleted && styles.statusPillTextCompleted,
                          ]}
                        >
                          {c.status}
                        </Text>
                      </View>
                      <PressableScale
                        onPress={() => handleCall(c.mobile, c.customer_name)}
                        style={styles.borrowerCallBtn}
                        scaleTo={0.9}
                      >
                        <PhoneCall size={14} color="#1A6FD6" />
                      </PressableScale>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
        </Animated.View>
      </ScrollView>

      {/* REJECT MODAL */}
      <Modal
        visible={rejectModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reject Payment Request</Text>
              <TouchableOpacity onPress={() => setRejectModalVisible(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Reason for Rejection</Text>
            <TextInput
              style={styles.textArea}
              multiline
              numberOfLines={3}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="e.g. UTR mismatch, payment not received in bank account"
              placeholderTextColor="#94A3B8"
            />

            <PressableScale
              onPress={handleConfirmReject}
              style={styles.confirmRejectBtn}
              scaleTo={0.95}
            >
              <Text style={styles.confirmRejectBtnText}>Confirm Rejection</Text>
            </PressableScale>
          </View>
        </View>
      </Modal>

      {/* BROADCAST MESSAGE MODAL */}
      <Modal
        visible={broadcastModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBroadcastModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Network Broadcast Message</Text>
              <TouchableOpacity onPress={() => setBroadcastModalVisible(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Announcement Content</Text>
            <TextInput
              style={styles.textArea}
              multiline
              numberOfLines={4}
              value={broadcastMessage}
              onChangeText={setBroadcastMessage}
              placeholder="Write urgent reminder or announcement for customers & retail stores..."
              placeholderTextColor="#94A3B8"
            />

            <PressableScale
              onPress={handleSendBroadcast}
              disabled={sendingBroadcast}
              style={styles.sendBroadcastBtn}
              scaleTo={0.95}
            >
              {sendingBroadcast ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Send size={16} color="#FFFFFF" />
                  <Text style={styles.sendBroadcastBtnText}>Dispatch Push Notification</Text>
                </>
              )}
            </PressableScale>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
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
  headerCard: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerShieldBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerInfo: {
    flex: 1,
  },
  adminBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  adminBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#C084FC',
    letterSpacing: 0.5,
  },
  adminTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  broadcastBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF6',
    paddingVertical: 10,
    borderRadius: Radius.md,
    gap: 8,
  },
  broadcastBannerBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
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
  livePulsePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  livePulseText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  syncStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F5F3FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  purpleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8B5CF6',
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: Spacing.md,
  },
  kpiCard: {
    width: '48%',
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
    padding: 3,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: Radius.sm,
    gap: 4,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    ...Shadow.sm,
  },
  tabBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  tabBtnTextActiveApprovals: {
    color: '#059669',
    fontWeight: '700',
  },
  tabBtnTextActiveRetailers: {
    color: '#1A6FD6',
    fontWeight: '700',
  },
  tabBtnTextActiveCustomers: {
    color: '#8B5CF6',
    fontWeight: '700',
  },
  tabContent: {
    gap: 10,
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
  approvalJellyCard: {
    padding: 14,
    borderRadius: Radius.md,
  },
  approvalTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  approvalCustomer: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  approvalSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  amountCol: {
    alignItems: 'flex-end',
  },
  approvalAmount: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  pendingBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  pendingBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#D97706',
  },
  utrBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    padding: 8,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  utrLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  utrVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1A6FD6',
    marginTop: 2,
  },
  approvalActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFE4E6',
    paddingVertical: 8,
    borderRadius: Radius.sm,
    gap: 6,
  },
  rejectBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E11D48',
  },
  approveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 8,
    borderRadius: Radius.sm,
    gap: 6,
  },
  approveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  retailerCard: {
    padding: 14,
    borderRadius: Radius.md,
  },
  retailerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  retailerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  retailerUsername: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  callStoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    gap: 4,
  },
  callStoreBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  retailerStatsRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.sm,
    padding: 8,
  },
  retailerStatBox: {
    flex: 1,
    alignItems: 'center',
  },
  retStatLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  retStatVal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  borrowerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  borrowerLeft: {
    flex: 1,
  },
  borrowerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  borrowerSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  borrowerImei: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  borrowerRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
  },
  statusPillRunning: {
    backgroundColor: '#EFF6FF',
  },
  statusPillCompleted: {
    backgroundColor: '#ECFDF5',
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
  },
  statusPillTextRunning: {
    color: '#1A6FD6',
  },
  statusPillTextCompleted: {
    color: '#059669',
  },
  borrowerCallBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: Spacing.md,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: Radius.md,
    padding: 12,
    fontSize: 13,
    color: '#0F172A',
    textAlignVertical: 'top',
    height: 90,
    marginBottom: Spacing.md,
  },
  confirmRejectBtn: {
    backgroundColor: '#E11D48',
    paddingVertical: 12,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  confirmRejectBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sendBroadcastBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF6',
    paddingVertical: 12,
    borderRadius: Radius.md,
    gap: 8,
  },
  sendBroadcastBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
