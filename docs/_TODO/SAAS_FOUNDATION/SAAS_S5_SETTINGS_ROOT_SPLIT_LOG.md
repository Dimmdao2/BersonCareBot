# S5 Settings Root Split — execution log

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

| keys | callers / principal | mechanic |
|---|---|---|
| `platform_user_merge_v2_enabled`, `integrator_linked_phone_source` | A; merge/linked-phone server | — |
| `patient_label`, `doctor_patient_support_comments_without_support_default_enabled`, `doctor_patient_support_media_without_support_default_enabled` | A, P; staff/patient | patient_app/discussion (deferred) |
| `sms_fallback_enabled` | A; derived public auth reader; staff/bootstrap | — |
| `doctor_specialist_task_reminder_channels`, `doctor_appointment_reminder_enabled`, `doctor_appointment_reminder_offsets_minutes` | A, I reminder jobs; staff/server | — |
| `debug_forward_to_admin`, `important_fallback_delay_minutes`, `operator_health_projection_thresholds` | A, R/I server operations; staff/server | — |
| `max_debug_page_enabled`, `dev_mode`, `integration_test_ids`, `test_account_identifiers` | A; diagnostics/test guard; staff | — |
| `app_base_url` | A, I links; staff/server | — |
| `support_contact_url`, `telegram_login_bot_username`, `max_login_bot_nickname`, `vk_web_login_url`, `app_display_timezone` | A, R public/auth/display; staff/bootstrap/patient | — |
| `max_bot_api_key` | A, MAX validation; server | — |
| `patient_home_daily_practice_target`, `patient_default_promo_treatment_program_template_id`, `patient_home_daily_warmup_rotation_enabled`, `patient_home_daily_warmup_rotation_times`, `patient_home_daily_warmup_repeat_cooldown_minutes`, `patient_home_mood_icons`, `notifications_topics` | A, P patient app; staff/patient | patient_app (deferred) |
| `patient_app_maintenance_enabled`, `patient_app_maintenance_message`, `video_playback_api_enabled`, `video_default_delivery`, `patient_treatment_plan_item_done_repeat_cooldown_minutes` | A, R/P patient runtime; staff/patient | patient_app (deferred) |
| `specialist_signup_enabled` | A, R public signup; staff/bootstrap | — |
| `patient_program_discussion_doctor_reply_from_log_enabled`, `patient_program_discussion_ui_enabled`, `patient_program_discussion_media_submission_enabled` | A, R/P discussion; staff/patient | discussion: setting (no entitlement copy) |
| `video_hls_pipeline_enabled`, `video_hls_new_uploads_auto_transcode`, `video_hls_reconcile_enabled`, `video_presign_ttl_seconds`, `video_watermark_enabled` | A, I media worker; staff/server | — |
| `patient_booking_url`, `booking_calendar_show_working_hours`, `booking_calendar_default_window`, `booking_calendar_default_branch_id`, `booking_calendar_default_service_id` | A, R/P booking/calendar; staff/patient | booking (deferred) |
| `booking_default_organization_id`, `booking_rubitime_bridge_enabled`, `booking_doctor_appointments_read_source`, `booking_slots_read_source` | A, I/doctor booking server; staff/server | booking (deferred) |
| `booking_payment_enabled` | A, payments service/UI; staff/patient | payments: operational setting |
| `booking_payment_providers` | A, acquiring adapter; redacted admin serialization; staff/server | payments: operational setting |
| `booking_lifecycle_notifications`, `booking_allow_doctor_unlink_past_package_sessions`, `booking_min_notice_hours`, `booking_max_consecutive_slot_hours` | A, booking server; staff/server | booking (deferred) |
| `patient_home_warmup_skip_to_next_available_enabled` | A, deprecated compatibility parser; staff | — |
| `smtp_outbound`, `web_push_vapid`, `admin_incident_alert_config`, `operator_health_alert_config` | A, I adapters/alerts; staff/server | — |
| `notif_template:created:patient`, `notif_template:created:doctor`, `notif_template:cancelled:patient`, `notif_template:cancelled:doctor`, `notif_template:rescheduled:patient`, `notif_template:rescheduled:doctor` | A, I notification templates; staff/server | — |
| `yandex_oauth_client_id`, `yandex_oauth_client_secret`, `yandex_oauth_redirect_uri` | A, auth integration; derived enabled flag; staff/server/bootstrap | — |
| `google_client_id`, `google_client_secret`, `google_redirect_uri`, `google_refresh_token`, `google_calendar_id`, `google_calendar_enabled`, `google_connected_email`, `google_oauth_login_redirect_uri` | A, calendar/auth integration; staff/server; login projection for redirect URI | — |
| `apple_oauth_client_id`, `apple_oauth_team_id`, `apple_oauth_key_id`, `apple_oauth_private_key`, `apple_oauth_redirect_uri` | A, auth integration; derived enabled flag; staff/server/bootstrap | — |
| `allowed_telegram_ids`, `allowed_max_ids`, `admin_telegram_ids`, `doctor_telegram_ids`, `admin_max_ids`, `doctor_max_ids`, `admin_phones`, `doctor_phones`, `allowed_phones` | A, server role/allowlist config; staff/server | — |

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
- PASS: `node apps/webapp/scripts/smoke-s5-1-runtime-settings-contract.mjs` — private PostgreSQL 16 cluster created
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
