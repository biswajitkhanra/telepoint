/**
 * Pure CSV builder. No xlsx. No external CSV library.
 *
 * RFC 4180 quoting + UTF-8 BOM so Excel on Windows opens the file with
 * the right encoding instead of mangling rupee signs.
 */

const BOM = '﻿';

// SECURITY: CSV/Excel formula injection.
// A stored value that begins with =, +, -, @, TAB or CR is interpreted by
// Excel / LibreOffice / Google Sheets as a FORMULA, not text. Customer and
// retailer names, remarks and device models are attacker-supplied free text,
// so a name like `=HYPERLINK("http://evil","click")` would execute in the
// spreadsheet of whoever opens an exported report.
//
// Neutralised by prefixing a single quote, which spreadsheets treat as the
// "this cell is literal text" marker. Plain numbers (including NEGATIVE
// amounts like -500, which legitimately start with '-') are left untouched, so
// every numeric column in every report keeps its exact existing value and
// stays numeric.
const FORMULA_LEAD = /^[=+\-@\t\r]/;
const NUMERIC = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

function neutralizeFormula(s: string): string {
  if (!FORMULA_LEAD.test(s)) return s;
  if (NUMERIC.test(s)) return s; // real number (e.g. "-500") — keep as-is
  return "'" + s;
}

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s === '') return '';
  // Decide quoting from the ORIGINAL value so the pre-existing rules are
  // unchanged: quote when it contains a delimiter, quote, CR or LF — or when
  // it has leading/trailing whitespace that Excel would otherwise trim. (The
  // formula prefix below would hide a leading tab/space from that test.)
  const needsQuote = /[",\r\n]/.test(s) || /^\s|\s$/.test(s);
  const out = neutralizeFormula(s);
  if (needsQuote) {
    return '"' + out.replace(/"/g, '""') + '"';
  }
  return out;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',');
}

export interface CsvBuildOptions {
  /** Header row labels, in the same order as keys in each row object. */
  header: string[];
  /**
   * Mixed-row array: each entry is either a pre-built CSV-formatted string
   * (used for banner/separator rows that don't fit the column grid) or an
   * object whose values are looked up by `keys` (defaults to `header`).
   */
  rows: Array<Record<string, unknown> | string>;
  /** Optional key list used to project objects to columns (defaults to header). */
  keys?: string[];
}

export function buildCsv(opts: CsvBuildOptions): string {
  const out: string[] = [BOM + csvRow(opts.header)];
  const keys = opts.keys ?? opts.header;
  for (const row of opts.rows) {
    if (typeof row === 'string') {
      out.push(row);
      continue;
    }
    out.push(csvRow(keys.map(k => row[k])));
  }
  return out.join('\r\n');
}

/** Single helper for downloadable CSV responses. */
export function csvHeaders(filename: string): Record<string, string> {
  return {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store, no-cache',
  };
}
