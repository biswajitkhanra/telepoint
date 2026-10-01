import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import {
  ShieldCheck, Smartphone, Lock, ChevronLeft, Info, BatteryCharging, AlarmClock,
  Eye, Bell, MessageSquare, MapPin, CreditCard, Layers, CheckCircle2, AlertTriangle,
} from 'lucide-react-native';
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
  openAccessibilitySettings,
  requestOverlayPermission,
  grantLocationSimPermissionsIfOwner,
  openOemAutostartSettings,
  openOemBackgroundPopups,
  type DeviceManagementStatus,
  type PermissionDiagnostics,
} from '../services/deviceManagement';
import { requestReminderExactAlarmPermission } from '../services/reminderService';

/**
 * Consent-first device setup (spec parts 7 & 9) — the ONE place every Android
 * permission the financed phone needs is asked for and CROSS-CHECKED live:
 *
 *   Device Administrator → Accessibility (consented, PIN-9088-protected) →
 *   Display over other apps → Notifications → Exact alarms → Battery →
 *   SMS (receive+send) → Location (incl. background) → Phone state.
 *
 * Only when every row is confirmed against the OS does the screen show
 * "Device Activated". Uninstall / factory-reset blocking additionally requires
 * Device Owner enrolment (store QR) — shown honestly, never faked.
 */
export const DeviceManagementScreen = ({ navigation }: { navigation?: { goBack: () => void } }) => {
  const { customer } = useAuth();
  const supported = isDeviceManagementSupported();
  const [status, setStatus] = useState<DeviceManagementStatus | null>(null);
  const [model, setModel] = useState<string>(customer?.model_no || '');
  const [manufacturer, setManufacturer] = useState<string>('');
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [batteryOk, setBatteryOk] = useState(false);
  const [protection, setProtection] = useState<Awaited<ReturnType<typeof getProtectionStatus>> | null>(null);
  const [a11yOk, setA11yOk] = useState(false);
  const [diag, setDiag] = useState<PermissionDiagnostics | null>(null);

  const refresh = useCallback(async () => {
    if (!supported) return;
    try {
      const [st, info] = await Promise.all([getDeviceManagementStatus(), getDeviceInfo()]);
      setStatus(st);
      isIgnoringBatteryOptimizations().then(setBatteryOk).catch(() => setBatteryOk(false));
      getProtectionStatus().then(setProtection).catch(() => {});
      isAccessibilityServiceEnabled().then(setA11yOk).catch(() => {});
      getPermissionDiagnostics().then(setDiag).catch(() => {});
      if (info.model) setModel(`${info.manufacturer} ${info.model}`.trim());
      if (info.manufacturer) setManufacturer(info.manufacturer);
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

  // Re-check the live state whenever the user returns from an OS screen
  // (Settings dialogs, permission managers) so rows flip green immediately.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => sub.remove();
  }, [refresh]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setActionKey(key);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try { await fn(); } catch { /* ignore */ }
    // Re-check the live OS state shortly after (the user may still be in a
    // dialog); AppState also re-checks on return from OS screens.
    setTimeout(() => { refresh(); setActionKey(null); }, 900);
  };

  const onConsentAndEnable = () => run('admin', async () => {
    if (!customer?.id) return;
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
  });

  const onAllowBattery = () => run('battery', () => requestIgnoreBatteryOptimizations());
  const onAllowExactAlarms = () => run('alarm', () => requestReminderExactAlarmPermission());
  const onAllowNotifications = () => run('notif', () => Notifications.requestPermissionsAsync());
  const onOpenAccessibility = () => run('a11y', () => openAccessibilitySettings());
  const onOpenOverlay = () => run('overlay', () => requestOverlayPermission());
  // SMS / location / phone: Device Owner grants silently (store-enrolled phone).
  const onGrantOwnerPerms = () => run('ownerperms', () => grantLocationSimPermissionsIfOwner());

  const mode = status?.mode ?? 'UNSUPPORTED';
  const desc = describeMode(mode);
  const isOwner = mode === 'DEVICE_OWNER';
  const statusLoaded = status !== null;
  const chineseOem = /xiaomi|redmi|poco|vivo|iqoo|oppo|realme|oneplus|huawei|honor|transsion|infinix|tecno/i.test(manufacturer);

  // ── Live cross-check: every row must be green for "Device Activated" ──────
  const checks = {
    admin: !!status?.adminActive,
    accessibility: !!diag?.accessibilityEnabled,
    overlay: !!diag?.overlayGranted,
    notifications: !!diag?.notificationsEnabled,
    exactAlarm: !!diag?.exactAlarmGranted,
    battery: batteryOk,
    // Owner-granted permissions count only on Device Owner phones — on a
    // non-DO phone they cannot be granted silently and are shown as
    // "Requires Device Owner" instead of blocking activation forever.
    sms: isOwner ? !!diag?.receiveSms && !!diag?.sendSms : true,
    location: isOwner ? !!diag?.fineLocation && !!diag?.backgroundLocation : true,
    phone: isOwner ? !!diag?.phoneState : true,
  };
  const required = Object.values(checks);
  const doneCount = required.filter(Boolean).length;
  const activated = required.every(Boolean);

  const rows: { key: string; icon: React.ReactNode; label: string; detail: string; ok: boolean; action: () => void; actionLabel: string; ownerOnly?: boolean }[] = [
    {
      key: 'admin', icon: <ShieldCheck size={18} color={Colors.textSecondary} />,
      label: 'Device Administrator', detail: 'Lock / unlock + EMI protection', ok: checks.admin,
      action: onConsentAndEnable, actionLabel: 'Enable',
    },
    {
      key: 'a11y', icon: <Eye size={18} color={Colors.textSecondary} />,
      label: 'Accessibility protection', detail: 'Stops uninstall & reset attempts (owner PIN to change later)', ok: checks.accessibility,
      action: onOpenAccessibility, actionLabel: 'Open Settings',
    },
    {
      key: 'overlay', icon: <Layers size={18} color={Colors.textSecondary} />,
      label: 'Display over other apps', detail: 'Instant lock screen', ok: checks.overlay,
      action: onOpenOverlay, actionLabel: 'Allow',
    },
    {
      key: 'notif', icon: <Bell size={18} color={Colors.textSecondary} />,
      label: 'Notifications', detail: 'EMI reminders', ok: checks.notifications,
      action: onAllowNotifications, actionLabel: 'Allow',
    },
    {
      key: 'alarm', icon: <AlarmClock size={18} color={Colors.textSecondary} />,
      label: 'Exact alarms', detail: 'Reminders at exact times', ok: checks.exactAlarm,
      action: onAllowExactAlarms, actionLabel: 'Allow',
    },
    {
      key: 'battery', icon: <BatteryCharging size={18} color={Colors.textSecondary} />,
      label: 'Battery (unrestricted)', detail: 'Background protection keeps working', ok: checks.battery,
      action: onAllowBattery, actionLabel: 'Allow',
    },
    {
      key: 'sms', icon: <MessageSquare size={18} color={Colors.textSecondary} />,
      label: 'SMS (receive + send)', detail: 'Offline LOCK / UNLOCK from the store', ok: checks.sms,
      action: onGrantOwnerPerms, actionLabel: isOwner ? 'Grant' : 'Requires Device Owner', ownerOnly: true,
    },
    {
      key: 'location', icon: <MapPin size={18} color={Colors.textSecondary} />,
      label: 'Location (incl. background)', detail: 'Find the phone when needed', ok: checks.location,
      action: onGrantOwnerPerms, actionLabel: isOwner ? 'Grant' : 'Requires Device Owner', ownerOnly: true,
    },
    {
      key: 'phone', icon: <CreditCard size={18} color={Colors.textSecondary} />,
      label: 'Phone state', detail: 'SIM info for protection', ok: checks.phone,
      action: onGrantOwnerPerms, actionLabel: isOwner ? 'Grant' : 'Requires Device Owner', ownerOnly: true,
    },
  ];

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
        {/* Activation hero — appears ONLY when every permission is confirmed. */}
        <View style={[styles.heroCard, activated ? styles.heroCardOk : styles.heroCardPending]}>
          {activated
            ? <CheckCircle2 size={40} color={Colors.success} />
            : <ShieldCheck size={40} color={Colors.primary} />}
          <Text style={styles.heroTitle}>{activated ? 'Device Activated' : 'Complete device setup'}</Text>
          <Text style={styles.heroSub}>
            {activated
              ? 'All permissions confirmed — this phone is fully protected while your EMI is active.'
              : `${doneCount} of ${required.length} permissions confirmed. Finish all steps to activate the protection.`}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.p}>
            This device is financed through an EMI agreement. Every permission
            below is needed for the EMI protection to work, and each one is
            checked against the phone's live system state — nothing is
            counted until Android confirms it.
          </Text>
        </View>

        {/* Permission checklist — tap each Grant and the row re-checks itself. */}
        <View style={styles.card}>
          <View style={styles.warnHead}>
            <ShieldCheck size={18} color={Colors.primary} />
            <Text style={[styles.warnTitle, { color: Colors.textPrimary }]}>Permissions checklist</Text>
          </View>
          {rows.map((r) => (
            <View key={r.key} style={[styles.setupRow, { borderBottomWidth: 0 }]}>
              <View style={styles.setupLeft}>
                {r.icon}
                <View style={{ flex: 1 }}>
                  <Text style={styles.setupLabel}>{r.label}</Text>
                  <Text style={styles.setupDetail}>{r.detail}</Text>
                </View>
              </View>
              {r.ok ? (
                <CheckCircle2 size={20} color={Colors.success} />
              ) : (
                <TouchableOpacity
                  style={[styles.grantBtn, r.ownerOnly && !isOwner && statusLoaded && styles.grantBtnDisabled]}
                  disabled={r.ownerOnly && !isOwner && statusLoaded || actionKey === r.key}
                  onPress={r.action}
                  activeOpacity={0.85}
                >
                  {actionKey === r.key
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.grantBtnText}>{r.actionLabel}</Text>}
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        {/* Chinese OEM (Vivo/Xiaomi/Oppo/Huawei) — the OS kills background work
            and blocks background pop-ups unless these are granted. */}
        {supported && chineseOem && (
          <View style={[styles.card, styles.warnCard]}>
            <View style={styles.warnHead}>
              <Smartphone size={18} color={Colors.warning} />
              <Text style={styles.warnTitle}>Important {manufacturer || 'device'} settings</Text>
            </View>
            <Text style={styles.warnText}>
              This phone brand aggressively stops background apps. Open BOTH
              settings and allow TelePoint — otherwise the lock screen and the
              reminders may not work while the app is closed.
            </Text>
            <TouchableOpacity style={[styles.primaryBtn, { marginTop: Spacing.sm }]} onPress={() => run('oemauto', () => openOemAutostartSettings())} activeOpacity={0.85}>
              {actionKey === 'oemauto' ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Open Autostart permission</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => run('oempop', () => openOemBackgroundPopups())} activeOpacity={0.85}>
              <Text style={styles.secondaryBtnText}>Allow background pop-ups</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Honest uninstall caveat — only Device Owner can actually block it. */}
        {supported && !isOwner && (
          <View style={[styles.card, styles.warnCard]}>
            <View style={styles.warnHead}>
              <AlertTriangle size={18} color={Colors.warning} />
              <Text style={styles.warnTitle}>Uninstall & reset not blocked yet</Text>
            </View>
            <Text style={styles.warnText}>
              This phone is in {desc.label} mode. Android only allows the
              permanent block (uninstall, factory reset, Safe Mode) when the
              phone is enrolled as a <Text style={{ fontWeight: '800' }}>Device Owner</Text> at
              the store with the setup QR. Until then the accessibility
              protection steers away from those screens, but the hard block is
              not active. Ask your store to finish Device Owner enrolment.
            </Text>
          </View>
        )}

        {/* Financing protection status — live OS readbacks (Device Owner). */}
        {supported && isOwner && (
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
              is not blocked by this app. Factory Reset Protection requires an
              authorised account during setup after a reset.
            </Text>
          </View>
        )}

        {/* Static explanation of what each permission is FOR. */}
        <View style={styles.card}>
          <View style={styles.warnHead}>
            <Info size={18} color={Colors.primary} />
            <Text style={[styles.warnTitle, { color: Colors.textPrimary }]}>What each permission does</Text>
          </View>
          <Text style={styles.modeDetail}>
            Device Administrator — lock / unlock and EMI protection. Accessibility —
            steers the phone away from uninstall, reset, force-stop and device-admin
            screens (changing it requires the store owner PIN). Display over
            other apps — shows the lock screen instantly. Notifications + exact alarms —
            EMI reminders at the right times. SMS — offline LOCK/UNLOCK commands from
            the store. Location / phone state — find the phone and read the SIM when
            the store needs it. Battery — keeps background protection alive. The camera
            lock, uninstall block, factory-reset block and Factory Reset Protection are
            Device Owner policies, not one-by-one permissions. Nothing is used for
            advertising; everything is removed once your EMI is fully paid.
          </Text>
        </View>

        {!supported && (
          <View style={[styles.card, styles.warnCard]}>
            <Text style={styles.warnText}>
              Device management is unavailable in this build. A development or EAS
              build is required — Expo Go cannot provide Android device management.
            </Text>
          </View>
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
  heroCard: { alignItems: 'center', padding: Spacing.xl, borderRadius: Radius.lg, borderWidth: 1, marginBottom: Spacing.base, gap: Spacing.sm },
  heroCardOk: { backgroundColor: Colors.successLight ?? '#ECFDF5', borderColor: Colors.success },
  heroCardPending: { backgroundColor: Colors.bgCard, borderColor: Colors.primary },
  heroTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  heroSub: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.base, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.base },
  p: { fontSize: 14, lineHeight: 21, color: Colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rowLabel: { fontSize: 14, color: Colors.textSecondary },
  rowValue: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, maxWidth: '55%', textAlign: 'right' },
  setupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm, gap: Spacing.sm },
  setupLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  setupLabel: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  setupDetail: { fontSize: 11, color: Colors.textTertiary, lineHeight: 15, marginTop: 1 },
  grantBtn: { backgroundColor: Colors.primary, borderRadius: Radius.sm, paddingVertical: 8, paddingHorizontal: Spacing.base, minWidth: 86, alignItems: 'center' },
  grantBtnDisabled: { backgroundColor: Colors.textTertiary },
  grantBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
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
