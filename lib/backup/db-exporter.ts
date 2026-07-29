// ─────────────────────────────────────────────────────────────────────────────
// lib/backup/db-exporter.ts
//
// Generates a complete SQL dump of the Supabase PostgreSQL database using a
// direct pg connection. The dump includes:
//   1. Header / settings
//   2. Sequences (CREATE SEQUENCE)
//   3. Tables    (CREATE TABLE with columns, defaults, NOT NULL)
//   4. Primary keys, unique constraints, foreign keys (ALTER TABLE ADD CONSTRAINT)
//   5. Indexes   (CREATE INDEX)
//   6. Row data  (INSERT INTO ... VALUES ...)
//   7. Footer
//
// Output is then gzip-compressed and returned as a Buffer.
//
// Only exports tables in the "public" schema that are actual user tables
// (excludes Supabase internal schemas: auth, storage, realtime, etc.)
// ─────────────────────────────────────────────────────────────────────────────

import { Client } from 'pg';
import { gzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);

// ── Constants ─────────────────────────────────────────────────────────────────

/** Schemas to skip — all Supabase-managed internal schemas */
const SKIP_SCHEMAS = [
  'auth',
  'storage',
  'realtime',
  'supabase_functions',
  'supabase_migrations',
  'extensions',
  'graphql',
  'graphql_public',
  'pgbouncer',
  'pgsodium',
  'pgsodium_masks',
  'vault',
  'net',
  'cron',
  'pg_catalog',
  'information_schema',
];

/** Batch size for row export (rows fetched per query to avoid memory spikes) */
const ROW_BATCH_SIZE = 1000;

// ── Public interface ──────────────────────────────────────────────────────────

export interface ExportResult {
  /** Gzip-compressed SQL dump */
  buffer: Buffer;
  /** List of tables that were exported */
  tables: string[];
  /** Total rows across all tables */
  totalRows: number;
}

/**
 * Connect to PostgreSQL and export the full public-schema database as a
 * gzip-compressed SQL file. The pg Client is managed internally.
 * @param databaseUrl  The PostgreSQL connection string (DATABASE_URL).
 */
export async function exportDatabase(databaseUrl: string): Promise<ExportResult> {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 30_000,
    query_timeout: 300_000, // 5 minutes max per query
    ssl: { rejectUnauthorized: false }, // Supabase uses SSL but may need this
  });

  await client.connect();

  try {
    const tables = await getPublicTables(client);
    const parts: string[] = [];
    let totalRows = 0;

    // ── Header ────────────────────────────────────────────────────────────────
    parts.push(buildHeader(tables));

    // ── Sequences ─────────────────────────────────────────────────────────────
    const sequences = await getSequences(client);
    if (sequences.length > 0) {
      parts.push('-- Sequences\n');
      for (const seq of sequences) {
        parts.push(seq);
      }
    }

    // ── Table DDL ─────────────────────────────────────────────────────────────
    parts.push('\n-- Table Definitions\n');
    for (const table of tables) {
      const ddl = await getTableDDL(client, table);
      parts.push(ddl);
    }

    // ── Constraints (PK, FK, Unique) ──────────────────────────────────────────
    parts.push('\n-- Constraints\n');
    const constraints = await getConstraints(client, tables);
    parts.push(constraints);

    // ── Indexes ───────────────────────────────────────────────────────────────
    parts.push('\n-- Indexes\n');
    const indexes = await getIndexes(client, tables);
    parts.push(indexes);

    // ── Row Data ──────────────────────────────────────────────────────────────
    parts.push('\n-- Table Data\n');
    for (const table of tables) {
      const { sql, rowCount } = await exportTableData(client, table);
      parts.push(sql);
      totalRows += rowCount;
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    parts.push(buildFooter(tables.length, totalRows));

    // ── Compress ──────────────────────────────────────────────────────────────
    const fullSql = parts.join('\n');
    const buffer = await gzipAsync(Buffer.from(fullSql, 'utf-8'));

    return { buffer, tables, totalRows };
  } finally {
    await client.end().catch(() => {});
  }
}

// ── Schema queries ────────────────────────────────────────────────────────────

async function getPublicTables(client: Client): Promise<string[]> {
  const { rows } = await client.query<{ tablename: string }>(`
    SELECT tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  return rows.map((r) => r.tablename);
}

async function getSequences(client: Client): Promise<string[]> {
  const { rows } = await client.query<{
    sequence_name: string;
    data_type: string;
    start_value: string;
    minimum_value: string;
    maximum_value: string;
    increment: string;
    cycle_option: string;
  }>(`
    SELECT sequence_name, data_type, start_value, minimum_value,
           maximum_value, increment, cycle_option
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
    ORDER BY sequence_name
  `);

  return rows.map(
    (r) =>
      `CREATE SEQUENCE IF NOT EXISTS public.${quote(r.sequence_name)}\n` +
      `  AS ${r.data_type}\n` +
      `  START WITH ${r.start_value}\n` +
      `  INCREMENT BY ${r.increment}\n` +
      `  MINVALUE ${r.minimum_value}\n` +
      `  MAXVALUE ${r.maximum_value}\n` +
      `  ${r.cycle_option === 'YES' ? 'CYCLE' : 'NO CYCLE'};\n`,
  );
}

async function getTableDDL(client: Client, tableName: string): Promise<string> {
  const { rows } = await client.query<{
    column_name: string;
    data_type: string;
    udt_name: string;
    character_maximum_length: number | null;
    numeric_precision: number | null;
    numeric_scale: number | null;
    is_nullable: string;
    column_default: string | null;
    is_identity: string;
    identity_generation: string | null;
  }>(`
    SELECT
      column_name,
      data_type,
      udt_name,
      character_maximum_length,
      numeric_precision,
      numeric_scale,
      is_nullable,
      column_default,
      is_identity,
      identity_generation
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
    ORDER BY ordinal_position
  `, [tableName]);

  if (rows.length === 0) return '';

  const columnDefs = rows.map((col) => {
    let typeDef = resolveType(col);
    const nullable = col.is_nullable === 'NO' ? ' NOT NULL' : '';
    let defaultDef = '';

    if (col.is_identity === 'YES') {
      const gen = col.identity_generation === 'ALWAYS' ? 'ALWAYS' : 'BY DEFAULT';
      defaultDef = ` GENERATED ${gen} AS IDENTITY`;
    } else if (col.column_default !== null) {
      defaultDef = ` DEFAULT ${col.column_default}`;
    }

    return `  ${quote(col.column_name)} ${typeDef}${defaultDef}${nullable}`;
  });

  return (
    `CREATE TABLE IF NOT EXISTS public.${quote(tableName)} (\n` +
    columnDefs.join(',\n') +
    '\n);\n'
  );
}

async function getConstraints(client: Client, tables: string[]): Promise<string> {
  if (tables.length === 0) return '';

  const { rows } = await client.query<{
    table_name: string;
    constraint_name: string;
    constraint_type: string;
    column_names: string;
    foreign_table: string | null;
    foreign_columns: string | null;
    update_rule: string | null;
    delete_rule: string | null;
  }>(`
    SELECT
      tc.table_name,
      tc.constraint_name,
      tc.constraint_type,
      string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS column_names,
      ccu.table_name  AS foreign_table,
      string_agg(ccu.column_name, ', ') AS foreign_columns,
      rc.update_rule,
      rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema    = kcu.table_schema
    LEFT JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema    = tc.table_schema
    LEFT JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
     AND rc.constraint_schema = tc.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = ANY($1)
      AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')
    GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type,
             ccu.table_name, rc.update_rule, rc.delete_rule
    ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name
  `, [tables]);

  const lines: string[] = [];
  for (const row of rows) {
    const cols = row.column_names
      .split(', ')
      .map((c) => quote(c.trim()))
      .join(', ');

    let def = '';
    if (row.constraint_type === 'PRIMARY KEY') {
      def = `PRIMARY KEY (${cols})`;
    } else if (row.constraint_type === 'UNIQUE') {
      def = `UNIQUE (${cols})`;
    } else if (row.constraint_type === 'FOREIGN KEY' && row.foreign_table) {
      const foreignCols = (row.foreign_columns || '')
        .split(', ')
        .map((c) => quote(c.trim()))
        .join(', ');
      def =
        `FOREIGN KEY (${cols}) ` +
        `REFERENCES public.${quote(row.foreign_table)} (${foreignCols})` +
        (row.update_rule && row.update_rule !== 'NO ACTION' ? ` ON UPDATE ${row.update_rule}` : '') +
        (row.delete_rule && row.delete_rule !== 'NO ACTION' ? ` ON DELETE ${row.delete_rule}` : '');
    }

    if (def) {
      lines.push(
        `ALTER TABLE public.${quote(row.table_name)} ` +
        `ADD CONSTRAINT ${quote(row.constraint_name)} ${def};\n`,
      );
    }
  }

  return lines.join('');
}

async function getIndexes(client: Client, tables: string[]): Promise<string> {
  if (tables.length === 0) return '';

  const { rows } = await client.query<{ indexdef: string }>(`
    SELECT indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = ANY($1)
      AND indexname NOT IN (
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
      )
    ORDER BY tablename, indexname
  `, [tables]);

  return rows.map((r) => r.indexdef + ';\n').join('');
}

// ── Row data export ───────────────────────────────────────────────────────────

async function exportTableData(
  client: Client,
  tableName: string,
): Promise<{ sql: string; rowCount: number }> {
  // Get total count first
  const countRes = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM public.${quote(tableName)}`,
  );
  const rowCount = parseInt(countRes.rows[0].count, 10);

  if (rowCount === 0) {
    return {
      sql: `-- Table: ${tableName} (0 rows)\n`,
      rowCount: 0,
    };
  }

  const parts: string[] = [`-- Table: ${tableName} (${rowCount} rows)\n`];

  let offset = 0;
  while (offset < rowCount) {
    const { rows } = await client.query(
      `SELECT * FROM public.${quote(tableName)} LIMIT $1 OFFSET $2`,
      [ROW_BATCH_SIZE, offset],
    );

    if (rows.length === 0) break;

    const columns = Object.keys(rows[0])
      .map((c) => quote(c))
      .join(', ');

    for (const row of rows) {
      const values = Object.values(row).map(sqlLiteral).join(', ');
      parts.push(`INSERT INTO public.${quote(tableName)} (${columns}) VALUES (${values});\n`);
    }

    offset += rows.length;
  }

  return { sql: parts.join(''), rowCount };
}

// ── Type resolution ───────────────────────────────────────────────────────────

function resolveType(col: {
  data_type: string;
  udt_name: string;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
}): string {
  const dt = col.data_type.toLowerCase();

  if (dt === 'character varying') {
    return col.character_maximum_length
      ? `VARCHAR(${col.character_maximum_length})`
      : 'TEXT';
  }
  if (dt === 'character') {
    return `CHAR(${col.character_maximum_length ?? 1})`;
  }
  if (dt === 'numeric' || dt === 'decimal') {
    if (col.numeric_precision != null && col.numeric_scale != null) {
      return `NUMERIC(${col.numeric_precision}, ${col.numeric_scale})`;
    }
    return 'NUMERIC';
  }
  if (dt === 'array') {
    // Resolve element type from udt_name (e.g. _text → text[])
    const elemType = col.udt_name.startsWith('_')
      ? col.udt_name.slice(1)
      : col.udt_name;
    return `${elemType.toUpperCase()}[]`;
  }
  if (dt === 'USER-DEFINED' || dt === 'user-defined') {
    return col.udt_name; // enum or composite type name
  }
  // timestamp, date, boolean, integer, bigint, text, uuid, jsonb, json, etc.
  return dt.toUpperCase();
}

// ── SQL value serialization ───────────────────────────────────────────────────

/**
 * Converts a JavaScript value to a safe SQL literal string.
 * Handles: null, boolean, number, Date, Buffer, Array, Object (jsonb), string.
 */
function sqlLiteral(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (Buffer.isBuffer(val)) return `'\\x${val.toString('hex')}'`;
  if (Array.isArray(val)) {
    return `'{${val.map((v) => (v === null ? 'NULL' : `"${String(v).replace(/"/g, '\\"')}`)).join(',')}}'`;
  }
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  }
  // String: escape single quotes
  return `'${String(val).replace(/'/g, "''")}'`;
}

// ── Identifier quoting ────────────────────────────────────────────────────────

/** Wraps an identifier in double-quotes for safe PostgreSQL usage. */
function quote(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

// ── Header / footer ───────────────────────────────────────────────────────────

function buildHeader(tables: string[]): string {
  return [
    '--',
    `-- EMI Portal — Full Database Backup`,
    `-- Generated: ${new Date().toISOString()}`,
    `-- Tables: ${tables.join(', ')}`,
    '--',
    '',
    'SET client_encoding = \'UTF8\';',
    'SET standard_conforming_strings = on;',
    "SET timezone = 'UTC';",
    'SET check_function_bodies = false;',
    'SET client_min_messages = warning;',
    'SET row_security = off;',
    '',
  ].join('\n');
}

function buildFooter(tableCount: number, totalRows: number): string {
  return [
    '',
    '--',
    `-- Backup complete`,
    `-- Tables exported: ${tableCount}`,
    `-- Total rows: ${totalRows}`,
    `-- Finished: ${new Date().toISOString()}`,
    '--',
  ].join('\n');
}
