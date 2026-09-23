'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import nextDynamic from 'next/dynamic';
import Image from 'next/image';
import { AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getPerEmiFineBreakdown } from '@/lib/fineCalc';
import { toISTDateString, diffDaysIST } from '@/lib/ist';
import BroadcastAnimator from '@/components/BroadcastAnimator';
import SmartAlertPopup from '@/components/SmartAlertPopup';
import CustomerLoadingScreen from '@/components/CustomerLoadingScreen';
import Logo from '@/components/Logo';
import { formatCurrency, readJsonSafe } from '@/lib/formatters';
import { customerCodeOf } from '@/lib/customerCode';
import { firstChargeRemaining, firstChargePaid, firstChargeStatus } from '@/lib/firstCharge';

// The statement modal pulls in the PDF/ledger builders — load it only when
// the customer actually opens it, keeping the first paint lean.
const LoanStatementModal = nextDynamic(() => import('@/components/LoanStatementModal'), { ssr: false });

const SESSION_KEY = 'emi_customer_session';
const TOKEN_KEY = 'emi_app_token';
const AUTO_REFRESH_MS = 2 * 60 * 1000;
// Keep the opening animation on screen at least this long so it reads as an
// intentional moment instead of a flicker on fast connections.
const MIN_LOADER_MS = 900;

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

const PHOTO_HOSTS = [/^i\.ibb\.co$/, /\.ibb\.co$/, /\.supabase\.co$/];
function safePhotoUrl(raw: string): string {
  let u: URL;
  try { u = new URL(raw); } catch { return ''; }
  if (u.protocol !== 'https:' || !PHOTO_HOSTS.some(re => re.test(u.hostname))) return '';
  return u.href;
}

// localStorage can throw (private mode, blocked storage) — never let that
// break the portal.
const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

function readCachedSession(): CustomerSession | null {
  const raw = store.get(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CustomerSession;
    return parsed?.customer ? parsed : null;
  } catch {
    store.del(SESSION_KEY);
    return null;
  }
}

function safeFormat(value: string | null | undefined, pattern: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : format(d, pattern);
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

type Broadcast = { id: string; message: string; image_url?: string | null; expires_at: string; sender_name?: string; sender_role?: string };
type PortalPayload = { error?: string; customer?: unknown; emis?: unknown[]; breakdown?: unknown; multi?: boolean; customers?: unknown[]; broadcasts?: unknown[] };

export default function CustomerPortal() {
  const [aadhaar, setAadhaar] = useState('');
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<CustomerSession | null>(null);
  const [multiLoans, setMultiLoans] = useState<MultiLoanEntry[] | null>(null);
  const [loadingLoan, setLoadingLoan] = useState<string | null>(null);
  const [broadcastMessages, setBroadcastMessages] = useState<Broadcast[]>([]);
  const [isLaunchingUpi, setIsLaunchingUpi] = useState(false);
  const [pendingWhatsappShare, setPendingWhatsappShare] = useState(false);
  const [showStatement, setShowStatement] = useState(false);
  // `booting` covers the single frame before we know whether there is a saved
  // session — rendering nothing then avoids flashing the login form.
  const [booting, setBooting] = useState(true);
  // True only while an app-link token is verified with NO cached account to
  // show — the "opening" moment that gets the full loading animation.
  const [checkingSession, setCheckingSession] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const applyPayload = useCallback((data: PortalPayload | null): boolean => {
    if (!data?.customer) return false;
    const ns: CustomerSession = { customer: data.customer, emis: data.emis || [], breakdown: data.breakdown || null };
    setSession(ns);
    store.set(SESSION_KEY, JSON.stringify(ns));
    if (data.broadcasts?.length) setBroadcastMessages(data.broadcasts as Broadcast[]);
    return true;
  }, []);

  // ── Boot: show a cached account instantly, then revalidate in background ──
  useEffect(() => {
    const urlToken = new URLSearchParams(window.location.search).get('token');
    const savedToken = store.get(TOKEN_KEY);
    const tokenToUse = urlToken || savedToken;
    // A fresh app link for a different token must not flash someone else's
    // cached account.
    const cached = !urlToken || urlToken === savedToken ? readCachedSession() : null;
    if (cached) setSession(cached);

    if (tokenToUse) {
      const started = Date.now();
      if (!cached) setCheckingSession(true);
      fetch('/api/customer-app-token?token=' + encodeURIComponent(tokenToUse), { cache: 'no-store' })
        .then(res => readJsonSafe<PortalPayload>(res))
        .then(data => {
          if (applyPayload(data)) {
            store.set(TOKEN_KEY, tokenToUse);
            if (urlToken) window.history.replaceState({}, '', window.location.pathname);
          } else {
            store.del(TOKEN_KEY);
            if (!cached) {
              const fallback = readCachedSession();
              if (fallback) setSession(fallback);
            }
          }
        })
        .catch(() => { /* offline: keep whatever is cached */ })
        .finally(() => {
          const wait = cached ? 0 : Math.max(0, MIN_LOADER_MS - (Date.now() - started));
          setTimeout(() => setCheckingSession(false), wait);
        });
    } else if (cached?.customer?.id) {
      fetch('/api/customer-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: cached.customer.id }),
      })
        .then(res => (res.ok ? readJsonSafe<PortalPayload>(res) : null))
        .then(applyPayload)
        .catch(() => { /* offline: keep cache */ });
    }
    setBooting(false);
  }, [applyPayload]);

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
      const data = await readJsonSafe<PortalPayload>(res) || {};
      if (!res.ok) { toast.error(data.error || 'Login failed'); return; }
      if (data.multi && data.customers) {
        setMultiLoans(data.customers as MultiLoanEntry[]);
        return;
      }
      applyPayload(data);
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function selectLoan(customerId: string) {
    setLoadingLoan(customerId);
    try {
      const res = await fetch('/api/customer-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId }),
      });
      const data = await readJsonSafe<PortalPayload>(res) || {};
      if (!res.ok) { toast.error(data.error || 'Could not open account'); return; }
      if (applyPayload(data)) setMultiLoans(null);
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setLoadingLoan(null);
    }
  }

  // Re-fetch live data. App-token sessions refresh via the token, Aadhaar /
  // mobile sessions via the customer id already in the session. `silent`
  // (auto-refresh) skips toasts. Overlapping calls are dropped.
  const sessionCustomerId: string | undefined = session?.customer?.id;
  const inFlight = useRef(false);
  const lastRefresh = useRef(Date.now());
  const refreshData = useCallback(async (silent = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (!silent) setRefreshing(true);
    try {
      const token = store.get(TOKEN_KEY);
      let data: PortalPayload | null = null;
      if (token) {
        const res = await fetch('/api/customer-app-token?token=' + encodeURIComponent(token), { cache: 'no-store' });
        data = await readJsonSafe<PortalPayload>(res);
      } else if (sessionCustomerId) {
        const res = await fetch('/api/customer-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer_id: sessionCustomerId }),
        });
        if (res.ok) data = await readJsonSafe<PortalPayload>(res);
      }
      const ok = applyPayload(data);
      lastRefresh.current = Date.now();
      if (!silent) {
        if (ok) toast.success('Up to date');
        else toast.error('Refresh failed');
      }
    } catch {
      if (!silent) toast.error('Refresh failed');
    } finally {
      inFlight.current = false;
      if (!silent) setRefreshing(false);
    }
  }, [sessionCustomerId, applyPayload]);

  // Auto-refresh every 2 minutes while visible; catch up immediately when the
  // customer comes back to the tab after a while. No polling in background.
  const refreshRef = useRef(refreshData);
  refreshRef.current = refreshData;
  useEffect(() => {
    if (!sessionCustomerId) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refreshRef.current(true);
    }, AUTO_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh.current > 60_000) refreshRef.current(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [sessionCustomerId]);

  function handleLogout() {
    // Clears the app token too — otherwise the next reload silently logged
    // the same customer straight back in.
    setSession(null);
    setMultiLoans(null);
    setBroadcastMessages([]);
    setShowStatement(false);
    store.del(SESSION_KEY);
    store.del(TOKEN_KEY);
    setAadhaar('');
    setMobile('');
  }

  const { customer, emis, breakdown } = session ?? { customer: null, emis: [], breakdown: null };
  const sortedEmis = useMemo(
    () => [...(emis || [])].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()),
    [emis],
  );
  const paidCount = useMemo(() => sortedEmis.filter(e => e.status === 'APPROVED').length, [sortedEmis]);
  const nextUnpaidEmi = useMemo(
    () => sortedEmis.find(e => e.status === 'UNPAID' || e.status === 'PARTIALLY_PAID'),
    [sortedEmis],
  );
  const daysUntilDue = nextUnpaidEmi ? diffDaysIST(nextUnpaidEmi.due_date, new Date()) : null;

  // Live fine engine — computed ONCE and shared by the due total, the fines
  // card, the EMI rows and the alert popup (it used to run three times).
  const fineRows = useMemo(
    () => getPerEmiFineBreakdown(sortedEmis, undefined, undefined, true).sort((a, b) => a.emi_no - b.emi_no),
    [sortedEmis],
  );
  const fineByEmi = useMemo(() => new Map(fineRows.map(r => [r.emi_no, r])), [fineRows]);

  const dueSummary = useMemo(() => {
    // Current IST month boundary (YYYY-MM). Future months' EMIs are excluded —
    // the customer pays everything outstanding up to and including this month only.
    const currentMonth = toISTDateString(new Date()).slice(0, 7);
    let dueEmis = sortedEmis.filter(e =>
      (e.status === 'UNPAID' || e.status === 'PARTIALLY_PAID') &&
      toISTDateString(e.due_date).slice(0, 7) <= currentMonth,
    );
    // Nothing due yet (fresh loan): allow paying the single NEXT installment early.
    if (dueEmis.length === 0 && nextUnpaidEmi) dueEmis = [nextUnpaidEmi];

    const emiDue = dueEmis.reduce(
      (sum, e) => sum + Math.max(0, Number(e.amount || 0) - Math.max(0, Number(e.partial_paid_amount || 0))),
      0,
    );
    const emiPaid = dueEmis.reduce((sum, e) => sum + Math.max(0, Number(e.partial_paid_amount || 0)), 0);
    const totalFineRemaining = fineRows.reduce((sum, r) => sum + r.remaining, 0);
    const firstChargeDue = customer ? firstChargeRemaining(customer) : 0;
    const earliestDueEmi = dueEmis[0];
    return {
      emiDue,
      emiPaid,
      dueEmiNos: dueEmis.map(e => e.emi_no) as number[],
      totalFineRemaining,
      fineEmiNos: fineRows.filter(r => r.remaining > 0).map(r => r.emi_no),
      firstChargeDue,
      totalDue: emiDue + totalFineRemaining + firstChargeDue,
      nextDueDate: earliestDueEmi?.due_date || breakdown?.next_emi_due_date,
      nextEmiNo: earliestDueEmi?.emi_no || breakdown?.next_emi_no,
    };
  }, [sortedEmis, nextUnpaidEmi, fineRows, breakdown, customer]);

  const totals = useMemo(() => {
    const contract = sortedEmis.reduce((s, e) => s + Number(e.amount || 0), 0);
    const paid = sortedEmis.reduce((s, e) => s + Math.min(Number(e.amount || 0), Number(e.partial_paid_amount || (e.status === 'APPROVED' ? e.amount : 0) || 0)), 0);
    const fineAccrued = fineRows.reduce((s, r) => s + r.totalFine, 0);
    const finePaid = fineRows.reduce((s, r) => s + r.paid, 0);
    return { contract, paid, remaining: Math.max(0, contract - paid), fineAccrued, finePaid };
  }, [sortedEmis, fineRows]);

  // UPI reference note: leads with the customer's unique number (short, so it
  // survives UPI apps that truncate the note), then the EMI numbers being paid.
  // Example: "TP1024 | EMI 3 | Fine of EMI 2,3"
  function buildUpiNote(): string {
    const parts: string[] = [];
    const code = customerCodeOf(customer);
    if (code) parts.push(code);
    if (dueSummary.dueEmiNos.length > 0) parts.push(`EMI ${dueSummary.dueEmiNos.join(',')}`);
    else if (customer?.imei) parts.push(`IMEI ${customer.imei}`);
    if (dueSummary.totalFineRemaining > 0 && dueSummary.fineEmiNos.length > 0) {
      parts.push(`Fine of EMI ${dueSummary.fineEmiNos.join(',')}`);
    }
    if (dueSummary.firstChargeDue > 0) parts.push('1st EMI charge');
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
    window.open(`https://wa.me/917003617029?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
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

  function handleOnlinePay() {
    if (!customer || dueSummary.totalDue <= 0) return;
    const amount = Number(dueSummary.totalDue.toFixed(2));
    const note = buildUpiNote();
    const upiUrl = `upi://pay?pa=biswajit.khanra82@ybl&pn=TelePoint&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;
    setPendingWhatsappShare(true);
    setIsLaunchingUpi(true);
    window.location.href = upiUrl;
    // If no UPI app handled the link the page never loses visibility —
    // re-enable the button instead of leaving it stuck on "Opening…".
    setTimeout(() => {
      if (document.visibilityState === 'visible') { setIsLaunchingUpi(false); setPendingWhatsappShare(false); }
    }, 4000);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingWhatsappShare, isLaunchingUpi, dueSummary.totalDue]);

  // The loader always sits at the same tree position (second fragment child)
  // so it survives the switch to the dashboard and plays its exit fade on top.
  const loaderOverlay = (
    <AnimatePresence>
      {checkingSession && <CustomerLoadingScreen key="customer-loading" />}
    </AnimatePresence>
  );

  // ── Boot frame: nothing (avoids a login-form flash) ────────────────────────
  if (booting) return <div className="min-h-screen page-bg cp-static-bg" />;

  if (!session) {
    // Blank backdrop under the opening animation (never the login form, whose
    // autofocus would pop the phone keyboard behind the loader).
    if (checkingSession) return <><div className="min-h-screen page-bg cp-static-bg" />{loaderOverlay}</>;

    // Multi-loan selection screen
    if (multiLoans && multiLoans.length > 0) {
      return (<>
        <div className="min-h-screen page-bg cp-static-bg flex items-center justify-center p-4">
          <div className="relative w-full max-w-md cp-rise">
            <div className="text-center mb-7">
              <Logo size={48} className="mx-auto mb-4" />
              <h1 className="font-display text-2xl font-bold text-ink">Select your account</h1>
              <p className="text-ink-muted text-sm mt-1">{multiLoans.length} EMI accounts found. Tap one to open it.</p>
            </div>
            <div className="space-y-3">
              {multiLoans.map((loan, i) => (
                <button
                  key={loan.id}
                  onClick={() => selectLoan(loan.id)}
                  disabled={!!loadingLoan}
                  className="card cp-press cp-rise w-full p-4 text-left hover:border-brand-400 disabled:opacity-60"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink truncate">{loan.model_no || 'Device'}</p>
                      <p className="text-xs text-ink-muted mt-0.5 font-num truncate">IMEI {loan.imei}</p>
                      <p className="text-xs text-ink-muted truncate">Shop: {loan.retailer?.name || '—'}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={loan.status === 'RUNNING' ? 'badge-running' : 'badge-complete'}>{loan.status}</span>
                      <p className="text-sm font-semibold text-ink mt-1.5 font-num">
                        {loadingLoan === loan.id ? 'Opening…' : `${fmt(loan.emi_amount)}/mo`}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <button onClick={() => setMultiLoans(null)} className="btn-ghost w-full mt-4 py-2.5">
              ← Back to login
            </button>
          </div>
        </div>
        {loaderOverlay}
      </>);
    }

    return (<>
      <div className="min-h-screen page-bg cp-static-bg flex items-center justify-center p-4">
        <div className="relative w-full max-w-md cp-rise">
          <div className="text-center mb-8">
            <Logo size={60} className="mx-auto mb-5 drop-shadow-lg" />
            <h1 className="font-display text-3xl font-bold text-ink tracking-tight">Customer Portal</h1>
            <p className="text-ink-muted text-sm mt-1">Your EMI plan, dues and payments — in one place</p>
          </div>

          <div className="card p-6 sm:p-8 shadow-2xl shadow-brand-500/10">
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="form-label" htmlFor="cp-mobile">Mobile number</label>
                <input
                  id="cp-mobile"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  value={mobile}
                  onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10-digit mobile number"
                  className="form-input font-num tracking-wider"
                  autoFocus
                />
              </div>
              <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-widest text-ink-muted">
                <span className="h-px flex-1 bg-surface-4" />or<span className="h-px flex-1 bg-surface-4" />
              </div>
              <div>
                <label className="form-label" htmlFor="cp-aadhaar">Aadhaar number</label>
                <input
                  id="cp-aadhaar"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={aadhaar}
                  onChange={e => setAadhaar(e.target.value.replace(/\D/g, '').slice(0, 12))}
                  placeholder="12-digit Aadhaar number"
                  className="form-input font-num tracking-wider"
                />
                <p className="text-[11px] text-ink-muted mt-1.5">Several accounts on one mobile? Use Aadhaar for an exact match.</p>
              </div>
              <button
                type="submit"
                disabled={loading || (!aadhaar && !mobile)}
                className="cp-paybtn cp-press w-full rounded-xl py-3.5 text-base font-semibold text-white disabled:cursor-not-allowed"
              >
                {loading ? 'Verifying…' : 'View my account'}
              </button>
            </form>

            <div className="mt-6 flex items-center justify-center gap-4 text-[11px] text-ink-muted">
              <span className="inline-flex items-center gap-1">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
                Secure
              </span>
              <span className="h-3 w-px bg-surface-4" />
              <span>Read-only access</span>
            </div>
          </div>

          <div className="text-center mt-6">
            <a href="/login" className="text-xs text-ink-muted hover:text-ink transition-colors underline underline-offset-4">
              Staff login →
            </a>
          </div>
        </div>
      </div>
      {loaderOverlay}
    </>);
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────
  const total = sortedEmis.length;
  const pct = total > 0 ? paidCount / total : 0;
  const RING_C = 2 * Math.PI * 34;
  const code = customerCodeOf(customer);
  const retailer = Array.isArray(customer?.retailer) ? customer.retailer[0] : customer?.retailer;
  // The shop number can come from the locally cached session, so treat it as
  // untrusted: keep digits/+ only and only link it when it is a real number.
  const shopDigits = String(retailer?.mobile ?? '').replace(/[^\d+]/g, '');
  const shopTel = /^\+?\d{6,15}$/.test(shopDigits) ? shopDigits : '';
  // Same for the photo URL: only an https link on the image hosts the app
  // actually uploads to (see next.config.js remotePatterns) is rendered.
  const photoSrc = safePhotoUrl(ibbDirect(customer?.customer_photo_url));
  const firstName = String(customer?.customer_name || '').trim().split(/\s+/)[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const allClear = dueSummary.totalDue <= 0;
  const dueDays = dueSummary.nextDueDate ? diffDaysIST(dueSummary.nextDueDate, new Date()) : null;
  const dueLabel = allClear
    ? (customer?.status === 'COMPLETE' ? 'Loan fully paid' : 'No payment due right now')
    : dueDays === null ? ''
    : dueDays < 0 ? `Overdue by ${Math.abs(dueDays)} day${Math.abs(dueDays) === 1 ? '' : 's'}`
    : dueDays === 0 ? 'Due today'
    : `Due ${safeFormat(dueSummary.nextDueDate, 'd MMM yyyy')}`;
  const fcAmount = Number(customer?.first_emi_charge_amount || 0);
  const fcStatus = fcAmount > 0 && customer ? firstChargeStatus(customer) : 'NONE';
  let section = 0;
  const rise = (): React.CSSProperties => ({ animationDelay: `${60 + (section++) * 55}ms` });

  return (<>
    <div className="min-h-screen page-bg cp-static-bg">
      {/* Navbar */}
      <nav className="sticky top-0 z-40 border-b border-surface-4 bg-surface/95">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <Logo size={28} />
            <span className="font-display text-[15px] font-bold text-ink truncate">My Account</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refreshData()}
              disabled={refreshing}
              aria-label="Refresh"
              className="cp-press inline-flex h-9 w-9 items-center justify-center rounded-xl border border-surface-4 bg-surface text-ink-muted hover:text-brand-600 disabled:opacity-60"
            >
              <svg className={refreshing ? 'animate-spin' : ''} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 11-2.64-6.36" /><path d="M21 3v6h-6" />
              </svg>
            </button>
            <button
              onClick={handleLogout}
              className="cp-press h-9 rounded-xl border border-surface-4 bg-surface px-3 text-xs font-semibold text-ink-muted hover:text-rose-600"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 pt-5 pb-36 space-y-4">
        <BroadcastAnimator broadcasts={broadcastMessages} />
        <SmartAlertPopup
          fineDue={dueSummary.totalFineRemaining}
          daysUntilDue={daysUntilDue}
          nextEmiNo={nextUnpaidEmi?.emi_no}
          nextEmiAmount={nextUnpaidEmi?.amount}
          firstChargeDue={dueSummary.firstChargeDue}
        />

        {/* ── Hero: identity + amount due + progress ── */}
        <section className="cp-rise cp-hero relative overflow-hidden rounded-3xl p-5 text-white shadow-xl shadow-indigo-900/20" style={rise()}>
          <div className="relative z-10 flex items-center gap-3.5">
            <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-2xl bg-white/15 ring-2 ring-white/25">
              <span className="absolute inset-0 flex items-center justify-center font-display text-2xl font-bold">
                {customer?.customer_name?.[0]?.toUpperCase() ?? '?'}
              </span>
              {photoSrc && (
                <Image
                  src={photoSrc}
                  alt=""
                  fill
                  sizes="56px"
                  unoptimized
                  className="object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-white/65">{greeting},</p>
              <h1 className="font-display text-xl font-bold leading-tight truncate">{customer?.customer_name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className={`rounded-full px-2 py-0.5 font-semibold ${customer?.status === 'COMPLETE' ? 'bg-sky-400/25 text-sky-100' : 'bg-emerald-400/25 text-emerald-100'}`}>
                  {customer?.status === 'COMPLETE' ? '✓ Complete' : '● Running'}
                </span>
                {customer?.model_no && <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/85 truncate max-w-[10rem]">{customer.model_no}</span>}
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-5 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">{allClear ? 'Status' : 'Total payable'}</p>
              <p className="font-num text-[34px] font-bold leading-none mt-1.5 tracking-tight">
                {allClear ? 'All clear' : fmt(dueSummary.totalDue)}
              </p>
              {dueLabel && (
                <p className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  !allClear && dueDays !== null && dueDays < 0 ? 'bg-rose-500/25 text-rose-100' :
                  !allClear && dueDays !== null && dueDays <= 5 ? 'bg-amber-400/25 text-amber-100' : 'bg-white/10 text-white/85'
                }`}>
                  {dueLabel}
                </p>
              )}
            </div>
            <div className="relative flex-shrink-0" style={{ width: 84, height: 84 }}>
              <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
                <circle cx="42" cy="42" r="34" className="cp-ring-track" strokeWidth="7" fill="none" />
                <circle
                  cx="42" cy="42" r="34" fill="none" strokeWidth="7" strokeLinecap="round"
                  stroke="url(#cpRingGrad)" transform="rotate(-90 42 42)"
                  className="cp-ring-bar"
                  strokeDasharray={RING_C}
                  strokeDashoffset={RING_C * (1 - pct)}
                />
                <defs>
                  <linearGradient id="cpRingGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#34d399" /><stop offset="100%" stopColor="#22d3ee" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-num text-lg font-bold leading-none">{paidCount}<span className="text-xs text-white/60">/{total}</span></span>
                <span className="text-[9px] uppercase tracking-wider text-white/60 mt-0.5">EMIs paid</span>
              </div>
            </div>
          </div>

          {code && (
            <button
              type="button"
              onClick={() => { navigator.clipboard?.writeText(code).then(() => toast.success('Customer ID copied')).catch(() => {}); }}
              className="relative z-10 mt-4 flex w-full items-center justify-between rounded-2xl bg-white/10 px-3.5 py-2.5 text-left ring-1 ring-white/15 cp-press"
            >
              <span className="flex-shrink-0">
                <span className="block text-[10px] font-semibold uppercase tracking-widest text-white/60">Customer ID</span>
                <span className="font-num text-base font-bold tracking-wide">{code}</span>
              </span>
              <span className="ml-3 min-w-0 whitespace-normal text-right text-[10px] leading-snug text-white/70">
                Quote it with every payment<br />Tap to copy
              </span>
            </button>
          )}
        </section>

        {/* ── Amount due breakdown ── */}
        {!allClear && (
          <section className="cp-rise card p-5" style={rise()}>
            <SectionTitle>Amount due</SectionTitle>
            <div className="mt-3 space-y-2.5 text-sm">
              {dueSummary.emiDue > 0 && (
                <Row label={dueSummary.dueEmiNos.length ? `EMI #${dueSummary.dueEmiNos.join(', #')}` : `EMI #${dueSummary.nextEmiNo ?? '—'}`} value={fmt(dueSummary.emiDue)} />
              )}
              {dueSummary.emiPaid > 0 && <Row label="Already paid towards these EMIs" value={fmt(dueSummary.emiPaid)} tone="amber" />}
              {dueSummary.totalFineRemaining > 0 && (
                <Row label={`Late fine${dueSummary.fineEmiNos.length ? ` (EMI ${dueSummary.fineEmiNos.join(',')})` : ''}`} value={fmt(dueSummary.totalFineRemaining)} tone="rose" />
              )}
              {dueSummary.firstChargeDue > 0 && <Row label="1st EMI charge" value={fmt(dueSummary.firstChargeDue)} tone="amber" />}
              <div className="h-px bg-surface-4" />
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink">Total payable</span>
                <span className="font-num text-xl font-bold text-ink">{fmt(dueSummary.totalDue)}</span>
              </div>
            </div>
          </section>
        )}

        {/* ── Quick actions ── */}
        <div className="cp-rise grid grid-cols-2 keep-cols gap-3" style={rise()}>
          <button onClick={() => setShowStatement(true)} className="card cp-press flex items-center gap-3 p-3.5 text-left hover:border-brand-400">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-indigo-600 text-white shadow-md shadow-brand-500/30">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">Statement</span>
              <span className="block text-[11px] text-ink-muted truncate">View & download PDF</span>
            </span>
          </button>
          {shopTel ? (
            <a href={`tel:${shopTel}`} className="card cp-press flex items-center gap-3 p-3.5 hover:border-emerald-400">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/30">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z" /></svg>
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">Call shop</span>
                <span className="block text-[11px] text-ink-muted truncate">{retailer.name || retailer.mobile}</span>
              </span>
            </a>
          ) : (
            <a href="tel:7003617029" className="card cp-press flex items-center gap-3 p-3.5 hover:border-emerald-400">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/30">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z" /></svg>
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">Call support</span>
                <span className="block text-[11px] text-ink-muted truncate">7003617029</span>
              </span>
            </a>
          )}
        </div>

        {/* ── EMI schedule (includes payment history inline) ── */}
        <section className="cp-rise card overflow-hidden" style={rise()}>
          <div className="flex items-center justify-between border-b border-surface-4 px-5 py-3.5">
            <SectionTitle>EMI schedule</SectionTitle>
            <span className="text-xs text-ink-muted font-num">{fmt(customer?.emi_amount || 0)} / month</span>
          </div>
          <div className="px-5 pt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 cp-ring-bar" style={{ width: `${pct * 100}%`, transition: 'width 1s cubic-bezier(.16,1,.3,1)' }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-ink-muted">
              <span>{paidCount} of {total} paid</span>
              <span className="font-num">{fmt(totals.paid)} / {fmt(totals.contract)}</span>
            </div>
          </div>
          <ol className="p-3 space-y-2">
            {sortedEmis.map((emi, i) => {
              const unpaid = emi.status === 'UNPAID' || emi.status === 'PARTIALLY_PAID';
              const daysLeft = diffDaysIST(emi.due_date, new Date());
              const isOverdue = unpaid && daysLeft < 0;
              const isUpcoming = unpaid && daysLeft >= 0 && daysLeft <= 5;
              const fine = fineByEmi.get(emi.emi_no);
              const method = emi.mode || (emi.utr ? 'UPI' : 'CASH');
              const tone =
                emi.status === 'APPROVED' ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10' :
                isOverdue ? 'border-rose-200 bg-rose-50/60 dark:border-rose-500/30 dark:bg-rose-500/10' :
                isUpcoming ? 'border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10' :
                emi.status === 'PENDING_APPROVAL' ? 'border-sky-200 bg-sky-50/60 dark:border-sky-500/30 dark:bg-sky-500/10' :
                'border-surface-4 bg-surface-2/60';
              const bubble =
                emi.status === 'APPROVED' ? 'bg-emerald-500 text-white' :
                emi.status === 'PARTIALLY_PAID' ? 'bg-amber-500 text-white' :
                emi.status === 'PENDING_APPROVAL' ? 'bg-sky-500 text-white' :
                isOverdue ? 'bg-rose-500 text-white' :
                isUpcoming ? 'bg-amber-100 text-amber-800' : 'bg-surface-3 text-ink-muted';
              return (
                <li
                  key={emi.id}
                  className={`${i < 14 ? 'cp-row' : ''} rounded-xl border px-3.5 py-3 ${tone}`}
                  style={i < 14 ? { animationDelay: `${200 + i * 35}ms` } : undefined}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${bubble}`}>
                        {emi.status === 'APPROVED' ? '✓' : emi.emi_no}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">
                          EMI #{emi.emi_no}
                          {isUpcoming && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">DUE SOON</span>}
                        </p>
                        <p className={`text-xs font-num ${isOverdue ? 'text-rose-600 font-medium' : 'text-ink-muted'}`}>
                          {emi.status === 'APPROVED' && emi.paid_at
                            ? `Paid ${safeFormat(emi.paid_at, 'd MMM yyyy')} · ${method === 'UPI' ? 'UPI' : 'Cash'}`
                            : `Due ${safeFormat(emi.due_date, 'd MMM yyyy')}${isOverdue ? ` · ${Math.abs(daysLeft)}d overdue` : ''}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-num text-sm font-semibold text-ink">{fmt(emi.amount)}</p>
                      <StatusTag status={emi.status} />
                    </div>
                  </div>
                  {(emi.status === 'APPROVED' && method === 'UPI' && emi.utr) || emi.status === 'PARTIALLY_PAID' || (fine && fine.totalFine > 0) ? (
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 pl-11 text-[11px]">
                      {emi.status === 'APPROVED' && method === 'UPI' && emi.utr && <span className="text-ink-muted font-mono break-all">UTR {emi.utr}</span>}
                      {emi.status === 'PARTIALLY_PAID' && <span className="text-amber-700">Paid {fmt(emi.partial_paid_amount || 0)} · {fmt(Math.max(0, Number(emi.amount || 0) - Number(emi.partial_paid_amount || 0)))} left</span>}
                      {fine && fine.totalFine > 0 && (
                        fine.remaining > 0
                          ? <span className="text-rose-600 font-medium">Fine {fmt(fine.remaining)} due</span>
                          : <span className="text-emerald-700">Fine {fmt(fine.paid)} paid</span>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>

        {/* ── Fines (live calculation, single card) ── */}
        {fineRows.length > 0 && (
          <section className="cp-rise card overflow-hidden" style={rise()}>
            <div className="flex items-center justify-between border-b border-surface-4 px-5 py-3.5">
              <SectionTitle>Late fines</SectionTitle>
              {dueSummary.totalFineRemaining > 0
                ? <span className="badge-rejected">{fmt(dueSummary.totalFineRemaining)} due</span>
                : <span className="badge-running">All paid</span>}
            </div>
            <div className="divide-y divide-surface-4">
              {fineRows.map(r => (
                <div key={r.emi_no} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">EMI #{r.emi_no}</span>
                    <span className={r.remaining <= 0 ? 'badge-running' : r.paid > 0 ? 'badge-yellow' : 'badge-rejected'}>
                      {r.remaining <= 0 ? 'Paid' : r.paid > 0 ? 'Partial' : `${r.days}d overdue`}
                    </span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 keep-cols gap-x-4 gap-y-1 text-xs">
                    <span className="text-ink-muted">Base fine</span><span className="text-right font-num text-ink">{fmt(r.baseFineTotal)}</span>
                    {r.weeklyFine > 0 && (<><span className="text-ink-muted">Weekly (+₹25/wk)</span><span className="text-right font-num text-ink">{fmt(r.weeklyFine)}</span></>)}
                    {r.paid > 0 && (<><span className="text-ink-muted">Paid</span><span className="text-right font-num text-emerald-600">−{fmt(r.paid)}</span></>)}
                    <span className="font-semibold text-ink">Remaining</span><span className={`text-right font-num font-semibold ${r.remaining > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{fmt(r.remaining)}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="border-t border-surface-4 px-5 py-2.5 text-[11px] text-ink-muted">₹450 base + ₹25/week after 30 days, until paid.</p>
          </section>
        )}

        {/* ── Loan summary ── */}
        <section className="cp-rise card p-5" style={rise()}>
          <SectionTitle>Loan summary</SectionTitle>
          <div className="mt-3 grid grid-cols-2 keep-cols gap-3">
            <Stat label="EMI paid" value={fmt(totals.paid)} tone="emerald" />
            <Stat label="EMI remaining" value={fmt(totals.remaining)} />
            <Stat label="Fine paid" value={fmt(totals.finePaid)} tone="emerald" />
            <Stat label="Fine remaining" value={fmt(dueSummary.totalFineRemaining)} tone={dueSummary.totalFineRemaining > 0 ? 'rose' : undefined} />
          </div>
          {fcAmount > 0 && customer && (
            <div className="mt-3 flex items-center justify-between rounded-xl border border-surface-4 bg-surface-2 px-4 py-3">
              <div>
                <p className="text-xs text-ink-muted">1st EMI charge</p>
                <p className="font-num text-sm font-semibold text-ink">{fmt(fcAmount)}</p>
                {fcStatus === 'PARTIAL' && <p className="text-[11px] text-amber-700 mt-0.5">Paid {fmt(firstChargePaid(customer))} · {fmt(firstChargeRemaining(customer))} left</p>}
              </div>
              <span className={fcStatus === 'PAID' ? 'badge-running' : fcStatus === 'PARTIAL' ? 'badge-yellow' : 'badge-pending'}>
                {fcStatus === 'PAID' ? '✓ Paid' : fcStatus === 'PARTIAL' ? 'Partial' : 'Unpaid'}
              </span>
            </div>
          )}
        </section>

        {/* ── Account details ── */}
        <section className="cp-rise card p-5" style={rise()}>
          <SectionTitle>Account details</SectionTitle>
          <div className="mt-3 grid grid-cols-2 keep-cols gap-x-4 gap-y-3.5">
            {customer?.father_name && <Field label="C/O" value={customer.father_name} />}
            <Field label="Mobile" value={customer?.mobile || ''} mono />
            <Field label="IMEI" value={customer?.imei || ''} mono />
            <Field label="Purchase date" value={safeFormat(customer?.purchase_date, 'd MMM yyyy')} />
            <Field label="Purchase value" value={fmt(customer?.purchase_value || 0)} mono />
            <Field label="Down payment" value={fmt(customer?.down_payment || 0)} mono />
            {customer?.disburse_amount != null && <Field label="Financed" value={fmt(customer.disburse_amount)} mono />}
            {customer?.emi_tenure ? <Field label="Tenure" value={`${customer.emi_tenure} months`} /> : null}
            {retailer?.name && <Field label="Shop" value={retailer.name} />}
          </div>
        </section>

        {/* ── Rules ── */}
        <details className="cp-rise card overflow-hidden group" style={rise()}>
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 [&::-webkit-details-marker]:hidden">
            <span className="text-xs font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">Important rules (নিয়মাবলী)</span>
            <svg className="text-ink-muted transition-transform group-open:rotate-180" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
          </summary>
          <div className="border-t border-surface-4 px-5 py-4 text-xs leading-relaxed text-ink-muted">
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
        </details>

        <p className="text-center text-[11px] text-ink-muted pt-1">Read-only view · TelePoint EMI Portal</p>
      </div>

      {/* Fixed pay bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-4 bg-surface/95 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.25)]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-ink-muted leading-none">Total payable</p>
            <p className="font-num text-lg font-bold text-ink leading-tight mt-1">{fmt(dueSummary.totalDue)}</p>
          </div>
          <button
            onClick={handleOnlinePay}
            disabled={isLaunchingUpi || allClear}
            className="cp-paybtn cp-press flex-1 rounded-xl py-3.5 text-base font-semibold text-white flex items-center justify-center gap-2 disabled:cursor-not-allowed"
          >
            {!allClear && !isLaunchingUpi && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="3" /><path d="M10 7h4M9 11h6l-4 6" /></svg>
            )}
            {isLaunchingUpi ? 'Opening UPI app…' : allClear ? 'No payment due' : 'Pay with UPI'}
          </button>
        </div>
      </div>

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
    {loaderOverlay}
  </>);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-bold uppercase tracking-widest text-ink-muted">{children}</h2>;
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'amber' | 'rose' }) {
  const c = tone === 'amber' ? 'text-amber-700 dark:text-amber-400' : tone === 'rose' ? 'text-rose-600 dark:text-rose-400' : 'text-ink';
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={tone ? c : 'text-ink-muted'}>{label}</span>
      <span className={`font-num font-medium ${c}`}>{value}</span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'rose' }) {
  const c = tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'rose' ? 'text-rose-600 dark:text-rose-400' : 'text-ink';
  return (
    <div className="rounded-xl border border-surface-4 bg-surface-2 px-3.5 py-3">
      <p className="text-[11px] text-ink-muted">{label}</p>
      <p className={`font-num text-base font-bold mt-0.5 ${c}`}>{value}</p>
    </div>
  );
}

function StatusTag({ status }: { status: string }) {
  if (status === 'APPROVED') return <span className="text-[10px] font-bold text-emerald-600">PAID</span>;
  if (status === 'PARTIALLY_PAID') return <span className="text-[10px] font-bold text-amber-600">PARTIAL</span>;
  if (status === 'PENDING_APPROVAL') return <span className="text-[10px] font-bold text-sky-600">VERIFYING</span>;
  return <span className="text-[10px] font-bold text-ink-muted">UNPAID</span>;
}

function Field({ label, value, mono }: { label: string; value: string | number | null | undefined; mono?: boolean }) {
  // Render 0 / "0" explicitly — only fall back to em-dash for genuine empty/undefined values.
  const display = value === 0 || value === '0'
    ? '0'
    : value === null || value === undefined || value === ''
      ? '—'
      : String(value);
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-ink-muted mb-0.5 uppercase tracking-wide">{label}</p>
      <p className={`text-sm text-ink break-words ${mono ? 'font-num' : ''}`}>{display}</p>
    </div>
  );
}
