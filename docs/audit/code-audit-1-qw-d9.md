# Code Audit 1 — QW-D9 — 360p HLS Rendition + Delete Original Source After Transcode
- auditor: audit1-qw-d9 (Sonnet 4.6 subagent, 2026-06-19)
- date: 2026-06-19
- commit: 9d48c048
- files: apps/media-worker/src/processTranscodeJob.ts, apps/media-worker/src/ffmpeg/hlsArgs.ts

---

## Section A — 360p Rendition Correctness

| # | Clause | Status | How Verified |
|---|--------|--------|--------------|
| A-01 | 360p rendition called via `runFfmpeg` with correct resolution/bitrate | PASS | `processTranscodeJob.ts:410–436`: `runFfmpeg(ctx.ffmpegBin, buildHlsSingleVariantArgs({..., videoFilter: vf360, videoBitrate: "400k", audioBitrate: "64k"}), {cwd: dir360, ...})`. `vf360` is `composeHlsVideoFilter("scale=640:-2,format=yuv420p", wmDrawtext)` at line 352. Resolution 640x360 enforced by ffmpeg scale filter `-2` keeps aspect ratio and rounds to even number — 640px wide maps to 360px tall for 16:9. Bitrates 400k/64k match commit description. |
| A-02 | Uses existing `composeHlsVideoFilter`/`buildHlsSingleVariantArgs` — no duplication | PASS | `processTranscodeJob.ts:352,410–424`: Same helpers used for 720p (line 350, 354–368) and 480p (line 351, 382–396). Pattern is identical. `hlsArgs.ts` unchanged — no structural changes needed (generic params). |
| A-03 | 360p output dir declared, created, and cleaned up in `finally` | PASS | `dir360 = join(hlsDir, "360p")` at line 328. `mkdir(dir360, {recursive: true})` at line 335. Cleanup: `finally { await rm(tmpRoot, {recursive: true, force: true}) }` at line 541 — `dir360` lives under `tmpRoot/hls/360p` so it is removed along with the whole `tmpRoot` tree. Matches pattern for `dir720`/`dir480`. |
| A-04 | 360p HLS `index.m3u8` properly uploaded/referenced | PASS | `uploadDirRecursive(ctx, hlsDir, hlsBaseKeyPrefix)` at line 467 recursively uploads the entire `hlsDir` tree (720p, 480p, 360p subdirs). `uploadDirRecursive` (lines 198–221) walks all subdirs recursively with `posix.join(s3KeyPrefix, ent.name)`. The 360p subdir `index.m3u8` and `seg_*.ts` files are uploaded under `{hlsBaseKeyPrefix}/360p/`. |
| A-05 | Master playlist: 360p entry added with correct bandwidth/width/height | PASS | `processTranscodeJob.ts:438–442`: `buildVodMasterPlaylistBody([..., {uri: "360p/index.m3u8", bandwidth: 450_000, width: 640, height: 360}])`. `buildVodMasterPlaylistBody` (hlsMasterPlaylist.ts:13–22) outputs `#EXT-X-STREAM-INF:BANDWIDTH=450000,RESOLUTION=640x360,CODECS="avc1.64001f,mp4a.40.2"` followed by `360p/index.m3u8`. Bandwidth value `450_000` (450 kbps) is within 400k video + 64k audio = 464k ceiling — reasonable. |
| A-06 | `available_qualities_json`: 360p entry included | PASS | `processTranscodeJob.ts:491–495`: `qualitiesJson = JSON.stringify([..., {label: "360p", height: 360, path: "360p/index.m3u8", bandwidth: 450_000}])`. Written to DB via `$4::jsonb` in the UPDATE at line 504. Consistent schema with existing 720p/480p entries. |

---

## Section B — Source Deletion Correctness

| # | Clause | Status | How Verified |
|---|--------|--------|--------------|
| B-01 | Deletion happens AFTER successful transcode (not before/during) | PASS | Execution order in the `try` block: (1) all 3 ffmpeg runs (lines 354–436); (2) master playlist write (443); (3) poster ffmpeg run (450–465); (4) S3 upload (467–476); (5) `headObjectExists` check (478–489); (6) DB UPDATE to `ready` (496–508); (7) `markJobDone` (509); (8) success log (511–521); (9) **source deletion** (523–535). Deletion is the very last step after all operations succeed. |
| B-02 | Deletion wrapped in `try/catch` — failure does not crash the job | PASS | `processTranscodeJob.ts:525–535`: explicit `try { ... } catch (e) { ctx.log.warn(..., "source_delete_failed_nonfatal"); }`. Outer `catch (e)` at line 536 is NOT reached because the inner catch absorbs the error. Job status is already `done` (markJobDone at 509) before deletion is attempted. |
| B-03 | Deletes correct S3 key from job input (not hardcoded) | PASS | `processTranscodeJob.ts:524`: `const sourceKey = media.s3_key`. `media` is loaded from DB via `loadMedia(ctx.pool, job.mediaId)` at line 228, using the `s3_key` column from `public.media_files`. This is the same key used to download the source at line 337. No hardcoding. |
| B-04 | `DeleteObjectCommand` imported from correct package | PASS | `processTranscodeJob.ts:22`: `import { DeleteObjectCommand } from "@aws-sdk/client-s3"`. Package is `@aws-sdk/client-s3@3.1047.0` per `apps/media-worker/package.json`. Same package already used in `processProgramSubmissionTranscode.ts:4` — consistent. |
| B-05 | S3 bucket correctly referenced (same bucket as uploads) | PASS | `processTranscodeJob.ts:528`: `Bucket: ctx.bucket`. `ctx.bucket` is from `TranscodeContext` (line 49) — the same field used throughout for all S3 operations (download at 337, upload at 211, headCheck at 478). Single bucket, consistent. |
| B-06 | If job fails mid-transcode, deletion does NOT happen | PASS | All failure paths (`retryableFail` + early `return`) exit before the deletion block at line 523. Specifically: `run720` failure returns at 379; `run480` failure returns at 407; `run360` failure returns at 435; poster failure returns at 464; `master_head_missing` returns at 488. The deletion code at 523 is only reachable if all preceding `if (runXXX.code !== 0) { ... return; }` guards pass. The outer `catch (e)` at 536 also does NOT reach the deletion block. |

---

## Section C — §6 Compliance

| # | Clause | Status | How Verified |
|---|--------|--------|--------------|
| C-01 | No raw SQL introduced | PASS | No new SQL in the diff. Existing DB UPDATE at line 496–508 already writes `available_qualities_json` — only a new row value is passed via the JSON string. No new query introduced. |
| C-02 | No duplication of existing patterns | PASS | 360p uses identical `composeHlsVideoFilter` + `buildHlsSingleVariantArgs` + `runFfmpeg` pattern as 720p/480p. Source deletion mirrors `processProgramSubmissionTranscode.ts:124–133` pattern (try/catch DeleteObjectCommand, warn on failure). |
| C-03 | TypeScript compiles clean | PASS | `npx tsc --noEmit -p apps/media-worker/tsconfig.json` from working tree with commit 9d48c048 code exits 0 with no output. `media.s3_key` is typed `string | null` but narrows to `string` after the early-exit guard `if (!media || !media.s3_key?.trim())` at line 229 — TypeScript control-flow analysis confirms `sourceKey = media.s3_key` resolves to `string` at line 524. `DeleteObjectRequest.Key` is typed `string | undefined`; `string` satisfies that. |

---

## Section D — Security / Safety

| # | Clause | Status | How Verified |
|---|--------|--------|--------------|
| D-01 | The key being deleted is the original uploaded source, not a transcoded output | PASS | `sourceKey = media.s3_key` (line 524). `media.s3_key` is the raw upload path (e.g. `media/{mediaId}/original.mp4`). HLS outputs go to `media/{mediaId}/hls/...` via `hlsBaseKeyPrefix = hlsTreePrefixFromMediaRoot(mediaRoot)` (line 319). The `isCanonicalMediaRootForId` check at line 283 validates `media.s3_key` is under `media/{mediaId}/` — so the source is always within that mediaId dir and can never be an HLS artifact path (those live under `media/{mediaId}/hls/`). |
| D-02 | No risk of deleting wrong files (cross-job / cross-media contamination) | PASS | `media` is loaded fresh per-job via `loadMedia(ctx.pool, job.mediaId)`. The key is scoped to the specific mediaId. S3's `DeleteObjectCommand` is atomic and key-exact — no glob or prefix delete. |
| D-03 | Stale comment in `hlsStorageLayout.ts` | FAIL | `hlsStorageLayout.ts:6`: comment reads `Source: ... — **never** removed by transcode.` This is now factually incorrect — QW-D9 deletes the source after successful transcode. This is a documentation error, not a logic bug, but leaves misleading guidance for future readers. **Fix:** update line 6 to: `Source: \`s3_key\` = \`media/{mediaId}/{filename}\` (existing uploads) — deleted after successful HLS transcode (best-effort; see processTranscodeJob.ts).` |

---

## Findings Summary

### FAIL items

**D-03 — Stale comment in hlsStorageLayout.ts (documentation only)**
- File: `apps/media-worker/src/hlsStorageLayout.ts:6`
- Issue: Comment states source is "**never** removed by transcode" — this is now false. QW-D9 introduces best-effort deletion after successful transcode.
- Severity: Documentation/maintenance (no runtime impact)
- Fix: Update line 6 to reflect new behavior.

---

## Overall Verdict: FAIL+1

One failure: D-03 (stale JSDoc comment in `hlsStorageLayout.ts` contradicts the new deletion behavior). All logic, execution flow, edge-case handling, TypeScript types, and security checks pass. The implementation is structurally correct.

The FAIL is documentation-only (no runtime correctness issue), but the clause is a strict audit item: the misleading "never" will cause confusion for future auditors and developers working on storage layout.
