import { Platform } from 'react-native';
import type {
  DeviceInfo,
  DeviceManagementStatus,
  LockResult,
  ManagementMode,
} from './src/ExpoTelepointDeviceManagement.types';

export * from './src/ExpoTelepointDeviceManagement.types';

/**
 * TelePoint device-management bridge.
 *
 * This is the ONLY place JavaScript can reach Android's DevicePolicyManager.
 * Everything here uses documented, supported Android APIs. It NEVER:
 *   • bypasses the system permission dialog (requestDeviceAdmin opens it)
 *   • silently enables device admin
 *   • uses root, accessibility as a workaround, or hidden APIs
 *   • hides the app or impersonates Android system UI
 *
 * On non-Android platforms and in Expo Go (where the native module is absent),
 * every method degrades safely to an "unsupported" result instead of throwing,
 * so the JS app can render an "unavailable" state.
 */

// Loaded lazily so Expo Go / web (no native module) degrade instead of crash.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let native: any = null;
try {
  if (Platform.OS === 'android') {
    // requireNativeModule throws if the dev/EAS build did not include the module.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeModule } = require('expo-modules-core');
    native = requireNativeModule('ExpoTelepointDeviceManagement');
  }
} catch {
  native = null;
}

export function isSupported(): boolean {
  return Platform.OS === 'android' && native != null;
}

export async function isDeviceAdminEnabled(): Promise<boolean> {
  if (!isSupported()) return false;
  try { return await native.isDeviceAdminEnabled(); } catch { return false; }
}

/**
 * True when this app is the Device Owner — the only mode in which the true
 * financing lock (kiosk, can't be exited or uninstalled by the customer) is
 * possible. Set once at the store on a fresh/reset device (see README).
 */
export async function isDeviceOwner(): Promise<boolean> {
  if (!isSupported()) return false;
  try { return await native.isDeviceOwner(); } catch { return false; }
}

/** True when the app is already exempt from battery optimization (Doze). */
export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  if (!isSupported()) return true;
  try { return await native.isIgnoringBatteryOptimizations(); } catch { return true; }
}

/** Open the connectivity panel so the customer can turn on Wi-Fi / mobile data. */
export async function openInternetPanel(): Promise<{ opened: boolean }> {
  if (!isSupported()) return { opened: false };
  try { return await native.openInternetPanel(); } catch { return { opened: false }; }
}

/**
 * Open the OS dialog asking the user to allow unrestricted battery for this app,
 * so background lock delivery + EMI reminders keep running when the app is
 * closed. Requires an explicit user tap; cannot be granted silently.
 */
export async function requestIgnoreBatteryOptimizations(): Promise<{ requested: boolean; alreadyGranted?: boolean; reason?: string }> {
  if (!isSupported()) return { requested: false, reason: 'unsupported' };
  try { return await native.requestIgnoreBatteryOptimizations(); } catch { return { requested: false, reason: 'native_error' }; }
}

/**
 * Opens the Android system "activate device admin" dialog. Requires an explicit
 * user tap in the OS UI — this method cannot grant the permission itself.
 */
export async function requestDeviceAdmin(): Promise<void> {
  if (!isSupported()) return;
  try { await native.requestDeviceAdmin(); } catch { /* user dismissed / unavailable */ }
}

/** Opens the system screen where the user can review/remove device admin. */
export async function openDeviceAdminSettings(): Promise<void> {
  if (!isSupported()) return;
  try { await native.openDeviceAdminSettings(); } catch { /* noop */ }
}

export async function getManagementMode(): Promise<ManagementMode> {
  if (!isSupported()) return 'UNSUPPORTED';
  try { return await native.getManagementMode(); } catch { return 'UNSUPPORTED'; }
}

export async function getDeviceManagementStatus(): Promise<DeviceManagementStatus> {
  if (!isSupported()) return { adminActive: false, mode: 'UNSUPPORTED', state: 'UNSUPPORTED', canLock: false };
  try {
    return await native.getDeviceManagementStatus();
  } catch {
    return { adminActive: false, mode: 'UNSUPPORTED', state: 'UNSUPPORTED', canLock: false };
  }
}

export async function getDeviceInfo(): Promise<DeviceInfo> {
  if (!isSupported()) {
    return { manufacturer: '', model: '', androidVersion: '', sdkInt: 0 };
  }
  try { return await native.getDeviceInfo(); } catch {
    return { manufacturer: '', model: '', androidVersion: '', sdkInt: 0 };
  }
}

/**
 * Execute an authorised lock. Uses DevicePolicyManager.lockNow() when this app
 * is an active admin — the documented way to secure the screen. The app then
 * surfaces its OWN clearly-branded lock screen (EMI due + retailer contact);
 * it does not draw a fake Android system screen and does not touch emergency
 * dialling. Returns a structured result the caller reports back to the server.
 */
/**
 * Keep the app un-removable while the EMI is outstanding. Only effective when
 * the device is enrolled as Device Owner (fully managed) — the supported way to
 * block uninstall. Returns `applied: false` with a reason otherwise (e.g. a
 * normal device-admin phone), so the UI can explain the limitation honestly.
 */
export async function setUninstallProtection(active: boolean): Promise<{ applied: boolean; reason?: string; mode?: string }> {
  if (!isSupported()) return { applied: false, reason: 'unsupported' };
  try { return await native.setUninstallProtection(active); } catch { return { applied: false, reason: 'native_error' }; }
}

export interface FinancingProtectionResult {
  applied: boolean;
  reason?: string;
  mode?: string;
  active?: boolean;
  frpApplied?: boolean;
  frpSupported?: boolean;
  accountsConfigured?: number;
  sdkInt?: number;
}

/**
 * Apply/clear the collateral protections tied to the loan being outstanding
 * (Device Owner only): uninstall block, factory-reset block (Settings),
 * safe-boot block, add-user block, and Factory Reset Protection policy (so even
 * a recovery-mode wipe demands the configured account). `frpAccounts` are the
 * account identifiers allowed to unlock the device after a wipe. Returns
 * applied:false with a reason on non-owner devices — never pretends.
 */
export async function applyFinancingProtection(active: boolean, frpAccounts: string[] = []): Promise<FinancingProtectionResult> {
  if (!isSupported()) return { applied: false, reason: 'unsupported' };
  try { return await native.applyFinancingProtection(active, JSON.stringify(frpAccounts)); } catch { return { applied: false, reason: 'native_error' }; }
}

export interface ProtectionStatus {
  mode: string;
  factoryResetBlocked: boolean;
  safeBootBlocked: boolean;
  addUserBlocked: boolean;
  frpSupported: boolean;
  sdkInt: number;
}

/** Read which collateral protections are actually in force right now. */
export async function getProtectionStatus(): Promise<ProtectionStatus> {
  const fallback: ProtectionStatus = { mode: 'UNSUPPORTED', factoryResetBlocked: false, safeBootBlocked: false, addUserBlocked: false, frpSupported: false, sdkInt: 0 };
  if (!isSupported()) return fallback;
  try { return await native.getProtectionStatus(); } catch { return fallback; }
}

/**
 * Configure the offline SMS LOCK/UNLOCK channel: the authorised sender numbers
 * (comma-separated) and this device's customer code. An SMS "LOCK <code>" /
 * "UNLOCK <code>" from an allowlisted number then locks/unlocks the device with
 * no network. Safe no-op off-Android.
 */
export async function configureSmsControl(sendersCsv: string, customerCode: string): Promise<{ ok: boolean; configured?: boolean }> {
  if (!isSupported() || !sendersCsv || !customerCode) return { ok: false };
  try { return await native.configureSmsControl(sendersCsv, customerCode); } catch { return { ok: false }; }
}

export async function isSmsControlConfigured(): Promise<boolean> {
  if (!isSupported()) return false;
  try { return await native.isSmsControlConfigured(); } catch { return false; }
}

/** Device Owner silently grants itself RECEIVE_SMS so the channel works. */
export async function grantSmsPermissionIfOwner(): Promise<{ granted: boolean; reason?: string }> {
  if (!isSupported()) return { granted: false, reason: 'unsupported' };
  try { return await native.grantSmsPermissionIfOwner(); } catch { return { granted: false, reason: 'native_error' }; }
}

export interface SmsControlStatus { configured: boolean; permissionGranted: boolean; mode: string }
export async function getSmsControlStatus(): Promise<SmsControlStatus> {
  const fallback: SmsControlStatus = { configured: false, permissionGranted: false, mode: 'UNSUPPORTED' };
  if (!isSupported()) return fallback;
  try { return await native.getSmsControlStatus(); } catch { return fallback; }
}

// --- Advanced device actions (Device Owner) --------------------------------
export type DevicePolicyKey = 'CAMERA' | 'BLUETOOTH' | 'WIFI' | 'USB' | 'AIRPLANE' | 'OUTGOING_CALLS' | 'WALLPAPER';
export interface DevicePolicyResult { applied: boolean; policy?: string; enabled?: boolean; mode?: string; reason?: string }

/** Lock (enabled=true) or release (false) a device policy. CAMERA works under
 * Device Admin too; the rest require Device Owner. Honest reason on refusal. */
export async function setDevicePolicy(policy: DevicePolicyKey, enabled: boolean): Promise<DevicePolicyResult> {
  if (!isSupported()) return { applied: false, reason: 'unsupported' };
  try { return await native.setDevicePolicy(policy, enabled); } catch { return { applied: false, reason: 'native_error' }; }
}

export interface DevicePoliciesState {
  mode: string; camera: boolean; bluetooth: boolean; wifi: boolean; usb: boolean;
  airplane: boolean; outgoingCalls: boolean; wallpaper: boolean;
}
export async function getDevicePolicies(): Promise<DevicePoliciesState | null> {
  if (!isSupported()) return null;
  try { return await native.getDevicePolicies(); } catch { return null; }
}

export async function rebootDevice(): Promise<{ ok: boolean; reason?: string }> {
  if (!isSupported()) return { ok: false, reason: 'unsupported' };
  try { return await native.rebootDevice(); } catch { return { ok: false, reason: 'native_error' }; }
}

export async function setApplicationHidden(packageName: string, hidden: boolean): Promise<{ applied: boolean; reason?: string }> {
  if (!isSupported() || !packageName) return { applied: false, reason: 'unsupported' };
  try { return await native.setApplicationHidden(packageName, hidden); } catch { return { applied: false, reason: 'native_error' }; }
}

/** Wi-Fi ON/OFF. Device Owner on all versions; a normal app only ≤ Android 9. */
export async function setWifiEnabled(enabled: boolean): Promise<{ ok: boolean; reason?: string }> {
  if (!isSupported()) return { ok: false, reason: 'unsupported' };
  try { return await native.setWifiEnabled(enabled); } catch { return { ok: false, reason: 'native_error' }; }
}

/** Airplane ON/OFF — attempt only; reports the true result (usually unsupported). */
export async function setAirplaneMode(enabled: boolean): Promise<{ ok: boolean; reason?: string }> {
  if (!isSupported()) return { ok: false, reason: 'unsupported' };
  try { return await native.setAirplaneMode(enabled); } catch { return { ok: false, reason: 'native_error' }; }
}

/** Device Owner grants itself the location + phone runtime permissions. */
export async function grantLocationSimPermissionsIfOwner(): Promise<{ granted: boolean; reason?: string }> {
  if (!isSupported()) return { granted: false, reason: 'unsupported' };
  try { return await native.grantLocationSimPermissionsIfOwner(); } catch { return { granted: false, reason: 'native_error' }; }
}

export interface DeviceLocation { ok: boolean; lat?: number; lng?: number; accuracy?: number; provider?: string; time?: number; reason?: string }
export async function getLocation(): Promise<DeviceLocation> {
  if (!isSupported()) return { ok: false, reason: 'unsupported' };
  try { return await native.getLocation(); } catch { return { ok: false, reason: 'native_error' }; }
}

export interface SimInfoEntry { slot: number; carrier: string; display: string; number: string }
export interface SimInfo { ok: boolean; count?: number; sims?: SimInfoEntry[]; reason?: string }
export async function getSimInfo(): Promise<SimInfo> {
  if (!isSupported()) return { ok: false, reason: 'unsupported' };
  try { return await native.getSimInfo(); } catch { return { ok: false, reason: 'native_error' }; }
}

/** Hide/unhide all user apps except TelePoint (EMI-only). Device Owner. */
export async function hideAllUserApps(hide: boolean): Promise<{ applied: boolean; count?: number; reason?: string }> {
  if (!isSupported()) return { applied: false, reason: 'unsupported' };
  try { return await native.hideAllUserApps(hide); } catch { return { applied: false, reason: 'native_error' }; }
}

export async function setTrackingEnabled(enabled: boolean): Promise<{ ok: boolean; enabled?: boolean }> {
  if (!isSupported()) return { ok: false };
  try { return await native.setTrackingEnabled(enabled); } catch { return { ok: false }; }
}
export async function isTrackingEnabled(): Promise<boolean> {
  if (!isSupported()) return false;
  try { return await native.isTrackingEnabled(); } catch { return false; }
}

/** Full release once the loan is closed — clears ALL management. */
export async function releaseManagedRestrictions(): Promise<{ ok: boolean; mode?: string }> {
  if (!isSupported()) return { ok: false };
  try { return await native.releaseManagedRestrictions(); } catch { return { ok: false }; }
}

/**
 * Re-assert the screen lock while an account is locked. On a stock personal
 * device the user can unlock their own screen, so the app calls this on each
 * foreground so a single unlock does not defeat the EMI lock. lockNow() only.
 */
export async function lockNow(): Promise<boolean> {
  if (!isSupported()) return false;
  try { return await native.lockNow(); } catch { return false; }
}

export async function executeAuthorizedLock(commandId: string): Promise<LockResult> {
  if (!commandId) return { ok: false, commandId: '', reason: 'missing_command_id' };
  if (!isSupported()) return { ok: false, commandId, reason: 'unsupported' };
  try {
    return await native.executeAuthorizedLock(commandId);
  } catch (e) {
    return { ok: false, commandId, reason: e instanceof Error ? e.message : 'native_error' };
  }
}

/**
 * Execute an authorised unlock. There is no forced "unlock the screen" on
 * stock Android for a plain device admin; this clears the app-level managed
 * state so the customer's own screen lock takes over again, and reports success
 * so the backend can move the device out of LOCKED. Documented + honest.
 */
export async function executeAuthorizedUnlock(commandId: string): Promise<LockResult> {
  if (!commandId) return { ok: false, commandId: '', reason: 'missing_command_id' };
  if (!isSupported()) return { ok: false, commandId, reason: 'unsupported' };
  try {
    return await native.executeAuthorizedUnlock(commandId);
  } catch (e) {
    return { ok: false, commandId, reason: e instanceof Error ? e.message : 'native_error' };
  }
}
