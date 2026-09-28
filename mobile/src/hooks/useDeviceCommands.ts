import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  ackCommand,
  getInstallationId,
  pollCommands,
  registerDevice,
  sendHeartbeat,
  type DeviceStatusResponse,
  type PollCommand,
} from '../services/deviceApi';
import {
  executeAuthorizedLock,
  executeAuthorizedUnlock,
  getDeviceInfo,
  getDeviceManagementStatus,
  isDeviceManagementSupported,
  lockNow,
  setUninstallProtection,
} from '../services/deviceManagement';

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

function clientValid(cmd: PollCommand): boolean {
  if (cmd.status !== 'PENDING' && cmd.status !== 'RECEIVED') return false;
  const exp = Date.parse(cmd.expires_at);
  if (!Number.isFinite(exp) || exp <= Date.now()) return false;
  return cmd.command_type === 'LOCK' || cmd.command_type === 'UNLOCK';
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
      const installationId = await getInstallationId();

      // Consent-at-purchase: the customer agreed to EMI device management as
      // part of the financing agreement, so the device is auto-registered on
      // first run (consent recorded) — the retailer/admin can then request a
      // lock. The Android device-admin PERMISSION is still granted explicitly
      // by the customer in the OS dialog (never bypassed); until then a lock
      // command simply reports admin_inactive.
      if (!registered.current && isDeviceManagementSupported()) {
        registered.current = true;
        try {
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
          });
        } catch { registered.current = false; /* retry next tick */ }
      }

      const resp = await pollCommands(customerId, installationId);
      applyStatus(resp);

      // Keep the app un-removable while the EMI is still outstanding (only
      // effective when the device is enrolled as Device Owner). Released
      // automatically once the loan is cleared. No data is collected.
      if (isDeviceManagementSupported()) {
        const bd = (resp?.breakdown ?? null) as Record<string, unknown> | null;
        const status = typeof bd?.customer_status === 'string' ? bd.customer_status : undefined;
        const cleared = status === 'COMPLETE' || status === 'SETTLED';
        try { await setUninstallProtection(!cleared); } catch { /* ignore */ }
      }

      // Heartbeat (admin status) — cheap, keeps last_seen fresh.
      if (isDeviceManagementSupported()) {
        try {
          const st = await getDeviceManagementStatus();
          await sendHeartbeat(customerId, installationId, { adminEnabled: st.adminActive });
        } catch { /* ignore */ }
      }

      const commands = (resp?.commands ?? []).filter(clientValid);
      for (const cmd of commands) {
        const result = cmd.command_type === 'LOCK'
          ? await executeAuthorizedLock(cmd.id)
          : await executeAuthorizedUnlock(cmd.id);
        await ackCommand(
          customerId,
          installationId,
          cmd.id,
          result.ok ? 'EXECUTED' : 'FAILED',
          result.ok ? undefined : result.reason,
        );
        if (result.ok) {
          setInfo((prev) => ({ ...prev, locked: cmd.command_type === 'LOCK' }));
        }
      }

      // Anti-bypass re-assert: while the backend still says LOCKED, re-apply the
      // screen lock each cycle so a single unlock does not defeat the EMI lock.
      // Uses the documented lockNow() and requires active device admin; it does
      // NOT prevent a user from revoking admin on a non-device-owner phone
      // (an Android guarantee), which the backend then sees via the heartbeat.
      if (resp?.device?.management_status === 'LOCKED' && isDeviceManagementSupported()) {
        try { await lockNow(); } catch { /* ignore */ }
      }
    } catch { /* offline / transient — retry next tick */ } finally {
      busy.current = false;
    }
  }, [customerId, applyStatus]);

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
