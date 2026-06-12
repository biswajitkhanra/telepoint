'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/formatters';
import { getPerEmiFineBreakdown } from '@/lib/fineCalc';

/**
 * Loan Statement — a full, printable account statement for a single customer
 * loan. Opened from a button on the customer portal; summarises the device,
 * financing, the complete EMI schedule (paid + outstanding), fines and the
 * running balance so the customer has a clear statement of their loan.
 */

const fmt = formatCurrency;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCustomer = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEmi = any;

export default function LoanStatementModal({
  customer, emis, onClose,
}: {
  customer: AnyCustomer;
  emis: AnyEmi[];
  onClose: () => void;
}) {
  const sorted = useMemo(
    () => [...emis].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()),
    [emis],
  );

  const fineByEmi = useMemo(() => {
    const map = new Map<number, { total: number; paid: number; remaining: number }>();
    for (const r of getPerEmiFineBreakdown(sorted)) {
      map.set(r.emi_no, { total: r.totalFine, paid: r.paid, remaining: r.remaining });
    }
    return map;
  }, [sorted]);

  const totals = useMemo(() => {
    const emiContract = sorted.reduce((s, e) => s + Number(e.amount || 0), 0);
    const emiPaid = sorted.reduce(
      (s, e) => s + Math.min(Number(e.amount || 0), Number(e.partial_paid_amount || (e.status === 'APPROVED' ? e.amount : 0) || 0)),
      0,
    );
    let fineAccrued = 0, finePaid = 0;
    for (const f of fineByEmi.values()) { fineAccrued += f.total; finePaid += f.paid; }
    const firstChargeAmt = Number(customer?.first_emi_charge_amount || 0);
    const firstChargePaid = customer?.first_emi_charge_paid_at ? firstChargeAmt : 0;
    return {
      emiContract,
      emiPaid,
      emiRemaining: Math.max(0, emiContract - emiPaid),
      fineAccrued,
      finePaid,
      fineRemaining: Math.max(0, fineAccrued - finePaid),
      firstChargeAmt,
      firstChargePaid,
      firstChargeRemaining: Math.max(0, firstChargeAmt - firstChargePaid),
      paidCount: sorted.filter((e) => e.status === 'APPROVED').length,
    };
  }, [sorted, fineByEmi, customer]);

  const grandPaid = totals.emiPaid + totals.finePaid + totals.firstChargePaid;
  const grandRemaining = totals.emiRemaining + totals.fineRemaining + totals.firstChargeRemaining;

  return (
    <motion.div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-ink/50 p-0 backdrop-blur-md sm:items-center sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="statement-sheet relative max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-modal sm:max-w-2xl sm:rounded-3xl"
        initial={{ y: 40, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4"
          style={{ background: 'linear-gradient(120deg, #1e1b4b, #4c1d95 55%, #831843)' }}
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/60">TelePoint</p>
            <h2 className="font-display text-lg font-bold text-white">Loan Statement</h2>
          </div>
          <div className="no-print flex items-center gap-2">
            <button onClick={() => window.print()} className="rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-white/25">
              🖨 Print
            </button>
            <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white hover:bg-white/25">
              ✕
            </button>
          </div>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* Customer / device */}
          <section className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Cell label="Customer" value={customer?.customer_name} />
            <Cell label="Mobile" value={customer?.mobile} mono />
            <Cell label="IMEI" value={customer?.imei} mono />
            <Cell label="Device" value={customer?.model_no} />
            <Cell label="Status" value={customer?.status} />
            <Cell label="Purchase Date" value={customer?.purchase_date ? format(new Date(customer.purchase_date), 'd MMM yyyy') : ''} />
            <Cell label="Purchase Value" value={fmt(customer?.purchase_value || 0)} mono />
            <Cell label="Down Payment" value={fmt(customer?.down_payment || 0)} mono />
            {customer?.disburse_amount != null && <Cell label="Financed" value={fmt(customer.disburse_amount)} mono />}
            <Cell label="Monthly EMI" value={fmt(customer?.emi_amount || 0)} mono />
          </section>

          {/* EMI schedule */}
          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-muted">EMI Schedule</p>
            <div className="overflow-hidden rounded-xl border border-surface-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface-2 text-ink-muted">
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Due Date</th>
                    <th className="px-3 py-2 text-right">EMI</th>
                    <th className="px-3 py-2 text-right">Fine</th>
                    <th className="px-3 py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((e) => {
                    const fine = fineByEmi.get(e.emi_no);
                    const paid = e.status === 'APPROVED';
                    const partial = e.status === 'PARTIALLY_PAID';
                    return (
                      <tr key={e.id} className="border-t border-surface-3">
                        <td className="px-3 py-2 font-semibold text-ink">{e.emi_no}</td>
                        <td className="px-3 py-2 text-ink-muted">{format(new Date(e.due_date), 'd MMM yy')}</td>
                        <td className="px-3 py-2 text-right num text-ink">{fmt(e.amount)}</td>
                        <td className="px-3 py-2 text-right num text-rose-600">{fine && fine.total > 0 ? fmt(fine.total) : '—'}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={
                            paid ? 'text-emerald-600 font-semibold'
                              : partial ? 'text-amber-600 font-semibold'
                              : new Date(e.due_date) < new Date() ? 'text-rose-600 font-semibold'
                              : 'text-ink-muted'
                          }>
                            {paid ? '✓ Paid' : partial ? '◐ Partial' : new Date(e.due_date) < new Date() ? 'Overdue' : 'Upcoming'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Totals */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryCard title="EMI" paid={totals.emiPaid} remaining={totals.emiRemaining} accent="emerald" />
            <SummaryCard title="Fine" paid={totals.finePaid} remaining={totals.fineRemaining} accent="rose" />
            <SummaryCard title="1st EMI Charge" paid={totals.firstChargePaid} remaining={totals.firstChargeRemaining} accent="amber" />
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Total Paid</p>
              <p className="num mt-1 text-2xl font-extrabold text-emerald-700">{fmt(grandPaid)}</p>
            </div>
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-rose-700">Total Outstanding</p>
              <p className="num mt-1 text-2xl font-extrabold text-rose-700">{fmt(grandRemaining)}</p>
            </div>
          </section>

          <p className="text-center text-[11px] text-ink-muted">
            {totals.paidCount} of {sorted.length} EMIs paid · Generated {format(new Date(), 'd MMM yyyy, h:mm a')}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Cell({ label, value, mono }: { label: string; value: unknown; mono?: boolean }) {
  const display = value === 0 ? '0' : (value === null || value === undefined || value === '') ? '—' : String(value);
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={`text-ink ${mono ? 'num' : ''}`}>{display}</p>
    </div>
  );
}

function SummaryCard({ title, paid, remaining, accent }: { title: string; paid: number; remaining: number; accent: 'emerald' | 'rose' | 'amber' }) {
  const theme = {
    emerald: 'border-emerald-500/30 bg-emerald-500/5',
    rose: 'border-rose-500/30 bg-rose-500/5',
    amber: 'border-amber-500/30 bg-amber-500/5',
  }[accent];
  return (
    <div className={`rounded-xl border p-3 ${theme}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">{title}</p>
      <div className="mt-2 space-y-1 text-xs">
        <div className="flex justify-between"><span className="text-ink-muted">Paid</span><span className="num text-emerald-700">{fmt(paid)}</span></div>
        <div className="flex justify-between"><span className="text-ink-muted">Remaining</span><span className="num text-rose-700">{fmt(remaining)}</span></div>
      </div>
    </div>
  );
}
