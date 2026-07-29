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
                                               │  (Authorization check) │
                                               └──────────┬───────────┘
                                                          │
                                                          ▼
                                               ┌──────────────────────┐
                                               │  lib/backup/          │
                                               │  db-exporter.ts       │
                                               │                       │
                                               │  1. Connect to DB     │
                                               │     via DATABASE_URL  │
                                               │  2. Export schema DDL │
                                               │     (tables, indexes, │
                                               │      sequences, FKs)  │
                                               │  3. Export all rows   │
                                               │     as INSERT SQL     │
                                               │  4. gzip compress     │
                                               └──────────┬───────────┘
                                                          │
                                                          ▼
                                               ┌──────────────────────┐
                                               │  lib/backup/          │
                                               │  storage-client.ts    │
                                               │                       │
                                               │  Upload to:           │
                                               │  backups/YYYY/MM/     │
                                               │  backup-YYYY-MM-DD   │
                                               │  .sql.gz              │
                                               │                       │
                                               │  (Cloudflare R2       │
                                               │   or AWS S3)          │
                                               └──────────┬───────────┘
                                                          │
                                                          ▼
                                               ┌──────────────────────┐
                                               │  Retention Pruning    │
                                               │  Delete backups older │
                                               │  than 30 days         │
                                               └──────────┬───────────┘
                                                          │
                                                          ▼
                                               ┌──────────────────────┐
                                               │  Return JSON log      │
                                               │  { success, size,     │
                                               │    duration, tables } │
                                               └──────────────────────┘
```

### What Gets Backed Up

The backup includes the **complete public schema** of your Supabase PostgreSQL database:

- All table definitions (columns, types, defaults, NOT NULL constraints)
- All sequences
- All primary keys, unique constraints, and foreign key relationships
- All custom indexes
- **Every single row** from every table
- Supabase internal schemas (`auth`, `storage`, `realtime`, etc.) are intentionally excluded — they contain Supabase system data that cannot be restored directly

### Storage Format

Backups are stored as gzip-compressed SQL files:

```
backups/
├── 2026/
│   ├── 07/
│   │   ├── backup-2026-07-29.sql.gz
│   │   ├── backup-2026-07-30.sql.gz
│   │   └── ...
│   └── 08/
│       └── backup-2026-08-01.sql.gz
└── ...
```

---

## Required Environment Variables

Add these to your **Vercel project settings** → Environment Variables.

### Core Variables (Always Required)

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | Supabase **direct** connection URL (not the pooler). Get this from Supabase Dashboard → Project Settings → Database → Connection string → URI mode (Session / Direct). | `postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres` |
| `CRON_SECRET` | A random secret that Vercel uses to authenticate cron calls. Generate with: `openssl rand -base64 32` | `abc123...` |
| `STORAGE_PROVIDER` | Which storage backend to use: `r2` or `s3` | `r2` |
| `BACKUP_RETENTION_DAYS` | *(Optional)* How many days of backups to keep. Default: `30` | `30` |

### If Using Cloudflare R2 (`STORAGE_PROVIDER=r2`)

| Variable | Description | Where to find it |
|---|---|---|
| `R2_ACCOUNT_ID` | Your Cloudflare account ID | Cloudflare Dashboard → right sidebar |
| `R2_ACCESS_KEY_ID` | R2 API token Access Key ID | R2 → Manage R2 API tokens |
| `R2_SECRET_ACCESS_KEY` | R2 API token Secret Access Key | R2 → Manage R2 API tokens |
| `R2_BUCKET_NAME` | The name of your R2 bucket | R2 → Your bucket name |

### If Using AWS S3 (`STORAGE_PROVIDER=s3`)

| Variable | Description | Where to find it |
|---|---|---|
| `AWS_ACCESS_KEY_ID` | IAM user access key | AWS Console → IAM → Users → Security credentials |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key | AWS Console → IAM → Users → Security credentials |
| `AWS_REGION` | S3 bucket region | e.g. `ap-south-1`, `us-east-1` |
| `S3_BUCKET_NAME` | Your S3 bucket name | AWS Console → S3 |

> **IAM Policy for S3**: The IAM user only needs these permissions on your bucket:
> ```json
> {
>   "Effect": "Allow",
>   "Action": ["s3:PutObject", "s3:GetObject", "s3:ListBucket", "s3:DeleteObject"],
>   "Resource": ["arn:aws:s3:::YOUR-BUCKET-NAME", "arn:aws:s3:::YOUR-BUCKET-NAME/*"]
> }
> ```

---

## Setup Instructions

### Step 1 — Create Storage Bucket

**Cloudflare R2:**
1. Go to Cloudflare Dashboard → R2
2. Create a new bucket (e.g., `emi-portal-backups`)
3. Go to R2 → Manage R2 API Tokens
4. Create a token with **Object Read & Write** permission on your bucket
5. Copy the Account ID, Access Key ID, and Secret Access Key

**AWS S3:**
1. Create an S3 bucket in your preferred region
2. Enable versioning (optional but recommended)
3. Create an IAM user with the policy shown above
4. Generate access keys for that user

### Step 2 — Configure Vercel Environment Variables

1. Open your Vercel project
2. Go to **Settings** → **Environment Variables**
3. Add all the required variables from the table above
4. Make sure to add them to **Production** (and optionally Preview/Development)

### Step 3 — Set CRON_SECRET

```bash
# Generate a strong secret
openssl rand -base64 32
```

Add the output as `CRON_SECRET` in Vercel environment variables.

### Step 4 — Deploy

Push your code. Vercel will automatically pick up `vercel.json` and schedule the cron job.

### Step 5 — Verify

Manually trigger the backup to confirm everything works:

```bash
curl -X GET https://your-domain.vercel.app/api/cron/backup \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Expected response:
```json
{
  "success": true,
  "startTime": "2026-07-29T02:00:01.234Z",
  "endTime": "2026-07-29T02:01:23.456Z",
  "durationMs": 82222,
  "backupKey": "backups/2026/07/backup-2026-07-29.sql.gz",
  "compressedSizeBytes": 524288,
  "compressedSizeHuman": "512 KB",
  "tablesExported": 11,
  "totalRowsExported": 48320,
  "oldBackupsDeleted": 0,
  "uploadAttempts": 1,
  "error": null,
  "errorStack": null
}
```

---

## How to Restore a Backup

### Step 1 — Download the Backup

**From Cloudflare R2:**
```bash
# Using rclone (recommended)
rclone copy r2:emi-portal-backups/backups/2026/07/backup-2026-07-29.sql.gz ./

# Using AWS CLI (R2 is S3-compatible)
aws s3 cp s3://emi-portal-backups/backups/2026/07/backup-2026-07-29.sql.gz ./ \
  --endpoint-url https://ACCOUNT_ID.r2.cloudflarestorage.com
```

**From AWS S3:**
```bash
aws s3 cp s3://emi-portal-backups/backups/2026/07/backup-2026-07-29.sql.gz ./
```

### Step 2 — Decompress

```bash
gunzip backup-2026-07-29.sql.gz
# Creates: backup-2026-07-29.sql
```

### Step 3 — Restore to PostgreSQL

> ⚠️ **Warning**: Restoring will overwrite existing data. Make sure you're targeting the right database.

```bash
# Restore to Supabase (use the direct connection URL)
psql "postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres" \
  -f backup-2026-07-29.sql
```

**Or using a transaction for safety:**
```bash
psql "postgresql://..." <<'EOF'
BEGIN;
-- Review the first few lines of the backup first
-- \i backup-2026-07-29.sql
-- If it looks right: COMMIT;
-- If something is wrong: ROLLBACK;
EOF
```

### Partial Restore (Single Table)

```bash
# Extract only the INSERT statements for a specific table
grep "^INSERT INTO public\.\"customers\"" backup-2026-07-29.sql | \
  psql "postgresql://..." 
```

---

## How to Change the Backup Schedule

Edit `vercel.json` in the project root:

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

The `schedule` field uses standard **cron syntax** (UTC timezone):

| Schedule | Cron Expression |
|---|---|
| Daily at 2:00 AM UTC (default) | `0 2 * * *` |
| Daily at midnight UTC | `0 0 * * *` |
| Every 12 hours | `0 0,12 * * *` |
| Every Sunday at 3:00 AM | `0 3 * * 0` |

> **Note**: Vercel Hobby plan supports cron jobs with a minimum interval of 1 day. Vercel Pro supports intervals as short as 1 minute.

---

## How to Change the Retention Period

Set the `BACKUP_RETENTION_DAYS` environment variable in Vercel:

```
BACKUP_RETENTION_DAYS=60   # Keep 60 days of backups
BACKUP_RETENTION_DAYS=7    # Keep only 1 week
BACKUP_RETENTION_DAYS=90   # Keep 3 months
```

The default is `30` days if the variable is not set.

---

## Viewing Backup Logs

Every backup run logs detailed information to **Vercel's runtime logs**:

1. Go to Vercel Dashboard → your project
2. Click **Logs** in the left sidebar
3. Filter by function name `/api/cron/backup`

All log lines are prefixed with `[backup]` for easy filtering.

---

## Troubleshooting

### Backup Returns 401 Unauthorized

- Verify `CRON_SECRET` is set in Vercel environment variables
- When testing manually, ensure you're sending the exact same value: `Authorization: Bearer <secret>`

### DATABASE_URL Error

- Use the **direct** connection URL from Supabase, not the transaction pooler
- Path in Supabase: Project Settings → Database → Connection string → Choose **Session mode** or **Direct connection**
- Format: `postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres`

### Upload Fails

- Verify storage credentials are correct
- Check that the bucket exists and the API token has write permission
- The system will retry up to 3 times with a 3-second delay between attempts

### Backup Takes Too Long / Times Out

- Vercel Hobby limits functions to 60 seconds. Upgrade to Pro for 300s max
- For very large databases, consider upgrading to Vercel Pro

### Old Backups Not Being Deleted

- Verify `BACKUP_RETENTION_DAYS` is set to a reasonable value
- Check that the storage API token has `DeleteObject` permission
- Deletion failures are non-fatal and won't break the backup — check logs for warnings

---

## Security Notes

- The `/api/cron/backup` endpoint rejects all requests without a valid `Authorization: Bearer <CRON_SECRET>` header
- If `CRON_SECRET` is not configured, the endpoint is fail-closed (returns 401 for all requests)
- The endpoint is separate from the existing `/api/backup` (Google Sheets mirror), which uses its own `BACKUP_TOKEN`
- All credentials are stored in environment variables — never in source code
- The `pg` client uses SSL when connecting to Supabase

---

## Files Overview

| File | Purpose |
|---|---|
| `vercel.json` | Configures the daily cron schedule |
| `app/api/cron/backup/route.ts` | Main backup endpoint — orchestrates the full pipeline |
| `lib/backup/db-exporter.ts` | Generates the SQL dump and gzip-compresses it |
| `lib/backup/storage-client.ts` | S3-compatible storage factory (R2 / AWS S3) |
| `lib/backup/backup-logger.ts` | TypeScript types and helpers for structured log output |
| `docs/BACKUP_SYSTEM.md` | This documentation file |
