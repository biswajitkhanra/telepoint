export function customerCodeOf(
  c: { customer_code?: string | null; id?: string | null } | null | undefined
): string {
  if (!c) return '';
  if (c.customer_code) return c.customer_code;
  if (c.id) return 'TP-' + c.id.replace(/-/g, '').slice(0, 8).toUpperCase();
  return '';
}

export function looksLikeCustomerCode(q: string): boolean {
  return /^tp[-\s]?[0-9a-z]{2,12}$/i.test(q.trim());
}

export function normalizeCustomerCode(q: string): string {
  return q.replace(/[^0-9a-z]/gi, '').toUpperCase();
}
