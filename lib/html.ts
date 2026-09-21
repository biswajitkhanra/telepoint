// Minimal HTML-entity escaping for values interpolated into server-rendered
// HTML strings (receipt / settlement-letter pages). These pages are public
// (no auth) and echo retailer/admin-entered text (customer name, UTR, notes,
// rejection reason, etc.) — every such value MUST go through this before
// being placed in the template, or a crafted value becomes stored XSS that
// fires in any visitor's browser, including an admin who opens the link.
export function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Same escaping, but also safe to place inside an HTML attribute value
// delimited by double quotes (covers URLs like customer_photo_url).
export const escAttr = esc;
