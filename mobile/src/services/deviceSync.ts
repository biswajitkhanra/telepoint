import {
  ackCommand,
  getInstallationId,
  pollCommands,
  sendHeartbeat,
  type DeviceStatusResponse,
} from './deviceApi';
import {
  applyFinancingProtection,
  executeAuthorizedLock,
  executeAuthorizedUnlock,
  getDeviceManagementStatus,
  getDevicePolicies,
  isDeviceManagementSupported,
  rebootDevice,
  setApplicationHidden,
  setDevicePolicy,
} from './deviceManagement';
import type { DevicePolicyKey } from 'expo-telepoint-device-management';
import { cacheCustomerPhoto, presentManualReminder, syncReminderConfigFromServer } from './reminderService';
import { FRP_PROTECTION_ACCOUNTS } from '../config';

/**
 * One headless pass of the device-command lifecycle, shared by the foreground
 * listener (useDeviceCommands) and the background-fetch task so an authorised
 * LOCK/UNLOCK is applied even when the customer app is not open.
 *
 * It asks the server for authorised commands addressed to THIS install,
 * validates each one locally (defence in depth), runs the native operation, and
 * reports the result back so the backend — never the button-press — owns the
 * confirmed state. Every step is best-effort and swallows its own errors so a
 * transient network/OS failure just retries on the next pass.
 */

export interface DeviceSyncResult {
  resp: DeviceStatusResponse | null;
  /** True if a LOCK was executed this pass, false if an UNLOCK, else undefined. */
  lockedChangeTo?: boolean;
}

export async function syncDeviceCommandsOnce(customerId: string): Promise<DeviceSyncResult> {
  const installationId = await getInstallationId();
  const resp = await pollCommands(customerId, installationId);

  // Cache reminder config + customer photo from the server for the OFFLINE
  // engine (re-applies the alarm plan only when the server version changed).
  try { await syncReminderConfigFromServer(resp?.reminder_settings ?? null); } catch { /* ignore */ }
  if (resp?.customer_photo_url) { try { await cacheCustomerPhoto(resp.customer_photo_url); } catch { /* ignore */ } }

  // Collateral protection while the EMI is outstanding (Device Owner only; a
  // no-op with an honest reason otherwise). Covers uninstall + factory-reset +
  // safe-boot + add-user block + Factory Reset Protection. Released once cleared.
  if (isDeviceManagementSupported()) {
    const bd = (resp?.breakdown ?? null) as Record<string, unknown> | null;
    const status = typeof bd?.customer_status === 'string' ? bd.customer_status : undefined;
    const cleared = status === 'COMPLETE' || status === 'SETTLED';
    try { await applyFinancingProtection(!cleared, FRP_PROTECTION_ACCOUNTS); } catch { /* ignore */ }
  }

  // Cheap heartbeat so the backend/admin sees whether admin permission is still
  // granted and when the device was last online.
  if (isDeviceManagementSupported()) {
    try {
      const st = await getDeviceManagementStatus();
      const policies = await getDevicePolicies().catch(() => null);
      await sendHeartbeat(customerId, installationId, {
        adminEnabled: st.adminActive,
        managementMode: st.mode,
        policies: policies ?? undefined,
      });
    } catch { /* ignore */ }
  }

  let lockedChangeTo: boolean | undefined;
  let actionExecuted = false;
  const bd = (resp?.breakdown ?? null) as Record<string, unknown> | null;
  for (const cmd of resp?.commands ?? []) {
    // Local re-validation (defence in depth): only fresh, in-flight commands.
    if (cmd.status !== 'PENDING' && cmd.status !== 'RECEIVED') continue;
    const exp = Date.parse(cmd.expires_at);
    if (!Number.isFinite(exp) || exp <= Date.now()) continue;

    if (cmd.command_type === 'DEVICE_ACTION') {
      const action = cmd.payload?.action;
      let ok = false;
      let reason: string | undefined;
      if (action === 'REBOOT') {
        const r = await rebootDevice();
        ok = r.ok; reason = r.reason;
      } else if (action === 'APP_HIDE') {
        const pkg = cmd.payload?.package;
        if (pkg) { const r = await setApplicationHidden(pkg, cmd.payload?.enabled !== false); ok = r.applied; reason = r.reason; }
        else { ok = false; reason = 'missing_package'; }
      } else if (action) {
        const r = await setDevicePolicy(action as DevicePolicyKey, cmd.payload?.enabled === true);
        ok = r.applied; reason = r.reason;
      } else {
        reason = 'missing_action';
      }
      await ackCommand(customerId, installationId, cmd.id, ok ? 'EXECUTED' : 'FAILED', ok ? undefined : reason);
      actionExecuted = true;
      continue;
    }

    if (cmd.command_type === 'EMI_REMINDER') {
      // Manual admin/retailer reminder — show it now (+ optional voice), then ack.
      const v = bd?.total_payable ?? bd?.next_emi_amount;
      const amount = typeof cmd.emi_amount === 'number' ? cmd.emi_amount : (typeof v === 'number' ? v : null);
      const dueDate = typeof bd?.next_emi_due_date === 'string' ? bd.next_emi_due_date : null;
      await presentManualReminder({
        amount,
        dueDate,
        customerName: resp?.customer_name ?? null,
        voice: cmd.voice === true,
        language: cmd.language === 'hi' ? 'hi' : 'bn',
      });
      await ackCommand(customerId, installationId, cmd.id, 'EXECUTED');
      continue;
    }

    if (cmd.command_type !== 'LOCK' && cmd.command_type !== 'UNLOCK') continue;
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
    if (result.ok) lockedChangeTo = cmd.command_type === 'LOCK';
  }

  // After applying any advanced action, report the fresh policy snapshot so the
  // admin panel reflects the real on-device state (not a guessed one).
  if (actionExecuted && isDeviceManagementSupported()) {
    try {
      const st = await getDeviceManagementStatus();
      const policies = await getDevicePolicies().catch(() => null);
      await sendHeartbeat(customerId, installationId, { adminEnabled: st.adminActive, managementMode: st.mode, policies: policies ?? undefined });
    } catch { /* ignore */ }
  }

  // NOTE: we deliberately do NOT call lockNow() on every pass while locked. The
  // customer must be able to SEE the TelePoint locked EMI screen and keep it on
  // screen — repeatedly calling lockNow() would blank the screen every poll.
  // Persistence of the locked state is handled the right way: on DEVICE_OWNER by
  // kiosk/lock-task + HOME takeover (the app stays foreground; a reboot lands on
  // it via the boot receiver), and the executeAuthorizedLock() already did the
  // one-time lockNow() when the lock was first applied.

  return { resp, lockedChangeTo };
}
