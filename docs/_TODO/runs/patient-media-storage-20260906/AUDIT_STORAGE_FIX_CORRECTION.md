# Re-audit: patient media storage correction

## Pre-inspection classification and kill-set

This section was written before inspecting the correction implementation, its diff, or existing tests. Authority: owner rulings quoted in the audit brief and `AGENTS.md` §10a, §10b, §24.4–§24.6.

| Claim | Method | Blind kill-set |
| --- | --- | --- |
| A | **Mixed. LOOK** for the final Drizzle/live-column state and exhaustive TypeScript/raw-SQL/`SECURITY DEFINER` write-path census. **TEST** for repeatable `parseStorageTarget` behavior. | Omit `storage_target` at each reachable insert boundary and try `null`, absence, and an unknown value at the parser; no path may silently select `library`. Inject parser fallback/default behavior and require a behavioral test to fail. |
| B | **LOOK.** Privilege declaration/generated artifacts/migration census plus live DEV catalog and rollback-only canonical reconcile are final-state evidence, not source-text tests. | Find a runtime role whose callsite reads/writes `storage_target` but whose live/generated column privilege is absent (reachable `42501`); also find a granted role with no runtime callsite. Confirm migrations contain no `GRANT`/`REVOKE` for the column. |
| C | **LOOK.** Exhaustively enumerate repository and live `pg_get_functiondef` inserts and inspect the live column default. | Find any currently reachable insert into `media_files` or `patient_files` that omits `storage_target`, so dropping the default breaks it or permits misrouting. |
| D | **TEST.** Account-purge object deletion is repeatable store-routing behavior. | Change purge routing so every object uses the library store (or otherwise ignores its row's `storage_target`); the existing acceptance test must turn red. Search for uncovered purge/cleanup paths, treating intake attachments only as the stated owner question. |
| E | **TEST.** Dormant-mode client selection and S3 calls are repeatable module behavior. | With `PATIENT_S3_BUCKET` unset, make the resolver allocate/use a second client or alter bucket/call arguments; the existing behavioral acceptance test must turn red. |
| F | **LOOK.** The hook's final behavior is proved by a one-off runtime experiment in a throwaway `/tmp` repository, not a persistent test of hook source text. | Trigger a refusal after staged work exists and verify no unfinished index/worktree state remains; then run the legitimate `ORCH_LAND=1` path and require it to pass. Never exercise this against the source repository or `feat/doctor-ui-rebuild`. |

## Scope inspected

The audited product state was `8985be346b19393558a6718d3c4ac364a132f175` on
`wt/patient-media-storage-20260906`. I read each correction with:

```text
git show f8ec51cbb
git show d04832ea0
git show 55d6897e2
git diff ce59f7882..HEAD
```

Only behavior introduced or materially changed by those corrections is judged below. The earlier whole-split
audit remains `AUDIT_PATIENT_MEDIA_STORAGE.md` at `ce59f7882`.

## Claim verdicts

### A — FAIL: one worker parser still silently defaults to `library`

Owner oracle (06.09.2026): «Я ничего не говорил про умолчание. … Если по умолчанию все грузится в библиотеку,
то если для файлов пациентов мы забудем подставить назначение в каком-то куске кода, они загрузятся в библиотеку.
А это неправильно. Поэтому слово умолчание здесь вообще неуместно.»

The schema/final-migration half passes:

- `rg -n "storageTarget:.*\\.default" apps/webapp/db/schema | wc -l` returned `0`.
- `rg -n 'storage_target|DROP DEFAULT|DEFAULT' apps/webapp/db/drizzle-migrations/20260906T190000_a_stored_file_carries_the_store_it_lives_in.sql`
  showed a temporary `DEFAULT 'library'` only while adding/backfilling the two columns, immediately followed by
  `DROP DEFAULT` for both at lines 22–23.
- The rollback-only future-state catalog check reported both `public.media_files.storage_target` and
  `public.patient_files.storage_target` as `attnotnull=t`, `atthasdef=f`, with an empty default expression.
- `apps/webapp/src/infra/s3/client.ts::parseStorageTarget` accepts only `library` and `patient`; null, absence,
  empty text, and unknown text throw `storage_target_missing_on_row`.

The repeatable worker behavior fails. `apps/media-worker/src/storageTarget.ts::parseStorageTarget` is still:

```ts
return value === 'patient' ? 'patient' : 'library';
```

`processTranscodeJob` passes `loaded?.storageTarget` through that parser before selecting the S3 binding. Thus an
older/malformed control response or an accidentally unselected column makes the worker use the library binding
instead of refusing loudly. The committed acceptance case proves all four omissions:

```text
cd apps/media-worker && npx vitest run src/transcodeStorageTarget.unit.test.ts
Test Files  1 failed (1)
Tests       4 failed | 3 passed (7)
```

Fault injection of the opposite regression in the corrected webapp parser—temporarily returning `library` from
its failure branch—was killed by:

```text
cd apps/webapp && npx vitest run src/infra/s3/storageTargetCompatibility.unit.test.ts
Test Files  1 failed (1)
Tests       4 failed | 3 passed (7)
```

The temporary product edit was reverted.

### B — PASS: privileges are generated, complete for runtime consumers, and absent from migrations

Owner oracle (06.09.2026): «Воркеры все должны иметь … возможность работать с обоими бакетами. То есть
HLS-транскодинг, удаление, очистка удаленных файлов и так далее.» AGENTS.md §1 additionally says that
`GRANT`/`REVOKE` belong only to `deploy/postgres/privileges/declaration.ts` and generated artifacts.

Static/canonical evidence:

- `node deploy/postgres/privileges/generate-cli.mjs --check` found all `4` generated artifacts byte-identical.
- `node deploy/postgres/privileges/generate-cli.mjs --census` counted `210 ACTIVE relations across 3343 source
  files`; `399 patient-only modules` reach only the `115` relations having a patient door.
- For every migration containing `storage_target`,
  `rg -n '^[[:space:]]*(GRANT|REVOKE)\\b' "$file"` returned `0` matching lines.

Because DEV still has the four corrections pending, I applied those exact four migrations and
`deploy/postgres/generated/privileges.bcb_webapp_dev.sql` inside one explicit `BEGIN`/`ROLLBACK` transaction on
the named `bcb_webapp_dev`. Catalog introspection inside that transaction returned `18` column-ACL rows. The
expected runtime matrix returned `10/10` true checks:

- `app_operational_media_worker`: `media_files` `SELECT`, `UPDATE`;
- `app_patient`: `media_files` `SELECT`;
- `app_seam_patient_lfk_media_owner`: `media_files` `INSERT`, `SELECT`, `UPDATE`;
- `app_staff`: `media_files` `INSERT`, `SELECT`, and `patient_files` `INSERT`, `SELECT`.

Every granted role maps to a declaration-owned runtime/seam path or object ownership; no reachable extra grantee
without a callsite/ownership duty was found. After `ROLLBACK`, the read-only query
`SELECT count(*) ... attname = 'storage_target'` returned `0`, confirming no DEV schema change escaped.

`pnpm test:db-privileges` independently completed with `341` tests: `184` passed, `157` skipped, `0` failed.

### C — PASS: the final executable insert set names `storage_target`

Owner oracle is ruling 1 above: omission must be impossible or loud.

Repository census:

```text
rg -n --glob '!docs/**' --glob '!**/node_modules/**' '\.insert\((mediaFiles|patientFiles)\)' .
7 matches

rg -n -i --glob '!docs/**' --glob '!**/node_modules/**' \
  'insert[[:space:]]+into[[:space:]]+(public\.)?"?(media_files|patient_files)"?' .
3 matches
```

All `7` Drizzle inserts explicitly provide `storageTarget`. The `3` SQL matches are:

1. the superseded `20260904T170000_*` function definition, written before the column existed;
2. the active `20260906T191500_*` replacement, which explicitly inserts `'patient'`;
3. schema B's pre-forward snapshot of the superseded function.

Schema B plus active forward migrations is the repository's declared current-state boundary; the latter replaces
the snapshot definition. In the rollback-only future-state catalog, this query over `pg_get_functiondef` found
exactly `1` function inserting into either target table:

```text
SELECT ... FROM pg_proc ...
WHERE pg_get_functiondef(p.oid) ~* 'insert[[:space:]]+into[[:space:]]+public\\.(media_files|patient_files)';
1 row: app.create_patient_program_submission_media(...), names_storage_target=t
```

No final function insert omits the column. The current pre-migration DEV function omits it only because current
DEV also has no such column; `bash deploy/host/migrate-dev.sh --preflight ...` proved the atomic forward state and
rolled it back.

### D — PASS: purge routes both corrected row classes by their own metadata

Owner oracle (06.09.2026): «приложение об этом знать не должно … Место хранения файла указывается в базе данных
… в метаданных этого файла.»

Before adding coverage, the existing purge acceptance run was green:

```text
cd apps/webapp && npx vitest run \
  src/infra/strictPlatformUserPurge.unit.test.ts \
  src/infra/platformUserFullPurge.collectPurgeArtifactKeys.test.ts
Test Files  2 passed (2)
Tests       6 passed (6)
```

The existing test covered a `media_files` row. I added the missing behavioral acceptance case for a
`patient_files` row; both now require deletion with target `patient`. Two independent temporary mutations—forcing
each row class to `library`—were killed:

```text
npx vitest run src/infra/strictPlatformUserPurge.unit.test.ts \
  -t 'deletes a patient media row from the patient store named by that row'
Tests  1 failed | 4 skipped (5)

npx vitest run src/infra/strictPlatformUserPurge.unit.test.ts \
  -t 'deletes a patient-file object from the patient store named by that row'
Tests  1 failed | 4 skipped (5)
```

Both product mutations were reverted. The full mandatory webapp suite subsequently passed. Intake attachments
remain the brief's known owner question and are not reported as a defect.

### E — PASS: dormant mode preserves the single client and call surface

With `PATIENT_S3_BUCKET` unset, both targets resolve to the same configuration identity, bucket, and cached SDK
client. The acceptance test passed before injection:

```text
cd apps/webapp && npx vitest run src/infra/s3/storageTargetCompatibility.unit.test.ts
Test Files  1 passed (1)
Tests       7 passed (7)
```

I temporarily keyed the client cache by target, which creates the forbidden second client while leaving the
credentials/bucket equal. The same command failed with `1 failed | 6 passed (7)` because the library and patient
client identities differed. The mutation was reverted. The test also asserts the unchanged bucket and S3 call
arguments, so the brief's byte-for-byte dormant contract survived the kill attempt.

### F — FAIL: the original refusal still leaves a merge in progress

Owner oracle (06.09.2026): «Если после отказа хука остается незавершенная работа, значит, хук работает
неправильно. Он либо должен … отбивать твое действие до того, как ты его начал делать … Его надо либо исправить,
либо удалить.»

I created independent empty-history scratch repositories under `/tmp`, pointed only their `core.hooksPath` at
this worktree, and used an empty `base`, `feature`, and local `feat/doctor-ui-rebuild`. No source-repository ref or
worktree was touched.

First, a manual non-fast-forward merge without `ORCH_LAND` was rejected by `reference-transaction`:

```text
git merge --no-ff feature -m 'manual land must refuse'
REFUSAL_RC=128
AFTER_REFUSAL_MERGE_HEAD=present
```

That is the precise forbidden half-done state. The new pre-commit cleanup fires only if the operator later tries
another commit. A second scratch run demonstrated that delayed behavior:

```text
git commit --allow-empty -m 'next unrelated commit'
FOLLOWUP_RC=1
MERGE_HEAD_AFTER_PRECOMMIT=absent
```

Thus the pre-commit hook prevents the next commit from accidentally completing the merge, but it does not make
the original refused action atomic: an operator who stops after exit `128`, runs a non-commit command, or leaves
the checkout for another process still has an unfinished merge.

After aborting only inside the first scratch repository, the legitimate path passed:

```text
ORCH_LAND=1 git merge --no-ff feature -m 'legitimate land'
LAND_RC=0
MERGE_HEAD=absent
HEAD parent count=2
```

## Fault-injection summary

| Surface killed | Result |
| --- | --- |
| Webapp parser silently falls back for absent/null/empty/unknown target | Killed: `4` targeted failures. |
| Media-worker parser silently falls back for absent/null/empty/unknown target | Survived current implementation: `4` committed acceptance failures; defect A. |
| Purge ignores a `media_files` row target | Killed: `1` targeted failure. |
| Purge ignores a `patient_files` row target | Killed: `1` targeted failure. |
| Dormant mode allocates one S3 client per logical target | Killed: `1` targeted failure. |
| Manual merge refusal is atomic/cleans itself immediately | Survived the correction: `MERGE_HEAD=present`; defect F. |
| Legitimate `ORCH_LAND=1` merge | Survived as required: exit `0`, two-parent commit, no `MERGE_HEAD`. |

## Mandatory validation

Every command ran in the foreground to completion.

| Command | Exact result |
| --- | --- |
| `cd apps/webapp && npx tsc --noEmit` | exit `0`; `0` diagnostics. |
| `cd apps/media-worker && npx tsc --noEmit -p tsconfig.json` | exit `0`; `0` diagnostics. |
| `cd apps/webapp && npx eslint src` | exit `0`; `0` errors, `0` warnings. |
| `cd apps/webapp && npx vitest run src/app-layer src/modules src/infra src/app/api` | exit `0`; `405` files passed, `7` skipped (`412` total); `2107` tests passed, `31` skipped (`2138` total). |
| `cd apps/media-worker && npx vitest run` | exit `1`; `1` file failed, `9` passed (`10` total); `4` tests failed, `25` passed (`29` total). All `4` failures are the committed claim-A acceptance cases. |
| `node deploy/postgres/privileges/generate-cli.mjs --check` | exit `0`; `4` generated artifacts byte-identical. |
| `node deploy/postgres/privileges/generate-cli.mjs --census` | exit `0`; `210` active relations across `3343` source files; `399` patient-only modules limited to `115` patient-door relations. |
| `pnpm test:db-privileges` | exit `0`; `341` tests, `184` passed, `157` skipped, `0` failed. |
| `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` | exit `0`; `4` pending of `131` total migrations applied and rolled back; `0` reapplied, `4` foreign-ledger rows, `0` relabeled, `0` dropped-foreign, `0` dropped-foreign-by-hash, `0` unapplied. |

## Findings

1. **Media-worker omission silently chooses the library store.** Reachable scenario: a rolling-version or
   malformed control response lacks `storageTarget`, or a future query forgets to select it; the worker calls
   `storageFor('library')` and can read/write/delete patient media in the wrong bucket. Impact: patient bytes are
   misrouted or a patient transcode operates on the library store. Violates owner ruling 1 (forgetting the store
   must be impossible or loud) and ruling 2 (workers must correctly operate both buckets).
2. **A rejected manual merge leaves `MERGE_HEAD`.** Reachable scenario: an operator runs a forbidden manual merge
   into the protected branch, receives exit `128`, and stops or hands the checkout to any non-commit workflow;
   the repository remains in an unfinished merge until a later commit happens to invoke cleanup. Impact: the
   rejected action leaves half-done work and a trap for subsequent operations. Violates owner ruling 4 verbatim.

2 defects found.
