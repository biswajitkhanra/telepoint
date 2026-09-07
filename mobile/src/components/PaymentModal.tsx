// components/PaymentModal.tsx
// Interactive Neo-Fintech UPI Payment Sheet with Dynamic QR Code Generation
// Payee VPA: biswajit.khanra82@axl

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import {
  X,
  Smartphone,
  CheckCircle2,
  Copy,
  Check,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Zap,
  QrCode,
  ArrowRight,
} from 'lucide-react-native';
import { Customer, EMIScheduleItem, DueBreakdown } from '../types';
import { Colors } from '../constants/colors';
import { Spacing, Radius } from '../constants/design';

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
  // Find next unpaid EMI (or overdue EMI)
  const nextUnpaidEmi = useMemo(() => {
    return emis.find(
      e => e.status === 'pending' || e.status === 'UNPAID' || e.status === 'overdue' || (e.status !== 'collected' && e.status !== 'APPROVED')
    );
  }, [emis]);

  // First EMI
  const firstEmi = useMemo(() => {
    return emis[0];
  }, [emis]);

  // Fine amount
  const fineAmount = useMemo(() => {
    return breakdown?.fine_due || 0;
  }, [breakdown]);

  // EMI amount
  const emiAmount = nextUnpaidEmi?.amount || customer.emi_amount || 0;

  // Payment type selection
  // Options: 'emi' (Current / Next Due EMI), 'fine' (Late Fine Only), 'total' (All Dues), 'first_emi' (1st EMI)
  const [selectedType, setSelectedType] = useState<'emi' | 'fine' | 'total' | 'first_emi'>(
    fineAmount > 0 ? 'total' : 'emi'
  );

  const [copied, setCopied] = useState(false);
  const [utr, setUtr] = useState('');
  const [submittingUtr, setSubmittingUtr] = useState(false);
  const [utrSuccess, setUtrSuccess] = useState(false);

  // Compute selected amount
  const selectedAmount = useMemo(() => {
    switch (selectedType) {
      case 'emi':
        return emiAmount;
      case 'fine':
        return fineAmount;
      case 'first_emi':
        return firstEmi?.amount || emiAmount;
      case 'total':
      default:
        return emiAmount + fineAmount;
    }
  }, [selectedType, emiAmount, fineAmount, firstEmi]);

  // Transaction note for UPI
  const transactionNote = useMemo(() => {
    const loanRef = customer.id.slice(0, 8);
    if (selectedType === 'fine') {
      return `Telepoint Fine | ${customer.customer_name} | ${loanRef}`;
    }
    if (selectedType === 'first_emi') {
      return `Telepoint 1st EMI | ${customer.customer_name} | ${loanRef}`;
    }
    if (selectedType === 'total') {
      return `Telepoint Full Due | ${customer.customer_name} | ${loanRef}`;
    }
    return `Telepoint EMI ${nextUnpaidEmi?.emi_no || 1} | ${customer.customer_name} | ${loanRef}`;
  }, [selectedType, customer, nextUnpaidEmi]);

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
        // Fallback if generic upi intent is not directly handled
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
      Alert.alert('Invalid UTR', 'Please enter a valid 12-digit UTR or Transaction ID from your payment receipt.');
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
                <Text style={styles.headerSubtitle}>Instant payment with dynamic QR code</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
            {/* Amount Selection Chips */}
            <Text style={styles.sectionLabel}>SELECT PAYMENT OPTION</Text>
            <View style={styles.optionsRow}>
              {/* Option 1: Next Due EMI */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedType('emi');
                }}
                style={[styles.optionChip, selectedType === 'emi' && styles.optionChipActive]}
              >
                <Text style={[styles.optionChipTitle, selectedType === 'emi' && styles.optionChipTextActive]}>
                  {nextUnpaidEmi ? `EMI #${nextUnpaidEmi.emi_no}` : 'Current EMI'}
                </Text>
                <Text style={[styles.optionChipAmount, selectedType === 'emi' && styles.optionChipAmountActive]}>
                  ₹{emiAmount.toLocaleString('en-IN')}
                </Text>
                {nextUnpaidEmi?.due_date && (
                  <Text style={styles.optionChipSub}>Due {nextUnpaidEmi.due_date}</Text>
                )}
              </TouchableOpacity>

              {/* Option 2: Overdue Fine (if any) */}
              {fineAmount > 0 && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedType('fine');
                  }}
                  style={[styles.optionChip, selectedType === 'fine' && styles.optionChipActiveDanger]}
                >
                  <Text style={[styles.optionChipTitle, selectedType === 'fine' && styles.optionChipTextDanger]}>
                    Late Fine
                  </Text>
                  <Text style={[styles.optionChipAmount, selectedType === 'fine' && styles.optionChipAmountDanger]}>
                    ₹{fineAmount.toLocaleString('en-IN')}
                  </Text>
                  <Text style={styles.optionChipSubDanger}>Overdue charge</Text>
                </TouchableOpacity>
              )}

              {/* Option 3: Total Outstanding (EMI + Fine) */}
              {fineAmount > 0 && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedType('total');
                  }}
                  style={[styles.optionChip, selectedType === 'total' && styles.optionChipActivePrimary]}
                >
                  <Text style={[styles.optionChipTitle, selectedType === 'total' && styles.optionChipTextPrimary]}>
                    Total Dues
                  </Text>
                  <Text style={[styles.optionChipAmount, selectedType === 'total' && styles.optionChipAmountPrimary]}>
                    ₹{(emiAmount + fineAmount).toLocaleString('en-IN')}
                  </Text>
                  <Text style={styles.optionChipSub}>EMI + Fine</Text>
                </TouchableOpacity>
              )}

              {/* Option 4: 1st EMI (if 1st EMI is due or selected) */}
              {firstEmi && firstEmi.status !== 'collected' && firstEmi.status !== 'APPROVED' && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedType('first_emi');
                  }}
                  style={[styles.optionChip, selectedType === 'first_emi' && styles.optionChipActive]}
                >
                  <Text style={[styles.optionChipTitle, selectedType === 'first_emi' && styles.optionChipTextActive]}>
                    1st Installment
                  </Text>
                  <Text style={[styles.optionChipAmount, selectedType === 'first_emi' && styles.optionChipAmountActive]}>
                    ₹{(firstEmi.amount || emiAmount).toLocaleString('en-IN')}
                  </Text>
                  <Text style={styles.optionChipSub}>Start loan</Text>
                </TouchableOpacity>
              )}
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

              {/* Payee VPA & Copy Pill */}
              <TouchableOpacity activeOpacity={0.85} onPress={handleCopyVpa} style={styles.vpaPill}>
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
              </TouchableOpacity>

              <Text style={styles.qrScanInstructions}>
                Scan with Google Pay, PhonePe, Paytm, BHIM, or any UPI app
              </Text>
            </View>

            {/* One-Tap Launch UPI Apps CTA */}
            <TouchableOpacity activeOpacity={0.88} onPress={handleOpenUpiApp} style={styles.payUpiButton}>
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
            </TouchableOpacity>

            {/* UTR Verification Section */}
            <View style={styles.utrSection}>
              <Text style={styles.sectionLabel}>ALREADY PAID VIA QR? SUBMIT UTR NUMBER</Text>
              <View style={styles.utrInputRow}>
                <TextInput
                  style={styles.utrInput}
                  placeholder="Enter 12-digit UTR or Transaction ID"
                  placeholderTextColor="#94A3B8"
                  value={utr}
                  onChangeText={setUtr}
                  autoCapitalize="characters"
                  maxLength={24}
                />
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleSubmitUtr}
                  disabled={submittingUtr || utrSuccess || !utr.trim()}
                  style={[
                    styles.utrSubmitBtn,
                    (!utr.trim() || submittingUtr) && styles.utrSubmitBtnDisabled,
                    utrSuccess && styles.utrSubmitBtnSuccess,
                  ]}
                >
                  {utrSuccess ? (
                    <Check size={18} color="#FFFFFF" />
                  ) : (
                    <Text style={styles.utrSubmitText}>Submit</Text>
                  )}
                </TouchableOpacity>
              </View>
              {utrSuccess && (
                <View style={styles.utrSuccessAlert}>
                  <CheckCircle2 size={15} color="#059669" />
                  <Text style={styles.utrSuccessAlertText}>
                    UTR submitted! Retailer partner will verify and settle your account.
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
    backgroundColor: 'rgba(15, 23, 42, 0.60)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  shieldIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 30,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  optionChip: {
    flex: 1,
    minWidth: '46%',
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  optionChipActive: {
    borderColor: '#1A6FD6',
    backgroundColor: '#EFF5FF',
  },
  optionChipActiveDanger: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  optionChipActivePrimary: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  optionChipTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  optionChipTextActive: {
    color: '#1A6FD6',
  },
  optionChipTextDanger: {
    color: '#DC2626',
  },
  optionChipTextPrimary: {
    color: '#4F46E5',
  },
  optionChipAmount: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    fontVariant: ['tabular-nums'],
    marginVertical: 3,
  },
  optionChipAmountActive: {
    color: '#1A6FD6',
  },
  optionChipAmountDanger: {
    color: '#DC2626',
  },
  optionChipAmountPrimary: {
    color: '#4F46E5',
  },
  optionChipSub: {
    fontSize: 10,
    color: '#64748B',
  },
  optionChipSubDanger: {
    fontSize: 10,
    color: '#DC2626',
    fontWeight: '600',
  },
  qrCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    marginBottom: 16,
  },
  qrHeaderRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  payeeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF5FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  payeeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1A6FD6',
    letterSpacing: 0.5,
  },
  qrAmountHero: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    fontVariant: ['tabular-nums'],
  },
  qrFrameWrapper: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: 14,
  },
  qrWhiteCanvas: {
    backgroundColor: '#FFFFFF',
    padding: 6,
  },
  vpaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  copyBtnPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF5FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
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
    marginTop: 10,
  },
  payUpiButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#1A6FD6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 5,
  },
  payUpiGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  payUpiButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  utrSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  utrInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  utrInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  utrSubmitBtn: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  utrSubmitBtnDisabled: {
    backgroundColor: '#CBD5E1',
  },
  utrSubmitBtnSuccess: {
    backgroundColor: '#059669',
  },
  utrSubmitText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  utrSuccessAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    padding: 8,
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
  },
  utrSuccessAlertText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
    flex: 1,
  },
});
