export type Role = 'super_admin' | 'retailer';

export interface Profile {
  user_id: string;
  role: Role;
  created_at: string;
}

export interface Retailer {
  id: string;
  auth_user_id: string;
  name: string;
  username: string;
  mobile?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  retailer_id: string;
  retailer?: Retailer | null;
  /** Short unique customer number (TP1001…), assigned by migration 025. */
  customer_code?: string | null;
  customer_name: string;
  father_name?: string;
  aadhaar?: string;
  voter_id?: string;
  address?: string;
  landmark?: string;
  mobile: string;
  alternate_number_1?: string;
  alternate_number_2?: string;
  model_no?: string;
  imei: string;
  purchase_value: number;
  down_payment: number;
  disburse_amount?: number;
  purchase_date: string;
  emi_start_date?: string;
  emi_due_day: number;
  emi_amount: number;
  emi_tenure: number;
  first_emi_charge_amount: number;
  /** Running balance of the First EMI Charge collected so far (partial payments). */
  first_emi_charge_paid_amount?: number;
  /** Stamped only once the First EMI Charge is FULLY paid. */
  first_emi_charge_paid_at?: string;
  box_no?: string;
  // Image URLs
  customer_photo_url?: string;
  aadhaar_front_url?: string;
  aadhaar_back_url?: string;
  bill_photo_url?: string;
  emi_card_photo_url?: string;
  // Phone lock
  is_locked?: boolean;
  lock_provider?: string | null;
  lock_device_id?: string | null;
  google_drive_docs?: string | null;
  // Status: RUNNING | COMPLETE (auto) | SETTLED (manual) | NPA (bad debt)
  status: 'RUNNING' | 'COMPLETE' | 'SETTLED' | 'NPA';
  completion_remark?: string;
  completion_date?: string;
  settlement_amount?: number;
  settlement_date?: string;
  settled_by?: string;
  created_at: string;
  updated_at: string;
}

export interface EMISchedule {
  id: string;
  customer_id: string;
  emi_no: number;
  due_date: string;
  amount: number;
  status: 'UNPAID' | 'PENDING_APPROVAL' | 'PARTIALLY_PAID' | 'APPROVED';
  partial_paid_amount?: number;
  partial_paid_at?: string;
  paid_at?: string;
  mode?: 'CASH' | 'UPI';
  utr?: string;
  approved_by?: string;
  fine_amount: number;
  fine_waived: boolean;
  fine_last_calculated_at?: string;
  fine_paid_amount: number;
  fine_paid_at?: string;
  fine_utr?: string;
  fine_mode?: 'CASH' | 'UPI';
  /**
   * When the retailer (or admin) first initiated collection for this EMI.
   * This — NOT the admin approval date — drives fine eligibility:
   *   collection_requested_at <= due_date  → no fine (collected on time)
   *   collection_requested_at >  due_date  → fine applies (collected late)
   * Cleared when a payment request is rejected so normal overdue accrual resumes.
   */
  collection_requested_at?: string | null;
  collected_by_role?: 'admin' | 'retailer';
  collected_by_user_id?: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentRequest {
  id: string;
  customer_id: string;
  customer?: Partial<Customer>;
  retailer_id: string;
  retailer?: Partial<Retailer>;
  submitted_by?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  mode: 'CASH' | 'UPI';
  utr?: string;
  total_emi_amount: number;
  scheduled_emi_amount?: number;
  fine_amount: number;
  first_emi_charge_amount: number;
  total_amount: number;
  notes?: string;
  rejection_reason?: string;
  rejected_by?: string;
  rejected_at?: string;
  approved_by?: string;
  approved_at?: string;
  selected_emi_nos?: number[];
  fine_for_emi_no?: number;
  items?: PaymentRequestItem[];
  collected_by_role?: 'admin' | 'retailer';
  collected_by_user_id?: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentRequestItem {
  id: string;
  payment_request_id: string;
  emi_schedule_id: string;
  emi_no: number;
  amount: number;
}

export interface DueBreakdown {
  customer_id: string;
  customer_status: string;
  next_emi_no?: number;
  next_emi_amount?: number;
  next_emi_due_date?: string;
  next_emi_status?: string;
  selected_emi_no?: number;
  selected_emi_amount?: number;
  fine_due: number;
  first_emi_charge_due: number;
  total_payable: number;
  popup_first_emi_charge: boolean;
  popup_fine_due: boolean;
  is_overdue: boolean;
}

export interface AuditLog {
  id: string;
  actor_user_id?: string;
  actor_role?: string;
  action: string;
  table_name?: string;
  record_id?: string;
  before_data?: Record<string, unknown>;
  after_data?: Record<string, unknown>;
  remark?: string;
  created_at: string;
}

export interface FineSettings {
  id: number;
  default_fine_amount: number;
  weekly_fine_increment: number;
  updated_at: string;
}

export interface BroadcastMessage {
  id: string;
  message: string;
  image_url?: string | null;
  expires_at: string;
  created_at: string;
  target_retailer_id?: string;
  sender_name?: string;
  sender_role?: string;
}

export interface FineHistory {
  id: string;
  customer_id: string;
  emi_schedule_id?: string;
  emi_no?: number;
  fine_type: 'BASE' | 'WEEKLY' | 'PAID' | 'WAIVED';
  fine_amount: number;
  cumulative_fine: number;
  fine_date: string;
  reason: string;
  created_at: string;
}

export interface CustomerAppToken {
  id: string;
  customer_id: string;
  token: string;
  is_active: boolean;
  created_by?: string;
  last_accessed_at?: string;
  created_at: string;
  updated_at: string;
}

// ============================================================
// DEVICE MANAGEMENT (migration 030)
// Consent-based EMI device lock. The device is the financed collateral;
// with the customer's explicit Android device-admin permission, an authorised
// retailer/admin can request the documented DevicePolicyManager lock state.
// ============================================================

/** Lifecycle of the managed state, as CONFIRMED by the device (not by intent). */
export type DeviceManagementStatus =
  | 'ACTIVE'
  | 'LOCK_PENDING'
  | 'LOCKED'
  | 'UNLOCK_PENDING'
  | 'ADMIN_PERMISSION_MISSING'
  | 'OFFLINE'
  // The device admin/owner was removed while a loan is still live (reported by
  // the app so the portal can act); or the Android version/mode cannot enforce
  // management at all. Added in migration 032.
  | 'MANAGEMENT_LOST'
  | 'UNSUPPORTED';

export interface Device {
  id: string;
  customer_id: string;
  retailer_id: string;
  /** Secure per-install id (SecureStore UUID) — NOT a hardware identifier. */
  installation_id: string;
  device_model?: string | null;
  device_manufacturer?: string | null;
  android_version?: string | null;
  app_version?: string | null;
  management_status: DeviceManagementStatus;
  admin_enabled: boolean;
  /** Live advanced-policy snapshot reported by the device (migration 034). */
  policies?: DevicePolicies | null;
  /** Last location reported by the device (migration 035). */
  last_location?: { lat?: number; lng?: number; accuracy?: number; provider?: string; at?: string } | null;
  /** SIM information reported by the device (migration 035). */
  sim_info?: { count?: number; at?: string; sims?: { slot?: number; carrier?: string; display?: string; number?: string }[] } | null;
  consent_granted_at?: string | null;
  last_seen_at?: string | null;
  registered_at: string;
  created_at: string;
  updated_at: string;
}

// LOCK/UNLOCK move the device lock state; EMI_REMINDER is the server-driven
// MANUAL "Send EMI Reminder" (Section 18); DEVICE_ACTION carries an advanced
// Device-Owner action (camera/bluetooth/wifi/usb/airplane/outgoing-call/wallpaper
// lock, reboot, app hide) in `payload`. Added in migrations 032 + 034.
export type DeviceCommandType = 'LOCK' | 'UNLOCK' | 'EMI_REMINDER' | 'DEVICE_ACTION';

/** Advanced Device-Owner action carried in a DEVICE_ACTION command payload. */
export type DeviceActionKey =
  | 'CAMERA' | 'BLUETOOTH' | 'WIFI' | 'USB' | 'AIRPLANE' | 'OUTGOING_CALLS' | 'WALLPAPER'
  | 'REBOOT' | 'APP_HIDE'
  // Power toggles + telemetry fetches.
  | 'WIFI_POWER' | 'AIRPLANE_POWER' | 'LOCATION' | 'SIM_INFO';

export interface DeviceActionPayload {
  action: DeviceActionKey;
  /** For the stateful toggles: true = lock/restrict, false = release. */
  enabled?: boolean;
  /** For APP_HIDE: the target package. */
  package?: string;
}

/** Live policy snapshot the device reports (devices.policies, migration 034). */
export interface DevicePolicies {
  mode?: string;
  camera?: boolean;
  bluetooth?: boolean;
  wifi?: boolean;
  usb?: boolean;
  airplane?: boolean;
  outgoingCalls?: boolean;
  wallpaper?: boolean;
}
export type DeviceCommandStatus =
  | 'PENDING'
  | 'RECEIVED'
  | 'EXECUTED'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface DeviceCommand {
  id: string;
  device_id: string;
  customer_id: string;
  retailer_id: string;
  command_type: DeviceCommandType;
  reason?: string | null;
  /** Snapshot of the amount due when the command was issued (locked screen). */
  emi_amount?: number | null;
  /** EMI_REMINDER only: whether to speak the reminder, and in which language. */
  voice?: boolean | null;
  language?: 'bn' | 'hi' | null;
  /** DEVICE_ACTION only: {action, enabled?, package?}. */
  payload?: DeviceActionPayload | null;
  status: DeviceCommandStatus;
  issued_by?: string | null;
  issued_by_role?: 'super_admin' | 'retailer' | null;
  expires_at: string;
  received_at?: string | null;
  executed_at?: string | null;
  failure_reason?: string | null;
  created_at: string;
  updated_at: string;
}

/** Per-customer/loan reminder configuration (migration 032, reminder_settings). */
export interface ReminderSettings {
  customer_id: string;
  reminder_enabled: boolean;
  overdue_reminder_enabled: boolean;
  voice_enabled: boolean;
  voice_language: 'bn' | 'hi';
  voice_on_overdue: boolean;
  schedule_version: number;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

/** Audit action strings recorded to audit_log for device-management events. */
export type DeviceAuditAction =
  | 'DEVICE_REGISTERED'
  | 'DEVICE_ADMIN_ENABLED'
  | 'LOCK_REQUESTED'
  | 'LOCK_RECEIVED'
  | 'LOCK_EXECUTED'
  | 'LOCK_FAILED'
  | 'UNLOCK_REQUESTED'
  | 'UNLOCK_RECEIVED'
  | 'UNLOCK_EXECUTED'
  | 'UNLOCK_FAILED'
  | 'PAYMENT_CONFIRMED'
  // Reminder-related events (migration 032).
  | 'EMI_REMINDER_SENT'
  | 'REMINDER_CONFIG_CHANGED'
  | 'MANAGEMENT_LOST';
