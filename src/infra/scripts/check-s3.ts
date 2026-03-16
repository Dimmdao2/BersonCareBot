/**
 * Verifies S3/MinIO file server connectivity using env S3_*.
 * Run from project root: pnpm exec tsx src/infra/scripts/check-s3.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { ListBucketsCommand, S3Client } from '@aws-sdk/client-s3';

// Load .env from project root (when run as tsx src/infra/scripts/check-s3.ts)
config({ path: resolve(process.cwd(), '.env') });

const endpoint = process.env.S3_ENDPOINT;
const accessKey = process.env.S3_ACCESS_KEY;
const secretKey = process.env.S3_SECRET_KEY;
const region = process.env.S3_REGION ?? 'us-east-1';
const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';
const publicBucket = process.env.S3_PUBLIC_BUCKET;
const privateBucket = process.env.S3_PRIVATE_BUCKET;

async function main(): Promise<void> {
  if (!endpoint || !accessKey || !secretKey) {
    console.error('Missing S3 env: set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY in .env');
    process.exit(1);
  }

  const client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle,
  });

  const listCommand = new ListBucketsCommand({});
  const result = await client.send(listCommand);
  const names = (result.Buckets ?? []).map((b) => b.Name).filter(Boolean) as string[];

  console.log('S3 connection OK.');
  console.log(`Buckets (${names.length}): ${names.join(', ') || '(none)'}`);

  if (publicBucket && !names.includes(publicBucket)) {
    console.warn(`Warning: S3_PUBLIC_BUCKET="${publicBucket}" not found in list.`);
  }
  if (privateBucket && !names.includes(privateBucket)) {
    console.warn(`Warning: S3_PRIVATE_BUCKET="${privateBucket}" not found in list.`);
  }
}

main().catch((err) => {
  console.error('S3 check failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
