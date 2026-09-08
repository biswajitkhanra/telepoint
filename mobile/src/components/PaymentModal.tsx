// components/PaymentModal.tsx
// Dedicated Customer UPI Payment Sheet
// Payee VPA: biswajit.khanra82@axl | Payee Name: Telepoint EMI
// Consolidated Payment Rule strictly enforced:
// Total Payable = Base EMI + Late Fine (if any) + 1st EMI Charge (if any)

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  Linking,
  Alert,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  ZoomIn,
} from 'react-native-reanimated';
import { Haptics } from '../utils/haptics';
import { LinearGradient } from 'expo-linear-gradient';
import {
  X,
  Copy,
  Check,
  ShieldCheck,
  Zap,
  ArrowRight,
  Receipt,
  MessageCircle,
  AlertTriangle,
} from 'lucide-react-native';
import { Customer, EMIScheduleItem, DueBreakdown } from '../types';
import { Colors } from '../constants/colors';
import { Spacing, Radius } from '../constants/design';
import { PressableScale } from './PressableScale';
import { getPerEmiFineBreakdown } from '../utils/fineCalc';
import { firstChargeRemaining } from '../utils/firstCharge';
import { customerCodeOf } from '../utils/customerCode';
import { toISTDateString } from '../utils/ist';

interface PaymentModalProps {
  visible: boolean;
  onClose: () => void;
  customer: Customer;
  emis: EMIScheduleItem[];
  breakdown: DueBreakdown | null;
  onSubmitUtr?: (params: { amount: number; utr: string; paymentType: string }) => void;
}

export const TELEPOINT_UPI_ID = 'biswajit.khanra82@axl';
export const TELEPOINT_PAYEE_NAME = 'Telepoint EMI';
export const CENTRAL_HELPLINE = '7003617029';

export const PaymentModal: React.FC<PaymentModalProps> = ({
  visible,
  onClose,
  customer,
  emis,
  breakdown,
  onSubmitUtr,
}) => {
  // 1. Sorted EMIs by due date
  const sortedEmis = useMemo(() => {
    return [...emis].sort(
      (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    );
  }, [emis]);

  const currentMonth = useMemo(() => toISTDateString(new Date()).slice(0, 7), []);

  // 2. Overdue Late Fine Breakdown (exact match with web engine)
  const fineRows = useMemo(() => getPerEmiFineBreakdown(sortedEmis), [sortedEmis]);
  const totalFineRemaining = useMemo(
    () => fineRows.reduce((sum, row) => sum + row.remaining, 0),
    [fineRows]
  );
  const fineEmiNos = useMemo(
    () => fineRows.filter(r => r.remaining > 0).map(r => r.emi_no),
    [fineRows]
  );

  // 3. First EMI charge (partial-aware)
  const firstChargeDue = useMemo(
    () => (customer ? firstChargeRemaining(customer) : 0),
    [customer]
  );

  // 4. Unpaid EMIs up to current IST month (or next upcoming installment)
  const dueEmis = useMemo(() => {
    let list = sortedEmis.filter(
      e =>
        (e.status === 'UNPAID' ||
          e.status === 'PARTIALLY_PAID' ||
          e.status === 'overdue' ||
          (e.status !== 'collected' && e.status !== 'APPROVED')) &&
        toISTDateString(e.due_date).slice(0, 7) <= currentMonth
    );
    if (list.length === 0) {
      const nextUp = sortedEmis.find(
        e =>
          e.status === 'UNPAID' ||
          e.status === 'PARTIALLY_PAID' ||
          e.status === 'overdue' ||
          (e.status !== 'collected' && e.status !== 'APPROVED')
      );
      if (nextUp) list = [nextUp];
    }
    return list;
  }, [sortedEmis, currentMonth]);

  const emiDue = useMemo(() => {
    return dueEmis.reduce(
      (sum, e) =>
        sum +
        Math.max(
          0,
          Number(e.amount || 0) - Math.max(0, Number(e.partial_paid_amount || 0))
        ),
      0
    );
  }, [dueEmis]);

  // Next unpaid installment details for clear customer label
  const nextUnpaidEmi = dueEmis[0] || sortedEmis[0];

  // Base EMI component
  const baseEmi = emiDue > 0 ? emiDue : (customer?.emi_amount || 0);

  // Consolidated strictly-enforced Total Payable: Base EMI + Fine (if any) + 1st Charge (if any)
  const totalPayable = baseEmi + totalFineRemaining + firstChargeDue;

  const [copied, setCopied] = useState(false);
  const [utr, setUtr] = useState('');
  const [submittingUtr, setSubmittingUtr] = useState(false);
  const [utrSuccess, setUtrSuccess] = useState(false);

  // Transaction note for UPI with customer code and breakdown summary
  const transactionNote = useMemo(() => {
    const code = customerCodeOf(customer) || customer.id.slice(0, 8);
    const parts: string[] = [code];

    if (dueEmis.length > 0) parts.push(`EMI ${dueEmis.map(e => e.emi_no).join(',')}`);
    if (totalFineRemaining > 0 && fineEmiNos.length > 0) parts.push(`Fine ${fineEmiNos.join(',')}`);
    if (firstChargeDue > 0) parts.push('1st Charge');

    const note = parts.join(' | ') || `EMI ${customer.customer_name}`.trim();
    return note.slice(0, 75);
  }, [customer, dueEmis, fineEmiNos, totalFineRemaining, firstChargeDue]);

  // Exact UPI intent string pointing to verified merchant VPA
  const upiUri = useMemo(() => {
    return `upi://pay?pa=${TELEPOINT_UPI_ID}&pn=${encodeURIComponent(
      TELEPOINT_PAYEE_NAME
    )}&am=${totalPayable}&cu=INR&tn=${encodeURIComponent(transactionNote)}`;
  }, [totalPayable, transactionNote]);

  // Copy UPI ID to clipboard
  const handleCopyVpa = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(TELEPOINT_UPI_ID);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Launch directly into user's installed UPI app (Google Pay, PhonePe, Paytm, BHIM)
  const handleOpenUpiApp = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const canOpen = await Linking.canOpenURL(upiUri);
      if (canOpen) {
        await Linking.openURL(upiUri);
      } else {
        Linking.openURL(upiUri).catch(() => {
          Alert.alert(
            'UPI Payment Instructions',
            `Pay via any UPI App (Google Pay, PhonePe, Paytm):\n\nPayee UPI ID: ${TELEPOINT_UPI_ID}\nAmount: ₹${totalPayable.toLocaleString(
              'en-IN'
            )}\nNote: ${transactionNote}`,
            [
              { text: 'Copy UPI ID', onPress: handleCopyVpa },
              { text: 'Close', style: 'cancel' },
            ]
          );
        });
      }
    } catch {
      Alert.alert(
        'Pay with UPI',
        `UPI ID: ${TELEPOINT_UPI_ID}\nAmount: ₹${totalPayable.toLocaleString(
          'en-IN'
        )}\n\nOpen Google Pay, PhonePe, or Paytm and pay to this ID.`,
        [
          { text: 'Copy UPI ID', onPress: handleCopyVpa },
          { text: 'Close', style: 'cancel' },
        ]
      );
    }
  };

  // Handle UTR submission
  const handleSubmitUtr = () => {
    const cleanUtr = utr.trim();
    if (!cleanUtr || cleanUtr.length < 6) {
      Alert.alert(
        'Invalid UTR / Reference ID',
        'Please enter the 12-digit UTR or Transaction ID shown on your Google Pay, PhonePe, or Paytm receipt.'
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSubmittingUtr(true);

    if (onSubmitUtr) {
      onSubmitUtr({ amount: totalPayable, utr: cleanUtr, paymentType: 'total' });
    }

    setTimeout(() => {
      setSubmittingUtr(false);
      setUtrSuccess(true);
      setTimeout(() => {
        setUtrSuccess(false);
        setUtr('');
        onClose();
      }, 2200);
    }, 600);
  };

  // WhatsApp support link with prefilled confirmation
  const handleWhatsAppHelp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const msg = `Hello, I am ${customer.customer_name} (ID: ${customerCodeOf(customer) || customer.mobile}). I am paying my Telepoint EMI of ₹${totalPayable.toLocaleString('en-IN')}. Please help verify my payment.`;
    Linking.openURL(`https://wa.me/91${CENTRAL_HELPLINE}?text=${encodeURIComponent(msg)}`).catch(() => {});
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.overlay}>
        <Animated.View
          entering={SlideInDown.springify().damping(16).stiffness(120).mass(0.8)}
          style={styles.sheetContainer}
        >
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.headerTitleRow}>
              <View style={styles.shieldIcon}>
                <ShieldCheck size={20} color="#10B981" />
              </View>
              <View>
                <Text style={styles.headerTitle}>Pay EMI via UPI</Text>
                <Text style={styles.headerSubtitle}>
                  {customerCodeOf(customer) ? `${customerCodeOf(customer)} • ` : ''}Instant 1-Tap & QR Payment
                </Text>
              </View>
            </View>
            <PressableScale onPress={onClose} style={styles.closeBtn} scaleTo={0.88}>
              <X size={20} color="#64748B" />
            </PressableScale>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
            {/* Transparent Itemized Bill Breakdown Card */}
            <View style={styles.billCard}>
              <View style={styles.billCardHeader}>
                <Receipt size={16} color="#1A6FD6" />
                <Text style={styles.billCardTitle}>CONSOLIDATED EMI BILL</Text>
              </View>

              {/* Row 1: Monthly Base EMI */}
              <View style={styles.billRow}>
                <View style={styles.billRowLeft}>
                  <Text style={styles.billRowLabel}>Monthly EMI</Text>
                  <Text style={styles.billRowSub}>
                    {dueEmis.length > 1
                      ? `${dueEmis.length} installments pending`
                      : nextUnpaidEmi
                      ? `Installment #${nextUnpaidEmi.emi_no}`
                      : 'Current Installment'}
                  </Text>
                </View>
                <Text style={styles.billRowValue}>₹{baseEmi.toLocaleString('en-IN')}</Text>
              </View>

              {/* Row 2: Overdue Late Fine (if any) */}
              {totalFineRemaining > 0 ? (
                <View style={styles.billRow}>
                  <View style={styles.billRowLeft}>
                    <View style={styles.tagRow}>
                      <Text style={[styles.billRowLabel, styles.dangerText]}>Overdue Late Fine</Text>
                      <View style={styles.dangerBadge}>
                        <AlertTriangle size={10} color="#DC2626" />
                        <Text style={styles.dangerBadgeText}>Overdue</Text>
                      </View>
                    </View>
                    <Text style={styles.billRowSub}>
                      {fineEmiNos.length > 0 ? `Late penalty on EMI #${fineEmiNos.join(', #')}` : 'Penalty for overdue payment'}
                    </Text>
                  </View>
                  <Text style={[styles.billRowValue, styles.dangerText]}>
                    + ₹{totalFineRemaining.toLocaleString('en-IN')}
                  </Text>
                </View>
              ) : null}

              {/* Row 3: 1st EMI Processing Charge (if any) */}
              {firstChargeDue > 0 ? (
                <View style={styles.billRow}>
                  <View style={styles.billRowLeft}>
                    <View style={styles.tagRow}>
                      <Text style={[styles.billRowLabel, styles.goldText]}>1st EMI Processing Charge</Text>
                      <View style={styles.goldBadge}>
                        <Text style={styles.goldBadgeText}>One-Time</Text>
                      </View>
                    </View>
                    <Text style={styles.billRowSub}>Initial file & registration charge</Text>
                  </View>
                  <Text style={[styles.billRowValue, styles.goldText]}>
                    + ₹{firstChargeDue.toLocaleString('en-IN')}
                  </Text>
                </View>
              ) : null}

              <View style={styles.billDivider} />

              {/* Row 4: Total Consolidated Amount */}
              <View style={styles.billTotalRow}>
                <View>
                  <Text style={styles.billTotalLabel}>TOTAL PAYABLE TODAY</Text>
                  <Text style={styles.billTotalSub}>
                    Strict consolidated bill (EMI + Fine + 1st Charge)
                  </Text>
                </View>
                <Text style={styles.billTotalAmount}>₹{totalPayable.toLocaleString('en-IN')}</Text>
              </View>
            </View>

            {/* Dynamic QR Code Surface */}
            <View style={styles.qrCard}>
              <View style={styles.qrHeaderRow}>
                <View style={styles.payeeBadge}>
                  <Zap size={13} color="#1A6FD6" />
                  <Text style={styles.payeeBadgeText}>VERIFIED MERCHANT VPA</Text>
                </View>
                <Text style={styles.qrAmountHero}>₹{totalPayable.toLocaleString('en-IN')}</Text>
              </View>

              {/* Dynamic SVG QR Code Canvas */}
              <Animated.View
                entering={ZoomIn.springify().damping(12).stiffness(100).mass(0.6)}
                style={styles.qrFrameWrapper}
              >
                <View style={styles.qrWhiteCanvas}>
                  <QRCode
                    value={upiUri}
                    size={180}
                    color="#0F172A"
                    backgroundColor="#FFFFFF"
                  />
                </View>
              </Animated.View>

              {/* Payee VPA & Copy Pill */}
              <PressableScale onPress={handleCopyVpa} style={styles.vpaPill} scaleTo={0.97}>
                <View style={styles.vpaLeft}>
                  <Text style={styles.vpaLabel}>UPI ID:</Text>
                  <Text style={styles.vpaValue}>{TELEPOINT_UPI_ID}</Text>
                </View>
                <View style={styles.copyBtnPill}>
                  {copied ? (
                    <>
                      <Check size={14} color="#059669" />
                      <Text style={styles.copiedText}>Copied</Text>
                    </>
                  ) : (
                    <>
                      <Copy size={14} color="#1A6FD6" />
                      <Text style={styles.copyText}>Copy</Text>
                    </>
                  )}
                </View>
              </PressableScale>

              <Text style={styles.qrScanInstructions}>
                Scan with Google Pay, PhonePe, Paytm, BHIM, or any UPI app
              </Text>
            </View>

            {/* One-Tap Launch UPI Apps CTA */}
            <PressableScale onPress={handleOpenUpiApp} style={styles.payUpiButton} scaleTo={0.95}>
              <LinearGradient
                colors={['#1A6FD6', '#3B5FE8', '#4F46E5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.payUpiGradient}
              >
                <Zap size={20} color="#FFFFFF" />
                <Text style={styles.payUpiButtonText}>
                  Pay ₹{totalPayable.toLocaleString('en-IN')} via UPI
                </Text>
                <ArrowRight size={18} color="#FFFFFF" />
              </LinearGradient>
            </PressableScale>

            {/* UTR Verification Section */}
            <View style={styles.utrSection}>
              <Text style={styles.sectionLabel}>ALREADY PAID? SUBMIT UTR / REFERENCE ID</Text>
              <Text style={styles.utrHelper}>
                Enter the 12-digit UTR or Transaction ID from your payment receipt
              </Text>
              <View style={styles.utrInputRow}>
                <TextInput
                  style={styles.utrInput}
                  placeholder="Enter 12-digit UTR Number"
                  placeholderTextColor="#94A3B8"
                  value={utr}
                  onChangeText={setUtr}
                  autoCapitalize="characters"
                  maxLength={24}
                />
                <PressableScale
                  onPress={handleSubmitUtr}
                  style={[styles.submitUtrBtn, submittingUtr && styles.submitUtrBtnDisabled]}
                  scaleTo={0.92}
                >
                  <Text style={styles.submitUtrBtnText}>
                    {submittingUtr ? 'Saving...' : 'Confirm'}
                  </Text>
                </PressableScale>
              </View>
              {utrSuccess && (
                <View style={styles.successBanner}>
                  <Check size={16} color="#059669" />
                  <Text style={styles.successBannerText}>
                    Payment reference submitted! Your retailer will approve it shortly.
                  </Text>
                </View>
              )}
            </View>

            {/* Helpline & WhatsApp Support */}
            <PressableScale onPress={handleWhatsAppHelp} style={styles.helpCard} scaleTo={0.97}>
              <MessageCircle size={18} color="#059669" />
              <View style={styles.helpTextCol}>
                <Text style={styles.helpTitle}>Need help with payment?</Text>
                <Text style={styles.helpSub}>
                  WhatsApp helpline at +91 {CENTRAL_HELPLINE} for instant assistance
                </Text>
              </View>
            </PressableScale>
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    paddingBottom: Spacing.xl,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  shieldIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollBody: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing['2xl'],
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 4,
  },

  /* Bill Breakdown Card */
  billCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: Spacing.lg,
  },
  billCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.md,
  },
  billCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1A6FD6',
    letterSpacing: 0.8,
  },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  billRowLeft: {
    flex: 1,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  billRowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  billRowSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  billRowValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  dangerText: {
    color: '#DC2626',
  },
  dangerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.full,
  },
  dangerBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#DC2626',
  },
  goldText: {
    color: '#D97706',
  },
  goldBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.full,
  },
  goldBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#D97706',
  },
  billDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: Spacing.sm,
  },
  billTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
  },
  billTotalLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.8,
  },
  billTotalSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  billTotalAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1A6FD6',
  },

  /* QR Card */
  qrCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: Spacing.lg,
  },
  qrHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: Spacing.md,
  },
  payeeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  payeeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1A6FD6',
    letterSpacing: 0.5,
  },
  qrAmountHero: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
  },
  qrFrameWrapper: {
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: Spacing.md,
  },
  qrWhiteCanvas: {
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
  },
  vpaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    width: '100%',
    marginBottom: Spacing.sm,
  },
  vpaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  vpaLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  vpaValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    fontFamily: 'monospace',
  },
  copyBtnPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  copyText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A6FD6',
  },
  copiedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  qrScanInstructions: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 2,
  },

  /* Pay Button */
  payUpiButton: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.xl,
    shadowColor: '#1A6FD6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  payUpiGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    gap: 10,
  },
  payUpiButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  /* UTR Section */
  utrSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: Spacing.lg,
  },
  utrHelper: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: Spacing.sm,
  },
  utrInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  utrInput: {
    flex: 1,
    height: 46,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  submitUtrBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 18,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitUtrBtnDisabled: {
    opacity: 0.6,
  },
  submitUtrBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    padding: 10,
    borderRadius: Radius.md,
    marginTop: 10,
  },
  successBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
    flex: 1,
  },

  /* Help Card */
  helpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F0FDF4',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  helpTextCol: {
    flex: 1,
  },
  helpTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  helpSub: {
    fontSize: 11,
    color: '#166534',
    marginTop: 1,
  },
});
