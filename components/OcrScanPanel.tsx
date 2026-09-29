'use client';

import { useRef, useState } from 'react';
import { ScanLine, Loader2, Check, Camera } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Guided OCR quick-fill for the Add/Edit customer form. The admin scans each
 * needed document in turn (phone box / IMEI sticker, then Aadhaar / ID); the
 * relevant fields auto-fill, and a live checklist cross-checks every required
 * detail — anything OCR can't read stays clearly marked so the admin types it
 * into the normal form below. Everything runs in the browser (Tesseract.js from
 * CDN); the document image and its text never leave the device.
 */

export type OcrExtracted = Partial<{
  customer_name: string;
  aadhaar: string;
  mobile: string;
  model_no: string;
  imei: string;
}>;

export interface OcrValues {
  customer_name?: string;
  father_name?: string;
  mobile?: string;
  aadhaar?: string;
  model_no?: string;
  imei?: string;
}

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

  for (const l of lines) {
    if (/imei/i.test(l)) { const m = digits(l).match(/\d{15}/); if (m) { out.imei = m[0]; break; } }
  }
  if (!out.imei) { const m = allDigits.match(/\d{15}/); if (m) out.imei = m[0]; }

  for (const l of lines) {
    const g = l.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/);
    if (g) { const d = digits(g[0]); if (d.length === 12 && d !== out.imei?.slice(0, 12)) { out.aadhaar = d; break; } }
  }

  for (const l of lines) {
    const d = digits(l);
    if (d.length <= 12) { const m = d.match(/[6-9]\d{9}/); if (m) { out.mobile = m[0]; break; } }
  }

  const brands = ['vivo', 'oppo', 'samsung', 'galaxy', 'redmi', 'realme', 'xiaomi', 'poco', 'oneplus', 'iqoo', 'motorola', 'moto', 'nokia', 'tecno', 'infinix', 'lava', 'micromax', 'apple', 'iphone'];
  for (const l of lines) {
    const low = l.toLowerCase();
    if (brands.some(b => low.includes(b))) {
      const cleaned = l.replace(/model(\s*(no|name|number))?\s*[:\-.]?/i, '').trim();
      if (cleaned.length >= 3 && cleaned.length <= 60) { out.model_no = cleaned; break; }
    }
  }

  for (const l of lines) {
    const m = l.match(/name\s*[:\-]\s*([A-Za-z][A-Za-z .]{2,40})/i);
    if (m) { out.customer_name = m[1].trim().replace(/\s+/g, ' '); break; }
  }

  return out;
}

type DocId = 'box' | 'id';
const DOCS: { id: DocId; label: string; hint: string; keys: (keyof OcrExtracted)[] }[] = [
  { id: 'box', label: 'Phone box / IMEI sticker', hint: 'reads IMEI & model', keys: ['imei', 'model_no'] },
  { id: 'id', label: 'Aadhaar / ID (front)', hint: 'reads name, Aadhaar & mobile', keys: ['customer_name', 'aadhaar', 'mobile'] },
];

const REQUIRED: { key: keyof OcrValues; label: string; manual?: boolean }[] = [
  { key: 'imei', label: 'IMEI' },
  { key: 'model_no', label: 'Model' },
  { key: 'customer_name', label: 'Name' },
  { key: 'aadhaar', label: 'Aadhaar' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'father_name', label: "Father's name", manual: true },
];

export default function OcrScanPanel({ onExtract, values }: { onExtract: (e: OcrExtracted) => void; values: OcrValues }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingDoc = useRef<DocId | null>(null);
  const [scanningId, setScanningId] = useState<DocId | null>(null);
  const [progress, setProgress] = useState(0);
  const [scanned, setScanned] = useState<Record<DocId, boolean>>({ box: false, id: false });

  function pick(docId: DocId) {
    pendingDoc.current = docId;
    inputRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const docId = pendingDoc.current;
    if (!file || !docId) return;
    const doc = DOCS.find(d => d.id === docId)!;
    setScanningId(docId); setProgress(0);
    try {
      const T = await loadTesseract();
      const { data } = await T.recognize(file, 'eng', {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logger: (m: any) => { if (m.status === 'recognizing text') setProgress(Math.round((m.progress || 0) * 100)); },
      });
      const all = parse(String(data?.text || ''));
      // Keep only the fields this document is expected to provide.
      const subset: OcrExtracted = {};
      for (const k of doc.keys) if (all[k]) subset[k] = all[k];
      const keys = Object.keys(subset);
      setScanned(s => ({ ...s, [docId]: true }));
      if (keys.length === 0) {
        toast(`No details read from ${doc.label}. Try a clearer photo, or type them below.`, { icon: '🔍' });
        return;
      }
      onExtract(subset);
      toast.success(`Read from ${doc.label}: ${keys.map(k => REQUIRED.find(r => r.key === k)?.label || k).join(', ')}`);
    } catch {
      toast.error('Scan failed. Check your connection and try again.');
    } finally {
      setScanningId(null);
    }
  }

  const missing = REQUIRED.filter(r => !String(values[r.key] || '').trim());

  return (
    <div className="rounded-xl border border-dashed border-blue-300 bg-blue-50/50 p-3 mb-4 space-y-3">
      <div className="flex items-center gap-2">
        <ScanLine size={18} className="text-blue-600 shrink-0" />
        <div>
          <div className="text-sm font-semibold text-slate-800">Quick fill by scan (OCR)</div>
          <div className="text-xs text-slate-500">Scan each document — it fills the form below. Runs on your device only.</div>
        </div>
      </div>

      {/* One button per document */}
      <div className="grid gap-2">
        {DOCS.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg bg-white border border-slate-200 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              {scanned[doc.id]
                ? <span className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0"><Check size={14} className="text-emerald-600" /></span>
                : <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><Camera size={13} className="text-slate-400" /></span>}
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-700 truncate">{doc.label}</div>
                <div className="text-[11px] text-slate-400 truncate">{doc.hint}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => pick(doc.id)}
              disabled={scanningId !== null}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-60 transition-colors"
            >
              {scanningId === doc.id ? <><Loader2 size={13} className="animate-spin" /> {progress}%</> : (scanned[doc.id] ? 'Re-scan' : 'Scan')}
            </button>
          </div>
        ))}
      </div>

      {/* Live cross-check of required details */}
      <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
        <div className="text-[11px] font-semibold text-slate-500 mb-1.5">REQUIRED DETAILS</div>
        <div className="flex flex-wrap gap-1.5">
          {REQUIRED.map((r) => {
            const ok = !!String(values[r.key] || '').trim();
            return (
              <span key={r.key} className={`inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5 border ${ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                {ok ? <Check size={11} /> : null}{r.label}{!ok && r.manual ? ' (type)' : ''}
              </span>
            );
          })}
        </div>
        {missing.length > 0 && (
          <p className="text-[11px] text-amber-700 mt-1.5">
            Still needed: <b>{missing.map(m => m.label).join(', ')}</b> — enter it in the form below.
          </p>
        )}
        {missing.length === 0 && (
          <p className="text-[11px] text-emerald-700 mt-1.5">All required details captured — review and save.</p>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
    </div>
  );
}
