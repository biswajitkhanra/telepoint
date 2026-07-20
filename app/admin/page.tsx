'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Customer, Retailer, EMISchedule, DueBreakdown } from '@/lib/types';
import NavBar from '@/components/NavBar';
import SearchInput from '@/components/SearchInput';
import CustomerDetailPanel from '@/components/CustomerDetailPanel';
import PhoneLockBadge from '@/components/PhoneLockBadge';
import CustomerPaymentSummary from '@/components/CustomerPaymentSummary';
import RetailerPaymentSummary from '@/components/RetailerPaymentSummary';
import CustomerFormModal from '@/components/CustomerFormModal';
import EMIScheduleTable from '@/components/EMIScheduleTable';
import DueBreakdownPanel from '@/components/DueBreakdownPanel';
import SmartAlertPopup from '@/components/SmartAlertPopup';
import PaymentModal from '@/components/PaymentModal';
import toast from 'react-hot-toast';
import { calculateTotalFineFromEmis } from '@/lib/fineCalc';
import BottomNav from '@/components/BottomNav';
import { format } from 'date-fns';
import { diffDaysIST } from '@/lib/ist';
import { formatCurrency, formatDateOnly, readJsonSafe } from '@/lib/formatters';
import { motion, AnimatePresence } from 'framer-motion';
import dynamicImport from 'next/dynamic';
import StackUnfold from '@/components/motion/StackUnfold';
import ShelfSearch from '@/components/motion/ShelfSearch';
import { SPRING, staggerContainer, rowItem } from '@/lib/motion';
import { customerCodeOf, looksLikeCustomerCode, normalizeCustomerCode } from '@/lib/customerCode';

// Heavy dashboard surfaces are code-split — each loads only when its tab is
// opened, keeping the initial admin bundle small and first paint fast.
const hubLoading = () => (
  <div className="space-y-4 py-2">
    <div className="skeleton h-24 w-full rounded-2xl" />
    <div className="skeleton h-40 w-full rounded-2xl" />
    <div className="skeleton h-40 w-full rounded-2xl" />
  </div>
);
const ReportsHub = dynamicImport(() => import('@/components/reports/ReportsHub'), { ssr: false, loading: hubLoading });
const AnalyticsPro = dynamicImport(() => import('@/components/analytics/AnalyticsPro'), { ssr: false, loading: hubLoading });
const SettingsHub = dynamicImport(() => import('@/components/settings/SettingsHub'), { ssr: false, loading: hubLoading });

type Tab = 'search' | 'retailers' | 'reports' | 'analysis' | 'settings' | 'broadcast';

const fmt = formatCurrency;

export default function AdminDashboard() {
  const supabaseRef2 = useRef<ReturnType<typeof createClient> | null>(null);
  if (typeof window !== 'undefined' && !supabaseRef2.current) supabaseRef2.current = createClient();
  const supabase = supabaseRef2.current!;
  const [tab, setTab] = useState<Tab>('search');
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [searchResults, setSearchResults] = useState<Customer[] | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerEmis, setCustomerEmis] = useState<EMISchedule[]>([]);
  const [breakdown, setBreakdown] = useState<DueBreakdown | null>(null);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeRemark, setCompleteRemark] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteRemark, setDeleteRemark] = useState('');
  const [showRetailerForm, setShowRetailerForm] = useState(false);
  const [editingRetailer, setEditingRetailer] = useState<Retailer | null>(null);
  const [retailerForm, setRetailerForm] = useState({ name: '', username: '', password: '', retail_pin: '', mobile: '' });
  const [fineSettings, setFineSettings] = useState({ default_fine_amount: 450, weekly_fine_increment: 25 });
  const [pendingCount, setPendingCount] = useState(0);

  // Settlement modal
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleLoading, setSettleLoading] = useState(false);

  // Broadcast message state
  const [broadcastRetailerId, setBroadcastRetailerId] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastImageUrl, setBroadcastImageUrl] = useState('');
  const [broadcastExpiry, setBroadcastExpiry] = useState('');
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastHistory, setBroadcastHistory] = useState<{
    id: string; message: string; image_url?: string | null; expires_at: string; created_at: string;
    retailer?: { name?: string };
  }[]>([]);

  // Retailer drill-down (collection summary panel)
  const [summaryRetailerId, setSummaryRetailerId] = useState<string | null>(null);

  // Stable refs so callbacks never capture stale closures
  const supabaseRef = useRef(supabase);
  supabaseRef.current = supabase;

  // selectCustomerRef always points to latest selectCustomerFn
  // so handleSearch (memoised with []) never calls a stale version
  const selectCustomerRef = useRef<(c: Customer) => Promise<void>>(async () => {});

  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    loadRetailers();
    loadFineSettings();
    loadPendingCount();
    loadBroadcasts();
  }, []);

  async function loadPendingCount() {
    const { count } = await supabase.from('payment_requests').select('*', { count: 'exact', head: true }).eq('status', 'PENDING');
    setPendingCount(count || 0);
  }

  async function loadRetailers() {
    const { data } = await supabase.from('retailers').select('*').order('name');
    setRetailers(data || []);
  }

  async function loadFineSettings() {
    const { data } = await supabase.from('fine_settings').select('*').eq('id', 1).single();
    if (data) setFineSettings(data);
  }

  async function loadBroadcasts() {
    const { data } = await supabase
      .from('broadcast_messages')
      .select('*, retailer:retailers(name)')
      .order('created_at', { ascending: false })
      .limit(20);
    setBroadcastHistory((data || []) as typeof broadcastHistory);
  }

  const handleSearch = useCallback(async (query: string) => {
    if (!query || query.length < 3) {
      setSearchResults(null);
      setSelectedCustomer(null);
      return;
    }
    setSearchLoading(true);
    const started = Date.now();
    try {
      const sb = supabaseRef.current;
      let qb = sb.from('customers').select('*, retailer:retailers(*)');
      if (looksLikeCustomerCode(query)) qb = qb.ilike('customer_code', normalizeCustomerCode(query) + '%');
      else if (/^\d{15}$/.test(query)) qb = qb.eq('imei', query);
      else if (/^\d{12}$/.test(query)) qb = qb.eq('aadhaar', query);
      else qb = qb.ilike('customer_name', `%${query}%`);

      let { data, error } = await qb.order('customer_name').limit(20);
      // Customer-code search before migration 025 is applied (column missing):
      // fall back to a name search so the box never hard-fails.
      if (error && looksLikeCustomerCode(query)) {
        ({ data, error } = await sb.from('customers').select('*, retailer:retailers(*)')
          .ilike('customer_name', `%${query}%`).order('customer_name').limit(20));
      }
      if (error) { console.error('Search error:', error); return; }
      const results = (data as Customer[]) || [];
      setSearchResults(results);
      if (results.length === 1) await selectCustomerRef.current(results[0]);
      else setSelectedCustomer(null);
    } finally {
      // Keep the dancing-skeleton loader up for a short minimum so the search
      // never flashes — then the results take the stage.
      const elapsed = Date.now() - started;
      setTimeout(() => setSearchLoading(false), Math.max(0, 1100 - elapsed));
    }
  }, []);

  async function selectCustomerFn(customer: Customer) {
    // Premium loading sequence — guarantees immediate feedback (no dead-click
    // feeling) with a short minimum on-screen time even if data is instant.
    setCustomerLoading(true);
    const started = Date.now();
    setSelectedCustomer(customer);
    const sb = supabaseRef.current;
    const { data: emis } = await sb.from('emi_schedule').select('*').eq('customer_id', customer.id).order('emi_no');
    const emiList = (emis as EMISchedule[]) || [];
    setCustomerEmis(emiList);
    const { data: bd, error: bdErr } = await sb.rpc('get_due_breakdown', { p_customer_id: customer.id });
    if (bdErr) {
      const next = emiList.find(e => e.status === 'UNPAID' || e.status === 'PARTIALLY_PAID');
      const af = calculateTotalFineFromEmis(emiList);
      const fc = customer.first_emi_charge_paid_at ? 0 : (customer.first_emi_charge_amount || 0);
      setBreakdown({ customer_id: customer.id, customer_status: customer.status, next_emi_no: next?.emi_no, next_emi_amount: next?.amount, next_emi_due_date: next?.due_date, next_emi_status: next?.status, fine_due: af, first_emi_charge_due: fc, total_payable: (next?.amount ?? 0) + af + fc, popup_first_emi_charge: fc > 0, popup_fine_due: af > 0, is_overdue: next ? new Date(next.due_date) < new Date() : false } as DueBreakdown);
    } else setBreakdown(bd as DueBreakdown);
    const elapsed = Date.now() - started;
    setTimeout(() => setCustomerLoading(false), Math.max(0, 1000 - elapsed));
  }

  // Always keep ref in sync with latest function
  selectCustomerRef.current = selectCustomerFn;

  async function refreshSelectedCustomer() {
    if (!selectedCustomer) return;
    const sb = supabaseRef.current;
    const { data: fresh } = await sb
      .from('customers')
      .select('*, retailer:retailers(*)')
      .eq('id', selectedCustomer.id)
      .single();
    await selectCustomerFn((fresh as Customer) ?? selectedCustomer);
  }

  async function handleMarkComplete() {
    if (!selectedCustomer || !completeRemark.trim()) { toast.error('Completion remark required'); return; }

    // Check if all EMIs are paid
    const unpaidCount = customerEmis.filter(e => e.status !== 'APPROVED').length;
    const finalStatus = unpaidCount > 0 ? 'NPA' : 'COMPLETE';

    if (finalStatus === 'NPA') {
      if (!confirm(`⚠ ${unpaidCount} EMI(s) still unpaid. This will mark the customer as NPA (Non-Performing Asset). Continue?`)) return;
    }

    const { error } = await supabase.from('customers').update({
      status: finalStatus,
      completion_remark: completeRemark,
      completion_date: new Date().toISOString().split('T')[0],
    }).eq('id', selectedCustomer.id);
    if (error) toast.error(error.message);
    else {
      toast.success(finalStatus === 'NPA' ? 'Marked as NPA' : 'Marked as COMPLETE');
      setShowCompleteModal(false);
      setCompleteRemark('');
      await selectCustomerFn({ ...selectedCustomer, status: finalStatus as Customer['status'] });
    }
  }

  async function handleMoveToRunning() {
    if (!selectedCustomer) return;
    const { error } = await supabase.from('customers').update({
      status: 'RUNNING',
      completion_remark: null,
      completion_date: null,
    }).eq('id', selectedCustomer.id);
    if (error) toast.error(error.message);
    else {
      toast.success('Moved back to RUNNING');
      await selectCustomerFn({ ...selectedCustomer, status: 'RUNNING' });
    }
  }

  async function handleSettlement() {
    if (!selectedCustomer || !settleAmount || Number(settleAmount) <= 0) {
      toast.error('Enter a valid settlement amount');
      return;
    }
    if (!confirm(`⚠ Settle ${selectedCustomer.customer_name}'s account for ₹${settleAmount}? This will close all remaining EMIs.`)) return;

    setSettleLoading(true);
    try {
      const res = await fetch('/api/settlement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: selectedCustomer.id, settlement_amount: Number(settleAmount) }),
      });
      const data = await readJsonSafe<{ error?: string }>(res) || {};
      if (res.ok) {
        toast.success('Account settled successfully');
        setShowSettleModal(false);
        setSettleAmount('');
        await selectCustomerFn({ ...selectedCustomer, status: 'SETTLED' });
      } else {
        toast.error(data.error || 'Settlement failed');
      }
    } finally {
      setSettleLoading(false);
    }
  }

  /** Jump to the Search tab and open one customer's full file (used by the
      Reports hub for filter-row and expected-loss drill-downs). */
  const openCustomerById = useCallback(async (customerId: string) => {
    setTab('search');
    const { data: cc } = await supabaseRef.current
      .from('customers')
      .select('*, retailer:retailers(*)')
      .eq('id', customerId)
      .single();
    if (cc) {
      setSearchResults([cc as Customer]);
      await selectCustomerRef.current(cc as Customer);
    }
  }, []);

  async function handleDeleteCustomer() {
    if (!selectedCustomer || !deleteRemark.trim()) { toast.error('Deletion reason required'); return; }
    const { error } = await supabase.from('customers').delete().eq('id', selectedCustomer.id);
    if (error) toast.error(error.message);
    else {
      toast.success('Customer deleted');
      setShowDeleteConfirm(false);
      setDeleteRemark('');
      setSelectedCustomer(null);
      setSearchResults(null);
    }
  }

  async function handleRetailerSubmit(e: React.FormEvent) {
    e.preventDefault();
    const method = editingRetailer ? 'PATCH' : 'POST';
    const body = editingRetailer
      ? { id: editingRetailer.id, name: retailerForm.name, ...(retailerForm.password && { password: retailerForm.password }), ...(retailerForm.retail_pin && { retail_pin: retailerForm.retail_pin }), mobile: retailerForm.mobile || null }
      : { name: retailerForm.name, username: retailerForm.username, password: retailerForm.password, retail_pin: retailerForm.retail_pin, mobile: retailerForm.mobile || null };

    const res = await fetch('/api/retailers', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await readJsonSafe<{ error?: string }>(res) || {};
    if (res.ok) { toast.success(editingRetailer ? 'Retailer updated' : 'Retailer created'); loadRetailers(); setShowRetailerForm(false); }
    else toast.error(data.error);
  }

  async function handleDeleteRetailer(id: string) {
    if (!confirm('Delete this retailer? This cannot be undone.')) return;
    const res = await fetch(`/api/retailers?id=${id}`, { method: 'DELETE' });
    const data = await readJsonSafe<{ error?: string }>(res) || {};
    if (res.ok) { toast.success('Retailer deleted'); loadRetailers(); }
    else toast.error(data.error);
  }

  async function handleToggleRetailerActive(r: Retailer) {
    const res = await fetch('/api/retailers', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: r.id, is_active: !r.is_active }),
    });
    if (res.ok) { toast.success(r.is_active ? 'Retailer deactivated' : 'Retailer activated'); loadRetailers(); }
  }

  const paidCount = customerEmis.filter((e) => e.status === 'APPROVED').length;

  return (
    <div className="min-h-screen page-bg">
      <NavBar role="admin" userName="TELEPOINT" pendingCount={pendingCount} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mb-8 bg-surface-2 rounded-2xl p-1.5 border border-surface-4 overflow-x-auto" style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
          {([
            { key: 'search', label: '🔍 Search' },
            { key: 'retailers', label: '🏪 Shops' },
            { key: 'reports', label: '📊 Reports' },
            { key: 'analysis', label: '📈 Analytics' },
            { key: 'settings', label: '⚙️ Settings' },
            { key: 'broadcast', label: '📢 Alerts' },
          ] as const).map((t) => (
            <motion.button
              key={t.key}
              onClick={() => setTab(t.key)}
              whileTap={{ scale: 0.94 }}
              className={`relative z-10 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap flex-shrink-0 transition-colors duration-200 ${
                tab === t.key ? 'text-white' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {tab === t.key && (
                <motion.span
                  layoutId="admin-tab-pill"
                  className="absolute inset-0 rounded-xl bg-brand-500 shadow-lg shadow-brand-500/20 -z-10"
                  transition={SPRING}
                />
              )}
              {t.label}
            </motion.button>
          ))}
        </div>

        {/* Animated tab transition — content slides/fades in on every switch */}
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >

        {/* ===== SEARCH TAB ===== */}
        {tab === 'search' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-display text-3xl font-bold text-ink">Customer Search</h1>
                <p className="text-ink-muted text-sm mt-1">Search all customers — RUNNING and COMPLETE</p>
              </div>
              <button onClick={() => { setEditingCustomer(null); setShowCustomerForm(true); }} className="btn-primary">
                + New Customer
              </button>
            </div>

            <SearchInput onSearch={handleSearch} loading={searchLoading} autoFocus />

            {/* Inline records-room loader — compact, lives UNDER the search bar */}
            <AnimatePresence>
              {searchLoading && !customerLoading && <ShelfSearch />}
            </AnimatePresence>

            {searchResults === null && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-20 h-20 rounded-3xl bg-surface-2 border border-surface-4 flex items-center justify-center mb-5">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(232,184,0,0.4)" strokeWidth="1.5">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                  </svg>
                </div>
                <p className="text-ink-muted text-lg">Enter name, IMEI, or Aadhaar to search</p>
                <p className="text-ink-muted text-sm mt-1">Results appear as you type — no button needed</p>
              </div>
            )}

            {searchResults !== null && searchResults.length === 0 && (
              <div className="text-center py-16">
                <p className="text-ink-muted">No customers found. Try a different search term.</p>
              </div>
            )}

            {searchResults !== null && searchResults.length > 1 && !selectedCustomer && (
              <div className="card overflow-hidden animate-fade-in">
                <div className="px-5 py-3 border-b border-surface-4">
                  <span className="text-xs text-ink-muted uppercase tracking-widest">📂 {searchResults.length} files pulled from the shelves — tap a customer to open</span>
                </div>
                <motion.div
                  className="divide-y divide-surface-3"
                  variants={staggerContainer(0.05, 0.03)}
                  initial="hidden"
                  animate="show"
                >
                  {searchResults.map((c) => {
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
                        variants={rowItem}
                        whileHover={{ x: 4 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => selectCustomerFn(c)}
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
                          <span className="text-ink-muted">ID <span className="font-num font-bold text-brand-700">{customerCodeOf(c)}</span></span>
                          <span className="text-ink-muted">IMEI <span className="font-num text-ink">{c.imei || '—'}</span></span>
                          <span className="text-ink-muted">Mobile <span className="font-num text-ink">{c.mobile || '—'}</span></span>
                          <span className="text-ink-muted">Retailer <span className="text-ink">{(c.retailer as Retailer)?.name || '—'}</span></span>
                          <span className="text-ink-muted">EMI/mo <span className="font-num font-bold text-brand-700">{fmt(c.emi_amount)}</span></span>
                        </div>
                      </motion.button>
                    );
                  })}
                </motion.div>
              </div>
            )}

            {selectedCustomer && (
              <div className="space-y-5 animate-slide-up pb-32 sm:pb-0">
                {/* Action bar */}
                {/* Action bar — wraps on desktop; "Record Payment" pinned at bottom on mobile */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {searchResults && searchResults.length > 1 ? (
                    <button onClick={() => setSelectedCustomer(null)} className="btn-ghost flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                      Back to results
                    </button>
                  ) : (
                    /* When this is the only result (or the panel was left open after
                       switching tabs), give an explicit way back to a clean search. */
                    <button onClick={() => { setSelectedCustomer(null); setSearchResults(null); }} className="btn-ghost flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                      New Search
                    </button>
                  )}
                  <div className="flex flex-wrap items-center gap-2 ml-auto">
                    {/* Lock toggle — kept in the always-visible action bar so it's
                        reachable on mobile without scrolling into the detail card. */}
                    <PhoneLockBadge
                      customerId={selectedCustomer.id}
                      isLocked={selectedCustomer.is_locked || false}
                      lockProvider={selectedCustomer.lock_provider}
                      isAdmin={true}
                      variant="button"
                      onToggled={v => setSelectedCustomer(c => (c ? { ...c, is_locked: v } : c))}
                    />
                    <button onClick={() => { setEditingCustomer(selectedCustomer); setShowCustomerForm(true); }} className="btn-ghost">
                      ✏️ Edit
                    </button>
                    {selectedCustomer.status === 'RUNNING' && (
                      <>
                        <button onClick={() => setShowCompleteModal(true)} className="btn-success">
                          ✓ Mark Complete
                        </button>
                        <button onClick={() => { setSettleAmount(''); setShowSettleModal(true); }} className="px-3 py-1.5 text-sm border border-warning-border hover:border-warning text-warning rounded-lg transition-colors font-medium">
                          ⚖️ Settle Account
                        </button>
                      </>
                    )}
                    {selectedCustomer.status === 'NPA' && (
                      <button onClick={handleMoveToRunning} className="btn-success">
                        ↩ Move to RUNNING
                      </button>
                    )}
                    {selectedCustomer.status === 'SETTLED' && (
                      <a href={`/api/settlement-letter/${selectedCustomer.id}`} target="_blank" className="px-3 py-1.5 text-sm border border-brand-300 hover:border-brand-400 text-brand-600 rounded-lg transition-colors font-medium">
                        📄 Settlement Letter
                      </a>
                    )}
                    {/* Desktop only — mobile uses sticky-bottom bar below */}
                    <button onClick={() => setShowPaymentModal(true)} className="btn-primary hidden sm:inline-flex">
                      💳 Record Payment
                    </button>
                    <button onClick={() => setShowDeleteConfirm(true)} className="btn-danger">
                      🗑 Delete
                    </button>
                  </div>
                </div>

                {/* Mobile sticky-bottom Record Payment — always visible, never cut off */}
                <div className="sm:hidden fixed bottom-16 left-0 right-0 z-40 px-4 pb-2 pt-3 bg-white/95 backdrop-blur-sm border-t border-surface-4 shadow-lg">
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    className="btn-primary w-full text-base py-4 font-bold"
                    style={{ minHeight: 56 }}
                  >
                    💳 Record Payment{breakdown && breakdown.total_payable > 0 ? ` · ${fmt(breakdown.total_payable)}` : ''}
                  </button>
                </div>

                <CustomerDetailPanel
                  customer={selectedCustomer}
                  paidCount={paidCount}
                  totalEmis={selectedCustomer.emi_tenure}
                  isAdmin={true}
                  emis={customerEmis}
                  baseFine={fineSettings.default_fine_amount}
                  weeklyIncrement={fineSettings.weekly_fine_increment}
                  onLockToggled={v => setSelectedCustomer(c => (c ? { ...c, is_locked: v } : c))}
                />

                {/* Payment Summary mounted directly beneath Customer Details */}
                <CustomerPaymentSummary
                  customer={selectedCustomer}
                  emis={customerEmis}
                  breakdown={breakdown}
                  baseFine={fineSettings.default_fine_amount}
                  weeklyIncrement={fineSettings.weekly_fine_increment}
                />

                {/* Smart alert popup — EMI due in 5 days / fine due / 1st EMI charge
                    pending. Gated on !customerLoading so it appears ONLY after the
                    skeleton loader has exited, fed purely by the customer's real
                    breakdown data (the loader holds no shared state). */}
                {breakdown && !customerLoading && (
                  <SmartAlertPopup
                    key={selectedCustomer.id}
                    fineDue={breakdown.fine_due ?? 0}
                    daysUntilDue={breakdown.next_emi_due_date ? diffDaysIST(breakdown.next_emi_due_date, new Date()) : null}
                    nextEmiNo={breakdown.next_emi_no}
                    nextEmiAmount={breakdown.next_emi_amount}
                    firstChargeDue={breakdown.first_emi_charge_due ?? 0}
                  />
                )}
                {breakdown && (() => {
                  const daysLeft = breakdown.next_emi_due_date ? diffDaysIST(breakdown.next_emi_due_date, new Date()) : null;
                  return (
                    <div className="space-y-2">
                      {breakdown.fine_due > 0 && (
                        <div className="alert-red border-2">
                          <p className="font-bold text-base text-crimson-400">⚠️ Fine Pending</p>
                          <p className="text-sm font-semibold text-ink-muted mt-0.5">Pending fine: {fmt(breakdown.fine_due)}</p>
                        </div>
                      )}
                      {(breakdown.first_emi_charge_due ?? 0) > 0 && (
                        <div className="alert-gold border-2">
                          <p className="font-bold text-base text-gold-400">⚠️ 1ST EMI CHARGE Pending</p>
                          <p className="text-sm font-semibold text-ink-muted mt-0.5">Pending amount: {fmt(breakdown.first_emi_charge_due || 0)}</p>
                        </div>
                      )}
                      {daysLeft !== null && daysLeft >= 0 && daysLeft <= 5 && (
                        <div className="alert-blue border-2">
                          <p className="font-bold text-base text-sapphire-400">🔔 EMI Upcoming in {daysLeft} day{daysLeft === 1 ? '' : 's'}</p>
                          <p className="text-sm font-semibold text-ink-muted mt-0.5">
                            EMI #{breakdown.next_emi_no ?? '—'} due on {breakdown.next_emi_due_date ? format(new Date(breakdown.next_emi_due_date), 'd MMM yyyy') : '—'}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {breakdown && <DueBreakdownPanel breakdown={breakdown} />}
                <EMIScheduleTable
                  emis={customerEmis}
                  nextUnpaidNo={breakdown?.next_emi_no ?? undefined}
                  isAdmin={true}
                  onRefresh={refreshSelectedCustomer}
                  defaultFineAmount={fineSettings.default_fine_amount}
                  weeklyIncrement={fineSettings.weekly_fine_increment}
                />
              </div>
            )}
          </div>
        )}

        {/* ===== RETAILERS TAB ===== */}
        {tab === 'retailers' && (
          <div className="space-y-6 animate-fade-in pb-safe">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-ink">Retailer Management</h1>
                <p className="text-ink-muted text-sm mt-1">{retailers.length} retailers registered</p>
              </div>
              <button
                onClick={() => { setEditingRetailer(null); setRetailerForm({ name: '', username: '', password: '', retail_pin: '', mobile: '' }); setShowRetailerForm(true); }}
                className="btn-primary whitespace-nowrap"
              >
                + Add Retailer
              </button>
            </div>

            {summaryRetailerId && (() => {
              const r = retailers.find(x => x.id === summaryRetailerId);
              if (!r) return null;
              return (
                <div className="space-y-3">
                  <button onClick={() => setSummaryRetailerId(null)} className="btn-ghost flex items-center gap-2 text-xs">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                    Back to retailer list
                  </button>
                  <RetailerPaymentSummary
                    retailerId={r.id}
                    retailerName={r.name}
                    baseFine={fineSettings.default_fine_amount}
                    weeklyIncrement={fineSettings.weekly_fine_increment}
                  />
                </div>
              );
            })()}

            <div className="space-y-3 md:hidden">
              {retailers.map((r) => (
                <div key={r.id} className="card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-ink break-words">{r.name}</h3>
                      <p className="text-sm text-ink-muted break-all">@{r.username}</p>
                    </div>
                    {r.is_active ? <span className="badge-running whitespace-nowrap">Active</span> : <span className="badge-rejected whitespace-nowrap">Inactive</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-ink-muted">Mobile</p>
                      <p className="font-num text-ink whitespace-nowrap">{r.mobile || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-ink-muted">Created</p>
                      <p className="text-ink whitespace-nowrap">{formatDateOnly(r.created_at)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setSummaryRetailerId(r.id)}
                      className="btn-secondary whitespace-nowrap"
                    >
                      📊 Summary
                    </button>
                    <button
                      onClick={() => { setEditingRetailer(r); setRetailerForm({ name: r.name, username: r.username, password: '', retail_pin: '', mobile: r.mobile || '' }); setShowRetailerForm(true); }}
                      className="btn-ghost whitespace-nowrap"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleRetailerActive(r)}
                      className={`btn whitespace-nowrap ${r.is_active ? 'bg-danger-light text-danger border border-danger-border' : 'bg-success-light text-success border border-success-border'}`}
                    >
                      {r.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleDeleteRetailer(r.id)}
                      className="btn-danger whitespace-nowrap"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {retailers.length === 0 && <div className="card p-6 text-center text-ink-muted">No retailers yet. Add one to get started.</div>}
            </div>

            <div className="card overflow-x-auto hidden md:block">
              <table className="data-table text-sm min-w-full">
                <thead>
                  <tr><th className="whitespace-nowrap">Name</th><th className="whitespace-nowrap">Username</th><th className="whitespace-nowrap">Mobile</th><th className="whitespace-nowrap">Status</th><th className="whitespace-nowrap">Created</th><th className="whitespace-nowrap">Actions</th></tr>
                </thead>
                <tbody>
                  {retailers.map((r) => (
                    <tr key={r.id}>
                      <td className="font-medium text-ink">{r.name}</td>
                      <td><span className="font-num text-ink-muted whitespace-nowrap">@{r.username}</span></td>
                      <td><span className="font-num text-ink-muted whitespace-nowrap">{r.mobile || '—'}</span></td>
                      <td>{r.is_active ? <span className="badge-running whitespace-nowrap">Active</span> : <span className="badge-rejected whitespace-nowrap">Inactive</span>}</td>
                      <td className="text-xs text-ink-muted whitespace-nowrap">{format(new Date(r.created_at), 'd MMM yyyy')}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setSummaryRetailerId(r.id)} className="btn-secondary whitespace-nowrap">📊 Summary</button>
                          <button onClick={() => { setEditingRetailer(r); setRetailerForm({ name: r.name, username: r.username, password: '', retail_pin: '', mobile: r.mobile || '' }); setShowRetailerForm(true); }} className="btn-ghost whitespace-nowrap">Edit</button>
                          <button onClick={() => handleToggleRetailerActive(r)} className={`btn whitespace-nowrap ${r.is_active ? 'bg-danger-light text-danger border border-danger-border' : 'bg-success-light text-success border border-success-border'}`}>
                            {r.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button onClick={() => handleDeleteRetailer(r.id)} className="btn-danger whitespace-nowrap">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {retailers.length === 0 && (
                    <tr><td colSpan={6} className="text-center text-ink-muted py-10">No retailers yet. Add one to get started.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== REPORTS TAB ===== */}
        {tab === 'reports' && (
          <ReportsHub
            supabase={supabase}
            retailers={retailers}
            onOpenCustomer={openCustomerById}
          />
        )}

        {/* ===== ANALYTICS TAB ===== */}
        {tab === 'analysis' && (
          <AnalyticsPro supabase={supabase} />
        )}

        {/* ===== SETTINGS TAB ===== */}
        {tab === 'settings' && (
          <SettingsHub
            supabase={supabase}
            retailers={retailers}
            onGoRetailers={() => setTab('retailers')}
            onFineSettingsChanged={loadFineSettings}
          />
        )}

        {/* ===== BROADCAST TAB ===== */}
        {tab === 'broadcast' && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h1 className="font-display text-3xl font-bold text-ink">Broadcast Message</h1>
              <p className="text-ink-muted text-sm mt-1">Send popup messages to all customers under a retailer.</p>
            </div>

            <div className="card p-6 border-l-4 border-emerald-500 bg-gradient-to-br from-emerald-50 to-white">
              <p className="section-header text-emerald-700">Send New Broadcast</p>
              <div className="space-y-4">
                <div>
                  <label className="form-label">Select Retailer <span className="text-brand-600">*</span></label>
                  <select
                    value={broadcastRetailerId}
                    onChange={(e) => setBroadcastRetailerId(e.target.value)}
                    className="form-input"
                  >
                    <option value="">— Select retailer —</option>
                    {retailers.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Message <span className="text-brand-600">*</span></label>
                  <textarea
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    rows={3}
                    placeholder="Type your message for customers..."
                    className="form-input resize-none"
                  />
                </div>
                <div>
                  <label className="form-label">Image URL (optional)</label>
                  <input
                    type="url"
                    value={broadcastImageUrl}
                    onChange={(e) => setBroadcastImageUrl(e.target.value)}
                    className="form-input"
                    placeholder="https://i.ibb.co/..."
                  />
                  {broadcastImageUrl.trim() && (
                    <img src={broadcastImageUrl} alt="Broadcast preview" className="mt-3 max-h-40 rounded-xl border border-surface-4 object-cover" />
                  )}
                </div>
                <div>
                  <label className="form-label">Expiry Date <span className="text-brand-600">*</span></label>
                  <input
                    type="date"
                    value={broadcastExpiry}
                    onChange={(e) => setBroadcastExpiry(e.target.value)}
                    className="form-input"
                    min={new Date().toISOString().split('T')[0]}
                  />
                  <p className="text-xs text-ink-muted mt-1">Popup will stop appearing after this date.</p>
                </div>
                <button
                  onClick={async () => {
                    if (!broadcastRetailerId || !broadcastMessage.trim() || !broadcastExpiry) {
                      toast.error('Please fill all fields');
                      return;
                    }
                    setBroadcastLoading(true);
                    try {
                      const res = await fetch('/api/broadcast', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          target_retailer_id: broadcastRetailerId,
                          message: broadcastMessage.trim(),
                          image_url: broadcastImageUrl.trim() || null,
                          expires_at: broadcastExpiry + 'T23:59:59Z',
                        }),
                      });
                      const data = await readJsonSafe<{ error?: string }>(res) || {};
                      if (res.ok) {
                        toast.success('Broadcast sent!');
                        setBroadcastMessage('');
                        setBroadcastImageUrl('');
                        setBroadcastExpiry('');
                        setBroadcastRetailerId('');
                        loadBroadcasts();
                      } else {
                        toast.error(data.error || 'Failed to send broadcast');
                      }
                    } finally {
                      setBroadcastLoading(false);
                    }
                  }}
                  disabled={broadcastLoading}
                  className="btn-primary"
                >
                  {broadcastLoading ? 'Sending…' : '📢 Send Broadcast'}
                </button>
              </div>
            </div>

            {/* Broadcast History */}
            <div className="card p-6 border-l-4 border-fuchsia-500 bg-gradient-to-br from-fuchsia-50 to-white">
              <div className="flex items-center justify-between mb-4">
                <p className="section-header mb-0 text-fuchsia-700">Broadcast History</p>
                <button onClick={loadBroadcasts} className="text-xs text-brand-600 underline underline-offset-4">
                  Refresh
                </button>
              </div>
              {broadcastHistory.length === 0 ? (
                <p className="text-ink-muted text-sm py-4">No broadcasts sent yet.</p>
              ) : (
                <div className="space-y-3">
                  {broadcastHistory.map((b) => {
                    const expired = new Date(b.expires_at) < new Date();
                    return (
                      <div key={b.id} className={`p-4 rounded-xl border ${expired ? 'border-surface-4 opacity-60' : 'border-brand-300 bg-brand-50'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="text-ink text-sm font-medium">{b.message}</p>
                            {b.image_url && (
                              <img src={b.image_url} alt="Broadcast" className="mt-3 max-h-40 rounded-xl border border-surface-4 object-cover" />
                            )}
                            <div className="flex flex-wrap gap-3 mt-2 text-xs text-ink-muted">
                              <span>📍 {b.retailer?.name || '—'}</span>
                              <span>📅 Sent: {format(new Date(b.created_at), 'd MMM yyyy')}</span>
                              <span>⏰ Expires: {format(new Date(b.expires_at), 'd MMM yyyy')}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {expired
                              ? <span className="text-xs text-ink-muted bg-surface-3 px-2 py-0.5 rounded-full">Expired</span>
                              : <span className="text-xs text-success bg-success-light px-2 py-0.5 rounded-full font-semibold">Active</span>
                            }
                            <button
                              onClick={async () => {
                                if (!confirm('Delete this broadcast?')) return;
                                const res = await fetch(`/api/broadcast?id=${b.id}`, { method: 'DELETE' });
                                if (res.ok) { toast.success('Deleted'); loadBroadcasts(); }
                                else toast.error('Failed to delete');
                              }}
                              className="text-xs text-danger hover:text-danger border border-danger-border px-2 py-0.5 rounded-lg"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
        </motion.div>

      </div>

      {/* ===== MODALS ===== */}

      <AnimatePresence>
        {showCustomerForm && (
          <CustomerFormModal
            customer={editingCustomer}
            retailers={retailers}
            onClose={() => { setShowCustomerForm(false); setEditingCustomer(null); }}
            onSaved={refreshSelectedCustomer}
            isAdmin={true}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPaymentModal && selectedCustomer && (
          <PaymentModal
            customer={selectedCustomer}
            emis={customerEmis}
            breakdown={breakdown}
            onClose={() => setShowPaymentModal(false)}
            onSubmitted={async () => { await refreshSelectedCustomer(); loadPendingCount(); }}
            isAdmin={true}
            baseFine={fineSettings.default_fine_amount}
            weeklyIncrement={fineSettings.weekly_fine_increment}
          />
        )}
      </AnimatePresence>

      {showCompleteModal && (
        <div className="modal-backdrop">
          <div className="card w-full max-w-md p-6 animate-slide-up">
            <h3 className="font-display text-xl font-bold text-ink mb-2">Mark as COMPLETE</h3>
            <p className="text-sm text-ink-muted mb-5">
              Once complete, the retailer cannot collect further payments. Remark is mandatory.
            </p>
            <div className="mb-4">
              <label className="form-label">Completion Remark <span className="text-brand-600">*</span></label>
              <textarea
                value={completeRemark}
                onChange={(e) => setCompleteRemark(e.target.value)}
                rows={3}
                placeholder="e.g. All EMIs cleared, NOC issued"
                className="form-input resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCompleteModal(false)} className="btn-ghost flex-1">Cancel</button>
              <button onClick={handleMarkComplete} className="btn-success flex-1">Confirm Complete</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="modal-backdrop">
          <div className="card w-full max-w-md p-6 animate-slide-up">
            <h3 className="font-display text-xl font-bold text-danger mb-2">⚠ Delete Customer</h3>
            <p className="text-sm text-ink-muted mb-5">
              This permanently deletes the customer, all EMI records, and payment history. This cannot be undone.
            </p>
            <div className="mb-4">
              <label className="form-label">Reason for Deletion <span className="text-brand-600">*</span></label>
              <input
                value={deleteRemark}
                onChange={(e) => setDeleteRemark(e.target.value)}
                placeholder="State the reason..."
                className="form-input"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="btn-ghost flex-1">Cancel</button>
              <button onClick={handleDeleteCustomer} className="btn-danger flex-1">Confirm Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Settlement Modal */}
      {showSettleModal && selectedCustomer && (
        <div className="modal-backdrop">
          <div className="card w-full max-w-md p-6 animate-slide-up">
            <h3 className="font-display text-xl font-bold text-ink mb-2">⚖️ Settle Account</h3>
            <p className="text-sm text-ink-muted mb-1">
              <strong>{selectedCustomer.customer_name}</strong> · {selectedCustomer.imei}
            </p>
            <p className="text-sm text-ink-muted mb-5">
              This will close all remaining EMIs and mark the account as SETTLED with a warning flag.
            </p>
            <div className="mb-4">
              <label className="form-label">Settlement Amount (₹) <span className="text-brand-600">*</span></label>
              <input
                type="number"
                value={settleAmount}
                onChange={(e) => setSettleAmount(e.target.value)}
                placeholder="Enter settlement amount"
                className="form-input"
                min={1}
                autoFocus
              />
              <p className="text-xs text-ink-muted mt-1">
                Original loan: {fmt(selectedCustomer.purchase_value - selectedCustomer.down_payment)} · EMI: {fmt(selectedCustomer.emi_amount)} × {selectedCustomer.emi_tenure}
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSettleModal(false)} className="btn-ghost flex-1">Cancel</button>
              <button onClick={handleSettlement} disabled={settleLoading} className="btn-primary flex-1">
                {settleLoading ? 'Processing…' : 'Confirm Settlement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRetailerForm && (
        <div className="modal-backdrop">
          <div className="card w-full max-w-md p-6 animate-slide-up">
            <h3 className="font-display text-xl font-bold text-ink mb-5">
              {editingRetailer ? 'Edit Retailer' : 'Add New Retailer'}
            </h3>
            <form onSubmit={handleRetailerSubmit} className="space-y-4">
              <div>
                <label className="form-label">Display Name <span className="text-brand-600">*</span></label>
                <input
                  value={retailerForm.name}
                  onChange={(e) => setRetailerForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  placeholder="e.g. Singh Mobiles"
                  className="form-input"
                />
              </div>
              {!editingRetailer && (
                <div>
                  <label className="form-label">Username <span className="text-brand-600">*</span></label>
                  <input
                    value={retailerForm.username}
                    onChange={(e) => setRetailerForm((f) => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))}
                    required
                    placeholder="lowercase, no spaces"
                    className="form-input"
                  />
                  <p className="text-xs text-ink-muted mt-1">Login email will be: {retailerForm.username || 'username'}@tele.local</p>
                </div>
              )}
              <div>
                <label className="form-label">
                  {editingRetailer ? 'New Password (leave blank to keep current)' : 'Password'} {!editingRetailer && <span className="text-brand-600">*</span>}
                </label>
                <input
                  type="password"
                  value={retailerForm.password}
                  onChange={(e) => setRetailerForm((f) => ({ ...f, password: e.target.value }))}
                  required={!editingRetailer}
                  placeholder="••••••••"
                  className="form-input"
                />
                {!editingRetailer && (
                  <p className="text-xs text-ink-muted mt-1">Used to log in to the retailer dashboard.</p>
                )}
              </div>
              <div>
                <label className="form-label">
                  Retail PIN <span className="text-brand-600">{!editingRetailer ? '*' : '(update)'}</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={retailerForm.retail_pin}
                  onChange={(e) => setRetailerForm((f) => ({ ...f, retail_pin: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                  required={!editingRetailer}
                  placeholder="4–6 digit PIN"
                  className="form-input"
                  maxLength={6}
                />
                <p className="text-xs text-ink-muted mt-1">
                  Separate from login password. Required every time retailer submits a payment.
                </p>
              </div>
              <div>
                <label className="form-label">Mobile Number (optional)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={retailerForm.mobile}
                  onChange={(e) => setRetailerForm((f) => ({ ...f, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                  placeholder="10-digit mobile"
                  className="form-input"
                  maxLength={10}
                />
                <p className="text-xs text-ink-muted mt-1">Shown on receipts and customer details.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowRetailerForm(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">{editingRetailer ? 'Update Retailer' : 'Create Retailer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <BottomNav role="admin" pendingCount={pendingCount} />

      {/* Single-customer open: stack-unfold loader (UI-only placeholder —
          the top card unfolds to full screen BEFORE the real-data popup shows) */}
      <AnimatePresence>
        {customerLoading && <StackUnfold name={selectedCustomer?.customer_name} />}
      </AnimatePresence>
    </div>
  );
}
