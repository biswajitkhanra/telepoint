'use client';

import { useRef, useState } from 'react';
import { ScanLine, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * OCR quick-fill for the Add/Edit customer form. Runs entirely in the browser
 * (Tesseract.js loaded on demand from a CDN) so the scanned document image and
 * its text NEVER leave the admin's device — no server, no third-party OCR API.
 * The admin scans the phone box / IMEI sticker / Aadhaar and the detected IMEI,
 * model, Aadhaar and mobile are dropped into the form for review before saving.
 */

export type OcrExtracted = Partial<{
  customer_name: string;
  aadhaar: string;
  mobile: string;
  model_no: string;
  imei: string;
}>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global { interface Window { Tesseract?: any } }

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadTesseract(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-tesseract]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Tesseract));
      existing.addEventListener('error', () => reject(new Error('load failed')));
      return;
    }
    const s = document.createElement('script');
    s.src = TESSERACT_URL;
    s.async = true;
    s.dataset.tesseract = '1';
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => reject(new Error('Failed to load OCR library'));
    document.head.appendChild(s);
  });
}

const digits = (s: string) => s.replace(/\D/g, '');

function parse(text: string): OcrExtracted {
  const out: OcrExtracted = {};
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const allDigits = digits(text);

  // IMEI: 15 digits — prefer a line that mentions IMEI.
  for (const l of lines) {
    if (/imei/i.test(l)) {
      const m = digits(l).match(/\d{15}/);
      if (m) { out.imei = m[0]; break; }
    }
  }
  if (!out.imei) {
    const m = allDigits.match(/\d{15}/);
    if (m) out.imei = m[0];
  }

  // Aadhaar: 12 digits, usually printed as 4 4 4.
  for (const l of lines) {
    const g = l.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/);
    if (g) { const d = digits(g[0]); if (d.length === 12 && d !== out.imei?.slice(0, 12)) { out.aadhaar = d; break; } }
  }

  // Mobile: 10 digits starting 6-9, from a short line (not the IMEI/Aadhaar run).
  for (const l of lines) {
    const d = digits(l);
    if (d.length <= 12) {
      const m = d.match(/[6-9]\d{9}/);
      if (m) { out.mobile = m[0]; break; }
    }
  }

  // Model: a line containing a known brand.
  const brands = ['vivo', 'oppo', 'samsung', 'galaxy', 'redmi', 'realme', 'xiaomi', 'poco', 'oneplus', 'iqoo', 'motorola', 'moto', 'nokia', 'tecno', 'infinix', 'lava', 'micromax', 'apple', 'iphone'];
  for (const l of lines) {
    const low = l.toLowerCase();
    if (brands.some(b => low.includes(b))) {
      const cleaned = l.replace(/model(\s*(no|name|number))?\s*[:\-.]?/i, '').trim();
      if (cleaned.length >= 3 && cleaned.length <= 60) { out.model_no = cleaned; break; }
    }
  }

  // Name: an explicit "Name: ..." label (Aadhaar / ID front).
  for (const l of lines) {
    const m = l.match(/name\s*[:\-]\s*([A-Za-z][A-Za-z .]{2,40})/i);
    if (m) { out.customer_name = m[1].trim().replace(/\s+/g, ' '); break; }
  }

  return out;
}

const LABELS: Record<string, string> = {
  imei: 'IMEI', aadhaar: 'Aadhaar', mobile: 'Mobile', model_no: 'Model', customer_name: 'Name',
};

export default function OcrScanPanel({ onExtract }: { onExtract: (e: OcrExtracted) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setScanning(true); setProgress(0);
    try {
      const T = await loadTesseract();
      const { data } = await T.recognize(file, 'eng', {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logger: (m: any) => { if (m.status === 'recognizing text') setProgress(Math.round((m.progress || 0) * 100)); },
      });
      const found = parse(String(data?.text || ''));
      const keys = Object.keys(found);
      if (keys.length === 0) {
        toast('No details detected — try a clearer, well-lit photo.', { icon: '🔍' });
        return;
      }
      onExtract(found);
      toast.success('Auto-filled: ' + keys.map(k => LABELS[k] || k).join(', ') + ' — please verify.');
    } catch {
      toast.error('Scan failed. Check your connection and try again.');
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-blue-300 bg-blue-50/50 p-3 mb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <ScanLine size={18} className="text-blue-600 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800">Quick fill by scan (OCR)</div>
            <div className="text-xs text-slate-500 truncate">Scan the phone box / IMEI sticker / Aadhaar to auto-fill. Runs on your device only.</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={scanning}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 disabled:opacity-60 transition-colors"
        >
          {scanning ? <><Loader2 size={14} className="animate-spin" /> {progress}%</> : <>📷 Scan</>}
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
    </div>
  );
}
