/** Whether the Android device-admin permission is currently active. */
export type DeviceManagementState =
  | 'ADMIN_ACTIVE'
  | 'ADMIN_INACTIVE'
  | 'UNSUPPORTED';

/**
 * The Android management mode of the device, which decides what operations are
 * legitimately available:
 *   UNMANAGED     — personal device, no admin: no force-lock
 *   DEVICE_ADMIN  — legacy active admin: force-lock supported
 *   PROFILE_OWNER — work profile: cannot lock the whole personal device
 *   DEVICE_OWNER  — fully managed: force-lock supported
 *   UNSUPPORTED   — non-Android / Expo Go (native module absent)
 */
export type ManagementMode =
  | 'UNMANAGED'
  | 'DEVICE_ADMIN'
  | 'PROFILE_OWNER'
  | 'DEVICE_OWNER'
  | 'UNSUPPORTED';

export interface DeviceManagementStatus {
  /** True when this app is an active device administrator. */
  adminActive: boolean;
  /** The device's current management mode. */
  mode: ManagementMode;
  /** High-level state, incl. UNSUPPORTED on non-Android / Expo Go. */
  state: DeviceManagementState;
  /** True when lockNow() can be invoked in the current mode. */
  canLock: boolean;
}

export interface DeviceInfo {
  manufacturer: string;
  model: string;
  androidVersion: string;
  sdkInt: number;
}

export interface LockResult {
  ok: boolean;
  commandId: string;
  /** Machine reason on failure, e.g. "admin_inactive" | "unsupported". */
  reason?: string;
}
