# Ч1б storage lifecycle — independent audit (#1082)

Candidate product commit: `a38d23c96` (`fix(media): unify upload abort lifecycle #1082`).

Authority: `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` Ч1б. Inspected before the
candidate worker report: the authority, `AGENTS.md` §1/§5/§10/§24, candidate diff and
route/lifecycle code; blind input: `runs/testsuite-v2/CH1B_STORAGE_LIFECYCLE_BLIND_AUDIT_REPORT.md`.
No checkbox, taskdb, board, `feat`, S3, DEV/TEST/PROD, migration, or product fix was changed.

## Verdict: PASS

The candidate meets the Ч1б lifecycle scope. The audit added one permitted permanent
acceptance test: the original K1 failure (`PUT` before durable `pending` insert) was not
caught by the saved candidate test, so the test now makes the same product fault red.

| ID | Result | Evidence |
| --- | --- | --- |
| K1 | PASS | Proxy creates `media_files.pending`, then PUT, then organization-scoped `pending → ready` CAS. The added `s3MediaStorage.lifecycle.unit.test.ts` case makes pending insert fail and proves PUT was never issued. Failed PUT has no object; failed CAS retains the durable pending row and K2 supplies its retry path. |
| K2 | PASS, predicate execution limit below | `stageStaleSinglePutMediaForPurge()` runs before the existing purge. Its compiled Drizzle SQL requires `status = pending`, `created_at <= cutoff`, and `NOT EXISTS media_upload_sessions`; its CAS repeats those guards. Thus recent rows and every session-backed row remain outside this cleanup path; selected sessionless rows enter the existing `pending_delete → S3-first → DB` purge. |
| K3 | PASS | All generic, program-submission and patient-file received-object rejection paths reach `abortPendingMediaUpload`; 23 route assertions keep ready/enqueue/quota unreachable. Shared purge schedules retry before committing an S3 delete failure and reports `{ removed: 0, errors: 1 }` in the lifecycle unit. |
| K4 | PASS, transaction execution limit below | `stagePendingMediaAbort()` performs the organization-scoped pending CAS and linked `patient_files` deletion inside one `runDrizzleMutationTransaction`. The compiled delete predicate is `media_file_id = $1 AND organization_id = $2`, so genuine legacy rows (`media_file_id IS NULL`) cannot match. Unit behavior proves no metadata deletion occurs if staging did not happen. |
| Boundary / no second lifecycle | PASS (view + executable gate) | Route census found only adapter calls to `abortPendingMediaUpload`; direct `deletePendingMediaFileById` and direct `s3DeleteObject` are absent from public upload routes. `check-media-upload-door.mjs --self-test` rejected the planted direct lifecycle-cleanup import. Internal `media-pending-delete/purge` alone calls the shared purge port. |

## Blind faults and kill count

Blind kill-set was fixed before reading candidate tests: K1 record-before-PUT/CAS; K2 stale
sessionless selection; K3 terminal abort door and delete-failure retry; K4 linked-only metadata
deletion. Temporary product mutations were reverted before the final validation.

| Fault | Result | Red oracle |
| --- | --- | --- |
| K1, initial candidate set: move PUT before pending insert | **MISSED** | Existing lifecycle unit stayed green: `5 passed`, command exit `0`. |
| K1, after acceptance addition: same PUT-before-insert fault | KILLED | New assertion `s3PutObjectBody` was called once although pending insert rejected; exit `1`. |
| K2: replace `for (const candidate of candidates)` with `for (const candidate of [])` | KILLED | `stageStaleSinglePutMediaForPurge(25)` returned `0`, expected `1`; exit `1`. |
| K3 door: make `abortPendingMediaUpload` resolve without staging | KILLED | Five generic/submission/patient confirmation assertions saw zero abort-stage calls; route command exit `1`. |
| K3 retry: remove `schedulePendingDeleteRetry` after S3 delete error | KILLED | Shared purge incorrectly reported `{ removed: 1, errors: 1 }`, expected `{ removed: 0, errors: 1 }`; exit `1`. |
| K4: skip the linked `patientFiles` delete after a successful stage | KILLED | Linked-metadata deletion assertion received zero calls; exit `1`. |

Exact count: **5 final faults killed / 0 final misses**. The pre-existing candidate test set had
**1 missed fault** (K1 ordering); the permitted permanent test closes it.

## Commands and exits

All commands below were executed from this worktree. `exit 0` is recorded where stated;
intentional fault commands are the `exit 1` entries in the table above.

```bash
# Inspection / route reachability (exit 0)
git diff --no-ext-diff --no-renames --unified=80 a38d23c96^ a38d23c96 -- apps/webapp/src/infra/repos/s3MediaStorage.ts apps/webapp/src/app-layer/media/s3MediaStorage.ts apps/webapp/src/app-layer/media/mediaUploadAdapter.ts apps/webapp/src/app/api/media/confirm/route.ts apps/webapp/src/app/api/patient/media/program-submission/confirm/route.ts apps/webapp/src/app/api/doctor/patients/[userId]/files/[fileId]/confirm/route.ts
rg -n "deletePendingMediaFileById|stagePendingMediaAbort|s3DeleteObject|abortPendingMediaUpload|purgePendingMediaDeleteBatch" apps/webapp/src/app/api --glob 'route.ts'
rg -l --glob 'route.ts' 'presignPutUrl|s3CreateMultipartUpload|request\.formData\(\)' apps/webapp/src/app/api | sort

# K2/K4 compiled Drizzle SQL view (exit 0; no DB connection)
pnpm --dir apps/webapp exec tsx -e "import { and, eq, lte, notExists } from 'drizzle-orm'; import { drizzle } from 'drizzle-orm/pg-proxy'; import { mediaFiles, mediaUploadSessions } from './db/schema/schema.ts'; import { patientFiles } from './db/schema/patientFiles.ts'; const db=drizzle(async()=>({rows:[]})); const id='55555555-5555-4555-8555-555555555555'; const org='44444444-4444-4444-8444-444444444444'; const cutoff='2026-08-01T00:00:00.000Z'; const sessionExists=()=>db.select({id:mediaUploadSessions.id}).from(mediaUploadSessions).where(eq(mediaUploadSessions.mediaId,mediaFiles.id)); for (const [label,q] of [['K2-select',db.select({id:mediaFiles.id}).from(mediaFiles).where(and(eq(mediaFiles.status,'pending'),lte(mediaFiles.createdAt,cutoff),notExists(sessionExists()))).orderBy(mediaFiles.createdAt).limit(25)],['K2-cas',db.update(mediaFiles).set({status:'pending_delete'}).where(and(eq(mediaFiles.id,id),eq(mediaFiles.status,'pending'),lte(mediaFiles.createdAt,cutoff),notExists(sessionExists())))],['K4-stage',db.update(mediaFiles).set({status:'pending_delete'}).where(and(eq(mediaFiles.id,id),eq(mediaFiles.organizationId,org),eq(mediaFiles.status,'pending')))],['K4-linked-delete',db.delete(patientFiles).where(and(eq(patientFiles.mediaFileId,id),eq(patientFiles.organizationId,org)))]] as const) { console.log(label, q.toSQL().sql.replace(/\\s+/g,' ')); }"

# Final behavior and gates (all exit 0)
pnpm --dir apps/webapp exec vitest run --project=unit src/infra/repos/s3MediaStorage.lifecycle.unit.test.ts src/modules/media/mediaUploadDoorGate.unit.test.ts
pnpm --dir apps/webapp exec vitest run --project=route src/modules/media/uploadDoorAcceptance.route.test.ts
node apps/webapp/scripts/check-media-upload-door.mjs --self-test
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp exec eslint src/infra/repos/s3MediaStorage.ts src/infra/repos/s3MediaStorage.lifecycle.unit.test.ts src/app-layer/media/mediaUploadAdapter.ts src/app-layer/media/s3MediaStorage.ts src/app/api/media/confirm/route.ts src/app/api/media/multipart/complete/route.ts src/app/api/media/multipart/init/route.ts src/app/api/media/presign/route.ts src/app/api/doctor/patients/[userId]/files/[fileId]/confirm/route.ts src/app/api/doctor/treatment-program-instances/[instanceId]/media-presign/route.ts src/app/api/patient/media/program-submission/confirm/route.ts src/app/api/patient/media/program-submission/presign/route.ts src/modules/media/mediaUploadDoorGate.unit.test.ts src/modules/media/uploadDoorAcceptance.route.test.ts scripts/check-media-upload-door.mjs
node scripts/check-no-new-raw-sql.mjs
node scripts/check-test-runner-visibility.mjs
git diff --check
```

Final results: units **21/21**, route acceptance **23/23**, typecheck, scoped ESLint,
upload-door gate/self-test, raw-SQL gate, runner visibility and `git diff --check` all passed.

## Limit

Unit mocks prove lifecycle behavior at the port boundary, but not PostgreSQL execution, transaction
rollback/FK enforcement, or concurrent claim behavior. Repository discovery found only legacy DEV-DB
Vitest patterns using raw `pg`; no existing safe media lifecycle runner through the Drizzle port with a
rollback-clean fixture. Per authority/brief, no new DEV-DB infrastructure was created. K2/K4 SQL was
therefore compiled from the actual Drizzle builders (the predicates shown above), which proves the
generated query shape but not a live PostgreSQL transaction. No DATABASE_URL was read or printed.

Final worktree check: only this report and the intentional K1 acceptance test are audit artifacts;
there are no temporary product-code changes.
