// mobile/src/components/CollectPaymentSheet.tsx
// 100% Native High-Fidelity EMI Payment Collection Sheet
// IDFC FIRST Bank Precision + Jupiter Neo Delight: Full Web Engine Parity
// Sequence Lock, Decoupled Late Fines, First EMI Charge, Dynamic UPI QR (biswajit.khanra82@axl),
// Retailer PIN Authentication, Real-time Calculation, Sticky Footer Bar, and Digital Receipt Voucher

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { Haptics } from '../utils/haptics';
import { LinearGradient } from 'expo-linear-gradient';
import {
  X,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Lock,
  Send,
  Calendar,
  Share2,
  Smartphone,
  ShieldCheck,
  Banknote,
  QrCode,
  FileText,
} from 'lucide-react-native';
import { PORTAL_BASE_URL } from '../config';
import { Customer, EMIScheduleItem, DueBreakdown } from '../types';
import { Colors } from '../constants/colors';
import { Spacing, Radius, Shadow } from '../constants/design';
import { PressableScale } from './PressableScale';
import { calculateSingleEmiFine } from '../utils/fineCalc';
import { firstChargeRemaining } from '../utils/firstCharge';

interface CollectPaymentSheetProps {
  visible: boolean;
  onClose: () => void;
  customerId: string | null;
  customerName?: string;
  initialAmount?: number;
  isAdmin?: boolean;
  retailerId?: string;
  onPaymentSuccess?: () => void;
}

export const TELEPOINT_UPI_ID = 'biswajit.khanra82@axl';

export const CollectPaymentSheet: React.FC<CollectPaymentSheetProps> = ({
  visible,
  onClose,
  customerId,
  customerName,
  initialAmount,
  isAdmin = false,
  retailerId,
  onPaymentSuccess,
}) => {
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [emis, setEmis] = useState<EMIScheduleItem[]>([]);
  const [breakdown, setBreakdown] = useState<DueBreakdown | null>(null);

  // Collection options state
  const [collectPrincipal, setCollectPrincipal] = useState(true);
  const [principalInput, setPrincipalInput] = useState('');
  const [selectedFineEmis, setSelectedFineEmis] = useState<{ [emiNo: number]: boolean }>({});
  const [collectFirstCharge, setCollectFirstCharge] = useState(false);
  const [mode, setMode] = useState<'CASH' | 'UPI'>('CASH');
  const [utr, setUtr] = useState('');
  const [retailerPin, setRetailerPin] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Success Receipt state
  const [completedReceipt, setCompletedReceipt] = useState<any | null>(null);
  const [copiedVpa, setCopiedVpa] = useState(false);

  // Load customer file and authoritative EMI schedule
  const loadCustomerData = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const res = await fetch(`${PORTAL_BASE_URL}/api/customer-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.customer) setCustomer(data.customer);
        if (data.emis) setEmis(data.emis);
        if (data.breakdown) setBreakdown(data.breakdown);
      }
    } catch (e) {
      console.warn('Failed to load customer details for collection:', e);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    if (visible && customerId) {
      setCompletedReceipt(null);
      setUtr('');
      setRetailerPin('');
      setNotes('');
      setMode('CASH');
      loadCustomerData();
    }
  }, [visible, customerId, loadCustomerData]);

  // Unpaid EMIs and Sequence Lock
  const unpaidEmis = useMemo(() => {
    return emis
      .filter(e => e.status === 'UNPAID' || e.status === 'PARTIALLY_PAID')
      .sort((a, b) => a.emi_no - b.emi_no);
  }, [emis]);

  // Sequence Lock: Retailer must collect the lowest unpaid EMI
  const targetEmi = useMemo(() => {
    return unpaidEmis[0] || null;
  }, [unpaidEmis]);

  // Overdue Fines by EMI (Decoupled fine retention rule)
  const overdueFineBreakdown = useMemo(() => {
    const out: Array<{ emi_no: number; due_date: string; fine: number; id: string }> = [];
    for (const e of emis) {
      if (e.fine_waived) continue;
      const storedFine = Number(e.fine_amount || 0);
      const paidFine = Number(e.fine_paid_amount || 0);
      const liveFine = calculateSingleEmiFine(e.due_date);
      const effectiveFine = Math.max(liveFine, storedFine);
      const remainingFine = Math.max(0, effectiveFine - paidFine);
      if (remainingFine > 0) {
        out.push({
          emi_no: e.emi_no,
          due_date: e.due_date,
          fine: remainingFine,
          id: e.id,
        });
      }
    }
    return out.sort((a, b) => a.emi_no - b.emi_no);
  }, [emis]);

  // First EMI charge remaining
  const chargeRemaining = useMemo(() => {
    return customer ? firstChargeRemaining(customer) : 0;
  }, [customer]);

  // Initialize prefilled values when data arrives
  useEffect(() => {
    if (targetEmi) {
      const remainingScheduled = Number(targetEmi.amount || 0) - Number(targetEmi.partial_paid_amount || 0);
      setPrincipalInput(String(Math.round(remainingScheduled > 0 ? remainingScheduled : Number(targetEmi.amount || 0))));
      setCollectPrincipal(true);
    } else {
      setPrincipalInput('0');
      setCollectPrincipal(false);
    }

    // By default, select all accrued late fines
    const fineMap: { [emiNo: number]: boolean } = {};
    for (const f of overdueFineBreakdown) {
      fineMap[f.emi_no] = true;
    }
    setSelectedFineEmis(fineMap);

    if (chargeRemaining > 0) {
      setCollectFirstCharge(true);
    }
  }, [targetEmi, overdueFineBreakdown, chargeRemaining]);

  // Live Calculations
  const calculatedPrincipal = useMemo(() => {
    if (!collectPrincipal) return 0;
    const p = parseFloat(principalInput);
    return isNaN(p) || p < 0 ? 0 : p;
  }, [collectPrincipal, principalInput]);

  const selectedFinesTotal = useMemo(() => {
    let sum = 0;
    for (const f of overdueFineBreakdown) {
      if (selectedFineEmis[f.emi_no]) {
        sum += f.fine;
      }
    }
    return sum;
  }, [overdueFineBreakdown, selectedFineEmis]);

  const calculatedCharge = useMemo(() => {
    return collectFirstCharge ? chargeRemaining : 0;
  }, [collectFirstCharge, chargeRemaining]);

  const grandTotal = useMemo(() => {
    return calculatedPrincipal + selectedFinesTotal + calculatedCharge;
  }, [calculatedPrincipal, selectedFinesTotal, calculatedCharge]);

  // Dynamic UPI URL for live QR
  const upiQrPayload = useMemo(() => {
    const custName = customer?.customer_name ? encodeURIComponent(customer.customer_name) : 'Customer';
    return `upi://pay?pa=${TELEPOINT_UPI_ID}&pn=Telepoint%20EMI&am=${grandTotal}&cu=INR&tn=EMI%20Collection%20${custName}`;
  }, [grandTotal, customer]);

  const handleCopyVpa = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(TELEPOINT_UPI_ID);
    setCopiedVpa(true);
    setTimeout(() => setCopiedVpa(false), 2000);
  };

  // Submit Collection to Server
  const handleSubmitCollection = async () => {
    if (grandTotal <= 0) {
      Alert.alert('Invalid Amount', 'Total collection amount must be greater than ₹0.');
      return;
    }

    if (collectPrincipal && !targetEmi) {
      Alert.alert('No EMI Selected', 'All scheduled EMIs are settled. Toggle off EMI Principal to collect fine-only.');
      return;
    }

    if (!isAdmin && !retailerPin.trim()) {
      Alert.alert('Retailer PIN Required', 'Please enter your 4-digit Retailer PIN to authorize this collection.');
      return;
    }

    if (mode === 'UPI' && !utr.trim()) {
      Alert.alert('UTR Required', 'Please enter the 12-digit UPI reference (UTR) number provided by customer.');
      return;
    }

    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const selectedFineRows = overdueFineBreakdown
        .filter(f => selectedFineEmis[f.emi_no])
        .map(f => ({ emi_no: f.emi_no, amount: f.fine }));

      const collectType =
        collectPrincipal && targetEmi
          ? 'emi_and_dues'
          : selectedFinesTotal > 0
          ? 'fine_only'
          : 'first_charge_only';

      const payload = {
        retailer_id: retailerId || (customer as any)?.retailer_id || (customer as any)?.retailer?.id,
        customer_id: customerId,
        emi_ids: collectPrincipal && targetEmi ? [targetEmi.id] : [],
        emi_nos: collectPrincipal && targetEmi ? [targetEmi.emi_no] : [],
        emi_no: targetEmi ? targetEmi.emi_no : 1,
        mode,
        utr: mode === 'UPI' ? utr.trim() : null,
        notes: notes.trim() || undefined,
        retail_pin: isAdmin ? undefined : retailerPin.trim(),
        total_amount: grandTotal,
        total_emi_amount: calculatedPrincipal,
        scheduled_emi_amount: targetEmi ? Number(targetEmi.amount || 0) : 0,
        fine_amount: selectedFinesTotal,
        fine_breakdown: selectedFineRows,
        first_emi_charge_amount: calculatedCharge,
        fine_for_emi_no: selectedFineRows.length ? selectedFineRows[0].emi_no : undefined,
        fine_due_date: selectedFineRows.length ? overdueFineBreakdown.find(f => f.emi_no === selectedFineRows[0].emi_no)?.due_date : undefined,
        collected_by_role: isAdmin ? 'admin' : 'retailer',
        collect_type: collectType,
        is_admin_direct: isAdmin,
      };

      const res = await fetch(`${PORTAL_BASE_URL}/api/mobile/retailer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCompletedReceipt(json.receipt || {
          receipt_id: `REC-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
          customer_name: customer?.customer_name || customerName || 'Valued Customer',
          imei: customer?.imei || '',
          mobile: customer?.mobile || '',
          total_amount: grandTotal,
          mode,
          utr: utr.trim() || null,
          timestamp: new Date().toISOString(),
          status: isAdmin ? 'APPROVED' : 'PENDING_APPROVAL',
        });
        if (onPaymentSuccess) {
          onPaymentSuccess();
        }
      } else {
        Alert.alert('Collection Failed', json.error || 'Failed to submit payment request.');
      }
    } catch (e: any) {
      Alert.alert('Connection Error', e?.message || 'Unable to connect to server.');
    } finally {
      setSubmitting(false);
    }
  };

  // Share receipt
  const handleShareReceipt = async () => {
    if (!completedReceipt) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const lines = [
        `*TELEPOINT EMI PAYMENT RECEIPT*`,
        `Receipt ID: ${completedReceipt.receipt_id}`,
        `Customer: ${completedReceipt.customer_name}`,
        `IMEI: ${completedReceipt.imei || 'N/A'}`,
        `Amount Paid: ₹${completedReceipt.total_amount.toLocaleString('en-IN')}`,
        `Mode: ${completedReceipt.mode} ${completedReceipt.utr ? `(UTR: ${completedReceipt.utr})` : ''}`,
        `Status: ${completedReceipt.status === 'APPROVED' ? 'CONFIRMED / APPROVED' : 'QUEUED FOR ADMIN APPROVAL'}`,
        `Helpline: 7003617029`,
      ];
      await Share.share({
        message: lines.join('\n'),
        title: 'Telepoint Payment Receipt',
      });
    } catch (e) {
      console.warn('Share receipt failed:', e);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.sheetContainer}>
          {/* Top Sheet Drag Handle & Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.dragPill} />
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIconCircle}>
                <CreditCard size={20} color="#1A6FD6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>
                  {isAdmin ? 'ADMIN DIRECT SETTLEMENT' : 'RECORD EMI COLLECTION'}
                </Text>
                <Text style={styles.sheetSub} numberOfLines={1}>
                  {customer?.customer_name || customerName || 'Customer Collection'} • IMEI: {customer?.imei || 'Device'}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Fetching authoritative loan ledger...</Text>
            </View>
          ) : completedReceipt ? (
            /* Digital Receipt Voucher View */
            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.receiptScroll}
            >
              <View style={styles.receiptCard}>
                <LinearGradient
                  colors={['#0F172A', '#1E293B']}
                  style={styles.receiptBanner}
                >
                  <View style={styles.receiptBannerHeader}>
                    <View style={styles.receiptCheckCircle}>
                      <CheckCircle2 size={24} color="#10B981" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.receiptBannerTitle}>
                        {completedReceipt.status === 'APPROVED' ? 'PAYMENT CONFIRMED' : 'COLLECTION RECORDED'}
                      </Text>
                      <Text style={styles.receiptBannerSub}>Official Telepoint Receipt Voucher</Text>
                    </View>
                  </View>
                  <Text style={styles.receiptAmountHero}>
                    ₹{completedReceipt.total_amount.toLocaleString('en-IN')}
                  </Text>
                  <Text style={styles.receiptIdText}>{completedReceipt.receipt_id}</Text>
                </LinearGradient>

                <View style={styles.receiptBody}>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Customer Name</Text>
                    <Text style={styles.receiptVal}>{completedReceipt.customer_name}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Device IMEI</Text>
                    <Text style={styles.receiptVal}>{completedReceipt.imei || 'N/A'}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Payment Method</Text>
                    <Text style={styles.receiptVal}>
                      {completedReceipt.mode} {completedReceipt.utr ? `(UTR: ${completedReceipt.utr})` : ''}
                    </Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Transaction Date</Text>
                    <Text style={styles.receiptVal}>
                      {new Date(completedReceipt.timestamp).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Helpline</Text>
                    <Text style={[styles.receiptVal, { color: '#1A6FD6', fontWeight: '800' }]}>
                      7003617029
                    </Text>
                  </View>
                </View>

                {/* Receipt Action Buttons */}
                <View style={styles.receiptActionRow}>
                  <PressableScale
                    onPress={handleShareReceipt}
                    style={styles.shareReceiptBtn}
                    scaleTo={0.95}
                  >
                    <Share2 size={16} color="#FFFFFF" />
                    <Text style={styles.shareReceiptBtnText}>Share Slip</Text>
                  </PressableScale>

                  <PressableScale
                    onPress={onClose}
                    style={styles.doneReceiptBtn}
                    scaleTo={0.95}
                  >
                    <Text style={styles.doneReceiptBtnText}>Done</Text>
                  </PressableScale>
                </View>
              </View>
            </ScrollView>
          ) : (
            /* Main Form Area with Scrollable Body and Fixed Footer */
            <View style={styles.formWrapper}>
              <ScrollView
                style={styles.scrollArea}
                showsVerticalScrollIndicator={true}
                contentContainerStyle={styles.scrollBody}
                keyboardShouldPersistTaps="handled"
              >
                {/* 1. SEQUENCE LOCK BANNER */}
                {targetEmi ? (
                  <View style={styles.sequenceBanner}>
                    <View style={styles.sequenceIconWrap}>
                      <Calendar size={18} color="#1A6FD6" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sequenceTitle}>
                        SEQUENCE LOCKED: EMI #{targetEmi.emi_no}
                      </Text>
                      <Text style={styles.sequenceSub}>
                        Due on {targetEmi.due_date} • Scheduled Amount: ₹{Number(targetEmi.amount).toLocaleString('en-IN')}
                      </Text>
                    </View>
                    <View style={styles.sequenceBadge}>
                      <Text style={styles.sequenceBadgeText}>NEXT DUE</Text>
                    </View>
                  </View>
                ) : (
                  <View style={[styles.sequenceBanner, { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' }]}>
                    <CheckCircle2 size={18} color="#10B981" />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={[styles.sequenceTitle, { color: '#166534' }]}>
                        ALL SCHEDULED EMIs PAID
                      </Text>
                      <Text style={[styles.sequenceSub, { color: '#15803D' }]}>
                        You can collect outstanding late fines or first charges below.
                      </Text>
                    </View>
                  </View>
                )}

                {/* 2. EMI PRINCIPAL COLLECTION */}
                {targetEmi && (
                  <View style={styles.sectionCard}>
                    <TouchableOpacity
                      style={styles.sectionHeaderRow}
                      activeOpacity={0.8}
                      onPress={() => setCollectPrincipal(!collectPrincipal)}
                    >
                      <View style={[styles.checkbox, collectPrincipal && styles.checkboxActive]}>
                        {collectPrincipal && <Check size={14} color="#FFFFFF" />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sectionHeading}>Collect EMI #{targetEmi.emi_no} Principal</Text>
                        <Text style={styles.sectionSubtext}>
                          Allows full or partial principal installment
                        </Text>
                      </View>
                    </TouchableOpacity>

                    {collectPrincipal && (
                      <View style={styles.inputContainer}>
                        <View style={styles.inputHeaderRow}>
                          <Text style={styles.fieldLabel}>Principal Amount (₹)</Text>
                          <Text style={styles.fieldHint}>Tap to override</Text>
                        </View>
                        <View style={styles.rupeeInputBox}>
                          <Text style={styles.rupeeSymbol}>₹</Text>
                          <TextInput
                            style={styles.rupeeInput}
                            keyboardType="numeric"
                            value={principalInput}
                            onChangeText={setPrincipalInput}
                            placeholder="0"
                            placeholderTextColor="#94A3B8"
                          />
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {/* 3. OVERDUE LATE FINES (Decoupled Checkboxes) */}
                {overdueFineBreakdown.length > 0 && (
                  <View style={styles.sectionCard}>
                    <View style={styles.sectionTitleRow}>
                      <Text style={styles.sectionHeading}>Accrued Late Fines (IST Decoupled)</Text>
                      <Text style={styles.sectionSubBadge}>
                        {overdueFineBreakdown.length} Overdue
                      </Text>
                    </View>
                    <Text style={styles.sectionSubtext}>
                      Select which late fines to clear with this collection
                    </Text>

                    <View style={styles.finesList}>
                      {overdueFineBreakdown.map(f => {
                        const isChecked = !!selectedFineEmis[f.emi_no];
                        return (
                          <TouchableOpacity
                            key={`fine-${f.emi_no}`}
                            style={[styles.fineRowItem, isChecked && styles.fineRowItemActive]}
                            activeOpacity={0.8}
                            onPress={() => {
                              setSelectedFineEmis(prev => ({
                                ...prev,
                                [f.emi_no]: !prev[f.emi_no],
                              }));
                            }}
                          >
                            <View style={[styles.checkbox, isChecked && styles.checkboxActiveRose]}>
                              {isChecked && <Check size={14} color="#FFFFFF" />}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.fineRowTitle}>EMI #{f.emi_no} Late Fine</Text>
                              <Text style={styles.fineRowSub}>Due was on {f.due_date}</Text>
                            </View>
                            <Text style={styles.fineRowAmount}>₹{f.fine.toLocaleString('en-IN')}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* 4. FIRST EMI PROCESSING CHARGE */}
                {chargeRemaining > 0 && (
                  <View style={styles.sectionCard}>
                    <TouchableOpacity
                      style={styles.sectionHeaderRow}
                      activeOpacity={0.8}
                      onPress={() => setCollectFirstCharge(!collectFirstCharge)}
                    >
                      <View style={[styles.checkbox, collectFirstCharge && styles.checkboxActive]}>
                        {collectFirstCharge && <Check size={14} color="#FFFFFF" />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sectionHeading}>First EMI Processing Charge</Text>
                        <Text style={styles.sectionSubtext}>One-time loan activation charge</Text>
                      </View>
                      <Text style={[styles.fineRowAmount, { color: '#0F172A' }]}>
                        ₹{chargeRemaining.toLocaleString('en-IN')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* 5. PAYMENT METHOD (CASH vs DYNAMIC UPI QR) */}
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionHeading}>Payment Method</Text>

                  <View style={styles.modeTabs}>
                    <TouchableOpacity
                      style={[styles.modeTabBtn, mode === 'CASH' && styles.modeTabBtnActive]}
                      onPress={() => setMode('CASH')}
                      activeOpacity={0.8}
                    >
                      <Banknote size={16} color={mode === 'CASH' ? '#1A6FD6' : '#64748B'} />
                      <Text style={[styles.modeTabBtnText, mode === 'CASH' && styles.modeTabBtnTextActive]}>
                        Cash Received
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.modeTabBtn, mode === 'UPI' && styles.modeTabBtnActive]}
                      onPress={() => setMode('UPI')}
                      activeOpacity={0.8}
                    >
                      <QrCode size={16} color={mode === 'UPI' ? '#1A6FD6' : '#64748B'} />
                      <Text style={[styles.modeTabBtnText, mode === 'UPI' && styles.modeTabBtnTextActive]}>
                        UPI / QR Scan
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* DYNAMIC UPI QR DISPLAY */}
                  {mode === 'UPI' && (
                    <View style={styles.upiQrBox}>
                      <View style={styles.qrCanvasWrapper}>
                        <QRCode value={upiQrPayload} size={160} color="#0F172A" backgroundColor="#FFFFFF" />
                      </View>

                      <TouchableOpacity
                        style={styles.vpaRow}
                        onPress={handleCopyVpa}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.vpaLabel}>UPI ID: </Text>
                        <Text style={styles.vpaText}>{TELEPOINT_UPI_ID}</Text>
                        {copiedVpa ? <Check size={14} color="#10B981" /> : <Copy size={14} color="#1A6FD6" />}
                      </TouchableOpacity>
                      <Text style={styles.qrScanHint}>
                        Customer can scan via Google Pay, PhonePe, Paytm, or BHIM
                      </Text>

                      {/* Mandatory UTR Input */}
                      <View style={styles.utrSection}>
                        <Text style={styles.fieldLabel}>UPI Reference / UTR Number (Mandatory) *</Text>
                        <TextInput
                          style={styles.textInputBox}
                          placeholder="e.g. 423982938192 (12-digit UTR)"
                          placeholderTextColor="#94A3B8"
                          value={utr}
                          onChangeText={setUtr}
                        />
                      </View>
                    </View>
                  )}
                </View>

                {/* 6. RETAILER AUTHENTICATION PIN */}
                {!isAdmin && (
                  <View style={styles.sectionCard}>
                    <View style={styles.pinHeader}>
                      <Lock size={15} color="#0F172A" />
                      <Text style={styles.sectionHeading}>Retailer Security PIN *</Text>
                    </View>
                    <Text style={styles.sectionSubtext}>
                      Enter your store PIN to authorize this collection
                    </Text>
                    <TextInput
                      style={styles.textInputBox}
                      placeholder="Enter 4-digit Retailer PIN"
                      placeholderTextColor="#94A3B8"
                      secureTextEntry
                      keyboardType="numeric"
                      maxLength={6}
                      value={retailerPin}
                      onChangeText={setRetailerPin}
                    />
                  </View>
                )}

                {/* 7. REMARKS / NOTES */}
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionHeading}>Collection Remarks (Optional)</Text>
                  <TextInput
                    style={styles.textInputBox}
                    placeholder="e.g. Cash collected at counter"
                    placeholderTextColor="#94A3B8"
                    value={notes}
                    onChangeText={setNotes}
                  />
                </View>
              </ScrollView>

              {/* 8. FIXED STICKY FOOTER ACTION BAR (ALWAYS VISIBLE & ACCESSIBLE) */}
              <View style={styles.sheetFooter}>
                <View style={styles.footerTotalCol}>
                  <Text style={styles.footerTotalLabel}>TOTAL AMOUNT</Text>
                  <Text style={styles.footerTotalVal}>₹{grandTotal.toLocaleString('en-IN')}</Text>
                  <Text style={styles.footerBreakdownSub} numberOfLines={1}>
                    {[
                      calculatedPrincipal > 0 ? `Prin: ₹${calculatedPrincipal}` : '',
                      selectedFinesTotal > 0 ? `Fine: ₹${selectedFinesTotal}` : '',
                      calculatedCharge > 0 ? `Chg: ₹${calculatedCharge}` : '',
                    ].filter(Boolean).join(' • ') || 'Select items'}
                  </Text>
                </View>

                <PressableScale
                  onPress={handleSubmitCollection}
                  disabled={submitting || grandTotal <= 0}
                  style={[
                    styles.submitFooterBtn,
                    (submitting || grandTotal <= 0) && styles.submitFooterBtnDisabled,
                  ]}
                  scaleTo={0.96}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Send size={16} color="#FFFFFF" />
                      <Text style={styles.submitFooterBtnText}>
                        {isAdmin ? 'Direct Settle' : 'Collect EMI'}
                      </Text>
                    </>
                  )}
                </PressableScale>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
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
  sheetHeader: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: Spacing.lg,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    alignItems: 'center',
    flexShrink: 0,
  },
  dragPill: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    marginBottom: 10,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 12,
  },
  headerIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  sheetSub: {
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  formWrapper: {
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
    paddingBottom: 30,
    gap: 12,
  },
  sequenceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: Radius.md,
    padding: 12,
    gap: 10,
  },
  sequenceIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sequenceTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1A6FD6',
    letterSpacing: 0.4,
  },
  sequenceSub: {
    fontSize: 11,
    color: '#3B82F6',
    marginTop: 2,
  },
  sequenceBadge: {
    backgroundColor: '#1A6FD6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sequenceBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadow.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionSubBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#E11D48',
    backgroundColor: '#FFE4E6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sectionSubtext: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#94A3B8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: '#1A6FD6',
    borderColor: '#1A6FD6',
  },
  checkboxActiveRose: {
    backgroundColor: '#E11D48',
    borderColor: '#E11D48',
  },
  inputContainer: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  inputHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  fieldHint: {
    fontSize: 10,
    color: '#1A6FD6',
    fontWeight: '600',
  },
  rupeeInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    height: 48,
    backgroundColor: '#F8FAFC',
  },
  rupeeSymbol: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginRight: 6,
  },
  rupeeInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  finesList: {
    marginTop: 10,
    gap: 8,
  },
  fineRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: Radius.sm,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FFE4E6',
    gap: 10,
  },
  fineRowItemActive: {
    borderColor: '#FDA4AF',
    backgroundColor: '#FFE4E6',
  },
  fineRowTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#BE123C',
  },
  fineRowSub: {
    fontSize: 11,
    color: '#E11D48',
  },
  fineRowAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#E11D48',
  },
  modeTabs: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  modeTabBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  modeTabBtnActive: {
    borderColor: '#1A6FD6',
    backgroundColor: '#EFF6FF',
  },
  modeTabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  modeTabBtnTextActive: {
    color: '#1A6FD6',
  },
  upiQrBox: {
    marginTop: 14,
    padding: 14,
    borderRadius: Radius.md,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  qrCanvasWrapper: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    ...Shadow.sm,
  },
  vpaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  vpaLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E40AF',
  },
  vpaText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1A6FD6',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  qrScanHint: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
  },
  utrSection: {
    width: '100%',
    marginTop: 12,
    gap: 6,
  },
  pinHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  textInputBox: {
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    height: 46,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    marginTop: 8,
  },
  sheetFooter: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 10,
    flexShrink: 0,
  },
  footerTotalCol: {
    flex: 1,
  },
  footerTotalLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  footerTotalVal: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 1,
  },
  footerBreakdownSub: {
    fontSize: 10,
    color: '#1A6FD6',
    fontWeight: '600',
    marginTop: 1,
  },
  submitFooterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1A6FD6',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    minWidth: 140,
    shadowColor: '#1A6FD6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitFooterBtnDisabled: {
    backgroundColor: '#94A3B8',
    shadowOpacity: 0,
  },
  submitFooterBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  receiptScroll: {
    padding: Spacing.md,
    paddingBottom: 40,
  },
  receiptCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadow.card,
  },
  receiptBanner: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  receiptBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  receiptCheckCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  receiptBannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  receiptBannerSub: {
    fontSize: 11,
    color: '#94A3B8',
  },
  receiptAmountHero: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 4,
  },
  receiptIdText: {
    fontSize: 11,
    color: '#38BDF8',
    fontWeight: '700',
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  receiptBody: {
    padding: Spacing.lg,
    gap: 12,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  receiptLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  receiptVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  receiptActionRow: {
    flexDirection: 'row',
    gap: 12,
    padding: Spacing.lg,
    paddingTop: 0,
  },
  shareReceiptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: Radius.md,
    gap: 8,
  },
  shareReceiptBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  doneReceiptBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: Radius.md,
  },
  doneReceiptBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
});
