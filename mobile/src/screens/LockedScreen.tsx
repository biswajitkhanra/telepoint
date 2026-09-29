import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Lock, Phone, RefreshCw, Wifi } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { Spacing, Radius } from '../constants/design';
import { openInternetPanel } from '../services/deviceManagement';
import { getCachedPhotoPath } from '../services/reminderService';
import { useAuth } from '../context/AuthContext';

/**
 * Customer-facing locked experience (spec part 20). Shown when the backend has
 * CONFIRMED the device is LOCKED. It is the app's OWN screen — clearly branded
 * TelePoint, never a fake Android system screen. It shows the live amount due
 * and the retailer assigned to this loan (both from the backend, never
 * hard-coded) and offers a button that opens the Android dialer.
 */
export const LockedScreen = ({
  emiAmount,
  retailerName,
  retailerPhone,
  customerName,
  onRefresh,
}: {
  emiAmount: number | null;
  retailerName: string | null;
  retailerPhone: string | null;
  customerName: string | null;
  onRefresh?: () => void;
}) => {
  const amount = emiAmount != null ? `₹${Math.round(emiAmount).toLocaleString('en-IN')}` : '—';

  // Customer photo (Section 7): prefer the OFFLINE-cached file so it shows even
  // with no network; fall back to the live URL from the session.
  const { customer } = useAuth();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getCachedPhotoPath()
      .then((p) => { if (!cancelled) setPhotoUri(p || customer?.customer_photo_url || null); })
      .catch(() => { if (!cancelled) setPhotoUri(customer?.customer_photo_url || null); });
    return () => { cancelled = true; };
  }, [customer?.customer_photo_url]);

  const callRetailer = () => {
    if (!retailerPhone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const num = retailerPhone.replace(/[^\d+]/g, '');
    Linking.openURL(`tel:${num}`).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {photoUri ? (
          <View style={styles.avatarWrap}>
            <Image source={{ uri: photoUri }} style={styles.avatar} resizeMode="cover" />
            <View style={styles.avatarLock}>
              <Lock size={18} color="#fff" />
            </View>
          </View>
        ) : (
          <View style={styles.lockBadge}>
            <Lock size={44} color="#fff" />
          </View>
        )}
        <Text style={styles.title}>Device Locked</Text>
        <Text style={styles.subtitle}>EMI payment required</Text>
        {customerName ? <Text style={styles.hello}>Account: {customerName}</Text> : null}

        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>Amount Due</Text>
          <Text style={styles.amount}>{amount}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Retailer</Text>
          <Text style={styles.retailerName}>{retailerName || 'Your TelePoint store'}</Text>
          {retailerPhone ? <Text style={styles.retailerPhone}>{retailerPhone}</Text> : null}

          <TouchableOpacity
            style={[styles.callBtn, !retailerPhone && styles.callBtnDisabled]}
            onPress={callRetailer}
            disabled={!retailerPhone}
            activeOpacity={0.85}
          >
            <Phone size={18} color="#fff" />
            <Text style={styles.callBtnText}>Call Retailer</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.dueBanner}>
          <Text style={styles.dueBannerText}>EMI Due — Please Pay Today to Unlock</Text>
          <Text style={styles.dueBannerTextBn}>ইএমআই বকেয়া — আনলক করতে আজই পরিশোধ করুন</Text>
        </View>

        <Text style={styles.note}>
          This device is financed on EMI. It will be unlocked once your payment is
          confirmed by the store. Pay at the store or online to resolve.
        </Text>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => openInternetPanel()} activeOpacity={0.7}>
            <Wifi size={16} color={Colors.textSecondary} />
            <Text style={styles.refreshText}>Turn on Wi-Fi / Data</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={onRefresh} activeOpacity={0.7}>
            <RefreshCw size={16} color={Colors.textSecondary} />
            <Text style={styles.refreshText}>Check status</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgBase },
  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg, gap: Spacing.base },
  lockBadge: { width: 92, height: 92, borderRadius: 46, backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  avatarWrap: { width: 100, height: 100, marginBottom: Spacing.sm },
  avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: Colors.danger, backgroundColor: Colors.bgCard },
  avatarLock: { position: 'absolute', bottom: 0, right: 0, width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.bgBase },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 15, fontWeight: '600', color: Colors.danger, marginTop: -Spacing.sm },
  hello: { fontSize: 13, color: Colors.textTertiary },
  amountCard: { width: '100%', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  amountLabel: { fontSize: 13, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 1 },
  amount: { fontSize: 40, fontWeight: '900', color: Colors.textPrimary, marginTop: Spacing.xs },
  card: { width: '100%', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: Spacing.xs },
  cardLabel: { fontSize: 12, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 1 },
  retailerName: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  retailerPhone: { fontSize: 15, color: Colors.textSecondary, marginBottom: Spacing.sm },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.success, paddingVertical: 14, paddingHorizontal: Spacing.xl, borderRadius: Radius.md, marginTop: Spacing.xs },
  callBtnDisabled: { backgroundColor: Colors.textTertiary },
  callBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  dueBanner: { width: '100%', backgroundColor: Colors.dangerLight ?? '#FEF2F2', borderRadius: Radius.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.base, alignItems: 'center', gap: 2, borderWidth: 1, borderColor: Colors.danger },
  dueBannerText: { fontSize: 14, fontWeight: '800', color: Colors.danger, textAlign: 'center' },
  dueBannerTextBn: { fontSize: 14, fontWeight: '700', color: Colors.danger, textAlign: 'center' },
  note: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: Spacing.sm },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.base, flexWrap: 'wrap' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm },
  refreshText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
});
