import FinanceScene from '@/components/motion/FinanceScene';

/** Route-level loading screen for the staff sections (Next.js loading.tsx). */
export default function RouteLoader({ label }: { label: string }) {
  return (
    <div className="min-h-screen page-bg flex items-center justify-center p-6" role="status" aria-live="polite">
      <div className="flex flex-col items-center text-center">
        <FinanceScene scale={0.8} />
        <p className="mt-4 text-base font-semibold tracking-tight text-ink">{label}</p>
        <p className="mt-1 text-xs text-ink-muted">Fetching the latest EMI data…</p>
      </div>
    </div>
  );
}
