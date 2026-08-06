'use client';

import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  className,
  autoFocus,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const [localValue, setLocalValue] = useState(value);

  // Debounce the input value
  useEffect(() => {
    const handler = setTimeout(() => {
      onChange(localValue);
    }, 300);
    return () => clearTimeout(handler);
  }, [localValue, onChange]);

  // Sync external value changes (e.g., cleared by parent)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <label className={cn('relative flex items-center', className)}>
      <Search size={14} className="absolute left-3 text-ink-muted/70" aria-hidden />
      <input
        type="text"
        value={localValue}
        onChange={e => setLocalValue(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full rounded-lg border border-surface-4 bg-surface-2 pl-8 pr-8 py-1.5 text-xs text-ink placeholder-ink-muted/60 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all duration-200"
      />
      {localValue && (
        <button
          type="button"
          onClick={() => setLocalValue('')}
          className="absolute right-2.5 text-ink-muted/50 hover:text-ink transition-colors"
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}
    </label>
  );
}
