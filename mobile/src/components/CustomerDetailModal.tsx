// mobile/src/components/CustomerDetailModal.tsx
// Complete Native Customer Loan Ledger Modal Sheet
// IDFC / Jupiter Grade: Live Month-by-Month Installments, Financed Device Details,
// Repayment Progress Bar, One-Tap WhatsApp & Call, and Sticky Collect Footer

import React, { useState, useEffect } from 'react';
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
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { Haptics } from '../utils/haptics';
import {
  X,
  Smartphone,
  PhoneCall,
  MessageCircle,
  CreditCard,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Copy,
  Check,
  Building,
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
  onCollectPayment?: (customer: { id: string; name: string; dueAmount: number }) => void;
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
        console.warn('Failed to load customer profile modal:', e);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchCustomerData();

    return () => {
      active = false;
    };
  }, [visible, customerId]);

  const handleCopyImei = async () => {
    if (!customer?.imei) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(customer.imei);
    setCopiedImei(true);
    setTimeout(() => setCopiedImei(false), 2000);
  };

  const handleCall = (num?: string | null) => {
    if (!num) {
      Alert.alert('No Number', 'No phone number available for this contact.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(`tel:${num}`);
  };

  const handleWhatsApp = () => {
    if (!customer?.mobile) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const cleanNum = customer.mobile.replace(/\D/g, '').slice(-10);
    const msg = encodeURIComponent(
      `Hello ${customer.customer_name}, this is Telepoint regarding your financed smartphone (${customer.model_no || 'device'}). Please let us know if you need any assistance with your EMI schedule. Helpline: 7003617029.`
    );
    Linking.openURL(`https://wa.me/91${cleanNum}?text=${msg}`);
  };

  const paidCount = emis.filter(e => e.status === 'APPROVED').length;
  const totalTenure = (customer as any)?.tenure_months || emis.length || 1;
  const progressPercent = Math.min(100, Math.round((paidCount / totalTenure) * 100));

  const nextUnpaidEmi = emis.find(e => e.status === 'UNPAID' || e.status === 'PARTIALLY_PAID');
  const totalOutstandingFine = breakdown?.fine_due || 0;
  const totalPayableNow = breakdown?.total_payable || nextUnpaidEmi?.amount || 0;

  const handleTriggerCollect = () => {
    if (!customer || !onCollectPayment) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onClose();
    onCollectPayment({
      id: customer.id,
      name: customer.customer_name,
      dueAmount: totalPayableNow,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.sheetContainer}>
          {/* Top Sheet Drag Handle & Title */}
          <View style={styles.dragPill} />

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
              <X size={18} color="#64748B" />
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
            <View style={styles.bodyWrapper}>
              <ScrollView
                style={styles.scrollArea}
                showsVerticalScrollIndicator={true}
                contentContainerStyle={styles.scrollBody}
              >
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
                        style={styles.imeiRow}
                        onPress={handleCopyImei}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.imeiText}>IMEI: {customer.imei}</Text>
                        {copiedImei ? <Check size={13} color="#10B981" /> : <Copy size={13} color="#94A3B8" />}
                      </TouchableOpacity>
                    </View>
                  </View>

                  {(customer as any).retailer?.name ? (
                    <View style={styles.retailerRow}>
                      <Building size={14} color="#94A3B8" />
                      <Text style={styles.retailerText}>
                        Store: {(customer as any).retailer.name}
                      </Text>
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

              {/* STICKY FOOTER ACTIONS (ALWAYS VISIBLE AT BOTTOM) */}
              <View style={styles.sheetFooter}>
                <PressableScale onPress={() => handleCall(customer.mobile)} style={styles.footerCallBtn} scaleTo={0.94}>
                  <PhoneCall size={16} color="#1A6FD6" />
                  <Text style={styles.footerCallText}>Call</Text>
                </PressableScale>

                <PressableScale onPress={handleWhatsApp} style={styles.footerWhatsAppBtn} scaleTo={0.94}>
                  <MessageCircle size={16} color="#059669" />
                  <Text style={styles.footerWhatsAppText}>WhatsApp</Text>
                </PressableScale>

                {customer.status === 'RUNNING' && onCollectPayment && (
                  <PressableScale onPress={handleTriggerCollect} style={styles.footerCollectBtn} scaleTo={0.94}>
                    <CreditCard size={16} color="#FFFFFF" />
                    <Text style={styles.footerCollectText}>
                      Collect ₹{totalPayableNow.toLocaleString('en-IN')}
                    </Text>
                  </PressableScale>
                )}
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: '92%',
    maxHeight: '92%',
    maxWidth: 540,
    width: '100%',
    alignSelf: 'center',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 20,
  },
  dragPill: {
    width: 44,
    height: 4,
    backgroundColor: '#CBD5E1',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    flexShrink: 0,
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
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  fatherName: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingBox: {
    flex: 1,
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
  bodyWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  scrollArea: {
    flex: 1,
    minHeight: 0,
  },
  scrollBody: {
    padding: Spacing.md,
    paddingBottom: 24,
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
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
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
    marginTop: 6,
    marginBottom: 14,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  progressValue: {
    fontSize: 11,
    color: '#38BDF8',
    fontWeight: '700',
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
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 10,
  },
  financialCol: {
    flex: 1,
    alignItems: 'center',
  },
  financialLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  financialVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  dueCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1.5,
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
    color: '#1A6FD6',
    fontWeight: '600',
    marginTop: 2,
  },
  dueCardAmount: {
    fontSize: 22,
    fontWeight: '900',
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
    fontSize: 11,
    color: '#E11D48',
    fontWeight: '600',
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
    color: '#64748B',
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
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
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
    fontSize: 10,
    color: '#059669',
    marginTop: 2,
    fontWeight: '600',
  },
  emiPendingDetails: {
    fontSize: 10,
    color: '#D97706',
    marginTop: 2,
    fontWeight: '600',
  },
  emiPartialDetails: {
    fontSize: 10,
    color: '#2563EB',
    marginTop: 2,
    fontWeight: '600',
  },
  emiFineSub: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  emiRightCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  emiAmountVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  emiStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  emiStatusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  badgeGreen: { backgroundColor: '#ECFDF5' },
  badgeGreenText: { fontSize: 9, fontWeight: '800', color: '#059669' },
  badgeAmber: { backgroundColor: '#FEF3C7' },
  badgeAmberText: { fontSize: 9, fontWeight: '800', color: '#D97706' },
  badgeBlue: { backgroundColor: '#EFF6FF' },
  badgeBlueText: { fontSize: 9, fontWeight: '800', color: '#2563EB' },
  badgeRed: { backgroundColor: '#FEF2F2' },
  badgeRedText: { fontSize: 9, fontWeight: '800', color: '#DC2626' },
  sheetFooter: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 10,
    flexShrink: 0,
  },
  footerCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: Radius.md,
  },
  footerCallText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A6FD6',
  },
  footerWhatsAppBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: Radius.md,
  },
  footerWhatsAppText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
  },
  footerCollectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1A6FD6',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    shadowColor: '#1A6FD6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  footerCollectText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
