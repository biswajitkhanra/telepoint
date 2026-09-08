// components/EMIRow.tsx
// Single month EMI schedule item with interactive spring expansion & clear status badges

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Receipt,
  FileText,
} from 'lucide-react-native';
import { Haptics } from '../utils/haptics';
import { EMIScheduleItem } from '../types';
import { Colors } from '../constants/colors';
import { Radius, Spacing, Shadow } from '../constants/design';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface EMIRowProps {
  item: EMIScheduleItem;
  index: number;
  onReceiptPress?: (item: EMIScheduleItem) => void;
}

export const EMIRow: React.FC<EMIRowProps> = ({ item, index, onReceiptPress }) => {
  const [expanded, setExpanded] = useState(false);
  const isPaid = item.status === 'collected' || item.status === 'APPROVED' || !!item.paid_at;
  const isPendingApproval = !isPaid && item.status === 'PENDING_APPROVAL';
  const isPartial = !isPaid && (item.status === 'PARTIALLY_PAID' || Number(item.partial_paid_amount || 0) > 0);
  const isOverdue = !isPaid && !isPartial && !isPendingApproval && (item.status === 'overdue' || (item.status === 'UNPAID' && new Date(item.due_date) < new Date()) || (Number(item.fine_amount || 0) > 0 && !item.fine_paid_at));
  const isPending = !isPaid && !isPartial && !isOverdue && !isPendingApproval;

  const toggleExpand = () => {
    Haptics.selectionAsync();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  const formattedDueDate = (() => {
    try {
      const d = new Date(item.due_date);
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return item.due_date;
    }
  })();

  const formattedPaidDate = item.paid_at
    ? (() => {
        try {
          const d = new Date(item.paid_at);
          return d.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          });
        } catch {
          return item.paid_at;
        }
      })()
    : null;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={toggleExpand}
      style={[
        styles.card,
        isPaid ? styles.paidCard : null,
        isPending ? styles.pendingCard : null,
        isOverdue ? styles.overdueCard : null,
      ]}
    >
      <View style={styles.mainRow}>
        {/* Status Indicator Icon */}
        <View style={styles.iconCol}>
          {isPaid ? (
            <View style={styles.paidIconCircle}>
              <CheckCircle2 size={18} color="#10B981" />
            </View>
          ) : isPartial ? (
            <View style={[styles.pendingIconCircle, { backgroundColor: '#FEF3C7' }]}>
              <Clock size={18} color="#B45309" />
            </View>
          ) : isOverdue ? (
            <View style={styles.overdueIconCircle}>
              <AlertTriangle size={18} color="#EF4444" />
            </View>
          ) : (
            <View style={styles.pendingIconCircle}>
              <Clock size={18} color="#1A6FD6" />
            </View>
          )}
        </View>

        {/* EMI Details */}
        <View style={styles.infoCol}>
          <View style={styles.headerRow}>
            <Text style={styles.emiNumberText}>EMI #{item.emi_no}</Text>
            {isPaid ? (
              <View style={styles.paidBadge}>
                <Text style={styles.paidBadgeText}>✓ PAID</Text>
              </View>
            ) : isPendingApproval ? (
              <View style={styles.pendingApprovalBadge}>
                <Text style={styles.pendingApprovalBadgeText}>PENDING APPROVAL</Text>
              </View>
            ) : isPartial ? (
              <View style={styles.partialBadge}>
                <Text style={styles.partialBadgeText}>PARTIALLY PAID</Text>
              </View>
            ) : isOverdue ? (
              <View style={styles.overdueBadge}>
                <Text style={styles.overdueBadgeText}>OVERDUE</Text>
              </View>
            ) : (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>UPCOMING</Text>
              </View>
            )}
          </View>

          <Text style={styles.dueDateText}>Due: {formattedDueDate}</Text>
        </View>

        {/* Amount & Expand indicator */}
        <View style={styles.amountCol}>
          <Text style={[styles.amountText, isPaid && styles.paidAmountText]}>
            ₹{item.amount.toLocaleString('en-IN')}
          </Text>
          <View style={styles.expandRow}>
            <Text style={styles.detailsLabel}>Details</Text>
            {expanded ? (
              <ChevronUp size={14} color="#64748B" />
            ) : (
              <ChevronDown size={14} color="#64748B" />
            )}
          </View>
        </View>
      </View>

      {/* Expandable details drawer */}
      {expanded && (
        <View style={styles.drawer}>
          <View style={styles.drawerDivider} />

          <View style={styles.drawerRow}>
            <Text style={styles.drawerLabel}>Installment Status</Text>
            <Text
              style={[
                styles.drawerValue,
                isPaid ? { color: '#059669' } : { color: '#1A6FD6' },
              ]}
            >
              {isPaid ? 'Settled & Verified' : 'Scheduled / Due'}
            </Text>
          </View>

          {formattedPaidDate && (
            <View style={styles.drawerRow}>
              <Text style={styles.drawerLabel}>Paid On</Text>
              <Text style={styles.drawerValue}>{formattedPaidDate}</Text>
            </View>
          )}

          {item.mode && (
            <View style={styles.drawerRow}>
              <Text style={styles.drawerLabel}>Payment Mode</Text>
              <Text style={styles.drawerValue}>{item.mode.toUpperCase()}</Text>
            </View>
          )}

          {item.utr && (
            <View style={styles.drawerRow}>
              <Text style={styles.drawerLabel}>UTR / Ref No.</Text>
              <Text style={styles.drawerValueMono}>{item.utr}</Text>
            </View>
          )}

          {item.fine_amount != null && item.fine_amount > 0 && (
            <View style={styles.drawerRow}>
              <Text style={styles.drawerLabel}>Late Fine Amount</Text>
              <Text style={[styles.drawerValue, { color: '#EF4444' }]}>
                ₹{item.fine_amount.toLocaleString('en-IN')}
              </Text>
            </View>
          )}

          {isPaid && onReceiptPress && (
            <TouchableOpacity
              style={styles.receiptButton}
              activeOpacity={0.8}
              onPress={() => onReceiptPress(item)}
            >
              <Receipt size={14} color="#1A6FD6" />
              <Text style={styles.receiptButtonText}>View Digital Receipt</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  paidCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  pendingCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#1A6FD6',
    backgroundColor: '#FFFFFF',
  },
  overdueCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCol: {
    marginRight: Spacing.md,
  },
  paidIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EFF5FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overdueIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoCol: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  emiNumberText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  paidBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  paidBadgeText: {
    color: '#059669',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  pendingBadge: {
    backgroundColor: '#EFF5FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  pendingBadgeText: {
    color: '#1A6FD6',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  pendingApprovalBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  pendingApprovalBadgeText: {
    color: '#2563EB',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  partialBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  partialBadgeText: {
    color: '#B45309',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  overdueBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  overdueBadgeText: {
    color: '#DC2626',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  dueDateText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  amountCol: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    fontVariant: ['tabular-nums'],
  },
  paidAmountText: {
    color: '#059669',
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 4,
  },
  detailsLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  drawer: {
    marginTop: Spacing.sm,
  },
  drawerDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: Spacing.sm,
  },
  drawerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  drawerLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  drawerValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  drawerValueMono: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
    fontVariant: ['tabular-nums'],
  },
  receiptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: '#EFF5FF',
    borderWidth: 1,
    borderColor: 'rgba(26, 111, 214, 0.2)',
  },
  receiptButtonText: {
    color: '#1A6FD6',
    fontSize: 12,
    fontWeight: '700',
  },
});
