'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Stale-while-revalidate JSON fetcher.
 *
 * The API routes are intentionally `no-store` (live financial figures), which
 * made every tab switch feel slow. This hook makes the UI instant WITHOUT
 * touching server logic: the last good payload is snapshotted in
 * sessionStorage and rendered immediately, while a fresh request revalidates
 * in the background and replaces it the moment it lands. Numbers on screen
 * are therefore always real API data — at worst a few seconds old, clearly
 * refreshed in place.
 */
export function useCachedFetch<T>(url: string | null, ttlMs = 5 * 60_000) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async (background = false) => {
    if (!url) return;
    const mySeq = ++seq.current;
    if (!background) setLoading(true);
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = (await res.json()) as T;
      if (seq.current !== mySeq) return;
      setData(json);
      try {
        sessionStorage.setItem(`tp-cache:${url}`, JSON.stringify({ t: Date.now(), v: json }));
      } catch { /* storage full — cache is best-effort */ }
    } catch (e) {
      if (seq.current !== mySeq) return;
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      if (seq.current === mySeq) { setLoading(false); setRefreshing(false); }
    }
  }, [url]);

  useEffect(() => {
    if (!url) return;
    let hadSnapshot = false;
    try {
      const raw = sessionStorage.getItem(`tp-cache:${url}`);
      if (raw) {
        const { t, v } = JSON.parse(raw) as { t: number; v: T };
        if (Date.now() - t < ttlMs) {
          setData(v);
          setLoading(false);
          hadSnapshot = true;
        }
      }
    } catch { /* corrupt snapshot — fall through to network */ }
    load(hadSnapshot);
  }, [url, ttlMs, load]);

  return { data, loading, refreshing, error, reload: () => load(false) };
}
