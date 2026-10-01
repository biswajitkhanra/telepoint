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

export async function getSessionToken(): Promise<string | null> {
  try { return await AsyncStorage.getItem(STORAGE_KEYS.CUSTOMER_SESSION_TOKEN); } catch { return null; }
}

async function post<T>(path: string, customerId: string, extra: Record<string, unknown>): Promise<T | null> {
  const token = await getSessionToken();
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
  return post<{ device: unknown; totp_secret?: string }>('/api/device/register', i.customerId, {
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
  command_type: 'LOCK' | 'UNLOCK' | 'EMI_REMINDER' | 'DEVICE_ACTION';
  reason?: string | null;
  emi_amount?: number | null;
  voice?: boolean | null;
  language?: 'bn' | 'hi' | null;
  payload?: { action?: string; enabled?: boolean; package?: string; packages?: string[]; pin?: string } | null;
  status: string;
  expires_at: string;
  /** Issued-at timestamp — used by the unlock-wins guard to skip stale LOCKs. */
  created_at?: string;
}

export interface ReminderSettingsPayload {
  reminder_enabled: boolean;
  overdue_reminder_enabled: boolean;
  voice_enabled: boolean;
  voice_language: 'bn' | 'hi';
  voice_on_overdue: boolean;
  schedule_version: number;
}

export interface DeviceStatusResponse {
  commands?: PollCommand[];
  loan_status?: string | null;
  /** Server wall-clock at poll time — the phone converts its monotonic unlock watermark to this clock. */
  server_now?: string;
  device?: { id: string; management_status: string } | null;
  retailer?: { name?: string; mobile?: string } | null;
  customer_name?: string | null;
  customer_photo_url?: string | null;
  breakdown?: Record<string, unknown> | null;
  reminder_settings?: ReminderSettingsPayload | null;
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
  result: 'EXECUTED' | 'FAILED' | 'SUPERSEDED',
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
  info: { appVersion?: string; androidVersion?: string; adminEnabled?: boolean; managementMode?: string; policies?: object | null; location?: object | null; simInfo?: object | null },
) {
  return post<{ ok: boolean }>('/api/device/heartbeat', customerId, {
    installation_id: installationId,
    app_version: info.appVersion,
    android_version: info.androidVersion,
    admin_enabled: info.adminEnabled,
    management_mode: info.managementMode,
    policies: info.policies ?? undefined,
    location: info.location ?? undefined,
    sim_info: info.simInfo ?? undefined,
  });
}
