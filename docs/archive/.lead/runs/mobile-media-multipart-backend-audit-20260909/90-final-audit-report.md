# M5-04/M5-05 shared multipart backend — independent audit

**Verdict: MUST FIX.**

## Scope and authority

- Audited product candidate: `2a17878278704feed433a33513e5f1d73364dcf1`
  (`feat(media): add authorized multipart policies for #915 M5-04/M5-05`).
- Authority commit on this checkout: `f3a85aa86`; owner requirements: `M5-04`, `M5-05`,
  `M7-01`, `M7-02` in `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`.
- Product code was read-only. No DEV/TEST data, migrations, privilege apply/reconcile, storage access, or real
  upload was performed.

## MUST FIX

### MM-M5-04-01 — patient program-submission multipart cannot abort before completion

Reachable scenario: a patient begins an authorized program-submission multipart upload and cancels before all
parts are completed. Multipart upload creation does not create a completed object, so `HeadObject` returns no
metadata. The patient branch of `POST /api/media/multipart/abort` uses that metadata as the only policy source and
returns `404 session_not_found` before it invokes the existing patient submission abort finalizer or S3 abort.
The pending media/session therefore remains until expiry instead of following the existing failure semantics.

Evidence: retained acceptance test
`apps/webapp/src/app/api/media/multipart/abort/route.route.test.ts` injects the real pre-completion condition
(`inspectReceivedMediaObject → null`). Command:

```bash
pnpm --dir apps/webapp exec vitest run 'src/app/api/media/multipart/abort/route.route.test.ts' --project=route
```

Exact failed assertion: `expected 404 to be 200` at
`apps/webapp/src/app/api/media/multipart/abort/route.route.test.ts:79`.

Relevant candidate path: `apps/webapp/src/app/api/media/multipart/abort/route.ts:60-62`.

### MM-M5-04-02 — doctor abort leaves an aborted patient file legacy-visible

Reachable scenario: a doctor starts a multipart upload from the patient-files door and aborts it. The generic
doctor branch invokes `abortMultipartPendingTx`, which deletes the pending `media_files` row. The FK on
`patient_files.media_file_id` is `ON DELETE SET NULL`; `listFiles` deliberately returns a row with null
`mediaFileId`. The linked pending patient-file row consequently survives and becomes visible as a legacy file.
This violates the M5 lifecycle requirement that patient-file abort remove the current pending linked record.

Evidence by inspected durable paths:

- `apps/webapp/src/infra/repos/mediaUploadSessionsRepo.ts:263-312` deletes only `media_files` in the user abort.
- `apps/webapp/db/schema/patientFiles.ts:81-85` defines the link as `ON DELETE SET NULL`.
- `apps/webapp/src/infra/repos/pgPatientFiles.ts:98-105` returns rows whose `mediaFileId` is null.
- The existing expiry state machine explicitly deletes the linked `patient_files` row
  (`apps/webapp/src/infra/repos/mediaUploadSessionsRepo.ts:429-435`), proving the required terminal semantics
  already exist but are not used by the user abort path.

## Kill-set tally

| # | Result | Evidence |
| --- | --- | --- |
| 1 | INSPECTED | Session lookup predicates bind `owner_user_id`; doctor organization comes from workspace, patient principal is server-installed. No live RLS probe was run because this audit must not write DEV/TEST data. |
| 2 | PASS (inspection) | Begin route schemas accept only `uploadMode`; each caller supplies a literal closed policy to `prepareMediaUpload`; `beginAuthorizedMultipartUpload` owns key/target/metadata. |
| 3 | PASS (inspection) | Positive size schemas, multipart bounds, and finalization metadata/size checks are present in the candidate. |
| 4 | INSPECTED | Complete maps `cms`, individual exercise, program submission, and patient-file policy branches to their existing finalizers; this does not cure the abort failures below. |
| 5 | INSPECTED | Completed-session replay returns the original media identity before finalizers/enqueue; exact malformed parts are rejected. |
| 6 | MUST FIX (2) | `MM-M5-04-01` retained failing acceptance test; `MM-M5-04-02` durable lifecycle inspection. |
| 7 | PASS | `check-media-upload-door.mjs` and `--self-test` passed, including injected bypass fixtures. |
| 8 | PASS (generated-gate inspection) | Candidate has no schema/migration diff; declaration grants `app_patient` only session `SELECT`/limited `UPDATE`, no DELETE; generated artifacts match declaration. |

Tally: **3 PASS, 3 INSPECTED, 2 MUST FIX**. The candidate is not land-ready until both lifecycle failures are
fixed and the retained acceptance test turns green.

## Fault-injection evidence

- Pre-completion object absence: injected `inspectReceivedMediaObject → null` in the route acceptance test;
  it produced the failed `404`/`200` assertion above. Test doubles are reset by `beforeEach`; no production mutation
  was retained.
- Storage/adapter bypass: `node apps/webapp/scripts/check-media-upload-door.mjs --self-test` injected every
  checker fixture and reported `OK (all structural bypass fixtures went red)`.
- No real object, DB, or privilege fault injection was allowed by this brief. The unresolved lifecycle behavior is
  represented by the retained failing public-route test rather than an unsafe live probe.

## Commands and results

```text
pnpm install --frozen-lockfile                                      PASS
pnpm --dir apps/webapp typecheck                                   PASS
pnpm --dir apps/webapp exec eslint <candidate paths + audit test> PASS
node apps/webapp/scripts/check-media-upload-door.mjs              PASS
node apps/webapp/scripts/check-media-upload-door.mjs --self-test  PASS
node deploy/postgres/privileges/generate-cli.mjs --check           PASS
node deploy/postgres/privileges/generate-cli.mjs --census          PASS
./node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges PASS
node scripts/check-media-delivery-chokepoint.mjs                   PASS
node scripts/check-webapp-infra-import-boundary.mjs                PASS
node scripts/check-webapp-infra-import-boundary.mjs --self-test    PASS
pnpm --dir apps/webapp exec vitest run src/infra/repos/s3MediaStorage.lifecycle.unit.test.ts --project=unit
                                                                    PASS (20 tests)
pnpm --dir apps/webapp exec vitest run src/app/api/media/multipart/abort/route.route.test.ts --project=route
                                                                    FAIL (expected 200, received 404)
git diff --check                                                   PASS
```

`pnpm install --frozen-lockfile` was required because this checkout initially had no `node_modules`; it changed no
tracked file. The retained lifecycle suite additionally required local builds of `shared-contracts`,
`error-tracking`, `operator-db-schema`, and `platform-merge`; those builds changed no tracked file.

## Live blockers

None were encountered. Live object uploads, DEV/TEST mutation/RLS probes, migration/privilege application and
reconcile are intentionally out of scope for this audit and are not substitutes for the failing public seam.
