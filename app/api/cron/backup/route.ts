// ─────────────────────────────────────────────────────────────────────────────
// app/api/cron/backup/route.ts
//
// Vercel Cron Job endpoint — triggered daily at 2:00 AM UTC.
//
// This endpoint is SEPARATE from the existing /api/backup (Google Sheets
// mirror). It creates a full PostgreSQL SQL dump, compresses it with gzip,
// and uploads it to a Google Drive folder via a Service Account.
//
// Security:
//   Vercel automatically injects the Authorization: Bearer <CRON_SECRET>
//   header on every cron invocation. The endpoint rejects all other callers.
//
// Manual trigger (for testing):
//   curl -X GET https://your-domain.vercel.app/api/cron/backup \
//        -H "Authorization: Bearer <your-CRON_SECRET>"
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { exportDatabase } from '@/lib/backup/db-exporter';
import { createStorageClient } from '@/lib/backup/storage-client';
import { buildBackupLog } from '@/lib/backup/backup-logger';

// Vercel requires force-dynamic for cron routes
export const dynamic = 'force-dynamic';

// Max execution time — Vercel Pro supports up to 300s, Hobby up to 60s
export const maxDuration = 300;

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_UPLOAD_ATTEMPTS = 3;
const RETRY_DELAY_MS = 3000;

// ── Authorization ─────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[backup] CRON_SECRET env var is not set — rejecting request');
    return false;
  }
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) return false;
  const token = authHeader.slice(7).trim();
  return token.length === cronSecret.length && token === cronSecret;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: 'Unauthorized — valid CRON_SECRET required' },
      { status: 401 },
    );
  }

  const startTime = new Date();
  console.log(`[backup] Starting backup job at ${startTime.toISOString()}`);

  let backupKey: string | null = null;
  let compressedSizeBytes: number | null = null;
  let tablesExported = 0;
  let totalRowsExported = 0;
  let oldBackupsDeleted = 0;
  let uploadAttempts = 0;

  try {
    // ── 1. Validate required env vars ──────────────────────────────────────
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    // ── 2. Generate the SQL dump ───────────────────────────────────────────
    console.log('[backup] Connecting to PostgreSQL and generating SQL dump...');
    const { buffer, tables, totalRows } = await exportDatabase(databaseUrl);

    tablesExported = tables.length;
    totalRowsExported = totalRows;
    compressedSizeBytes = buffer.length;

    console.log(
      `[backup] Dump complete: ${tables.length} tables, ${totalRows} rows, ` +
      `${(buffer.length / 1024 / 1024).toFixed(2)} MB compressed`,
    );

    // ── 3. Build the filename ──────────────────────────────────────────────
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const filename = `backup-${yyyy}-${mm}-${dd}.sql.gz`;
    backupKey = filename;

    console.log(`[backup] Uploading to Google Drive: ${filename}`);

    // ── 4. Upload with retry logic ─────────────────────────────────────────
    const storage = createStorageClient();

    for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
      uploadAttempts = attempt;
      try {
        await storage.upload(filename, buffer, 'application/gzip');
        break; // success
      } catch (err) {
        if (attempt === MAX_UPLOAD_ATTEMPTS) {
          throw new Error(
            `Upload failed after ${MAX_UPLOAD_ATTEMPTS} attempts. ` +
            `Last error: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        console.warn(
          `[backup] Upload attempt ${attempt}/${MAX_UPLOAD_ATTEMPTS} failed. ` +
          `Retrying in ${RETRY_DELAY_MS}ms...`,
        );
        await sleep(RETRY_DELAY_MS);
      }
    }

    console.log(`[backup] Upload successful after ${uploadAttempts} attempt(s)`);

    // ── 5. Retention pruning ───────────────────────────────────────────────
    const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS ?? '30', 10);
    oldBackupsDeleted = await pruneOldBackups(storage, retentionDays);

    if (oldBackupsDeleted > 0) {
      console.log(
        `[backup] Pruned ${oldBackupsDeleted} old backup(s) beyond ${retentionDays}-day retention`,
      );
    }

    // ── 6. Success response ────────────────────────────────────────────────
    const log = buildBackupLog(startTime, {
      success: true,
      backupKey,
      compressedSizeBytes,
      tablesExported,
      totalRowsExported,
      oldBackupsDeleted,
      uploadAttempts,
      error: null,
      errorStack: null,
    });

    console.log('[backup] Job finished successfully:', JSON.stringify(log, null, 2));
    return NextResponse.json(log, { status: 200 });

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('[backup] Backup job FAILED:', error.message);
    console.error('[backup] Stack:', error.stack);

    const log = buildBackupLog(startTime, {
      success: false,
      backupKey,
      compressedSizeBytes,
      tablesExported,
      totalRowsExported,
      oldBackupsDeleted,
      uploadAttempts,
      error: error.message,
      errorStack: error.stack ?? null,
    });

    return NextResponse.json(log, { status: 500 });
  }
}

// ── Retention pruning ─────────────────────────────────────────────────────────

async function pruneOldBackups(
  storage: Awaited<ReturnType<typeof createStorageClient>>,
  retentionDays: number,
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - retentionDays);

  const allFiles = await storage.list();
  const toDelete = allFiles.filter((f) => f.lastModified < cutoffDate);

  // Delete in small parallel batches
  const CONCURRENCY = 5;
  for (let i = 0; i < toDelete.length; i += CONCURRENCY) {
    await Promise.allSettled(
      toDelete.slice(i, i + CONCURRENCY).map(async (f) => {
        try {
          await storage.remove(f.driveId);
          console.log(`[backup] Deleted old backup: ${f.key} (${f.driveId})`);
        } catch (err) {
          console.warn(`[backup] Failed to delete ${f.key}:`, err);
        }
      }),
    );
  }

  return toDelete.length;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
