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
  isLockCommandStale,
  getLocation,
  getSimInfo,
  grantLocationSimPermissionsIfOwner,
  hideAllUserApps,
  isDeviceManagementSupported,
  isTrackingEnabled,
  openOemAutostartSettings,
  rebootDevice,
  releaseManagedRestrictions,
  setAirplaneMode,
  stopCommandService,
  setApplicationHidden,
  setAppsSuspended,
  configureAppLock,
  setAppLockEnabled,
  showLockOverlay,
  setDevicePolicy,
  setTrackingEnabled,
  setWifiEnabled,
} from './deviceManagement';
import type { DevicePolicyKey } from 'expo-telepoint-device-management';
import { cacheCustomerPhoto, cancelAllReminders, presentManualReminder, syncReminderConfigFromServer } from './reminderService';
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
  // A missing/failed response is not evidence of an outstanding loan. Preserve
  // the last OS policy until the authenticated server can confirm a state.
  if (!resp?.device) return { resp };
  const loanStatus = resp.loan_status ?? resp.breakdown?.customer_status;
  const cleared = loanStatus === 'COMPLETE' || loanStatus === 'SETTLED';
  if (cleared) {
    let released = false;
    try { await cancelAllReminders(); } catch { /* retry next sync */ }
    // Stop native command delivery too — the loan is closed, no more control.
    try { await stopCommandService(); } catch { /* ignore */ }
    try { released = (await releaseManagedRestrictions()).ok; } catch { /* retry next sync */ }
    // Do not replay commands created before repayment, even if still pending.
    return { resp, lockedChangeTo: released ? false : undefined };
  }

  // Cache reminder config + customer photo from the server for the OFFLINE
  // engine (re-applies the alarm plan only when the server version changed).
  try { await syncReminderConfigFromServer(resp?.reminder_settings ?? null); } catch { /* ignore */ }
  if (resp?.customer_photo_url) { try { await cacheCustomerPhoto(resp.customer_photo_url); } catch { /* ignore */ } }

  // Collateral protection while the EMI is outstanding (Device Owner only; a
  // no-op with an honest reason otherwise). Covers uninstall + factory-reset +
  // safe-boot + add-user block + Factory Reset Protection. Once the loan is
  // CLOSED, EVERYTHING is released — the legal end of financer control.
  if (isDeviceManagementSupported()) {
    try {
      if (loanStatus === 'RUNNING' || loanStatus === 'NPA') {
        await applyFinancingProtection(true, FRP_PROTECTION_ACCOUNTS);
      }
    } catch { /* ignore */ }
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

  // Location + SIM tracking: when enabled, report location + SIM each pass. The
  // cadence is the app's poll / background-fetch cadence (a battery-friendly
  // interval), not a high-frequency GPS stream.
  if (isDeviceManagementSupported()) {
    try {
      if (await isTrackingEnabled()) {
        await grantLocationSimPermissionsIfOwner().catch(() => {});
        const loc = await getLocation();
        const sim = await getSimInfo();
        if (loc.ok || sim.ok) {
          await sendHeartbeat(customerId, installationId, {
            location: loc.ok ? { lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy, provider: loc.provider } : undefined,
            simInfo: sim.ok ? { count: sim.count, sims: sim.sims } : undefined,
          });
        }
      }
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
        else { const r = await hideAllUserApps(cmd.payload?.enabled !== false); ok = r.applied; reason = r.reason; } // no package → hide ALL other apps
      } else if (action === 'TRACKING') {
        const r = await setTrackingEnabled(cmd.payload?.enabled === true);
        ok = r.ok;
      } else if (action === 'RELEASE') {
        const r = await releaseManagedRestrictions();
        ok = r.ok;
      } else if (action === 'OEM_AUTOSTART') {
        const r = await openOemAutostartSettings();
        ok = r.opened;
      } else if (action === 'APP_LOCK') {
        const pkgs = cmd.payload?.packages ?? [];
        const r = await setAppsSuspended(pkgs, cmd.payload?.enabled !== false);
        ok = r.applied; reason = r.reason;
      } else if (action === 'APP_PIN_LOCK') {
        const pkgs = cmd.payload?.packages ?? [];
        const pin = cmd.payload?.pin;
        if (cmd.payload?.enabled === false) {
          const r = await setAppLockEnabled(false); ok = r.ok;
        } else if (pin && pkgs.length > 0) {
          const r = await configureAppLock(pkgs, pin); ok = r.ok; reason = r.reason;
        } else { reason = 'missing_pin_or_packages'; }
      } else if (action === 'WIFI_POWER') {
        const r = await setWifiEnabled(cmd.payload?.enabled === true);
        ok = r.ok; reason = r.reason;
      } else if (action === 'AIRPLANE_POWER') {
        const r = await setAirplaneMode(cmd.payload?.enabled === true);
        ok = r.ok; reason = r.reason;
      } else if (action === 'LOCATION') {
        await grantLocationSimPermissionsIfOwner().catch(() => {});
        const loc = await getLocation();
        if (loc.ok) {
          await sendHeartbeat(customerId, installationId, {
            location: { lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy, provider: loc.provider },
          });
          ok = true;
        } else { ok = false; reason = loc.reason; }
      } else if (action === 'SIM_INFO') {
        await grantLocationSimPermissionsIfOwner().catch(() => {});
        const sim = await getSimInfo();
        if (sim.ok) {
          await sendHeartbeat(customerId, installationId, { simInfo: { count: sim.count, sims: sim.sims } });
          ok = true;
        } else { ok = false; reason = sim.reason; }
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
    // Unlock-wins guard (clock-skew safe): a LOCK issued BEFORE the last local
    // unlock (backend UNLOCK, offline TOTP, offline SMS UNLOCK) is stale — ack
    // SUPERSEDED so it can never re-lock, even when the server is not updated.
    // The native check converts the monotonic watermark to SERVER time via the
    // poll response's server_now; unverifiable dates fail toward NOT re-locking.
    if (cmd.command_type === 'LOCK' && typeof cmd.created_at === 'string') {
      const stale = await isLockCommandStale(cmd.created_at, resp?.server_now ?? '').catch(() => true);
      if (stale) {
        await ackCommand(customerId, installationId, cmd.id, 'SUPERSEDED');
        continue;
      }
    }
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
    if (result.ok && cmd.command_type === 'LOCK') {
      // Enrich the full-screen overlay with the real amount + retailer.
      try {
        const amt = typeof cmd.emi_amount === 'number' ? cmd.emi_amount
          : (typeof bd?.total_payable === 'number' ? bd.total_payable
            : (typeof bd?.next_emi_amount === 'number' ? bd.next_emi_amount : null));
        const retailer = resp?.retailer?.name ?? null;
        const phone = resp?.retailer?.mobile ?? null;
        const parts = [`EMI due${amt != null ? ` ₹${Math.round(amt).toLocaleString('en-IN')}` : ''}`];
        if (retailer) parts.push(`Contact ${retailer}`);
        if (phone) parts.push(phone);
        await showLockOverlay('Device Locked', parts.join('. '));
      } catch { /* overlay optional */ }
    }
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
