'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Customer, Retailer, EMISchedule, DueBreakdown, PaymentRequest } from '@/lib/types';
import NavBar from '@/components/NavBar';
import SearchInput from '@/components/SearchInput';
import CustomerDetailPanel from '@/components/CustomerDetailPanel';
import CustomerPaymentSummary from '@/components/CustomerPaymentSummary';
import RetailerPaymentSummary from '@/components/RetailerPaymentSummary';
import CustomerFormModal from '@/components/CustomerFormModal';
import EMIScheduleTable from '@/components/EMIScheduleTable';
import DueBreakdownPanel from '@/components/DueBreakdownPanel';
import SmartAlertPopup from '@/components/SmartAlertPopup';
import PaymentModal from '@/components/PaymentModal';
import AnalysisDashboard from '@/components/AnalysisDashboard';
import toast from 'react-hot-toast';
import { calculateTotalFineFromEmis } from '@/lib/fineCalc';
import BottomNav from '@/components/BottomNav';
import { addDays, subMonths, format, differenceInDays } from 'date-fns';
import { formatCurrency, formatDateOnly, readJsonSafe } from '@/lib/formatters';
import { motion, AnimatePresence } from 'framer-motion';
import CountUp from '@/components/motion/CountUp';
import StackUnfold from '@/components/motion/StackUnfold';
import ShelfSearch from '@/components/motion/ShelfSearch';
import { SPRING, cardRise, staggerContainer, rowItem } from '@/lib/motion';

type Tab = 'search' | 'retailers' | 'reports' | 'analysis' | 'broadcast';

interface FilteredEMI {
  id: string;
  emi_no: number;
  due_date: string;
  amount: number;
  status: string;
  fine_amount: number;
  customer_name: string;
  imei: string;
  mobile: string;
  retailer_name: string;
  customer_id: string;
}

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

  // UTR search
  const [utrQuery, setUtrQuery] = useState('');
  const [utrResults, setUtrResults] = useState<PaymentRequest[] | null>(null);
  const [utrLoading, setUtrLoading] = useState(false);
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [collectionRetailerId, setCollectionRetailerId] = useState('');

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

  // Filter state
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [filteredEmis, setFilteredEmis] = useState<FilteredEMI[] | null>(null);
  const [filterLoading, setFilterLoading] = useState(false);

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
      if (/^\d{15}$/.test(query)) qb = qb.eq('imei', query);
      else if (/^\d{12}$/.test(query)) qb = qb.eq('aadhaar', query);
      else qb = qb.ilike('customer_name', `%${query}%`);

      const { data, error } = await qb.order('customer_name').limit(20);
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

  async function searchUTR() {
    if (!utrQuery.trim()) { setUtrResults(null); return; }
    setUtrLoading(true);
    try {
      const { data } = await supabase
        .from('payment_requests')
        .select('*, customer:customers(customer_name, imei, mobile), retailer:retailers(name)')
        .or(`utr.ilike.%${utrQuery.trim()}%,notes.ilike.%${utrQuery.trim()}%`)
        .order('created_at', { ascending: false })
        .limit(20);
      setUtrResults((data as PaymentRequest[]) || []);
    } finally {
      setUtrLoading(false);
    }
  }

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

  async function updateFineSettings() {
    const base = Number(fineSettings.default_fine_amount);
    const wk   = Number(fineSettings.weekly_fine_increment);
    if (!Number.isFinite(base) || base < 0) { toast.error('Enter a valid base fine'); return; }
    if (!Number.isFinite(wk) || wk < 0)     { toast.error('Enter a valid weekly increment'); return; }
    const { error } = await supabase.from('fine_settings').update({
      default_fine_amount: base, weekly_fine_increment: wk,
    }).eq('id', 1);
    if (!error) toast.success('Fine settings updated');
    else toast.error(error.message);
  }

  async function loadFilter(filterKey: string, days?: number, months?: number) {
    setActiveFilter(filterKey);
    setFilteredEmis(null);
    setFilterLoading(true);

    try {
      let query = supabase
        .from('emi_schedule')
        .select(`
          id, emi_no, due_date, amount, status, fine_amount, fine_waived,
          customer:customers(id, customer_name, imei, mobile, retailer:retailers(name))
        `)
        .in('status', ['UNPAID','PARTIALLY_PAID']);

      const today = new Date();

      if (filterKey === 'fine_only') {
        query = query.gt('fine_amount', 0).eq('fine_waived', false);
      } else if (filterKey === 'first_emi_due') {
        query = query.eq('emi_no', 1);
      } else if (filterKey === 'first_emi_charge_due') {
        const { data: cc, error: ccErr } = await supabase
          .from('customers')
          .select('id, customer_name, imei, mobile, first_emi_charge_amount, retailer:retailers(name)')
          .gt('first_emi_charge_amount', 0)
          .is('first_emi_charge_paid_at', null)
          .eq('status', 'RUNNING');
        if (ccErr) { toast.error(ccErr.message); setFilteredEmis([]); setFilterLoading(false); return; }
        const mappedCharge: FilteredEMI[] = (cc ?? []).map((r) => {
          const row = (r ?? {}) as Record<string, unknown>;
          const retailer = (row.retailer ?? null) as { name?: string } | null;
          return {
            id: (row.id as string) ?? '',
            emi_no: 0,
            due_date: '',
            amount: Number(row.first_emi_charge_amount ?? 0),
            status: 'CHARGE_DUE',
            fine_amount: 0,
            customer_name: (row.customer_name as string) ?? '',
            imei: (row.imei as string) ?? '',
            mobile: (row.mobile as string) ?? '',
            retailer_name: retailer?.name ?? '',
            customer_id: (row.id as string) ?? '',
          };
        });
        setFilteredEmis(mappedCharge);
        setFilterLoading(false);
        return;
      } else if (days) {
        const target = addDays(today, days).toISOString().split('T')[0];
        query = query.lte('due_date', target).gte('due_date', today.toISOString().split('T')[0]);
      } else if (months) {
        const cutoff = subMonths(today, months).toISOString().split('T')[0];
        query = query.lt('due_date', cutoff);
      }

      const { data, error } = await query.order('due_date').limit(100);
      if (error) { toast.error(error.message); return; }

      const mapped: FilteredEMI[] = (data || []).map((row: Record<string, unknown>) => {
        const cust = row.customer as Record<string, unknown> | null;
        return {
          id: row.id as string,
          emi_no: row.emi_no as number,
          due_date: row.due_date as string,
          amount: row.amount as number,
          status: row.status as string,
          fine_amount: row.fine_amount as number || 0,
          customer_name: (cust?.customer_name as string) || '',
          imei: (cust?.imei as string) || '',
          mobile: (cust?.mobile as string) || '',
          retailer_name: ((cust?.retailer as { name?: string } | null)?.name) || '',
          customer_id: (cust?.id as string) || '',
        };
      });
      setFilteredEmis(mapped);
    } finally {
      setFilterLoading(false);
    }
  }

  function clearFilter() {
    setActiveFilter(null);
    setFilteredEmis(null);
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
            { key: 'analysis', label: '📈 Analysis' },
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
                  {searchResults && searchResults.length > 1 && (
                    <button onClick={() => setSelectedCustomer(null)} className="btn-ghost flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                      Back to results
                    </button>
                  )}
                  <div className="flex flex-wrap gap-2 ml-auto">
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
                    daysUntilDue={breakdown.next_emi_due_date ? differenceInDays(new Date(breakdown.next_emi_due_date), new Date()) : null}
                    nextEmiNo={breakdown.next_emi_no}
                    nextEmiAmount={breakdown.next_emi_amount}
                    firstChargeDue={breakdown.first_emi_charge_due ?? 0}
                  />
                )}
                {breakdown && (() => {
                  const daysLeft = breakdown.next_emi_due_date ? differenceInDays(new Date(breakdown.next_emi_due_date), new Date()) : null;
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
          <div className="space-y-6 animate-fade-in">
            <h1 className="font-display text-3xl font-bold text-ink">Reports & Settings</h1>

            {/* UTR / Payment Search */}
            <div className="card p-6 border-l-4 border-sky-500 bg-gradient-to-br from-sky-50 to-white">
              <p className="section-header text-sky-700">Search Payment by UTR / Reference</p>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <input
                    type="text"
                    value={utrQuery}
                    onChange={e => setUtrQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchUTR()}
                    placeholder="Enter UTR number, reference, or payment ID..."
                    className="form-input"
                  />
                </div>
                <button onClick={searchUTR} disabled={utrLoading} className="btn-primary">
                  {utrLoading ? 'Searching…' : '🔍 Search'}
                </button>
              </div>
              {utrResults !== null && (
                <div className="mt-4">
                  {utrResults.length === 0 ? (
                    <p className="text-ink-muted text-sm py-3">No payments found for this reference.</p>
                  ) : (
                    <div className="card overflow-hidden mt-3">
                      <table className="data-table text-xs sm:text-sm">
                        <thead>
                          <tr><th>Customer</th><th>Amount</th><th>Mode</th><th>Status</th><th>Date</th><th>Notes</th></tr>
                        </thead>
                        <tbody>
                          {utrResults.map(r => {
                            const cust = r.customer as { customer_name?: string; imei?: string } | null;
                            return (
                              <tr key={r.id}>
                                <td>
                                  <p className="text-ink font-medium">{cust?.customer_name || '—'}</p>
                                  <p className="text-xs text-ink-muted font-num">{cust?.imei || ''}</p>
                                </td>
                                <td><span className="font-num font-semibold">{fmt(r.total_amount)}</span></td>
                                <td><span className={`text-xs font-semibold ${r.mode === 'UPI' ? 'text-info' : 'text-success'}`}>{r.mode}</span></td>
                                <td>
                                  {r.status === 'PENDING' && <span className="badge-pending">Pending</span>}
                                  {r.status === 'APPROVED' && <span className="badge-approved">Approved</span>}
                                  {r.status === 'REJECTED' && <span className="badge-rejected">Rejected</span>}
                                </td>
                                <td className="text-xs text-ink-muted">{format(new Date(r.created_at), 'd MMM yyyy')}</td>
                                <td className="text-xs text-ink-muted max-w-[150px] truncate">{r.notes || '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Fine Settings */}
            <div className="card p-6 border-l-4 border-danger bg-gradient-to-br from-danger-light/40 to-white">
              <p className="section-header text-danger">⚠️ Fine Settings</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Base Late Fine (₹)</label>
                  <input
                    type="number"
                    value={fineSettings.default_fine_amount}
                    onChange={(e) => setFineSettings((f) => ({ ...f, default_fine_amount: parseFloat(e.target.value) || 0 }))}
                    className="form-input border-danger-border focus:border-danger focus:ring-danger/20"
                    min={0}
                    inputMode="numeric"
                  />
                  <p className="text-[11px] text-ink-muted mt-1">Charged once the day after the EMI due date.</p>
                </div>
                <div>
                  <label className="form-label">Weekly Increment after 30-day grace (₹)</label>
                  <input
                    type="number"
                    value={fineSettings.weekly_fine_increment}
                    onChange={(e) => setFineSettings((f) => ({ ...f, weekly_fine_increment: parseFloat(e.target.value) || 0 }))}
                    className="form-input border-danger-border focus:border-danger focus:ring-danger/20"
                    min={0}
                    inputMode="numeric"
                  />
                  <p className="text-[11px] text-ink-muted mt-1">Added every 7 days once 30-day grace ends.</p>
                </div>
              </div>
              <button onClick={updateFineSettings} className="btn-primary mt-4">💾 Save Fine Settings</button>
              <div className="mt-4 p-3 rounded-xl bg-white/70 border border-danger-border/60 text-[11px] text-ink-muted leading-relaxed">
                <p className="font-semibold text-danger mb-1">How fines apply</p>
                <p>• ₹{fineSettings.default_fine_amount} flat fine the day after EMI due date.</p>
                <p>• First 30 days: stays at ₹{fineSettings.default_fine_amount}.</p>
                <p>• After 30 days: +₹{fineSettings.weekly_fine_increment} every 7 days until paid.</p>
                <p>• <b>Last EMI</b>, EMI unpaid: ₹{fineSettings.default_fine_amount} repeats every 30 days, no weekly.</p>
                <p>• <b>Last EMI</b>, EMI paid but fine unpaid: switches back to weekly ₹{fineSettings.weekly_fine_increment} rule.</p>
              </div>
            </div>

            {/* Live DB Metric Dashboard */}
            <MetricDashboard supabase={supabase} baseFine={fineSettings.default_fine_amount} weeklyIncrement={fineSettings.weekly_fine_increment} />

            {/* Excel Exports */}
            <div className="card p-6 border-l-4 border-violet-500 bg-gradient-to-br from-violet-50 to-white">
              {/* Monthly Collection Sheet — retailer-wise CSV */}
              <div className="card p-5 mb-6 border-l-4 border-indigo-500 bg-gradient-to-br from-indigo-50 to-white">
                <p className="section-header text-indigo-700">📋 Monthly EMI Collection Sheet</p>
                <p className="text-xs text-ink-muted mb-4">
                  Per-retailer EMI collection sheet with Fine Due. Leave retailer as "All" to download all retailers in one file.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="label">Retailer</label>
                    <select
                      value={collectionRetailerId}
                      onChange={e => setCollectionRetailerId(e.target.value)}
                      className="input w-48"
                    >
                      <option value="">All Retailers</option>
                      {retailers.filter(r => r.is_active).map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Month</label>
                    <select value={reportMonth} onChange={e => setReportMonth(Number(e.target.value))} className="input w-36">
                      {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m,i) => (
                        <option key={i} value={i+1}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Year</label>
                    <select value={reportYear} onChange={e => setReportYear(Number(e.target.value))} className="input w-28">
                      {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <a
                    href={
                      '/api/export/collection?month=' + reportMonth + '&year=' + reportYear +
                      (collectionRetailerId ? '&retailer_id=' + collectionRetailerId : '')
                    }
                    download
                    className="btn-primary"
                  >
                    📥 Download Collection Sheet
                  </a>
                </div>
              </div>

              <p className="section-header text-violet-700">Download Customers</p>
              <p className="text-xs text-ink-muted mb-4">
                The <strong>All Customers</strong> Excel export is a single .xlsx workbook with one tab per status — Running, Complete, Settled and NPA — so every customer is included. CSV downloads remain available for legacy use.
              </p>
              <div className="flex flex-wrap gap-3">
                <a
                  href="/api/export?type=all"
                  download="all-customers.xlsx"
                  className="px-4 py-3 rounded-xl border border-brand-400 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-all flex items-center gap-2 shadow-sm"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  📗 All Customers (Excel · 4 tabs)
                </a>
                <a
                  href="/api/export?type=running"
                  download="customers-running.csv"
                  className="px-4 py-3 rounded-xl border border-success-border bg-success-light hover:opacity-90 text-success text-sm font-semibold transition-all flex items-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  ● Running Customers (CSV)
                </a>
                <a
                  href="/api/export?type=complete"
                  download="customers-complete.csv"
                  className="px-4 py-3 rounded-xl border border-info-border bg-info-light hover:opacity-90 text-info text-sm font-semibold transition-all flex items-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  ✓ Complete Customers (CSV)
                </a>
              </div>
            </div>

            {/* EMI Filters */}
            <div className="card p-6 border-l-4 border-amber-500 bg-gradient-to-br from-amber-50 to-white">
              <div className="flex items-center justify-between mb-4">
                <p className="section-header mb-0 text-amber-700">EMI Due Filters</p>
                {activeFilter && (
                  <button onClick={clearFilter} className="text-xs text-ink-muted hover:text-ink underline underline-offset-4 transition-colors">
                    Clear filter
                  </button>
                )}
              </div>

              {/* Upcoming due */}
              <p className="text-xs text-ink-muted mb-2 uppercase tracking-widest">Upcoming due date</p>
              <div className="flex flex-wrap gap-2 mb-5">
                {[5, 10, 15, 20, 25, 30].map((d) => (
                  <button
                    key={d}
                    onClick={() => loadFilter(`upcoming_${d}`, d)}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      activeFilter === `upcoming_${d}`
                        ? 'bg-brand-500/20 border-brand-400 text-brand-600'
                        : 'border-surface-4 text-ink-muted hover:text-ink'
                    }`}
                  >
                    Next {d} days
                  </button>
                ))}
              </div>

              {/* Overdue by months */}
              <p className="text-xs text-ink-muted mb-2 uppercase tracking-widest">Overdue by months</p>
              <div className="flex flex-wrap gap-2 mb-5">
                {[2, 3, 4, 5].map((m) => (
                  <button
                    key={m}
                    onClick={() => loadFilter(`months_${m}`, undefined, m)}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      activeFilter === `months_${m}`
                        ? 'bg-danger-light border-danger text-danger'
                        : 'border-surface-4 text-ink-muted hover:text-ink'
                    }`}
                  >
                    {m}+ months overdue
                  </button>
                ))}
              </div>

              {/* Fine only */}
              <button
                onClick={() => loadFilter('fine_only')}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                  activeFilter === 'fine_only'
                    ? 'bg-danger-light border-danger text-danger'
                    : 'border-surface-4 text-ink-muted hover:text-ink'
                }`}
              >
                🔴 Fine Due Only
              </button>
              <p className="text-xs text-ink-muted mb-2 mt-5 uppercase tracking-widest">Special Filters</p>
              <div className="flex flex-wrap gap-2 mb-5">
                <button onClick={() => loadFilter('first_emi_due')} className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${activeFilter === 'first_emi_due' ? 'bg-brand-500/20 border-brand-400 text-brand-600' : 'border-surface-4 text-ink-muted hover:text-ink'}`}>📋 1st EMI Due</button>
                <button onClick={() => loadFilter('first_emi_charge_due')} className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${activeFilter === 'first_emi_charge_due' ? 'bg-warning-light border-warning text-warning' : 'border-surface-4 text-ink-muted hover:text-ink'}`}>⭐ 1st Charge Due</button>
              </div>

              {/* Filter Results */}
              {filterLoading && (
                <div className="mt-6 flex items-center gap-3 text-ink-muted">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                    <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading filtered results...
                </div>
              )}

              {filteredEmis !== null && !filterLoading && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-ink-muted">
                      <span className="text-ink font-semibold">{filteredEmis.length}</span> EMIs found
                    </p>
                    {filteredEmis.length > 0 && (
                      <button
                        onClick={() => {
                          const csv = [
                            'customer_name,imei,mobile,retailer,emi_no,due_date,amount,fine_amount',
                            ...filteredEmis.map(r =>
                              [r.customer_name, r.imei, r.mobile, r.retailer_name, r.emi_no, r.due_date, r.amount, r.fine_amount].join(',')
                            )
                          ].join('\n');
                          const blob = new Blob([csv], { type: 'text/csv' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a'); a.href = url; a.download = `filter_${activeFilter}.csv`; a.click();
                        }}
                        className="text-xs text-brand-600 hover:text-brand-600 underline underline-offset-4"
                      >
                        Export CSV
                      </button>
                    )}
                  </div>

                  {filteredEmis.length === 0 ? (
                    <p className="text-ink-muted text-sm py-4">No EMIs match this filter.</p>
                  ) : (
                    <div className="card overflow-hidden">
                      <table className="data-table text-xs sm:text-sm">
                        <thead>
                          <tr><th>Customer</th><th>IMEI</th><th>Mobile</th><th>Retailer</th><th>EMI #</th><th>Due Date</th><th>Amount</th><th>Fine</th></tr>
                        </thead>
                        <tbody>
                          {(filteredEmis ?? []).map((row) => {
                            const rowId = row?.id ?? `${row?.customer_id ?? 'unknown'}-${row?.emi_no ?? 0}`;
                            const dueDateRaw = row?.due_date ?? '';
                            const parsedDue = dueDateRaw ? new Date(dueDateRaw) : null;
                            const validDue = parsedDue && !Number.isNaN(parsedDue.getTime()) ? parsedDue : null;
                            const isOverdue = validDue ? validDue < new Date() : false;
                            const isChargeRow = row?.status === 'CHARGE_DUE';
                            const fineAmt = Number(row?.fine_amount ?? 0);
                            return (
                              <tr
                                key={rowId}
                                className="cursor-pointer hover:bg-brand-50/50"
                                onClick={async () => {
                                  if (!row?.customer_id) return;
                                  setTab('search');
                                  clearFilter();
                                  const { data: cc } = await supabase
                                    .from('customers')
                                    .select('*, retailer:retailers(*)')
                                    .eq('id', row.customer_id)
                                    .single();
                                  if (cc) {
                                    setSearchResults([cc as Customer]);
                                    await selectCustomerFn(cc as Customer);
                                  }
                                }}
                              >
                                <td className="text-ink font-medium">{row?.customer_name ?? '—'}</td>
                                <td><span className="font-num text-xs">{row?.imei ?? '—'}</span></td>
                                <td><span className="font-num text-ink-muted">{row?.mobile ?? '—'}</span></td>
                                <td className="text-ink-muted">{row?.retailer_name ?? '—'}</td>
                                <td>
                                  <span className="font-num">
                                    {isChargeRow ? '1st Charge' : `#${row?.emi_no ?? 0}`}
                                  </span>
                                </td>
                                <td>
                                  {validDue ? (
                                    <span className={`font-num text-xs ${isOverdue ? 'text-danger font-semibold' : 'text-ink-muted'}`}>
                                      {format(validDue, 'd MMM yyyy')}
                                    </span>
                                  ) : (
                                    <span className="text-ink-muted text-xs">—</span>
                                  )}
                                </td>
                                <td><span className="font-num">{fmt(Number(row?.amount ?? 0))}</span></td>
                                <td>
                                  {fineAmt > 0
                                    ? <span className="font-num text-danger text-xs font-semibold">{fmt(fineAmt)}</span>
                                    : <span className="text-ink-muted text-xs">—</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== ANALYSIS TAB ===== */}
        {tab === 'analysis' && (
          <AnalysisDashboard supabase={supabase} />
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

// ─────────────────────────────────────────────────────────────────────────────
// Live DB Metric Dashboard
// Scope: customers whose loan is currently RUNNING. Terminal states
// (COMPLETE / SETTLED / NPA) are excluded entirely — see /api/metrics.
// ─────────────────────────────────────────────────────────────────────────────
type YearBucket = { amount: number; count: number };

type MetricNumbers = {
  loanAmount: number;
  emiDue: number;
  fineDue: number;
  firstEmiChargeDue: number;
  emiCollected: number;
  fineCollected: number;
  firstEmiChargeCollected: number;
  profitByYear: Record<string, YearBucket>;
  lossBookedByYear: Record<string, YearBucket>;
  expectedLossCount: number;
  expectedLossEmiDue: number;
  fineCollectedByMonth: Record<string, number>;
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const currentYM = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

function MetricDashboard({
  supabase, baseFine, weeklyIncrement,
}: {
  supabase: ReturnType<typeof createClient>;
  baseFine: number;
  weeklyIncrement: number;
}) {
  const [metrics, setMetrics] = useState<MetricNumbers | null>(null);
  const [loading, setLoading] = useState(true);
  const [fineMonth, setFineMonth] = useState<string>(currentYM()); // "YYYY-MM"
  const [fineYear, setFineYear] = useState<number>(new Date().getFullYear());
  const [plYear, setPlYear] = useState<string>(String(new Date().getFullYear()));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Computed server-side over EVERY row (service client, no RLS, no 1000-row
      // truncation). The old in-browser whole-table scan both undercounted at
      // scale and could fail outright on big portfolios — leaving the dashboard
      // blank. Now we just render a tiny totals payload.
      const res = await fetch('/api/metrics', { cache: 'no-store' });
      if (!res.ok) {
        const e = await readJsonSafe<{ error?: string }>(res);
        throw new Error(e?.error || `Metrics failed (${res.status})`);
      }
      const d = await res.json();
      setMetrics({
        loanAmount: d.loanAmount,
        emiDue: d.emiDue,
        fineDue: d.fineDue,
        firstEmiChargeDue: d.firstChargeDue,
        emiCollected: d.emiCollected,
        fineCollected: d.fineCollected,
        firstEmiChargeCollected: d.firstChargeCollected,
        profitByYear: d.profitByYear ?? {},
        lossBookedByYear: d.lossBookedByYear ?? {},
        expectedLossCount: d.expectedLossCount ?? 0,
        expectedLossEmiDue: d.expectedLossEmiDue ?? 0,
        fineCollectedByMonth: d.fineCollectedByMonth ?? {},
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const m: MetricNumbers = metrics || { loanAmount: 0, emiDue: 0, fineDue: 0, firstEmiChargeDue: 0, emiCollected: 0, fineCollected: 0, firstEmiChargeCollected: 0, profitByYear: {}, lossBookedByYear: {}, expectedLossCount: 0, expectedLossEmiDue: 0, fineCollectedByMonth: {} };
  const totalLoanValue = m.loanAmount;
  // Collection = everything actually received: EMI + fines + 1st EMI charges.
  const totalCollection = m.emiCollected + m.fineCollected + m.firstEmiChargeCollected;
  // MARKET DUE = the WHOLE running market: every EMI, every fine and every
  // 1st-EMI charge across active accounts — both already collected AND still
  // outstanding (not just the unpaid/due slice).
  const marketDue =
    (m.emiDue + m.emiCollected) +
    (m.fineDue + m.fineCollected) +
    (m.firstEmiChargeDue + m.firstEmiChargeCollected);
  const btd = totalLoanValue - totalCollection;
  // Expected revenue = the whole billed book: every EMI instalment (which can
  // carry markup over the financed principal, so NOT loanAmount) + every fine
  // + every 1st EMI charge — each counted whether already collected or still
  // due. That is exactly MARKET DUE, so INV/DUE = what is still outstanding
  // (EMI due + fine due + 1st charge due) and can never dip negative just
  // because collections passed the principal.
  const expectedRevenue = marketDue;
  const invDue = expectedRevenue - totalCollection;
  const collectionPct = expectedRevenue > 0
    ? Math.min(100, Math.round((totalCollection / expectedRevenue) * 100))
    : 0;
  const marketTotal = m.emiCollected + m.emiDue + m.firstEmiChargeDue + m.firstEmiChargeCollected;
  const marketPct = marketTotal > 0
    ? Math.min(100, Math.round(((m.emiCollected + m.firstEmiChargeCollected) / marketTotal) * 100))
    : 0;

  return (
    <div className="card p-6 border-l-4 border-brand-500 bg-gradient-to-br from-amber-50 via-white to-fuchsia-50">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="section-header mb-0">
            📈{' '}
            <span className="gradient-pan bg-gradient-to-r from-brand-600 via-fuchsia-600 to-amber-500 bg-clip-text text-transparent">
              Live DB Metric Dashboard
            </span>
          </p>
          <p className="text-[11px] text-ink-muted mt-0.5">
            Running (active) loans only — completed, settled &amp; NPA accounts excluded
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              try {
                const res = await fetch('/api/fines/recalc', { method: 'POST' });
                const data = await res.json();
                if (!res.ok) { toast.error(data.error || 'Recalc failed'); return; }
                toast.success(`Fines updated (${data.updated ?? 0} EMIs)`);
                await load();
              } catch { toast.error('Recalc failed'); }
            }}
            className="text-xs text-amber-600 underline underline-offset-4"
          >
            Recalc fines
          </button>
          <button onClick={load} className="text-xs text-brand-600 underline underline-offset-4">
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
        variants={staggerContainer(0.08, 0.05)}
        initial="hidden"
        animate="show"
      >
        <MetricCard
          title="LOAN AMOUNT"
          formula="Phone Value − Down Payment"
          value={totalLoanValue}
          gradient="from-emerald-500 via-teal-600 to-cyan-700"
          glow="shadow-emerald-500/40"
          graphic="trending-up"
        />
        <MetricCard
          title="COLLECTION"
          formula="EMI + Fine + 1st Charge Collected"
          value={totalCollection}
          gradient="from-violet-600 via-purple-600 to-fuchsia-600"
          glow="shadow-purple-500/40"
          graphic="filled-bar"
          progress={collectionPct}
        />
        <MetricCard
          title="BTD (Balance To Date)"
          formula="Total Loan Value − Total Collection"
          value={btd}
          gradient="from-blue-600 via-indigo-600 to-violet-700"
          glow="shadow-indigo-500/40"
          graphic="sparkline"
        />
        <MetricCard
          title="MARKET DUE"
          formula="All EMI + All Fine + All 1st EMI Charge (paid + unpaid)"
          value={marketDue}
          gradient="from-amber-500 via-orange-600 to-red-600"
          glow="shadow-orange-500/40"
          graphic="progress-ring"
          progress={marketPct}
        />
        <MetricCard
          title="INV / DUE"
          formula="Expected Revenue − Total Collection"
          value={invDue}
          gradient="from-rose-500 via-red-600 to-rose-700"
          glow="shadow-rose-500/40"
          graphic="alert"
        />
      </motion.div>

      {/* ── Profit & Loss — year-wise, terminal accounts only ── */}
      {(() => {
        const profitBy = m.profitByYear || {};
        const lossBy = m.lossBookedByYear || {};
        const nowY = String(new Date().getFullYear());
        const years = Array.from(new Set([nowY, ...Object.keys(profitBy), ...Object.keys(lossBy)]))
          .filter(y => y !== 'unknown')
          .sort((a, b) => Number(b) - Number(a));
        const yP = profitBy[plYear] || { amount: 0, count: 0 };
        const yL = lossBy[plYear] || { amount: 0, count: 0 };
        const net = yP.amount - yL.amount;
        const maxBar = Math.max(1, ...years.map(y =>
          Math.max(Math.abs(profitBy[y]?.amount || 0), Math.abs(lossBy[y]?.amount || 0)),
        ));
        return (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={SPRING}
            className="mt-4 rounded-xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-white to-red-500/10 p-4"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700">📊 Profit &amp; Loss — Year-wise</p>
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  Profit = Collected − Loan Value, completed customers only · Loss Booked = NPA + Settled · running loans excluded
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-ink-muted">Year</label>
                <select
                  value={plYear}
                  onChange={e => setPlYear(e.target.value)}
                  className="form-input !w-auto !py-1.5 text-sm"
                  aria-label="Profit and loss year"
                >
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {/* Selected-year stats */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Profit {plYear}</p>
                <CountUp value={yP.amount} format={fmt} className="num mt-1 block text-2xl font-extrabold text-emerald-700" />
                <p className="mt-0.5 text-[11px] text-ink-muted">{yP.count} customer{yP.count === 1 ? '' : 's'} completed · Collected − Loan Value</p>
              </div>
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-red-700">Loss Booked {plYear}</p>
                <CountUp value={yL.amount} format={fmt} className="num mt-1 block text-2xl font-extrabold text-red-700" />
                <p className="mt-0.5 text-[11px] text-ink-muted">{yL.count} account{yL.count === 1 ? '' : 's'} (NPA + Settled) · Loan Value − Collected</p>
              </div>
              <div className={`rounded-xl border p-3 ${net >= 0 ? 'border-teal-500/40 bg-teal-500/10' : 'border-rose-500/40 bg-rose-500/10'}`}>
                <p className={`text-[10px] font-bold uppercase tracking-widest ${net >= 0 ? 'text-teal-700' : 'text-rose-700'}`}>Net {plYear}</p>
                <CountUp value={net} format={fmt} className={`num mt-1 block text-2xl font-extrabold ${net >= 0 ? 'text-teal-700' : 'text-rose-700'}`} />
                <p className="mt-0.5 text-[11px] text-ink-muted">Profit − Loss Booked</p>
              </div>
            </div>

            {/* Expected loss — live risk, not year-bucketed */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">⚠️</span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Expected Loss (live)</p>
                  <p className="text-[11px] text-ink-muted">Running customers with EMI due for more than 3 months · EMI due only, fines &amp; charges excluded</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wide text-ink-muted">Accounts</p>
                  <CountUp value={m.expectedLossCount} className="num block text-lg font-extrabold text-amber-700" />
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wide text-ink-muted">EMI Due</p>
                  <CountUp value={m.expectedLossEmiDue} format={fmt} className="num block text-lg font-extrabold text-amber-700" />
                </div>
              </div>
            </div>

            {/* All years — clickable profit vs loss bars */}
            <div className="mt-4 space-y-2">
              {years.map(y => {
                const p = profitBy[y] || { amount: 0, count: 0 };
                const l = lossBy[y] || { amount: 0, count: 0 };
                const pPct = Math.max(p.amount > 0 ? 3 : 0, (Math.abs(p.amount) / maxBar) * 100);
                const lPct = Math.max(l.amount > 0 ? 3 : 0, (Math.abs(l.amount) / maxBar) * 100);
                const active = y === plYear;
                return (
                  <button key={y} onClick={() => setPlYear(y)} className="block w-full text-left">
                    <div className="flex items-center gap-3">
                      <span className={`num w-12 text-xs font-bold ${active ? 'text-ink' : 'text-ink-muted'}`}>{y}</span>
                      <div className="flex-1 space-y-1">
                        <span className="flex h-2.5 overflow-hidden rounded-full bg-surface-3">
                          <motion.span
                            className={`block h-full rounded-full ${active ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-emerald-400/50'}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${pPct}%` }}
                            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                          />
                        </span>
                        <span className="flex h-2.5 overflow-hidden rounded-full bg-surface-3">
                          <motion.span
                            className={`block h-full rounded-full ${active ? 'bg-gradient-to-r from-red-500 to-rose-400' : 'bg-red-400/50'}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${lPct}%` }}
                            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
                          />
                        </span>
                      </div>
                      <span className="w-28 text-right">
                        <span className="num block text-xs font-semibold text-emerald-700">+{fmt(p.amount)} <span className="text-ink-muted">({p.count})</span></span>
                        <span className="num block text-xs font-semibold text-red-700">−{fmt(l.amount)} <span className="text-ink-muted">({l.count})</span></span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

          </motion.div>
        );
      })()}

      {/* Fine collected — MONTH-wise (transaction-level, bucketed by approval month) */}
      {(() => {
        const byMonth = m.fineCollectedByMonth || {};
        const nowY = new Date().getFullYear();
        const years = Array.from(
          new Set<number>([nowY, ...Object.keys(byMonth).map(k => Number(k.slice(0, 4))).filter(Number.isFinite)]),
        ).sort((a, b) => b - a);
        const monthsOfYear = MONTH_NAMES.map((name, i) => {
          const key = `${fineYear}-${String(i + 1).padStart(2, '0')}`;
          return { key, name, value: byMonth[key] || 0 };
        });
        const selected = byMonth[fineMonth] || 0;
        const selectedLabel = (() => {
          const [y, mm] = fineMonth.split('-');
          return `${MONTH_NAMES[Number(mm) - 1]} ${y}`;
        })();
        const allTime = Object.values(byMonth).reduce((s, v) => s + v, 0);
        const maxM = Math.max(1, ...monthsOfYear.map(x => x.value));
        const noneYet = monthsOfYear.every(x => x.value === 0);
        return (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={SPRING}
            className="mt-4 rounded-xl border-2 border-rose-500/30 bg-gradient-to-br from-rose-500/10 via-pink-500/5 to-orange-500/10 p-4"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-rose-700">💸 Fine Collected — Month-wise</p>
                <p className="mt-0.5 text-[11px] text-ink-muted">Late-fine money actually collected, by the month it was approved</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-ink-muted">Year</label>
                <select
                  value={fineYear}
                  onChange={e => {
                    const y = Number(e.target.value);
                    setFineYear(y);
                    setFineMonth(`${y}-${fineMonth.slice(5, 7)}`);
                  }}
                  className="form-input !w-auto !py-1.5 text-sm"
                  aria-label="Fine collection year"
                >
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-ink-muted">Collected in {selectedLabel}</p>
                <CountUp value={selected} format={fmt} className="num block text-3xl font-extrabold text-rose-700" />
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wide text-ink-muted">All time</p>
                <CountUp value={allTime} format={fmt} className="num block text-lg font-bold text-ink" />
              </div>
            </div>

            {/* Clickable per-month breakdown bars for the selected year */}
            <div className="mt-4 space-y-1.5">
              {noneYet ? (
                <p className="py-2 text-center text-xs text-ink-muted">No fine collected in {fineYear} yet.</p>
              ) : monthsOfYear.map(({ key, name, value }, i) => {
                const pct = maxM > 0 ? Math.max(value > 0 ? 3 : 0, (value / maxM) * 100) : 0;
                const active = key === fineMonth;
                return (
                  <button key={key} onClick={() => setFineMonth(key)} className="flex w-full items-center gap-3 text-left">
                    <span className={`num w-12 text-xs font-bold ${active ? 'text-rose-700' : 'text-ink-muted'}`}>{name}</span>
                    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                      <motion.span
                        className={`block h-full rounded-full ${active ? 'bg-gradient-to-r from-rose-500 to-orange-400' : 'bg-rose-400/50'}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.04 * i }}
                      />
                    </span>
                    <span className={`num w-24 text-right text-xs font-semibold ${active ? 'text-rose-700' : 'text-ink'}`}>{fmt(value)}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        );
      })()}
    </div>
  );
}

function MetricCard({
  title, formula, value, valueLabel, secondary, gradient, glow, graphic, progress,
}: {
  title: string;
  formula: string;
  value: number;
  /** Optional caption above the main value (e.g. "Collected"). */
  valueLabel?: string;
  /** Optional second labelled figure (e.g. Expected profit). */
  secondary?: { label: string; value: number };
  /** Tailwind gradient stops, e.g. "from-emerald-500 via-teal-600 to-cyan-700". */
  gradient: string;
  /** Matching coloured glow, e.g. "shadow-emerald-500/40". */
  glow: string;
  graphic: 'trending-up' | 'progress-ring' | 'sparkline' | 'filled-bar' | 'alert';
  progress?: number;
}) {
  return (
    <motion.div
      variants={cardRise}
      whileHover={{ y: -6, scale: 1.03, transition: SPRING }}
      whileTap={{ scale: 0.98 }}
      className={`sheen-track gradient-pan relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-4 text-white shadow-lg ${glow}`}
    >
      {/* Light blooms add depth; the dark one anchors the value area so white
          text stays readable even over the lightest gradient stop. */}
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/25 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-black/20 blur-2xl" />

      <div className="relative flex items-start justify-between gap-2">
        <p className="text-[10px] font-extrabold uppercase tracking-widest drop-shadow-sm">{title}</p>
        <span className="text-white/90 drop-shadow-sm">
          <MetricGraphic kind={graphic} progress={progress} />
        </span>
      </div>
      {valueLabel && (
        <p className="relative mt-1.5 text-[9px] font-bold uppercase tracking-widest text-white/80">{valueLabel}</p>
      )}
      <CountUp value={value} format={fmt} className={`num relative block text-2xl font-extrabold drop-shadow-md ${valueLabel ? '' : 'mt-2'}`} />
      {secondary && (
        <div className="relative mt-1 flex items-baseline gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-white/80">{secondary.label}</span>
          <CountUp value={secondary.value} format={fmt} className="num text-sm font-bold drop-shadow-sm" />
        </div>
      )}
      <p className="relative mt-1 text-[10px] font-medium leading-snug text-white/90 drop-shadow-sm">{formula}</p>
      {typeof progress === 'number' && graphic === 'filled-bar' && (
        <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-black/25">
          <motion.div
            className="h-full rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          />
        </div>
      )}
    </motion.div>
  );
}

function MetricGraphic({ kind, progress }: { kind: string; progress?: number }) {
  if (kind === 'trending-up') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="3 17 9 11 13 15 21 7" />
        <polyline points="14 7 21 7 21 14" />
      </svg>
    );
  }
  if (kind === 'progress-ring') {
    const pct = Math.max(0, Math.min(100, progress ?? 0));
    const r = 8, c = 2 * Math.PI * r;
    const dash = (pct / 100) * c;
    return (
      <svg width="22" height="22" viewBox="0 0 22 22">
        <circle cx="11" cy="11" r={r} stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" fill="none" />
        <circle
          cx="11" cy="11" r={r}
          stroke="currentColor" strokeWidth="3" fill="none"
          strokeDasharray={`${dash} ${c}`} transform="rotate(-90 11 11)"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === 'sparkline') {
    return (
      <svg width="32" height="22" viewBox="0 0 32 22" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="0 16 6 12 12 14 18 6 24 9 32 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 'filled-bar') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <rect x="3" y="14" width="4" height="7" rx="1" />
        <rect x="10" y="10" width="4" height="11" rx="1" />
        <rect x="17" y="5" width="4" height="16" rx="1" />
      </svg>
    );
  }
  // alert
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86 1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
