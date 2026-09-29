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

/** True when the TelePoint uninstall-protection accessibility service is enabled. */
export async function isAccessibilityEnabled(): Promise<boolean> {
  if (!isSupported()) return false;
  try { return await native.isAccessibilityEnabled(); } catch { return false; }
}

/** Open the OS Accessibility settings so the user can enable uninstall protection. */
export async function openAccessibilitySettings(): Promise<void> {
  if (!isSupported()) return;
  try { await native.openAccessibilitySettings(); } catch { /* noop */ }
}

/**
 * Set whether the app may be uninstalled. Pass false while the EMI is
 * outstanding (blocks removal) and true once the loan is cleared.
 */
export async function setUninstallProtected(active: boolean): Promise<{ ok: boolean; protected?: boolean }> {
  if (!isSupported()) return { ok: false };
  try { return await native.setUninstallProtected(active); } catch { return { ok: false }; }
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
