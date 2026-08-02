# CH1b storage lifecycle blind audit

Target: `wt/ch1b-storage-lifecycle-audit` at `1667b0cc9` before this audit artifact.

Authority: `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` Ч1б and
`docs/_TODO/runs/briefs/CH1B_STORAGE_LIFECYCLE_BLIND_AUDIT_BRIEF.md`.

Scope was code and mocked behavior only. No DB, DEV, TEST, server, S3, deploy, or product mutation was used.

## Blind kill-set before implementation/test inspection

| ID  | Fault planted or modeled                                                                                                                | Wrong observable result to reject                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | Proxy PUT succeeds; creating the `ready` row fails.                                                                                     | The S3 key survives with neither a `media_files` lifecycle record nor a compensating delete.                                                          |
| K2  | A single-PUT object plus a sessionless `media_files.pending` row is older than the existing 24-hour multipart TTL.                      | No cleanup job can claim it. Recent pending rows and active multipart-session rows must remain untouched.                                             |
| K3  | HEAD length, stored type, or signature is terminally invalid at generic, submission, and patient-file confirms; S3 deletion then fails. | `ready`, enqueue, and quota must remain unreachable, while the object/metadata remain in a retryable lifecycle state rather than an untracked orphan. |
| K4  | A linked pending patient file is aborted and its `media_files` row is subsequently purged.                                              | FK `ON DELETE SET NULL` turns it into a visible, broken legacy `patient_files` record.                                                                |

The TTL reference is `MULTIPART_SESSION_TTL_MS = 24 * 60 * 60 * 1000` in
`apps/webapp/src/modules/media/multipartConstants.ts`; there is no single-PUT expiry policy.

## Evidence and killed/missed matrix

| ID                           | Result                       | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1 proxy S3 -> DB            | **MISSED**                   | Intentional red acceptance `s3MediaStorage.lifecycle.unit.test.ts`: PUT resolves, the ready-row insert rejects, and no `s3DeleteObject` occurs. Command below: 1 failed assertion, `Number of calls: 0`. Product order is PUT at `s3MediaStorage.ts:132-134`, ready insert at `:138-151`.                                                                                                                                                       |
| K2 abandoned single-PUT      | **MISSED**                   | Four non-multipart paths create `pending`; purge only claims `pending_delete` / `deleting` (`mediaSqlPredicates.ts:10`, `s3MediaStorage.ts:1166-1185`). Multipart alone has an expiry session scan (`mediaUploadSessionsRepo.ts:447-467`). Thus an old sessionless pending object has no claim path.                                                                                                                                            |
| K3 terminal received failure | **PARTIAL / MISSED cleanup** | Accepted Ч1 route suite proves invalid generic/submission/patient-file objects cannot call ready/enqueue/quota: 23/23 green. But each confirm returns directly on failed received validation—generic `media/confirm/route.ts:73-77`, submission `program-submission/confirm/route.ts:99-103`, patient-file `files/[fileId]/confirm/route.ts:59-63`—without entering deletion lifecycle. No S3-delete failure can therefore acquire retry state. |
| K4 linked patient-file abort | **MISSED**                   | Patient create co-writes linked pending metadata (`pgPatientFiles.ts:115-156`). The FK is `ON DELETE SET NULL` (`db/schema/patientFiles.ts:79-83`); once purge deletes media, both list and quota treat `mediaFileId IS NULL` as a valid legacy file (`pgPatientFiles.ts:47-61`, `:93-101`).                                                                                                                                                    |
| Route lifecycle boundary     | **MISSED**                   | `rg` found routes directly calling `deletePendingMediaFileById`; multipart complete also calls `s3DeleteObject` directly. This bypasses the existing `deleteHard` -> `pending_delete` -> purge/retry door. See exact census command below.                                                                                                                                                                                                      |

## Negative controls

| Control                            | Result            | Evidence                                                                                                                                                                    |
| ---------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recent single-PUT pending          | Held accidentally | Purge excludes every `pending` row, not only recent rows. It therefore preserves recent uploads but also leaves K2 forever.                                                 |
| Active multipart session           | PASS              | The session cleanup selects only `expires_at <= now()` with active statuses; multipart init assigns `MULTIPART_SESSION_TTL_MS`.                                             |
| Preview worker                     | PASS              | Its query includes `mediaReadableStatusPredicate`, which excludes `pending`, `pending_delete`, and `deleting` (`mediaPreviewWorker.ts:352-360`; `mediaSqlPredicates.ts:4`). |
| Existing pending-delete retry      | PASS              | Purge retains the current S3-first, DB-second order and schedules `delete_attempts`/`next_attempt_at` after S3 failure (`s3MediaStorage.ts:1202-1214`).                     |
| Accepted Ч1 door / multipart abort | PASS baseline     | `uploadDoorAcceptance.route.test.ts` is 23/23 green and `check-media-upload-door.mjs --self-test` is green. Multipart abort was inspected only; no product change was made. |

## Exact commands run

```bash
git status --short --branch && git log -1 --oneline
node /home/dev/brain/tools/code-search.mjs "createS3MediaStoragePort upload deleteHard purgePendingMediaDeleteBatch PreparedMediaUpload ReceivedUpload" --repo bcb -k 50
node /home/dev/brain/tools/code-search.mjs "media_files pending pending_delete patient_files mediaFileId deleteHard purge" --repo bcb -k 100
rg -n "insertPendingMediaFile(Tx)?|insertPendingProgramSubmissionMediaFileTx|createFile\\(" apps/webapp/src/app/api --glob 'route.ts'
rg -n "deleteHard|deletePendingMediaFile|s3DeleteObject|s3AbortMultipartUpload|pending_delete|purgePendingMediaDeleteBatch" apps/webapp/src/app/api/{media,doctor,patient} --glob 'route.ts'
pnpm install --offline --frozen-lockfile --ignore-scripts
pnpm --filter @bersoncare/operator-db-schema build && pnpm --filter @bersoncare/db-principal build && pnpm --filter @bersoncare/platform-merge build && pnpm --filter @bersoncare/error-tracking build
pnpm --dir apps/webapp exec vitest run --project=unit src/infra/repos/s3MediaStorage.lifecycle.unit.test.ts
pnpm --dir apps/webapp exec vitest run --project=route src/modules/media/uploadDoorAcceptance.route.test.ts
node apps/webapp/scripts/check-media-upload-door.mjs --self-test
git diff --check
```

Results: the intentional K1 oracle is red (1/1); accepted Ч1 route control is green (23/23); upload-door gate and self-test are green; `git diff --check` is green.

## Minimal coherent worker scope

Use the existing `media_files` storage port and its `deleteHard` / `pending_delete` / `purgePendingMediaDeleteBatch` door; do not add a table, upload service, queue, or migration.

1. Make proxy upload record-first (pending -> S3 -> received/ready) or compensate a post-PUT DB failure through one lifecycle adapter, so K1 has either a durable record or a completed delete.
2. Add one pending-upload abort/expiry operation on that existing lifecycle boundary. It must stage eligible old, sessionless single-PUT rows into the existing retryable delete state; the 24-hour multipart TTL is the current safety reference. It must exclude recent pending rows and any active multipart-backed row.
3. Route generic, program-submission, and patient-file terminal received failures through that operation. On S3 failure it must leave the `pending_delete` retry state; no confirm route may directly hard-delete DB/S3. Move the current route-level `deletePendingMediaFileById` / direct `s3DeleteObject` paths onto the same adapter without changing multipart-abort behavior.
4. Before staging a linked pending patient upload for purge, atomically remove its unfinished `patient_files` metadata (or otherwise retain the link until it is removed). Do not change treatment of established nullable legacy files.
5. Extend the existing AST gate with the lifecycle boundary and add behavior acceptance for K1-K4, including S3-delete retry and the listed negative controls. Keep the accepted Ч1 validation policies, `PreparedMediaUpload` / `ReceivedUpload`, six-route door, and multipart abort contract unchanged.

## Not verified

- PostgreSQL transaction/FK behavior and real S3 retries: prohibited by the brief; the report does not claim DB evidence.
- No product fault injection was retained. The only intentionally failing artifact is the K1 acceptance test; no product code was changed.
