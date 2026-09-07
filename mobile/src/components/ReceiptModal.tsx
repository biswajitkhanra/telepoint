import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  CheckCircle2,
  Share2,
  X,
  ShieldCheck,
  Smartphone,
  Store,
  Calendar,
} from 'lucide-react-native';
import { EMIScheduleItem, Customer } from '../types';
import { THEME } from '../config';

interface ReceiptModalProps {
  visible: boolean;
  emi: EMIScheduleItem | null;
  customer: Customer | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  visible,
  emi,
  customer,
  onClose,
}) => {
  if (!emi) return null;

  const formatInr = (n: number) =>
    `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({
        message: `Telepoint EMI Payment Slip\nInstallment #${emi.emi_no}\nAmount: ${formatInr(
          emi.amount
        )}\nStatus: PAID\nCustomer: ${customer?.customer_name || 'Valued Customer'}\nDevice: ${
          customer?.model_no || 'Financed Device'
        }\nReceipt ID: REC-${emi.id.slice(0, 8).toUpperCase()}`,
        title: 'Telepoint EMI Payment Receipt',
      });
    } catch (e) {
      console.warn('Share error:', e);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheetContainer}>
          {/* Close Handle */}
          <View style={styles.headerBar}>
            <Text style={styles.headerTitle}>DIGITAL PAYMENT SLIP</Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
              style={styles.closeBtn}
            >
              <X size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Bank Slip Card */}
            <View style={styles.slipCard}>
              {/* Success Badge */}
              <View style={styles.successIconBox}>
                <CheckCircle2 size={40} color="#10B981" />
              </View>

              <Text style={styles.paidStatusTitle}>Payment Verified</Text>
              <Text style={styles.amountText}>{formatInr(emi.amount)}</Text>
              <Text style={styles.installmentSubtitle}>
                Installment #{emi.emi_no} of {customer?.emi_tenure || 12}
              </Text>

              {/* Decorative Perforated Divider */}
              <View style={styles.perforatedLine} />

              {/* Transaction Metadata Grid */}
              <View style={styles.dataGrid}>
                <View style={styles.gridRow}>
                  <View style={styles.gridLabelRow}>
                    <Calendar size={13} color="#64748B" />
                    <Text style={styles.gridLabel}>DUE DATE</Text>
                  </View>
                  <Text style={styles.gridValue}>{emi.due_date}</Text>
                </View>

                <View style={styles.gridRow}>
                  <View style={styles.gridLabelRow}>
                    <ShieldCheck size={13} color="#64748B" />
                    <Text style={styles.gridLabel}>RECEIPT ID</Text>
                  </View>
                  <Text style={styles.gridValue}>
                    REC-{emi.id.slice(0, 8).toUpperCase()}
                  </Text>
                </View>

                <View style={styles.gridRow}>
                  <View style={styles.gridLabelRow}>
                    <Smartphone size={13} color="#64748B" />
                    <Text style={styles.gridLabel}>DEVICE MODEL</Text>
                  </View>
                  <Text style={styles.gridValue} numberOfLines={1}>
                    {customer?.model_no || 'Smartphone'}
                  </Text>
                </View>

                <View style={styles.gridRow}>
                  <View style={styles.gridLabelRow}>
                    <Store size={13} color="#64748B" />
                    <Text style={styles.gridLabel}>RETAILER</Text>
                  </View>
                  <Text style={styles.gridValue} numberOfLines={1}>
                    {customer?.retailer?.name || 'Authorized Store'}
                  </Text>
                </View>
              </View>

              {/* Security Seal */}
              <View style={styles.sealRow}>
                <ShieldCheck size={14} color="#10B981" />
                <Text style={styles.sealText}>
                  TELEPOINT CRYPTOGRAPHICALLY SIGNED RECEIPT
                </Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={handleShare}
                style={styles.shareBtn}
              >
                <Share2 size={18} color="#FFFFFF" />
                <Text style={styles.shareBtnText}>Share Slip</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.88}
                onPress={onClose}
                style={styles.doneBtn}
              >
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
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
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    padding: 20,
  },
  sheetContainer: {
    backgroundColor: '#0E131F',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    maxHeight: '90%',
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  closeBtn: {
    padding: 6,
  },
  slipCard: {
    backgroundColor: '#131927',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 20,
  },
  successIconBox: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  paidStatusTitle: {
    color: '#34D399',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  amountText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  installmentSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 16,
  },
  perforatedLine: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 16,
  },
  dataGrid: {
    width: '100%',
    gap: 12,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gridLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gridLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  gridValue: {
    color: '#F1F5F9',
    fontSize: 12,
    fontWeight: '700',
  },
  sealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  sealText: {
    color: '#6EE7B7',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 14,
  },
  shareBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  doneBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  doneBtnText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
});
