#!/usr/bin/env tsx
/**
 * Phase-07: enqueue HLS transcode jobs for legacy library videos (batch, throttled, resumable).
 *
 * Usage (from repo root or apps/webapp, with DATABASE_URL in env):
 *   pnpm --dir apps/webapp run video-hls-backfill-legacy
 *   pnpm --dir apps/webapp run video-hls-backfill-legacy -- --commit --limit=200
 *   pnpm --dir apps/webapp run video-hls-backfill-legacy -- --state-file=/tmp/vhs.state.json
 *
 * Default: dry-run (no DB writes to jobs). Pass --commit to call enqueue.
 *
 * Ops: enable `video_hls_pipeline_enabled` before --commit, or use dry-run to inspect counts.
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const MAX_MEDIA_BYTES = 3 * 1024 * 1024 * 1024;

type StateV1 = {
  version: 1;
  lastMediaId: string | null;
  updatedAt: string;
};

const argv = process.argv.slice(2);

function has(flag: string): boolean {
  return argv.includes(flag);
}

function numArg(prefix: string, fallback: number): number {
  const raw = argv.find((a) => a.startsWith(`${prefix}=`));
  if (!raw) return fallback;
  const n = Number(raw.slice(prefix.length + 1));
  return Number.isFinite(n) ? n : fallback;
}

function strArg(prefix: string): string | null {
  const raw = argv.find((a) => a.startsWith(`${prefix}=`));
  if (!raw) return null;
  const v = raw.slice(prefix.length + 1).trim();
  return v || null;
}

async function loadState(path: string): Promise<string | null> {
  try {
    const raw = await readFile(path, "utf8");
    const j = JSON.parse(raw) as StateV1;
    if (j?.version === 1 && (j.lastMediaId === null || typeof j.lastMediaId === "string")) {
      return j.lastMediaId;
    }
  } catch {
    /* no file or invalid */
  }
  return null;
}

async function saveState(path: string, lastMediaId: string | null): Promise<void> {
  const body: StateV1 = {
    version: 1,
    lastMediaId,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(path, `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

function parseCutoff(): Date | null {
  const iso = strArg("--cutoff");
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function mainPrintHelp(): void {
  console.log(`video-hls-backfill-legacy (VIDEO_HLS_DELIVERY phase-07)

  --commit                 Apply (enqueue). Default is dry-run.
  --limit=N                Max rows to process this run (0 = use default cap 10000).
  --batch-size=N           Batch size (default 50, max 500).
  --sleep-ms=N             Pause between batches (default 2000, max 600000).
  --cutoff=ISO             Only media with created_at < this instant.
  --include-failed         Also pick video_processing_status=failed (no active job).
  --max-size-bytes=N       Skip larger files in-app (default ${MAX_MEDIA_BYTES}).
  --default-run-cap=N      Hard cap when --limit=0 (default 10000).
  --cursor=UUID            Start after this media id (overrides state file).
  --state-file=PATH        Read/write lastMediaId for pause/resume.
  --reset-state            With --state-file: clear stored cursor before run.
  --no-require-pipeline    Allow --commit even if video_hls_pipeline_enabled is false.
  -h, --help               This help.
`);
}

async function main(): Promise<void> {
  if (!process.env.SESSION_COOKIE_SECRET?.trim()) {
    process.env.SESSION_COOKIE_SECRET = "cli-video-hls-backfill-local-only-not-prod";
  }

  if (has("-h") || has("--help")) {
    mainPrintHelp();
    return;
  }

  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL is not set");
    process.exitCode = 1;
    return;
  }

  const [{ runVideoHlsLegacyBackfill, clampBackfillBatchSize, clampBackfillSleepMs }, { getConfigBool }] =
    await Promise.all([
      import("../src/app-layer/media/videoHlsLegacyBackfill.js"),
      import("../src/modules/system-settings/configAdapter.js"),
    ]);

  const dryRun = !has("--commit");
  const statePath = strArg("--state-file");
  let cursorFromState: string | null = null;
  if (statePath && has("--reset-state")) {
    await saveState(statePath, null);
    console.log(`[state] reset ${statePath}`);
  } else if (statePath) {
    cursorFromState = await loadState(statePath);
  }

  const cursorArg = strArg("--cursor");
  const cursorAfterMediaId = cursorArg ?? cursorFromState;

  const limit = numArg("--limit", 0);
  const batchSize = clampBackfillBatchSize(numArg("--batch-size", 50));
  const sleepMs = clampBackfillSleepMs(numArg("--sleep-ms", 2000));
  const maxSizeBytes = Math.min(
    Math.max(1, Math.floor(numArg("--max-size-bytes", MAX_MEDIA_BYTES))),
    MAX_MEDIA_BYTES,
  );
  const defaultRunCap = Math.min(
    Math.max(1, Math.floor(numArg("--default-run-cap", 10_000))),
    1_000_000,
  );

  const pipelineOn = await getConfigBool("video_hls_pipeline_enabled", false);
  if (!pipelineOn && dryRun) {
    console.warn(
      "[warn] video_hls_pipeline_enabled is false — dry-run still lists candidates; worker will idle until enabled.",
    );
  }

  if (dryRun) {
    console.log("[DRY-RUN] No enqueue. Pass --commit to enqueue jobs.");
  }

  const report = await runVideoHlsLegacyBackfill(
    {
      dryRun,
      limit,
      batchSize,
      sleepMsBetweenBatches: sleepMs,
      cursorAfterMediaId,
      cutoffCreatedBefore: parseCutoff(),
      includeFailed: has("--include-failed"),
      maxSizeBytes,
      requirePipelineEnabled: !has("--no-require-pipeline"),
      defaultRunCap,
    },
    {},
  );

  if (statePath && report.lastMediaId && !dryRun) {
    await saveState(statePath, report.lastMediaId);
    console.log(`[state] wrote lastMediaId=${report.lastMediaId} → ${statePath}`);
  } else if (statePath && dryRun && report.lastMediaId) {
    console.log(
      `[state] dry-run would end at lastMediaId=${report.lastMediaId} (state file not updated; use --commit to persist)`,
    );
  }

  console.log(JSON.stringify(report, null, 2));

  if (report.abortedReason) {
    console.error(`[abort] ${report.abortedReason}`);
    process.exitCode = 1;
  }
}

let shuttingDown = false;
process.on("SIGINT", () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(
    "\n[interrupt] stopping — if --state-file was used with --commit, last checkpoint was written after each batch.",
  );
  process.exit(130);
});

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
