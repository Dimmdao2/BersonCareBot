# Ч1б — storage lifecycle worker report (#1082)

Authority: `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` Ч1б and
`CH1B_STORAGE_LIFECYCLE_BLIND_AUDIT_REPORT.md` kill-set `09cd009a2`.

Scope was mocked code behavior only. No DB, DEV, TEST, server, S3, deploy, push, taskdb, migration, table, or
new upload service was used. The Ч1б checklist checkbox was intentionally not changed.

## K1–K4 and boundary

| Item                             | Result | Code and saved oracle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1 proxy PUT then DB/CAS failure | PASS   | `createS3MediaStoragePort.upload` writes `media_files.pending` before S3 PUT and transitions only through `pending → ready` CAS. `s3MediaStorage.lifecycle.unit.test.ts` proves a failed CAS retains the lifecycle row and does not compensate by an untracked direct delete.                                                                                                                                                                                                                                                     |
| K2 abandoned single-PUT          | PASS   | `stageStaleSinglePutMediaForPurge` is invoked before `purgePendingMediaDeleteBatch`; it selects only `pending` rows older than `MULTIPART_SESSION_TTL_MS` without any multipart session, stages them to `pending_delete`, then reuses the existing S3-first/DB-second purge. Unit oracle covers candidate staging; the predicate preserves recent and session-backed rows.                                                                                                                                                        |
| K3 terminal received failure     | PASS   | Generic, program-submission and patient-file confirms call `abortPendingMediaUpload` exactly once before returning a received-object rejection; no ready, enqueue or quota action follows. Multipart terminal paths use the same adapter after preserving their existing S3 multipart-abort contract. The 23-route acceptance suite proves all three receive failure classes; lifecycle unit injects `s3DeleteObject` failure and proves the shared purge reports an error after scheduling retry instead of deleting the DB row. |
| K4 linked patient-file           | PASS   | `stagePendingMediaAbort` performs `pending → pending_delete` and removal of only linked `patient_files` metadata in one Drizzle transaction. Its unit oracle verifies metadata removal only after a pending row was staged; legacy `mediaFileId IS NULL` is untouched.                                                                                                                                                                                                                                                            |
| Lifecycle boundary               | PASS   | The existing `check-media-upload-door.mjs` rejects direct `deletePendingMediaFileById` and direct S3 delete imports from public upload routes. Its self-test and fixture test include the planted direct lifecycle cleanup import.                                                                                                                                                                                                                                                                                                |

## Verification

All commands were run on the final worker tree before this report was added:

```bash
pnpm --dir apps/webapp exec vitest run --project=unit src/infra/repos/s3MediaStorage.lifecycle.unit.test.ts src/modules/media/mediaUploadDoorGate.unit.test.ts
pnpm --dir apps/webapp exec vitest run --project=route src/modules/media/uploadDoorAcceptance.route.test.ts
node apps/webapp/scripts/check-media-upload-door.mjs --self-test
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp exec eslint <changed lifecycle, route, gate and test paths>
node scripts/check-no-new-raw-sql.mjs
node scripts/check-test-runner-visibility.mjs
git diff --check
```

Results: lifecycle/gate units **20/20 PASS**; accepted Ч1 route suite **23/23 PASS**; upload-door gate and
self-test PASS; webapp typecheck PASS; scoped ESLint PASS; raw-SQL gate PASS; test-runner visibility PASS;
diff-check PASS. The intentional S3-delete-failure oracle logs the expected purge error and passes.

## Not verified live

- PostgreSQL execution, transaction rollback/FK enforcement, concurrent quota behavior and the actual stale-row
  query were not run: the worker brief prohibits DB/DEV/TEST.
- Real S3 PUT/delete retries, multipart lifecycle and browser behavior were not run for the same reason.
- Full repository CI was not run: this is a bounded webapp stage, and no merge/integration/deploy occurred.
