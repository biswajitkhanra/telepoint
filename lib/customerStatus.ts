/**
 * customerStatus.ts
 *
 * Single source of truth for customer-status and fine-status business logic.
 *
 * KEY DESIGN PRINCIPLE
 * --------------------
 * EMI completion status and fine status are INDEPENDENT obligations:
 *
 *   � A customer is "EMI-complete" when every EMI installment is APPROVED
 *     AND the First-EMI Charge (if any) is fully settled.
 *   � A customer is "fine-clear" when every non-waived fine is fully paid.
 *
 * The customer`s `status` field tracks only the EMI lifecycle:
 *   RUNNING  ? active, EMIs in progress
 *   COMPLETE ? all EMIs paid (by admin action or auto-detection)
 *   SETTLED  ? closed early with a negotiated settlement
 *   NPA      ? non-performing, written off
 *
 * A pending fine NEVER changes a COMPLETE customer back to RUNNING.
 * Fine is shown as a separate badge/indicator on the UI.
 *
 * TERMINAL STATUS GUARD
 * ---------------------
 * COMPLETE, SETTLED, and NPA are "locked" terminal states that can only be
 * changed by explicit admin actions, never by automated fine/payment recalc.
 */

export interface EmiStatusRow {
  status: string;
  amount?: number | null;
  partial_paid_amount?: number | null;
  fine_amount?: number | null;
  fine_paid_amount?: number | null;
  fine_waived?: boolean | null;
}

export interface CustomerFirstCharge {
  first_emi_charge_amount?: number | null;
  first_emi_charge_paid_amount?: number | null;
  first_emi_charge_paid_at?: string | null;
}

// Fine helpers

/**
 * Returns true if the customer has at least one outstanding fine that is
 * not waived AND not fully paid.
 */
export function hasPendingFine(emis: EmiStatusRow[]): boolean {
  return emis.some(e => {
    if (e.fine_waived) return false;
    const due = Math.max(0, toNum(e.fine_amount));
    if (due <= 0) return false;
    return toNum(e.fine_paid_amount) < due;
  });
}

/**
 * Total outstanding fine amount across all EMIs (excluding waived fines).
 */
export function totalPendingFine(emis: EmiStatusRow[]): number {
  return emis.reduce((s, e) => {
    if (e.fine_waived) return s;
    const due = Math.max(0, toNum(e.fine_amount));
    const paid = Math.min(due, toNum(e.fine_paid_amount));
    return s + Math.max(0, due - paid);
  }, 0);
}

// EMI completion helpers

/**
 * Returns true when every EMI installment is fully approved.
 * Does NOT consider fine status � fine is a separate obligation.
 */
export function allEmisApproved(emis: EmiStatusRow[]): boolean {
  if (!emis.length) return false;
  return emis.every(e => e.status === 'APPROVED');
}

/**
 * Returns true when the First-EMI Charge is fully settled.
 * A set paid_at timestamp means fully paid (handles legacy rows).
 */
export function isFirstChargeSettled(c: CustomerFirstCharge): boolean {
  const total = toNum(c.first_emi_charge_amount);
  if (total <= 0) return true;
  if (c.first_emi_charge_paid_at) return true;
  return toNum(c.first_emi_charge_paid_amount) >= total;
}

/**
 * Returns true when all EMIs are APPROVED AND the First-EMI Charge is settled.
 * This is the sole condition for auto-promotion to COMPLETE.
 * Fine status is intentionally excluded.
 */
export function isAutoCompletable(
  emis: EmiStatusRow[],
  customer: CustomerFirstCharge,
): boolean {
  return allEmisApproved(emis) && isFirstChargeSettled(customer);
}

/**
 * Returns true when a status represents a terminal/locked state.
 * Terminal states can only be changed by explicit admin actions,
 * never by automated fine/payment recalculation.
 */
export function isTerminalStatus(status: string): boolean {
  return status === 'COMPLETE' || status === 'SETTLED' || status === 'NPA';
}

// UI badge helper

/**
 * Returns the fine badge label for a COMPLETE customer, or null if no
 * outstanding fine exists.
 */
export function deriveFineBadge(
  customerStatus: string,
  emis: EmiStatusRow[],
): 'Fine Pending' | null {
  if (customerStatus !== 'COMPLETE') return null;
  return hasPendingFine(emis) ? 'Fine Pending' : null;
}

// Internal

function toNum(v: unknown): number {
  return Math.max(0, Number(v) || 0);
}
