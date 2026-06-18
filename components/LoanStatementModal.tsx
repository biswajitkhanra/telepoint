'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/formatters';
import { getPerEmiFineBreakdown } from '@/lib/fineCalc';
import { buildLoanStatementHtml, ibbDirect, paymentMethod, paidOnDate } from '@/lib/loanStatementHtml';
import { downloadHtmlAsPdf } from '@/lib/pdf';

/**
 * Loan Statement — a formal, bank-style account statement for a single
 * customer loan, openable from the customer portal AND from the admin /
 * retailer customer detail view.
 *
 * Layout follows a classic bank statement: letterhead → account & borrower
 * details → account summary → instalment ledger with a running outstanding
 * balance → totals → computer-generated-statement footer. "Download PDF"
 * uses the browser print pipeline (Save as PDF); print CSS in globals.css
 * isolates the .statement-sheet so only the statement prints.
 */

const fmt = formatCurrency;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCustomer = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEmi = any;

export default function LoanStatementModal({
  customer, emis, baseFine, weeklyIncrement, onClose,
}: {
  customer: AnyCustomer;
  emis: AnyEmi[];
  baseFine?: number;
  weeklyIncrement?: number;
  onClose: () => void;
}) {
  // Portal target. The overlay is `position: fixed`, but when this modal is
  // mounted inside a transformed / `overflow-hidden` ancestor (e.g. the animated
  // `card-festive` panel in CustomerDetailPanel) that ancestor becomes the
  // containing block for fixed descendants and clips the overlay — the statement
  // then renders cramped *inside* the card and overlaps surrounding UI. Rendering
  // through a portal to <body> guarantees a full-viewport overlay everywhere.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [downloading, setDownloading] = useState(false);

  const sorted = useMemo(
    () => [...emis].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()),
    [emis],
  );

  const fineByEmi = useMemo(() => {
    const map = new Map<number, { total: number; paid: number; remaining: number }>();
    // includeSettled = true → the ledger also lists fines that are fully paid so
    // they render as "✓ Paid" instead of silently dropping to a blank "—".
    for (const r of getPerEmiFineBreakdown(sorted, baseFine, weeklyIncrement, true)) {
      map.set(r.emi_no, { total: r.totalFine, paid: r.paid, remaining: r.remaining });
    }
    return map;
  }, [sorted, baseFine, weeklyIncrement]);

  const emiPaidOf = (e: AnyEmi) =>
    e.status === 'APPROVED'
      ? Number(e.amount || 0)
      : Math.min(Number(e.amount || 0), Number(e.partial_paid_amount || 0));

  const totals = useMemo(() => {
    const emiContract = sorted.reduce((s, e) => s + Number(e.amount || 0), 0);
    const emiPaid = sorted.reduce((s, e) => s + emiPaidOf(e), 0);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, fineByEmi, customer]);

  const grandPaid = totals.emiPaid + totals.finePaid + totals.firstChargePaid;
  const grandRemaining = totals.emiRemaining + totals.fineRemaining + totals.firstChargeRemaining;
  const loanAmount = Math.max(0, Number(customer?.purchase_value || 0) - Number(customer?.down_payment || 0));
  const firstDue = sorted[0]?.due_date;
  const lastDue = sorted[sorted.length - 1]?.due_date;

  const safeName = String(customer?.customer_name || 'customer').replace(/[^\w]+/g, '-');

  /**
   * Download the statement as a REAL .pdf file. We render the purpose-built,
   * fixed-780px-wide statement document (buildLoanStatementHtml) off-screen and
   * rasterise THAT into a multi-page A4 PDF via lib/pdf.
   *
   * Why not capture the live modal panel: the panel is responsive, so on a phone
   * it is only ~412px wide and its ledger table overflows — capturing it there
   * produced a squashed statement blown up across several pages. The fixed-width
   * document renders identically on every device and paginates cleanly.
   *
   * If rasterising ever fails (e.g. a library load hiccup), we fall back to the
   * print-to-PDF pipeline on the same document so the statement is never lost.
   */
  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    const html = buildLoanStatementHtml({
      customer, sorted, fineByEmi, totals,
      grandPaid, grandRemaining, loanAmount, firstDue, lastDue, emiPaidOf,
    });
    try {
      await downloadHtmlAsPdf(html, `Loan-Statement-${safeName}.pdf`);
    } catch {
      printFallback(html);
    } finally {
      setDownloading(false);
    }
  };

  /** Fallback: open the self-contained statement in a new tab that self-prints
   *  (Save as PDF). Used only if client-side rasterisation is unavailable. */
  const printFallback = (html: string) => {
    const printable = html.replace(
      '</body>',
      '<script>(function(){function p(){try{window.focus();window.print();}catch(e){}}' +
      "window.addEventListener('load',function(){setTimeout(p,400);});})();</script></body>",
    );
    const url = URL.createObjectURL(new Blob([printable], { type: 'text/html' }));
    const win = window.open(url, '_blank');
    if (!win) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `Loan-Statement-${safeName}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  };

  const overlay = (
    <motion.div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-ink/50 p-0 backdrop-blur-md sm:items-center sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="statement-sheet relative max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-modal sm:max-w-3xl sm:rounded-3xl"
        initial={{ y: 40, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Letterhead ─────────────────────────────────────────────────── */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-4"
          style={{ background: 'linear-gradient(120deg, #0c4a6e, #1e40af 55%, #4c1d95)' }}
        >
          <div className="flex items-center gap-3 text-left">
            {/* Borrower photo — falls back to a monogram tile when absent or broken. */}
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/30 bg-white/10">
              <span className="absolute inset-0 flex items-center justify-center font-display text-2xl font-bold text-white/80">
                {customer?.customer_name?.[0]?.toUpperCase() ?? '?'}
              </span>
              {customer?.customer_photo_url && (
                <img
                  src={ibbDirect(customer.customer_photo_url)}
                  alt={customer?.customer_name || 'Customer'}
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/70">TelePoint EMI Finance</p>
              <h2 className="font-display text-lg font-bold text-white">Statement of Loan Account</h2>
              <p className="text-[10px] text-white/70">
                {firstDue && lastDue
                  ? `Period: ${format(new Date(firstDue), 'd MMM yyyy')} — ${format(new Date(lastDue), 'd MMM yyyy')}`
                  : 'Full account history'}
              </p>
            </div>
          </div>
          <div className="no-print flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-white/25 disabled:opacity-60"
            >
              {downloading ? '⏳ Preparing…' : '⬇ Download PDF'}
            </button>
            <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white hover:bg-white/25">
              ✕
            </button>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* ── Borrower & account details ─────────────────────────────────── */}
          <section className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-surface-4 bg-surface-2 p-4 text-sm sm:grid-cols-3">
            <Cell label="Account Holder" value={customer?.customer_name} />
            <Cell label="Loan A/C No." value={customer?.id ? String(customer.id).slice(0, 8).toUpperCase() : ''} mono />
            <Cell label="Mobile" value={customer?.mobile} mono />
            <Cell label="Device" value={customer?.model_no} />
            <Cell label="IMEI" value={customer?.imei} mono />
            <Cell label="Account Status" value={customer?.status} />
            <Cell label="Sanction Date" value={customer?.purchase_date ? format(new Date(customer.purchase_date), 'd MMM yyyy') : ''} />
            <Cell label="Asset Value" value={fmt(customer?.purchase_value || 0)} mono />
            <Cell label="Margin (Down Payment)" value={fmt(customer?.down_payment || 0)} mono />
            <Cell label="Loan Amount" value={fmt(loanAmount)} mono />
            <Cell label="Instalment (EMI)" value={fmt(customer?.emi_amount || 0)} mono />
            <Cell label="Tenure" value={customer?.emi_tenure ? `${customer.emi_tenure} months` : ''} />
          </section>

          {/* ── Account summary ───────────────────────────────────────────── */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryStat label="Total Billed" value={totals.emiContract + totals.fineAccrued + totals.firstChargeAmt} tone="indigo" />
            <SummaryStat label="Total Paid" value={grandPaid} tone="emerald" />
            <SummaryStat label="Outstanding" value={grandRemaining} tone="rose" />
            <SummaryStat label="EMIs Cleared" value={null} text={`${totals.paidCount} / ${sorted.length}`} tone="amber" />
          </section>

          {/* ── Instalment ledger ─────────────────────────────────────────── */}
          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-muted">Instalment Ledger</p>
            <div className="overflow-x-auto rounded-xl border border-surface-4">
              <table className="w-full min-w-[720px] text-xs">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="px-3 py-2 text-left font-semibold">#</th>
                    <th className="px-3 py-2 text-left font-semibold">Due Date</th>
                    <th className="px-3 py-2 text-right font-semibold">Instalment</th>
                    <th className="px-3 py-2 text-right font-semibold">Paid</th>
                    <th className="px-3 py-2 text-left font-semibold">Paid On</th>
                    <th className="px-3 py-2 text-left font-semibold">Method</th>
                    <th className="px-3 py-2 text-right font-semibold">Fine</th>
                    <th className="px-3 py-2 text-right font-semibold">Status</th>
                    <th className="px-3 py-2 text-right font-semibold">Balance O/S</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let running = totals.emiContract;
                    return sorted.map((e, i) => {
                      const fine = fineByEmi.get(e.emi_no);
                      const paidAmt = emiPaidOf(e);
                      running = Math.max(0, running - paidAmt);
                      const paid = e.status === 'APPROVED';
                      const partial = e.status === 'PARTIALLY_PAID';
                      const overdue = !paid && new Date(e.due_date) < new Date();
                      const hasPayment = paidAmt > 0;
                      const method = hasPayment ? paymentMethod(e) : '';
                      const paidOn = paidOnDate(e);
                      return (
                        <tr key={e.id} className={`border-t border-surface-3 ${i % 2 ? 'bg-surface-2/60' : 'bg-white'}`}>
                          <td className="px-3 py-2 font-semibold text-ink">{e.emi_no}</td>
                          <td className="px-3 py-2 text-ink-muted">{format(new Date(e.due_date), 'd MMM yy')}</td>
                          <td className="num px-3 py-2 text-right text-ink">{fmt(e.amount)}</td>
                          <td className="num px-3 py-2 text-right text-emerald-700">{paidAmt > 0 ? fmt(paidAmt) : '—'}</td>
                          <td className="px-3 py-2 text-ink-muted">{paidOn ? format(new Date(paidOn), 'd MMM yy') : '—'}</td>
                          <td className="px-3 py-2">
                            {method
                              ? <span className={`font-semibold ${method === 'UPI' ? 'text-emerald-700' : 'text-ink'}`}>
                                  {method === 'UPI' ? '🟢 UPI' : '💵 Cash'}
                                  {method === 'UPI' && e.utr ? <span className="num block text-[10px] font-normal text-ink-muted">UTR {e.utr}</span> : null}
                                </span>
                              : <span className="text-ink-muted">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {fine && fine.total > 0 ? (() => {
                              const fineMethod = fine.paid > 0 ? paymentMethod(e) : '';
                              const fineMethodTxt = fineMethod ? ` · ${fineMethod === 'UPI' ? '🟢 UPI' : '💵 Cash'}` : '';
                              return (
                                <div className="flex flex-col items-end leading-tight">
                                  <span className="num text-rose-600">{fmt(fine.total)}</span>
                                  {fine.remaining <= 0 ? (
                                    <span className="text-[10px] font-semibold text-emerald-600">✓ Paid{fineMethodTxt}</span>
                                  ) : fine.paid > 0 ? (
                                    <span className="text-[10px] font-semibold text-amber-600">
                                      ◐ <span className="num">{fmt(fine.paid)}</span> paid{fineMethodTxt}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-semibold text-rose-500">Unpaid</span>
                                  )}
                                </div>
                              );
                            })() : <span className="text-ink-muted">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className={
                              paid ? 'font-semibold text-emerald-600'
                                : partial ? 'font-semibold text-amber-600'
                                : overdue ? 'font-semibold text-rose-600'
                                : 'text-ink-muted'
                            }>
                              {paid ? '✓ Paid' : partial ? '◐ Partial' : overdue ? 'Overdue' : 'Upcoming'}
                            </span>
                          </td>
                          <td className="num px-3 py-2 text-right font-semibold text-ink">{fmt(running)}</td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-800 bg-surface-2 font-bold text-ink">
                    <td className="px-3 py-2" colSpan={2}>TOTAL</td>
                    <td className="num px-3 py-2 text-right">{fmt(totals.emiContract)}</td>
                    <td className="num px-3 py-2 text-right text-emerald-700">{fmt(totals.emiPaid)}</td>
                    <td className="px-3 py-2" colSpan={2} />
                    <td className="num px-3 py-2 text-right text-rose-600">{fmt(totals.fineAccrued)}</td>
                    <td className="px-3 py-2" />
                    <td className="num px-3 py-2 text-right">{fmt(totals.emiRemaining)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* ── Charge-wise breakup ───────────────────────────────────────── */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryCard title="EMI Principal" paid={totals.emiPaid} remaining={totals.emiRemaining} accent="emerald" />
            <SummaryCard title="Late Payment Fine" paid={totals.finePaid} remaining={totals.fineRemaining} accent="rose" />
            <SummaryCard title="1st EMI Charge" paid={totals.firstChargePaid} remaining={totals.firstChargeRemaining} accent="amber" />
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Total Amount Paid</p>
              <p className="num mt-1 text-2xl font-extrabold text-emerald-700">{fmt(grandPaid)}</p>
            </div>
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-rose-700">Total Outstanding</p>
              <p className="num mt-1 text-2xl font-extrabold text-rose-700">{fmt(grandRemaining)}</p>
            </div>
          </section>

          {/* ── Bank-statement footer ─────────────────────────────────────── */}
          <section className="border-t border-dashed border-surface-4 pt-4 text-[11px] text-ink-muted">
            <div className="flex items-end justify-between gap-4">
              <div className="space-y-1">
                <p>• Fines accrue on overdue instalments as per the late-payment policy in force.</p>
                <p>• Please retain this statement for your records. Errors, if any, must be reported within 15 days.</p>
                <p className="font-semibold text-ink">
                  This is a computer-generated statement and does not require a signature.
                </p>
              </div>
              <div className="shrink-0 text-center">
                <div className="mb-1 h-8 w-32 border-b border-surface-4" />
                <p className="text-[10px] uppercase tracking-wide">Authorised Signatory</p>
              </div>
            </div>
            <p className="mt-3 text-center">
              Generated on {format(new Date(), 'd MMM yyyy, h:mm a')} · TelePoint EMI Finance
            </p>
          </section>
        </div>
      </motion.div>
    </motion.div>
  );

  if (!mounted) return null;
  return createPortal(overlay, document.body);
}

function Cell({ label, value, mono }: { label: string; value: unknown; mono?: boolean }) {
  const display = value === 0 ? '0' : (value === null || value === undefined || value === '') ? '—' : String(value);
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={`font-semibold text-ink ${mono ? 'num' : ''}`}>{display}</p>
    </div>
  );
}

function SummaryStat({ label, value, text, tone }: {
  label: string; value: number | null; text?: string; tone: 'indigo' | 'emerald' | 'rose' | 'amber';
}) {
  const theme = {
    indigo: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700',
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
    rose: 'border-rose-500/30 bg-rose-500/10 text-rose-700',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-700',
  }[tone];
  return (
    <div className={`rounded-xl border p-3 ${theme}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">{label}</p>
      <p className="num mt-1 text-lg font-extrabold">{value !== null ? fmt(value) : text}</p>
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
