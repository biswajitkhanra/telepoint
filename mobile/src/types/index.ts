export interface Customer {
  id: string;
  customer_code?: string | null;
  customer_name: string;
  father_name?: string;
  aadhaar?: string;
  mobile: string;
  alternate_number_1?: string;
  model_no?: string;
  imei: string;
  purchase_value: number;
  down_payment: number;
  disburse_amount?: number;
  purchase_date: string;
  emi_due_day: number;
  emi_amount: number;
  emi_tenure: number;
  first_emi_charge_amount: number;
  first_emi_charge_paid_amount?: number;
  customer_photo_url?: string;
  status: 'RUNNING' | 'COMPLETE' | 'SETTLED' | 'NPA';
  retailer?: {
    name: string;
    mobile?: string;
  };
}

export interface EMIScheduleItem {
  id: string;
  emi_no: number;
  due_date: string;
  amount: number;
  status: 'UNPAID' | 'PENDING_APPROVAL' | 'PARTIALLY_PAID' | 'APPROVED' | 'collected' | 'pending' | 'overdue' | string;
  paid_at?: string | null;
  mode?: 'CASH' | 'UPI' | string | null;
  utr?: string | null;
  partial_paid_amount?: number;
  partial_paid_at?: string | null;
  fine_amount: number;
  fine_paid_amount: number;
  fine_waived: boolean;
  fine_paid_at?: string | null;
  collection_requested_at?: string | null;
}

export interface DueBreakdown {
  customer_id: string;
  customer_status: string;
  next_emi_no?: number;
  next_emi_amount?: number;
  next_emi_due_date?: string;
  fine_due: number;
  first_emi_charge_due: number;
  total_payable: number;
  is_overdue: boolean;
}

export interface BroadcastItem {
  id: string;
  message: string;
  image_url?: string | null;
  expires_at: string;
  sender_name?: string;
  sender_role?: string;
}

export interface NotificationHistoryItem {
  id: string;
  notification_type: 'emi_reminder' | 'broadcast' | 'system';
  title: string;
  body: string;
  data?: Record<string, unknown>;
  status: string;
  created_at: string;
  sent_at?: string;
}

export interface MultiLoanCustomer {
  id: string;
  customer_name: string;
  imei: string;
  model_no?: string;
  mobile: string;
  status: string;
  emi_amount?: number;
  retailer?: unknown;
}
