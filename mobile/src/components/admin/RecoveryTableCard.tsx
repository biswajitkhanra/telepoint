// mobile/src/components/admin/RecoveryTableCard.tsx
// Retailer Recovery Ledger Card with Recovery % Progress and Surplus/Deficit Badges

import React from 'react';
import { View, Text, StyleSheet, Linking, Alert } from 'react-native';
import { Store, PhoneCall, MessageCircle, ArrowUpRight, CheckCircle2 } from 'lucide-react-native';
import { JellyCard } from '../JellyCard';
import { PressableScale } from '../PressableScale';
import { Haptics } from '../../utils/haptics';
import { Radius, Spacing } from '../../constants/design';
import { RetailerRecoveryItem } from '../../types';

interface RecoveryTableCardProps {
  item: RetailerRecoveryItem;
  mobile?: string;
  onPressDetail?: () => void;
  mountDelay?: number;
}

export const RecoveryTableCard: React.FC<RecoveryTableCardProps> = ({
  item,
  mobile,
  onPressDetail,
  mountDelay = 0,
}) => {
  const isSurplus = item.deficit <= 0;
  const recoveryPct = item.loanGiven > 0
    ? Math.min(100, Math.round((item.totalCollected / item.loanGiven) * 100))
    : 100;

  const handleCall = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!mobile) {
      Alert.alert('No Phone', `No mobile number registered for ${item.name}.`);
      return;
    }
    const clean = mobile.replace(/\D/g, '').slice(-10);
    Linking.openURL(`tel:${clean}`).catch(() => Alert.alert('Call Failed', 'Unable to initiate call.'));
  };

  const handleWhatsApp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!mobile) {
      Alert.alert('No Phone', `No mobile number registered for ${item.name}.`);
      return;
    }
    const clean = mobile.replace(/\D/g, '').slice(-10);
    const msg = encodeURIComponent(
      `Hello ${item.name}, this is Telepoint Administration regarding your store collection summary: Disbursed: ₹${item.loanGiven.toLocaleString('en-IN')}, Collected: ₹${item.totalCollected.toLocaleString('en-IN')}. Please contact us if you need any assistance.`
    );
    const waUrl = `whatsapp://send?phone=91${clean}&text=${msg}`;
    const webUrl = `https://wa.me/91${clean}?text=${msg}`;
    Linking.canOpenURL(waUrl)
      .then(sup => (sup ? Linking.openURL(waUrl) : Linking.openURL(webUrl)))
      .catch(() => Linking.openURL(webUrl));
  };

  return (
    <JellyCard
      accentColor={isSurplus ? '#10B981' : item.deficit > 500000 ? '#E11D48' : '#F59E0B'}
      style={styles.card}
      mountDelay={mountDelay}
    >
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.shopName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.activeCountSub}>
            {item.runningCount} Active Loans • {item.npaCount} NPA • {item.settledCount} Settled
          </Text>
        </View>

        <View style={[styles.statusPill, isSurplus ? styles.surplusPill : styles.deficitPill]}>
          <Text style={[styles.statusPillText, isSurplus ? styles.surplusText : styles.deficitText]}>
            {isSurplus ? 'SURPLUS' : 'DEFICIT'} ₹{Math.abs(item.deficit).toLocaleString('en-IN')}
          </Text>
        </View>
      </View>

      {/* Recovery Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressLabelRow}>
          <Text style={styles.progressLabel}>RECOVERY PROGRESS</Text>
          <Text style={[styles.progressVal, isSurplus && { color: '#059669' }]}>
            {recoveryPct}% ({Math.round(item.totalCollected / 1000)}k / {Math.round(item.loanGiven / 1000)}k)
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${recoveryPct}%` },
              isSurplus ? { backgroundColor: '#10B981' } : { backgroundColor: '#1A6FD6' },
            ]}
          />
        </View>
      </View>

      {/* Bottom Financial Columns */}
      <View style={styles.financialRow}>
        <View style={styles.finCol}>
          <Text style={styles.finLabel}>INVESTED</Text>
          <Text style={styles.finVal}>₹{item.loanGiven.toLocaleString('en-IN')}</Text>
        </View>
        <View style={styles.finCol}>
          <Text style={styles.finLabel}>COLLECTED</Text>
          <Text style={[styles.finVal, { color: '#059669' }]}>
            ₹{item.totalCollected.toLocaleString('en-IN')}
          </Text>
        </View>
        <View style={styles.finCol}>
          <Text style={styles.finLabel}>1ST CHARGE</Text>
          <Text style={styles.finVal}>₹{item.firstChargeCollected.toLocaleString('en-IN')}</Text>
        </View>
      </View>

      {/* Action Row */}
      <View style={styles.actionsRow}>
        {mobile ? (
          <>
            <PressableScale onPress={handleCall} style={styles.callBtn} scaleTo={0.92}>
              <PhoneCall size={12} color="#1A6FD6" />
              <Text style={styles.callBtnText}>Call Store</Text>
            </PressableScale>
            <PressableScale onPress={handleWhatsApp} style={styles.waBtn} scaleTo={0.92}>
              <MessageCircle size={12} color="#059669" />
              <Text style={styles.waBtnText}>WhatsApp</Text>
            </PressableScale>
          </>
        ) : null}
      </View>
    </JellyCard>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: Radius.lg,
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  shopName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  activeCountSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  surplusPill: {
    backgroundColor: '#ECFDF5',
  },
  deficitPill: {
    backgroundColor: '#FFE4E6',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  surplusText: {
    color: '#059669',
  },
  deficitText: {
    color: '#E11D48',
  },
  progressContainer: {
    marginBottom: 10,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  progressLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
  },
  progressVal: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1A6FD6',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  financialRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  finCol: {
    flex: 1,
  },
  finLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
  },
  finVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  callBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  callBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A6FD6',
  },
  waBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  waBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
});
