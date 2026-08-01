# V9b S02 — capability seam census and expand report

Scope: `expand → adopt → contract` only. This report records the source census before
`0306`; it does not claim an ACL/RLS runtime proof. The disposable migration harness is
used only for clean DDL replay. A1/TEST actor proof remains S06/S07.

## Census method

The 38-row denominator was measured with:

```bash
awk '/^## Per-table closure matrix — 29/{s=1;next}/^## Per-table closure matrix — nine/{s=0}s&&/^\| `/{n++}END{print n}' docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES.md
awk '/^## Per-table closure matrix — nine/{s=1;next}/^## D1 pre-principal/{s=0}s&&/^\| `/{n++}END{print n}' docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES.md
```

Output: `29` and `9`, respectively (`38` total). Source locations below were resolved
before creating the migration with `code-search` followed by exact `rg` of the named
relation/function.

## 29 capability/ACL rows

| Relation | Disposition | Exact seam / ACL, or source proof |
| --- | --- | --- |
| `auth_rate_limit_events` | reuse existing seam | `0254_auth_rate_limit_action_accessors.sql`: `app.auth_rate_limit_{prune_scope,prune_key,count,record}`; functions already pin `SECURITY DEFINER`, `app_owner`, `pg_catalog`, and EXECUTE. |
| `booking_calendar_map` | relation absent — assertion only | Retired `integrator` Rubitime relation: no schema declaration or runtime caller; S06 migrator replay owns the `to_regclass('integrator.booking_calendar_map') IS NULL` assertion. |
| `channel_link_secrets` | reuse existing seam | `0258_bootstrap_auth_table_accessors.sql`: `app.auth_channel_link_{read_secret,mark_secret_used_if_unused}`. |
| `email_challenges` | reuse existing seam | `0247_email_challenge_atomic_attempts.sql` and `0249_email_challenge_purpose_binding.sql`: `app.email_auth_*email_challenge*` exact UUID accessors. |
| `email_otp_locks` | reuse existing seam | `0248_otp_decaying_lockout.sql`: `app.email_auth_{find,register,reset}_email_otp_lock*`. |
| `email_send_cooldowns` | add exact seam | `0306_v9b_capability_seams_local.sql`: `app.read_reminder_transactional_email_cooldown(uuid)` and `app.record_reminder_transactional_email_cooldown(uuid)` bind the delivery worker to one supplied user and the fixed `!reminder_txn_v1` key. |
| `idempotency_keys` | reuse existing seam | Public health reads are already bounded by `0190_curated_system_health_diagnostics.sql` `app.read_curated_system_health()`; `integrator.idempotency_keys` remains the C4 scheduler ACL, not this public relation. S04 adopts the request-key caller before the public direct grant is contracted. |
| `integration_webhook_error_events` | reuse existing seam | `0190_curated_system_health_diagnostics.sql`: `app.read_curated_system_health()` exposes aggregate diagnostic output only. |
| `integration_webhook_last_status` | reuse existing seam | `0190_curated_system_health_diagnostics.sql`: `app.read_curated_system_health()` returns the curated status projection without table EXECUTE. |
| `integrator_push_outbox` | expand exact ACL | `0306_v9b_capability_seams_local.sql`: `GRANT SELECT, UPDATE ... TO app_operational_delivery_worker`; no tenant role, queue insert, or direct-grant revoke. |
| `login_tokens` | reuse existing seam | `0258_bootstrap_auth_table_accessors.sql`: `app.auth_login_token_{read,expire_past,confirm,mark_session_issued}`. |
| `operator_health_alert_sent` | reuse existing seam | `0190_curated_system_health_diagnostics.sql`: `app.read_curated_system_health()` exposes only `digest.last_sent_at`; marker writes remain the existing health path. |
| `operator_incidents` | reuse existing seam | `0229_operator_incident_alert_claims.sql` / `0260_outgoing_delivery_scope_text_ids.sql`: `app.operator_incident_alert_already_sent`, `app.mark_operator_incident_alert_sent`, and `app.resolve_outgoing_delivery_scope`. |
| `outgoing_delivery_queue` | reuse existing seam | `0260_outgoing_delivery_scope_text_ids.sql`: `app.resolve_outgoing_delivery_scope(uuid)` is owned by `app_owner`, pinned to `pg_catalog`, and EXECUTE is delivery-worker-only. |
| `password_altcha_challenges` | reuse existing seam | `0274_password_login_atomic_admission_altcha.sql`: `app.password_login_{read_altcha_secret,issue_altcha_challenge,acquire,complete}`. |
| `password_login_identifier_protection` | reuse existing seam | `0274_password_login_atomic_admission_altcha.sql`: `app.password_login_acquire(text,text,uuid,text)`. |
| `phone_challenges` | reuse existing seam | `0252_patient_action_accessors.sql`: `app.phone_challenge_store_{upsert,read,delete,increment_attempts}`. |
| `phone_messenger_bind_secrets` | reuse existing seam | `0258_bootstrap_auth_table_accessors.sql`: exact opaque-token `app.auth_channel_link_*` accessors. |
| `phone_otp_locks` | reuse existing seam | `0252_patient_action_accessors.sql`: `app.phone_auth_{find_otp_lock,register_otp_lockout,reset_otp_lockout}`. |
| `reference_catalog_snapshot_receipts` | reuse existing seam | `0182/0183/0184`: `app.seed_reference_catalog_snapshot(uuid)` plus insert-hook seed function. |
| `specialist_signup_intents` | reuse existing seam | `0257_specialist_signup_slug_reservation.sql` and existing provisioning definer: `app.reserve_specialist_signup_slug(uuid,text)`. |
| `staff_security_profiles` | reuse existing seam | `0215_staff_security_profiles.sql` / `0256_staff_security_self_password_hash.sql`: self-scoped security profile/password functions. |
| `user_email_setup_tokens` | reuse existing seam | `0258_bootstrap_auth_table_accessors.sql`: `app.auth_email_setup_{revoke_active,insert,delete,read,mark_used}`. |
| `user_oauth_bindings` | reuse existing seam | `0258_bootstrap_auth_table_accessors.sql`: `app.auth_oauth_{list_user_providers,find_user,upsert_binding}`; patient raw binding reads stay absent. |
| `user_passkey_accounts` | reuse existing seam | `0276_patient_passkeys.sql`: `app.passkey_get_or_create_account` / `app.passkey_list_current_credentials`. |
| `user_passkey_challenges` | reuse existing seam | `0276_patient_passkeys.sql`: `app.passkey_issue_challenge` / `app.passkey_read_challenge`. |
| `user_passkey_credentials` | reuse existing seam | `0276_patient_passkeys.sql`: `app.passkey_{read_credential,complete_registration,complete_authentication,delete_current_credential}`. |
| `user_password_credentials` | reuse existing seam | `0274_password_login_atomic_admission_altcha.sql`: `app.password_credentials_{replace_self,upsert_self}` and the existing boolean access gate. |
| `user_pins` | reuse existing seam | `0258_bootstrap_auth_table_accessors.sql`: `app.auth_user_pin_{read,upsert,increment_failed,reset_attempts}`; no hash list seam exists. |

## Nine global/no-RLS rows

| Relation | Disposition | Exact seam / ACL, or source proof |
| --- | --- | --- |
| `booking_cities` | add exact seam | `0306_v9b_capability_seams_local.sql`: `app.list_active_booking_cities()`; `EXECUTE` only to `app_patient` and `app_staff`. |
| `clinical_test_measure_kinds` | add exact seams | `0306_v9b_capability_seams_local.sql`: `app.list_clinical_test_measure_kinds()`, `app.upsert_clinical_test_measure_kind_by_label(text)`, `app.save_clinical_test_measure_kinds(jsonb)`; list/upsert to doctor/platform principals, bulk save only to `app_platform_settings`. |
| `media_playback_stats_hourly` | expand exact ACL | `0306_v9b_capability_seams_local.sql`: `GRANT SELECT, DELETE ... TO app_operational_media_worker`; the existing patient telemetry function in `0189_patient_runtime_cooldown_playback_accessors.sql` is unchanged. |
| `reference_catalog_baselines` | reuse existing seam | `0183_reference_catalog_snapshot_receipts.sql`: `app.get_public_reference_baseline(text)` and the existing seed capability. |
| `saas_isolation_coverage_runs` | reuse existing seam | `0185_saas_isolation_diagnostics.sql` plus `deploy/postgres/saas-isolation-telemetry.sql`; operator-only diagnostics path. |
| `saas_isolation_event_hourly` | reuse existing seam | `0185_saas_isolation_diagnostics.sql` plus `deploy/postgres/saas-isolation-telemetry.sql`; operator-only diagnostics path. |
| `saas_isolation_events` | reuse existing seam | `0185_saas_isolation_diagnostics.sql` plus `deploy/postgres/saas-isolation-telemetry.sql`; operator-only diagnostics path. |
| `schema_migrations` | migrator-only — assertion only | `apps/integrator/src/infra/db/migrate.ts` is the sole caller named by authority; no S02 runtime role or grant is added. |
| `webapp_schema_migrations` | migrator-only — assertion only | Drizzle journal/migrator bookkeeping only; `0306` adds no runtime principal or grant. |

## S02 boundary retained

`0306` does not contain `REVOKE ... ON TABLE`, `CREATE POLICY`, `ENABLE ROW LEVEL SECURITY`,
`FORCE ROW LEVEL SECURITY`, or TypeScript caller adoption. It creates no role, table, or second
D1 identity writer. The next allowed change for every listed direct path remains S04 adoption,
followed there by its contract revokes.
