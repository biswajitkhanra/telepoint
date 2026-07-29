// ─────────────────────────────────────────────────────────────────────────────
// lib/backup/storage-client.ts
//
// Google Drive storage backend for database backups.
//
// Authentication uses a Google Cloud Service Account — no browser OAuth needed.
// The service account's credentials are stored entirely in environment variables.
//
// Required env vars:
//   GOOGLE_SERVICE_ACCOUNT_JSON  – full contents of the service account key JSON
//   GOOGLE_DRIVE_FOLDER_ID       – ID of the Drive folder to upload backups into
//
// The folder must be shared with the service account email (Editor access).
// ─────────────────────────────────────────────────────────────────────────────

import { google } from 'googleapis';
import { Readable } from 'stream';

// ── Types ────────────────────────────────────────────────────────────────────

export interface StorageObject {
  /** File name in Drive (e.g. backup-2026-07-29.sql.gz) */
  key: string;
  /** Google Drive file ID */
  driveId: string;
  /** When the file was created in Drive */
  lastModified: Date;
  /** File size in bytes */
  sizeBytes: number;
}

export interface StorageClient {
  /** Upload a Buffer as a file into the configured Drive folder. */
  upload(filename: string, body: Buffer, contentType: string): Promise<void>;
  /** List all backup files in the Drive folder. */
  list(): Promise<StorageObject[]>;
  /** Delete a file by its Google Drive file ID. */
  remove(driveId: string): Promise<void>;
  /** Human-readable label for logging. */
  label: string;
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Returns a StorageClient backed by Google Drive.
 * Throws immediately if required env vars are missing.
 */
export function createStorageClient(): StorageClient {
  const serviceAccountJson = requireEnv('GOOGLE_SERVICE_ACCOUNT_JSON');
  const folderId = requireEnv('GOOGLE_DRIVE_FOLDER_ID');

  // Parse the service account credentials
  let credentials: {
    client_email: string;
    private_key: string;
  };
  try {
    credentials = JSON.parse(serviceAccountJson);
  } catch {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. ' +
      'Paste the entire contents of the service account key file.',
    );
  }

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key fields.',
    );
  }

  // Build the authenticated Drive client
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  const drive = google.drive({ version: 'v3', auth });

  return {
    label: `Google Drive folder ${folderId}`,

    // ── Upload ──────────────────────────────────────────────────────────────
    async upload(filename: string, body: Buffer, contentType: string): Promise<void> {
      // Check if a file with the same name already exists in the folder
      // (idempotent: overwrite if today's backup already exists)
      const existing = await drive.files.list({
        q: `'${folderId}' in parents and name = '${filename}' and trashed = false`,
        fields: 'files(id)',
        spaces: 'drive',
      });

      const existingId = existing.data.files?.[0]?.id;

      const media = {
        mimeType: contentType,
        body: Readable.from(body),
      };

      if (existingId) {
        // Update the existing file (same name, new content)
        await drive.files.update({
          fileId: existingId,
          media,
          fields: 'id',
        });
      } else {
        // Create a new file in the backup folder
        await drive.files.create({
          requestBody: {
            name: filename,
            parents: [folderId],
          },
          media,
          fields: 'id',
        });
      }
    },

    // ── List ────────────────────────────────────────────────────────────────
    async list(): Promise<StorageObject[]> {
      const objects: StorageObject[] = [];
      let pageToken: string | undefined;

      do {
        const res = await drive.files.list({
          q: `'${folderId}' in parents and name contains 'backup-' and trashed = false`,
          fields: 'nextPageToken, files(id, name, createdTime, size)',
          orderBy: 'createdTime',
          spaces: 'drive',
          pageToken,
        });

        for (const file of res.data.files ?? []) {
          if (file.id && file.name && file.createdTime) {
            objects.push({
              key: file.name,
              driveId: file.id,
              lastModified: new Date(file.createdTime),
              sizeBytes: parseInt(file.size ?? '0', 10),
            });
          }
        }

        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);

      return objects;
    },

    // ── Remove ──────────────────────────────────────────────────────────────
    async remove(driveId: string): Promise<void> {
      await drive.files.delete({ fileId: driveId });
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val;
}
