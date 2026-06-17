import { format } from 'date-fns';
import { formatCurrency } from '@/lib/formatters';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCustomer = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEmi = any;

const fmt = formatCurrency;

/** Resolve an ImgBB share link to a direct image URL (mirrors the portal helper). */
export function ibbDirect(url?: string | null): string {
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
export function paymentMethod(e: AnyEmi): string {
  const m = e.mode || (e.utr ? 'UPI' : 'CASH');
  return String(m).toUpperCase();
}

export interface FineRow { total: number; paid: number; remaining: number }

export interface StatementTotals {
  emiContract: number;
  emiPaid: number;
  emiRemaining: number;
  fineAccrued: number;
  finePaid: number;
  fineRemaining: number;
  firstChargeAmt: number;
  firstChargePaid: number;
  firstChargeRemaining: number;
  paidCount: number;
}

export interface BuildStatementArgs {
  customer: AnyCustomer;
  sorted: AnyEmi[];
  fineByEmi: Map<number, FineRow>;
  totals: StatementTotals;
  grandPaid: number;
  grandRemaining: number;
  loanAmount: number;
  firstDue?: string;
  lastDue?: string;
  emiPaidOf: (e: AnyEmi) => number;
}

/**
 * Build a fully self-contained, white-background HTML document for the loan
 * statement. Kept as a PURE function (no DOM / React) so it can be unit-tested
 * and reused by the print pipeline. Everything is inline-styled so the printed
 * PDF renders with exact colours regardless of the app's (dark) theme.
 */
export function buildLoanStatementHtml(args: BuildStatementArgs): string {
  const {
    customer, sorted, fineByEmi, totals,
    grandPaid, grandRemaining, loanAmount, firstDue, lastDue, emiPaidOf,
  } = args;

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
    // Fine cell shows the amount AND whether it has been paid (and how). A
    // fine is collected with its EMI payment, so the method mirrors the EMI's.
    const fineMethod = fine && fine.paid > 0 ? paymentMethod(e) : '';
    const fineMethodTxt = fineMethod ? (fineMethod === 'UPI' ? '🟢 UPI' : '💵 Cash') : '';
    const fineCell = !fine || fine.total <= 0
      ? '—'
      : `<div style="color:#e11d48">${esc(fmt(fine.total))}</div>` +
        (fine.remaining <= 0
          ? `<div style="font-size:9px;color:#059669;font-weight:600">✓ Paid${fineMethodTxt ? ` · ${fineMethodTxt}` : ''}</div>`
          : fine.paid > 0
            ? `<div style="font-size:9px;color:#d97706;font-weight:600">◐ ${esc(fmt(fine.paid))} paid${fineMethodTxt ? ` · ${fineMethodTxt}` : ''}</div>`
            : `<div style="font-size:9px;color:#e11d48;font-weight:600">Unpaid</div>`);
    const statusTxt = paid ? '✓ Paid' : partial ? '◐ Partial' : overdue ? 'Overdue' : 'Upcoming';
    const statusColor = paid ? '#059669' : partial ? '#d97706' : overdue ? '#e11d48' : '#64748b';
    return `<tr>
      <td style="padding:6px 10px;border-top:1px solid #e2e8f0;font-weight:600">${esc(e.emi_no)}</td>
      <td style="padding:6px 10px;border-top:1px solid #e2e8f0;color:#475569">${format(new Date(e.due_date), 'd MMM yy')}</td>
      <td style="padding:6px 10px;border-top:1px solid #e2e8f0;text-align:right;font-variant-numeric:tabular-nums">${esc(fmt(e.amount))}</td>
      <td style="padding:6px 10px;border-top:1px solid #e2e8f0;text-align:right;color:#047857;font-variant-numeric:tabular-nums">${paidAmt > 0 ? esc(fmt(paidAmt)) : '—'}</td>
      <td style="padding:6px 10px;border-top:1px solid #e2e8f0;color:#475569">${e.paid_at ? format(new Date(e.paid_at), 'd MMM yy') : '—'}</td>
      <td style="padding:6px 10px;border-top:1px solid #e2e8f0;font-weight:600">${methodCell}</td>
      <td style="padding:6px 10px;border-top:1px solid #e2e8f0;text-align:right;font-variant-numeric:tabular-nums">${fineCell}</td>
      <td style="padding:6px 10px;border-top:1px solid #e2e8f0;text-align:right;font-weight:600;color:${statusColor}">${statusTxt}</td>
      <td style="padding:6px 10px;border-top:1px solid #e2e8f0;text-align:right;font-weight:600;font-variant-numeric:tabular-nums">${esc(fmt(running))}</td>
    </tr>`;
  }).join('');

  const detail = (label: string, value: unknown) =>
    `<div><div style="font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#64748b">${label}</div><div style="font-weight:600;color:#0f172a">${esc(value)}</div></div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Loan Statement — ${esc(customer?.customer_name)}</title>
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
}
