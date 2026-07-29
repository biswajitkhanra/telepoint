// ─────────────────────────────────────────────────────────────────────────────
// lib/backup/storage-client.ts
//
// S3-compatible storage factory. Supports:
//   - Cloudflare R2 (STORAGE_PROVIDER=r2)
//   - AWS S3       (STORAGE_PROVIDER=s3)
//
// All configuration comes from environment variables. Never hardcode credentials.
// ─────────────────────────────────────────────────────────────────────────────

import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  type ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';

// ── Types ────────────────────────────────────────────────────────────────────

export interface StorageObject {
  key: string;
  lastModified: Date;
  sizeBytes: number;
}

export interface StorageClient {
  /** Upload a Buffer with the given object key and content type. */
  upload(key: string, body: Buffer, contentType: string): Promise<void>;
  /** List all objects under a given prefix. */
  list(prefix: string): Promise<StorageObject[]>;
  /** Delete a single object by key. */
  remove(key: string): Promise<void>;
  /** The bucket name (for logging). */
  bucketName: string;
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Returns a configured StorageClient based on STORAGE_PROVIDER env var.
 * Throws if required env vars are missing.
 */
export function createStorageClient(): StorageClient {
  const provider = (process.env.STORAGE_PROVIDER || '').toLowerCase();

  if (provider === 'r2') {
    return createR2Client();
  } else if (provider === 's3') {
    return createS3Client();
  } else {
    throw new Error(
      `STORAGE_PROVIDER env var must be "r2" or "s3", got: "${provider || '(unset)'}"`,
    );
  }
}

// ── Cloudflare R2 ─────────────────────────────────────────────────────────────

function createR2Client(): StorageClient {
  const accountId = requireEnv('R2_ACCOUNT_ID');
  const accessKeyId = requireEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');
  const bucketName = requireEnv('R2_BUCKET_NAME');

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return buildClient(client, bucketName);
}

// ── AWS S3 ───────────────────────────────────────────────────────────────────

function createS3Client(): StorageClient {
  const accessKeyId = requireEnv('AWS_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('AWS_SECRET_ACCESS_KEY');
  const region = requireEnv('AWS_REGION');
  const bucketName = requireEnv('S3_BUCKET_NAME');

  const client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  return buildClient(client, bucketName);
}

// ── Shared implementation ────────────────────────────────────────────────────

function buildClient(client: S3Client, bucketName: string): StorageClient {
  return {
    bucketName,

    async upload(key: string, body: Buffer, contentType: string): Promise<void> {
      await client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentLength: body.length,
        }),
      );
    },

    async list(prefix: string): Promise<StorageObject[]> {
      const objects: StorageObject[] = [];
      let continuationToken: string | undefined;

      // Paginate through all results (S3/R2 returns max 1000 per call)
      do {
        const res: ListObjectsV2CommandOutput = await client.send(
          new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );

        for (const obj of res.Contents ?? []) {
          if (obj.Key && obj.LastModified) {
            objects.push({
              key: obj.Key,
              lastModified: obj.LastModified,
              sizeBytes: obj.Size ?? 0,
            });
          }
        }

        continuationToken = res.NextContinuationToken;
      } while (continuationToken);

      return objects;
    },

    async remove(key: string): Promise<void> {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucketName, Key: key }),
      );
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
