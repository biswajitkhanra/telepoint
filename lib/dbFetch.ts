// ─────────────────────────────────────────────────────────────────────────────
// Robust + FAST Supabase reads for large datasets.
//
// PostgREST (the API behind Supabase) returns at most ~1000 rows per request
// and rejects very long request URLs. A big retailer like MAMA TELECOM has
// 1000+ customers and many thousands of EMI rows, so the naive patterns:
//
//   supabase.from('emi_schedule').select('*').in('customer_id', thousandsOfIds)
//   supabase.from('emi_schedule').select('*')            // whole-table scan
//
// silently lose rows (row cap) or fail entirely (URL too long). That made the
// Live DB dashboard and the per-retailer summary count only a fraction of each
// customer's EMIs — looking like "only one EMI per customer is due".
//
// These helpers page through every row and chunk id-lists so nothing is lost.
// Pages and chunks are fetched IN PARALLEL (bounded fan-out) instead of one
// round trip at a time — on a 10k-row scan that turns ~10 serial network hops
// into 2-3 parallel waves, which is what makes the analysis / report endpoints
// respond fast. Results are reassembled in the exact same order the old
// sequential loops produced, so callers see identical data.
// The caller's query MUST carry a stable, unique ordering, otherwise rows can
// repeat or skip across page boundaries.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 1000;
// Keep id-lists short enough that the encoded URL stays well under proxy limits
// (~150 UUIDs ≈ 5.5 KB of query string).
const ID_CHUNK = 150;
// How many page-requests / id-chunk-requests to keep in flight at once.
// High enough to collapse latency, low enough to stay friendly to PostgREST.
const PARALLEL_PAGES = 4;
const PARALLEL_CHUNKS = 6;

// Loose shape so a Supabase query builder (PostgrestSingleResponse<…>) is
// directly assignable — its `data` is a projected/partial row type and `error`
// is a PostgrestError, both structurally compatible with this.
type PageResult = { data: unknown[] | null; error: { message: string } | null };

// Speculative parallel pages can read past the end of the table. Recent
// PostgREST answers those with an empty 200, but some deployments return
// 416 "Requested Range Not Satisfiable" — either way it just means "no rows".
const isPastEnd = (error: { message: string }) =>
  /range not satisfiable|PGRST103/i.test(error.message);

/**
 * Page through a query that has no id-list filter (e.g. a whole-table scan or a
 * single-column filter like `.eq('retailer_id', id)`).
 *
 * Pages are requested in parallel waves of PARALLEL_PAGES; the wave loop stops
 * as soon as any page comes back short (the end of the table).
 */
export async function fetchAllPaged<T>(
  buildPage: (from: number, to: number) => PromiseLike<PageResult>,
): Promise<T[]> {
  const out: T[] = [];
  for (let wave = 0; ; wave++) {
    const starts = Array.from(
      { length: PARALLEL_PAGES },
      (_, i) => (wave * PARALLEL_PAGES + i) * PAGE_SIZE,
    );
    const results = await Promise.all(starts.map(from => buildPage(from, from + PAGE_SIZE - 1)));
    let done = false;
    for (const { data, error } of results) {
      if (error) {
        if (isPastEnd(error)) { done = true; break; }
        throw new Error(error.message);
      }
      const batch = (data ?? []) as T[];
      out.push(...batch);
      if (batch.length < PAGE_SIZE) { done = true; break; }
    }
    if (done) break;
  }
  return out;
}

/**
 * Fetch every row whose `idColumn` value is in `ids`, chunking the id-list to
 * stay under URL-length limits and paging each chunk to stay under the row cap.
 *
 * Chunks run PARALLEL_CHUNKS at a time; per-chunk results are reassembled in
 * chunk order so the combined output matches the old sequential behaviour.
 */
export async function fetchAllByIds<T>(
  ids: string[],
  buildPage: (chunk: string[], from: number, to: number) => PromiseLike<PageResult>,
): Promise<T[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK));

  const perChunk: T[][] = new Array(chunks.length);
  for (let i = 0; i < chunks.length; i += PARALLEL_CHUNKS) {
    await Promise.all(chunks.slice(i, i + PARALLEL_CHUNKS).map(async (chunk, j) => {
      const rows: T[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await buildPage(chunk, from, from + PAGE_SIZE - 1);
        if (error) {
          if (isPastEnd(error)) break;
          throw new Error(error.message);
        }
        const batch = (data ?? []) as T[];
        rows.push(...batch);
        if (batch.length < PAGE_SIZE) break;
      }
      perChunk[i + j] = rows;
    }));
  }
  return perChunk.flat();
}
