# DEV migration owner metadata fix — 2026-08-17

## Result

- `0016_patient_self_action_capabilities` now starts with the owner metadata consumed by
  `parseOwnerStatements`; the stale temporary-number comment remains after that metadata.
- `0017_patient_shared_core_capabilities` now declares its single execution step as
  `app_seam_patient_self_actions_owner`, with temporary `CREATE` on schema `app` and `USAGE` on language
  `plpgsql`, before its existing temporary-number/narrative comments.
- `0018_clinic_owner_tariff_branch_quotas` was inspected and left unchanged: it already parses as one backfill
  step followed by two `app_seam_payment_webhook_owner` steps.
- No SQL body, DDL behavior, migration number, journal entry, snapshot, database, environment or runtime was
  changed.

## Executable regression

`deploy/postgres/privileges/migrate-local-parse.test.mjs` now reads the active Drizzle journal, runs every
post-B0 migration through the production `parseOwnerStatements` parser, and pins the exact execution shapes of
0016, 0017 and 0018. This catches misplaced narrative comments and absent owner/backfill metadata by executing
the parser instead of inspecting source strings.

## Verification

- `node --test deploy/postgres/privileges/migrate-local-parse.test.mjs` — PASS, 4/4 tests.
- `node scripts/check-b0-migration-baseline.mjs` — PASS; B0 + 18 webapp forward migrations, no legacy chain.
- `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` — PASS, including transaction-safe layout check.
- `pnpm exec eslint deploy/postgres/privileges/migrate-local-parse.test.mjs` — PASS.
- `node --check deploy/postgres/privileges/migrate-local-parse.test.mjs` — PASS.
- `git diff --check` — PASS.
- A Node assertion that removes only `TEMPORARY LOCAL MIGRATION NUMBER` and `BCB-MIGRATION-*` header lines from
  HEAD/current 0016 and 0017 reports `non-metadata SQL unchanged` for both files.

## Existing unrelated test mismatch

`node --test deploy/host/migrate-dev.test.mjs` — 8/9 PASS, 1 FAIL. The failing base test
`migrate-dev executes owner-scoped migrations before mandatory reconcile` still asserts that the wrapper invokes
`d30-outgoing-delivery-queue-organization-status-due-online-index.sql`; the base `deploy/host/migrate-dev.sh` no
longer contains or invokes that path. `git show HEAD:deploy/host/migrate-dev.sh | rg -n 'd30|online'` returns no
match while `git show HEAD:deploy/host/migrate-dev.test.mjs | rg -n 'onlineIndex|d30'` returns the stale fixture and
assertion. This failure is outside the bounded migration-metadata change and was not hidden or changed here.

No DB, DEV, TEST, PROD, env, deploy or push command was run.
