import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { PORTAL_BASE_URL, STORAGE_KEYS } from '../config';

/**
 * Customer-app client for the TelePoint device-management API. Authenticated by
 * the signed customer session token issued at Aadhaar/mobile login (the same
 * token app/api/customer-login mints). The owning retailer/loan is resolved
 * server-side — this client never asserts ownership.
 */

const INSTALL_ID_KEY = 'telepoint_device_installation_id';

/** Minimal RFC-4122-ish v4 id. Server enforces global uniqueness on top. */
function uuidv4(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Stable per-install identifier, persisted in the OS keystore (SecureStore).
 * NOT a hardware id — no IMEI/serial is collected. Survives app restarts;
 * cleared by Android "Clear data" (which we respect, per spec).
 */
export async function getInstallationId(): Promise<string> {
  try {
    const existing = await SecureStore.getItemAsync(INSTALL_ID_KEY);
    if (existing && existing.length >= 8) return existing;
  } catch { /* keystore unavailable — fall through */ }
  const id = uuidv4();
  try { await SecureStore.setItemAsync(INSTALL_ID_KEY, id); } catch { /* best effort */ }
  return id;
}

async function sessionToken(): Promise<string | null> {
  try { return await AsyncStorage.getItem(STORAGE_KEYS.CUSTOMER_SESSION_TOKEN); } catch { return null; }
}

async function post<T>(path: string, customerId: string, extra: Record<string, unknown>): Promise<T | null> {
  const token = await sessionToken();
  if (!token) return null; // no proof of login → do not call
  try {
    const res = await fetch(`${PORTAL_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId, session_token: token, ...extra }),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface RegisterDeviceInput {
  customerId: string;
  installationId: string;
  deviceModel?: string;
  deviceManufacturer?: string;
  androidVersion?: string;
  appVersion?: string;
  consent?: boolean;
  adminEnabled?: boolean;
  managementMode?: string;
}

export async function registerDevice(i: RegisterDeviceInput) {
  return post<{ device: unknown }>('/api/device/register', i.customerId, {
    installation_id: i.installationId,
    device_model: i.deviceModel,
    device_manufacturer: i.deviceManufacturer,
    android_version: i.androidVersion,
    app_version: i.appVersion,
    consent: i.consent ?? false,
    admin_enabled: i.adminEnabled ?? false,
    management_mode: i.managementMode,
  });
}

export interface PollCommand {
  id: string;
  device_id: string;
  customer_id: string;
  retailer_id: string;
  command_type: 'LOCK' | 'UNLOCK';
  reason?: string | null;
  emi_amount?: number | null;
  status: string;
  expires_at: string;
}

export interface DeviceStatusResponse {
  commands?: PollCommand[];
  device?: { id: string; management_status: string } | null;
  retailer?: { name?: string; mobile?: string } | null;
  customer_name?: string | null;
  breakdown?: Record<string, unknown> | null;
}

export async function pollCommands(customerId: string, installationId: string) {
  return post<DeviceStatusResponse>('/api/device/commands', customerId, { installation_id: installationId });
}

export async function getDeviceStatus(customerId: string, installationId: string) {
  return post<DeviceStatusResponse>('/api/device/status', customerId, { installation_id: installationId });
}

export async function ackCommand(
  customerId: string,
  installationId: string,
  commandId: string,
  result: 'EXECUTED' | 'FAILED',
  failureReason?: string,
) {
  return post<{ status: string }>('/api/device/command/ack', customerId, {
    installation_id: installationId,
    command_id: commandId,
    result,
    failure_reason: failureReason,
  });
}

export async function sendHeartbeat(
  customerId: string,
  installationId: string,
  info: { appVersion?: string; androidVersion?: string; adminEnabled?: boolean; managementMode?: string },
) {
  return post<{ ok: boolean }>('/api/device/heartbeat', customerId, {
    installation_id: installationId,
    app_version: info.appVersion,
    android_version: info.androidVersion,
    admin_enabled: info.adminEnabled,
    management_mode: info.managementMode,
  });
}
