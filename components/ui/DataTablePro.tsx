'use client';

/**
 * DataTablePro — enterprise data table for the redesigned dashboard.
 *
 * Sticky header + sticky first column, client-side sorting, instant search,
 * pagination, one-click CSV export, optional row expansion and an automatic
 * card layout on phones. Purely presentational: rows in = rows rendered, so
 * the table always shows exactly the records the backend returned.
 */

import { ReactNode, useMemo, useState, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight,
  Download, Search, Inbox, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/cn';

export interface Column<Row> {
  key: string;
  header: string;
  /** Raw value used for sorting, searching and CSV export. */
  accessor: (row: Row) => string | number;
  /** Custom cell renderer; falls back to the accessor value. */
  cell?: (row: Row) => ReactNode;
  align?: 'left' | 'right';
  /** Hide this column in the mobile card view. */
  hideOnCard?: boolean;
  numeric?: boolean;
}

export function DataTablePro<Row>({
  rows, columns, rowKey, title, searchable = true, exportName,
  pageSize = 10, onRowClick, renderExpanded, cardTitle, emptyText = 'No records found.',
  footer,
}: {
  rows: Row[];
  columns: Column<Row>[];
  rowKey: (row: Row) => string;
  title?: string;
  searchable?: boolean;
  /** Enables CSV export with this file name (omit to hide the button). */
  exportName?: string;
  pageSize?: number;
  onRowClick?: (row: Row) => void;
  /** Optional expandable-row content (chevron toggles). */
  renderExpanded?: (row: Row) => ReactNode;
  /** Which column renders as the card heading on mobile (defaults to first). */
  cardTitle?: (row: Row) => ReactNode;
  emptyText?: string;
  /** Optional totals row (spans full width, always visible). */
  footer?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter(r => columns.some(c => String(c.accessor(r)).toLowerCase().includes(q)));
  }, [rows, columns, query]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find(c => c.key === sortKey);
    if (!col) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = col.accessor(a), vb = col.accessor(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [filtered, sortKey, sortDir, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const pageRows = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
    setPage(0);
  }

  function exportCsv() {
    if (!exportName) return;
    const esc = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      columns.map(c => esc(c.header)).join(','),
      ...sorted.map(r => columns.map(c => esc(c.accessor(r))).join(',')),
    ].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${exportName}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const headControls = (searchable || exportName || title) && (
    <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-3 border-b border-surface-4">
      {title && <p className="text-xs font-bold uppercase tracking-wider text-ink-muted mr-auto">{title}</p>}
      {searchable && (
        <label className="relative flex-1 min-w-[150px] sm:flex-none sm:w-56">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted/70" aria-hidden />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setPage(0); }}
            placeholder="Search…"
            aria-label={`Search ${title ?? 'table'}`}
            className="w-full rounded-lg border border-surface-4 bg-surface-2 pl-8 pr-3 py-1.5 text-xs text-ink placeholder-ink-muted/60 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/25"
          />
        </label>
      )}
      {exportName && (
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 rounded-lg border border-surface-4 bg-surface px-2.5 py-1.5 text-[11px] font-bold text-ink-muted hover:text-ink hover:border-indigo-300 transition-colors"
        >
          <Download size={12} aria-hidden /> CSV
        </button>
      )}
    </div>
  );

  const pagination = pages > 1 && (
    <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5 border-t border-surface-4">
      <p className="text-[11px] text-ink-muted num">
        {sorted.length === 0 ? 0 : safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)} of {sorted.length}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0}
          aria-label="Previous page"
          className="w-8 h-8 rounded-lg border border-surface-4 flex items-center justify-center text-ink-muted hover:text-ink disabled:opacity-35 transition-colors"
        ><ChevronLeft size={14} /></button>
        <span className="num text-[11px] font-bold text-ink px-2">{safePage + 1} / {pages}</span>
        <button
          onClick={() => setPage(p => Math.min(pages - 1, p + 1))} disabled={safePage >= pages - 1}
          aria-label="Next page"
          className="w-8 h-8 rounded-lg border border-surface-4 flex items-center justify-center text-ink-muted hover:text-ink disabled:opacity-35 transition-colors"
        ><ChevronRight size={14} /></button>
      </div>
    </div>
  );

  return (
    <div className="rounded-[20px] border border-surface-4/80 bg-surface shadow-card overflow-hidden dark:border-surface-3">
      {headControls}

      {/* Desktop / tablet table */}
      <div className="hidden md:block overflow-x-auto max-h-[560px] overflow-y-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-20">
            <tr>
              {renderExpanded && <th className="w-9 bg-surface-2 border-b border-surface-4" aria-label="Expand" />}
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={cn(
                    'bg-surface-2 border-b border-surface-4 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-muted whitespace-nowrap',
                    c.align === 'right' ? 'text-right' : 'text-left',
                    i === 0 && 'sticky left-0 z-10',
                  )}
                >
                  <button
                    onClick={() => toggleSort(c.key)}
                    className={cn(
                      'inline-flex items-center gap-1 hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded',
                      c.align === 'right' && 'flex-row-reverse',
                    )}
                  >
                    {c.header}
                    {sortKey === c.key
                      ? (sortDir === 'asc' ? <ArrowUp size={11} aria-hidden /> : <ArrowDown size={11} aria-hidden />)
                      : <ArrowUpDown size={11} className="opacity-40" aria-hidden />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map(row => {
              const key = rowKey(row);
              const isOpen = expanded === key;
              return (
                <Fragment key={key}>
                  <tr
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      'border-b border-surface-3 transition-colors',
                      onRowClick && 'cursor-pointer hover:bg-indigo-50/60 dark:hover:bg-indigo-500/10',
                    )}
                  >
                    {renderExpanded && (
                      <td className="px-2 py-2.5">
                        <button
                          onClick={e => { e.stopPropagation(); setExpanded(isOpen ? null : key); }}
                          aria-expanded={isOpen} aria-label={isOpen ? 'Collapse row' : 'Expand row'}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-3 transition-colors"
                        >
                          <motion.span animate={{ rotate: isOpen ? 180 : 0 }} className="inline-flex"><ChevronDown size={14} /></motion.span>
                        </button>
                      </td>
                    )}
                    {columns.map((c, i) => (
                      <td
                        key={c.key}
                        className={cn(
                          'px-4 py-2.5 text-[13px] text-ink whitespace-nowrap',
                          c.align === 'right' && 'text-right',
                          c.numeric && 'num',
                          i === 0 && 'sticky left-0 bg-surface z-[5] font-medium',
                        )}
                      >
                        {c.cell ? c.cell(row) : c.accessor(row)}
                      </td>
                    ))}
                  </tr>
                  {renderExpanded && (
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <tr>
                          <td colSpan={columns.length + 1} className="p-0 border-b border-surface-3">
                            <motion.div
                              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                              className="overflow-hidden"
                            >
                              <div className="px-5 py-3 bg-surface-2/70">{renderExpanded(row)}</div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {footer}
      </div>

      {/* Mobile card view */}
      <div className="md:hidden divide-y divide-surface-3">
        {pageRows.map(row => {
          const key = rowKey(row);
          const [first, ...rest] = columns.filter(c => !c.hideOnCard);
          return (
            <button
              key={key}
              onClick={onRowClick ? () => onRowClick(row) : renderExpanded ? () => setExpanded(expanded === key ? null : key) : undefined}
              className="w-full text-left px-4 py-3.5 active:bg-surface-2 transition-colors whitespace-normal"
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="text-sm font-semibold text-ink min-w-0 truncate">
                  {cardTitle ? cardTitle(row) : (first.cell ? first.cell(row) : first.accessor(row))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {rest.map(c => (
                  <div key={c.key} className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-ink-muted">{c.header}</p>
                    <div className={cn('text-xs text-ink truncate', c.numeric && 'num font-semibold')}>
                      {c.cell ? c.cell(row) : c.accessor(row)}
                    </div>
                  </div>
                ))}
              </div>
              {renderExpanded && expanded === key && (
                <div className="mt-3 rounded-xl bg-surface-2 p-3">{renderExpanded(row)}</div>
              )}
            </button>
          );
        })}
        {footer}
      </div>

      {sorted.length === 0 && (
        <div className="py-6">
          <div className="flex flex-col items-center text-center">
            <Inbox size={20} className="text-ink-muted/50 mb-2" aria-hidden />
            <p className="text-xs text-ink-muted">{emptyText}</p>
          </div>
        </div>
      )}

      {pagination}
    </div>
  );
}
