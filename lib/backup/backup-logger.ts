// ─────────────────────────────────────────────────────────────────────────────
// lib/backup/backup-logger.ts
//
// Typed structure for backup run logs. Every backup produces one BackupLog
// object that is both returned as the HTTP response body and can optionally
// be persisted to a separate logs table / file.
// ─────────────────────────────────────────────────────────────────────────────

export interface BackupLog {
  /** ISO-8601 timestamp when the backup job started */
  startTime: string;
  /** ISO-8601 timestamp when the backup job finished (success or failure) */
  endTime: string;
  /** Wall-clock duration in milliseconds */
  durationMs: number;
  /** true if the backup completed and was uploaded successfully */
  success: boolean;
  /** Object key in the storage bucket, e.g. backups/2026/07/backup-2026-07-29.sql.gz */
  backupKey: string | null;
  /** Compressed size of the uploaded file in bytes */
  compressedSizeBytes: number | null;
  /** Human-readable size string, e.g. "4.2 MB" */
  compressedSizeHuman: string | null;
  /** Number of tables exported */
  tablesExported: number;
  /** Number of total rows exported across all tables */
  totalRowsExported: number;
  /** Number of old backups deleted during retention pruning */
  oldBackupsDeleted: number;
  /** Number of upload attempts (1 = first try succeeded) */
  uploadAttempts: number;
  /** Error message if success === false */
  error: string | null;
  /** Stack trace if success === false and error has stack */
  errorStack: string | null;
}

/**
 * Format bytes to a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Build a finished BackupLog from partial fields gathered during the run.
 */
export function buildBackupLog(
  startTime: Date,
  partial: Omit<BackupLog, 'startTime' | 'endTime' | 'durationMs' | 'compressedSizeHuman'>,
): BackupLog {
  const endTime = new Date();
  return {
    ...partial,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    durationMs: endTime.getTime() - startTime.getTime(),
    compressedSizeHuman:
      partial.compressedSizeBytes != null
        ? formatBytes(partial.compressedSizeBytes)
        : null,
  };
}
