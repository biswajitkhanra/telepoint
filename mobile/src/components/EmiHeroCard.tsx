import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Bell, ShieldCheck, ArrowUpRight, Calendar, AlertCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { EMIScheduleItem, Customer, DueBreakdown } from '../types';
import { THEME } from '../config';

interface EmiHeroCardProps {
  customer: Customer;
  nextEmi: EMIScheduleItem | null;
  paidCount: number;
  totalTenure: number;
  breakdown: DueBreakdown | null;
  onPayPress?: () => void;
}

export const EmiHeroCard: React.FC<EmiHeroCardProps> = ({
  customer,
  nextEmi,
  paidCount,
  totalTenure,
  breakdown,
  onPayPress,
}) => {
  // Format currency
  const formatInr = (n: number) =>
    `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;

  // Calculate days until due date in IST
  const getDaysUntilDue = (dueDateStr: string): number => {
    const today = new Date();
    const due = new Date(dueDateStr);
    const diffTime = due.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const daysUntilDue = nextEmi ? getDaysUntilDue(nextEmi.due_date) : null;
  const progressPercent = Math.min(100, Math.round((paidCount / Math.max(1, totalTenure)) * 100));

  const handleQuickPay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (onPayPress) {
      onPayPress();
      return;
    }

    // Direct UPI intent launch
    if (customer.retailer?.mobile && nextEmi) {
      const upiUrl = `upi://pay?pa=${customer.retailer.mobile}@paytm&pn=Telepoint&am=${nextEmi.amount}&cu=INR&tn=${encodeURIComponent(
        `EMI ${nextEmi.emi_no} | ${customer.customer_name}`
      )}`;
      Linking.canOpenURL(upiUrl).then(supported => {
        if (supported) {
          Linking.openURL(upiUrl);
        } else {
          Alert.alert(
            'Payment Details',
            `Pay via UPI to your retailer:\nMobile: ${customer.retailer?.mobile}\nAmount: ${formatInr(nextEmi.amount)}\nNote: EMI ${nextEmi.emi_no} ${customer.customer_name}`
          );
        }
      });
    }
  };

  return (
    <View style={styles.container}>
      {/* 3D Glass Layer with Bevel */}
      <View style={styles.topBevel} />
      <LinearGradient
        colors={['#1E293B', '#0F172A', '#080D1A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {/* Header Pill & Tag */}
        <View style={styles.headerRow}>
          <View style={styles.customerCodeBadge}>
            <ShieldCheck size={14} color="#60A5FA" />
            <Text style={styles.customerCodeText}>
              {customer.customer_code || `ID: ${customer.id.slice(0, 6)}`}
            </Text>
          </View>

          {nextEmi && daysUntilDue !== null && (
            <View
              style={[
                styles.statusPill,
                daysUntilDue <= 0
                  ? styles.pillDueToday
                  : daysUntilDue <= 5
                  ? styles.pillUpcoming
                  : styles.pillNormal,
              ]}
            >
              <Bell size={12} color={daysUntilDue <= 0 ? '#F87171' : '#FBBF24'} />
              <Text
                style={[
                  styles.statusPillText,
                  daysUntilDue <= 0
                    ? styles.textDueToday
                    : daysUntilDue <= 5
                    ? styles.textUpcoming
                    : styles.textNormal,
                ]}
              >
                {daysUntilDue === 0
                  ? 'Due Today!'
                  : daysUntilDue === 1
                  ? 'Due Tomorrow'
                  : daysUntilDue > 1 && daysUntilDue <= 5
                  ? `Due in ${daysUntilDue} Days`
                  : 'Upcoming EMI'}
              </Text>
            </View>
          )}
        </View>

        {/* Main Amount Callout */}
        <View style={styles.amountSection}>
          <Text style={styles.amountLabel}>
            {nextEmi ? `INSTALLMENT #${nextEmi.emi_no} AMOUNT` : 'ALL EMIs PAID'}
          </Text>
          <Text style={styles.amountText}>
            {nextEmi ? formatInr(nextEmi.amount) : '₹0'}
          </Text>
        </View>

        {/* Due Date & Tenure Row */}
        {nextEmi && (
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Calendar size={14} color="#94A3B8" />
              <Text style={styles.metaText}>Due: {nextEmi.due_date}</Text>
            </View>
            <Text style={styles.metaDivider}>•</Text>
            <Text style={styles.metaText}>
              {paidCount} of {totalTenure} Paid
            </Text>
          </View>
        )}

        {/* Progress Bar */}
        <View style={styles.progressTrack}>
          <LinearGradient
            colors={['#3B82F6', '#10B981']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressFill, { width: `${progressPercent}%` }]}
          />
        </View>

        {/* Fine Warning if fine applies */}
        {breakdown && breakdown.fine_due > 0 && (
          <View style={styles.fineWarningBox}>
            <AlertCircle size={14} color="#EF4444" />
            <Text style={styles.fineWarningText}>
              Overdue Fine: {formatInr(breakdown.fine_due)} (Accrues ₹25/week)
            </Text>
          </View>
        )}

        {/* Action Button */}
        {nextEmi && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleQuickPay}
            style={styles.payButton}
          >
            <LinearGradient
              colors={['#2563EB', '#1D4ED8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.payButtonGradient}
            >
              <Text style={styles.payButtonText}>Pay EMI Online</Text>
              <ArrowUpRight size={18} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>
        )}
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 24,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    marginVertical: 10,
  },
  topBevel: {
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  gradient: {
    padding: 22,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  customerCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.3)',
  },
  customerCodeText: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 5,
  },
  pillDueToday: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderWidth: 1,
  },
  pillUpcoming: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
    borderWidth: 1,
  },
  pillNormal: {
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  textDueToday: {
    color: '#F87171',
  },
  textUpcoming: {
    color: '#FBBF24',
  },
  textNormal: {
    color: '#94A3B8',
  },
  amountSection: {
    marginBottom: 12,
  },
  amountLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  amountText: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  metaDivider: {
    color: '#475569',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#1E293B',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  fineWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    padding: 10,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  fineWarningText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '500',
  },
  payButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  payButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  payButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
