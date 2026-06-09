'use client';

import { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SPRING } from '@/lib/motion';

interface SearchInputProps {
  value?: string;
  onChange?: (v: string) => void;
  onSearch?: (v: string) => void;   // uncontrolled / legacy alias
  placeholder?: string;
  loading?: boolean;
  autoFocus?: boolean;
}

export default function SearchInput({
  value: externalValue,
  onChange,
  onSearch,
  placeholder = 'Search name / IMEI / Aadhaar…',
  loading,
  autoFocus,
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  // Uncontrolled mode: parent only gives onSearch callback, no value prop
  const isControlled = externalValue !== undefined && onChange !== undefined;
  const [internalValue, setInternalValue] = useState('');

  const displayValue = isControlled ? externalValue! : internalValue;

  function handleChange(v: string) {
    if (isControlled) {
      onChange!(v);
    } else {
      setInternalValue(v);
      onSearch?.(v);
    }
  }

  function handleClear() {
    if (isControlled) {
      onChange!('');
    } else {
      setInternalValue('');
      onSearch?.('');
    }
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  useEffect(() => {
    if (autoFocus) {
      // Slight delay so modal transitions don't steal focus
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  return (
    <motion.div
      className="relative"
      animate={{ scale: focused ? 1.01 : 1 }}
      transition={SPRING}
    >
      {/* Animated focus glow ring */}
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-brand-400/40"
        initial={false}
        animate={{ opacity: focused ? 1 : 0, scale: focused ? 1 : 0.98 }}
        transition={{ duration: 0.2 }}
      />

      {/* Search / spinner icon */}
      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none">
        <AnimatePresence mode="wait" initial={false}>
          {loading ? (
            <motion.svg
              key="spin"
              initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}
              className="animate-spin" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 010 20" />
            </motion.svg>
          ) : (
            <motion.svg
              key="search"
              initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}
              width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </motion.svg>
          )}
        </AnimatePresence>
      </div>

      {/* Never use type="search" — it adds browser-native clear buttons that conflict */}
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        className="input pl-10 pr-10 py-3 text-base shadow-sm relative"
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        spellCheck={false}
      />

      {/* Clear button — the centering (-translate-y-1/2) lives on a static
          wrapper so Framer's transforms on the button (scale/rotate/opacity)
          can't clobber the vertical-centre transform and push it out of view. */}
      <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
        <AnimatePresence>
          {displayValue && (
            <motion.button
              type="button"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={SPRING}
              whileHover={{ scale: 1.12, rotate: 90 }}
              whileTap={{ scale: 0.85 }}
              onClick={handleClear}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-3 text-ink-muted hover:bg-surface-4 hover:text-ink"
              aria-label="Clear search"
            >
              <svg width="13" height="13" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
