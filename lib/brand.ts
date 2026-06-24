/**
 * Device brand derivation.
 *
 * Per business rule, the FIRST word of a device/model name is its brand:
 *   "Redmi 5A"        → "Redmi"
 *   "redmi note 13"   → "Redmi"
 *   "SAMSUNG A14 5G"  → "Samsung"
 *   "iPhone 13"       → "iPhone"
 *
 * The full model string itself is treated as the "category" (the specific
 * product line) on the retailer dashboard's Graphical Overview.
 */

/** Brand = first whitespace-delimited token of the model name, Title-cased. */
export function brandOf(modelNo: string | null | undefined): string {
  const raw = (modelNo || '').trim();
  if (!raw) return 'Unknown';
  const first = raw.split(/\s+/)[0];
  // Title-case so "redmi", "REDMI", "Redmi" all collapse to one brand bucket.
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/** Full device model as a display "category" — trimmed, collapsed whitespace. */
export function categoryOf(modelNo: string | null | undefined): string {
  const raw = (modelNo || '').trim().replace(/\s+/g, ' ');
  return raw || 'Unknown';
}
