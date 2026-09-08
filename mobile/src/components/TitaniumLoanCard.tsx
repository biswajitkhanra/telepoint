import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { Haptics, NotificationFeedbackType } from '../utils/haptics';
import {
  Smartphone,
  Copy,
  Check,
  ShieldCheck,
  Cpu,
} from 'lucide-react-native';
import { Customer } from '../types';
import { THEME } from '../config';
import { Card3D } from './Card3D';

interface TitaniumLoanCardProps {
  customer: Customer;
}

export const TitaniumLoanCard: React.FC<TitaniumLoanCardProps> = ({ customer }) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = async (text: string, fieldName: string) => {
    await Clipboard.setStringAsync(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const formatImei = (imei?: string) => {
    if (!imei) return '•••• •••• ••••';
    const last4 = imei.slice(-4);
    return `•••• •••• •••• ${last4}`;
  };

  const formatInr = (n: number) =>
    `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;

  return (
    <Card3D
      style={styles.cardContainer}
      gradientColors={['#FFFFFF', '#F8FAFC']}
      elevated={true}
    >
      {/* Background Micro-Circuit Foil Sheen */}
      <LinearGradient
        colors={['rgba(37, 99, 235, 0.04)', 'transparent', 'rgba(16, 185, 129, 0.04)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      {/* Top Header: Brand & Live Status */}
      <View style={styles.headerRow}>
        <View style={styles.brandBadge}>
          <Cpu size={16} color="#2563EB" />
          <Text style={styles.brandTitle}>TELEPOINT PASSBOOK</Text>
        </View>

        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>
            {customer.status === 'RUNNING'
              ? 'ACTIVE LOAN'
              : customer.status === 'COMPLETE'
              ? 'LOAN CLOSED'
              : customer.status}
          </Text>
        </View>
      </View>

      {/* Device Name & Chip Crest */}
      <View style={styles.deviceRow}>
        <View style={styles.deviceIconBox}>
          <Smartphone size={22} color="#2563EB" />
        </View>
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceModel} numberOfLines={1}>
            {customer.model_no || 'Financed Android Smartphone'}
          </Text>
          <Text style={styles.retailerName} numberOfLines={1}>
            Issued by {customer.retailer?.name || 'Authorized Retailer'}
          </Text>
        </View>
      </View>

      {/* Security Data Strip: IMEI & Loan ID */}
      <View style={styles.securityStrip}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => copyToClipboard(customer.imei || '', 'IMEI')}
          style={styles.securityItem}
        >
          <Text style={styles.securityLabel}>SECURE IMEI</Text>
          <View style={styles.copyValueRow}>
            <Text style={styles.securityValue}>{formatImei(customer.imei)}</Text>
            {copiedField === 'IMEI' ? (
              <Check size={12} color={THEME.accent.success} />
            ) : (
              <Copy size={12} color={THEME.text.muted} />
            )}
          </View>
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => copyToClipboard(customer.id, 'LOAN')}
          style={styles.securityItem}
        >
          <Text style={styles.securityLabel}>LOAN ACCOUNT</Text>
          <View style={styles.copyValueRow}>
            <Text style={styles.securityValue} numberOfLines={1}>
              #{customer.id.slice(0, 8).toUpperCase()}
            </Text>
            {copiedField === 'LOAN' ? (
              <Check size={12} color={THEME.accent.success} />
            ) : (
              <Copy size={12} color={THEME.text.muted} />
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* Card Footer: Financed Amount & Verified Shield */}
      <View style={styles.footerRow}>
        <View>
          <Text style={styles.amountLabel}>FINANCED VALUE</Text>
          <Text style={styles.amountValue}>
            {formatInr(Number(customer.purchase_value || customer.disburse_amount || 0))}
          </Text>
        </View>

        <View style={styles.shieldBadge}>
          <ShieldCheck size={14} color="#059669" />
          <Text style={styles.shieldText}>256-BIT ENCRYPTED</Text>
        </View>
      </View>
    </Card3D>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    marginHorizontal: 16,
    marginVertical: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandTitle: {
    color: '#2563EB',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  statusText: {
    color: '#059669',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  deviceIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceModel: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  retailerName: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  securityStrip: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    marginBottom: 16,
  },
  securityItem: {
    flex: 1,
  },
  securityLabel: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  copyValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  securityValue: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.1)',
    marginHorizontal: 12,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingTop: 4,
  },
  amountLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  amountValue: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  shieldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  shieldText: {
    color: '#059669',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
