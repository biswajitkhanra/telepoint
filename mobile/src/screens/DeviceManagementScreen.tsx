import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ShieldCheck, Smartphone, Lock, ChevronLeft, Info } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/colors';
import { Spacing, Radius } from '../constants/design';
import { getInstallationId, registerDevice } from '../services/deviceApi';
import {
  describeMode,
  getDeviceInfo,
  getDeviceManagementStatus,
  isDeviceAdminEnabled,
  isDeviceManagementSupported,
  requestDeviceAdmin,
  openDeviceAdminSettings,
  type DeviceManagementStatus,
} from '../services/deviceManagement';

/**
 * Transparent, consent-first device-management screen (spec parts 7 & 9).
 * Explains the EMI arrangement in plain language, shows the device's real
 * Android management mode and capability, and only enables management after an
 * explicit tap that opens the OS permission dialog. Nothing is enabled silently.
 */
export const DeviceManagementScreen = ({ navigation }: { navigation?: { goBack: () => void } }) => {
  const { customer } = useAuth();
  const supported = isDeviceManagementSupported();
  const [status, setStatus] = useState<DeviceManagementStatus | null>(null);
  const [model, setModel] = useState<string>(customer?.model_no || '');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!supported) return;
    try {
      const [st, info] = await Promise.all([getDeviceManagementStatus(), getDeviceInfo()]);
      setStatus(st);
      if (info.model) setModel(`${info.manufacturer} ${info.model}`.trim());
      // Keep the backend device row in sync with the real admin state.
      if (customer?.id) {
        const installationId = await getInstallationId();
        await registerDevice({
          customerId: customer.id,
          installationId,
          deviceModel: info.model || customer.model_no,
          deviceManufacturer: info.manufacturer,
          androidVersion: info.androidVersion,
          appVersion: '1.0.0',
          adminEnabled: st.adminActive,
          managementMode: st.mode,
        });
      }
    } catch { /* ignore */ }
  }, [supported, customer]);

  useEffect(() => { refresh(); }, [refresh]);

  const onConsentAndEnable = async () => {
    if (!customer?.id) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const installationId = await getInstallationId();
      const info = await getDeviceInfo();
      // Record consent first (registers/updates the device row with consent).
      await registerDevice({
        customerId: customer.id,
        installationId,
        deviceModel: info.model || customer.model_no,
        deviceManufacturer: info.manufacturer,
        androidVersion: info.androidVersion,
        appVersion: '1.0.0',
        consent: true,
        adminEnabled: await isDeviceAdminEnabled(),
      });
      // Then open the Android system permission dialog (explicit user action).
      await requestDeviceAdmin();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const mode = status?.mode ?? 'UNSUPPORTED';
  const desc = describeMode(mode);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.back} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Device Management</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <ShieldCheck size={40} color={Colors.primary} />
          <Text style={styles.heroTitle}>EMI Device Management</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.p}>
            This device is financed through an EMI agreement. TelePoint may use
            supported Android device-management features according to that
            agreement.
          </Text>
          <Text style={styles.p}>
            Device-management capabilities depend on the Android management mode
            supported by this device. When the device is locked for an overdue
            EMI, this app shows your amount due, your store's name and phone
            number, and a button to call the store. It never hides itself and
            never touches emergency calling.
          </Text>
          <Text style={styles.p}>
            You must explicitly authorize device management before the feature
            can be enabled. You can review or remove the permission anytime.
          </Text>
        </View>

        <View style={styles.card}>
          <Row icon={<Smartphone size={18} color={Colors.textSecondary} />} label="Device" value={model || 'This device'} />
          <Row icon={<Info size={18} color={Colors.textSecondary} />} label="Management mode" value={desc.label} />
          <Row icon={<Lock size={18} color={Colors.textSecondary} />} label="Lock supported" value={desc.canLock ? 'Yes' : 'No'} />
          <Row icon={<ShieldCheck size={18} color={Colors.textSecondary} />} label="Permission" value={status?.adminActive ? 'Enabled' : 'Not enabled'} last />
          <Text style={styles.modeDetail}>{desc.detail}</Text>
        </View>

        {!supported && (
          <View style={[styles.card, styles.warnCard]}>
            <Text style={styles.warnText}>
              Device management is unavailable in this build. A development or EAS
              build is required — Expo Go cannot provide Android device management.
            </Text>
          </View>
        )}

        {supported && !status?.adminActive && (
          <TouchableOpacity style={styles.primaryBtn} onPress={onConsentAndEnable} disabled={busy} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>I understand and continue</Text>}
          </TouchableOpacity>
        )}

        {supported && status?.adminActive && (
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => openDeviceAdminSettings()} activeOpacity={0.85}>
            <Text style={styles.secondaryBtnText}>Review permission in Settings</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const Row = ({ icon, label, value, last }: { icon: React.ReactNode; label: string; value: string; last?: boolean }) => (
  <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
    <View style={styles.rowLeft}>{icon}<Text style={styles.rowLabel}>{label}</Text></View>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgBase },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, backgroundColor: Colors.bgCard, borderBottomWidth: 1, borderBottomColor: Colors.border },
  back: { padding: 2 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  body: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },
  hero: { alignItems: 'center', marginBottom: Spacing.lg, gap: Spacing.sm },
  heroTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.base, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.base },
  p: { fontSize: 14, lineHeight: 21, color: Colors.textSecondary, marginBottom: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rowLabel: { fontSize: 14, color: Colors.textSecondary },
  rowValue: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, maxWidth: '55%', textAlign: 'right' },
  modeDetail: { fontSize: 13, color: Colors.textTertiary, marginTop: Spacing.sm, lineHeight: 19 },
  warnCard: { backgroundColor: Colors.warningLight, borderColor: Colors.warning },
  warnText: { fontSize: 13, color: '#92400E', lineHeight: 19 },
  primaryBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 16, alignItems: 'center', marginTop: Spacing.sm },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 15, alignItems: 'center', marginTop: Spacing.sm },
  secondaryBtnText: { color: Colors.primary, fontSize: 15, fontWeight: '700' },
});
