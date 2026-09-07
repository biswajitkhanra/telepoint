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
export function firstChargeTotal(c: FirstChargeLike | null | undefined): number {
  if (!c) return 0;
  return Math.max(0, num(c.first_emi_charge_amount));
}

/** Amount of the First EMI Charge collected so far. */
export function firstChargePaid(c: FirstChargeLike | null | undefined): number {
  if (!c) return 0;
  const total = firstChargeTotal(c);
  if (total <= 0) return 0;
  if (c.first_emi_charge_paid_at) return total;
  return Math.min(total, Math.max(0, num(c.first_emi_charge_paid_amount)));
}

/** Outstanding First EMI Charge balance still due (0 if none / fully paid). */
export function firstChargeRemaining(c: FirstChargeLike | null | undefined): number {
  if (!c) return 0;
  const total = firstChargeTotal(c);
  if (total <= 0) return 0;
  return Math.max(0, total - firstChargePaid(c));
}

/** Display status for the First EMI Charge. */
export function firstChargeStatus(c: FirstChargeLike | null | undefined): FirstChargeStatus {
  if (!c) return 'NONE';
  const total = firstChargeTotal(c);
  if (total <= 0) return 'NONE';
  const paid = firstChargePaid(c);
  if (paid >= total) return 'PAID';
  if (paid > 0) return 'PARTIAL';
  return 'UNPAID';
}
