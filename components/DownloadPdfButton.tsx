'use client';

import { useState } from 'react';
import { downloadElementAsPdf } from '@/lib/pdf';

/**
 * Downloads a DOM element (by id) as a real PDF file. Used by server-rendered
 * pages (e.g. the payment receipt) that can't call the PDF helper directly.
 * Falls back to the browser print dialog if rasterising ever fails, so the user
 * is never left with nothing.
 */
export default function DownloadPdfButton({
  targetId,
  filename,
  label = '⬇️ Download PDF',
  style,
}: {
  targetId: string;
  filename: string;
  label?: string;
  style?: React.CSSProperties;
}) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    const el = document.getElementById(targetId);
    if (!el) return;
    setBusy(true);
    try {
      await downloadElementAsPdf(el, filename);
    } catch {
      // Last resort so the action never silently dies.
      try { window.print(); } catch { /* ignore */ }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      style={{
        padding: '0.625rem 1.25rem', background: '#1d4ed8', color: 'white', border: 'none',
        borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: 600,
        cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center',
        gap: '0.5rem', opacity: busy ? 0.7 : 1, ...style,
      }}
    >
      {busy ? 'Preparing PDF…' : label}
    </button>
  );
}
