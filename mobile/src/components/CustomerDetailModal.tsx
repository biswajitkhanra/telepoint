// components/CustomerDetailModal.tsx
// 100% Native High-Fidelity Customer & Loan Ledger Modal
// IDFC First Bank Clarity + Jupiter Delight: Complete Loan Breakdown, Device IMEI,
// Progress Bar, Live Fine Calculations, and Full Month-by-Month Installment Schedule

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
  Clipboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  X,
  Smartphone,
  PhoneCall,
  MessageCircle,
  Calendar,
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
  Store,
  Shield,
  Copy,
  Check,
  Zap,
} from 'lucide-react-native';
import { PORTAL_BASE_URL } from '../config';
import { Customer, EMIScheduleItem, DueBreakdown } from '../types';
import { Colors } from '../constants/colors';
import { Spacing, Radius, Shadow } from '../constants/design';
import { PressableScale } from './PressableScale';

interface CustomerDetailModalProps {
  visible: boolean;
  customerId: string | null;
  onClose: () => void;
  isAdmin?: boolean;
  onCollectPayment?: (customer: { id: string; name: string; dueAmount: number; emiNo: number }) => void;
  onRefreshParent?: () => void;
}

export const CustomerDetailModal: React.FC<CustomerDetailModalProps> = ({
  visible,
  customerId,
  onClose,
  isAdmin = false,
  onCollectPayment,
  onRefreshParent,
}) => {
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [emis, setEmis] = useState<EMIScheduleItem[]>([]);
  const [breakdown, setBreakdown] = useState<DueBreakdown | null>(null);
  const [copiedImei, setCopiedImei] = useState(false);

  useEffect(() => {
    if (!visible || !customerId) {
      setCustomer(null);
      setEmis([]);
      setBreakdown(null);
      setLoading(true);
      return;
    }

    let active = true;
    setLoading(true);

    const fetchCustomerData = async () => {
      try {
        const res = await fetch(`${PORTAL_BASE_URL}/api/customer-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer_id: customerId }),
        });

        if (res.ok && active) {
          const data = await res.json();
          if (data.customer) setCustomer(data.customer);
          if (data.emis) setEmis(data.emis);
          if (data.breakdown) setBreakdown(data.breakdown);
        }
      } catch (e) {
        console.warn('Failed to load customer detail modal data:', e);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchCustomerData();

    return () => {
      active = false;
    };
  }, [visible, customerId]);

  // Derived progress and calculations
  const totalTenure = customer?.emi_tenure || emis.length || 0;
  const paidEmis = useMemo(() => emis.filter(e => e.status === 'APPROVED'), [emis]);
  const paidCount = paidEmis.length;
  const progressPercent = totalTenure > 0 ? Math.min(100, Math.round((paidCount / totalTenure) * 100)) : 0;

  // Unpaid or pending EMIs
  const unpaidEmis = useMemo(
    () => emis.filter(e => e.status === 'UNPAID' || e.status === 'PARTIALLY_PAID'),
    [emis]
  );
  const nextUnpaidEmi = unpaidEmis.length > 0 ? unpaidEmis[0] : null;

  const totalOutstandingFine = useMemo(
    () =>
      emis.reduce((sum, e) => {
        if (e.fine_waived) return sum;
        return sum + Math.max(0, Number(e.fine_amount || 0) - Number(e.fine_paid_amount || 0));
      }, 0),
    [emis]
  );

  const totalPayableNow = useMemo(() => {
    if (breakdown?.total_payable) return breakdown.total_payable;
    const nextAmount = Number(nextUnpaidEmi?.amount || 0);
    return nextAmount + totalOutstandingFine;
  }, [breakdown, nextUnpaidEmi, totalOutstandingFine]);

  const handleCopyImei = (imei: string) => {
    Haptics.selectionAsync();
    Clipboard.setString(imei);
    setCopiedImei(true);
    setTimeout(() => setCopiedImei(false), 2000);
  };

  const handleCall = (phone?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!phone) {
      Alert.alert('No Phone', 'No contact number available for this customer.');
      return;
    }
    Linking.openURL(`tel:${phone}`);
  };

  const handleWhatsApp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!customer?.mobile) {
      Alert.alert('No Mobile', 'No WhatsApp number available for this customer.');
      return;
    }
    const cleanNum = customer.mobile.replace(/\D/g, '').slice(-10);
    const msg = encodeURIComponent(
      `Dear ${customer.customer_name}, this is an official update regarding your smartphone EMI on ${customer.model_no || 'your phone'} (IMEI: ${customer.imei}). Next EMI amount: ₹${totalPayableNow.toLocaleString('en-IN')}. Please pay online or at your retail store to keep your device active. Central Helpline: 7003617029.`
    );
    Linking.openURL(`https://wa.me/91${cleanNum}?text=${msg}`);
  };

  const handleTriggerCollect = () => {
    if (!customer) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
    if (onCollectPayment) {
      onCollectPayment({
        id: customer.id,
        name: customer.customer_name,
        dueAmount: totalPayableNow,
        emiNo: nextUnpaidEmi?.emi_no || 1,
      });
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.sheetContainer}>
          {/* Top Drag Indicator */}
          <View style={styles.dragPill} />

          {/* Modal Header */}
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <View style={styles.codeRow}>
                <View style={styles.codePill}>
                  <Text style={styles.codeText}>
                    {customer?.customer_code || `TP-${(customerId || '').slice(0, 6).toUpperCase()}`}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    customer?.status === 'COMPLETE' && styles.statusComplete,
                    customer?.status === 'SETTLED' && styles.statusSettled,
                    customer?.status === 'NPA' && styles.statusNpa,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      customer?.status === 'COMPLETE' && styles.statusCompleteText,
                      customer?.status === 'SETTLED' && styles.statusSettledText,
                      customer?.status === 'NPA' && styles.statusNpaText,
                    ]}
                  >
                    {customer?.status || 'RUNNING'}
                  </Text>
                </View>
              </View>
              <Text style={styles.customerName}>{customer?.customer_name || 'Customer Profile'}</Text>
              {customer?.father_name ? (
                <Text style={styles.fatherName}>Father: {customer.father_name}</Text>
              ) : null}
            </View>

            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingSub}>Loading complete loan ledger & schedule...</Text>
            </View>
          ) : !customer ? (
            <View style={styles.loadingBox}>
              <AlertCircle size={36} color="#DC2626" />
              <Text style={styles.errorTitle}>Could not load customer file</Text>
              <Text style={styles.loadingSub}>Please check network or try again.</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
              {/* Financed Device & Contract Banner */}
              <LinearGradient
                colors={['#0F172A', '#1E293B']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.deviceBanner}
              >
                <View style={styles.deviceTopRow}>
                  <View style={styles.deviceIconCircle}>
                    <Smartphone size={22} color="#38BDF8" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.deviceModel}>{customer.model_no || 'Smartphone Financed'}</Text>
                    <TouchableOpacity
                      onPress={() => handleCopyImei(customer.imei)}
                      style={styles.imeiRow}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.imeiText}>IMEI: {customer.imei}</Text>
                      {copiedImei ? (
                        <Check size={13} color="#10B981" />
                      ) : (
                        <Copy size={13} color="#94A3B8" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {customer.retailer?.name ? (
                  <View style={styles.retailerRow}>
                    <Store size={14} color="#94A3B8" />
                    <Text style={styles.retailerText}>Purchased at: {customer.retailer.name}</Text>
                  </View>
                ) : null}

                {/* Progress Bar */}
                <View style={styles.progressSection}>
                  <View style={styles.progressLabelRow}>
                    <Text style={styles.progressLabel}>Loan Repayment Progress</Text>
                    <Text style={styles.progressValue}>
                      {paidCount} of {totalTenure} EMIs Paid ({progressPercent}%)
                    </Text>
                  </View>
                  <View style={styles.progressBarTrack}>
                    <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
                  </View>
                </View>

                {/* 3-Column Financial Overview */}
                <View style={styles.financialGrid}>
                  <View style={styles.financialCol}>
                    <Text style={styles.financialLabel}>PURCHASE VALUE</Text>
                    <Text style={styles.financialVal}>₹{customer.purchase_value.toLocaleString('en-IN')}</Text>
                  </View>
                  <View style={styles.financialCol}>
                    <Text style={styles.financialLabel}>DOWN PAYMENT</Text>
                    <Text style={styles.financialVal}>₹{customer.down_payment.toLocaleString('en-IN')}</Text>
                  </View>
                  <View style={styles.financialCol}>
                    <Text style={styles.financialLabel}>LOAN AMOUNT</Text>
                    <Text style={[styles.financialVal, { color: '#38BDF8' }]}>
                      ₹{(customer.disburse_amount || (customer.purchase_value - customer.down_payment)).toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>
              </LinearGradient>

              {/* Quick Contact & Action Buttons */}
              <View style={styles.contactRow}>
                <PressableScale onPress={() => handleCall(customer.mobile)} style={styles.callPrimaryBtn} scaleTo={0.94}>
                  <PhoneCall size={16} color="#FFFFFF" />
                  <Text style={styles.callPrimaryText}>Call Customer</Text>
                </PressableScale>

                {customer.alternate_number_1 ? (
                  <PressableScale onPress={() => handleCall(customer.alternate_number_1)} style={styles.callAltBtn} scaleTo={0.94}>
                    <PhoneCall size={15} color="#2563EB" />
                    <Text style={styles.callAltText}>Alt Call</Text>
                  </PressableScale>
                ) : null}

                <PressableScale onPress={handleWhatsApp} style={styles.whatsappBtn} scaleTo={0.94}>
                  <MessageCircle size={16} color="#FFFFFF" />
                  <Text style={styles.whatsappBtnText}>WhatsApp</Text>
                </PressableScale>
              </View>

              {/* Amount Due Card (if active loan) */}
              {customer.status === 'RUNNING' && (
                <View style={styles.dueCard}>
                  <View style={styles.dueCardHeader}>
                    <View style={styles.dueTitleCol}>
                      <Text style={styles.dueCardTitle}>CURRENT AMOUNT PAYABLE</Text>
                      {nextUnpaidEmi ? (
                        <Text style={styles.dueCardSub}>
                          EMI #{nextUnpaidEmi.emi_no} • Due on {nextUnpaidEmi.due_date}
                        </Text>
                      ) : (
                        <Text style={styles.dueCardSub}>All scheduled EMIs settled</Text>
                      )}
                    </View>
                    <Text style={styles.dueCardAmount}>₹{totalPayableNow.toLocaleString('en-IN')}</Text>
                  </View>

                  {totalOutstandingFine > 0 && (
                    <View style={styles.fineRow}>
                      <AlertCircle size={14} color="#E11D48" />
                      <Text style={styles.fineText}>
                        Includes ₹{totalOutstandingFine.toLocaleString('en-IN')} late fine accrued
                      </Text>
                    </View>
                  )}

                  {onCollectPayment && (
                    <PressableScale onPress={handleTriggerCollect} style={styles.collectNowBtn} scaleTo={0.95}>
                      <CreditCard size={17} color="#FFFFFF" />
                      <Text style={styles.collectNowText}>Collect ₹{totalPayableNow.toLocaleString('en-IN')} Now</Text>
                    </PressableScale>
                  )}
                </View>
              )}

              {/* Complete Month-by-Month Installment Ledger */}
              <View style={styles.scheduleHeaderRow}>
                <Calendar size={16} color="#0F172A" />
                <Text style={styles.scheduleHeaderTitle}>MONTH-BY-MONTH EMI SCHEDULE</Text>
              </View>

              <View style={styles.scheduleList}>
                {emis.map(e => {
                  const isPaid = e.status === 'APPROVED';
                  const isPartial = e.status === 'PARTIALLY_PAID';
                  const isPending = e.status === 'PENDING_APPROVAL';

                  return (
                    <View
                      key={e.id || `${e.emi_no}`}
                      style={[
                        styles.emiRowCard,
                        isPaid && styles.emiCardPaid,
                        isPending && styles.emiCardPending,
                      ]}
                    >
                      <View style={styles.emiNoCircle}>
                        <Text style={[styles.emiNoText, isPaid && { color: '#059669' }]}>#{e.emi_no}</Text>
                      </View>

                      <View style={styles.emiMidCol}>
                        <Text style={styles.emiDueDateText}>Due: {e.due_date}</Text>
                        {isPaid && e.paid_at ? (
                          <Text style={styles.emiPaidDetails}>
                            Paid on {e.paid_at.slice(0, 10)} • {e.mode || 'CASH'} {e.utr ? `• UTR: ${e.utr}` : ''}
                          </Text>
                        ) : isPending ? (
                          <Text style={styles.emiPendingDetails}>Awaiting Admin Approval</Text>
                        ) : isPartial ? (
                          <Text style={styles.emiPartialDetails}>
                            ₹{e.partial_paid_amount} paid of ₹{e.amount}
                          </Text>
                        ) : null}

                        {Number(e.fine_amount || 0) > 0 && (
                          <Text
                            style={[
                              styles.emiFineSub,
                              e.fine_waived ? { color: '#059669' } : { color: '#E11D48' },
                            ]}
                          >
                            {e.fine_waived ? 'Fine Waived' : `Late Fine: ₹${e.fine_amount}`}
                          </Text>
                        )}
                      </View>

                      <View style={styles.emiRightCol}>
                        <Text style={[styles.emiAmountVal, isPaid && { color: '#059669' }]}>
                          ₹{Number(e.amount).toLocaleString('en-IN')}
                        </Text>
                        <View
                          style={[
                            styles.emiStatusBadge,
                            isPaid && styles.badgeGreen,
                            isPending && styles.badgeAmber,
                            isPartial && styles.badgeBlue,
                            !isPaid && !isPending && !isPartial && styles.badgeRed,
                          ]}
                        >
                          <Text
                            style={[
                              styles.emiStatusBadgeText,
                              isPaid && styles.badgeGreenText,
                              isPending && styles.badgeAmberText,
                              isPartial && styles.badgeBlueText,
                              !isPaid && !isPending && !isPartial && styles.badgeRedText,
                            ]}
                          >
                            {isPaid ? 'PAID' : isPending ? 'PENDING' : isPartial ? 'PARTIAL' : 'UNPAID'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    paddingTop: 12,
    paddingBottom: 24,
  },
  dragPill: {
    width: 44,
    height: 5,
    backgroundColor: '#CBD5E1',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  codePill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  codeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
    letterSpacing: 0.5,
  },
  statusPill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2563EB',
  },
  statusComplete: { backgroundColor: '#ECFDF5' },
  statusCompleteText: { color: '#059669' },
  statusSettled: { backgroundColor: '#F5F3FF' },
  statusSettledText: { color: '#7C3AED' },
  statusNpa: { backgroundColor: '#FEF2F2' },
  statusNpaText: { color: '#DC2626' },
  customerName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  fatherName: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingBox: {
    padding: Spacing.xl * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingSub: {
    marginTop: 12,
    fontSize: 13,
    color: '#64748B',
  },
  errorTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  scrollBody: {
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  deviceBanner: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  deviceTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  deviceIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deviceModel: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  imeiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  imeiText: {
    fontSize: 12,
    color: '#94A3B8',
    fontFamily: 'monospace',
  },
  retailerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  retailerText: {
    fontSize: 12,
    color: '#CBD5E1',
  },
  progressSection: {
    marginBottom: 14,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  progressValue: {
    fontSize: 11,
    fontWeight: '800',
    color: '#38BDF8',
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#38BDF8',
    borderRadius: 3,
  },
  financialGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 10,
  },
  financialCol: {
    alignItems: 'center',
  },
  financialLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  financialVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  contactRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: Spacing.md,
  },
  callPrimaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1E3A8A',
    paddingVertical: 12,
    borderRadius: Radius.md,
  },
  callPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  callAltBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  callAltText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  whatsappBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: Radius.md,
  },
  whatsappBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dueCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  dueCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dueTitleCol: {
    flex: 1,
  },
  dueCardTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  dueCardSub: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '600',
    marginTop: 2,
  },
  dueCardAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  fineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  fineText: {
    fontSize: 12,
    color: '#E11D48',
    fontWeight: '600',
  },
  collectNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: Radius.md,
    marginTop: 12,
  },
  collectNowText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scheduleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    marginTop: 6,
  },
  scheduleHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  scheduleList: {
    gap: 8,
  },
  emiRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emiCardPaid: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  emiCardPending: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  emiNoCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  emiNoText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  emiMidCol: {
    flex: 1,
  },
  emiDueDateText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  emiPaidDetails: {
    fontSize: 11,
    color: '#059669',
    marginTop: 2,
    fontWeight: '500',
  },
  emiPendingDetails: {
    fontSize: 11,
    color: '#D97706',
    marginTop: 2,
    fontWeight: '600',
  },
  emiPartialDetails: {
    fontSize: 11,
    color: '#2563EB',
    marginTop: 2,
    fontWeight: '500',
  },
  emiFineSub: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  emiRightCol: {
    alignItems: 'flex-end',
  },
  emiAmountVal: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  emiStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  emiStatusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  badgeGreen: { backgroundColor: '#DCFCE7' },
  badgeGreenText: { color: '#16A34A' },
  badgeAmber: { backgroundColor: '#FEF3C7' },
  badgeAmberText: { color: '#D97706' },
  badgeBlue: { backgroundColor: '#DBEAFE' },
  badgeBlueText: { color: '#2563EB' },
  badgeRed: { backgroundColor: '#FEE2E2' },
  badgeRedText: { color: '#DC2626' },
});
