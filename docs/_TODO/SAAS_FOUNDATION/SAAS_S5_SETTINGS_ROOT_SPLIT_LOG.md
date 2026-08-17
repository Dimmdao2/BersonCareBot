# S5 Settings Root Split — execution log

## 2026-07-23 — Track B restricted SMTP accessor code handoff

The email-OTP failure on locked TEST was traced to an obsolete direct `public.system_settings` read by the
integrator SMTP resolver. The API base-login intentionally has neither ambient settings-table `SELECT` nor tenant
context, so widening that login was rejected.

- Migration `0235_integrator_smtp_restricted_accessor` adds one argumentless SECURITY DEFINER capability for the
  global `smtp_outbound` admin row.
- The existing integrator server-runtime overlay owns the function as `app_owner`, revokes PUBLIC and classified
  role access, grants exact API base-login EXECUTE, and preserves all direct-table/current-context denials.
- SMTP resolution is DB-only and fail-closed. The legacy SMTP env reader/export/example was removed; DB error
  details and credential material are not logged.
- TEST deploy readiness and the static checker now require the capability and its least-privilege ACL. No TEST,
  DEV or PROD database/service was changed in this code pass.

Verification: focused integrator SMTP/delivery/send-email tests 33/33; verified-email/global-admin and Staff PWA
boundary tests 44/44; integrator typecheck; scoped ESLint; deploy shell syntax; runtime-config checker plus self-test;
Drizzle journal sync; `git diff --check`. Live TEST OTP remains an orchestrator deployment/acceptance gate.

## 2026-07-19 — S5-0 reality lock

Only the allowed registry/types/checker/projector-test/docs scope changed. No DDL, migration, DB, grant/RLS,
service/repository/DI/route/UI or observable runtime read/write path changed.

### Reality ledger

- Existing partial work: migrations `0186`–`0202`, E1, `app_runtime_settings`, `pgAppRuntimeSettings` and safe
  projections/readers already exist. `system_settings` remains the legacy compatibility write source until S5-3.
- `app_runtime_settings_audit` does **not** exist in schema or migrations; it remains S5-1 work.
- [`registry.ts`](../../../apps/webapp/src/modules/system-settings/registry.ts) is the complete typed matrix for
  every key: `storage`, current source, ownership, audience, parser/value contract, default and serialization.
  `types.ts` derives `ALLOWED_KEYS`/`SystemSettingKey`; `orgScopedKeys.ts` derives ownership. A new key has no
  default classification, public audience or runtime-store membership.
- `storage=runtime` records the intended/safe runtime read surface; `legacySource=system_settings` explicitly
  describes the current dual-source compatibility reality, not a completed S5-3 migration.

### Caller/principal/mechanic crosswalk

Every comma-separated key below is a separate registry row with the same verified caller family/principal/mechanic;
its storage/ownership/audience/parser/default/client serialization are the explicit per-key fields in the registry.
`A` is Settings admin service/API (staff); `R` is generic runtime provider/safe reader; `P` product UI/request;
`I` integrator/worker/server. `—` means no product reader was found, not an implicit public/runtime classification.

| keys                                                                                                                                                                                                                                                                                          | callers / principal                                                           | mechanic                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------- |
| `platform_user_merge_v2_enabled`, `integrator_linked_phone_source`                                                                                                                                                                                                                            | A; merge/linked-phone server                                                  | —                                         |
| `patient_label`, `doctor_patient_support_comments_without_support_default_enabled`, `doctor_patient_support_media_without_support_default_enabled`                                                                                                                                            | A, P; staff/patient                                                           | patient_app/discussion (deferred)         |
| `sms_fallback_enabled`                                                                                                                                                                                                                                                                        | A; derived public auth reader; staff/bootstrap                                | —                                         |
| `doctor_specialist_task_reminder_channels`, `doctor_appointment_reminder_enabled`, `doctor_appointment_reminder_offsets_minutes`                                                                                                                                                              | A, I reminder jobs; staff/server                                              | —                                         |
| `debug_forward_to_admin`, `important_fallback_delay_minutes`, `operator_health_projection_thresholds`                                                                                                                                                                                         | A, R/I server operations; staff/server                                        | —                                         |
| `max_debug_page_enabled`, `dev_mode`, `integration_test_ids`, `test_account_identifiers`                                                                                                                                                                                                      | A; diagnostics/test guard; staff                                              | —                                         |
| `app_base_url`                                                                                                                                                                                                                                                                                | A, I links; staff/server                                                      | —                                         |
| `support_contact_url`, `telegram_login_bot_username`, `max_login_bot_nickname`, `vk_web_login_url`, `app_display_timezone`                                                                                                                                                                    | A, R public/auth/display; staff/bootstrap/patient                             | —                                         |
| `max_bot_api_key`                                                                                                                                                                                                                                                                             | A, MAX validation; server                                                     | —                                         |
| `patient_home_daily_practice_target`, `patient_default_promo_treatment_program_template_id`, `patient_home_daily_warmup_rotation_enabled`, `patient_home_daily_warmup_rotation_times`, `patient_home_daily_warmup_repeat_cooldown_minutes`, `patient_home_mood_icons`, `notifications_topics` | A, P patient app; staff/patient                                               | patient_app (deferred)                    |
| `patient_app_maintenance_enabled`, `patient_app_maintenance_message`, `video_playback_api_enabled`, `video_default_delivery`, `patient_treatment_plan_item_done_repeat_cooldown_minutes`                                                                                                      | A, R/P patient runtime; staff/patient                                         | patient_app (deferred)                    |
| `specialist_signup_enabled`                                                                                                                                                                                                                                                                   | A, R public signup; staff/bootstrap                                           | —                                         |
| `patient_program_discussion_doctor_reply_from_log_enabled`, `patient_program_discussion_ui_enabled`, `patient_program_discussion_media_submission_enabled`                                                                                                                                    | A, R/P discussion; staff/patient                                              | discussion: setting (no entitlement copy) |
| `video_hls_pipeline_enabled`, `video_hls_new_uploads_auto_transcode`, `video_hls_reconcile_enabled`, `video_presign_ttl_seconds`, `video_watermark_enabled`                                                                                                                                   | A, I media worker; staff/server                                               | —                                         |
| `patient_booking_url`, `booking_calendar_show_working_hours`, `booking_calendar_default_window`, `booking_calendar_default_branch_id`, `booking_calendar_default_service_id`                                                                                                                  | A, R/P booking/calendar; staff/patient                                        | booking (deferred)                        |
| `booking_default_organization_id`, `booking_rubitime_bridge_enabled`, `booking_doctor_appointments_read_source`, `booking_slots_read_source`                                                                                                                                                  | A, I/doctor booking server; staff/server                                      | booking (deferred)                        |
| `booking_payment_enabled`                                                                                                                                                                                                                                                                     | A, payments service/UI; staff/patient                                         | payments: operational setting             |
| `booking_payment_providers`                                                                                                                                                                                                                                                                   | A, acquiring adapter; redacted admin serialization; staff/server              | payments: operational setting             |
| `booking_lifecycle_notifications`, `booking_allow_doctor_unlink_past_package_sessions`, `booking_min_notice_hours`, `booking_max_consecutive_slot_hours`                                                                                                                                      | A, booking server; staff/server                                               | booking (deferred)                        |
| `patient_home_warmup_skip_to_next_available_enabled`                                                                                                                                                                                                                                          | A, deprecated compatibility parser; staff                                     | —                                         |
| `smtp_outbound`, `web_push_vapid`, `admin_incident_alert_config`, `operator_health_alert_config`                                                                                                                                                                                              | A, I adapters/alerts; staff/server                                            | —                                         |
| `notif_template:created:patient`, `notif_template:created:doctor`, `notif_template:cancelled:patient`, `notif_template:cancelled:doctor`, `notif_template:rescheduled:patient`, `notif_template:rescheduled:doctor`                                                                           | A, I notification templates; staff/server                                     | —                                         |
| `yandex_oauth_client_id`, `yandex_oauth_client_secret`, `yandex_oauth_redirect_uri`                                                                                                                                                                                                           | A, auth integration; derived enabled flag; staff/server/bootstrap             | —                                         |
| `google_client_id`, `google_client_secret`, `google_redirect_uri`, `google_refresh_token`, `google_calendar_id`, `google_calendar_enabled`, `google_connected_email`, `google_oauth_login_redirect_uri`                                                                                       | A, calendar/auth integration; staff/server; login projection for redirect URI | —                                         |
| `apple_oauth_client_id`, `apple_oauth_team_id`, `apple_oauth_key_id`, `apple_oauth_private_key`, `apple_oauth_redirect_uri`                                                                                                                                                                   | A, auth integration; derived enabled flag; staff/server/bootstrap             | —                                         |
| `allowed_telegram_ids`, `allowed_max_ids`, `admin_telegram_ids`, `doctor_telegram_ids`, `admin_max_ids`, `doctor_max_ids`, `admin_phones`, `doctor_phones`, `allowed_phones`                                                                                                                  | A, server role/allowlist config; staff/server                                 | —                                         |

### S4 boundary and safe projections

- `RUNTIME_FLAG_DEFINITIONS` has all three typed source forms: `discussion=setting`,
  `booking=mechanic`, `payments=all(mechanic payments AND booking_payment_enabled)`,
  `patient_app=mechanic`. Evaluation and `requireEntitlement` wiring are explicitly
  `deferred_until_s4_merge`; no import from protected #888 files and no second entitlement model.
- VAPID serializes only `publicKey` and `hasPrivateKey`. The S5-0 payment safe projector serializes only provider
  id/label/enabled and omits `privateKey`, `password`, `apiKey`, `webhookSecret` and `refreshToken`; it is not wired
  into the existing admin response before S5-3. Focused regression tests assert all five field names are absent.
- The accessor checker now rejects a direct `SELECT ... system_settings` or `app_runtime_settings` everywhere except
  `pgSystemSettings`, `pgAppRuntimeSettings`, and integrator `publicSystemSettings`. Its self-test injects both
  prohibited reads and proves `app.read_public_runtime_setting` is not a false positive.

### S5 status after this pass

S5-0 is complete. S5-1 (including runtime audit table), S5-2, S5-3, S5-4, S5-5 and S5-6 remain partial/not
executed; S5-7 is TEST/owner/ops-gated. No claim of full S5 completion is made.

### Verification record

- PASS: `CHECK_SYSTEM_SETTINGS_ACCESSORS_SELF_TEST=1 node apps/webapp/scripts/check-system-settings-accessors.mjs`.
- PASS after reusing the integration worktree's already-installed dependencies: targeted registry/org-scope/
  runtime/runtime-migration/VAPID/payment-projector Vitest suite — 6 files, 32/32 tests.
- PASS: webapp `tsc --noEmit`.
- PASS: scoped `git diff --check`.
- Independent audit `bcb-s5-0-settings-reality-lock-audit-20260719` — PASS against the full S5-0 checklist.
- The initial worker sandbox could not access worktree Git metadata or its dependency store; this was an execution
  environment limitation, not a source failure. No install, DB, TEST, deploy or full-CI action was performed.

## 2026-07-19 — S5-1 additive schema/data-contract executor pass

Allowed S5-1 scope only: `appRuntimeSettings.ts`, canonical migration `0209`, Drizzle journal, one static contract
test and architecture/S5 docs. Existing migrations `0186`–`0208`, S4 files and all service/repository/DI/route/UI
files were left unchanged. No DB, env, deploy, TEST/DEV/PROD action or full CI was performed.

### Implemented contract

- `0209_s5_runtime_settings_audit_contract` adds `public.app_runtime_settings_audit` with UUID identity, runtime row
  key/scope/org/audience, old/new JSON, `updated_by`, source and timestamp; its organization/actor FKs use
  `CASCADE`/`SET NULL`, structural scope/audience checks, and separate global/org key-history indexes.
- `AFTER INSERT OR UPDATE` trigger `app_runtime_settings_audit_change` inserts precisely one audit row in the same
  PostgreSQL transaction. Its source is an explicitly reset session marker or `runtime_store_write`; migration backfill uses
  `s5_1_backfill`. This is the single audit owner: S5-3 must not add a second application-level audit insert.
- `0209` preserves `0186` runtime-table identity/RLS/grants unchanged. Its normal-row definition list is checked
  exactly against all S5-0 `storage=runtime` registry keys. Existing `0193` org-only `patient_booking_url` handling
  is explicitly preserved rather than recreated.
- Residual normal backfill preserves source key/scope/org/value/updated metadata and only updates an existing runtime
  row when the source timestamp is not older. Missing global registration rows receive registry defaults without
  overwriting an existing destination. VAPID, payment, OAuth and SMS projections reconstruct only allowlisted output
  fields; credential-shaped fields are not materialized in runtime or audit rows.

### Evidence

- PASS: targeted `appRuntimeSettings.s5Contract.test.ts` — 1 file, 5 tests. A one-off runner-loaded config was used
  because worktree `node_modules` is a read-only symlink and the normal Vite loader cannot create `.vite-temp`; no
  dependency installation or worktree configuration changed.
- PASS: `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` — journal includes `0209` as index 209 after 0208.
- PASS: targeted ESLint for `appRuntimeSettings.ts` and `appRuntimeSettings.s5Contract.test.ts`.
- PASS: `pnpm --dir apps/webapp typecheck`. The worktree has safe symlinks only to already-installed package-level
  `node_modules` in the sibling checkout; no dependency installation or lockfile change was made.
- PASS: `node docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md` — private PostgreSQL 16 cluster created
  under a unique `/tmp/bcb_s5_1_runtime_settings_scratch_*` directory with a private socket, reserved ephemeral
  port and uniquely named scratch DB. The runner supplies a minimal synthetic predecessor (`0186`) and fixture,
  applies `0209` twice, and removes the whole cluster in `finally`. It does not read application env or connect to
  DEV/TEST/PROD.
- The dynamic proof checks schema/checks/FKs/indexes and one trigger owner; exactly one audit row per direct insert
  and update; rollback leaves no runtime/audit row; the second `0209` apply creates no audit history; aggregate
  source/destination counts match by every normal runtime key; restricted source keys are absent; derived runtime
  rows/audit contain no credential-shaped fields; and a newer destination row is preserved. It emits only a fixed
  aggregate PASS line, never fixture values, PII or secrets.
- S5-1 is complete for its additive schema/data/audit-contract scope. S5-2 through S5-7 remain unexecuted; in
  particular, no RLS/grant/runtime-write-chokepoint or live TEST/ops claim is implied.

## 2026-07-19 — S5-1 audit-gate correction: explicit RLS-coverage guard exception

`0209` added `public.app_runtime_settings_audit` (has `organization_id`) without RLS/grants by design (S5-1 is
additive-only; S5-2 owns policy/grants per the S5-2 checklist above). `pnpm run audit` failed at
`check-new-table-rls-coverage` because the table had neither a descriptor nor a documented exception.

- Fix: added a `public.app_runtime_settings_audit` entry to `nonLockedPolicyExceptions` in
  `docs/_TODO/SAAS_FOUNDATION/scripts/check-new-table-rls-coverage.mjs`, with no `policyPath`/`policyTokens`
  (intentionally no policy exists yet) and a reason citing S5-1 default-deny-by-default-privileges and S5-2
  ownership of the eventual policy/grants. No 0209 RLS/grants, descriptor model, or S5-2 code changed.
- PASS: `pnpm run audit` reaches and passes `check-new-table-rls-coverage` (153 public organization_id tables
  covered) and its self-test.
- **Open blocker, not fixed here:** `pnpm run audit` still fails downstream at `check-p0-10-tier-completeness`
  (P0.10.1), because `public.app_runtime_settings_audit` is not yet in
  `docs/_TODO/SAAS_FOUNDATION/scope-derivation/tiers-218.tsv`. That check has no exception mechanism — it requires
  every actual base table to have exactly one tier assignment. Adding the table to the tier inventory is explicit
  S5-2 scope ("Добавить runtime table/audit в SaaS table inventory и явную custom-policy классификацию" — S5-2
  checklist above), so it is out of scope for this S5-1 correction pass. `pnpm run audit` will not go fully green
  until S5-2 does this.

## 2026-07-19 — S5-2 RLS, grants and config-reader capability executor pass

S5-2 is implemented as one security-contract stage. This pass changed only canonical policy/grant/role sources,
their generated artifacts, SaaS inventory/checkers, the DB-principal package and the dedicated infra pool contract.
It did not add a settings consumer, service/repository write path or DI wiring (S5-3), and did not connect to an
application DB, alter env, deploy, provision TEST credentials or run full CI.

### Implemented contract

- `public.app_runtime_settings_audit` is now an explicit BOOTSTRAP custom-policy descriptor. The inventory has 235
  exact descriptors (BOOTSTRAP 29), and the temporary S5-1 RLS-coverage exceptions for both runtime tables are gone.
- The generated locked-policy artifact and FORCE-cutover target set contain 166 tables. Runtime rows are limited to
  staff global/current-org, patient safe-audience global/current-org, bootstrap public-only, and the preserved worker
  server-global path. Runtime audit is staff global/current-org only. Every org predicate uses the protected
  `app.current_org_id()` helper; missing/wrong context is closed.
- The canonical P0.5b grant generator gives patient only runtime SELECT, staff full runtime DML and exact audit
  `SELECT, INSERT`, while preserving explicit `REVOKE ALL` on restricted settings, restricted audit and the
  integrator mirror for patient/bootstrap.
- Generated `s5-config-reader-runtime.sql` creates `app_config_reader` as a SET-only capability behind an
  operator-created isolated login. It strips stale membership/ACL edges, grants only restricted settings SELECT plus
  protected context helpers, applies exact global/current-org RLS, and carries repeatable membership/ACL tripwires.
- `@bersoncare/db-principal` has a closed typed `app_config_reader` role and protected operational-org context helper.
  The webapp exposes a callback-only, separately bounded config-reader pool. Every checkout selects the capability,
  installs exact org context, clears even partially installed context, resets role and destroys failed checkouts;
  concurrent org operations use separate clients. No raw pool is exported to routes or modules.

### Evidence

- PASS: `pnpm run check:saas-db-regression`, including the descriptor/tier/accessor/chokepoint suite, 166-target
  FORCE/locked-policy checks and the dedicated S5-2 generated-artifact checker.
- PASS: `node docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md` on a private disposable PostgreSQL
  16 cluster. The real-role matrix proves staff/patient/config-reader positive and negative access,
  missing/wrong-org denial, audit/restricted denial, SET ROLE denial, zero clinical privileges and membership closure.
  Its bootstrap positive case is deliberately only an RLS-policy probe with a local scratch grant: the real
  bootstrap login retains zero direct table SELECT and continues to read public runtime config through the existing
  accessor. Wiring that later consumer/grant is S5-5 scope, not S5-2.
  It also runs config-reader DOWN twice and restores UP, proving repeatable rollback. The runner reads no application
  env, reaches no DEV/TEST/PROD DB and emits only a fixed PII-free result.
- PASS: targeted `webappPoolProvider.test.ts` — 1 file, 31/31 tests, including concurrent org isolation, failed
  operation disposal and partial-setup cleanup.
- PASS: `pnpm --dir apps/webapp typecheck` and targeted ESLint for the changed webapp TS files.
- PASS: `pnpm --dir packages/db-principal test` — build, type-contract tests and 5/5 runtime tests.
- PASS: `git diff --check` (recorded after final documentation synchronization).

S5-2 is complete for source/generated security contracts and disposable proof. Live credential creation and TEST
installation remain S5-7 operator work; S5-3 must wire the restricted port and new store without broadening this
capability or introducing a second write/audit owner.

## 2026-07-19 — S5-2 independent-audit correction

The independent audit found one in-scope P1: the first grant renderer gave runtime audit the same broad DML as the
runtime table. The canonical renderer now first revokes all stale staff privileges, then restores full DML only on
`app_runtime_settings` and exact `SELECT, INSERT` on `app_runtime_settings_audit`. Static generation checks reject
any audit UPDATE/DELETE grant; the disposable real-role proof checks the exact ACL snapshot, allows audit INSERT and
denies direct UPDATE and DELETE. No policy, trigger, consumer or later-stage mechanism changed.

The audit's non-blocking P2 is documentation-only: bootstrap positive smoke coverage is a policy probe using a local
scratch grant. Deployed bootstrap direct table SELECT remains revoked and the existing accessor remains its real read
path; no S5-5 grant was added.

## 2026-07-19 — S5-2 final re-audit and milestone CI

- PASS: final independent full-checklist re-audit
  `bcb-s5-2-security-final-reaudit-20260719-1200`. It independently confirmed the corrected least-privilege audit
  ACL (`app_staff` has exact `SELECT, INSERT`, with direct audit `UPDATE`/`DELETE` denied), the bootstrap policy-probe
  wording, generated artifact consistency, custom RLS descriptors, config-reader capability closure, callback-only
  pool boundary and DB-principal role/context contract. No blocking finding remains.
- PASS: one milestone `pnpm run ci`. Lint, typecheck, all tests and both builds passed. Test totals were integrator
  1263, webapp 8060 and media-worker 56. The final audit initially stopped at one stale mechanical FORCE-target guard
  (`164` instead of the generated/current `166`); only
  `docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-test-strict-finalizer.mjs` was updated. The failed
  `check:saas-test-strict-finalizer` gate then passed, and `pnpm run ci:resume:after-build-webapp` completed the audit
  and dependency audit without repeating the already-green lint, typecheck, test or build gates.
- The existing non-blocking Turbopack NFT warning remains unchanged. No DEV/TEST/PROD DB, credentials, service or
  deployment was touched by these verification passes.

## 2026-07-19 — S5-3 write chokepoint executor pass

Run id: `codex/s5-write-chokepoint-S5-3-20260719`.

- `ports.ts` now declares the restricted repository alias, generic runtime repository (`getEffective`,
  `getSnapshotRows`, `upsert`) and one `SettingsWriteUnitOfWork`. `buildAppDeps` injects the Postgres restricted,
  runtime and UoW adapters; module and route remain free of DB/repository imports and the route does not sync or
  invalidate directly.
- `createSystemSettingsService` keeps its public API. Only registry `storage=runtime` keys produce an explicit
  authoritative runtime row plus legacy compatibility copy in one transaction. Restricted/mixed writes remain
  legacy-authoritative: `0210` owns their VAPID/payment allowlist projections exactly once, as it already does for
  OAuth/SMS derived projections. No application insert targets `app_runtime_settings_audit`; sync and cache
  invalidation begin only after the UoW resolves.
- `0210_s5_runtime_dual_write_trigger_bypass.sql` replaces the trigger function additively with the prior
  `0193` routing branches plus one early bypass guard. The UoW sets
  `app.runtime_settings_explicit_dual_write=on` transaction-locally only around an explicit runtime compatibility
  row, preventing its duplicate runtime write/audit. Manual/ops legacy writers and restricted derived writes retain
  the original trigger implementation.
- Runtime service reads are runtime-first, legacy-only-on-absence. `createBoundedRuntimeReadTelemetry` emits only
  `{key, source, count}` on first observation and then at a fixed per-identity interval; the Map is capped at 128
  key/source identities and stores no values, actor, or organization identifier. Runtime/legacy mismatch is observed
  without changing the authoritative runtime result.
- Focused service tests cover post-commit ordering, runtime routing, trigger-owned payment handling, fallback/
  mismatch telemetry and its exact bounded emitted shape. The schema contract asserts all trigger branches.

### Verification record

- PASS: `pnpm --dir apps/webapp exec vitest run src/modules/system-settings/service.test.ts` — 1 file, 23 tests.
- PASS: direct targeted Vitest invocation (temporary ignored single-test config) for
  `db/schema/appRuntimeSettings.s5Contract.test.ts` — 1 file, 6 tests; it does not invoke the full suite.
- PASS: `pnpm --dir apps/webapp exec vitest run src/infra/repos/pgAppRuntimeSettings.test.ts
src/infra/repos/pgSystemSettings.repo.test.ts src/infra/repos/pgSystemSettings.audit.test.ts
src/app/api/admin/settings/route.test.ts` — 4 files, 118 tests.
- PASS: targeted ESLint for changed S5-3 TypeScript files.
- PASS: `pnpm --dir apps/webapp typecheck` after temporary ignored facades to the identical-HEAD sibling worktree's
  existing dependency store; no install, lockfile or application environment change.
- PASS: `bash apps/webapp/scripts/check-drizzle-journal-sync.sh`.
- PASS: `CHECK_SYSTEM_SETTINGS_ACCESSORS_SELF_TEST=1 node apps/webapp/scripts/check-system-settings-accessors.mjs`.
- PASS: `node docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md` — unique private `/tmp`
  PostgreSQL 16 cluster; applies `0210` twice; proves trigger-owned safe VAPID/payment projection with one runtime
  audit and no credential fields, OAuth/SMS continuity, explicit runtime dual-write one-audit behavior, rollback and
  manual/ops legacy triggering. It cleans up in `finally` and emits only its fixed aggregate result.
- `git diff --check` across the whole worktree is likewise blocked by pre-existing modified `.env.example` files
  that Git cannot hash in this worktree; PASS: `git diff --check -- <S5-3 changed paths>` is clean.

S5-3 implementation checkboxes are complete in this worktree, but no independent audit, owner acceptance,
TEST/PROD execution or S5-4+ completion is claimed. The remaining gate is an independent audit plus targeted
runtime/route/repository checks in an environment with the existing dependency store.

## 2026-07-19 — S5-3 independent audit, correction and final re-audit

- The first independent audit identified one in-scope gap: runtime-read telemetry was bounded but not externally
  observable, and the disposable trigger proof did not cover the mixed VAPID/payment and existing OAuth/SMS paths.
  Lead review also found that mixed projections could have acquired two write/audit owners. One integrated correction
  made the legacy trigger the sole owner of mixed/restricted safe projections, kept explicit runtime dual-write plus
  transaction-local bypass only for registry `storage=runtime` keys, added observable value-free
  `{key, source, count}` telemetry, and extended the disposable PostgreSQL proof.
- PASS: final independent full-checklist re-audit
  `bcb-s5-3-write-chokepoint-reaudit2-20260719-1324`. It confirmed the ports/repositories/DI boundary, one atomic
  UoW, post-commit mirror sync, registry-limited explicit bypass, exactly one VAPID/payment projection audit with no
  credential-shaped fields, preserved OAuth/SMS/manual trigger behavior, bounded PII-free telemetry, backward-
  compatible admin API behavior, ordered repeat-safe migration source and no S5-4+ scope growth.
- The final auditor could not rerun the disposable PostgreSQL smoke inside its read-only sandbox, but inspected its
  exact assertions. The post-correction executor had already run that smoke successfully against a private PostgreSQL
  16 cluster; it was not repeated after the unchanged read-only audit. No full CI was repeated after the green S5-2
  milestone CI.
- Non-blocking recommendations retained for later review: a DB-side allowlist could additionally harden the
  application-only trigger-bypass invariant, and the in-memory runtime adapter remains a minimal dev/test stub.
  Neither is an S5-3 owner-checklist requirement or a production-path failure.
