'use client';

import { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { backdrop, modalPanel } from '@/lib/motion';
import type { FormData as CustomerFormData } from '@/components/CustomerFormModal';

// ── EMI Calculator (ECAL) ─────────────────────────────────────────────────────
// Super-admin-only planning tool. This is a faithful, behaviour-for-behaviour
// port of the standalone "Yogi Finance – Retailer EMI Calculator" (index.html):
// the exact same calculation engine, the same Low-Credit-Score (CIBIL) and
// Down-Payment alert flows, the same Loan Details / breakdown / options output,
// and the same "Share Loan Details" screenshot. Only the UI is modernised, plus
// a one-click "Create Customer" hand-off that prefills the New Customer form.
//
// Sole intentional change vs. the file: NEW customers now get the wider
// ₹800–₹1500 processing-fee list (EXISTING is left exactly as the original).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Flat processing-fee list applied to every customer type (per request #4).
const FEES_LIST = [800, 900, 1000, 1100, 1200, 1300, 1400, 1500];

function ordinal(i: number): string {
  const j = i % 10, k = i % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}

interface ResultRow { label: string; value: string; }
interface BreakdownRow { html: string; }
interface OptionRow { d: number; endStr: string; emiHtml: string; extra: number; }
interface Results {
  summary: ResultRow[];
  specificD: number;
  breakdown: BreakdownRow[];
  options: OptionRow[];
  // Snapshot used for the Create Customer hand-off.
  deviceName: string;
  purchase: number;
  down: number;
  loanValue: number;
  specEmi: number;
  cibil: number;
  emiStartDate: string;
}

interface Props {
  onClose: () => void;
  /** Hands the calculated plan to the New Customer workflow (auto-create). */
  onCreateCustomer: (prefill: Partial<Record<keyof CustomerFormData, string>>) => void;
}

export default function EmiCalculatorModal({ onClose, onCreateCustomer }: Props) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // ── Inputs (mirror index.html field-for-field) ──────────────────────────────
  const [deviceName, setDeviceName] = useState('');
  const [purchaseValue, setPurchaseValue] = useState('');
  const [downPayment, setDownPayment] = useState('');
  const [emiStartDate, setEmiStartDate] = useState(todayStr);
  const [interestRate, setInterestRate] = useState('40');
  const [customerType, setCustomerType] = useState<'new' | 'existing'>('new');
  const [processingFee, setProcessingFee] = useState('1000');
  const [lockProcessing, setLockProcessing] = useState(false); // set after low-credit
  const [lowCredit, setLowCredit] = useState(false);
  const [aadhaar, setAadhaar] = useState('');
  const [cibilCharges, setCibilCharges] = useState('');
  const [maxDuration, setMaxDuration] = useState('6');
  const [specificDuration, setSpecificDuration] = useState('6');

  // ── Output + popups ─────────────────────────────────────────────────────────
  const [results, setResults] = useState<Results | null>(null);
  const [showCibilPopup, setShowCibilPopup] = useState(false);
  const [cibilMessage, setCibilMessage] = useState('');
  const [showDpPopup, setShowDpPopup] = useState(false);
  const [shareHeading, setShareHeading] = useState('LOAN DETAILS');
  const shareRef = useRef<HTMLDivElement | null>(null);

  // Processing-fee options — one flat ₹800–₹1500 list for all customer types.
  // Low Credit Score still locks it to ₹1000 (matches the original override).
  const feeOptions = useMemo(() => {
    if (lockProcessing) return [1000];
    return FEES_LIST;
  }, [lockProcessing]);

  function onCustomerTypeChange(next: 'new' | 'existing') {
    setCustomerType(next);
    setLockProcessing(false);
    setProcessingFee('1000'); // shared default
  }

  // ── Calculation engine — identical formulas to index.html ───────────────────
  function buildResults(): Results {
    const purchase = parseFloat(purchaseValue);
    const down = parseFloat(downPayment);
    const interest = (parseFloat(interestRate) || 0) / 100;
    const proc = parseFloat(processingFee) || 0;
    const cibil = parseFloat(cibilCharges) || 0;
    const maxD = parseInt(maxDuration);
    const specificD = parseInt(specificDuration);
    const device = deviceName || 'N/A';
    const customerTypeText = customerType === 'new' ? 'NEW CUSTOMER' : 'EXISTING CUSTOMER';

    const [y, m, d] = emiStartDate.split('-').map(Number);
    const startDate = new Date(y, (m || 1) - 1, d || 1);
    const loanValue = purchase - down;

    const summary: ResultRow[] = [
      { label: 'DEVICE', value: device },
      { label: 'PURCHASE VALUE', value: `₹${purchase.toFixed(2)}` },
      { label: 'DOWN PAYMENT', value: `₹${down.toFixed(2)}` },
      { label: 'LOAN AMOUNT', value: `₹${loanValue.toFixed(2)}` },
      { label: 'CUSTOMER TYPE', value: customerTypeText },
      { label: 'PROCESSING FEES', value: `₹${proc.toFixed(2)}` },
    ];

    // Detailed EMI for the chosen "specific" month count.
    const spec_totalInt = (loanValue * (interest / 12)) * specificD;
    const spec_totalPay = loanValue + spec_totalInt + proc - cibil;
    const spec_emi = Math.round((spec_totalPay / specificD) / 10) * 10;

    const breakdown: BreakdownRow[] = [];
    for (let i = 0; i < specificD; i++) {
      const emiDate = new Date(startDate);
      emiDate.setMonth(emiDate.getMonth() + i);
      const dateString = `${emiDate.getDate()} ${MONTHS[emiDate.getMonth()]} ${emiDate.getFullYear()}`;
      if (i === 0 && cibil > 0) {
        breakdown.push({ html: `<strong>1st EMI:</strong> ₹${spec_emi.toFixed(0)} + ₹${cibil.toFixed(0)} = ₹${(spec_emi + cibil).toFixed(0)} (Due: ${dateString})` });
      } else {
        breakdown.push({ html: `<strong>${i + 1}${ordinal(i + 1)} EMI:</strong> ₹${spec_emi.toFixed(0)} (Due: ${dateString})` });
      }
    }

    const options: OptionRow[] = [];
    for (let dd = 1; dd <= maxD; dd++) {
      const totalInt = (loanValue * (interest / 12)) * dd;
      const totalPay = loanValue + totalInt + proc - cibil;
      const emi = Math.round((totalPay / dd) / 10) * 10;
      const extra = (emi * dd) - loanValue;

      const end = new Date(startDate);
      end.setMonth(end.getMonth() + dd - 1);
      const endStr = `${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`;

      let emiHtml = `₹${emi.toFixed(0)}`;
      if (cibil > 0) {
        const firstEmi = emi + cibil;
        if (dd === 1) emiHtml = `₹${firstEmi.toFixed(0)}`;
        else emiHtml = `₹${firstEmi.toFixed(0)} (1st EMI)<br>₹${emi.toFixed(0)} (Next)`;
      }
      options.push({ d: dd, endStr, emiHtml, extra });
    }

    return {
      summary, specificD, breakdown, options,
      deviceName: device, purchase, down, loanValue, specEmi: spec_emi, cibil, emiStartDate,
    };
  }

  function calculateLoanOptions() {
    setResults(buildResults());
  }

  // ── Calculate button — same guard rails + branching as the original ─────────
  function handleCalculate() {
    const purchase = parseFloat(purchaseValue);
    const down = parseFloat(downPayment);
    if (!emiStartDate) { alert('Please select an EMI Start Date.'); return; }
    if (isNaN(purchase) || isNaN(down) || purchase <= 0 || down > purchase) {
      alert('Please enter valid Purchase Value and Down Payment.'); return;
    }
    if (lowCredit) {
      // Low credit: force 30% down, lock processing fee to ₹1000, interest 40%,
      // and raise the CIBIL alert (calculation runs after the user acknowledges).
      const forcedDown = (0.3 * purchase).toFixed(0);
      setDownPayment(forcedDown);
      setLockProcessing(true);
      setProcessingFee('1000');
      setInterestRate('40');
      setCibilMessage(`CIBIL SCORE IS LOW. CUSTOMER - ${aadhaar || 'UNKNOWN'} requires higher fees and down payment.`);
      setShowCibilPopup(true);
    } else if (down < (0.3 * purchase)) {
      setShowDpPopup(true);
    } else {
      calculateLoanOptions();
    }
  }

  // Popups resolve exactly like index.html — proceed then (re)calculate.
  function cibilProceed() {
    setShowCibilPopup(false);
    // State updates from handleCalculate are applied by now; recompute from them.
    setResults(buildResults());
  }
  function dpProceed() {
    setShowDpPopup(false);
    calculateLoanOptions();
  }

  // ── Share Loan Details (html2canvas screenshot) — same as the original ──────
  async function handleShare() {
    if (!shareRef.current) return;
    setShareHeading('DO DETAILS');
    // Let the heading swap paint before capturing.
    await new Promise(r => setTimeout(r, 30));
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(shareRef.current, { backgroundColor: '#ffffff', scale: 2 });
      setShareHeading('LOAN DETAILS');
      canvas.toBlob(blob => {
        if (!blob) return;
        const file = new File([blob], 'loan_details.png', { type: 'image/png' });
        const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
        if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
          nav.share({ files: [file], title: 'Loan Details', text: 'Here are the loan details from Yogi Finance.' } as ShareData);
        } else {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = 'loan_details.png';
          link.click();
        }
      });
    } catch {
      setShareHeading('LOAN DETAILS');
    }
  }

  // ── Create Customer hand-off (auto-create, prefilled) ───────────────────────
  function handleCreateCustomer() {
    if (!results) return;
    const [y, m, d] = results.emiStartDate.split('-').map(Number);
    const startDate = new Date(y, (m || 1) - 1, d || 1);
    const dueDay = startDate.getDate();
    const monthStart = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-01`;
    onCreateCustomer({
      model_no: results.deviceName === 'N/A' ? '' : results.deviceName,
      purchase_value: results.purchase ? String(results.purchase) : '',
      down_payment: String(results.down),
      disburse_amount: results.loanValue ? String(results.loanValue) : '',
      emi_amount: results.specEmi ? String(results.specEmi) : '',
      emi_tenure: String(results.specificD),
      emi_due_day: String(Math.min(30, Math.max(1, dueDay))),
      emi_start_date: monthStart,
      first_emi_charge_amount: results.cibil ? String(results.cibil) : '0',
      purchase_date: todayStr,
    });
  }

  return (
    <motion.div
      className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}
      variants={backdrop} initial="hidden" animate="show" exit="exit"
    >
      <motion.div
        className="card w-full max-w-2xl max-h-[94vh] flex flex-col shadow-modal overflow-hidden"
        variants={modalPanel} initial="hidden" animate="show" exit="exit"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-brand-700 to-brand-500 px-6 py-5 flex items-center justify-between text-white">
          <div className="text-center flex-1">
            <h2 className="font-display text-2xl font-bold italic tracking-wide">Yogi Finance</h2>
            <p className="text-xs text-white/80 mt-0.5">🔐 Retailer EMI Calculator (ECAL)</p>
          </div>
          <button onClick={onClose} className="btn-icon bg-white/15 hover:bg-white/25 text-white shrink-0" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Inputs */}
          <div>
            <label className="label">Device Name</label>
            <input className="input" value={deviceName} onChange={e => setDeviceName(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Purchase Value (MOP)</label>
              <input type="number" inputMode="numeric" className="input" value={purchaseValue} onChange={e => setPurchaseValue(e.target.value)} />
            </div>
            <div>
              <label className="label">Down Payment</label>
              <input type="number" inputMode="numeric" className="input" value={downPayment} onChange={e => setDownPayment(e.target.value)} />
            </div>
            <div>
              <label className="label">EMI Start Date</label>
              <input type="date" className="input" value={emiStartDate} onChange={e => setEmiStartDate(e.target.value)} />
            </div>
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
              <select className="input" value={customerType} onChange={e => onCustomerTypeChange(e.target.value as 'new' | 'existing')}>
                <option value="new">NEW CUSTOMER</option>
                <option value="existing">EXISTING CUSTOMER</option>
              </select>
            </div>
            <div>
              <label className="label">Processing Fees</label>
              <select className="input" value={processingFee} onChange={e => setProcessingFee(e.target.value)}>
                {feeOptions.map(f => <option key={f} value={f}>₹{f}</option>)}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 py-1 cursor-pointer select-none">
            <input type="checkbox" className="w-4 h-4 accent-brand-500" checked={lowCredit} onChange={e => setLowCredit(e.target.checked)} />
            <span className="font-bold text-ink text-sm">LOW CREDIT SCORE (CIBIL)</span>
          </label>

          {lowCredit && (
            <div>
              <label className="label">AADHAAR NUMBER</label>
              <input className="input" value={aadhaar} onChange={e => setAadhaar(e.target.value)} />
            </div>
          )}

          <div>
            <label className="label">CIBIL CHARGES</label>
            <input type="number" inputMode="numeric" className="input" value={cibilCharges} onChange={e => setCibilCharges(e.target.value)} />
            <p className="text-[11px] text-ink-muted mt-1">Added to the 1st EMI. Carried over as the customer&apos;s 1st EMI Charge.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Show EMI up to (Months)</label>
              <select className="input" value={maxDuration} onChange={e => setMaxDuration(e.target.value)}>
                {[3, 6, 9, 12].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Show Detailed EMI for (Month)</label>
              <select className="input" value={specificDuration} onChange={e => setSpecificDuration(e.target.value)}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          <button onClick={handleCalculate} className="btn-primary w-full">Calculate EMI</button>

          {/* Results */}
          {results && (
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }} className="space-y-5 pt-2"
            >
              {/* Shareable Loan Details */}
              <div ref={shareRef} className="rounded-2xl overflow-hidden border-2 border-brand-600">
                <h3 className="text-center font-bold text-white bg-brand-600 py-3 m-0">{shareHeading}</h3>
                <div className="p-5 bg-surface-2 text-sm leading-relaxed">
                  {results.summary.map(r => (
                    <div key={r.label}>
                      <strong className="text-brand-700">{r.label}:</strong> {r.value}
                    </div>
                  ))}
                  <hr className="my-3 border-0 border-t border-dashed border-surface-4" />
                  <h4 className="text-center font-bold text-brand-700 my-2">EMI Breakdown ({results.specificD} Months)</h4>
                  {results.breakdown.map((b, i) => (
                    <div key={i} dangerouslySetInnerHTML={{ __html: b.html }} />
                  ))}
                </div>
              </div>

              <button onClick={handleShare} className="btn w-full py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold">
                📤 Share Loan Details
              </button>

              {/* Loan Options */}
              <h3 className="text-center font-bold text-brand-700 mt-2">LOAN OPTIONS</h3>
              <div className="overflow-x-auto rounded-2xl border border-surface-4">
                <table className="w-full text-sm text-center border-collapse">
                  <thead>
                    <tr className="bg-brand-600 text-white">
                      <th className="px-3 py-3 font-semibold">DURATION</th>
                      <th className="px-3 py-3 font-semibold">FINAL EMI DATE</th>
                      <th className="px-3 py-3 font-semibold">EMI</th>
                      <th className="px-3 py-3 font-semibold">EXTRA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.options.map(o => (
                      <tr key={o.d} className="border-t border-surface-4">
                        <td className="px-3 py-3 font-semibold text-ink">{o.d}</td>
                        <td className="px-3 py-3 text-ink-muted">{o.endStr}</td>
                        <td className="px-3 py-3 num text-ink" dangerouslySetInnerHTML={{ __html: o.emiHtml }} />
                        <td className="px-3 py-3 num text-warning">₹{o.extra.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-surface-4 px-6 py-4 flex flex-col sm:flex-row gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Close</button>
          <button
            onClick={handleCreateCustomer}
            disabled={!results || results.loanValue <= 0 || results.specEmi <= 0}
            className="btn-primary"
            title={!results ? 'Calculate an EMI first' : 'Open New Customer with these details prefilled'}
          >
            ➕ Create Customer
          </button>
        </div>

        {/* ── CIBIL ALERT popup ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {showCibilPopup && (
            <motion.div
              className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              <div className="card bg-white p-6 max-w-sm w-full text-center">
                <h3 className="font-bold text-danger text-lg mb-2">CIBIL ALERT</h3>
                <p className="text-sm text-ink mb-5">{cibilMessage}</p>
                <button onClick={cibilProceed} className="btn bg-green-500 hover:bg-green-600 text-white px-6 py-2.5 rounded-lg font-semibold">OK</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── DOWNPAYMENT ALERT popup ───────────────────────────────────────── */}
        <AnimatePresence>
          {showDpPopup && (
            <motion.div
              className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              <div className="card bg-white p-6 max-w-sm w-full text-center">
                <h3 className="font-bold text-warning text-lg mb-2">DOWNPAYMENT ALERT</h3>
                <p className="text-sm text-ink mb-5">Down payment is less than 30% of the purchase value.</p>
                <button onClick={dpProceed} className="btn bg-green-500 hover:bg-green-600 text-white px-6 py-2.5 rounded-lg font-semibold">OK, Proceed Anyway</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
