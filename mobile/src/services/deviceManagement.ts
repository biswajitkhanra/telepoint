import * as DeviceMgmt from 'expo-telepoint-device-management';
import type {
  DeviceInfo,
  DeviceManagementStatus,
  LockResult,
  ManagementMode,
} from 'expo-telepoint-device-management';

/**
 * Thin app-facing wrapper over the native TelePoint device-management module.
 * Keeps the single `expo-telepoint-device-management` import in one place so
 * screens depend on a small, typed surface, and so behaviour degrades cleanly
 * in Expo Go / on non-Android where the native module is absent.
 */

export type { DeviceInfo, DeviceManagementStatus, LockResult, ManagementMode };

export function isDeviceManagementSupported(): boolean {
  return DeviceMgmt.isSupported();
}

export function isDeviceAdminEnabled(): Promise<boolean> {
  return DeviceMgmt.isDeviceAdminEnabled();
}

/** True when this app is provisioned as Device Owner (hard-lock capable). */
export function isDeviceOwner(): Promise<boolean> {
  return DeviceMgmt.isDeviceOwner();
}

/** True when the app is exempt from battery optimization (Doze). */
export function isIgnoringBatteryOptimizations(): Promise<boolean> {
  return DeviceMgmt.isIgnoringBatteryOptimizations();
}

/** Open the OS "allow unrestricted battery" dialog (explicit user tap). */
export function requestIgnoreBatteryOptimizations() {
  return DeviceMgmt.requestIgnoreBatteryOptimizations();
}

/** Open the connectivity panel to turn on Wi-Fi / mobile data. */
export function openInternetPanel() {
  return DeviceMgmt.openInternetPanel();
}

export function requestDeviceAdmin(): Promise<void> {
  return DeviceMgmt.requestDeviceAdmin();
}

export function openDeviceAdminSettings(): Promise<void> {
  return DeviceMgmt.openDeviceAdminSettings();
}

export function getManagementMode(): Promise<ManagementMode> {
  return DeviceMgmt.getManagementMode();
}

export function getDeviceManagementStatus(): Promise<DeviceManagementStatus> {
  return DeviceMgmt.getDeviceManagementStatus();
}

export function getDeviceInfo(): Promise<DeviceInfo> {
  return DeviceMgmt.getDeviceInfo();
}

export function lockNow(): Promise<boolean> {
  return DeviceMgmt.lockNow();
}

export function setUninstallProtection(active: boolean): Promise<{ applied: boolean; reason?: string; mode?: string }> {
  return DeviceMgmt.setUninstallProtection(active);
}

/**
 * Apply/clear collateral protection tied to the loan (Device Owner only):
 * uninstall block + factory-reset block + safe-boot block + add-user block +
 * Factory Reset Protection account policy. No-op with a reason otherwise.
 */
export function applyFinancingProtection(active: boolean, frpAccounts: string[] = []) {
  return DeviceMgmt.applyFinancingProtection(active, frpAccounts);
}

/** Read which collateral protections are actually enforced right now. */
export function getProtectionStatus() {
  return DeviceMgmt.getProtectionStatus();
}

/** Read the SMS-control status (configured / permission / mode). */
export function getSmsControlStatus() {
  return DeviceMgmt.getSmsControlStatus();
}

/** Advanced device actions (Device Owner). Re-exported for deviceSync + screens. */
export function setDevicePolicy(policy: DeviceMgmt.DevicePolicyKey, enabled: boolean) {
  return DeviceMgmt.setDevicePolicy(policy, enabled);
}
export function getDevicePolicies() {
  return DeviceMgmt.getDevicePolicies();
}
export function rebootDevice() {
  return DeviceMgmt.rebootDevice();
}
export function setApplicationHidden(packageName: string, hidden: boolean) {
  return DeviceMgmt.setApplicationHidden(packageName, hidden);
}
export function setWifiEnabled(enabled: boolean) {
  return DeviceMgmt.setWifiEnabled(enabled);
}
export function setAirplaneMode(enabled: boolean) {
  return DeviceMgmt.setAirplaneMode(enabled);
}
export function grantLocationSimPermissionsIfOwner() {
  return DeviceMgmt.grantLocationSimPermissionsIfOwner();
}
export function getLocation() {
  return DeviceMgmt.getLocation();
}
export function getSimInfo() {
  return DeviceMgmt.getSimInfo();
}
export function hideAllUserApps(hide: boolean) {
  return DeviceMgmt.hideAllUserApps(hide);
}
export function setTrackingEnabled(enabled: boolean) {
  return DeviceMgmt.setTrackingEnabled(enabled);
}
export function isTrackingEnabled() {
  return DeviceMgmt.isTrackingEnabled();
}
export function releaseManagedRestrictions() {
  return DeviceMgmt.releaseManagedRestrictions();
}
export function openOemAutostartSettings() {
  return DeviceMgmt.openOemAutostartSettings();
}
export function setAppsSuspended(packages: string[], suspended: boolean) {
  return DeviceMgmt.setAppsSuspended(packages, suspended);
}
export function configureSimSentinel(alertNumbersCsv: string) {
  return DeviceMgmt.configureSimSentinel(alertNumbersCsv);
}
export function setSimBaseline(force = false) {
  return DeviceMgmt.setSimBaseline(force);
}
export function setTotpSecret(secret: string) {
  return DeviceMgmt.setTotpSecret(secret);
}
export function hasTotpSecret() {
  return DeviceMgmt.hasTotpSecret();
}
export function verifyTotpUnlock(code: string) {
  return DeviceMgmt.verifyTotpUnlock(code);
}

/**
 * Provision the offline SMS LOCK/UNLOCK channel for this device: set the
 * authorised sender numbers + customer code, and (Device Owner) grant RECEIVE_SMS
 * silently. Fully guarded — safe no-op in Expo Go / non-Android / without a code.
 */
export async function provisionSmsControl(customerCode: string | null | undefined, senders: string): Promise<void> {
  if (!DeviceMgmt.isSupported() || !customerCode || !senders) return;
  try { await DeviceMgmt.configureSmsControl(senders, customerCode); } catch { /* noop */ }
  try { await DeviceMgmt.grantSmsPermissionIfOwner(); } catch { /* noop */ }
}

export function executeAuthorizedLock(commandId: string): Promise<LockResult> {
  return DeviceMgmt.executeAuthorizedLock(commandId);
}

export function executeAuthorizedUnlock(commandId: string): Promise<LockResult> {
  return DeviceMgmt.executeAuthorizedUnlock(commandId);
}

/** Human-readable explanation of a management mode, for the consent/status UI. */
export function describeMode(mode: ManagementMode): { label: string; canLock: boolean; detail: string } {
  switch (mode) {
    case 'DEVICE_OWNER':
      return { label: 'Fully managed', canLock: true, detail: 'This device is enrolled as a fully managed EMI device.' };
    case 'PROFILE_OWNER':
      return { label: 'Work profile', canLock: false, detail: 'A work profile cannot lock the whole personal device. Full-device enrolment is required for lock.' };
    case 'DEVICE_ADMIN':
      return { label: 'Device administrator', canLock: true, detail: 'You have granted device-admin permission, which supports the EMI lock.' };
    case 'UNMANAGED':
      return { label: 'Not enrolled', canLock: false, detail: 'Device management is not enabled yet. Grant the permission to enable the EMI lock.' };
    default:
      return { label: 'Unavailable', canLock: false, detail: 'Device management is not available on this device or build (Expo Go is not sufficient).' };
  }
}
