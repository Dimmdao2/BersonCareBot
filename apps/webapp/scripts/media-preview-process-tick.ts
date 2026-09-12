/**
 * One-shot CMS media preview batch (sharp/ffmpeg) outside the Next.js server process.
 * Intended for host cron with the same env as webapp (`webapp.prod`): `DATABASE_URL`, S3 keys/bucket,
 * optional `FFMPEG_PATH`, optional `MAGICK_PATH`.
 *
 * CLI: `--limit N` or `--limit=N`; add `--reconcile-images` for the bounded old-image backfill.
 * If unset, limit uses env `MEDIA_PREVIEW_LIMIT` or default `10`.
 */
import { processMediaPreviewBatch } from '../src/infra/repos/mediaPreviewWorker';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';

function parseLimit(argv: string[]): number {
  const args = argv.filter((t) => t !== '--');
  const fromEnv = process.env.MEDIA_PREVIEW_LIMIT?.trim();
  if (fromEnv && /^\d+$/.test(fromEnv)) {
    return Number.parseInt(fromEnv, 10);
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--limit' && args[i + 1]) {
      return Number.parseInt(args[i + 1]!, 10);
    }
    if (a?.startsWith('--limit=')) {
      return Number.parseInt(a.slice('--limit='.length), 10);
    }
  }
  return 10;
}

async function main(): Promise<void> {
  /* Same operation/capability as the HTTP entrypoint; this CLI is only its direct host runner. */
  enterWithDbInfraPrincipal({ source: 'api/internal/media-preview/process:POST' });
  const args = process.argv.slice(2);
  const raw = parseLimit(args);
  const limit = Number.isFinite(raw) && raw > 0 ? raw : 10;
  const result = await processMediaPreviewBatch(limit, {
    reconcileMissingImageRenditions: args.includes('--reconcile-images'),
  });
  console.log(JSON.stringify({ ok: result.errors === 0, ...result }));
  if (result.errors > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
