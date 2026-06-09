'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import CustomerLoader from '@/components/motion/CustomerLoader';
import { SPRING, popIn, staggerContainer, rowItem } from '@/lib/motion';
import { Customer, Retailer, EMISchedule, DueBreakdown, PaymentRequest } from '@/lib/types';
import NavBar from '@/components/NavBar';
import SearchInput from '@/components/SearchInput';
import CustomerDetailPanel from '@/components/CustomerDetailPanel';
import CustomerPaymentSummary from '@/components/CustomerPaymentSummary';
import RetailerPaymentSummary from '@/components/RetailerPaymentSummary';
import EMIScheduleTable from '@/components/EMIScheduleTable';
import DueBreakdownPanel from '@/components/DueBreakdownPanel';
import SmartAlertPopup from '@/components/SmartAlertPopup';
import PaymentModal from '@/components/PaymentModal';
import toast from 'react-hot-toast';
import { format, differenceInDays } from 'date-fns';
import Link from 'next/link';
import { calculateTotalFineFromEmis } from '@/lib/fineCalc';
import BottomNav from '@/components/BottomNav';
import UpcomingEmiWidget from '@/components/UpcomingEmiWidget';

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n);
}

interface UpcomingRow {
  customer_id: string; customer_name: string; mobile: string; imei: string;
  customer_photo_url: string | null;
  due_date: string; emi_no: number; emi_amount: number; remaining_balance: number;
  days_remaining: number;
}
interface DueRow {
  customer_id: string; customer_name: string; mobile: string; imei: string;
  overdue_count: number; earliest_due_date: string; total_fine: number;
  total_due: number; total_outstanding: number;
}

// Short, readable form of the customer UUID for display.
function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

export default function RetailerDashboard() {
  const supabaseRef2 = useRef<ReturnType<typeof createClient> | null>(null);
  if (typeof window !== 'undefined' && !supabaseRef2.current) supabaseRef2.current = createClient();
  const supabase = supabaseRef2.current!;
  const [retailer, setRetailer] = useState<Retailer | null>(null);
  const [searchResults, setSearchResults] = useState<Customer[] | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerEmis, setCustomerEmis] = useState<EMISchedule[]>([]);
  const [breakdown, setBreakdown] = useState<DueBreakdown | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [myRequests, setMyRequests] = useState<PaymentRequest[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [fineSettings, setFineSettings] = useState({ default_fine_amount: 450, weekly_fine_increment: 25 });

  // Upcoming EMI + Show Due dashboard lists (computed server-side).
  const [upcoming, setUpcoming] = useState<UpcomingRow[] | null>(null);
  const [due, setDue] = useState<DueRow[] | null>(null);
  const [listsLoading, setListsLoading] = useState(false);
  const [activeList, setActiveList] = useState<'upcoming' | 'due' | null>(null);
  // Where the open customer was launched from, so "Back to EMI List" returns there.
  const [detailSource, setDetailSource] = useState<'upcoming' | 'due' | null>(null);

  // Direct message to the selected customer (pops up on their screen)
  const [showMsgBox, setShowMsgBox] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [msgImage, setMsgImage] = useState('');
  const [msgSending, setMsgSending] = useState(false);
  // Broadcast-to-all-customers composer
  const [showBcast, setShowBcast] = useState(false);
  const [bcastText, setBcastText] = useState('');
  const [bcastImage, setBcastImage] = useState('');
  const [bcastDays, setBcastDays] = useState(7);
  const [bcastSending, setBcastSending] = useState(false);

  // Broadcast messages
  const [broadcastPopups, setBroadcastPopups] = useState<{ id: string; message: string; image_url?: string | null; expires_at: string; sender_name?: string; sender_role?: string }[]>([]);
  const [dismissedBroadcasts, setDismissedBroadcasts] = useState<Set<string>>(new Set());

  // Stable refs — safe to use inside useCallback([]) without stale closure
  const supabaseRef = useRef(supabase);
  supabaseRef.current = supabase;
  const retailerRef = useRef<Retailer | null>(null);
  retailerRef.current = retailer;
  const selectCustomerRef = useRef<(c: Customer) => Promise<void>>(async () => {});

  useEffect(() => {
    loadRetailerInfo();
    loadFineSettings();
  }, []);

  async function loadFineSettings() {
    const { data } = await supabaseRef.current.from('fine_settings').select('default_fine_amount, weekly_fine_increment').eq('id', 1).single();
    if (data) setFineSettings({
      default_fine_amount: Number(data.default_fine_amount) || 450,
      weekly_fine_increment: Number(data.weekly_fine_increment) || 25,
    });
  }

  async function loadRetailerInfo() {
    const sb = supabaseRef.current;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const { data } = await sb.from('retailers').select('*').eq('auth_user_id', user.id).single();
    if (data) {
      setRetailer(data);
      loadMyRequests(data.id);
      // Load active broadcasts for this retailer
      const { data: broadcasts } = await sb
        .from('broadcast_messages')
.select('id, message, image_url, expires_at, sender_name, sender_role')
        .eq('target_retailer_id', data.id)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      if (broadcasts?.length) setBroadcastPopups(broadcasts);
    }
  }

  // Load both dashboard lists (Upcoming EMI + Show Due) from the server, which
  // computes them over the retailer's WHOLE portfolio with the same fine rules
  // used everywhere else. `which` decides which section opens.
  async function loadLists(which: 'upcoming' | 'due') {
    setActiveList(which);
    if (upcoming === null || due === null) {
      setListsLoading(true);
      try {
        const res = await fetch('/api/retailer/emi-lists', { cache: 'no-store' });
        if (!res.ok) {
          const e = await res.json().catch(() => null);
          toast.error(e?.error || 'Failed to load EMI lists');
          return;
        }
        const d = await res.json();
        setUpcoming((d.upcoming as UpcomingRow[]) || []);
        setDue((d.due as DueRow[]) || []);
      } finally {
        setListsLoading(false);
      }
    }
  }

  async function loadMyRequests(retailerId: string) {
    const { data } = await supabaseRef.current
      .from('payment_requests')
      .select('*, customer:customers(customer_name, imei)')
      .eq('retailer_id', retailerId)
      .order('created_at', { ascending: false })
      .limit(10);
    setMyRequests(data as PaymentRequest[] || []);
  }

  const handleSearch = useCallback(async (query: string) => {
    if (!query || query.length < 3) {
      setSearchResults(null);
      setSelectedCustomer(null);
      return;
    }
    const retailerId = retailerRef.current?.id;
    if (!retailerId) return; // retailer not loaded yet

    setSearchLoading(true);
    try {
      const sb = supabaseRef.current;
      let qb = sb.from('customers').select('*, retailer:retailers(*)').eq('retailer_id', retailerId);

      if (/^\d{15}$/.test(query)) {
        qb = qb.eq('imei', query);
      } else if (/^\d{12}$/.test(query)) {
        qb = qb.eq('aadhaar', query);
      } else {
        qb = qb.ilike('customer_name', `%${query}%`);
      }

      const { data, error } = await qb.order('customer_name').limit(20);
      if (error) { console.error('Search error:', error); return; }
      const results = (data as Customer[]) || [];
      setSearchResults(results);

      if (results.length === 1) {
        await selectCustomerRef.current(results[0]);
      } else {
        setSelectedCustomer(null);
      }
    } finally {
      setSearchLoading(false);
    }
  }, []);

  async function selectCustomer(customer: Customer) {
    // Premium loading sequence — immediate feedback with a short minimum
    // on-screen time so opening a customer never feels like a dead click.
    setCustomerLoading(true);
    const started = Date.now();
    setDetailSource(null); // default: not from a list (openCustomerById re-sets it)
    setSelectedCustomer(customer);
    const sb = supabaseRef.current;
    const { data: emis } = await sb
      .from('emi_schedule')
      .select('*')
      .eq('customer_id', customer.id)
      .order('emi_no');
    setCustomerEmis((emis as EMISchedule[]) || []);

    const { data: bd, error: bdErr } = await sb.rpc('get_due_breakdown', { p_customer_id: customer.id });
    if (bdErr) {
      const el = (emis as EMISchedule[]) || []; const nx = el.find(e => e.status === 'UNPAID' || e.status === 'PARTIALLY_PAID');
      const af = calculateTotalFineFromEmis(el, fineSettings.default_fine_amount, fineSettings.weekly_fine_increment);
      const fc = customer.first_emi_charge_paid_at ? 0 : (customer.first_emi_charge_amount || 0);
      setBreakdown({ customer_id: customer.id, customer_status: customer.status, next_emi_no: nx?.emi_no, next_emi_amount: nx?.amount, next_emi_due_date: nx?.due_date, next_emi_status: nx?.status, fine_due: af, first_emi_charge_due: fc, total_payable: (nx?.amount ?? 0) + af + fc, popup_first_emi_charge: fc > 0, popup_fine_due: af > 0, is_overdue: nx ? new Date(nx.due_date) < new Date() : false } as DueBreakdown);
    } else setBreakdown(bd as DueBreakdown);
    const elapsed = Date.now() - started;
    setTimeout(() => setCustomerLoading(false), Math.max(0, 680 - elapsed));
  }

  // Always keep ref in sync
  selectCustomerRef.current = selectCustomer;

  // Open a customer from a dashboard list — fetch the full record (scoped to
  // this retailer) and show the same detail view as search. `source` records
  // which list to return to via the "Back to EMI List" button.
  async function openCustomerById(customerId: string, source: 'upcoming' | 'due' | null = null) {
    const sb = supabaseRef.current;
    const retailerId = retailerRef.current?.id;
    if (!retailerId) return;
    const { data } = await sb
      .from('customers')
      .select('*, retailer:retailers(*)')
      .eq('id', customerId)
      .eq('retailer_id', retailerId)
      .single();
    if (!data) return;
    const cust = data as Customer;
    setSearchResults([cust]);
    await selectCustomer(cust);
    setDetailSource(source); // re-set after selectCustomer clears it
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Return from an EMI-detail screen to the list it was opened from.
  function backToEmiList() {
    const src = detailSource;
    setSelectedCustomer(null);
    setSearchResults(null);
    setDetailSource(null);
    if (src) setActiveList(src);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Send a direct broadcast to the selected customer — it pops up on the
  // customer's own login screen the next time they open the app.
  async function sendCustomerMessage() {
    if (!selectedCustomer || !msgText.trim()) return;
    setMsgSending(true);
    try {
      const expires_at = new Date(Date.now() + 7 * 86400000).toISOString();
      const res = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_customer_id: selectedCustomer.id,
          message: msgText.trim(),
          image_url: msgImage.trim() || null,
          expires_at,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Failed to send'); return; }
      toast.success(`Message sent to ${selectedCustomer.customer_name}`);
      setMsgText(''); setMsgImage(''); setShowMsgBox(false);
    } finally {
      setMsgSending(false);
    }
  }

  // Send a broadcast to EVERY customer of this retailer. The backend stores it
  // with the retailer scope and no specific customer, so it pops up on all of
  // the retailer's customers' apps (with the optional image).
  async function sendRetailerBroadcast() {
    if (!bcastText.trim()) return;
    if (!confirm('Send this announcement to ALL your customers? It will pop up on every customer’s app.')) return;
    setBcastSending(true);
    try {
      const expires_at = new Date(Date.now() + Math.max(1, bcastDays) * 86400000).toISOString();
      const res = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No target_customer_id → retailer-wide → reaches every customer.
        body: JSON.stringify({
          message: bcastText.trim(),
          image_url: bcastImage.trim() || null,
          expires_at,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Failed to send broadcast'); return; }
      toast.success('Broadcast sent to all your customers');
      setBcastText(''); setBcastImage(''); setShowBcast(false);
    } finally {
      setBcastSending(false);
    }
  }

  const paidCount = customerEmis.filter(e => e.status === 'APPROVED').length;

  return (
    <div className="min-h-screen page-bg">
      <NavBar role="retailer" userName={retailer?.name || 'Retailer'} />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
        {/* Welcome Banner */}
        <motion.div
          className="card p-5 mb-8 flex items-center justify-between sheen-track"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
        >
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">
              Welcome,{' '}
              <motion.span
                className="inline-block"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...SPRING, delay: 0.15 }}
              >
                {retailer?.name || 'Retailer'}
              </motion.span>
              <motion.span
                className="inline-block ml-1 origin-bottom"
                animate={{ rotate: [0, 18, -8, 18, 0] }}
                transition={{ duration: 1.4, delay: 0.4, repeat: Infinity, repeatDelay: 3 }}
              >👋</motion.span>
            </h1>
            <p className="text-ink-muted text-sm mt-0.5">Search your customers to collect EMI payments</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-ink-muted">Today</p>
            <p className="font-num text-sm text-ink">{format(new Date(), 'd MMM yyyy')}</p>
          </div>
        </motion.div>

        {/* Consolidated retailer payment summary — top of the page */}
        {retailer && (
          <div className="mb-6">
            <RetailerPaymentSummary
              retailerId={retailer.id}
              retailerName={retailer.name}
              baseFine={fineSettings.default_fine_amount}
              weeklyIncrement={fineSettings.weekly_fine_increment}
              hideLoanAmount
            />
          </div>
        )}

        {/* Broadcast Message Popups */}
        {broadcastPopups.filter(b => !dismissedBroadcasts.has(b.id)).map(b => (
          <div key={b.id} className="card p-4 mb-4 border-l-4 border-info bg-info-light animate-fade-in relative">
            <button
              onClick={() => setDismissedBroadcasts(prev => new Set([...prev, b.id]))}
              className="absolute top-2 right-2 text-info hover:text-ink text-sm"
            >✕</button>
            <div className="flex items-start gap-3">
              <span className="text-2xl">📢</span>
              <div>
                <p className="font-semibold text-info text-sm">Message from {b.sender_name || 'TELEPOINT'}</p>
                <p className="text-ink text-sm mt-1">{b.message}</p>
                {b.image_url && <img src={b.image_url} alt="" className="mt-2 max-h-32 rounded-xl border border-surface-4 object-cover" />}
                <p className="text-xs text-ink-muted mt-1">Valid until: {format(new Date(b.expires_at), 'd MMM yyyy')}</p>
              </div>
            </div>
          </div>
        ))}

        {/* Broadcast to ALL my customers */}
        <div className="card overflow-hidden mb-4 border-l-4 border-brand-500">
          <button
            onClick={() => setShowBcast(v => !v)}
            className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-surface-2 transition-colors"
          >
            <span className="text-sm font-semibold text-ink">📣 Broadcast to all my customers</span>
            <span className="text-xs text-ink-muted">{showBcast ? 'Close' : 'Send announcement'}</span>
          </button>
          {showBcast && (
            <div className="px-5 pb-4 pt-1 space-y-3 border-t border-surface-4 animate-fade-in">
              <textarea
                value={bcastText}
                onChange={e => setBcastText(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Write an announcement for all your customers…"
                className="input w-full resize-none"
              />
              <input
                type="url"
                value={bcastImage}
                onChange={e => setBcastImage(e.target.value)}
                placeholder="Optional image URL (e.g. https://i.ibb.co/...)"
                className="input w-full"
              />
              {bcastImage.trim() && (
                <img src={bcastImage} alt="" className="max-h-32 rounded-xl border border-surface-4 object-cover" />
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="text-xs text-ink-muted flex items-center gap-2">
                  Valid for
                  <select
                    value={bcastDays}
                    onChange={e => setBcastDays(Number(e.target.value))}
                    className="input py-1 text-xs w-auto"
                  >
                    <option value={1}>1 day</option>
                    <option value={3}>3 days</option>
                    <option value={7}>7 days</option>
                    <option value={15}>15 days</option>
                    <option value={30}>30 days</option>
                  </select>
                </label>
                <button
                  onClick={sendRetailerBroadcast}
                  disabled={bcastSending || !bcastText.trim()}
                  className="btn-primary text-sm"
                >
                  {bcastSending ? 'Sending…' : 'Send to all customers'}
                </button>
              </div>
              <p className="text-[11px] text-ink-muted">
                Pops up on every one of your customers’ apps until it expires.
              </p>
            </div>
          )}
        </div>

        {/* Upcoming EMI / Show Due dashboard — hidden while a customer is open */}
        {!selectedCustomer && (
          <>
            <div className="mb-4 flex flex-wrap gap-2 items-center">
              <button
                onClick={() => loadLists('upcoming')}
                className={activeList === 'upcoming' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
              >
                🔔 Upcoming (Next 5 Days){upcoming && upcoming.length > 0 ? ` (${upcoming.length})` : ''}
              </button>
              <button
                onClick={() => loadLists('due')}
                className={activeList === 'due' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
              >
                ⚠️ Show Due{due && due.length > 0 ? ` (${due.length})` : ''}
              </button>
              {activeList && (
                <button onClick={() => setActiveList(null)} className="btn-ghost text-xs">Hide</button>
              )}
            </div>

            {listsLoading && (
              <div className="card overflow-hidden mb-6 animate-fade-in">
                <div className="px-5 py-3 border-b border-surface-4">
                  <div className="skeleton h-4 w-48" />
                </div>
                <div className="divide-y divide-surface-3">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                      <div className="skeleton h-12 w-12 rounded-2xl" />
                      <div className="flex-1 space-y-2">
                        <div className="skeleton h-3.5 w-1/3" />
                        <div className="skeleton h-3 w-1/2" />
                      </div>
                      <div className="skeleton h-6 w-20 rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── UPCOMING EMI (Next 5 Days) — premium animated widget ─────── */}
            {!listsLoading && activeList === 'upcoming' && upcoming !== null && (
              <UpcomingEmiWidget
                rows={upcoming}
                onOpen={id => openCustomerById(id, 'upcoming')}
              />
            )}

            {/* ── SHOW DUE (overdue customers, combined per customer) ───────── */}
            {!listsLoading && activeList === 'due' && due !== null && (
              <div className="card overflow-hidden mb-6 animate-fade-in border-l-4 border-crimson-400">
                <div className="px-5 py-3 border-b border-white/[0.05] flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">⚠️ Show Due — overdue customers</span>
                  <span className="text-xs text-ink-muted">{due.length} customer{due.length === 1 ? '' : 's'}</span>
                </div>
                {due.length === 0 ? (
                  <div className="px-5 py-6 text-ink-muted text-sm text-center">No overdue customers 🎉</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="data-table text-xs sm:text-sm">
                      <thead>
                        <tr>
                          <th>Customer</th><th>Customer ID</th><th>Mobile</th>
                          <th>Overdue EMIs</th><th>Total Due</th><th>Total Fine</th><th>Total Outstanding</th>
                        </tr>
                      </thead>
                      <motion.tbody variants={staggerContainer(0.05, 0.04)} initial="hidden" animate="show">
                        {due.map(d => (
                          <motion.tr
                            key={d.customer_id}
                            variants={rowItem}
                            whileHover={{ scale: 1.005 }}
                            onClick={() => openCustomerById(d.customer_id, 'due')}
                            className="cursor-pointer hover:bg-rose-50 transition-colors"
                            title="Open detailed breakdown"
                          >
                            <td>
                              <p className="text-ink font-medium">{d.customer_name}</p>
                              <p className="text-xs text-ink-muted">Since {format(new Date(d.earliest_due_date), 'd MMM yyyy')}</p>
                            </td>
                            <td><span className="font-num text-xs text-ink-muted" title={d.customer_id}>{shortId(d.customer_id)}</span></td>
                            <td><span className="font-num text-ink-muted">{d.mobile || '—'}</span></td>
                            <td><span className="badge bg-rose-100 text-rose-800 border border-rose-300 font-num">{d.overdue_count}</span></td>
                            <td><span className="font-num font-semibold text-crimson-500">{fmt(d.total_due)}</span></td>
                            <td><span className="font-num text-rose-700">{fmt(d.total_fine)}</span></td>
                            <td><span className="font-num font-bold text-ink">{fmt(d.total_outstanding)}</span></td>
                          </motion.tr>
                        ))}
                      </motion.tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Search */}
        <div className="mb-6">
          <SearchInput onSearch={handleSearch} loading={searchLoading} placeholder="Search your customers by name (3+ chars), IMEI (15 digits), or Aadhaar (12 digits)..." autoFocus />
        </div>

        {/* Empty state */}
        {searchResults === null && (
          <div className="animate-fade-in">
            <div className="flex flex-col items-center justify-center py-16 text-center mb-8">
              <div className="w-20 h-20 rounded-3xl bg-surface-2 border border-white/[0.05] flex items-center justify-center mb-5">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(232,184,0,0.4)" strokeWidth="1.5">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
              </div>
              <p className="text-ink-muted text-lg">Search for a customer to begin</p>
              <p className="text-ink-muted text-sm mt-1">Only your own customers are shown</p>
            </div>

            {/* Recent requests */}
            {myRequests.length > 0 && (
              <div>
                <p className="section-header">Recent Payment Requests</p>
                <div className="card overflow-hidden">
                  <table className="data-table text-xs sm:text-sm">
                    <thead>
                      <tr><th>Customer</th><th>Amount</th><th>Mode</th><th>Status</th><th>Date</th><th></th></tr>
                    </thead>
                    <tbody>
                      {myRequests.map(r => {
                        const cust = r.customer as { customer_name?: string; imei?: string };
                        return (
                          <tr key={r.id}>
                            <td>
                              <p className="text-ink font-medium">{cust?.customer_name}</p>
                              <p className="text-xs text-ink-muted font-num">{cust?.imei}</p>
                            </td>
                            <td><span className="font-num font-semibold">{fmt(r.total_amount)}</span></td>
                            <td><span className={`text-xs font-semibold ${r.mode === 'UPI' ? 'text-info' : 'text-success'}`}>{r.mode}</span></td>
                            <td>
                              {r.status === 'PENDING' && <span className="badge-pending">Pending</span>}
                              {r.status === 'APPROVED' && <span className="badge-approved">Approved</span>}
                              {r.status === 'REJECTED' && <span className="badge-rejected">Rejected</span>}
                            </td>
                            <td className="text-xs text-ink-muted">{format(new Date(r.created_at), 'd MMM, h:mm a')}</td>
                            <td>
                              <Link href={`/receipt/${r.id}`} target="_blank" className="text-xs text-info hover:text-info">
                                Receipt →
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Search results list */}
        {searchResults !== null && searchResults.length === 0 && (
          <div className="text-center py-16 animate-fade-in">
            <p className="text-ink-muted">No customers found. Try a different search.</p>
          </div>
        )}

        {searchResults !== null && searchResults.length > 1 && !selectedCustomer && (
          <div className="card overflow-hidden animate-fade-in">
            <div className="px-5 py-3 border-b border-white/[0.05]">
              <span className="text-xs text-ink-muted uppercase tracking-widest">{searchResults.length} customers found — tap a card to view</span>
            </div>
            <motion.div
              className="divide-y divide-surface-3"
              initial="hidden"
              animate="show"
              variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.03 } } }}
            >
              {searchResults.map(c => {
                const rowTint =
                  c.status === 'RUNNING'  ? 'hover:bg-emerald-50' :
                  c.status === 'SETTLED'  ? 'hover:bg-amber-50' :
                  c.status === 'NPA'      ? 'hover:bg-rose-50' :
                                            'hover:bg-sky-50';
                const stripe =
                  c.status === 'RUNNING'  ? 'border-emerald-400' :
                  c.status === 'SETTLED'  ? 'border-amber-400' :
                  c.status === 'NPA'      ? 'border-rose-400' :
                                            'border-sky-400';
                const statusBadge =
                  c.status === 'RUNNING'
                    ? <span className="badge bg-emerald-100 text-emerald-800 border border-emerald-300">● Running</span>
                    : c.status === 'SETTLED'
                    ? <span className="badge bg-amber-100 text-amber-800 border border-amber-300">⚖ Settled</span>
                    : c.status === 'NPA'
                    ? <span className="badge bg-rose-100 text-rose-800 border border-rose-300">⚠ NPA</span>
                    : <span className="badge bg-sky-100 text-sky-800 border border-sky-300">✓ Complete</span>;
                return (
                  <motion.button
                    key={c.id}
                    variants={{ hidden: { opacity: 0, y: 16, scale: 0.98 }, show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 30, mass: 0.7 } } }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => selectCustomer(c)}
                    className={`w-full text-left px-4 py-3.5 border-l-4 ${stripe} ${rowTint} transition-colors flex flex-col gap-2`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-ink font-semibold truncate">{c.customer_name}</p>
                        {c.father_name && <p className="text-xs text-ink-muted truncate">C/O {c.father_name}</p>}
                      </div>
                      <div className="shrink-0">{statusBadge}</div>
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                      <span className="text-ink-muted">IMEI <span className="font-num text-ink">{c.imei || '—'}</span></span>
                      <span className="text-ink-muted">Mobile <span className="font-num text-ink">{c.mobile || '—'}</span></span>
                      <span className="text-ink-muted">EMI <span className="font-num font-bold text-brand-700">{fmt(c.emi_amount)}</span></span>
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          </div>
        )}

        {/* Selected customer view */}
        {selectedCustomer && (
          <div className="space-y-5 animate-slide-up pb-32 sm:pb-0">
            {/* Back to the EMI list this customer was opened from */}
            {detailSource && (
              <button onClick={backToEmiList} className="btn-ghost flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                Back to EMI List
              </button>
            )}
            {/* Back button (multi-result search) */}
            {!detailSource && searchResults && searchResults.length > 1 && (
              <button onClick={() => setSelectedCustomer(null)} className="btn-ghost flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                Back to results
              </button>
            )}

            {/* Customer details first, then the payment summary directly beneath. */}
            <CustomerDetailPanel customer={selectedCustomer} paidCount={paidCount} totalEmis={selectedCustomer.emi_tenure} />

            {/* Direct message to this customer — pops up on their screen */}
            <div className="card overflow-hidden">
              <button
                onClick={() => setShowMsgBox(v => !v)}
                className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-surface-2 transition-colors"
              >
                <span className="text-sm font-semibold text-ink">📢 Message this customer</span>
                <span className="text-xs text-ink-muted">{showMsgBox ? 'Close' : 'Send a popup'}</span>
              </button>
              {showMsgBox && (
                <div className="px-5 pb-4 pt-1 space-y-3 border-t border-surface-4 animate-fade-in">
                  <textarea
                    value={msgText}
                    onChange={e => setMsgText(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder={`Write a message for ${selectedCustomer.customer_name}…`}
                    className="input w-full resize-none"
                  />
                  <input
                    type="url"
                    value={msgImage}
                    onChange={e => setMsgImage(e.target.value)}
                    placeholder="Optional image URL"
                    className="input w-full"
                  />
                  {msgImage.trim() && (
                    <img src={msgImage} alt="" className="max-h-32 rounded-xl border border-surface-4 object-cover" />
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-ink-muted">Pops up on the customer&apos;s screen · valid 7 days</p>
                    <button
                      onClick={sendCustomerMessage}
                      disabled={msgSending || !msgText.trim()}
                      className="btn-primary text-sm"
                    >
                      {msgSending ? 'Sending…' : 'Send Message'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <CustomerPaymentSummary
              customer={selectedCustomer}
              emis={customerEmis}
              breakdown={breakdown}
              baseFine={fineSettings.default_fine_amount}
              weeklyIncrement={fineSettings.weekly_fine_increment}
              hideLoanAmount
            />

            {/* Smart alert popup — EMI due in 5 days / fine due / 1st EMI charge pending */}
            {breakdown && (
              <SmartAlertPopup
                key={selectedCustomer.id}
                fineDue={breakdown.fine_due ?? 0}
                daysUntilDue={breakdown.next_emi_due_date ? differenceInDays(new Date(breakdown.next_emi_due_date), new Date()) : null}
                nextEmiNo={breakdown.next_emi_no}
                nextEmiAmount={breakdown.next_emi_amount}
                firstChargeDue={breakdown.first_emi_charge_due ?? 0}
              />
            )}

            {breakdown && (() => {
              const daysLeft = breakdown.next_emi_due_date ? differenceInDays(new Date(breakdown.next_emi_due_date), new Date()) : null;
              return (
                <motion.div className="space-y-2" variants={staggerContainer(0.1, 0.05)} initial="hidden" animate="show">
                  {breakdown.fine_due > 0 && (
                    <motion.div variants={popIn} className="alert-red border-2">
                      <p className="font-bold text-base text-crimson-400">⚠️ Fine Pending</p>
                      <p className="text-sm font-semibold text-ink-muted mt-0.5">Pending fine: {fmt(breakdown.fine_due)}</p>
                    </motion.div>
                  )}
                  {(breakdown.first_emi_charge_due ?? 0) > 0 && (
                    <motion.div variants={popIn} className="alert-gold border-2">
                      <p className="font-bold text-base text-gold-400">⚠️ 1ST EMI CHARGE Pending</p>
                      <p className="text-sm font-semibold text-ink-muted mt-0.5">Pending amount: {fmt(breakdown.first_emi_charge_due || 0)}</p>
                    </motion.div>
                  )}
                  {daysLeft !== null && daysLeft >= 0 && daysLeft <= 5 && (
                    <motion.div variants={popIn} className="alert-blue border-2">
                      <p className="font-bold text-base text-sapphire-400">🔔 EMI Upcoming in {daysLeft} day{daysLeft === 1 ? '' : 's'}</p>
                      <p className="text-sm font-semibold text-ink-muted mt-0.5">
                        EMI #{breakdown.next_emi_no ?? '—'} due on {breakdown.next_emi_due_date ? format(new Date(breakdown.next_emi_due_date), 'd MMM yyyy') : '—'}
                      </p>
                    </motion.div>
                  )}
                </motion.div>
              );
            })()}

            {breakdown && <DueBreakdownPanel breakdown={breakdown} />}

            {/* Collect payment button — sticky on mobile, right-aligned on desktop */}
            {selectedCustomer.status === 'RUNNING' ? (() => {
              const hasUnpaidEmis = customerEmis.some(e => e.status === 'UNPAID' || e.status === 'PARTIALLY_PAID');
              const hasUnpaidFine = (breakdown?.fine_due ?? 0) > 0;
              const hasUnpaidCharge = (breakdown?.first_emi_charge_due ?? 0) > 0;
              const canCollect = hasUnpaidEmis || hasUnpaidFine || hasUnpaidCharge;
              const label = !canCollect
                ? '✓ Fully Paid'
                : hasUnpaidEmis
                  ? `💳 Collect EMI #${breakdown?.next_emi_no ?? ''}`
                  : hasUnpaidFine
                    ? '⚠ Collect Fine'
                    : '⭐ Collect 1st Charge';
              return (
                <>
                  {/* Desktop: inline right-aligned */}
                  <div className="hidden sm:flex justify-end">
                    <button
                      onClick={() => setShowPaymentModal(true)}
                      disabled={!canCollect}
                      className="btn-primary text-base px-8 py-3.5"
                    >
                      {label}
                    </button>
                  </div>
                  {/* Mobile: sticky bottom bar — always visible, never scrolls away */}
                  <div className="sm:hidden fixed bottom-16 left-0 right-0 z-40 px-4 pb-2 pt-3 bg-white/95 backdrop-blur-sm border-t border-surface-4 shadow-lg">
                    <button
                      onClick={() => setShowPaymentModal(true)}
                      disabled={!canCollect}
                      className="btn-primary w-full text-base py-4 font-semibold"
                      style={{ minHeight: 56 }}
                    >
                      {canCollect && breakdown
                        ? `${label} · ${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:0}).format(breakdown.total_payable)}`
                        : label
                      }
                    </button>
                  </div>
                </>
              );
            })() : (
              <div className="alert-blue">
                <p className="text-sapphire-300 font-semibold">✓ Account Complete</p>
                <p className="text-info/70 text-sm mt-0.5">Payment collection is not allowed for completed accounts.</p>
              </div>
            )}

            <EMIScheduleTable
              emis={customerEmis}
              nextUnpaidNo={breakdown?.next_emi_no ?? undefined}
              isAdmin={false}
              defaultFineAmount={fineSettings.default_fine_amount}
              weeklyIncrement={fineSettings.weekly_fine_increment}
            />
          </div>
        )}
      </div>

      {/* Payment Modal */}
      <AnimatePresence>
        {showPaymentModal && selectedCustomer && (
          <PaymentModal
            customer={selectedCustomer}
            emis={customerEmis}
            breakdown={breakdown}
            onClose={() => setShowPaymentModal(false)}
            onSubmitted={() => {
              selectCustomer(selectedCustomer);
              if (retailer) loadMyRequests(retailer.id);
            }}
            isAdmin={false}
            baseFine={fineSettings.default_fine_amount}
            weeklyIncrement={fineSettings.weekly_fine_increment}
          />
        )}
      </AnimatePresence>
      <BottomNav role="retailer" />

      {/* Premium customer-open loading sequence */}
      <AnimatePresence>
        {customerLoading && <CustomerLoader name={selectedCustomer?.customer_name} />}
      </AnimatePresence>
    </div>
  );
}
