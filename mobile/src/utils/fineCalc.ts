import { EMIScheduleItem } from '../types';

const BASE = 450;
const WEEKLY = 25;
const GRACE = 30;

function dateOnly(value: string | Date): number {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Collection was initiated on or before the due date → fine permanently waived. */
export function isCollectedOnTime(emi: EMIScheduleItem): boolean {
  if (!emi.collection_requested_at) return false;
  return dateOnly(emi.collection_requested_at) <= dateOnly(emi.due_date);
}

/** Collection was initiated AFTER the due date → fine applies (and survives approval). */
function isCollectedLate(emi: EMIScheduleItem): boolean {
  if (!emi.collection_requested_at) return false;
  return dateOnly(emi.collection_requested_at) > dateOnly(emi.due_date);
}

/** Calculate fine for a single EMI position. */
export function calculateSingleEmiFine(
  dueDate: string,
  isLastEmiUnpaid: boolean = false,
  baseFine: number = BASE,
  weeklyIncrement: number = WEEKLY
): number {
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  if (today <= due) return 0;

  const days = Math.floor((today.getTime() - due.getTime()) / 86400000);
  if (days <= 0) return 0;

  if (isLastEmiUnpaid) {
    const blocks = Math.ceil(days / GRACE);
    return blocks * baseFine;
  }

  if (days <= GRACE) return baseFine;
  const weeks = Math.floor((days - GRACE) / 7);
  return baseFine + weeks * weeklyIncrement;
}

export function calculateTotalFineFromEmis(
  emis: EMIScheduleItem[],
  baseFine: number = BASE,
  weeklyIncrement: number = WEEKLY
): number {
  let total = 0;
  const maxEmiNo = emis.length > 0 ? Math.max(...emis.map(e => e.emi_no)) : 0;

  for (const emi of emis) {
    if (emi.fine_waived) continue;

    if (isCollectedOnTime(emi)) continue;

    if (emi.status === 'PENDING_APPROVAL') {
      const stored = Number(emi.fine_amount || 0);
      const paid = Number(emi.fine_paid_amount || 0);
      total += Math.max(0, stored - paid);
      continue;
    }

    const isOverdueUnpaid =
      ['UNPAID', 'PARTIALLY_PAID', 'overdue'].includes(emi.status) &&
      new Date(emi.due_date) < new Date();
    const hasFineUnpaid =
      (emi.fine_amount || 0) > 0 &&
      (emi.fine_paid_amount || 0) < (emi.fine_amount || 0);

    if (!isOverdueUnpaid && !hasFineUnpaid && !isCollectedLate(emi)) continue;

    const isLast = emi.emi_no === maxEmiNo;
    const isLastEmiUnpaid = isLast && emi.status !== 'APPROVED' && emi.status !== 'collected';

    const calc = calculateSingleEmiFine(emi.due_date, isLastEmiUnpaid, baseFine, weeklyIncrement);
    const effective = Math.max(calc, emi.fine_amount || 0);
    const paid = emi.fine_paid_amount || 0;
    total += Math.max(0, effective - paid);
  }
  return total;
}

export function getPerEmiFineBreakdown(
  emis: EMIScheduleItem[],
  baseFine: number = BASE,
  weeklyIncrement: number = WEEKLY,
  includeSettled: boolean = false
) {
  const maxEmiNo = emis.length > 0 ? Math.max(...emis.map(e => e.emi_no)) : 0;

  const result: Array<{
    emi_no: number;
    due_date: string;
    days: number;
    isLastEmi: boolean;
    isLastEmiUnpaid: boolean;
    baseFineTotal: number;
    weeklyFine: number;
    graceEnds: string;
    totalFine: number;
    paid: number;
    remaining: number;
  }> = [];

  for (const emi of emis) {
    if (emi.fine_waived) continue;

    if (isCollectedOnTime(emi)) continue;

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

    const isOverdueUnpaid =
      ['UNPAID', 'PARTIALLY_PAID', 'overdue'].includes(emi.status) &&
      new Date(emi.due_date) < new Date();
    const stored = emi.fine_amount || 0;
    const paid = emi.fine_paid_amount || 0;
    const hasFineUnpaid = stored > 0 && paid < stored;
    const hasFinePaid = paid > 0;

    if (!isOverdueUnpaid && !hasFineUnpaid && !isCollectedLate(emi) && !(includeSettled && hasFinePaid)) {
      continue;
    }

    const due = new Date(emi.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const days = Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));

    const graceEnd = new Date(due);
    graceEnd.setDate(graceEnd.getDate() + GRACE);

    const isLast = emi.emi_no === maxEmiNo;
    const isLastEmiUnpaid = isLast && emi.status !== 'APPROVED' && emi.status !== 'collected';

    const fineFullyPaid = paid > 0 && paid >= stored;
    const stillAccruing = !(includeSettled && fineFullyPaid) &&
      (isOverdueUnpaid || isCollectedLate(emi) || stored > paid);
    const calc = stillAccruing
      ? calculateSingleEmiFine(emi.due_date, isLastEmiUnpaid, baseFine, weeklyIncrement)
      : 0;
    const effective = Math.max(calc, stored, paid);

    const baseFineTotal = !stillAccruing
      ? effective
      : isLastEmiUnpaid
      ? Math.ceil(Math.max(1, days) / GRACE) * baseFine
      : baseFine;
    const weeklyFine =
      stillAccruing && !isLastEmiUnpaid && days > GRACE
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
