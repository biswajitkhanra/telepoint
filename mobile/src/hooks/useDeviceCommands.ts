import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  getInstallationId,
  registerDevice,
  type DeviceStatusResponse,
} from '../services/deviceApi';
import {
  getDeviceInfo,
  getDeviceManagementStatus,
  isDeviceManagementSupported,
} from '../services/deviceManagement';
import { syncDeviceCommandsOnce } from '../services/deviceSync';

/**
 * Customer command listener. While a customer is logged in it periodically asks
 * the server for authorised LOCK/UNLOCK commands addressed to THIS install,
 * validates each one locally (defence in depth), runs the native operation, and
 * reports the result back so the backend — not the button-press — decides the
 * confirmed state. No infinite tight loop: it polls on an interval and on app
 * foreground only, matching Android background limits.
 */

const POLL_MS = 60_000;

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

  const applyStatus = useCallback((resp: DeviceStatusResponse | null) => {
    if (!resp) return;
    const managementStatus = resp.device?.management_status;
    setInfo((prev) => ({
      locked: managementStatus === 'LOCKED' ? true : managementStatus === 'ACTIVE' ? false : prev.locked,
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
          await registerDevice({
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
        } catch { registered.current = false; /* retry next tick */ }
      }

      // Single source of truth for poll → execute → ack → re-assert, shared with
      // the background-fetch task so foreground and closed-app behave identically.
      const { resp, lockedChangeTo } = await syncDeviceCommandsOnce(customerId);
      applyStatus(resp);
      if (lockedChangeTo !== undefined) {
        setInfo((prev) => ({ ...prev, locked: lockedChangeTo }));
      }
    } catch { /* offline / transient — retry next tick */ } finally {
      busy.current = false;
    }
  }, [customerId, applyStatus]);

  // On launch, enforce the last server-confirmed lock immediately from the
  // persisted native flag, before the first network poll returns — so a locked
  // financed device never flashes the normal UI while offline or starting up.
  useEffect(() => {
    if (!customerId || !isDeviceManagementSupported()) return;
    let cancelled = false;
    getDeviceManagementStatus()
      .then((st) => { if (!cancelled && st.enforcedLocked) setInfo((prev) => ({ ...prev, locked: true })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [customerId]);

  useEffect(() => {
    if (!customerId) return;
    tick();
    const interval = setInterval(tick, POLL_MS);
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') tick();
    });
    return () => { clearInterval(interval); sub.remove(); };
  }, [customerId, tick]);

  return { ...info, refresh: tick };
}
