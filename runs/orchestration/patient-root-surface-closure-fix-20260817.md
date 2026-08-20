# Patient root surface closure — 2026-08-17

Status: PASS. Branch: `wt/patient-root-surface-closure-20260817`. Base: `fadba67d7`.

## Measured gap closure

The initial executable census over the exact 47 functions in migrations 0016/0017 found 219 relation-level mismatches. Normalized underdeclaration was 29 exact relation×operation gaps: 14 wholly absent relation surfaces and 15 missing operations. It also found 127 overdeclared relation pairs / 333 overdeclared operation triples. The corrected exact-function census reports zero gaps across all 47 functions.

Absent relation surfaces (14):

1. rating feedback: `patient_home_block_items SELECT`
2. rating feedback: `patient_home_blocks SELECT`
3. playback client: `content_pages SELECT`
4. playback client: `program_item_discussion_messages SELECT`
5. playback client: `treatment_program_instance_stage_items SELECT`
6. playback client: `treatment_program_instance_stages SELECT`
7. playback client: `treatment_program_instances SELECT`
8. playback first-resolve: `content_pages SELECT`
9. playback first-resolve: `program_item_discussion_messages SELECT`
10. playback first-resolve: `treatment_program_instance_stage_items SELECT`
11. playback first-resolve: `treatment_program_instance_stages SELECT`
12. playback first-resolve: `treatment_program_instances SELECT`
13. create reminder: `org_enrollments SELECT`
14. ensure support conversation: `org_enrollments SELECT`

Missing operations (15):

1. record practice: `patient_practice_completions SELECT`
2. upsert rating: `material_ratings SELECT`
3. update practice feeling: `patient_practice_completions SELECT`
4. save warmup presentation: `patient_daily_warmup_presentations SELECT`
5. content rating feedback: `patient_content_rating_feedback SELECT`
6. playback first-resolve: first-resolve table `SELECT`
7. set notification topic: `user_notification_topics SELECT`
8. set notification topic channel: `user_notification_topic_channels SELECT`
9. create reminder: `platform_users SELECT`
10. delete reminder: `reminder_occurrence_history DELETE`
11. record reminder journal: `reminder_journal SELECT`
12. set reminder mute: `platform_users SELECT`
13. append program event: `treatment_program_events SELECT`
14. append program discussion: `program_item_discussion_messages SELECT`
15. mark program discussion read: `program_item_discussion_reads SELECT`

## Implementation

- Added an offline executable parser/comparator for PostgreSQL function bodies. It recognizes relation operations from `SELECT`/`JOIN`/comma-separated `FROM`, `INSERT`, `UPDATE`, `DELETE`, `ON CONFLICT`, and `RETURNING` including `RETURNING *`.
- Added exact acceptance over all 47 current-patient functions, with injected absent-relation, missing-operation, overbroad-operation, comma-`FROM`, and `RETURNING *` failures.
- Replaced shared-union overgrant for the 36 migration-0017 functions with exact per-function relation/operation surfaces; corrected all migration-0016 declaration gaps.
- Changed generated PostgreSQL verification to collect every missing surface/operation and raise once with the complete sorted gap list.
- Regenerated DEV/TEST privilege and port-context artifacts. Migration SQL, journal, and allowlists were not changed.

## Validation

- `node --test deploy/postgres/privileges/function-census.test.mjs` — 9/9 pass.
- `node --test deploy/postgres/privileges/*.test.mjs` — 72/72 pass.
- `./node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges` — pass (temporary dependency symlink removed afterward).
- `./node_modules/.bin/eslint deploy/postgres/privileges/declaration.ts deploy/postgres/privileges/function-body-surface.mjs deploy/postgres/privileges/function-census.test.mjs deploy/postgres/privileges/generate.mjs deploy/postgres/privileges/relation-access.test.mjs` — pass (temporary dependency symlink removed afterward).
- `node deploy/postgres/privileges/generate-cli.mjs --check` — 4/4 generated privilege/allowlist artifacts byte-identical.
- `node deploy/postgres/privileges/generate-cli.mjs --check --port-context-only` — 2/2 port-context artifacts byte-identical.
- `node deploy/postgres/privileges/generate-cli.mjs --gaps` — DEV 0, TEST 0.
- `node deploy/postgres/privileges/generate-cli.mjs --census` — 219 ACTIVE relations across 3212 source files checked.
- `rg '^GRANT .*\b(INSERT|UPDATE|DELETE|TRUNCATE)\b.* TO "app_patient";' deploy/postgres/generated/privileges.bcb_webapp_dev.sql | wc -l` — 0.
- Same command for `privileges.bersoncarebot_test.sql` — 0.
- One-DB generated-drift injection: appended a DEV-only marker; `generate-cli.mjs --check` exited 1 and named only the DEV privileges artifact; marker removed and final check passed.
- `git diff --check` — pass.

No database, environment, deploy, or push command was run. Live disposable-PostgreSQL shell acceptance was intentionally not run because this workstream explicitly forbids DB access; the offline executable gate covers the requested exact 47-function contract, and the generated accumulator will run on the next authorized reconcile.
