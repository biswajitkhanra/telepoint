'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/formatters';
import { getPerEmiFineBreakdown } from '@/lib/fineCalc';

/** Resolve an ImgBB share link to a direct image URL (mirrors the portal helper). */
function ibbDirect(url?: string | null): string {
  if (!url) return '';
  if (/i\.ibb\.co|\.jpg|\.jpeg|\.png|\.webp/i.test(url)) return url;
  if (url.includes('ibb.co/')) {
    const id = url.split('ibb.co/')[1]?.split('/')[0];
    if (id) return `https://i.ibb.co/${id}/img.jpg`;
  }
  return url;
}

/** The payment method for a settled/partial EMI. `mode` is authoritative;
 * when missing we derive it (a UTR implies UPI, otherwise Cash). */
function paymentMethod(e: AnyEmi): string {
  const m = e.mode || (e.utr ? 'UPI' : 'CASH');
  return String(m).toUpperCase();
}

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

  const sorted = useMemo(
    () => [...emis].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()),
    [emis],
  );

  const fineByEmi = useMemo(() => {
    const map = new Map<number, { total: number; paid: number; remaining: number }>();
    for (const r of getPerEmiFineBreakdown(sorted, baseFine, weeklyIncrement)) {
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

  /**
   * Build a fully self-contained statement document and print it from a
   * hidden iframe. We deliberately do NOT print the on-screen modal: the app
   * runs on a dark theme (and inside a WebView on the customer app), and
   * printing the live DOM produced an all-black page. A standalone white
   * document with inline styles guarantees an exact-colour PDF — letterhead,
   * table bands, status chips and the borrower photo — everywhere.
   */
  const handleDownload = () => {
    const esc = (v: unknown) =>
      v === 0 ? '0' : (v === null || v === undefined || v === '')
        ? '—'
        : String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

    const photo = ibbDirect(customer?.customer_photo_url);
    const periodTxt = firstDue && lastDue
      ? `Period: ${format(new Date(firstDue), 'd MMM yyyy')} — ${format(new Date(lastDue), 'd MMM yyyy')}`
      : 'Full account history';

    let running = totals.emiContract;
    const rows = sorted.map((e) => {
      const fine = fineByEmi.get(e.emi_no);
      const paidAmt = emiPaidOf(e);
      running = Math.max(0, running - paidAmt);
      const paid = e.status === 'APPROVED';
      const partial = e.status === 'PARTIALLY_PAID';
      const overdue = !paid && new Date(e.due_date) < new Date();
      const method = paidAmt > 0 ? paymentMethod(e) : '';
      const methodCell = method
        ? `${method === 'UPI' ? '🟢 UPI' : '💵 Cash'}${method === 'UPI' && e.utr ? `<div style="font-size:9px;color:#64748b">UTR ${esc(e.utr)}</div>` : ''}`
        : '—';
      const statusTxt = paid ? '✓ Paid' : partial ? '◐ Partial' : overdue ? 'Overdue' : 'Upcoming';
      const statusColor = paid ? '#059669' : partial ? '#d97706' : overdue ? '#e11d48' : '#64748b';
      return `<tr>
        <td style="padding:6px 10px;border-top:1px solid #e2e8f0;font-weight:600">${esc(e.emi_no)}</td>
        <td style="padding:6px 10px;border-top:1px solid #e2e8f0;color:#475569">${format(new Date(e.due_date), 'd MMM yy')}</td>
        <td style="padding:6px 10px;border-top:1px solid #e2e8f0;text-align:right;font-variant-numeric:tabular-nums">${esc(fmt(e.amount))}</td>
        <td style="padding:6px 10px;border-top:1px solid #e2e8f0;text-align:right;color:#047857;font-variant-numeric:tabular-nums">${paidAmt > 0 ? esc(fmt(paidAmt)) : '—'}</td>
        <td style="padding:6px 10px;border-top:1px solid #e2e8f0;color:#475569">${e.paid_at ? format(new Date(e.paid_at), 'd MMM yy') : '—'}</td>
        <td style="padding:6px 10px;border-top:1px solid #e2e8f0;font-weight:600">${methodCell}</td>
        <td style="padding:6px 10px;border-top:1px solid #e2e8f0;text-align:right;color:#e11d48;font-variant-numeric:tabular-nums">${fine && fine.total > 0 ? esc(fmt(fine.total)) : '—'}</td>
        <td style="padding:6px 10px;border-top:1px solid #e2e8f0;text-align:right;font-weight:600;color:${statusColor}">${statusTxt}</td>
        <td style="padding:6px 10px;border-top:1px solid #e2e8f0;text-align:right;font-weight:600;font-variant-numeric:tabular-nums">${esc(fmt(running))}</td>
      </tr>`;
    }).join('');

    const detail = (label: string, value: unknown) =>
      `<div><div style="font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#64748b">${label}</div><div style="font-weight:600;color:#0f172a">${esc(value)}</div></div>`;

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Loan Statement — ${esc(customer?.customer_name)}</title>
<style>
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html,body{margin:0;padding:0;background:#fff;color:#0f172a;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  @page{size:A4;margin:10mm}
  .wrap{max-width:780px;margin:0 auto}
  table{border-collapse:collapse;width:100%}
  thead tr{background:#1e293b;color:#fff}
  th{padding:7px 10px;font-size:10px;font-weight:600}
  td,th{font-size:11px}
  tr{break-inside:avoid}
  .card{border:1px solid #e2e8f0;border-radius:10px;padding:12px}
</style></head>
<body><div class="wrap">
  <div style="display:flex;align-items:center;gap:14px;background:linear-gradient(120deg,#0c4a6e,#1e40af 55%,#4c1d95);padding:18px 22px;border-radius:12px;color:#fff">
    <div style="width:58px;height:58px;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;flex:0 0 auto">
      ${photo ? `<img src="${esc(photo)}" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">` : esc(customer?.customer_name?.[0]?.toUpperCase() || '?')}
    </div>
    <div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.28em;opacity:.75">TelePoint EMI Finance</div>
      <div style="font-size:19px;font-weight:700">Statement of Loan Account</div>
      <div style="font-size:10px;opacity:.75">${esc(periodTxt)}</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px 18px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:10px;padding:14px;margin-top:16px">
    ${detail('Account Holder', customer?.customer_name)}
    ${detail('Loan A/C No.', customer?.id ? String(customer.id).slice(0, 8).toUpperCase() : '')}
    ${detail('Mobile', customer?.mobile)}
    ${detail('Device', customer?.model_no)}
    ${detail('IMEI', customer?.imei)}
    ${detail('Account Status', customer?.status)}
    ${detail('Sanction Date', customer?.purchase_date ? format(new Date(customer.purchase_date), 'd MMM yyyy') : '')}
    ${detail('Asset Value', fmt(customer?.purchase_value || 0))}
    ${detail('Margin (Down Payment)', fmt(customer?.down_payment || 0))}
    ${detail('Loan Amount', fmt(loanAmount))}
    ${detail('Instalment (EMI)', fmt(customer?.emi_amount || 0))}
    ${detail('Tenure', customer?.emi_tenure ? `${customer.emi_tenure} months` : '')}
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px">
    <div class="card" style="background:#eef2ff;border-color:#c7d2fe"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#4338ca">Total Billed</div><div style="font-size:16px;font-weight:800;color:#4338ca">${esc(fmt(totals.emiContract + totals.fineAccrued + totals.firstChargeAmt))}</div></div>
    <div class="card" style="background:#ecfdf5;border-color:#a7f3d0"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#047857">Total Paid</div><div style="font-size:16px;font-weight:800;color:#047857">${esc(fmt(grandPaid))}</div></div>
    <div class="card" style="background:#fff1f2;border-color:#fecdd3"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#be123c">Outstanding</div><div style="font-size:16px;font-weight:800;color:#be123c">${esc(fmt(grandRemaining))}</div></div>
    <div class="card" style="background:#fffbeb;border-color:#fde68a"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#b45309">EMIs Cleared</div><div style="font-size:16px;font-weight:800;color:#b45309">${totals.paidCount} / ${sorted.length}</div></div>
  </div>

  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#64748b;margin:18px 0 6px">Instalment Ledger</div>
  <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
    <table>
      <thead><tr>
        <th style="text-align:left">#</th><th style="text-align:left">Due Date</th>
        <th style="text-align:right">Instalment</th><th style="text-align:right">Paid</th>
        <th style="text-align:left">Paid On</th><th style="text-align:left">Method</th>
        <th style="text-align:right">Fine</th><th style="text-align:right">Status</th><th style="text-align:right">Balance O/S</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr style="background:#f1f5f9;font-weight:700;border-top:2px solid #1e293b">
        <td colspan="2" style="padding:7px 10px">TOTAL</td>
        <td style="padding:7px 10px;text-align:right">${esc(fmt(totals.emiContract))}</td>
        <td style="padding:7px 10px;text-align:right;color:#047857">${esc(fmt(totals.emiPaid))}</td>
        <td colspan="2"></td>
        <td style="padding:7px 10px;text-align:right;color:#e11d48">${esc(fmt(totals.fineAccrued))}</td>
        <td></td>
        <td style="padding:7px 10px;text-align:right">${esc(fmt(totals.emiRemaining))}</td>
      </tr></tfoot>
    </table>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
    <div class="card" style="background:#ecfdf5;border-color:#6ee7b7"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#047857">Total Amount Paid</div><div style="font-size:22px;font-weight:800;color:#047857">${esc(fmt(grandPaid))}</div></div>
    <div class="card" style="background:#fff1f2;border-color:#fda4af"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#be123c">Total Outstanding</div><div style="font-size:22px;font-weight:800;color:#be123c">${esc(fmt(grandRemaining))}</div></div>
  </div>

  <div style="border-top:1px dashed #cbd5e1;margin-top:18px;padding-top:12px;font-size:10px;color:#64748b">
    <p style="margin:2px 0">• Fines accrue on overdue instalments as per the late-payment policy in force.</p>
    <p style="margin:2px 0">• Please retain this statement for your records. Errors, if any, must be reported within 15 days.</p>
    <p style="margin:2px 0;font-weight:600;color:#0f172a">This is a computer-generated statement and does not require a signature.</p>
    <p style="text-align:center;margin-top:10px">Generated on ${format(new Date(), 'd MMM yyyy, h:mm a')} · TelePoint EMI Finance</p>
  </div>
</div></body></html>`;

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    // Off-screen but FULLY rendered. Do NOT use display:none, visibility:hidden,
    // zero size or opacity:0 — any of those give the print engine no render tree
    // and the PDF comes out as blank white pages (the bug seen on Android).
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;background:#fff;';
    document.body.appendChild(iframe);

    const cleanup = () => { setTimeout(() => iframe.remove(), 1000); };
    const doPrint = () => {
      const win = iframe.contentWindow;
      if (!win) { cleanup(); return; }
      try {
        win.focus();
        win.print();
      } catch { /* ignore — some WebViews defer to the host print dialog */ }
      cleanup();
    };

    const doc = iframe.contentWindow?.document;
    if (!doc) { iframe.remove(); return; }
    doc.open();
    doc.write(html);
    doc.close();

    // Wait for the borrower photo (cross-origin) before printing; fall back on a timer.
    const img = doc.querySelector('img');
    if (img && photo && !img.complete) {
      let done = false;
      const fire = () => { if (!done) { done = true; doPrint(); } };
      img.addEventListener('load', fire);
      img.addEventListener('error', fire);
      setTimeout(fire, 2500);
    } else {
      setTimeout(doPrint, 250);
    }
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
              className="rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-white/25"
            >
              ⬇ Download PDF
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
                      return (
                        <tr key={e.id} className={`border-t border-surface-3 ${i % 2 ? 'bg-surface-2/60' : 'bg-white'}`}>
                          <td className="px-3 py-2 font-semibold text-ink">{e.emi_no}</td>
                          <td className="px-3 py-2 text-ink-muted">{format(new Date(e.due_date), 'd MMM yy')}</td>
                          <td className="num px-3 py-2 text-right text-ink">{fmt(e.amount)}</td>
                          <td className="num px-3 py-2 text-right text-emerald-700">{paidAmt > 0 ? fmt(paidAmt) : '—'}</td>
                          <td className="px-3 py-2 text-ink-muted">{e.paid_at ? format(new Date(e.paid_at), 'd MMM yy') : '—'}</td>
                          <td className="px-3 py-2">
                            {method
                              ? <span className={`font-semibold ${method === 'UPI' ? 'text-emerald-700' : 'text-ink'}`}>
                                  {method === 'UPI' ? '🟢 UPI' : '💵 Cash'}
                                  {method === 'UPI' && e.utr ? <span className="num block text-[10px] font-normal text-ink-muted">UTR {e.utr}</span> : null}
                                </span>
                              : <span className="text-ink-muted">—</span>}
                          </td>
                          <td className="num px-3 py-2 text-right text-rose-600">{fine && fine.total > 0 ? fmt(fine.total) : '—'}</td>
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
