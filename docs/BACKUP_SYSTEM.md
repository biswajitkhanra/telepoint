# EMI Portal — Automated Daily Backup System

This document covers everything you need to know about the automatic daily PostgreSQL backup system.

---

## How It Works

```
┌─────────────────────┐       2:00 AM UTC daily
│   Vercel Cron Job   │──────────────────────────────────┐
└─────────────────────┘                                   │
                                                          ▼
                                               ┌──────────────────────┐
                                               │  GET /api/cron/backup │
                                               │  (Auth: CRON_SECRET)  │
                                               └──────────┬───────────┘
                                                          │
                                                          ▼
                                               ┌──────────────────────┐
                                               │  db-exporter.ts       │
                                               │                       │
                                               │  • Connect via        │
                                               │    DATABASE_URL        │
                                               │  • Export schema DDL  │
                                               │    (tables, indexes,  │
                                               │     sequences, FKs)   │
                                               │  • Export all rows    │
                                               │    as INSERT SQL      │
                                               │  • gzip compress      │
                                               └──────────┬───────────┘
                                                          │
                                                          ▼
                                               ┌──────────────────────┐
                                               │  storage-client.ts    │
                                               │  (Google Drive)       │
                                               │                       │
                                               │  Upload:              │
                                               │  backup-YYYY-MM-DD   │
                                               │  .sql.gz              │
                                               │  → Drive Folder       │
                                               └──────────┬───────────┘
                                                          │
                                                          ▼
                                               ┌──────────────────────┐
                                               │  Retention Pruning    │
                                               │  Delete files older   │
                                               │  than 30 days         │
                                               └──────────────────────┘
```

### What Gets Backed Up

The backup includes the **complete public schema** of your Supabase PostgreSQL database:
- All table definitions (columns, types, defaults, NOT NULL)
- All sequences, primary keys, unique constraints, foreign keys, indexes
- **Every row** from every table (batched, memory-safe)

Supabase internal schemas (`auth`, `storage`, `realtime`, etc.) are excluded — they are managed by Supabase and can't be restored directly.

### Storage Location

Files are saved to a Google Drive folder you control:

```
Your Backup Folder (Google Drive)
├── backup-2026-07-29.sql.gz
├── backup-2026-07-30.sql.gz
├── backup-2026-07-31.sql.gz
└── ...  (latest 30 files kept)
```

---

## Setup Instructions

### Step 1 — Create a Google Cloud Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Go to **APIs & Services** → **Enable APIs** → search for and enable **Google Drive API**
4. Go to **APIs & Services** → **Credentials** → **Create Credentials** → **Service Account**
5. Give it any name (e.g. `emi-backup-bot`), click **Done**
6. Click the service account → **Keys** tab → **Add Key** → **Create new key** → **JSON**
7. Download the JSON file — this is your `GOOGLE_SERVICE_ACCOUNT_JSON`

### Step 2 — Create a Google Drive Backup Folder

1. Open [Google Drive](https://drive.google.com)
2. Create a new folder (e.g. `EMI Portal Backups`)
3. **Right-click the folder** → **Share**
4. Paste the service account email (from the JSON file, field `client_email`) and give it **Editor** access
5. Copy the folder ID from the URL:
   ```
   https://drive.google.com/drive/folders/1ABC_DEF_GHI_JKL
                                           ^^^^^^^^^^^^^^^^^^^
                                           This is the folder ID
   ```

### Step 3 — Add Environment Variables in Vercel

Go to your Vercel project → **Settings** → **Environment Variables** → add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres` |
| `CRON_SECRET` | Run `openssl rand -base64 32` and paste the output |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Paste the **entire contents** of the downloaded JSON key file |
| `GOOGLE_DRIVE_FOLDER_ID` | The folder ID from Step 2 |
| `BACKUP_RETENTION_DAYS` | *(Optional)* Default is `30` |

> **Tip for `GOOGLE_SERVICE_ACCOUNT_JSON`**: Open the JSON file, select all, copy, and paste directly into the Vercel env var value field. Vercel handles multi-line values fine.

### Step 4 — Deploy

Push your code. Vercel picks up `vercel.json` and schedules the cron automatically.

### Step 5 — Test Manually

```bash
curl -X GET https://your-domain.vercel.app/api/cron/backup \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Expected successful response:
```json
{
  "success": true,
  "startTime": "2026-07-29T02:00:01.234Z",
  "endTime":   "2026-07-29T02:01:23.456Z",
  "durationMs": 82222,
  "backupKey":  "backup-2026-07-29.sql.gz",
  "compressedSizeHuman": "512 KB",
  "tablesExported": 11,
  "totalRowsExported": 48320,
  "oldBackupsDeleted": 0,
  "uploadAttempts": 1,
  "error": null
}
```

After running, open your Google Drive backup folder — you'll see the `.sql.gz` file.

---

## How to Restore a Backup

### Step 1 — Download from Google Drive

Open the Drive folder → right-click the file → **Download**.
Or use `rclone` / `gdrive` CLI for scripted access.

### Step 2 — Decompress

```bash
gunzip backup-2026-07-29.sql.gz
# Produces: backup-2026-07-29.sql
```

### Step 3 — Restore to PostgreSQL

```bash
psql "postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres" \
     -f backup-2026-07-29.sql
```

> ⚠️ **Warning**: This will overwrite existing data. Always verify the target database before restoring.

### Partial Restore (Single Table)

```bash
# Extract only rows for a specific table
grep "^INSERT INTO public\.\"customers\"" backup-2026-07-29.sql | \
  psql "postgresql://..."
```

---

## How to Change the Backup Schedule

Edit `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/backup",
      "schedule": "0 2 * * *"
    }
  ]
}
```

| Schedule | Cron Expression |
|---|---|
| Daily at 2:00 AM UTC (default) | `0 2 * * *` |
| Daily at midnight UTC | `0 0 * * *` |
| Every Sunday at 3:00 AM | `0 3 * * 0` |

> **Note**: Vercel Hobby plan supports daily cron minimum. Vercel Pro supports up to every minute.

---

## How to Change the Retention Period

Set `BACKUP_RETENTION_DAYS` in Vercel environment variables:

```
BACKUP_RETENTION_DAYS=7    # Keep 1 week only
BACKUP_RETENTION_DAYS=30   # Keep 30 days (default)
BACKUP_RETENTION_DAYS=90   # Keep 3 months
```

---

## Viewing Logs

Every backup logs to Vercel's runtime logs (prefixed with `[backup]`):

1. Vercel Dashboard → your project → **Logs**
2. Filter by `/api/cron/backup`

---

## Troubleshooting

### 401 Unauthorized
- Verify `CRON_SECRET` is set in Vercel
- When testing with curl, use the exact value: `Authorization: Bearer <secret>`

### `GOOGLE_SERVICE_ACCOUNT_JSON` parse error
- Make sure you pasted the **entire JSON file** contents, not just the key
- The value should start with `{` and end with `}`

### `Permission denied` when uploading to Drive
- The Drive folder must be shared with the service account's `client_email`
- Share with **Editor** (not Viewer) access

### `DATABASE_URL` errors
- Use the **direct connection** URL from Supabase (not the transaction pooler)
- Path: Supabase Dashboard → Project Settings → Database → Connection string → URI (Session mode)

### Function Timeout
- Vercel Hobby limits to 60 seconds. Upgrade to Pro for 300s.
- Very large databases may need Vercel Pro.

---

## Files Overview

| File | Purpose |
|---|---|
| `vercel.json` | Cron schedule — daily at 2:00 AM UTC |
| `app/api/cron/backup/route.ts` | Main backup orchestrator |
| `lib/backup/db-exporter.ts` | SQL dump generator + gzip |
| `lib/backup/storage-client.ts` | Google Drive upload/list/delete |
| `lib/backup/backup-logger.ts` | Typed log structure |
| `docs/BACKUP_SYSTEM.md` | This file |
