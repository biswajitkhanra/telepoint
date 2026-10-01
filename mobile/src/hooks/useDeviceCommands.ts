import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  getInstallationId,
  getSessionToken,
  registerDevice,
  type DeviceStatusResponse,
} from '../services/deviceApi';
import {
  configureCommandService,
  getDeviceInfo,
  getDeviceManagementStatus,
  isDeviceManagementSupported,
  lockNow,
  setTotpSecret,
  startCommandService,
} from '../services/deviceManagement';
import { syncDeviceCommandsOnce } from '../services/deviceSync';
import { FRP_PROTECTION_ACCOUNTS, PORTAL_BASE_URL } from '../config';

/**
 * Customer command listener. While a customer is logged in it periodically asks
 * the server for authorised LOCK/UNLOCK commands addressed to THIS install,
 * validates each one locally (defence in depth), runs the native operation, and
 * reports the result back so the backend — not the button-press — decides the
 * confirmed state. No infinite tight loop: it polls on an interval and on app
 * foreground only, matching Android background limits.
 */

const POLL_MS = 60_000;
// While locked, poll much faster so an admin UNLOCK issued online is applied
// within seconds, not up to a minute.
const POLL_MS_LOCKED = 12_000;

export interface LockedInfo {
  locked: boolean;
  emiAmount: number | null;
  retailerName: string | null;
  retailerPhone: string | null;
  customerName: string | null;
}

function readBreakdownAmount(b: Record<string, unknown> | null | undefined): number | null {
  if (!b) return null;
  const v = b.total_payable ?? b.next_emi_amount;
  return typeof v === 'number' ? v : null;
}

export function useDeviceCommands(customerId: string | null | undefined) {
  const [info, setInfo] = useState<LockedInfo>({
    locked: false, emiAmount: null, retailerName: null, retailerPhone: null, customerName: null,
  });
  const busy = useRef(false);
  const registered = useRef(false);
  const serviceStarted = useRef(false);

  // Start the NATIVE background command service so an authorised LOCK/UNLOCK
  // executes even when the app is closed (not only while this JS poll runs).
  const ensureCommandService = useCallback(async () => {
    if (!customerId || !isDeviceManagementSupported() || serviceStarted.current) return;
    try {
      const token = await getSessionToken();
      if (!token) return;
      const installationId = await getInstallationId();
      const res = await configureCommandService(
        PORTAL_BASE_URL,
        customerId,
        installationId,
        token,
        FRP_PROTECTION_ACCOUNTS.join(','),
      );
      if (res.ok) {
        await startCommandService();
        serviceStarted.current = true;
      }
    } catch { /* retry next tick */ }
  }, [customerId]);

  const applyStatus = useCallback(async (resp: DeviceStatusResponse | null, lockedChangeTo?: boolean) => {
    if (!resp) return;
    const managementStatus = resp.device?.management_status;
    // An executed LOCK/UNLOCK command wins outright. Otherwise the NATIVE
    // enforced state (persisted, survives reboot) is the truth — a stale server
    // LOCKED cannot re-lock a phone that was unlocked offline (TOTP/SMS), so
    // the unlock always sticks even when the server has not been updated.
    let nativeLocked: boolean | null = null;
    if (isDeviceManagementSupported()) {
      try { nativeLocked = (await getDeviceManagementStatus()).enforcedLocked ?? null; } catch { nativeLocked = null; }
    }
    setInfo((prev) => ({
      locked: lockedChangeTo !== undefined
        ? lockedChangeTo
        : nativeLocked != null
          ? nativeLocked
          : managementStatus === 'ACTIVE' ? false : prev.locked,
      emiAmount: readBreakdownAmount(resp.breakdown) ?? prev.emiAmount,
      retailerName: resp.retailer?.name ?? prev.retailerName,
      retailerPhone: resp.retailer?.mobile ?? prev.retailerPhone,
      customerName: resp.customer_name ?? prev.customerName,
    }));
  }, []);

  const tick = useCallback(async () => {
    if (!customerId || busy.current) return;
    busy.current = true;
    try {
      // Make sure the native background delivery service is running (idempotent).
      await ensureCommandService();

      // Consent-at-purchase: the customer agreed to EMI device management as
      // part of the financing agreement, so the device is auto-registered on
      // first run (consent recorded) — the retailer/admin can then request a
      // lock. The Android device-admin PERMISSION is still granted explicitly
      // by the customer in the OS dialog (never bypassed); until then a lock
      // command simply reports admin_inactive.
      if (!registered.current && isDeviceManagementSupported()) {
        registered.current = true;
        try {
          const installationId = await getInstallationId();
          const [info, st] = await Promise.all([getDeviceInfo(), getDeviceManagementStatus()]);
          const reg = await registerDevice({
            customerId,
            installationId,
            deviceModel: info.model,
            deviceManufacturer: info.manufacturer,
            androidVersion: info.androidVersion,
            appVersion: '1.0.0',
            consent: true,
            adminEnabled: st.adminActive,
            managementMode: st.mode,
          });
          // Store the TOTP offline-unlock secret so the device can verify unlock
          // codes with no internet.
          if (reg?.totp_secret) { try { await setTotpSecret(reg.totp_secret); } catch { /* ignore */ } }
        } catch { registered.current = false; /* retry next tick */ }
      }

      // Single source of truth for poll → execute → ack → re-assert, shared with
      // the background-fetch task so foreground and closed-app behave identically.
      const { resp, lockedChangeTo } = await syncDeviceCommandsOnce(customerId);
      await applyStatus(resp, lockedChangeTo);
    } catch { /* offline / transient — retry next tick */ } finally {
      busy.current = false;
    }
  }, [customerId, applyStatus, ensureCommandService]);

  // On launch, enforce the last server-confirmed lock immediately from the
  // persisted native flag, before the first network poll returns — so a locked
  // financed device never flashes the normal UI while offline or starting up.
  useEffect(() => {
    if (!customerId || !isDeviceManagementSupported()) return;
    let cancelled = false;
    getDeviceManagementStatus()
      .then((st) => {
        if (!cancelled && st.enforcedLocked) {
          setInfo((prev) => ({ ...prev, locked: true }));
          // Enter the kiosk / secure the screen once on launch, so a lock applied
          // while the app was closed (by the native service) is enforced on screen.
          lockNow().catch(() => {});
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [customerId]);

  useEffect(() => {
    if (!customerId) return;
    tick();
    // Poll faster while locked so a web/admin UNLOCK reaches the phone quickly.
    const interval = setInterval(tick, info.locked ? POLL_MS_LOCKED : POLL_MS);
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') tick();
    });
    // A device-command push wakes the app to sync immediately, so a lock/unlock
    // applies within moments instead of waiting for the next poll.
    const notifSub = Notifications.addNotificationReceivedListener((n) => {
      const type = (n.request?.content?.data as { type?: string } | undefined)?.type;
      if (type === 'device_command') tick();
    });
    return () => { clearInterval(interval); sub.remove(); notifSub.remove(); };
  }, [customerId, tick, info.locked]);

  const forceUnlock = useCallback(() => {
    setInfo((prev) => ({ ...prev, locked: false }));
  }, []);

  return { ...info, refresh: tick, forceUnlock };
}
