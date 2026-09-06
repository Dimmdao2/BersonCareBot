# Audit: patient media storage split

Date: 2026-09-06  
Authority: bounded audit brief in the launcher prompt; owner rulings quoted there.

## Reviewed scope

```bash
git log --oneline feat/doctor-ui-rebuild..HEAD
```

Reviewed at branch head `5f5ba36c35848c6b09b84e71638e6f4922108db0`:

```text
5f5ba36c3 Merge branch 'feat/doctor-ui-rebuild' into wt/patient-media-storage-20260906
cf164aaa6 the two services must agree on where a patient's bytes live
91d3f24d1 a playlist may name either of our own buckets
e6ff3c17c the transcoder works inside the store its job names
3800b4808 every S3 call takes its store from the row, not from a default
a824e1621 a patient's file records the store it was written to
b5e2ba844 feat(storage): decide a file's store at the upload door, from its policy
448492bd2 feat(storage): parameterize the S3 chokepoint by storage target
```

## Classification recorded before implementation inspection

1. **Test** — persistent write-path behaviour: patient upload policy/namespace selects the patient store and the row records that target, including the `app.create_patient_program_submission_media` seam.
2. **Test** — persistent read/delete/transcode behaviour: every listed object-store operation selects the target recorded on the row.
3. **Test** — persistent cross-service/bootstrap behaviour: webapp and media-worker cannot be configured with different patient buckets while bootstrap passes.
4. **Test** — persistent compatibility behaviour: an unset `PATIENT_S3_BUCKET` uses the original bucket, client, and calls.
5. **View** — one-off database/migration fact: each function migration preserves the live definition except for its declared delta, and `storage_target` privileges exactly match `s3_key` privileges.
6. **Test** — persistent legacy-row behaviour: an absent/null target resolves to `library`, so rows from before the split remain in the original store.

## Blind kill-set recorded before implementation/test inspection

- A patient upload door selects `library` or persists no `patient` target.
- The `app.create_patient_program_submission_media` seam inserts a patient submission without `storage_target = 'patient'`.
- Any named delivery, preview, playback/poster, HLS playlist/segment, patient-files, multipart, preview-worker, purge, or transcoder path chooses a store independently of the row target.
- TEST bootstrap accepts different `PATIENT_S3_BUCKET` values for webapp and media-worker.
- With `PATIENT_S3_BUCKET` absent, patient-target operations instantiate/use a distinct client or make different S3 calls from the legacy library path.
- A null/absent target resolves to `patient` rather than `library`.
- A function migration changes anything beyond the one declared return/write delta, or changes owner/grants/predicate.
- The roles/privileges on `storage_target` differ in either direction from those on `s3_key`.

## Claim verdicts

### 1. Patient writes select and persist the patient store — PASS

The upload policy and namespace classifications, both upload doors, and the
`app.create_patient_program_submission_media` seam were checked. No door that can write patient bytes while
selecting `library` was found. The seam migration inserts the literal `patient` target.

Acceptance tests:

```bash
cd apps/webapp && npx vitest run src/app-layer/media/mediaUploadStorageTarget.unit.test.ts src/modules/media/uploadDoorAcceptance.route.test.ts
```

Evidence: with `storageTargetFor()` fault-injected to return `library`, this command failed five assertions:
the two policy cases, the `patient-files` namespace case, the patient-program-submission presign, and the
patient-file row/presign. After reverting the fault, the audit-targeted webapp command below passed all 47 tests.

The standard privilege reconcile currently prevents these inserts from working at all; that is the separate
deploy/runtime defect recorded under claim 5. It does not create a patient-to-library selection path.

### 2. Reads and deletes use the row target — FAIL

Delivery, preview, playback poster, HLS playlist and segments, doctor patient-file routes, multipart,
preview worker, pending-delete purge, and transcoder were traced from the row to the S3 call. The targeted
delivery/HLS/playback/upload tests passed after fault-injection checks, and the media-worker target test passed.

Commands:

```bash
cd apps/webapp && npx vitest run src/app-layer/media/hlsDeliveryStorageTarget.unit.test.ts src/app-layer/media/resolveMediaPlaybackPayload.unit.test.ts src/modules/media/uploadDoorAcceptance.route.test.ts 'src/app/api/media/[id]/mediaDeliveryChokepoint.route.test.ts'
cd apps/media-worker && npx vitest run src/transcodeStorageTarget.unit.test.ts
```

Evidence: hard-coding `library` in the delivery/preview route failed three target assertions; doing the same in
the HLS proxy failed two assertions; forcing the media-worker to use `library` failed its patient-target
assertion. All temporary faults were reverted.

One surviving path is wrong. `strictPlatformUserPurge.ts` calls
`deleteS3ObjectsWithPerKeyResults(allKeys)` without a target, while `platformUserFullPurge.ts` discards each
media row's `storage_target`. The default therefore deletes from `library`. S3 deletion of a missing library key
is idempotently successful, after which the database row may be deleted while the encrypted patient object is
left in Yandex.

Failing acceptance test:

```bash
cd apps/webapp && npx vitest run src/infra/strictPlatformUserPurge.unit.test.ts -t 'deletes a patient media row from the patient store named by that row'
```

Evidence: expected `deleteS3ObjectsWithPerKeyResults([MEDIA_KEY], 'patient')`; received a call with only
`[MEDIA_KEY]`.

### 3. TEST bootstrap rejects cross-service patient-bucket disagreement — PASS

Acceptance test:

```bash
cd apps/media-worker && npx vitest run src/bootstrapPatientBucket.unit.test.ts
node deploy/host/bootstrap-c4-test-env.mjs --self-test
```

Evidence: temporarily disabling the patient-bucket equality guard made the Vitest acceptance test fail because
the bootstrap accepted `webapp-patient` versus `worker-patient`. After reverting the fault, the media-worker
suite passed 25 tests and the direct bootstrap self-test passed.

### 4. Unset patient bucket is the original bucket, client, and calls — FAIL

Acceptance test:

```bash
cd apps/webapp && npx vitest run src/infra/s3/storageTargetCompatibility.unit.test.ts
```

Evidence: the legacy/null/unknown parsing cases pass and resolve to `library`, but the same-client assertion
fails. `client.ts` caches by `StorageTarget`, so with `PATIENT_S3_BUCKET` unset, `getS3Client('patient')` and
`getS3Client('library')` instantiate different `S3Client` objects even though the endpoint, credentials, and
bucket coincide. This violates the explicit dormant-mode contract: same bucket, same client, same calls.

### 5. Migration fidelity and durable column privileges — FAIL

All four candidate migrations were inspected: the schema/privilege migration plus the three function
replacement migrations. The function replacements are faithful. Exact diffs against live
`pg_get_functiondef` showed only their declared deltas:

- `app.create_patient_program_submission_media` adds the `storage_target` insert column and literal `patient`;
- `app.process_media_pending_delete_step` returns `media.storage_target` as `storageTarget`;
- `app.read_media_transcode_job_media` returns `media.storage_target` as `storageTarget`.

Function owner and ACL queries also showed the three functions remain owned by
`app_seam_patient_lfk_media_owner`, with the existing patient/worker execute grants.

The column privilege work is not deployable as written:

- `apps/webapp/drizzle/20260906T190000_a_stored_file_carries_the_store_it_lives_in.sql` contains 12 `GRANT`
  statements, contrary to AGENTS.md §1's absolute migration rule;
- `deploy/postgres/privileges/declaration.ts` has no `storage_target` declaration;
- the generated reconcile SQL revokes table privileges for `media_files` and `patient_files`, then regrants
  column lists that omit `storage_target`;
- the declaration's SECURITY DEFINER relation surfaces also omit `storage_target` for the three changed
  functions.

Commands:

```bash
rg -n "GRANT .*storage_target|REVOKE .*storage_target" apps/webapp/drizzle/20260906T190000_a_stored_file_carries_the_store_it_lives_in.sql
rg -n "storage_target" deploy/postgres/privileges/declaration.ts deploy/postgres/generated/privileges.bcb_webapp_dev.sql || true
rg -n "REVOKE .*media_files|GRANT .*media_files|REVOKE .*patient_files|GRANT .*patient_files" deploy/postgres/generated/privileges.bcb_webapp_dev.sql | head -120
node deploy/postgres/privileges/generate-cli.mjs --check
node deploy/postgres/privileges/generate-cli.mjs --census
bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot
```

Evidence: the migration search returned 12 grants; the declaration/generated search returned no
`storage_target`; the generated SQL search showed both revoke-and-regrant blocks with the new column absent.
`generate-cli.mjs --check` passed, proving the generated file faithfully reflects the stale declaration.
`generate-cli.mjs --census` passed with `210 ACTIVE relations / 3342 source files` and
`399 patient-only / 115 relations on both DBs`, but that census does not detect a missing column privilege.
The mandatory migration preflight passed with `pending=4 total=131` and rolled back, because preflight neither
runs nor validates the post-migration privilege reconcile.

The live DEV comparison used only read-only transactions:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN READ ONLY; SELECT table_name, grantee, privilege_type FROM information_schema.column_privileges WHERE table_schema='public' AND table_name IN ('media_files','patient_files') AND column_name='s3_key' ORDER BY table_name, grantee, privilege_type; ROLLBACK;"
```

Evidence: the migration's proposed `storage_target` role/privilege list exactly matches the explicit non-owner
`s3_key` grants, and owners retain implicit privileges. But a normal migration followed by the canonical
reconcile removes those grants. Direct inserts naming `storage_target`, including the SECURITY DEFINER seam,
then fail with `42501` instead of recording either target. The one-off list is correct; its non-canonical and
non-durable implementation makes the claim fail.

### 6. Legacy/null target resolves to library — PASS

Acceptance test:

```bash
cd apps/webapp && npx vitest run src/infra/s3/storageTargetCompatibility.unit.test.ts
```

Evidence: null, undefined, empty, and unknown values resolve to `library`; explicit `patient` remains `patient`.
Temporarily making the parser return `patient` failed five compatibility assertions. The fault was reverted.

## Required validation

```bash
cd apps/webapp && npx tsc --noEmit
cd apps/media-worker && npx tsc --noEmit -p tsconfig.json
cd apps/webapp && npx eslint src
cd apps/webapp && npx vitest run src/app-layer src/modules src/infra src/app/api
cd apps/media-worker && npx vitest run
bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot
```

Results:

- both TypeScript checks passed;
- webapp ESLint passed;
- webapp Vitest: `2 failed | 403 passed | 7 skipped` files and
  `2 failed | 2103 passed | 31 skipped` tests; the only failures are the two deliberate acceptance tests for
  findings 1 and 2 below;
- media-worker Vitest: `10 passed` files, `25 passed` tests;
- migration preflight passed and rolled back.

## Findings

1. **Account purge deletes patient media from the library target, then can delete the row.** Impact: encrypted
   patient objects are orphaned in Yandex while purge reports success. Failing acceptance test:
   `strictPlatformUserPurge.unit.test.ts`.
2. **Dormant patient storage creates a second S3 client.** Impact: the explicit no-op compatibility contract is
   false even when both targets resolve to the original bucket. Failing acceptance test:
   `storageTargetCompatibility.unit.test.ts`.
3. **The privilege source of truth omits `storage_target`.** Impact: canonical privilege reconcile removes the
   migration-local grants, and new media/patient-file inserts fail with `42501`, including the SECURITY DEFINER
   patient-program-submission seam. Evidence: migration/declaration/generated SQL and live read-only privilege
   comparison above.

## Kill-set result

**3 defects found. This is not zero.** No product fix was made in this audit stage. The two behavioural defects
remain as deliberately failing acceptance tests; the privilege defect remains as view evidence in this artifact.
