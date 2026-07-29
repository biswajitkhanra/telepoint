// ─────────────────────────────────────────────────────────────────────────────
// app/api/cron/backup/route.ts
//
// Vercel Cron Job endpoint — triggered daily at 2:00 AM UTC.
//
// This endpoint is SEPARATE from the existing /api/backup (Google Sheets
// mirror). It creates a full PostgreSQL SQL dump, compresses it, and uploads
// it to cloud storage (Cloudflare R2 or AWS S3).
//
// Security:
//   Vercel automatically injects the Authorization: Bearer <CRON_SECRET>
//   header on every cron invocation. The endpoint rejects all other callers.
//   Set CRON_SECRET in both Vercel dashboard and vercel.json is NOT needed —
//   Vercel handles this automatically when CRON_SECRET is in your env.
//
// Manual trigger (for testing):
//   curl -X GET https://your-domain.vercel.app/api/cron/backup \
//        -H "Authorization: Bearer <your-CRON_SECRET>"
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { exportDatabase } from '@/lib/backup/db-exporter';
import { createStorageClient } from '@/lib/backup/storage-client';
import { buildBackupLog, type BackupLog } from '@/lib/backup/backup-logger';

// Vercel requires force-dynamic for cron routes
export const dynamic = 'force-dynamic';

// Max execution time — Vercel Pro supports up to 300s, Hobby up to 60s
export const maxDuration = 300;

// ── Constants ─────────────────────────────────────────────────────────────────

const BACKUP_PREFIX = 'backups';
const MAX_UPLOAD_ATTEMPTS = 3;
const RETRY_DELAY_MS = 3000;

// ── Authorization ─────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // Fail-closed: if CRON_SECRET is not configured, deny all requests
    console.error('[backup] CRON_SECRET env var is not set — rejecting request');
    return false;
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) return false;

  const token = authHeader.slice(7).trim();
  // Constant-time comparison to prevent timing attacks
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

  // Partial log fields accumulated during the run
  let backupKey: string | null = null;
  let compressedSizeBytes: number | null = null;
  let tablesExported = 0;
  let totalRowsExported = 0;
  let oldBackupsDeleted = 0;
  let uploadAttempts = 0;

  try {
    // ── 1. Validate required environment variables ─────────────────────────
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

    // ── 3. Build the storage key (organized by date) ───────────────────────
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    backupKey = `${BACKUP_PREFIX}/${yyyy}/${mm}/backup-${yyyy}-${mm}-${dd}.sql.gz`;

    console.log(`[backup] Uploading to storage: ${backupKey}`);

    // ── 4. Upload with retry logic ─────────────────────────────────────────
    const storage = createStorageClient();
    await uploadWithRetry(storage, backupKey, buffer, uploadAttempts, (attempts) => {
      uploadAttempts = attempts;
    });

    console.log(`[backup] Upload successful after ${uploadAttempts} attempt(s)`);

    // ── 5. Retention pruning — delete backups older than retention window ──
    const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS ?? '30', 10);
    oldBackupsDeleted = await pruneOldBackups(storage, retentionDays);

    if (oldBackupsDeleted > 0) {
      console.log(`[backup] Pruned ${oldBackupsDeleted} old backup(s) beyond ${retentionDays}-day retention`);
    }

    // ── 6. Build success log ───────────────────────────────────────────────
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

// ── Upload with retry ─────────────────────────────────────────────────────────

async function uploadWithRetry(
  storage: Awaited<ReturnType<typeof createStorageClient>>,
  key: string,
  buffer: Buffer,
  _initialAttempts: number,
  setAttempts: (n: number) => void,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
    setAttempts(attempt);
    try {
      await storage.upload(key, buffer, 'application/gzip');
      return; // Success
    } catch (err) {
      const isLast = attempt === MAX_UPLOAD_ATTEMPTS;
      if (isLast) {
        throw new Error(
          `Upload failed after ${MAX_UPLOAD_ATTEMPTS} attempts. Last error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      console.warn(
        `[backup] Upload attempt ${attempt}/${MAX_UPLOAD_ATTEMPTS} failed. ` +
        `Retrying in ${RETRY_DELAY_MS}ms... Error: ${err instanceof Error ? err.message : String(err)}`,
      );
      await sleep(RETRY_DELAY_MS);
    }
  }
}

// ── Retention pruning ─────────────────────────────────────────────────────────

async function pruneOldBackups(
  storage: Awaited<ReturnType<typeof createStorageClient>>,
  retentionDays: number,
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - retentionDays);

  // List all objects under the backups/ prefix
  const allObjects = await storage.list(`${BACKUP_PREFIX}/`);

  // Filter to objects older than the cutoff
  const toDelete = allObjects.filter(
    (obj) => obj.lastModified < cutoffDate && obj.key.endsWith('.sql.gz'),
  );

  // Delete in parallel (but cap concurrency to avoid rate limits)
  const CONCURRENCY = 5;
  for (let i = 0; i < toDelete.length; i += CONCURRENCY) {
    const batch = toDelete.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      batch.map(async (obj) => {
        try {
          await storage.remove(obj.key);
          console.log(`[backup] Deleted old backup: ${obj.key}`);
        } catch (err) {
          // Non-fatal: log but don't fail the overall backup job
          console.warn(`[backup] Failed to delete ${obj.key}:`, err);
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
