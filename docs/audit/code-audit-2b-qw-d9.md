# Code Audit 2b — QW-D9 (re-audit after fix)
agentId: audit2b-qw-d9
Commits: 9d48c048, 0f63a51e
Date: 2026-06-19

## Pre-check: feature exists

- `git diff feat/doctor-ui-rebuild..auto/qw-d9 -- apps/media-worker/src/processTranscodeJob.ts | wc -l` = **122** (non-empty — the 360p feature is present, not reverted).
- `hlsStorageLayout.ts` diff = exactly one content line changed (line 6 JSDoc):
  - `- Source: ... — **never** removed by transcode.`
  - `+ Source: ... — deleted best-effort after successful transcode (see processTranscodeJob.ts).`

Fix is real. Proceeding with the full clause audit.

## Clause C1 — 360p rendition exists
PASS
- `const dir360 = join(hlsDir, "360p");` (line 328)
- `await mkdir(dir360, { recursive: true });` (line 335)
- `const vf360 = composeHlsVideoFilter("scale=640:-2,format=yuv420p", wmDrawtext);` (line 352) — matches required `scale=640:-2,format=yuv420p`.
- `run360` block (lines 410-436) calls `buildHlsSingleVariantArgs` with `videoBitrate: "400k"` and `audioBitrate: "64k"` (lines 417-418), `cwd: dir360` (line 421). Failure path wired to `retryableFail` with `ffmpeg_360p_exit_${code}`.

## Clause C2 — Master playlist 360p entry
PASS
- Line 441: `{ uri: "360p/index.m3u8", bandwidth: 450_000, width: 640, height: 360 },` present in the `buildVodMasterPlaylistBody([...])` array, alongside the 720p and 480p entries (lines 439-440). Exact match to the required spec.

## Clause C3 — available_qualities_json includes 360p
PASS
- Lines 491-495: `qualitiesJson` array includes `{ label: "360p", height: 360, path: "360p/index.m3u8", bandwidth: 450_000 }` alongside 720p (line 492) and 480p (line 493). Persisted via `available_qualities_json = $4::jsonb` (line 504).

## Clause C4 — DeleteObjectCommand: import, target, ordering, error handling
PASS
- **Import**: `import { DeleteObjectCommand } from "@aws-sdk/client-s3";` (line 22) — correct named value import. (Line 5 separately imports `type S3Client` from the same module; a `type`-only import and a value import do not conflict.)
- **Target**: `Key: sourceKey` where `const sourceKey = media.s3_key;` (line 524) — the original source MP4. `Bucket: ctx.bucket` (line 528) — same bucket used for all other operations (download/upload/head). Correct.
- **Ordering**: deletion (lines 525-535) is placed AFTER `await markJobDone(ctx.pool, job.id);` (line 509) and after the `available_qualities_json` DB update and the completion log. Correct — job is durably marked done before the source is removed.
- **Error handling**: deletion wrapped in its own `try/catch` (lines 525-535); on failure it only logs `source_delete_failed_nonfatal` via `ctx.log.warn` (line 534) and does NOT rethrow, so the job stays `done`. Correct.

## Clause C5 — JSDoc consistency: both files truthful
PASS
- `processTranscodeJob.ts` function JSDoc (lines 223-226): "Source MP4 at `s3_key` is deleted after a successful HLS transcode (best-effort; failure to delete is logged but does not fail the job)."
- `hlsStorageLayout.ts` line 6: "deleted best-effort after successful transcode (see processTranscodeJob.ts)."
- The two agree, and the previous false "**never** removed" statement is gone. The hlsStorageLayout JSDoc now also cross-references processTranscodeJob.ts.

## Clause C6 — No regression to 720p/480p renditions
PASS
- 720p: `dir720` (326), `mkdir` (333), `vf720` scale=1280:-2 (350), `run720` bitrate 2500k/128k (354-369), master entry bandwidth 2_800_000 (439), quality entry (492) — all intact.
- 480p: `dir480` (327), `mkdir` (334), `vf480` scale=854:-2 (351), `run480` bitrate 800k/96k (382-397), master entry bandwidth 900_000 (440), quality entry (493) — all intact.
- 360p is strictly ADDED after the 480p block; nothing in the 720p/480p flow was replaced. Upload (`uploadDirRecursive(ctx, hlsDir, ...)`, line 467) uploads the whole hls tree including all three dirs.

## Clause C7 — TypeScript: no new errors
PASS
- `DeleteObjectCommand` resolves from `@aws-sdk/client-s3` (already a project dependency; `S3Client` and other commands come from it). Value import on line 22 is valid alongside the `type` import on line 5.
- `ctx.s3Client` is in scope at the call site: `ctx: TranscodeContext` is the function param; `TranscodeContext.s3Client: S3Client` (lines 46-48). `ctx.bucket: string` likewise in scope. `media.s3_key` is narrowed to non-null earlier (guard at line 229 returns if `!media.s3_key?.trim()`), and `sourceKey` is `string | null` widened only by the row type but is reached only after that guard — `Key` accepts `string`. No new type error.

## Clause C8 — Tmpdir cleanup: dir360 included
PASS
- `dir360 = join(hlsDir, "360p")`, `hlsDir = join(tmpRoot, "hls")` (lines 325, 328) — dir360 lives under `tmpRoot`.
- `finally { await rm(tmpRoot, { recursive: true, force: true }); }` (lines 540-542) removes the entire tmpRoot recursively, which includes dir360. No separate per-dir cleanup is needed and none was missed.

## Clause C9 — Retry safety
PASS
- Deletion only runs on the single successful completion path, AFTER `markJobDone`. On a subsequent retry/re-run of a job whose media is already `ready`, control hits the early-return guard (lines 247-280: `video_processing_status === "ready"` + master head exists → `markJobDone` + return) and never reaches the deletion block — so there is no second `DeleteObject` on the already-removed key.
- Even if a delete were attempted on a missing key, S3 `DeleteObject` is idempotent (returns success for absent keys) and the surrounding `try/catch` (lines 525-535) would absorb any error as a non-fatal warn. Graceful.

## OVERALL: PASS

All nine clauses verified against the actual `auto/qw-d9` blob. The 360p rendition is fully wired (dir/mkdir/filter/ffmpeg run/master entry/qualities json), the source-delete is correctly ordered after `markJobDone`, wrapped in best-effort try/catch, and both JSDocs are now truthful and mutually consistent. No regression to 720p/480p. No new TypeScript errors. Could not find a real flaw.
