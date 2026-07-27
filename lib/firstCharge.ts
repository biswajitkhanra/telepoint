// ── First EMI Charge (partial-payment aware) ─────────────────────────────────
// The "First EMI Charge" is a one-time additional charge collected alongside a
// customer's first EMI. It used to be strictly all-or-nothing (tracked only by
// `first_emi_charge_paid_at`). It now supports PARTIAL payments, exactly like a
// normal EMI: the running paid balance lives in `first_emi_charge_paid_amount`,
// and `first_emi_charge_paid_at` is stamped only once the charge is FULLY paid.
//
// These helpers are the single source of truth for computing the remaining
// balance, the amount collected so far, and the display status. They tolerate
// rows that predate the `first_emi_charge_paid_amount` column: when it is
// missing but `first_emi_charge_paid_at` is set, the charge is treated as fully
// paid (backward-compatible with the legacy paid/unpaid model).

export type FirstChargeStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'NONE';

export interface FirstChargeLike {
  first_emi_charge_amount?: number | null;
  first_emi_charge_paid_amount?: number | null;
  first_emi_charge_paid_at?: string | null;
}

function num(v: number | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Total charge configured for this customer (0 if none). */
export function firstChargeTotal(c: FirstChargeLike): number {
  return Math.max(0, num(c.first_emi_charge_amount));
}

/** Amount of the First EMI Charge collected so far. */
export function firstChargePaid(c: FirstChargeLike): number {
  const total = firstChargeTotal(c);
  if (total <= 0) return 0;
  // A set paid-at timestamp is authoritative for the fully-paid case and also
  // covers legacy rows written before the paid-amount column existed.
  if (c.first_emi_charge_paid_at) return total;
  return Math.min(total, Math.max(0, num(c.first_emi_charge_paid_amount)));
}

/** Outstanding First EMI Charge balance still due (0 if none / fully paid). */
export function firstChargeRemaining(c: FirstChargeLike): number {
  const total = firstChargeTotal(c);
  if (total <= 0) return 0;
  return Math.max(0, total - firstChargePaid(c));
}

/** Display status for the First EMI Charge. */
export function firstChargeStatus(c: FirstChargeLike): FirstChargeStatus {
  const total = firstChargeTotal(c);
  if (total <= 0) return 'NONE';
  const paid = firstChargePaid(c);
  if (paid >= total) return 'PAID';
  if (paid > 0) return 'PARTIAL';
  return 'UNPAID';
}

/** Human-readable label — 'Paid' | 'Partially Paid' | 'Unpaid'. */
export function firstChargeStatusLabel(c: FirstChargeLike): string {
  switch (firstChargeStatus(c)) {
    case 'PAID': return 'Paid';
    case 'PARTIAL': return 'Partially Paid';
    case 'UNPAID': return 'Unpaid';
    default: return '';
  }
}

/** True when a charge exists and is not yet fully collected. */
export function firstChargePending(c: FirstChargeLike): boolean {
  return firstChargeRemaining(c) > 0;
}
