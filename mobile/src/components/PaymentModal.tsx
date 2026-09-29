// components/PaymentModal.tsx
// Interactive Neo-Fintech UPI Payment Sheet with Dynamic QR Code Generation
// Payee VPA: biswajit.khanra82@axl
// 100% Data Fidelity with Web Engine + Squash & Stretch Jelly Interactions

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
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import {
  X,
  Copy,
  Check,
  ShieldCheck,
  Zap,
  ArrowRight,
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

export const PaymentModal: React.FC<PaymentModalProps> = ({
  visible,
  onClose,
  customer,
  emis,
  breakdown,
  onSubmitUtr,
}) => {
  // Sorted EMIs by due date
  const sortedEmis = useMemo(() => {
    return [...emis].sort(
      (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    );
  }, [emis]);

  const currentMonth = useMemo(() => toISTDateString(new Date()).slice(0, 7), []);

  // Live Fine Calculation (exact match with web)
  const fineRows = useMemo(() => getPerEmiFineBreakdown(sortedEmis), [sortedEmis]);
  const totalFineRemaining = useMemo(
    () => fineRows.reduce((sum, row) => sum + row.remaining, 0),
    [fineRows]
  );
  const fineEmiNos = useMemo(
    () => fineRows.filter(r => r.remaining > 0).map(r => r.emi_no),
    [fineRows]
  );

  // First EMI charge (partial-aware)
  const firstChargeDue = useMemo(
    () => (customer ? firstChargeRemaining(customer) : 0),
    [customer]
  );

  // Unpaid EMIs up to current IST month (or next upcoming if none overdue)
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

  const totalOutstanding = emiDue + totalFineRemaining + firstChargeDue;

  // Next unpaid single EMI
  const nextUnpaidEmi = dueEmis[0] || sortedEmis[0];
  const firstEmi = sortedEmis[0];

  // Payment type selection
  // Customer-facing payment: only the FULL outstanding total may be paid — the
  // customer cannot pick an individual EMI, fine or first-charge. selectedType
  // is fixed to 'total'.
  const [selectedType] = useState<
    'emi' | 'fine' | 'first_charge' | 'total' | 'first_emi'
  >('total');

  const [copied, setCopied] = useState(false);
  const [utr, setUtr] = useState('');
  const [submittingUtr, setSubmittingUtr] = useState(false);
  const [utrSuccess, setUtrSuccess] = useState(false);

  // Compute selected amount with 100% precision
  const selectedAmount = useMemo(() => {
    switch (selectedType) {
      case 'emi':
        return emiDue > 0 ? emiDue : customer.emi_amount;
      case 'fine':
        return totalFineRemaining;
      case 'first_charge':
        return firstChargeDue;
      case 'first_emi':
        return firstEmi?.amount || customer.emi_amount;
      case 'total':
      default:
        return totalOutstanding > 0 ? totalOutstanding : customer.emi_amount;
    }
  }, [selectedType, emiDue, totalFineRemaining, firstChargeDue, totalOutstanding, firstEmi, customer]);

  // Transaction note for UPI with customer code
  const transactionNote = useMemo(() => {
    const code = customerCodeOf(customer) || customer.id.slice(0, 8);
    const parts: string[] = [code];

    if (selectedType === 'fine') {
      parts.push(`Fine ${fineEmiNos.length > 0 ? fineEmiNos.join(',') : ''}`);
    } else if (selectedType === 'first_charge') {
      parts.push('1st EMI Charge');
    } else if (selectedType === 'first_emi') {
      parts.push('1st EMI');
    } else if (selectedType === 'total') {
      if (dueEmis.length > 0) parts.push(`EMI ${dueEmis.map(e => e.emi_no).join(',')}`);
      if (totalFineRemaining > 0 && fineEmiNos.length > 0) parts.push(`Fine ${fineEmiNos.join(',')}`);
      if (firstChargeDue > 0) parts.push('1st Charge');
    } else {
      if (dueEmis.length > 0) parts.push(`EMI ${dueEmis.map(e => e.emi_no).join(',')}`);
    }

    const note = parts.join(' | ') || `EMI ${customer.customer_name}`.trim();
    return note.slice(0, 75);
  }, [customer, selectedType, dueEmis, fineEmiNos, totalFineRemaining, firstChargeDue]);

  // Exact UPI intent string
  const upiUri = useMemo(() => {
    return `upi://pay?pa=${TELEPOINT_UPI_ID}&pn=${encodeURIComponent(
      TELEPOINT_PAYEE_NAME
    )}&am=${selectedAmount}&cu=INR&tn=${encodeURIComponent(transactionNote)}`;
  }, [selectedAmount, transactionNote]);

  // Copy UPI ID to clipboard
  const handleCopyVpa = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(TELEPOINT_UPI_ID);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Launch directly into user's installed UPI app
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
            `Pay via any UPI App (Google Pay, PhonePe, Paytm):\n\nPayee UPI ID: ${TELEPOINT_UPI_ID}\nAmount: ₹${selectedAmount.toLocaleString(
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
        `UPI ID: ${TELEPOINT_UPI_ID}\nAmount: ₹${selectedAmount.toLocaleString(
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
        'Invalid UTR',
        'Please enter a valid 12-digit UTR or Transaction ID from your payment receipt.'
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSubmittingUtr(true);

    if (onSubmitUtr) {
      onSubmitUtr({ amount: selectedAmount, utr: cleanUtr, paymentType: selectedType });
    }

    setTimeout(() => {
      setSubmittingUtr(false);
      setUtrSuccess(true);
      setTimeout(() => {
        setUtrSuccess(false);
        setUtr('');
        onClose();
      }, 2000);
    }, 600);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.headerTitleRow}>
              <View style={styles.shieldIcon}>
                <ShieldCheck size={20} color="#10B981" />
              </View>
              <View>
                <Text style={styles.headerTitle}>Pay EMI via UPI</Text>
                <Text style={styles.headerSubtitle}>
                  {customerCodeOf(customer) ? `${customerCodeOf(customer)} • ` : ''}Instant payment with dynamic QR
                </Text>
              </View>
            </View>
            <PressableScale onPress={onClose} style={styles.closeBtn} scaleTo={0.88}>
              <X size={20} color="#64748B" />
            </PressableScale>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
            {/* Customer pays the FULL outstanding total only — no picking an
                individual EMI, fine or first-charge from the customer login. */}
            <Text style={styles.sectionLabel}>AMOUNT TO PAY</Text>
            <View style={styles.totalDueCard}>
              <Text style={styles.totalDueLabel}>TOTAL DUE</Text>
              <Text style={styles.totalDueAmount}>
                ₹{(totalOutstanding > 0 ? totalOutstanding : customer.emi_amount).toLocaleString('en-IN')}
              </Text>
              <Text style={styles.totalDueSub}>Full outstanding — EMI, fine and any charges included</Text>
            </View>

            {/* Dynamic QR Code Surface */}
            <View style={styles.qrCard}>
              <View style={styles.qrHeaderRow}>
                <View style={styles.payeeBadge}>
                  <Zap size={13} color="#1A6FD6" />
                  <Text style={styles.payeeBadgeText}>VERIFIED MERCHANT VPA</Text>
                </View>
                <Text style={styles.qrAmountHero}>₹{selectedAmount.toLocaleString('en-IN')}</Text>
              </View>

              {/* Dynamic SVG QR Code Box */}
              <View style={styles.qrFrameWrapper}>
                <View style={styles.qrWhiteCanvas}>
                  <QRCode
                    value={upiUri}
                    size={180}
                    color="#0F172A"
                    backgroundColor="#FFFFFF"
                  />
                </View>
              </View>

              {/* Payee VPA & Copy Pill with Jelly Feedback */}
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

            {/* One-Tap Launch UPI Apps CTA with Jelly Physics */}
            <PressableScale onPress={handleOpenUpiApp} style={styles.payUpiButton} scaleTo={0.95}>
              <LinearGradient
                colors={['#1A6FD6', '#3B5FE8', '#4F46E5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.payUpiGradient}
              >
                <Zap size={20} color="#FFFFFF" />
                <Text style={styles.payUpiButtonText}>
                  Open UPI App (₹{selectedAmount.toLocaleString('en-IN')})
                </Text>
                <ArrowRight size={18} color="#FFFFFF" />
              </LinearGradient>
            </PressableScale>

            {/* UTR Verification Section */}
            <View style={styles.utrSection}>
              <Text style={styles.sectionLabel}>ALREADY PAID VIA QR? SUBMIT UTR NUMBER</Text>
              <View style={styles.utrInputRow}>
                <TextInput
                  style={styles.utrInput}
                  placeholder="Enter 12-digit UTR or Txn ID"
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
                    {submittingUtr ? 'Saving...' : 'Submit'}
                  </Text>
                </PressableScale>
              </View>
              {utrSuccess && (
                <View style={styles.successBanner}>
                  <Text style={styles.successBannerText}>
                    ✓ UTR submitted successfully! Store staff will verify.
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
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
    marginBottom: Spacing.sm,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: Spacing.lg,
  },
  totalDueCard: {
    backgroundColor: '#EFF5FF',
    borderRadius: 18,
    paddingVertical: 20,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#1A6FD6',
    marginBottom: Spacing.lg,
  },
  totalDueLabel: { fontSize: 12, fontWeight: '800', color: '#475569', letterSpacing: 1 },
  totalDueAmount: { fontSize: 36, fontWeight: '900', color: '#0F172A', marginTop: 4 },
  totalDueSub: { fontSize: 12, color: '#64748B', marginTop: 4, textAlign: 'center' },
  optionChip: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.lg,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  optionChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#1A6FD6',
  },
  optionChipActiveDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
  },
  optionChipActiveGold: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
  },
  optionChipActivePrimary: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  optionChipTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  optionChipTextActive: {
    color: '#1A6FD6',
  },
  optionChipTextDanger: {
    color: '#EF4444',
  },
  optionChipTextGold: {
    color: '#D97706',
  },
  optionChipTextPrimary: {
    color: '#4F46E5',
  },
  optionChipAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 4,
  },
  optionChipAmountActive: {
    color: '#1A6FD6',
  },
  optionChipAmountDanger: {
    color: '#DC2626',
  },
  optionChipAmountGold: {
    color: '#B45309',
  },
  optionChipAmountPrimary: {
    color: '#4F46E5',
  },
  optionChipSub: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 3,
  },
  optionChipSubDanger: {
    fontSize: 10,
    color: '#EF4444',
    marginTop: 3,
  },
  qrCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: Spacing.lg,
    shadowColor: '#1A6FD6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  qrHeaderRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  payeeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  payeeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1A6FD6',
  },
  qrAmountHero: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  qrFrameWrapper: {
    padding: 12,
    borderRadius: Radius.lg,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: Spacing.md,
  },
  qrWhiteCanvas: {
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: Radius.md,
  },
  vpaPill: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F1F5F9',
    borderRadius: Radius.lg,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: Spacing.xs,
  },
  vpaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  vpaLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  vpaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  copyBtnPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#CBD5E1',
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
    marginTop: 6,
  },
  payUpiButton: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
    shadowColor: '#1A6FD6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  payUpiGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 10,
  },
  payUpiButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  utrSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  utrInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: Spacing.xs,
  },
  utrInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  submitUtrBtn: {
    backgroundColor: '#0F172A',
    height: 44,
    paddingHorizontal: 18,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitUtrBtnDisabled: {
    opacity: 0.5,
  },
  submitUtrBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  successBanner: {
    marginTop: 10,
    backgroundColor: '#ECFDF5',
    padding: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  successBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
    textAlign: 'center',
  },
});
