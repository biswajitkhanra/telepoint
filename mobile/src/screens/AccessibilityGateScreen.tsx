import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, AppState, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ShieldAlert, Settings, Phone, RefreshCw } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { Spacing, Radius } from '../constants/design';
import {
  isDeviceManagementSupported,
  isAccessibilityServiceEnabled,
  openAccessibilitySettings,
  getPermissionDiagnostics,
} from '../services/deviceManagement';

/**
 * Onboarding gate for the customer-consented accessibility deterrent
 * (AGENTS.md rule 4 / master checklist §4.5-A): while the loan is outstanding,
 * a financed Device-Owner phone must have the TelePoint accessibility
 * protection ON (it was enabled by the store with the real system toggle, in
 * front of the customer, at provisioning).
 *
 * This screen BLOCKS the customer app until the live OS state confirms it is
 * on. It never enables it silently — the "Open Accessibility Settings" button
 * opens the real Android Accessibility screen; the app only CONFIRMS the state
 * (re-checked on app resume + every few seconds). Emergency calling and the
 * retailer contact stay reachable from the gate, per the release/safety rules.
 *
 * The gate releases itself immediately when: the phone is not a Device Owner,
 * the module is unavailable (Expo Go / non-Android), or the service is enabled.
 */
export const AccessibilityGateScreen = ({
  retailerName,
  retailerPhone,
  onDone,
}: {
  retailerName: string | null;
  retailerPhone: string | null;
  onDone: () => void;
}) => {
  const [checking, setChecking] = useState(true);
  const [needEnable, setNeedEnable] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      if (!isDeviceManagementSupported()) {
        onDone();
        return;
      }
      const diag = await getPermissionDiagnostics();
      // Not a financed Device-Owner phone (or module missing) → never gate.
      if (!diag || !diag.deviceOwner) {
        onDone();
        return;
      }
      const enabled = await isAccessibilityServiceEnabled();
      if (enabled) {
        onDone();
        return;
      }
      setNeedEnable(true);
    } catch {
      // Unreadable state must not trap the customer — let them through and
      // surface the honest state on the PIN-9088 panel instead.
      onDone();
    } finally {
      setChecking(false);
    }
  }, [onDone]);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  // While the gate is showing, re-confirm the live OS state every few seconds
  // so the screen clears by itself the moment the store toggles it on.
  useEffect(() => {
    if (needEnable) {
      intervalRef.current = setInterval(check, 4000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [needEnable, check]);

  const openSettings = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    openAccessibilitySettings().catch(() => {});
  };

  const callNumber = (num: string | null) => {
    if (!num) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const clean = num.replace(/[^\d+]/g, '');
    Linking.openURL(`tel:${clean}`).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <View style={styles.badge}>
          <ShieldAlert size={44} color="#fff" />
        </View>
        <Text style={styles.title}>Accessibility Protection Required</Text>
        <Text style={styles.subtitle}>Financed phone — store setup step</Text>

        <View style={styles.card}>
          <Text style={styles.cardText}>
            This phone is on EMI. The TelePoint accessibility protection — which you
            consented to at the store — must stay ON while your EMI is active. It helps
            stop the app from being uninstalled or the phone being reset before your
            EMI is complete.
          </Text>
          <Text style={styles.cardText}>
            {checking
              ? 'Checking the live system state…'
              : 'It is currently OFF. Tap the button below, switch on “TelePoint protection” in the Accessibility list, then come back — this screen will clear by itself.'}
          </Text>
          {checking ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.sm }} />
          ) : (
            <Text style={styles.statusOff}>Protection status: OFF</Text>
          )}
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={openSettings} activeOpacity={0.85}>
          <Settings size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>Open Accessibility Settings</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={check} activeOpacity={0.85} disabled={checking}>
          <RefreshCw size={16} color={Colors.textSecondary} />
          <Text style={styles.secondaryBtnText}>Check again</Text>
        </TouchableOpacity>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.callBtn, !retailerPhone && styles.callBtnDisabled]}
            onPress={() => callNumber(retailerPhone)}
            disabled={!retailerPhone}
            activeOpacity={0.85}
          >
            <Phone size={16} color="#fff" />
            <Text style={styles.callBtnText}>{retailerName ? `Call ${retailerName}` : 'Call Retailer'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.emergencyBtn} onPress={() => callNumber('112')} activeOpacity={0.85}>
            <Phone size={16} color="#fff" />
            <Text style={styles.callBtnText}>Emergency (112)</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.note}>
          If you have already paid your EMI and still see this screen, contact your store —
          the protection is removed automatically once your loan is marked complete.
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgBase },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg, gap: Spacing.base },
  badge: { width: 92, height: 92, borderRadius: 46, backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  subtitle: { fontSize: 14, fontWeight: '600', color: Colors.danger, marginTop: -Spacing.sm, textAlign: 'center' },
  card: { width: '100%', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: Spacing.sm },
  cardText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  statusOff: { fontSize: 13, fontWeight: '800', color: Colors.danger },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.primary, paddingVertical: 14, paddingHorizontal: Spacing.xl, borderRadius: Radius.md, alignSelf: 'stretch', justifyContent: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm },
  secondaryBtnText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.base, flexWrap: 'wrap' },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.success, paddingVertical: 12, paddingHorizontal: Spacing.lg, borderRadius: Radius.md },
  callBtnDisabled: { backgroundColor: Colors.textTertiary },
  emergencyBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.danger, paddingVertical: 12, paddingHorizontal: Spacing.lg, borderRadius: Radius.md },
  callBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  note: { fontSize: 12, color: Colors.textTertiary, textAlign: 'center', lineHeight: 17, paddingHorizontal: Spacing.sm },
});
