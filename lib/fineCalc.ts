/**
 * EMI PENALTY SYSTEM — Complete Business Logic
 *
 * RULES:
 * 1. Base Fine: ₹450 (configurable) applied ONCE the day after EMI due date.
 * 2. 30-Day Grace: No weekly penalty for 30 days after fine applied.
 * 3. Weekly Increment: ₹25 (configurable) every 7 days AFTER the 30-day grace,
 *    until the fine is fully paid.
 * 4. EMI Paid, Fine Unpaid: Fine stays active, weekly continues to accumulate.
 *
 * LAST EMI:
 *   - If the LAST EMI itself is UNPAID: ₹450 repeats every 30 days, NO weekly.
 *   - If the LAST EMI is PAID but fine is still UNPAID: switch to NORMAL rule —
 *     ₹450 base + ₹25/week after the 30-day grace, until paid.
 *
 * Multiple EMIs: Each calculated independently.
 *
 * COLLECTION-DATE FINE ELIGIBILITY (collection_requested_at):
 *   Fine eligibility is decided by when collection was *initiated* by the
 *   retailer — never by the admin approval date.
 *     collection_requested_at <= due_date  → NO fine (paid on time, even if the
 *                                             admin approves days later).
 *     collection_requested_at >  due_date  → fine applies and stays pending
 *                                             until explicitly paid.
 *   A rejected request clears collection_requested_at so normal overdue accrual
 *   resumes from the due date.
 */

import { EMISchedule } from './types';

const BASE = 450;
const WEEKLY = 25;
const GRACE = 30;

function dateOnly(value: string | Date): number {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Collection was initiated on or before the due date → fine permanently waived. */
export function isCollectedOnTime(emi: EMISchedule): boolean {
  if (!emi.collection_requested_at) return false;
  return dateOnly(emi.collection_requested_at) <= dateOnly(emi.due_date);
}

/** Collection was initiated AFTER the due date → fine applies (and survives approval). */
function isCollectedLate(emi: EMISchedule): boolean {
  if (!emi.collection_requested_at) return false;
  return dateOnly(emi.collection_requested_at) > dateOnly(emi.due_date);
}

/** Calculate fine for a single EMI position.
 *  isLastEmiUnpaid = TRUE  → last EMI rule (₹baseFine every 30d, no weekly)
 *  isLastEmiUnpaid = FALSE → normal rule (₹baseFine + ₹weekly/wk after 30d)
 */
export function calculateSingleEmiFine(
  dueDate: string,
  isLastEmiUnpaid: boolean = false,
  baseFine: number = BASE,
  weeklyIncrement: number = WEEKLY,
): number {
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  if (today <= due) return 0;

  const days = Math.floor((today.getTime() - due.getTime()) / 86400000);
  if (days <= 0) return 0;

  if (isLastEmiUnpaid) {
    // LAST EMI + EMI still unpaid: ₹baseFine repeats every 30 days. No weekly.
    const blocks = Math.ceil(days / GRACE);
    return blocks * baseFine;
  }

  // Normal rule (and last EMI when EMI itself is paid):
  //  ₹baseFine base → 30-day grace → +₹weeklyIncrement every 7 days
  if (days <= GRACE) return baseFine;
  const weeks = Math.floor((days - GRACE) / 7);
  return baseFine + (weeks * weeklyIncrement);
}

export function calculateTotalFineFromEmis(
  emis: EMISchedule[],
  baseFine: number = BASE,
  weeklyIncrement: number = WEEKLY,
): number {
  let total = 0;
  const maxEmiNo = emis.length > 0 ? Math.max(...emis.map(e => e.emi_no)) : 0;

  for (const emi of emis) {
    if (emi.fine_waived) continue;

    // Collection-date gate: collection was initiated on/before the due date —
    // no fine ever applies, regardless of when the admin approves it.
    if (isCollectedOnTime(emi)) continue;

    // Pending grace: once a retailer submits and the EMI is awaiting admin verdict,
    // late-fine accrual freezes. Use the stored fine_amount as-is until APPROVED
    // (locked in) or REJECTED (the reject pipeline reactivates fines retroactively).
    if (emi.status === 'PENDING_APPROVAL') {
      const stored = Number(emi.fine_amount || 0);
      const paid = Number(emi.fine_paid_amount || 0);
      total += Math.max(0, stored - paid);
      continue;
    }

    const isOverdueUnpaid = ['UNPAID', 'PARTIALLY_PAID'].includes(emi.status) && new Date(emi.due_date) < new Date();
    const hasFineUnpaid = (emi.fine_amount || 0) > 0 &&
                          (emi.fine_paid_amount || 0) < (emi.fine_amount || 0);

    // A late-collected EMI keeps its fine even after it is APPROVED — the fine
    // must remain pending until explicitly paid.
    if (!isOverdueUnpaid && !hasFineUnpaid && !isCollectedLate(emi)) continue;

    // Last-EMI rule only applies when the LAST EMI itself is still UNPAID.
    // Once it is APPROVED (paid), fine accrues per normal weekly rule.
    const isLast = emi.emi_no === maxEmiNo;
    const isLastEmiUnpaid = isLast && emi.status !== 'APPROVED';

    const calc = calculateSingleEmiFine(emi.due_date, isLastEmiUnpaid, baseFine, weeklyIncrement);
    const effective = Math.max(calc, emi.fine_amount || 0);
    const paid = emi.fine_paid_amount || 0;
    total += Math.max(0, effective - paid);
  }
  return total;
}

export function getPerEmiFineBreakdown(
  emis: EMISchedule[],
  baseFine: number = BASE,
  weeklyIncrement: number = WEEKLY,
  /**
   * When true, EMIs whose fine has already been paid in full are still returned
   * (with remaining = 0) instead of being dropped. The loan-statement ledger
   * needs this so a settled fine shows as "✓ Paid" rather than disappearing;
   * the "amount currently due" callers keep the default (false).
   */
  includeSettled: boolean = false,
) {
  const maxEmiNo = emis.length > 0 ? Math.max(...emis.map(e => e.emi_no)) : 0;

  const result: Array<{
    emi_no: number; due_date: string; days: number;
    isLastEmi: boolean; isLastEmiUnpaid: boolean;
    baseFineTotal: number; weeklyFine: number; graceEnds: string;
    totalFine: number; paid: number; remaining: number;
  }> = [];

  for (const emi of emis) {
    if (emi.fine_waived) continue;

    // Collection-date gate: collected on/before the due date → no fine at all.
    if (isCollectedOnTime(emi)) continue;

    // Pending grace: while awaiting admin verdict, the stored fine is frozen.
    if (emi.status === 'PENDING_APPROVAL') {
      const stored = Number(emi.fine_amount || 0);
      const paid = Number(emi.fine_paid_amount || 0);
      const remaining = Math.max(0, stored - paid);
      if (remaining <= 0 && stored <= 0) continue;
      const dueP = new Date(emi.due_date);
      const todayP = new Date();
      todayP.setHours(0, 0, 0, 0);
      dueP.setHours(0, 0, 0, 0);
      const daysP = Math.max(0, Math.floor((todayP.getTime() - dueP.getTime()) / 86400000));
      const graceEndP = new Date(dueP);
      graceEndP.setDate(graceEndP.getDate() + GRACE);
      result.push({
        emi_no: emi.emi_no,
        due_date: emi.due_date,
        days: daysP,
        isLastEmi: emi.emi_no === maxEmiNo,
        isLastEmiUnpaid: false,
        baseFineTotal: stored,
        weeklyFine: 0,
        graceEnds: graceEndP.toISOString().split('T')[0],
        totalFine: stored,
        paid,
        remaining,
      });
      continue;
    }

    const isOverdueUnpaid = ['UNPAID', 'PARTIALLY_PAID'].includes(emi.status) && new Date(emi.due_date) < new Date();
    const stored = emi.fine_amount || 0;
    const paid = emi.fine_paid_amount || 0;
    const hasFineUnpaid = stored > 0 && paid < stored;
    const hasFinePaid = paid > 0;
    // Late-collected EMIs keep their fine even once APPROVED. In ledger mode we
    // additionally keep fines that are already settled (fine_paid_amount > 0) so
    // the statement can show them as "✓ Paid" instead of a blank dash.
    if (!isOverdueUnpaid && !hasFineUnpaid && !isCollectedLate(emi) && !(includeSettled && hasFinePaid)) continue;

    const due = new Date(emi.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const days = Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));

    const graceEnd = new Date(due);
    graceEnd.setDate(graceEnd.getDate() + GRACE);

    const isLast = emi.emi_no === maxEmiNo;
    const isLastEmiUnpaid = isLast && emi.status !== 'APPROVED';

    // A fine accrues only while it is still owed. This mirrors the server's
    // recalc_customer_fines, which stops recomputing a fine once it is paid in
    // full and freezes it at the stored amount. Without this guard the live
    // day-count would re-inflate a settled fine and wrongly resurrect a balance.
    //
    // In ledger mode we additionally freeze a FULLY-PAID fine even on a
    // late-collected EMI: its isCollectedLate flag would otherwise keep the fine
    // growing forever, so a fine the customer has cleared would never read
    // "✓ Paid" on the statement. (Default "amount due" mode is untouched, so the
    // live due total still matches the server.)
    const fineFullyPaid = paid > 0 && paid >= stored;
    const stillAccruing = !(includeSettled && fineFullyPaid)
      && (isOverdueUnpaid || isCollectedLate(emi) || stored > paid);
    const calc = stillAccruing
      ? calculateSingleEmiFine(emi.due_date, isLastEmiUnpaid, baseFine, weeklyIncrement)
      : 0;
    const effective = Math.max(calc, stored, paid);

    const baseFineTotal = !stillAccruing
      ? effective
      : isLastEmiUnpaid
        ? Math.ceil(Math.max(1, days) / GRACE) * baseFine
        : baseFine;
    const weeklyFine = (stillAccruing && !isLastEmiUnpaid && days > GRACE)
      ? Math.floor((days - GRACE) / 7) * weeklyIncrement
      : 0;

    result.push({
      emi_no: emi.emi_no,
      due_date: emi.due_date,
      days,
      isLastEmi: isLast,
      isLastEmiUnpaid,
      baseFineTotal,
      weeklyFine,
      graceEnds: graceEnd.toISOString().split('T')[0],
      totalFine: effective,
      paid,
      remaining: Math.max(0, effective - paid),
    });
  }
  return result;
}
