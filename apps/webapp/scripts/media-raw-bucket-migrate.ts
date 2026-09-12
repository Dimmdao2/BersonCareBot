#!/usr/bin/env tsx
/**
 * One-shot ops runner for М7 «Перенос уже лежащих оригиналов в сырой бакет + сверка счётчика»
 * (`docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`). Same entry shape as `media-preview-process-tick.ts`:
 * it is a direct host runner for a media-worker-capability operation, nothing more.
 *
 * Usage (env as the webapp has it — `DATABASE_URL*`, S3 keys, `S3_RAW_BUCKET`):
 *   pnpm --dir apps/webapp run media-raw-bucket:migrate                      # dry-run, 100 rows
 *   pnpm --dir apps/webapp run media-raw-bucket:migrate -- --limit=500
 *   pnpm --dir apps/webapp run media-raw-bucket:migrate -- --commit --limit=50
 *   pnpm --dir apps/webapp run media-raw-bucket:migrate -- --verify --platform-user-id=<uuid>
 *
 * DRY-RUN IS THE DEFAULT: without `--commit` nothing is copied, updated or deleted.
 */
import { enterWithDbInfraPrincipal, WEBAPP_LOCKED_MEDIA_WORKER_CONTROL_SOURCE } from '@bersoncare/db-principal';

const argv = process.argv.slice(2).filter((t) => t !== '--');

function has(flag: string): boolean {
  return argv.includes(flag);
}

function strArg(name: string): string | null {
  const inline = argv.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim() || null;
  const idx = argv.indexOf(name);
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1]!.startsWith('--')) return argv[idx + 1]!.trim();
  return null;
}

function numArg(name: string, fallback: number): number {
  const raw = strArg(name);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function printHelp(): void {
  console.log(`media-raw-bucket-migrate (М7)

  (default)                  Dry run: report only, no COPY / UPDATE / DELETE.
  --commit                   Apply: COPY hot→raw, HEAD size check, UPDATE s3_key, DELETE hot.
  --limit=N                  Max rows this run (default 100).
  --batch-size=N             Rows per DB fetch (default 50).
  --verify                   Counter check: walk the raw bucket per folder vs the product counter.
  --platform-user-id=UUID    Global-admin identity for the counter read (--verify only).
  -h, --help                 This help.
`);
}

async function main(): Promise<void> {
  if (has('-h') || has('--help')) {
    printHelp();
    return;
  }

  /* Cross-organization maintenance of `media_files` plus its objects is the media-worker
     capability (`app_operational_media_worker`); this CLI is its direct host runner, exactly as
     `media-preview-process-tick.ts` is for the preview batch. */
  enterWithDbInfraPrincipal({ source: WEBAPP_LOCKED_MEDIA_WORKER_CONTROL_SOURCE });

  const [{ runRawBucketSourceMigration, verifyRawBucketCounters }, { createPgRawBucketSourceMigrationRepo }, s3] =
    await Promise.all([
      import('../src/app-layer/media/rawBucketSourceMigration.js'),
      import('../src/infra/repos/pgRawBucketSourceMigration.js'),
      import('../src/infra/s3/client.js'),
    ]);

  const platformUserId = strArg('--platform-user-id');
  const repo = createPgRawBucketSourceMigrationRepo({
    ...(platformUserId ? { platformUserId } : {}),
  });
  const storage = {
    async headObject(key: string, kind: 'raw' | 'hot') {
      const details = await s3.s3HeadObjectDetails(key, 'library', kind);
      return details ? { sizeBytes: details.contentLength } : null;
    },
    copyObject: (input: {
      sourceKey: string;
      sourceKind: 'raw' | 'hot';
      destinationKey: string;
      destinationKind: 'raw' | 'hot';
    }) => s3.s3CopyObject({ ...input, target: 'library' as const }),
    deleteObject: (key: string, kind: 'raw' | 'hot') => s3.s3DeleteObject(key, 'library', kind),
    listObjects: (prefix: string, kind: 'raw' | 'hot') =>
      s3.s3ListObjectsUnderPrefix(prefix, 'library', kind),
    rawObjectKey: s3.s3RawObjectKey,
  };

  if (has('--verify')) {
    if (!platformUserId) {
      console.warn(
        '[warn] --platform-user-id not given: the product counter column will be null and only the bucket-vs-journal comparison is reported.',
      );
    }
    const report = await verifyRawBucketCounters({
      repo,
      storage,
      sourceStorageKindForKey: s3.sourceStorageKindForKey,
    });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const dryRun = !has('--commit');
  if (dryRun) console.log('[DRY-RUN] Nothing is copied, updated or deleted. Pass --commit to apply.');
  const report = await runRawBucketSourceMigration(
    { repo, storage },
    {
      dryRun,
      limit: numArg('--limit', 100),
      batchSize: Math.min(numArg('--batch-size', 50), 200),
    },
  );
  console.log(JSON.stringify(report, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
