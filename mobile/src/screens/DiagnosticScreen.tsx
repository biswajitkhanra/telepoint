// screens/DiagnosticScreen.tsx
// Hidden, owner-only on-device diagnostic panel.
//
// Reachable only through a hidden trigger in the Profile screen and gated by the
// private PIN 9088. It reports the LIVE OS state of every permission/policy the
// financing controls depend on, so the owner can see exactly what is granted vs
// missing on this exact phone. The PIN is a UI gate ONLY: it never authorises a
// device command and never discloses tokens or customer data.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Check,
  X,
  Lock,
  Settings,
  MapPin,
  MessageSquare,
  Rocket,
} from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { Spacing, Radius } from '../constants/design';
import { PressableScale } from '../components/PressableScale';
import {
  getPermissionDiagnostics,
  getDeviceInfo,
  requestDeviceAdmin,
  requestOverlayPermission,
  requestIgnoreBatteryOptimizations,
  openOemAutostartSettings,
  openAppSettings,
  openAccessibilitySettings,
  getSmsControlStatus,
  isDeviceManagementSupported,
  describeMode,
  type PermissionDiagnostics,
  type DeviceInfo,
  type ManagementMode,
} from '../services/deviceManagement';

/** Owner gate for the hidden diagnostic panel. Not a device-command secret. */
const DIAGNOSTIC_PIN = '9088';

interface Row {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
  action?: { label: string; run: () => void };
}

/** Format the non-PII "timestamp|kind|detail" SMS event for display. */
function formatSmsEvent(raw: string | null | undefined): string {
  if (!raw) return '';
  const parts = raw.split('|');
  const kind = parts[1] ?? raw;
  const detail = parts[2] ?? '';
  const when = parts[0] ? new Date(Number(parts[0])).toLocaleString('en-IN') : '';
  return `${kind}${detail ? ` (${detail})` : ''}${when ? ` · ${when}` : ''}`;
}

export const DiagnosticScreen = ({ navigation }: { navigation?: { goBack: () => void } }) => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, StatusBar.currentHeight || 28);

  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [diag, setDiag] = useState<PermissionDiagnostics | null>(null);
  const [info, setInfo] = useState<DeviceInfo | null>(null);
  const [sms, setSms] = useState<{ configured: boolean; permissionGranted: boolean; allowedSenderCount?: number; lastEvent?: string | null } | null>(null);
  const supported = isDeviceManagementSupported();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, i, s] = await Promise.all([getPermissionDiagnostics(), getDeviceInfo(), getSmsControlStatus()]);
      setDiag(d);
      setInfo(i);
      setSms(s as typeof sms);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (unlocked) load();
  }, [unlocked, load]);

  const tryUnlock = () => {
    if (pin === DIAGNOSTIC_PIN) {
      setPinError(false);
      setUnlocked(true);
    } else {
      setPinError(true);
      setPin('');
    }
  };

  // Accessibility is consent-based and on-device only: open the real system
  // toggle for the owner to enable, then CONFIRM the live state on return.
  const handleAccessibility = useCallback(async () => {
    try { await openAccessibilitySettings(); } catch { /* ignore */ }
    setTimeout(() => { load(); }, 900);
  }, [load]);

  if (!unlocked) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <View style={[styles.header, { paddingTop: topInset + 12 }]}>
          <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn}>
            <ArrowLeft size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Restricted</Text>
        </View>
        <View style={styles.pinWrap}>
          <View style={styles.pinIcon}>
            <Lock size={26} color={Colors.primary} />
          </View>
          <Text style={styles.pinTitle}>Enter owner PIN</Text>
          <Text style={styles.pinSub}>This diagnostic view is restricted to the device owner.</Text>
          <TextInput
            style={[styles.pinInput, pinError && styles.pinInputError]}
            value={pin}
            onChangeText={(t) => { setPin(t.replace(/[^0-9]/g, '')); setPinError(false); }}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
            placeholder="••••"
            placeholderTextColor="#94A3B8"
            onSubmitEditing={tryUnlock}
            autoFocus
          />
          {pinError ? <Text style={styles.pinError}>Incorrect PIN</Text> : null}
          <PressableScale style={styles.pinBtn} onPress={tryUnlock} scaleTo={0.96}>
            <Text style={styles.pinBtnText}>Unlock</Text>
          </PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  const modeInfo = describeMode((diag?.mode ?? 'UNSUPPORTED') as ManagementMode);
  const rows: Row[] = diag
    ? [
        { key: 'admin', label: 'Device Admin active', ok: diag.deviceAdmin, action: !diag.deviceAdmin ? { label: 'Grant', run: () => requestDeviceAdmin() } : undefined },
        { key: 'owner', label: 'Device Owner (full financing lock)', ok: diag.deviceOwner, detail: diag.deviceOwner ? undefined : 'Enroll at the store via the setup QR' },
        {
          key: 'a11y',
          label: 'Accessibility protection (customer-consented)',
          ok: diag.accessibilityEnabled,
          detail: diag.accessibilityEnabled ? 'Confirmed on' : 'Not enabled — turn on in Settings → Accessibility (consented at the store)',
          action: !diag.accessibilityEnabled ? { label: 'Open settings', run: () => handleAccessibility() } : undefined,
        },
        { key: 'uninstall', label: 'Uninstall blocked', ok: diag.uninstallBlocked },
        { key: 'reset', label: 'Factory reset blocked (Settings)', ok: diag.factoryResetBlocked },
        { key: 'safeboot', label: 'Safe Mode blocked', ok: diag.safeBootBlocked },
        { key: 'adduser', label: 'Add user blocked', ok: diag.addUserBlocked },
        { key: 'debug', label: 'USB debugging blocked', ok: !!diag.debuggingBlocked },
        { key: 'userctl', label: 'Force-stop / clear-data blocked', ok: !!diag.userControlDisabled },
        { key: 'smscfg', label: 'Offline SMS control configured', ok: !!sms?.configured, detail: sms?.configured ? `${sms?.allowedSenderCount ?? 0} authorised sender(s)` : 'Not configured yet' },
        { key: 'smslast', label: 'Last SMS result', ok: !!sms?.lastEvent, detail: sms?.lastEvent ? formatSmsEvent(sms.lastEvent) : 'No SMS received yet' },
        { key: 'frp', label: 'Factory Reset Protection', ok: diag.frpEnabled, detail: diag.frpEnabled ? 'Enabled (financer account attached)' : diag.frpSupported ? 'Supported but not enabled' : 'Needs Device Owner + Android 11+' },
        { key: 'overlay', label: 'Display over other apps', ok: diag.overlayGranted, action: !diag.overlayGranted ? { label: 'Open', run: () => requestOverlayPermission() } : undefined },
        { key: 'notif', label: 'Notifications enabled', ok: diag.notificationsEnabled, action: !diag.notificationsEnabled ? { label: 'Open', run: () => openAppSettings() } : undefined },
        { key: 'exact', label: 'Exact alarms allowed', ok: diag.exactAlarmGranted, action: !diag.exactAlarmGranted ? { label: 'Open', run: () => openAppSettings() } : undefined },
        { key: 'battery', label: 'Battery unrestricted', ok: diag.batteryUnrestricted, action: !diag.batteryUnrestricted ? { label: 'Allow', run: () => requestIgnoreBatteryOptimizations() } : undefined },
        { key: 'sms', label: 'SMS control (RECEIVE_SMS)', ok: diag.receiveSms, action: !diag.receiveSms ? { label: 'Open', run: () => openAppSettings() } : undefined },
        { key: 'phone', label: 'Read phone state (SIM)', ok: diag.phoneState, action: !diag.phoneState ? { label: 'Open', run: () => openAppSettings() } : undefined },
        { key: 'loc', label: 'Location (fine)', ok: diag.fineLocation, action: !diag.fineLocation ? { label: 'Open', run: () => openAppSettings() } : undefined },
        { key: 'bg', label: 'Background location', ok: diag.backgroundLocation, action: !diag.backgroundLocation ? { label: 'Open', run: () => openAppSettings() } : undefined },
      ]
    : [];

  const oemAction: Row = {
    key: 'oem',
    label: 'OEM autostart (MIUI/Vivo/Oppo)',
    ok: true,
    detail: 'Opens the vendor background-start settings',
    action: { label: 'Open', run: () => openOemAutostartSettings() },
  };
  rows.push(oemAction);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn}>
          <ArrowLeft size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Permission Diagnostics</Text>
          <Text style={styles.headerSub}>
            {info ? `${info.manufacturer} ${info.model} • Android ${info.androidVersion}` : 'Loading device info…'}
          </Text>
        </View>
        <TouchableOpacity onPress={load} style={styles.backBtn}>
          {loading ? <ActivityIndicator size="small" color={Colors.primary} /> : <RefreshCw size={18} color={Colors.textPrimary} />}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!supported ? (
          <View style={styles.notice}>
            <ShieldAlert size={18} color="#B45309" />
            <Text style={styles.noticeText}>
              Device management is unavailable in this build (Expo Go is not sufficient).
              Use an EAS/dev build on Android.
            </Text>
          </View>
        ) : null}

        <View style={styles.modeCard}>
          <ShieldCheck size={18} color={Colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.modeLabel}>{modeInfo.label}</Text>
            <Text style={styles.modeDetail}>{modeInfo.detail}</Text>
          </View>
        </View>

        <Text style={styles.sectionHeading}>PERMISSIONS & POLICIES (LIVE FROM OS)</Text>
        <View style={styles.listCard}>
          {rows.map((row, idx) => (
            <View key={row.key} style={[styles.row, idx < rows.length - 1 && styles.rowBorder]}>
              <View style={[styles.statusDot, { backgroundColor: row.ok ? '#ECFDF5' : '#FEF2F2' }]}>
                {row.ok ? <Check size={13} color="#059669" /> : <X size={13} color="#EF4444" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                {row.detail ? <Text style={styles.rowDetail}>{row.detail}</Text> : null}
              </View>
              {row.action ? (
                <TouchableOpacity style={styles.rowAction} onPress={row.action.run}>
                  {row.key === 'oem' ? <Rocket size={12} color={Colors.primary} /> : row.key === 'loc' || row.key === 'bg' ? <MapPin size={12} color={Colors.primary} /> : row.key === 'sms' ? <MessageSquare size={12} color={Colors.primary} /> : <Settings size={12} color={Colors.primary} />}
                  <Text style={styles.rowActionText}>{row.action.label}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>

        <Text style={styles.footnote}>
          Status is read directly from Android on each refresh. “Device Owner” is the only mode
          that can block uninstall and factory reset; on other modes those rows stay red and the
          app reports the limitation honestly rather than faking it.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  headerSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  content: { padding: Spacing.xl, paddingBottom: 40 },
  pinWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  pinIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  pinTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  pinSub: { fontSize: 12, color: '#64748B', marginTop: 4, textAlign: 'center' },
  pinInput: {
    width: 180,
    marginTop: Spacing.lg,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: Radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 22,
    letterSpacing: 8,
    textAlign: 'center',
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  pinInputError: { borderColor: '#EF4444' },
  pinError: { color: '#EF4444', fontSize: 12, marginTop: 8, fontWeight: '700' },
  pinBtn: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.primary,
    paddingHorizontal: 40,
    paddingVertical: 13,
    borderRadius: Radius.lg,
  },
  pinBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  notice: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: Radius.lg,
    padding: 12,
    marginBottom: Spacing.lg,
  },
  noticeText: { flex: 1, fontSize: 11, color: '#B45309', lineHeight: 16 },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.xl,
    padding: 14,
    marginBottom: Spacing.lg,
  },
  modeLabel: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  modeDetail: { fontSize: 11, color: '#64748B', marginTop: 2 },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  statusDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontSize: 12.5, fontWeight: '700', color: '#0F172A' },
  rowDetail: { fontSize: 10.5, color: '#94A3B8', marginTop: 1 },
  rowAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
  },
  rowActionText: { fontSize: 11, fontWeight: '800', color: Colors.primary },
  footnote: { fontSize: 10.5, color: '#94A3B8', lineHeight: 15, marginTop: Spacing.lg },
});
