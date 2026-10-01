import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ShieldCheck, Smartphone, Lock, ChevronLeft, Info, BatteryCharging, AlarmClock, Eye, Bell, MessageSquare, MapPin, CreditCard, Layers } from 'lucide-react-native';
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
  isIgnoringBatteryOptimizations,
  requestIgnoreBatteryOptimizations,
  getProtectionStatus,
  isAccessibilityServiceEnabled,
  getPermissionDiagnostics,
  type DeviceManagementStatus,
  type PermissionDiagnostics,
} from '../services/deviceManagement';
import { reminderExactAlarmStatus, requestReminderExactAlarmPermission } from '../services/reminderService';

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
  const [batteryOk, setBatteryOk] = useState(true);
  const [exactAlarmsOk, setExactAlarmsOk] = useState(true);
  const [protection, setProtection] = useState<Awaited<ReturnType<typeof getProtectionStatus>> | null>(null);
  const [a11yOk, setA11yOk] = useState(false);
  const [diag, setDiag] = useState<PermissionDiagnostics | null>(null);

  const refresh = useCallback(async () => {
    if (!supported) return;
    try {
      const [st, info] = await Promise.all([getDeviceManagementStatus(), getDeviceInfo()]);
      setStatus(st);
      isIgnoringBatteryOptimizations().then(setBatteryOk).catch(() => {});
      reminderExactAlarmStatus().then((r) => setExactAlarmsOk(!!r.canScheduleExactAlarms)).catch(() => {});
      getProtectionStatus().then(setProtection).catch(() => {});
      isAccessibilityServiceEnabled().then(setA11yOk).catch(() => {});
      getPermissionDiagnostics().then(setDiag).catch(() => {});
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

  const onAllowBattery = async () => {
    await requestIgnoreBatteryOptimizations();
    // Re-check shortly after (the user may still be in the OS dialog).
    setTimeout(() => { isIgnoringBatteryOptimizations().then(setBatteryOk).catch(() => {}); }, 800);
  };

  const onAllowExactAlarms = async () => {
    await requestReminderExactAlarmPermission();
    setTimeout(() => { reminderExactAlarmStatus().then((r) => setExactAlarmsOk(!!r.canScheduleExactAlarms)).catch(() => {}); }, 800);
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
            can be enabled. On a fully managed financed phone, uninstall and
            Settings factory reset are restricted until repayment is confirmed.
            Contact your retailer for help or to resolve a payment dispute.
          </Text>
        </View>

        <View style={styles.card}>
          <Row icon={<Smartphone size={18} color={Colors.textSecondary} />} label="Device" value={model || 'This device'} />
          <Row icon={<Info size={18} color={Colors.textSecondary} />} label="Management mode" value={desc.label} />
          <Row icon={<Lock size={18} color={Colors.textSecondary} />} label="Lock supported" value={desc.canLock ? 'Yes' : 'No'} />
          <Row icon={<ShieldCheck size={18} color={Colors.textSecondary} />} label="Permission" value={status?.adminActive ? 'Enabled' : 'Not enabled'} />
          <Row icon={<BatteryCharging size={18} color={Colors.textSecondary} />} label="Battery" value={batteryOk ? 'Unrestricted' : 'Restricted'} last />
          <Text style={styles.modeDetail}>{desc.detail}</Text>
        </View>

        {supported && !batteryOk && (
          <View style={[styles.card, styles.warnCard]}>
            <View style={styles.warnHead}>
              <BatteryCharging size={18} color={Colors.warning} />
              <Text style={styles.warnTitle}>Allow unrestricted battery</Text>
            </View>
            <Text style={styles.warnText}>
              For the EMI lock and reminders to work reliably in the background,
              this app needs unrestricted battery usage. Tap below and choose
              &ldquo;Allow / Don&rsquo;t optimize&rdquo;.
            </Text>
            <TouchableOpacity style={[styles.primaryBtn, { marginTop: Spacing.sm }]} onPress={onAllowBattery} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Allow unrestricted battery</Text>
            </TouchableOpacity>
          </View>
        )}

        {supported && !exactAlarmsOk && (
          <View style={[styles.card, styles.warnCard]}>
            <View style={styles.warnHead}>
              <AlarmClock size={18} color={Colors.warning} />
              <Text style={styles.warnTitle}>Allow exact alarms</Text>
            </View>
            <Text style={styles.warnText}>
              EMI reminders fire at exact times (10:00 AM &amp; 6:00 PM before the
              due date, hourly on the due day). On Android 12+ this needs the
              &ldquo;Alarms &amp; reminders&rdquo; permission. Tap below and allow it
              so reminders are never late.
            </Text>
            <TouchableOpacity style={[styles.primaryBtn, { marginTop: Spacing.sm }]} onPress={onAllowExactAlarms} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Allow exact alarms</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Collateral protection is only claimed when it is actually enforceable
            — i.e. Device Owner. Each line reflects the LIVE enforced state read
            from the OS, so nothing is overstated. On ordinary (non-owner) devices
            Android permits none of this and we do not pretend (no Accessibility
            workaround). */}
        {supported && mode === 'DEVICE_OWNER' && (
          <View style={styles.card}>
            <View style={styles.warnHead}>
              <ShieldCheck size={18} color={Colors.primary} />
              <Text style={[styles.warnTitle, { color: Colors.textPrimary }]}>Financing protection status</Text>
            </View>
            <Row icon={<Lock size={18} color={Colors.textSecondary} />} label="App uninstall" value={!protection ? 'Checking' : protection.uninstallBlocked ? 'Blocked' : 'Not blocked'} />
            <Row icon={<Info size={18} color={Colors.textSecondary} />} label="Factory reset (Settings)" value={protection?.factoryResetBlocked ? 'Blocked' : '—'} />
            <Row icon={<Info size={18} color={Colors.textSecondary} />} label="Safe Mode" value={protection?.safeBootBlocked ? 'Blocked' : '—'} />
            <Row icon={<Info size={18} color={Colors.textSecondary} />} label="Add user" value={protection?.addUserBlocked ? 'Blocked' : '—'} />
            <Row icon={<Info size={18} color={Colors.textSecondary} />} label="USB debugging" value={diag?.debuggingBlocked ? 'Blocked' : '—'} />
            <Row icon={<Info size={18} color={Colors.textSecondary} />} label="Force-stop / clear data" value={diag?.userControlDisabled ? 'Blocked' : '—'} />
            <Row icon={<ShieldCheck size={18} color={Colors.textSecondary} />} label="Accessibility protection" value={a11yOk ? 'Enabled (confirmed)' : 'Not enabled'} />
            <Row icon={<ShieldCheck size={18} color={Colors.textSecondary} />} label="Lock-screen overlay" value={diag?.overlayGranted ? 'Granted' : 'Not granted'} />
            <Row icon={<ShieldCheck size={18} color={Colors.textSecondary} />} label="Factory Reset Protection" value={!protection ? 'Checking' : protection.frpEnabled ? 'Enabled' : protection.frpSupported ? 'Not enabled' : 'Not supported'} last />
            <Text style={styles.modeDetail}>
              These protections apply while your EMI is unpaid and are released
              automatically once it is fully cleared. A hardware/recovery wipe
              is not blocked by this app. If configured and supported by the
              phone, Factory Reset Protection requires an authorised account
              during setup after a reset.
            </Text>
          </View>
        )}

        {supported && (
          <View style={styles.card}>
            <View style={styles.warnHead}>
              <Info size={18} color={Colors.primary} />
              <Text style={[styles.warnTitle, { color: Colors.textPrimary }]}>Android permissions this app uses</Text>
            </View>
            <Row icon={<ShieldCheck size={18} color={Colors.textSecondary} />} label="Device Administrator" value="Lock / unlock + EMI protection" />
            <Row icon={<Eye size={18} color={Colors.textSecondary} />} label="Accessibility" value="Blocks uninstall & reset attempts (you consented)" />
            <Row icon={<Layers size={18} color={Colors.textSecondary} />} label="Display over other apps" value="Instant lock screen" />
            <Row icon={<Bell size={18} color={Colors.textSecondary} />} label="Notifications" value="EMI reminders" />
            <Row icon={<AlarmClock size={18} color={Colors.textSecondary} />} label="Exact alarms" value="Reminders at exact times" />
            <Row icon={<MessageSquare size={18} color={Colors.textSecondary} />} label="SMS (receive + send)" value="Offline LOCK / UNLOCK from the store" />
            <Row icon={<MapPin size={18} color={Colors.textSecondary} />} label="Location (incl. background)" value="Find the phone when needed" />
            <Row icon={<CreditCard size={18} color={Colors.textSecondary} />} label="Phone state" value="SIM info for protection" />
            <Row icon={<BatteryCharging size={18} color={Colors.textSecondary} />} label="Battery (unrestricted)" value="Background protection keeps working" last />
            <Text style={styles.modeDetail}>
              The camera lock, uninstall block, factory-reset block and Factory
              Reset Protection are Device Owner policies applied by your store —
              not one-by-one permissions. Nothing here is used for advertising or
              for anything beyond the EMI agreement. All restrictions are removed
              automatically once your EMI is fully paid.
            </Text>
          </View>
        )}

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
  warnHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  warnTitle: { fontSize: 15, fontWeight: '800', color: '#92400E' },
  warnText: { fontSize: 13, color: '#92400E', lineHeight: 19 },
  primaryBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 16, alignItems: 'center', marginTop: Spacing.sm },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 15, alignItems: 'center', marginTop: Spacing.sm },
  secondaryBtnText: { color: Colors.primary, fontSize: 15, fontWeight: '700' },
});
