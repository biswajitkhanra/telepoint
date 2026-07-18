// Unique customer number shown to customers, printed in the UPI payment
// reference and searchable in the admin portal.
//
// The real permanent number lives in customers.customer_code (TP1001, TP1002…,
// added by migration 025). Until that migration is applied the column is
// missing/empty, so we fall back to a stable code derived from the customer's
// UUID — still unique and still usable on receipts, it just isn't a short
// sequential number yet.

export function customerCodeOf(c: { customer_code?: string | null; id?: string | null } | null | undefined): string {
  if (!c) return '';
  if (c.customer_code) return c.customer_code;
  if (c.id) return 'TP-' + c.id.replace(/-/g, '').slice(0, 8).toUpperCase();
  return '';
}

/** True when a search query looks like a customer number (TP1024, tp-3f9a2c1b…). */
export function looksLikeCustomerCode(q: string): boolean {
  return /^tp[-\s]?[0-9a-z]{2,12}$/i.test(q.trim());
}

/** Normalised form used for DB lookup: uppercase, no separators ("TP1024"). */
export function normalizeCustomerCode(q: string): string {
  return q.replace(/[^0-9a-z]/gi, '').toUpperCase();
}
