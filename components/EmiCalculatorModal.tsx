'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { formatCurrency } from '@/lib/formatters';
import { backdrop, modalPanel } from '@/lib/motion';
import type { FormData as CustomerFormData } from '@/components/CustomerFormModal';

// ── EMI Calculator (ECAL) ─────────────────────────────────────────────────────
// Super-admin-only planning tool. It REUSES the retailer EMI calculation engine
// (identical formulas to the standalone Yogi Finance calculator) and only wraps
// it in a cleaner UI plus a one-click "Create Customer" hand-off that prefills
// the New Customer form. The calculation math below is intentionally unchanged.

const fmt = formatCurrency;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PROCESSING_FEES = [800, 900, 1000, 1100, 1200, 1300, 1400, 1500];

function ordinal(i: number): string {
  const j = i % 10, k = i % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}

// Single source of truth for the EMI math — identical to the existing engine.
function computeEmi(loanValue: number, interest: number, proc: number, cibil: number, months: number) {
  const totalInt = loanValue * (interest / 12) * months;
  const totalPay = loanValue + totalInt + proc - cibil;
  const emi = Math.round((totalPay / months) / 10) * 10; // round to nearest ₹10
  const extra = emi * months - loanValue;
  return { emi, extra };
}

interface Props {
  onClose: () => void;
  /** Hands the calculated plan to the New Customer workflow (auto-create). */
  onCreateCustomer: (prefill: Partial<Record<keyof CustomerFormData, string>>) => void;
}

export default function EmiCalculatorModal({ onClose, onCreateCustomer }: Props) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const [deviceName, setDeviceName] = useState('');
  const [purchaseValue, setPurchaseValue] = useState('');
  const [downPayment, setDownPayment] = useState('');
  const [emiStartDate, setEmiStartDate] = useState(todayStr);
  const [interestRate, setInterestRate] = useState('40');
  const [customerType, setCustomerType] = useState<'new' | 'existing'>('new');
  const [processingFee, setProcessingFee] = useState('1000');
  const [firstEmiCharge, setFirstEmiCharge] = useState('');
  const [maxDuration, setMaxDuration] = useState('6');
  const [planDuration, setPlanDuration] = useState('6');
  const [showResults, setShowResults] = useState(false);

  const purchase = parseFloat(purchaseValue) || 0;
  const down = parseFloat(downPayment) || 0;
  const loanValue = Math.max(0, purchase - down);
  const interest = (parseFloat(interestRate) || 0) / 100;
  const proc = parseFloat(processingFee) || 0;
  const cibil = parseFloat(firstEmiCharge) || 0;
  const maxD = parseInt(maxDuration) || 6;
  const planD = parseInt(planDuration) || 6;

  const startDate = useMemo(() => {
    const [y, m, d] = emiStartDate.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }, [emiStartDate]);

  // Loan options table (1 → maxD months).
  const options = useMemo(() => {
    const out: { d: number; emi: number; extra: number; endStr: string; firstEmi: number }[] = [];
    for (let d = 1; d <= maxD; d++) {
      const { emi, extra } = computeEmi(loanValue, interest, proc, cibil, d);
      const end = new Date(startDate);
      end.setMonth(end.getMonth() + d - 1);
      const endStr = `${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
      out.push({ d, emi, extra, endStr, firstEmi: emi + cibil });
    }
    return out;
  }, [loanValue, interest, proc, cibil, maxD, startDate]);

  // Selected plan for the detailed breakdown + Create Customer hand-off.
  const plan = useMemo(() => computeEmi(loanValue, interest, proc, cibil, planD), [loanValue, interest, proc, cibil, planD]);

  const breakdown = useMemo(() => {
    const rows: { label: string; amount: number; due: string }[] = [];
    for (let i = 0; i < planD; i++) {
      const emiDate = new Date(startDate);
      emiDate.setMonth(emiDate.getMonth() + i);
      const due = `${emiDate.getDate()} ${MONTHS[emiDate.getMonth()]} ${emiDate.getFullYear()}`;
      const isFirst = i === 0 && cibil > 0;
      rows.push({
        label: `${i + 1}${ordinal(i + 1)} EMI${isFirst ? ' + 1st Charge' : ''}`,
        amount: plan.emi + (isFirst ? cibil : 0),
        due,
      });
    }
    return rows;
  }, [planD, startDate, plan.emi, cibil]);

  function handleCalculate() {
    if (!purchase || purchase <= 0) { alert('Enter a valid Purchase Value'); return; }
    if (down > purchase) { alert('Down Payment cannot exceed Purchase Value'); return; }
    if (!emiStartDate) { alert('Select an EMI Start Date'); return; }
    // Keep the detailed plan within the shown range.
    if (planD > maxD) setPlanDuration(String(maxD));
    setShowResults(true);
  }

  // Build the New Customer prefill from the selected plan. Maps ECAL fields onto
  // the customer schema; the additional "1st EMI Charge" is the CIBIL charge.
  function handleCreateCustomer() {
    const dueDay = startDate.getDate();
    const monthStart = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-01`;
    onCreateCustomer({
      model_no: deviceName,
      purchase_value: purchase ? String(purchase) : '',
      down_payment: String(down),
      disburse_amount: loanValue ? String(loanValue) : '',
      emi_amount: plan.emi ? String(plan.emi) : '',
      emi_tenure: String(planD),
      emi_due_day: String(Math.min(30, Math.max(1, dueDay))),
      emi_start_date: monthStart,
      first_emi_charge_amount: cibil ? String(cibil) : '0',
      purchase_date: todayStr,
    });
  }

  return (
    <motion.div
      className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}
      variants={backdrop} initial="hidden" animate="show" exit="exit"
    >
      <motion.div
        className="card w-full max-w-3xl max-h-[94vh] flex flex-col shadow-modal overflow-hidden"
        variants={modalPanel} initial="hidden" animate="show" exit="exit"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧮</span>
            <div>
              <h2 className="font-display text-xl font-bold leading-tight">EMI Calculator</h2>
              <p className="text-xs text-white/80 mt-0.5">ECAL · plan an EMI &amp; auto-create the customer</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon bg-white/15 hover:bg-white/25 text-white" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Inputs */}
          <section>
            <p className="form-section">Device &amp; Loan</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">Device Name</label>
                <input className="input" value={deviceName} onChange={e => setDeviceName(e.target.value)} placeholder="e.g. Redmi Note 13" />
              </div>
              <div>
                <label className="label">Purchase Value (MOP) ₹</label>
                <input type="number" inputMode="numeric" className="input" value={purchaseValue} onChange={e => setPurchaseValue(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="label">Down Payment ₹</label>
                <input type="number" inputMode="numeric" className="input" value={downPayment} onChange={e => setDownPayment(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="label">EMI Start Date</label>
                <input type="date" className="input" value={emiStartDate} onChange={e => setEmiStartDate(e.target.value)} />
              </div>
              <div>
                <label className="label">Loan Amount ₹</label>
                <input className="input bg-surface-2 font-semibold" value={loanValue ? loanValue.toLocaleString('en-IN') : ''} readOnly placeholder="Auto" />
              </div>
            </div>
          </section>

          <section>
            <p className="form-section">Charges &amp; Terms</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Interest Rate</label>
                <select className="input" value={interestRate} onChange={e => setInterestRate(e.target.value)}>
                  <option value="40">40%</option>
                  <option value="30">30%</option>
                  <option value="20">20%</option>
                </select>
              </div>
              <div>
                <label className="label">Customer Type</label>
                <select className="input" value={customerType} onChange={e => setCustomerType(e.target.value as 'new' | 'existing')}>
                  <option value="new">NEW CUSTOMER</option>
                  <option value="existing">EXISTING CUSTOMER</option>
                </select>
              </div>
              <div>
                <label className="label">Processing Fee ₹</label>
                <select className="input" value={processingFee} onChange={e => setProcessingFee(e.target.value)}>
                  {PROCESSING_FEES.map(f => <option key={f} value={f}>₹{f}</option>)}
                </select>
              </div>
              <div>
                <label className="label">1st EMI Charge ₹ <span className="text-ink-muted font-normal normal-case">(optional)</span></label>
                <input type="number" inputMode="numeric" className="input" value={firstEmiCharge} onChange={e => setFirstEmiCharge(e.target.value)} placeholder="0 if none" />
              </div>
              <div>
                <label className="label">Show EMI up to (Months)</label>
                <select className="input" value={maxDuration} onChange={e => setMaxDuration(e.target.value)}>
                  {[3, 6, 9, 12].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Detailed plan for (Month)</label>
                <select className="input" value={planDuration} onChange={e => setPlanDuration(e.target.value)}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          </section>

          <button onClick={handleCalculate} className="btn-primary w-full">Calculate EMI</button>

          {/* Results */}
          {showResults && (
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }} className="space-y-6"
            >
              {/* Summary */}
              <div className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <Info label="Device" value={deviceName || '—'} />
                  <Info label="Purchase" value={fmt(purchase)} />
                  <Info label="Down Payment" value={fmt(down)} />
                  <Info label="Loan Amount" value={fmt(loanValue)} />
                  <Info label="Processing Fee" value={fmt(proc)} />
                  <Info label="1st EMI Charge" value={fmt(cibil)} />
                </div>
              </div>

              {/* Selected plan breakdown */}
              <div>
                <p className="form-section">EMI Breakdown · {planD} {planD === 1 ? 'month' : 'months'}</p>
                <div className="rounded-2xl border border-surface-4 divide-y divide-surface-4 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-brand-600 text-white">
                    <span className="font-semibold">Monthly EMI</span>
                    <span className="num text-lg font-bold">{fmt(plan.emi)}</span>
                  </div>
                  {breakdown.map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="text-ink font-medium">{r.label}</span>
                      <span className="text-right">
                        <span className="num font-semibold text-ink">{fmt(r.amount)}</span>
                        <span className="block text-[11px] text-ink-muted">Due {r.due}</span>
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-4 py-2.5 text-sm bg-surface-2">
                    <span className="text-ink-muted">Extra (interest + fees)</span>
                    <span className="num font-semibold text-warning">{fmt(plan.extra)}</span>
                  </div>
                </div>
              </div>

              {/* All options */}
              <div>
                <p className="form-section">Loan Options</p>
                <div className="overflow-x-auto rounded-2xl border border-surface-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-brand-600 text-white">
                        <th className="px-3 py-2.5 text-left font-semibold">Months</th>
                        <th className="px-3 py-2.5 text-left font-semibold">Final EMI</th>
                        <th className="px-3 py-2.5 text-right font-semibold">EMI</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Extra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {options.map(o => {
                        const active = o.d === planD;
                        return (
                          <tr
                            key={o.d}
                            onClick={() => setPlanDuration(String(o.d))}
                            className={`cursor-pointer border-t border-surface-4 transition-colors ${active ? 'bg-brand-50' : 'hover:bg-surface-2'}`}
                          >
                            <td className="px-3 py-2.5 font-semibold text-ink">
                              {o.d}{active && <span className="ml-1.5 text-[10px] text-brand-600">● selected</span>}
                            </td>
                            <td className="px-3 py-2.5 text-ink-muted">{o.endStr}</td>
                            <td className="px-3 py-2.5 text-right num font-semibold text-ink">
                              {cibil > 0 ? (
                                <span>
                                  {fmt(o.firstEmi)}<span className="text-[10px] text-ink-muted"> 1st</span>
                                  <span className="block text-[11px] text-ink-muted">{fmt(o.emi)} next</span>
                                </span>
                              ) : fmt(o.emi)}
                            </td>
                            <td className="px-3 py-2.5 text-right num text-warning">{fmt(o.extra)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-ink-muted mt-2">Tap any row to pick that tenure for the customer.</p>
              </div>
            </motion.div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-surface-4 px-6 py-4 flex flex-col sm:flex-row gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Close</button>
          <button
            onClick={handleCreateCustomer}
            disabled={!showResults || loanValue <= 0 || plan.emi <= 0}
            className="btn-primary"
            title={!showResults ? 'Calculate an EMI first' : 'Open New Customer with these details prefilled'}
          >
            ➕ Create Customer
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-ink-muted uppercase tracking-wide">{label}</p>
      <p className="num font-semibold text-ink">{value}</p>
    </div>
  );
}
