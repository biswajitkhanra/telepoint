/**
 * Aadhaar must never be sent to the customer-facing apps in full: neither the
 * web portal nor the mobile app displays it, and the Aadhaar (Data Security)
 * regulations require masking to the last 4 digits wherever it is shown.
 */
export function maskAadhaar(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return 'XXXXXXXX' + digits.slice(-4);
}

export function redactCustomer<T extends Record<string, unknown>>(c: T): T {
  return { ...c, aadhaar: maskAadhaar(c.aadhaar) } as T;
}
