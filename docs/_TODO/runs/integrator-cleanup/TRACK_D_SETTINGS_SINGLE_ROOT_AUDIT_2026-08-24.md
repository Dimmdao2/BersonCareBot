# Track D settings single-root audit — 2026-08-24

Candidate: `wt/track-d-settings-single-root-20260824`, implementation `fd4aa2364` plus the fresh `feat/doctor-ui-rebuild` merge. Baseline: `850b69c7c`.

## Pre-test classification and blind kill-set

The blind classes were recorded before reading the existing tests. The method labels apply the brief's rule that one-time SQL state and declarations are inspected, while repeatable resolver/access behavior is tested.

| # | Method | Blind fault class |
|---|---|---|
| 1 | look | Any of the 27 auth-surface rows is absent. |
| 2 | look | Any surface has the wrong owner default: staff/platform-admin email-only; patient email, Telegram, MAX, Yandex; all other channels disabled. |
| 3 | look | Migration derives defaults from a legacy/mirror row instead of the explicit owner matrix. |
| 4 | look | An active runtime/write/cutover/refresh path reads or writes `app_runtime_settings` or its audit. |
| 5 | test | Public/patient/pre-session resolver can read a secret/restricted or unregistered key. |
| 6 | test | A value or organization override for one auth surface is visible to another surface/organization. |
| 7 | look | Dual write, sync trigger, mirror fallback, mismatch telemetry, or a second settings audit remains. |
| 8 | look | Dropping the mirror breaks dependent functions, triggers, or views. |
| 9 | look | `declaration.ts`, census, generated privileges, or allowlists disagree. |
| 10 | look | New migration contains privilege SQL or a function body executes under the wrong owner. |
| 11 | look | An already-applied migration was edited instead of adding a forward migration. |
| 12 | test + look | Canonical `public.system_settings_audit` was removed or its audit behavior stopped working. |
| 13 | test | Organization-scoped values or global fallback semantics were lost. |
| 14 | test + look | Server/integrator/media/scheduler readers lost required access or gained direct table access. |
| 15 | test | A second rollback-only matrix run is not idempotent. |
| 16 | look | A→B cutover, refresh, or TEST readiness still requires a remote mirror artifact/table. |
| 17 | look | Candidate includes future Therapysto domain cutover or drops support for current legacy TEST origins/addresses. |

## Result

**PASS.** No reachable violation of the owner contract or repository rules was found in the candidate. The migration was not applied; TEST, PROD, domains, and origin/address configuration were not changed.

The brief names `docs/_TODO/INTEGRATOR_CLEANUP_AND_SIMPLIFICATION/IMPLEMENTATION_PLAN.md`, but that path does not exist in the worktree, baseline, or Git history. Exact `rg --files`, `git log --all -- <path>`, `git ls-tree 850b69c7c <path>`, lexical `code-search`, semantic `codeq`, taskdb `find bcb "integrator cleanup"`, and registry/back-reference searches all returned no such plan. This is an authority-pointer discrepancy, not a product finding: `AGENTS.md` §4, the exact audit brief, `UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` Track D, `OWNER_DECISIONS.md` Track D, the historical SaaS plan, and branding §F4 supplied consistent authority.

| # | Status | Exact evidence |
|---|---|---|
| 1 | PASS | `rg -o "'auth_surface_[a-z0-9_]+_enabled'" apps/webapp/db/drizzle-migrations/20260824T120000_make_system_settings_single_root.sql | sort -u | wc -l` returned 27 explicit auth-surface keys. The UPSERT targets global rows (`organization_id IS NULL`). |
| 2 | PASS | Migration values are explicit: staff/platform-admin email only; patient email/Telegram/MAX/Yandex; every other channel false. No legacy value appears in the VALUES matrix. |
| 3 | PASS | The matrix is a literal `INSERT ... VALUES ... ON CONFLICT`; it does not select from either mirror table. |
| 4 | PASS | `rg -l "app_runtime_settings" apps packages deploy scripts --glob '!apps/webapp/db/drizzle-migrations/**' --glob '!deploy/postgres/generated/prod-to-target/schema-*.sql' --glob '!**/*.test.*' --glob '!**/*.md' | sort` returned no active code path. `getSnapshotRows` has definitions only and no non-test callers. |
| 5 | PASS | Added `pgAppRuntimeSettings.unit.test.ts`: secret and unregistered keys return `null` before SQL; public and authenticated registered keys use the declared resolver. Focused suite: 41/41. |
| 6 | PASS | Rollback-only named-DEV proof `settings-single-root.devDbProof.test.mjs` returns the own-org value and zero rows for another organization. Its in-memory `org_guard` fault returns one other-org row and fails. |
| 7 | PASS | Migration drops the mirror sync/audit triggers and functions and both mirror tables; code inspection found no dual write, fallback, mismatch telemetry, or second audit path. |
| 8 | PASS | The owner-aware rollback-only DEV preflight validates the complete DDL twice without dependency failure. Drops do not use `CASCADE`; all former mirror-dependent functions are rehomed first. |
| 9 | PASS | `relation-access` and `function-census` pass; migration owner/rehome markers match `declaration.ts`; generated cutover paths pass. Exact claimed suite: 64/64. |
| 10 | PASS | Exact migration scan found no executable `GRANT`, `REVOKE`, `ROLE`, or `POLICY` statement. All 18 changed/new bodies run under the owners declared below. |
| 11 | PASS | `git diff --name-status 850b69c7c...HEAD -- apps/webapp/db/drizzle-migrations apps/webapp/db/meta/_journal.json` reports exactly one file: added forward migration `20260824T120000_make_system_settings_single_root.sql`. |
| 12 | PASS | Migration drops only `app_runtime_settings_audit`, not `system_settings_audit`. `pgSystemSettings.ts` upsert/delete and the write unit of work insert canonical audit rows in the same transaction. DEV canonical audit count stayed 98 across all rollback-only runs. |
| 13 | PASS | Resolver body preserves exact-org-first/global-fallback semantics; focused `configAdapter`, `runtimeSettingsNoSubstitution`, preauth, and runtime repo tests pass (41/41). |
| 14 | PASS | Changed functions retain seam-owner access and callers use functions, not direct table access. `declaration.ts` grants only declared relation/column surfaces; the 64-test privilege/census/cutover suite passes. |
| 15 | PASS | `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` passed on two consecutive clean-candidate runs and once more after all fault injections were reverted. Each run reported `pending=5 total=75 reapplied=0 foreign-ledger-rows=4 relabeled=0 dropped-foreign=0 dropped-foreign-by-hash=0 unapplied=0`. |
| 16 | PASS | Cutover no longer includes a generated runtime-settings artifact; TEST readiness checks only canonical `system_settings`. Injecting the removed include made the cutover path test fail. |
| 17 | PASS | Baseline diff contains no proxy/domain/origin cutover. Current legacy TEST origins/addresses remain supported; no TEST deployment was performed. |

## Migration and rights inventory

Migration: `apps/webapp/db/drizzle-migrations/20260824T120000_make_system_settings_single_root.sql` (new forward file).

- Data/table operations: UPSERT 27 global rows in `public.system_settings`; drop trigger `system_settings_sync_registered_runtime`; drop function `public.sync_registered_app_runtime_setting()`; drop trigger `app_runtime_settings_audit_change`; drop function `public.audit_app_runtime_settings_change()`; drop tables `public.app_runtime_settings_audit` and `public.app_runtime_settings`. No other table/column DDL and no privilege SQL.
- Functions owned by `app_seam_settings_runtime_owner`: `read_clinic_platform_integration_availability`, `read_global_server_runtime_setting`, `read_media_worker_runtime_setting`, `read_public_runtime_setting`, `read_webapp_server_runtime_setting`, and new `read_authenticated_runtime_setting`. The new function is executable by `app_patient`; all six read only declared `system_settings(key, scope, organization_id, value_json)` columns.
- Functions owned by their existing seam owners: `capture_current_patient_diary_day_snapshot` (`app_seam_patient_self_actions_owner`); `is_telegram_login_configured` (`app_seam_settings_preauth_owner`); `patient_done_reminder_occurrence` and `patient_set_reminder_mute` (`app_seam_reminder_patient_owner`); `read_current_patient_booking_runtime_integer` and `read_current_patient_booking_slot_snapshot` (`app_seam_patient_booking_owner`); `read_public_booking_slot_snapshot` (`app_seam_public_booking_owner`); `record_current_patient_content_rating_feedback`, `set_current_patient_notification_topic`, `set_current_patient_notification_topic_channel`, and `upsert_current_patient_material_rating` (`app_seam_patient_self_actions_owner`); `read_curated_system_health_pre_0196` (`saas_system_health_owner`). Their SELECT/INSERT/UPDATE relation and column surfaces match `deploy/postgres/privileges/declaration.ts` and the generated census.
- The actual write surfaces remain bounded to their existing relations: diary snapshots; reminder history/platform users; patient ratings/feedback/notification topics. Booking, public booking, pre-session, runtime-setting, and health bodies are SELECT-only. No changed function receives direct caller access to `system_settings`.

The exact read-only fingerprint command run immediately before and after the final rollback-only preflight was:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -Atqc "SELECT json_build_object('ledger_count', (SELECT count(*) FROM drizzle.__drizzle_migrations), 'ledger_hash', (SELECT md5(string_agg(id::text || ':' || hash, ',' ORDER BY id)) FROM drizzle.__drizzle_migrations), 'auth_rows', (SELECT count(*) FROM public.system_settings WHERE key LIKE 'auth_surface_%'), 'auth_hash', (SELECT md5(string_agg(key || ':' || value_json::text, ',' ORDER BY key)) FROM public.system_settings WHERE key LIKE 'auth_surface_%'), 'canonical_audit_count', (SELECT count(*) FROM public.system_settings_audit), 'mirror', to_regclass('public.app_runtime_settings')::text, 'mirror_audit', to_regclass('public.app_runtime_settings_audit')::text);"
```

The preflight's before/after outputs, and a third fingerprint after both named-DEV proof modes, were exactly `ledger_count=74`, `ledger_hash=5def32a58e46df11ed26e7447cccd1e7`, `auth_rows=27`, `auth_hash=ae88bc64d270900a3ef82636c6d58c6b`, `canonical_audit_count=98`, `mirror=app_runtime_settings`, `mirror_audit=app_runtime_settings_audit`. Thus the candidate preflight and proof left no data, ledger, audit, or schema changes.

## Fault injection

All injected changes were temporary and reverted before final validation.

| Broken temporarily | What turned red | Result |
|---|---|---|
| Removed registry storage/audience gate before the runtime resolver | `pnpm --dir apps/webapp exec vitest run --project unit src/infra/repos/pgAppRuntimeSettings.unit.test.ts`: 1 failed, 3 passed; `telegram_bot_token` reached SQL | Caught |
| Removed `app_patient` EXECUTE from authenticated resolver declaration | `node --test deploy/postgres/privileges/relation-access.test.mjs`: 1 failed, 41 passed | Caught |
| Reintroduced removed `generated/prod-to-target/runtime-settings.sql` include | `node --test deploy/host/prod-to-target-cutover-path-resolvable.test.mjs`: 1 failed, 1 passed | Caught |
| Changed patient MAX default from true to false while leaving the marker unchanged | `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` stayed green | Look-class: visible in the explicit owner matrix; reverted and final state inspected correct |
| Removed authenticated resolver's cross-organization rejection predicate | `RUN_SETTINGS_SINGLE_ROOT_DB=1 SETTINGS_SINGLE_ROOT_FAULT=org_guard node --test deploy/postgres/privileges/settings-single-root.devDbProof.test.mjs`: 0 passed, 1 failed; `other_count` changed from 0 to 1 | Caught |

Uncaught test-class fault injections: **0**. The #2 matrix mutation is not counted: it is a declared look-class and was caught by final-state inspection; the exercise establishes only that rollback preflight is not a matrix-value oracle. The added public-boundary test closes the independently demonstrated secret/unregistered-key gap (#5), and the named-DEV proof closes the cross-organization gap (#6).

## Final validation

- `node --test scripts/prod-to-target-baseline-policy.test.mjs deploy/host/prod-to-target-cutover-path-resolvable.test.mjs deploy/postgres/privileges/relation-access.test.mjs deploy/postgres/privileges/function-census.test.mjs` — 64/64 PASS.
- `pnpm --dir apps/webapp exec vitest run --project unit src/modules/auth/publicAuthPolicy.unit.test.ts src/modules/system-settings/configAdapter.unit.test.ts src/modules/system-settings/runtimeSettingsNoSubstitution.unit.test.ts src/infra/repos/pgSystemSettings.preauth.unit.test.ts src/infra/repos/pgAppRuntimeSettings.unit.test.ts` — 5 files, 41/41 PASS.
- `pnpm --dir apps/webapp exec eslint src/infra/repos/pgAppRuntimeSettings.unit.test.ts` — PASS.
- `pnpm --dir apps/webapp typecheck` — PASS.
- `RUN_SETTINGS_SINGLE_ROOT_DB=1 node --test deploy/postgres/privileges/settings-single-root.devDbProof.test.mjs` — 1/1 PASS on named DEV; candidate function, fixture rows, and grants were transaction-local and rolled back.
- `node --check deploy/postgres/privileges/settings-single-root.devDbProof.test.mjs` and `pnpm exec eslint deploy/postgres/privileges/settings-single-root.devDbProof.test.mjs` — PASS.
- DEV preflight command above — three clean-candidate PASS runs in total; final pre/post rollback fingerprints identical.
- Full CI intentionally not run per audit brief; landing lead owns that gate.
