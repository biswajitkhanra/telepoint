import { createServiceClient } from '@/lib/supabase/server';
import { fetchAllPaged, fetchAllByIds } from '@/lib/dbFetch';

// ─────────────────────────────────────────────────────────────────────────────
// One loader for the report / analysis endpoints: every customer, every EMI and
// every retailer, paged past PostgREST's 1000-row cap with the service client
// (so imported history is included, not just rows touched via the portal).
//
// Results are memoised per server instance for a short window, so opening
// Reports, then Analytics, then changing the month re-uses one scan instead of
// re-reading ~20k rows each time. Writes elsewhere show up within CACHE_MS.
// ─────────────────────────────────────────────────────────────────────────────

export type PortfolioCustomer = {
  id: string;
  retailer_id: string | null;
  status: string;
  purchase_value: number | null;
  down_payment: number | null;
  disburse_amount: number | null;
  purchase_date: string | null;
  created_at: string | null;
  completion_date: string | null;
  settlement_amount: number | null;
  settlement_date: string | null;
  first_emi_charge_amount: number | null;
  first_emi_charge_paid_amount: number | null;
  first_emi_charge_paid_at: string | null;
};

export type PortfolioEmi = {
  id: string;
  customer_id: string;
  emi_no: number;
  due_date: string;
  amount: number;
  status: string;
  partial_paid_amount: number | null;
  paid_at: string | null;
  fine_amount: number | null;
  fine_waived: boolean | null;
  fine_paid_amount: number | null;
  fine_paid_at: string | null;
  collection_requested_at: string | null;
  mode: string | null;
  utr: string | null;
};

export interface Portfolio {
  customers: PortfolioCustomer[];
  emis: PortfolioEmi[];
  retailers: { id: string; name: string }[];
  loadedAt: number;
}

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; value: Promise<Portfolio> }>();

const CUSTOMER_COLS =
  'id, retailer_id, status, purchase_value, down_payment, disburse_amount, purchase_date, created_at, completion_date, settlement_amount, settlement_date, first_emi_charge_amount, first_emi_charge_paid_amount, first_emi_charge_paid_at';
const EMI_COLS =
  'id, customer_id, emi_no, due_date, amount, status, partial_paid_amount, paid_at, fine_amount, fine_waived, fine_paid_amount, fine_paid_at, collection_requested_at, mode, utr';

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function load(retailerId: string | null): Promise<Portfolio> {
  const svc = createServiceClient();
  const [customers, retailers] = await Promise.all([
    fetchAllPaged<PortfolioCustomer>((from, to) => {
      let q = svc.from('customers').select(CUSTOMER_COLS).order('id').range(from, to);
      if (retailerId) q = q.eq('retailer_id', retailerId);
      return q as unknown as Page<PortfolioCustomer>;
    }),
    fetchAllPaged<{ id: string; name: string }>((from, to) =>
      svc.from('retailers').select('id, name').order('id').range(from, to) as unknown as Page<{ id: string; name: string }>),
  ]);

  // Whole portfolio: one paged table scan is cheaper than 15+ id-chunks.
  const emis = retailerId
    ? await fetchAllByIds<PortfolioEmi>(customers.map(c => c.id), (chunk, from, to) =>
        svc.from('emi_schedule').select(EMI_COLS).in('customer_id', chunk)
          .order('customer_id').order('emi_no').range(from, to) as unknown as Page<PortfolioEmi>)
    : await fetchAllPaged<PortfolioEmi>((from, to) =>
        svc.from('emi_schedule').select(EMI_COLS).order('id').range(from, to) as unknown as Page<PortfolioEmi>);

  return { customers, emis, retailers, loadedAt: Date.now() };
}

/** Every customer / EMI / retailer (optionally one retailer's book), cached ~60s. */
export function loadPortfolio(retailerId: string | null = null, fresh = false): Promise<Portfolio> {
  const key = retailerId || '*';
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = load(retailerId);
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key)); // never cache a failure
  return value;
}

/** Group EMIs by customer id. */
export function emisByCustomer(emis: PortfolioEmi[]): Map<string, PortfolioEmi[]> {
  const map = new Map<string, PortfolioEmi[]>();
  for (const e of emis) {
    const arr = map.get(e.customer_id);
    if (arr) arr.push(e); else map.set(e.customer_id, [e]);
  }
  return map;
}
