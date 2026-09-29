import {
  ackCommand,
  getInstallationId,
  pollCommands,
  sendHeartbeat,
  type DeviceStatusResponse,
} from './deviceApi';
import {
  executeAuthorizedLock,
  executeAuthorizedUnlock,
  getDeviceManagementStatus,
  isDeviceManagementSupported,
  lockNow,
  setUninstallProtection,
  setUninstallProtected,
} from './deviceManagement';
import { cacheCustomerPhoto, presentManualReminder, syncReminderConfigFromServer } from './reminderService';

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

  // Keep the app un-removable while the EMI is outstanding (only effective as
  // Device Owner; a no-op otherwise). Released once the loan is cleared.
  if (isDeviceManagementSupported()) {
    const bd = (resp?.breakdown ?? null) as Record<string, unknown> | null;
    const status = typeof bd?.customer_status === 'string' ? bd.customer_status : undefined;
    const cleared = status === 'COMPLETE' || status === 'SETTLED';
    // Device-Owner block (strong) + accessibility-based block (no-ADB path).
    try { await setUninstallProtection(!cleared); } catch { /* ignore */ }
    try { await setUninstallProtected(!cleared); } catch { /* ignore */ }
  }

  // Cheap heartbeat so the backend/admin sees whether admin permission is still
  // granted and when the device was last online.
  if (isDeviceManagementSupported()) {
    try {
      const st = await getDeviceManagementStatus();
      await sendHeartbeat(customerId, installationId, { adminEnabled: st.adminActive, managementMode: st.mode });
    } catch { /* ignore */ }
  }

  let lockedChangeTo: boolean | undefined;
  const bd = (resp?.breakdown ?? null) as Record<string, unknown> | null;
  for (const cmd of resp?.commands ?? []) {
    // Local re-validation (defence in depth): only fresh, in-flight commands.
    if (cmd.status !== 'PENDING' && cmd.status !== 'RECEIVED') continue;
    const exp = Date.parse(cmd.expires_at);
    if (!Number.isFinite(exp) || exp <= Date.now()) continue;

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

  // Anti-bypass re-assert: while still locked, re-apply the screen lock so a
  // single user unlock does not defeat the EMI lock. Use the EFFECTIVE state
  // after this pass — if we just executed an UNLOCK, `resp` still says LOCKED
  // (it was captured before the command ran), so re-asserting off `resp` would
  // instantly re-lock a phone the admin just unlocked. `lockedChangeTo` wins.
  const stillLocked = lockedChangeTo !== undefined
    ? lockedChangeTo
    : resp?.device?.management_status === 'LOCKED';
  if (stillLocked && isDeviceManagementSupported()) {
    try { await lockNow(); } catch { /* ignore */ }
  }

  return { resp, lockedChangeTo };
}
