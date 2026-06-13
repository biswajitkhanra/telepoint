'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, differenceInDays } from 'date-fns';
import toast from 'react-hot-toast';
import { calculateTotalFineFromEmis, getPerEmiFineBreakdown } from '@/lib/fineCalc';
import { toISTDateString } from '@/lib/ist';
import BroadcastAnimator from '@/components/BroadcastAnimator';
import SmartAlertPopup from '@/components/SmartAlertPopup';
import LoanStatementModal from '@/components/LoanStatementModal';
import { formatCurrency, formatDateOnly, readJsonSafe } from '@/lib/formatters';
import { SPRING, fadeUp, popIn, staggerContainer, rowItem } from '@/lib/motion';

const SESSION_KEY = 'emi_customer_session';
const TOKEN_KEY = 'emi_app_token';

const fmt = formatCurrency;

function ibbDirect(url?: string): string {
  if (!url) return '';
  if (/i\.ibb\.co|\.jpg|\.jpeg|\.png|\.webp/i.test(url)) return url;
  if (url.includes('ibb.co/')) {
    const id = url.split('ibb.co/')[1]?.split('/')[0];
    if (id) return `https://i.ibb.co/${id}/img.jpg`;
  }
  return url;
}

interface CustomerSession {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emis: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  breakdown: any;
}

interface MultiLoanEntry {
  id: string;
  customer_name: string;
  imei: string;
  model_no?: string;
  mobile: string;
  status: string;
  emi_amount: number;
  retailer?: { name?: string; mobile?: string };
}

export default function CustomerPortal() {
  const [aadhaar, setAadhaar] = useState('');
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<CustomerSession | null>(null);
  const [showUpcomingAlert, setShowUpcomingAlert] = useState(false);
  // Multi-loan selection
  const [multiLoans, setMultiLoans] = useState<MultiLoanEntry[] | null>(null);
  const [loadingLoan, setLoadingLoan] = useState(false);
  // Broadcast messages
  const [broadcastMessages, setBroadcastMessages] = useState<{ id: string; message: string; image_url?: string | null; expires_at: string; sender_name?: string; sender_role?: string }[]>([]);
  const [dismissedBroadcasts, setDismissedBroadcasts] = useState<Set<string>>(new Set());
  const [isLaunchingUpi, setIsLaunchingUpi] = useState(false);
  const [pendingWhatsappShare, setPendingWhatsappShare] = useState(false);
  const [showStatement, setShowStatement] = useState(false);

  // Light-mode portal: paint the shared <body> + global footer light while
  // this screen is mounted, and tint the mobile address bar to match. The
  // dark admin/retailer shell is restored on unmount.
  useEffect(() => {
    document.body.classList.add('portal-shell');
    const meta = document.querySelector('meta[name="theme-color"]');
    const prevTheme = meta?.getAttribute('content') ?? null;
    meta?.setAttribute('content', '#F8FAFF');
    return () => {
      document.body.classList.remove('portal-shell');
      if (meta) meta.setAttribute('content', prevTheme ?? '#1A1B3A');
    };
  }, []);

  // Restore session from localStorage OR auto-login via token
  useEffect(() => {
    // Check URL for ?token=xxx (app auto-login)
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    const savedToken = localStorage.getItem(TOKEN_KEY);
    const tokenToUse = urlToken || savedToken;

    if (tokenToUse) {
      // Auto-login via token
      fetch('/api/customer-app-token?token=' + tokenToUse)
        .then(readJsonSafe)
        .then((data: any) => {
          if (data?.customer) {
            const newSession: CustomerSession = {
              customer: data.customer, emis: data.emis || [], breakdown: data.breakdown || null,
            };
            setSession(newSession);
            localStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
            localStorage.setItem(TOKEN_KEY, tokenToUse); // persist for future auto-login
            if (data?.broadcasts?.length) setBroadcastMessages((data.broadcasts || []) as typeof broadcastMessages);
            // Clean URL — remove token param so it's not visible
            if (urlToken) {
              window.history.replaceState({}, '', window.location.pathname);
            }
          } else {
            // Token invalid — clear and show login
            localStorage.removeItem(TOKEN_KEY);
            // Try normal session restore
            try {
              const saved = localStorage.getItem(SESSION_KEY);
              if (saved) setSession(JSON.parse(saved) as CustomerSession);
            } catch { localStorage.removeItem(SESSION_KEY); }
          }
        })
        .catch(() => {
          // Fallback to saved session
          try {
            const saved = localStorage.getItem(SESSION_KEY);
            if (saved) setSession(JSON.parse(saved) as CustomerSession);
          } catch { localStorage.removeItem(SESSION_KEY); }
        });
      return;
    }

    // No token — normal session restore
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) setSession(JSON.parse(saved) as CustomerSession);
    } catch { localStorage.removeItem(SESSION_KEY); }
  }, []);

  // Check upcoming EMI alert when session loads
  useEffect(() => {
    if (!session) return;
    const { breakdown } = session;
    if (!breakdown?.next_emi_due_date) return;
    const daysUntilDue = differenceInDays(new Date(breakdown.next_emi_due_date), new Date());
    if (daysUntilDue >= 0 && daysUntilDue <= 5) {
      setShowUpcomingAlert(true);
    }
  }, [session]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!aadhaar && !mobile) { toast.error('Enter Aadhaar or mobile number'); return; }
    if (aadhaar && aadhaar.length !== 12) { toast.error('Aadhaar must be 12 digits'); return; }
    if (mobile && mobile.length !== 10) { toast.error('Mobile must be 10 digits'); return; }

    setLoading(true);
    setMultiLoans(null);
    try {
      const res = await fetch('/api/customer-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aadhaar: aadhaar || undefined, mobile: mobile || undefined }),
      });
      const data = await readJsonSafe<{ error?: string; customer?: unknown; emis?: unknown[]; breakdown?: unknown; multi?: boolean; customers?: unknown[]; broadcasts?: unknown[] }>(res) || {};
      if (!res.ok) { toast.error(data.error); return; }

      // Multi-loan: show selection list
      if (data.multi && data.customers) {
        setMultiLoans((data.customers || []) as MultiLoanEntry[]);
        return;
      }

      const newSession: CustomerSession = {
        customer: data.customer,
        emis: data.emis,
        breakdown: data.breakdown,
      };
      setSession(newSession);
      if (data.broadcasts?.length) setBroadcastMessages((data.broadcasts || []) as typeof broadcastMessages);
      localStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function selectLoan(customerId: string) {
    setLoadingLoan(true);
    try {
      const res = await fetch('/api/customer-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId }),
      });
      const data = await readJsonSafe<{ error?: string; customer?: unknown; emis?: unknown[]; breakdown?: unknown; multi?: boolean; customers?: unknown[]; broadcasts?: unknown[] }>(res) || {};
      if (!res.ok) { toast.error(data.error); return; }
      const newSession: CustomerSession = {
        customer: data.customer,
        emis: data.emis,
        breakdown: data.breakdown,
      };
      setSession(newSession);
      setMultiLoans(null);
      if (data.broadcasts?.length) setBroadcastMessages((data.broadcasts || []) as typeof broadcastMessages);
      localStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setLoadingLoan(false);
    }
  }

  function handleLogout() {
    setSession(null);
    setShowUpcomingAlert(false);
    setMultiLoans(null);
    localStorage.removeItem(SESSION_KEY);
    setAadhaar('');
    setMobile('');
  }

  const { customer, emis, breakdown } = session ?? { customer: null, emis: [], breakdown: null };
  const sortedEmis = useMemo(
    () => [...emis].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()),
    [emis],
  );
  const paidEmis = sortedEmis.filter(e => e.status === 'APPROVED');
  const unpaidEmis = sortedEmis.filter(e => e.status === 'UNPAID' || e.status === 'PARTIALLY_PAID');
  const nextUnpaidEmi = unpaidEmis[0];
  const daysUntilDue = nextUnpaidEmi
    ? differenceInDays(new Date(nextUnpaidEmi.due_date), new Date())
    : null;

  // High-level loan figures for the EMI Summary card.
  const loanSummary = useMemo(() => {
    const totalEmiContract = sortedEmis.reduce((s, e) => s + Number(e.amount || 0), 0);
    const totalEmiPaid = sortedEmis.reduce(
      (s, e) => s + Math.min(Number(e.amount || 0), Number(e.partial_paid_amount || (e.status === 'APPROVED' ? e.amount : 0) || 0)),
      0,
    );
    const totalEmiRemaining = Math.max(0, totalEmiContract - totalEmiPaid);
    const financed = customer?.disburse_amount != null
      ? Number(customer.disburse_amount)
      : Math.max(0, Number(customer?.purchase_value || 0) - Number(customer?.down_payment || 0));
    return { totalEmiContract, totalEmiPaid, totalEmiRemaining, financed };
  }, [sortedEmis, customer]);

  const dueSummary = useMemo(() => {
    // Current IST month boundary (YYYY-MM). Future months' EMIs are excluded —
    // the customer pays everything outstanding up to and including this month only.
    const currentMonth = toISTDateString(new Date()).slice(0, 7);

    // Use the LIVE fine calculation (₹450 base + ₹25/week) — the same source the
    // Fine Details card uses — so the fine added to the total never lags behind a
    // stale stored fine_amount in the DB.
    const fineRows = getPerEmiFineBreakdown(sortedEmis).map(r => ({
      emi_no: r.emi_no,
      total: r.totalFine,
      paid: r.paid,
      remaining: r.remaining,
      status: r.totalFine > 0 ? (r.paid === 0 ? 'DUE' : r.paid >= r.totalFine ? 'PAID' : 'PARTIALLY_PAID') : 'NONE',
    }));

    // All unpaid EMIs whose due month is the current month or earlier (no prepay of
    // future months). Each contributes its remaining balance after any partial payment.
    const dueEmis = sortedEmis.filter(e =>
      (e.status === 'UNPAID' || e.status === 'PARTIALLY_PAID') &&
      toISTDateString(e.due_date).slice(0, 7) <= currentMonth,
    );
    const emiDue = dueEmis.reduce(
      (sum, e) => sum + Math.max(0, Number(e.amount || 0) - Math.max(0, Number(e.partial_paid_amount || 0))),
      0,
    );
    const emiPaid = dueEmis.reduce((sum, e) => sum + Math.max(0, Number(e.partial_paid_amount || 0)), 0);
    const dueEmiNos = dueEmis.map(e => e.emi_no);

    const totalFineRemaining = fineRows.reduce((sum, row) => sum + row.remaining, 0);
    const fineEmiNos = fineRows.filter(r => r.remaining > 0).map(r => r.emi_no);
    const firstChargeDue = customer?.first_emi_charge_paid_at ? 0 : Number(customer?.first_emi_charge_amount || 0);

    const earliestDueEmi = dueEmis[0];
    return {
      emiDue,
      emiPaid,
      dueEmiNos,
      totalFineRemaining,
      fineRows,
      fineEmiNos,
      firstChargeDue,
      totalDue: emiDue + totalFineRemaining + firstChargeDue,
      nextDueDate: earliestDueEmi?.due_date || breakdown?.next_emi_due_date,
      nextEmiNo: earliestDueEmi?.emi_no || breakdown?.next_emi_no,
    };
  }, [sortedEmis, breakdown, customer]);

  // UPI reference note: lists the EMI numbers being paid + IMEI, and (if any
  // fine is included) which EMIs the fine belongs to. Example:
  //   "EMI 3 IMEI 123456789012345 | Fine of EMI 2,3"
  function buildUpiNote(): string {
    const parts: string[] = [];
    if (dueSummary.dueEmiNos.length > 0) {
      parts.push(`EMI ${dueSummary.dueEmiNos.join(',')} IMEI ${customer?.imei || ''}`.trim());
    } else if (customer?.imei) {
      parts.push(`IMEI ${customer.imei}`);
    }
    if (dueSummary.totalFineRemaining > 0 && dueSummary.fineEmiNos.length > 0) {
      parts.push(`Fine of EMI ${dueSummary.fineEmiNos.join(',')}`);
    }
    if (dueSummary.firstChargeDue > 0) {
      parts.push('1st EMI charge');
    }
    const note = parts.join(' | ') || `EMI ${customer?.customer_name || ''}`.trim();
    // UPI tn (transaction note) practical limit is short; keep it well under to be safe.
    return note.slice(0, 80);
  }

  async function buildReceiptFile(totalAmount: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 56px sans-serif';
    ctx.fillText('TelePoint Payment Receipt', 80, 120);
    ctx.font = '36px sans-serif';
    const rows = [
      `Name: ${customer?.customer_name || '-'}`,
      `Mobile: ${customer?.mobile || '-'}`,
      `IMEI: ${customer?.imei || '-'}`,
      `EMI Due: ${fmt(dueSummary.emiDue)}`,
      `Fine Due: ${fmt(dueSummary.totalFineRemaining)}`,
      `1st EMI Charge: ${fmt(dueSummary.firstChargeDue)}`,
      `Total Amount: ${fmt(totalAmount)}`,
      `Date: ${format(new Date(), 'd MMM yyyy, h:mm a')}`,
      'Payment Mode: UPI',
      'UPI Receiver: 7003617029@upi',
    ];
    rows.forEach((row, i) => ctx.fillText(row, 80, 230 + i * 90));
    return await new Promise<File | null>((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) { resolve(null); return; }
        resolve(new File([blob], `receipt-${customer?.imei || 'emi'}.png`, { type: 'image/png' }));
      }, 'image/png');
    });
  }

  // "Download Receipt" — a clean account-summary image the customer can keep
  // or share: identity, paid-so-far, remaining balance, and any open dues.
  async function handleDownloadReceipt() {
    if (!customer) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1180;
    const ctx = canvas.getContext('2d');
    if (!ctx) { toast.error('Could not generate receipt'); return; }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Header band
    ctx.fillStyle = '#1D4ED8';
    ctx.fillRect(0, 0, canvas.width, 150);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px sans-serif';
    ctx.fillText('TelePoint · Account Summary', 64, 96);
    // Body
    ctx.fillStyle = '#0f172a';
    ctx.font = '34px sans-serif';
    const rows: [string, string][] = [
      ['Name', customer?.customer_name || '-'],
      ['Mobile', customer?.mobile || '-'],
      ['IMEI', customer?.imei || '-'],
      ['Device', customer?.model_no || '-'],
      ['Monthly EMI', fmt(customer?.emi_amount || 0)],
      ['EMIs Paid', `${paidEmis.length} / ${sortedEmis.length}`],
      ['Total Paid', fmt(loanSummary.totalEmiPaid)],
      ['Remaining Balance', fmt(loanSummary.totalEmiRemaining)],
      ['Outstanding Due', fmt(dueSummary.totalDue)],
      ['Statement Date', format(new Date(), 'd MMM yyyy, h:mm a')],
    ];
    rows.forEach(([label, value], i) => {
      const y = 250 + i * 84;
      ctx.fillStyle = '#6b7280';
      ctx.font = '30px sans-serif';
      ctx.fillText(label, 64, y);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText(value, 520, y);
    });
    ctx.fillStyle = '#9ca3af';
    ctx.font = '26px sans-serif';
    ctx.fillText('Computer-generated summary · TelePoint EMI Portal', 64, 1130);

    await new Promise<void>((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) { toast.error('Could not generate receipt'); resolve(); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `telepoint-summary-${customer?.imei || 'account'}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Receipt downloaded');
        resolve();
      }, 'image/png');
    });
  }

  async function shareOnWhatsapp(totalAmount: number) {
    const text = [
      'TelePoint EMI Payment Update',
      `Customer: ${customer?.customer_name || '-'}`,
      `Mobile: ${customer?.mobile || '-'}`,
      `IMEI: ${customer?.imei || '-'}`,
      `EMI Due: ${fmt(dueSummary.emiDue)}`,
      `Fine Due: ${fmt(dueSummary.totalFineRemaining)}`,
      `1st EMI Charge: ${fmt(dueSummary.firstChargeDue)}`,
      `Total Paid: ${fmt(totalAmount)}`,
      `Paid On: ${format(new Date(), 'd MMM yyyy, h:mm a')}`,
    ].join('\n');
    const file = await buildReceiptFile(totalAmount);
    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text, title: 'TelePoint Receipt' });
        return;
      }
    } catch {
      // fall back to whatsapp deep link
    }
    window.open(`https://wa.me/917003617029?text=${encodeURIComponent(text)}`, '_blank');
    if (file) {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
      toast('Receipt image downloaded. Attach it in WhatsApp if needed.');
    }
  }

  async function handleOnlinePay() {
    if (!customer || dueSummary.totalDue <= 0) return;
    const amount = Number(dueSummary.totalDue.toFixed(2));
    const note = buildUpiNote();
    const upiUrl = `upi://pay?pa=biswajit.khanra82@ybl&pn=TelePoint&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;
    setPendingWhatsappShare(true);
    setIsLaunchingUpi(true);
    window.location.href = upiUrl;
  }

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && pendingWhatsappShare && isLaunchingUpi) {
        setIsLaunchingUpi(false);
        setPendingWhatsappShare(false);
        shareOnWhatsapp(dueSummary.totalDue);
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [pendingWhatsappShare, isLaunchingUpi, dueSummary.totalDue]);

  if (!session) {
    // Multi-loan selection screen
    if (multiLoans && multiLoans.length > 0) {
      return (
        <div className="portal-light flex items-center justify-center p-4">
          <div className="relative w-full max-w-md animate-slide-up">
            <div className="text-center mb-8">
              <h1 className="p-title text-2xl">Select Your Account</h1>
              <p className="p-sec text-sm mt-1">Multiple EMI accounts found. Tap one to view its details.</p>
            </div>
            <div className="space-y-3">
              {multiLoans.map((loan) => (
                <button
                  key={loan.id}
                  onClick={() => selectLoan(loan.id)}
                  disabled={loadingLoan}
                  className="pcard w-full p-4 text-left transition-shadow hover:shadow-[0_10px_28px_rgba(0,0,0,0.10)] disabled:opacity-60"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="p-val text-[15px] truncate">{loan.customer_name}</p>
                      <p className="p-label text-xs mt-0.5 truncate">{loan.model_no || 'Device'} · IMEI {loan.imei}</p>
                      <p className="p-label text-xs">Retailer: {loan.retailer?.name || '—'}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={loan.status === 'RUNNING' ? 'p-badge p-badge-green' : 'p-badge p-badge-blue'}>
                        {loan.status}
                      </span>
                      <p className="p-val text-sm mt-1.5 p-num">{fmt(loan.emi_amount)}/mo</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <button onClick={() => setMultiLoans(null)} className="p-btn p-btn-ghost w-full mt-4">
              ← Back to login
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="portal-light flex items-center justify-center p-4">
        <div className="relative w-full max-w-md animate-slide-up">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white border border-[#E5E7EB] shadow-[0_6px_20px_rgba(0,0,0,0.06)] mb-5">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="1.6">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" />
              </svg>
            </div>
            <h1 className="p-title text-3xl">Customer Portal</h1>
            <p className="p-sec text-sm mt-1.5">View your EMI plan and payment history</p>
          </div>

          <div className="pcard p-6 sm:p-7">
            <p className="p-label text-xs text-center mb-6">
              Login using Aadhaar <span className="text-[#9CA3AF]">OR</span> mobile number
            </p>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="p-field-label">Aadhaar Number <span className="text-[#9CA3AF] font-normal">(optional if mobile provided)</span></label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={aadhaar}
                  onChange={e => setAadhaar(e.target.value.replace(/\D/g, '').slice(0, 12))}
                  placeholder="12-digit Aadhaar number"
                  className="p-input p-num"
                  autoFocus
                />
              </div>
              <div>
                <label className="p-field-label">Mobile Number <span className="text-[#9CA3AF] font-normal">(optional if Aadhaar provided)</span></label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={mobile}
                  onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10-digit mobile number"
                  className="p-input p-num"
                />
              </div>
              <p className="p-sec text-xs leading-relaxed">
                💡 Provide at least one. If multiple accounts share a mobile, use Aadhaar for a precise login.
              </p>
              <button
                type="submit"
                disabled={loading || (!aadhaar && !mobile)}
                className="p-btn p-btn-primary w-full text-base mt-1"
              >
                {loading ? 'Verifying…' : 'View My Account'}
              </button>
            </form>

            <div className="p-divider my-5" />
            <p className="text-center p-label text-xs">Read-only access · TelePoint EMI Portal</p>
          </div>

          <div className="text-center mt-6">
            <a href="/login" className="text-xs text-[#4B5563] hover:text-[#1D4ED8] transition-colors underline underline-offset-4">
              Staff login →
            </a>
          </div>
        </div>
      </div>
    );
  }

  const statusBadgeClass =
    customer?.status === 'RUNNING' ? 'p-badge p-badge-green'
    : customer?.status === 'NPA' ? 'p-badge p-badge-red'
    : 'p-badge p-badge-blue';
  const statusLabel =
    customer?.status === 'RUNNING' ? '● Running'
    : customer?.status === 'COMPLETE' ? '✓ Complete'
    : customer?.status === 'SETTLED' ? '✓ Settled'
    : customer?.status === 'NPA' ? '⚠ NPA'
    : customer?.status || '—';
  const progressPct = sortedEmis.length > 0 ? (paidEmis.length / sortedEmis.length) * 100 : 0;
  const paidHistory = sortedEmis.filter(e => e.status === 'APPROVED' && e.paid_at);

  return (
    <div className="portal-light">
      {/* Top bar */}
      <motion.nav
        className="sticky top-0 z-40 border-b border-[#E5E7EB] bg-white/85 backdrop-blur-md"
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={SPRING}
      >
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center flex-shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" />
              </svg>
            </div>
            <span className="p-title text-base truncate">My Account</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={async () => {
                const t = localStorage.getItem(TOKEN_KEY);
                if (t) {
                  try {
                    const r = await fetch('/api/customer-app-token?token=' + t);
                    const d = await r.json();
                    if (d.customer) {
                      const ns = { customer: d.customer, emis: d.emis || [], breakdown: d.breakdown || null };
                      setSession(ns);
                      localStorage.setItem(SESSION_KEY, JSON.stringify(ns));
                      if (d.broadcasts?.length) setBroadcastMessages(d.broadcasts);
                      toast.success('Data refreshed');
                    }
                  } catch { toast.error('Refresh failed'); }
                }
              }}
              className="text-xs font-semibold text-[#4B5563] hover:text-[#1D4ED8] hover:bg-[#F3F4F6] transition-colors px-2.5 py-1.5 rounded-lg"
            >
              ↻ Refresh
            </button>
            <button
              onClick={() => { setSession(null); localStorage.removeItem(SESSION_KEY); localStorage.removeItem(TOKEN_KEY); }}
              className="text-xs font-semibold text-[#4B5563] hover:text-[#1D4ED8] hover:bg-[#F3F4F6] transition-colors px-2.5 py-1.5 rounded-lg"
            >
              Switch
            </button>
            <button
              onClick={handleLogout}
              className="text-xs font-semibold text-[#4B5563] hover:text-[#B91C1C] hover:bg-[#FEF2F2] transition-colors px-2.5 py-1.5 rounded-lg"
            >
              Logout
            </button>
          </div>
        </div>
      </motion.nav>

      <motion.div
        className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-32"
        variants={staggerContainer(0.08, 0.05)}
        initial="hidden"
        animate="show"
      >
        {/* Install App Prompt — shows on mobile when token-based and not installed as PWA */}
        {typeof window !== 'undefined' && localStorage.getItem(TOKEN_KEY) && !window.matchMedia('(display-mode: standalone)').matches && (
          <motion.div variants={fadeUp} className="pcard p-4 flex items-center gap-3">
            <span className="text-2xl">📱</span>
            <div className="flex-1">
              <p className="p-val text-sm">Install the TelePoint App</p>
              <p className="p-sec text-xs mt-0.5">Open your browser menu (⋮) and choose <strong>&quot;Add to Home Screen&quot;</strong> for one-tap access.</p>
            </div>
          </motion.div>
        )}

        {/* Phase 6: Animated Broadcasts */}
        <BroadcastAnimator broadcasts={broadcastMessages} />

        {/* Phase 6: Smart Alert Popup */}
        <SmartAlertPopup
          fineDue={calculateTotalFineFromEmis(sortedEmis)}
          daysUntilDue={daysUntilDue}
          nextEmiNo={nextUnpaidEmi?.emi_no}
          nextEmiAmount={nextUnpaidEmi?.amount}
          firstChargeDue={breakdown?.first_emi_charge_due ?? (customer?.first_emi_charge_paid_at ? 0 : (customer?.first_emi_charge_amount || 0))}
        />

        {/* 1st EMI Charge alert */}
        {breakdown?.popup_first_emi_charge && (
          <motion.div variants={popIn} className="pcard p-4 border-l-4 border-l-[#B45309]">
            <div className="flex items-start gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="p-val text-sm">1st EMI Charge Pending</p>
                <p className="p-sec text-sm mt-0.5">A one-time charge of {fmt(breakdown.first_emi_charge_due)} is due. Contact your retailer to pay.</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Fine alert */}
        {breakdown?.popup_fine_due && (
          <motion.div variants={popIn} className="pcard p-4 border-l-4 border-l-[#B91C1C]">
            <div className="flex items-start gap-3">
              <span className="text-xl">🔴</span>
              <div>
                <p className="p-val text-sm">Late Fine Due</p>
                <p className="p-sec text-sm mt-0.5">A late fine of {fmt(breakdown.fine_due)} applies. Contact your retailer.</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── 1 · Customer Header Card ─────────────────────────────── */}
        <motion.section variants={fadeUp} className="pcard overflow-hidden">
          <div className="flex items-start gap-4 p-5">
            <motion.div
              className="w-[72px] h-[72px] rounded-2xl border border-[#E5E7EB] flex-shrink-0 relative overflow-hidden bg-[#F3F4F6]"
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...SPRING, delay: 0.1 }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-bold text-[#1D4ED8] select-none leading-none">
                  {customer?.customer_name?.[0]?.toUpperCase() ?? '?'}
                </span>
              </div>
              {customer?.customer_photo_url && (
                <img
                  src={ibbDirect(customer.customer_photo_url)}
                  alt="Customer"
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
            </motion.div>
            <div className="flex-1 min-w-0">
              <h2 className="p-title text-2xl leading-tight truncate">{customer?.customer_name}</h2>
              {customer?.father_name && <p className="p-sec text-sm mt-0.5">C/O {customer.father_name}</p>}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className={statusBadgeClass}>{statusLabel}</span>
                {customer?.model_no && <span className="p-badge p-badge-gray">{customer.model_no}</span>}
              </div>
            </div>
          </div>
          <div className="p-divider" />
          <div className="px-5 py-4 grid grid-cols-2 gap-x-4 gap-y-4">
            <InfoItem label="Mobile" value={customer?.mobile || '—'} mono />
            <InfoItem label="IMEI" value={customer?.imei || '—'} mono />
            <InfoItem label="Purchase Date" value={customer?.purchase_date ? format(new Date(customer.purchase_date), 'd MMM yyyy') : '—'} />
            <InfoItem label="Purchase Value" value={fmt(customer?.purchase_value || 0)} mono />
            <InfoItem label="Down Payment" value={fmt(customer?.down_payment || 0)} mono />
            {customer?.disburse_amount != null && <InfoItem label="Financed" value={fmt(customer.disburse_amount)} mono />}
          </div>
        </motion.section>

        {/* ── 2 · EMI Summary Card ─────────────────────────────────── */}
        <motion.section variants={fadeUp} className="pcard p-5">
          <p className="p-eyebrow mb-4">EMI Summary</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-tile">
              <p className="p-label text-xs mb-1">Total Loan</p>
              <p className="p-val text-xl p-num">{fmt(loanSummary.financed)}</p>
            </div>
            <div className="p-tile">
              <p className="p-label text-xs mb-1">Monthly EMI</p>
              <p className="p-val text-xl p-num">{fmt(customer?.emi_amount || 0)}</p>
            </div>
            <div className="p-tile col-span-2 sm:col-span-1">
              <p className="p-label text-xs mb-1">Remaining Balance</p>
              <p className="p-val text-xl p-num">{fmt(loanSummary.totalEmiRemaining)}</p>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <span className="p-label text-xs">Repayment Progress</span>
              <span className="p-sec text-xs font-semibold p-num">{paidEmis.length} / {sortedEmis.length} paid</span>
            </div>
            <div className="h-2.5 bg-[#EEF2F7] rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-[#1D4ED8] rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
              />
            </div>
          </div>

          {dueSummary.totalDue > 0 && (
            <div className="mt-5 rounded-[10px] border border-[#BFDBFE] bg-[#F5F9FF] p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="p-label text-xs">Next Amount Due</p>
                <p className="p-val text-2xl mt-0.5 p-num text-[#1D4ED8]">{fmt(dueSummary.totalDue)}</p>
              </div>
              {dueSummary.nextDueDate && (
                <div className="text-right flex-shrink-0">
                  <p className="p-label text-xs">Due Date</p>
                  <p className="p-val text-sm mt-0.5">{formatDateOnly(dueSummary.nextDueDate)}</p>
                </div>
              )}
            </div>
          )}
        </motion.section>

        {/* ── Amount-due breakdown (only when something is owed) ───── */}
        {dueSummary.totalDue > 0 && (
          <motion.section variants={fadeUp} className="pcard p-5">
            <p className="p-eyebrow mb-4">Payment Breakdown</p>
            <div className="space-y-2.5 text-sm">
              {dueSummary.emiDue > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="p-sec">{dueSummary.dueEmiNos.length > 1 ? `EMI #${dueSummary.dueEmiNos.join(', #')}` : `EMI #${dueSummary.nextEmiNo || breakdown?.next_emi_no}`}</span>
                  <span className="p-val p-num">{fmt(dueSummary.emiDue)}</span>
                </div>
              )}
              {dueSummary.emiPaid > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="text-[#B45309]">Already paid towards these EMIs</span>
                  <span className="p-num text-[#B45309]">{fmt(dueSummary.emiPaid)}</span>
                </div>
              )}
              {dueSummary.totalFineRemaining > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="text-[#B91C1C]">Fine due{dueSummary.fineEmiNos.length > 0 ? ` (EMI ${dueSummary.fineEmiNos.join(',')})` : ''}</span>
                  <span className="p-num text-[#B91C1C]">{fmt(dueSummary.totalFineRemaining)}</span>
                </div>
              )}
              {dueSummary.firstChargeDue > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="text-[#B45309]">1st EMI charge</span>
                  <span className="p-num text-[#B45309]">{fmt(dueSummary.firstChargeDue)}</span>
                </div>
              )}
              <div className="p-divider !my-3" />
              <div className="flex justify-between items-center gap-3">
                <span className="p-title text-sm">Total Payable</span>
                <span className="p-num text-xl font-bold text-[#1D4ED8]">{fmt(dueSummary.totalDue)}</span>
              </div>
            </div>
            <div className="mt-4 rounded-[10px] bg-[#F9FAFF] border border-[#E5E7EB] px-3 py-2.5">
              <p className="p-label text-[10px] uppercase tracking-wide mb-0.5">UPI reference</p>
              <p className="p-sec text-xs break-words p-num">{buildUpiNote()}</p>
            </div>
            <p className="p-label text-[11px] mt-2 leading-relaxed">Pay using any UPI app. Status updates after verification.</p>
          </motion.section>
        )}

        {/* ── EMI Schedule (structured table) ──────────────────────── */}
        <motion.section variants={fadeUp} className="pcard overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between">
            <p className="p-eyebrow">EMI Schedule</p>
            <span className="p-sec text-xs font-semibold p-num">{paidEmis.length} of {sortedEmis.length} paid</span>
          </div>
          <div className="p-divider" />
          <div className="overflow-x-auto">
            <table className="p-table">
              <thead>
                <tr>
                  <th>EMI</th>
                  <th>Due Date</th>
                  <th className="p-td-right">Amount</th>
                  <th className="p-td-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedEmis.map(emi => {
                  const isOverdue = ['UNPAID', 'PARTIALLY_PAID'].includes(emi.status) && new Date(emi.due_date) < new Date();
                  const daysLeft = differenceInDays(new Date(emi.due_date), new Date());
                  const isUpcoming = ['UNPAID', 'PARTIALLY_PAID'].includes(emi.status) && daysLeft >= 0 && daysLeft <= 5;
                  return (
                    <tr key={emi.id}>
                      <td className="p-val">#{emi.emi_no}</td>
                      <td className="p-sec p-num">
                        {format(new Date(emi.due_date), 'd MMM yyyy')}
                        {isOverdue && <span className="block text-[11px] font-semibold text-[#B91C1C]">Overdue</span>}
                      </td>
                      <td className="p-td-right p-val p-num">{fmt(emi.amount)}</td>
                      <td className="p-td-right">
                        <EmiStatusPill status={emi.status} isOverdue={isOverdue} isUpcoming={isUpcoming} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.section>

        {/* ── 3 · Payment History (table) ──────────────────────────── */}
        {paidHistory.length > 0 && (
          <motion.section variants={fadeUp} className="pcard overflow-hidden">
            <div className="px-5 py-4"><p className="p-eyebrow">Payment History</p></div>
            <div className="p-divider" />
            <div className="overflow-x-auto">
              <table className="p-table">
                <thead>
                  <tr>
                    <th>EMI</th>
                    <th>Paid On</th>
                    <th>Mode</th>
                    <th className="p-td-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {paidHistory.map(e => {
                    // Always show the method; derive it when `mode` is null
                    // (UTR ⇒ UPI, otherwise a settled EMI was Cash).
                    const method = e.mode || (e.utr ? 'UPI' : 'CASH');
                    return (
                      <tr key={e.id}>
                        <td className="p-val">#{e.emi_no}</td>
                        <td className="p-sec p-num">{e.paid_at ? format(new Date(e.paid_at), 'd MMM yyyy') : '—'}</td>
                        <td className="p-sec">
                          {method === 'UPI' ? '🟢 UPI' : '💵 Cash'}
                          {method === 'UPI' && e.utr ? <span className="block text-[11px] p-num text-[#6B7280]">UTR {e.utr}</span> : ''}
                        </td>
                        <td className="p-td-right p-val p-num">
                          {fmt(e.amount)}
                          {e.fine_paid_amount > 0 && <span className="block text-[11px] text-[#B91C1C] p-num">+ Fine {fmt(e.fine_paid_amount)}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.section>
        )}

        {/* ── Fine Details ─────────────────────────────────────────── */}
        {(() => {
          const fb = getPerEmiFineBreakdown(sortedEmis);
          if (!fb.length) return null;
          return (
            <motion.section variants={fadeUp} className="pcard overflow-hidden">
              <div className="px-5 py-4"><p className="p-eyebrow">⚠️ Fine Details</p></div>
              <div className="p-divider" />
              <div>
                {fb.sort((a, b) => a.emi_no - b.emi_no).map((r, i) => (
                  <div key={r.emi_no} className={`px-5 py-3.5 ${i % 2 === 1 ? 'bg-[#F9FAFF]' : ''}`}>
                    <div className="flex justify-between items-center">
                      <span className="p-val text-sm">EMI #{r.emi_no}</span>
                      <span className="text-xs font-semibold text-[#B91C1C]">{r.days}d overdue</span>
                    </div>
                    <div className="mt-1.5 space-y-1">
                      <div className="flex justify-between text-xs"><span className="p-label">Base Fine</span><span className="p-sec p-num">{fmt(r.baseFineTotal)}</span></div>
                      {r.weeklyFine > 0 && <div className="flex justify-between text-xs"><span className="p-label">+ ₹25/week</span><span className="p-sec p-num">{fmt(r.weeklyFine)}</span></div>}
                      <div className="flex justify-between text-sm font-semibold"><span className="text-[#B91C1C]">Total Fine</span><span className="p-num text-[#B91C1C]">{fmt(r.totalFine)}</span></div>
                      {r.paid > 0 && <div className="flex justify-between text-xs"><span className="text-[#047857]">Paid</span><span className="p-num text-[#047857]">−{fmt(r.paid)}</span></div>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-divider" />
              <div className="px-5 py-3"><p className="p-label text-[11px]">₹450 base + ₹25/week until paid. Contact your retailer.</p></div>
            </motion.section>
          );
        })()}

        {/* ── 1st EMI Charge status ────────────────────────────────── */}
        {(customer?.first_emi_charge_amount || 0) > 0 && (
          <motion.section variants={fadeUp} className="pcard p-4 flex items-center justify-between gap-3">
            <div>
              <p className="p-label text-xs mb-0.5">1st EMI Charge</p>
              <p className="p-val text-lg p-num">{fmt(customer?.first_emi_charge_amount || 0)}</p>
            </div>
            <span className={customer?.first_emi_charge_paid_at ? 'p-badge p-badge-green' : 'p-badge p-badge-amber'}>
              {customer?.first_emi_charge_paid_at ? '✓ Paid' : '⚠ Pending'}
            </span>
          </motion.section>
        )}

        {/* ── 4 · Actions Panel ────────────────────────────────────── */}
        <motion.section variants={fadeUp} className="pcard p-5">
          <p className="p-eyebrow mb-4">Actions</p>
          <div className="space-y-3">
            <button
              onClick={handleOnlinePay}
              disabled={isLaunchingUpi || dueSummary.totalDue <= 0}
              className="p-btn p-btn-primary w-full text-base"
            >
              {isLaunchingUpi ? 'Opening UPI app…' : dueSummary.totalDue > 0 ? `Pay EMI · ${fmt(dueSummary.totalDue)}` : 'No payment due'}
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setShowStatement(true)} className="p-btn p-btn-secondary">
                📄 View Details
              </button>
              <button onClick={handleDownloadReceipt} className="p-btn p-btn-secondary">
                ⬇ Download Receipt
              </button>
            </div>
          </div>
        </motion.section>

        {/* ── Important note (rules) ───────────────────────────────── */}
        <motion.section variants={fadeUp} className="pcard overflow-hidden">
          <div className="px-5 py-4 border-l-4 border-l-[#B45309]">
            <p className="p-eyebrow !text-[#B45309]">Important Note ( নিয়মাবলী )</p>
          </div>
          <div className="p-divider" />
          <div className="px-5 py-4 p-sec text-xs leading-relaxed">
            <ol className="list-decimal pl-4 space-y-2">
              <li>মোবাইল চুরি, হারানো বা খারাপ হয়ে গেলেও EMI দিতে হবে।</li>
              <li>নিদির্ষ্ট তারিখের রাত্রি ১২ টার মধ্যে EMI জমা না পড়লে Phone Auto Lock হবে। 450/- টাকা ফাইন চার্জ সহ EMI দিতে হবে।</li>
              <li>যে মাসের Fine সেই মাসের মধ্যেই পেমেন্ট করতে হবে। তা না হলে, ওই মাসের EMI Date এর ৩০ দিন পর থেকে সপ্তাহে 25/- টাকা করে (Base Fine 450/-) এর সাথে যোগ হবে।</li>
              <li>প্রতি মাসের EMI প্রতি মাসেই পেমেন্ট করতে হবে। আগের মাসের EMI বাকি রেখে বর্তমান মাসের EMI দেওয়া যাবে না।</li>
              <li>EMI চলা-কালীন মোবাইল বিক্রি / Reset করা যাবে না। Reset / Format করে ফেললে Minimum 500/- টাকা চার্জ পড়বে।</li>
              <li>EMI মিটে যাবার ৭ দিন পর Original Bill &amp; Phone Box পাওয়া যাবে।</li>
              <li>EMI এর টাকা আপনার ব্যাঙ্ক থেকে Auto Debit হবে না। Cash অথবা কার্ডে দেওয়া QR Code এ পেমেন্ট করতে পারেন।</li>
              <li>Online এ টাকা পাঠালে (7003617029) - এই নম্বরে ফোন করে জানাতে পারেন, অথবা কার্ডের প্রথম পৃষ্টার ছবি আর টাকা পাঠানোর Screen Shot টা পাঠাবেন।</li>
              <li>Portal এ পেমেন্ট Update হতে ১ - ২ দিন সময় লাগতে পারে। তারপর ও যদি না হয় দোকানে যোগাযোগ করুন।</li>
              <li>ফোন ভেঙে যাওয়া, জলে পড়ে যাওয়া, - এগুলো হলে কোন Guarantee / Warranty পাওয়া যায় না।</li>
            </ol>
          </div>
        </motion.section>

        <motion.p variants={fadeUp} className="text-center p-sec text-xs pb-2">Read-only view · TelePoint EMI Portal</motion.p>
      </motion.div>

      {/* Sticky pay bar — pay from anywhere on the page */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E5E7EB] bg-white/95 backdrop-blur-md" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-4">
          <div className="min-w-0">
            <p className="p-label text-[10px] uppercase tracking-wide leading-none">Total payable</p>
            <p className="p-val text-lg leading-tight mt-0.5 p-num">{fmt(dueSummary.totalDue)}</p>
          </div>
          <button
            onClick={handleOnlinePay}
            disabled={isLaunchingUpi || dueSummary.totalDue <= 0}
            className="p-btn p-btn-primary flex-1 text-base"
          >
            {isLaunchingUpi ? 'Opening UPI app…' : dueSummary.totalDue > 0 ? 'Pay using UPI' : 'No payment due'}
          </button>
        </div>
      </div>

      {/* Loan Statement modal */}
      <AnimatePresence>
        {showStatement && customer && (
          <LoanStatementModal
            customer={customer}
            emis={sortedEmis}
            onClose={() => setShowStatement(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function InfoItem({ label, value, mono }: { label: string; value: string | number | null | undefined; mono?: boolean }) {
  // Render 0 / "0" explicitly — only fall back to em-dash for genuine empty/undefined values.
  const display = value === 0 || value === '0'
    ? '0'
    : value === null || value === undefined || value === ''
      ? '—'
      : String(value);
  return (
    <div>
      <p className="p-label text-[11px] uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`p-val text-sm ${mono ? 'p-num' : ''}`}>{display}</p>
    </div>
  );
}

function EmiStatusPill({ status, isOverdue, isUpcoming }: { status: string; isOverdue: boolean; isUpcoming: boolean }) {
  if (status === 'APPROVED') return <span className="p-badge p-badge-green">✓ Paid</span>;
  if (status === 'PARTIALLY_PAID') return <span className="p-badge p-badge-amber">◐ Partial</span>;
  if (status === 'PENDING_APPROVAL') return <span className="p-badge p-badge-amber">⏳ Pending</span>;
  if (isOverdue) return <span className="p-badge p-badge-red">Overdue</span>;
  if (isUpcoming) return <span className="p-badge p-badge-amber">Due soon</span>;
  return <span className="p-badge p-badge-gray">Unpaid</span>;
}
