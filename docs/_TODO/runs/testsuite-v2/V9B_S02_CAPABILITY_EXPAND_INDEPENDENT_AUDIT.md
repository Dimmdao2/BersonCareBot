# V9B S02 — independent capability-expand audit

## Scope and oracle

- Candidate: `wt/v9b-s02-capability-expand`, audit started at `dad56e5da`.
- Product candidate commit: `ddab86eda` (`feat(db): expand V9b S02 capability seams #1081`).
- Authority: `V9B_IMPLEMENTATION_SLICES.md` S02 and its 29 capability/ACL plus nine global/no-RLS rows; worker brief `V9B_S02_CAPABILITY_EXPAND_BRIEF.md`; `AGENTS.md` §§1, 5, 10, 24.
- Method: dispositions and scope fence by inspection; journal/Drizzle/static smokes and existing disposable A0 replay as executable checks. A0 is DDL/ledger evidence only, not an ACL/RLS or actor proof.

## Blind authority matrix — written before reading `0306`

The following is the complete independent checklist, transcribed from authority before inspecting the candidate migration. `Result` is intentionally pending at this point.

| # | Authority row | Required S02 disposition | Result |
| ---: | --- | --- | --- |
| 1 | `auth_rate_limit_events` | reuse existing exact accessor | pending |
| 2 | `booking_calendar_map` | prove relation absent; assertion only | pending |
| 3 | `channel_link_secrets` | reuse exact claim-token function | pending |
| 4 | `email_challenges` | exact normalized-email accessor | pending |
| 5 | `email_otp_locks` | exact email-OTP-lock accessor | pending |
| 6 | `email_send_cooldowns` | exact normalized-email cooldown accessor | pending |
| 7 | `idempotency_keys` | public exact request-key capability; reuse scheduler role | pending |
| 8 | `integration_webhook_error_events` | exact health-read capability | pending |
| 9 | `integration_webhook_last_status` | exact health-status capability | pending |
| 10 | `integrator_push_outbox` | dedicated push-worker capability | pending |
| 11 | `login_tokens` | exact lookup/revoke capability | pending |
| 12 | `operator_health_alert_sent` | exact health-marker capability | pending |
| 13 | `operator_incidents` | reuse delivery functions; exact admin-health port | pending |
| 14 | `outgoing_delivery_queue` | reuse delivery role and scope resolver | pending |
| 15 | `password_altcha_challenges` | verify existing exact password functions | pending |
| 16 | `password_login_identifier_protection` | verify existing exact identifier function | pending |
| 17 | `phone_challenges` | reuse exact phone-challenge capability | pending |
| 18 | `phone_messenger_bind_secrets` | reuse exact bind-secret consume seam | pending |
| 19 | `phone_otp_locks` | reuse normalized-phone lock seam | pending |
| 20 | `reference_catalog_snapshot_receipts` | reuse seed definer seam | pending |
| 21 | `specialist_signup_intents` | verify specialist-provisioning definer | pending |
| 22 | `staff_security_profiles` | reuse self-scoped security functions | pending |
| 23 | `user_email_setup_tokens` | exact platform-ops cleanup capability | pending |
| 24 | `user_oauth_bindings` | reuse patient boolean; exact platform-ops seam | pending |
| 25 | `user_passkey_accounts` | verify existing exact passkey function API | pending |
| 26 | `user_passkey_challenges` | verify existing exact passkey function API | pending |
| 27 | `user_passkey_credentials` | verify existing exact passkey function API | pending |
| 28 | `user_password_credentials` | reuse patient boolean; exact password setup/reset seam | pending |
| 29 | `user_pins` | reuse exact set/verify PIN accessor | pending |
| 30 | `booking_cities` | bounded public/patient catalog read capability | pending |
| 31 | `clinical_test_measure_kinds` | add three exact catalog definers with route-principal EXECUTE | pending |
| 32 | `media_playback_stats_hourly` | operational retention `SELECT`/`DELETE` only | pending |
| 33 | `reference_catalog_baselines` | reuse existing seed/baseline capability | pending |
| 34 | `saas_isolation_coverage_runs` | reuse isolation operator capability | pending |
| 35 | `saas_isolation_event_hourly` | reuse isolation operator capability | pending |
| 36 | `saas_isolation_events` | reuse isolation operator capability | pending |
| 37 | `schema_migrations` | assert migrator-only | pending |
| 38 | `webapp_schema_migrations` | assert migrator-only | pending |

**Count:** 38 rows (29 capability/ACL + 9 global/no-RLS), from the authority tables above.

## Inspection and executable evidence

### 38/38 disposition review

All entries below were compared to the pre-`0306` migration/code location named in the worker report and to the candidate diff `4e336d856..ddab86eda`. `reuse` means no duplicate definition was added. `expand` names the exact new `0306` symbol or role ACL.

| # | Authority row | Disposition independently verified |
| ---: | --- | --- |
| 1 | `auth_rate_limit_events` | PASS — reuse `0254` `app.auth_rate_limit_*` exact accessors. |
| 2 | `booking_calendar_map` | PASS — absent relation; no schema/runtime caller and no replacement relation. |
| 3 | `channel_link_secrets` | PASS — reuse `0258` `app.auth_channel_link_{read_secret,mark_secret_used_if_unused}`. |
| 4 | `email_challenges` | PASS — reuse `0247`/`0249` exact email-challenge accessors. |
| 5 | `email_otp_locks` | PASS — reuse `0248` `app.email_auth_{find,register,reset}_email_otp_lock*`. |
| 6 | `email_send_cooldowns` | PASS — expand only `app.read_reminder_transactional_email_cooldown(uuid)` and `app.record_reminder_transactional_email_cooldown(uuid)`; both pin the fixed reminder key. |
| 7 | `idempotency_keys` | PASS — reuse existing public health capability and scheduler role; no new table ACL. |
| 8 | `integration_webhook_error_events` | PASS — reuse `0190` `app.read_curated_system_health()`. |
| 9 | `integration_webhook_last_status` | PASS — reuse `0190` `app.read_curated_system_health()`. |
| 10 | `integrator_push_outbox` | PASS — expand only `GRANT SELECT, UPDATE` to `app_operational_delivery_worker`. |
| 11 | `login_tokens` | PASS — reuse `0258` `app.auth_login_token_*`. |
| 12 | `operator_health_alert_sent` | PASS — reuse existing health/delivery functions; no general writer. |
| 13 | `operator_incidents` | PASS — reuse `app.operator_incident_alert_already_sent`, `app.mark_operator_incident_alert_sent`, and `app.resolve_outgoing_delivery_scope`. |
| 14 | `outgoing_delivery_queue` | PASS — reuse existing delivery role and `app.resolve_outgoing_delivery_scope(uuid)`. |
| 15 | `password_altcha_challenges` | PASS — reuse `0274` `app.password_login_*`. |
| 16 | `password_login_identifier_protection` | PASS — reuse `0274` `app.password_login_acquire(text,text,uuid,text)`. |
| 17 | `phone_challenges` | PASS — reuse `0252` `app.phone_challenge_store_*`. |
| 18 | `phone_messenger_bind_secrets` | PASS — reuse `0258` exact channel-link consume functions. |
| 19 | `phone_otp_locks` | PASS — reuse `0252` `app.phone_auth_*otp_lock*`. |
| 20 | `reference_catalog_snapshot_receipts` | PASS — reuse `0182`–`0184` seed/baseline definers. |
| 21 | `specialist_signup_intents` | PASS — reuse specialist-provisioning definer, including `app.reserve_specialist_signup_slug(uuid,text)`. |
| 22 | `staff_security_profiles` | PASS — reuse `0215`/`0256` self-scoped functions. |
| 23 | `user_email_setup_tokens` | PASS — reuse `0258` exact cleanup functions. |
| 24 | `user_oauth_bindings` | PASS — reuse current-patient boolean and exact platform operations seams; no raw patient read. |
| 25 | `user_passkey_accounts` | PASS — reuse `0276` passkey account functions. |
| 26 | `user_passkey_challenges` | PASS — reuse `0276` passkey challenge functions. |
| 27 | `user_passkey_credentials` | PASS — reuse `0276` passkey credential functions. |
| 28 | `user_password_credentials` | PASS — reuse existing boolean and `0274` setup/reset capability. |
| 29 | `user_pins` | PASS — reuse `0258` exact set/verify functions; no hash-read seam. |
| 30 | `booking_cities` | PASS — add only `app.list_active_booking_cities()`; EXECUTE to `app_patient` and `app_staff`. |
| 31 | `clinical_test_measure_kinds` | PASS — add only `app.list_clinical_test_measure_kinds()`, `app.upsert_clinical_test_measure_kind_by_label(text)`, and `app.save_clinical_test_measure_kinds(jsonb)`; list/upsert is doctor/platform-only and save is platform-only. |
| 32 | `media_playback_stats_hourly` | PASS — add only `GRANT SELECT, DELETE` to `app_operational_media_worker`. |
| 33 | `reference_catalog_baselines` | PASS — reuse `0183` baseline/seed capability. |
| 34 | `saas_isolation_coverage_runs` | PASS — reuse `0185` operator diagnostics path. |
| 35 | `saas_isolation_event_hourly` | PASS — reuse `0185` operator diagnostics path. |
| 36 | `saas_isolation_events` | PASS — reuse `0185` operator diagnostics path. |
| 37 | `schema_migrations` | PASS — migrator-only assertion; `0306` adds no runtime ACL. |
| 38 | `webapp_schema_migrations` | PASS — migrator-only assertion; `0306` adds no runtime ACL. |

The per-family matrix is **38/38 PASS by inspection**; no aggregate has substituted for a row review.

### Migration, SECURITY DEFINER, and scope fence

- `0306` is the sole candidate migration; its first line is the required temporary marker. `_journal.json` has `idx: 306`, tag `0306_v9b_capability_seams_local`, and `when: 1793539230007`, strictly after `0305`'s `1793539230006`.
- The six added/replaced definers are at `0306:12-167`. Each has `SECURITY DEFINER`, `SET search_path = pg_catalog`, an explicit `ALTER FUNCTION ... OWNER TO app_owner`, qualified `public.*` relations, and `REVOKE ... FROM PUBLIC` before exact role grants. No function uses dynamic SQL.
- The three catalog functions access true-global catalogs, so an organization predicate would be false scope; the two reminder functions restrict the callable relation slice to one supplied user plus the fixed `!reminder_txn_v1` key. Only delivery-worker EXECUTE is granted for them. No definer reads a tenant relation through an owner-exempt path.
- The diff contains no `REVOKE ... ON TABLE`, `CREATE POLICY`, `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, TypeScript, table, role, `organization_id`/booking-backfill, D1 writer, S06 or S07 change. Function `REVOKE ... FROM PUBLIC` is the required function-ACL closure, not a direct-table-grant revoke.
- The sole candidate diff is four files: `0306`, its journal, the S02 status note, and the worker census report. `git diff --check 4e336d856..ddab86eda` is clean.

### Commands run

| Command | Result |
| --- | --- |
| `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` | PASS — `check-drizzle-journal-sync: OK`. |
| `DATABASE_URL='postgres://audit_no_connect@127.0.0.1:1/audit_no_connect' pnpm --dir apps/webapp exec drizzle-kit check --config=drizzle.config.ts` | PASS — `Everything's fine`; unreachable URL prevents DB access. |
| `node scripts/check-no-new-raw-sql.mjs` | PASS — `integrator manifest files: 7; webapp manifest files: 22`. |
| `node scripts/check-db-chokepoint.mjs` | PASS. |
| `bash apps/webapp/scripts/check-legacy-migrations-frozen.sh` | PASS. |
| `pnpm --dir apps/webapp run lint` | PASS. |
| `pnpm --dir apps/webapp run typecheck` | PASS. |
| `node scripts/verify-a0-greenfield-baseline.mjs` | BLOCKED before migration replay: baseline restore fails at `schema.sql:24478` because role `app_platform_settings` does not exist. This is the pre-existing defect documented in `docs/ARCHITECTURE/DB_DUMPS/a0-greenfield/README.md`; `0306` is not parsed or applied. |

No existing S02-specific grant/accessor runtime smoke exists. The static gate and the row-by-row function/ACL inspection above are therefore the available evidence; the A0 command does **not** prove ACL, RLS, or actor behavior and, because it did not reach `0306`, does not prove this migration's clean DDL replay either. DEV, TEST, and PROD were not touched.

### Findings

1. **Evidence gate blocked (not a product-S02 defect):** the required existing clean-replay harness cannot restore its own baseline before running any migration, due to missing `app_platform_settings` at `docs/ARCHITECTURE/DB_DUMPS/a0-greenfield/schema.sql:24478`. Consequence: no successful clean replay evidence exists for `0306`. The defect predates the candidate and is recorded by the A0 README, but it prevents an unconditional audit PASS for the requested executable replay gate.

## Initial result before accepted harness land

**FAIL (evidence gate).** Inspection was 38/38 PASS and all prescribed static checks were green, but the
independently run old clean-migration command was blocked before `0306`; no product fix was made. At that point
the audit could not issue PASS.

## Evidence-gate closure on the accepted disposable harness

After the independently audited Б1/Б3 harness pilot (`6735dd2ae`, audit `64d082f46`) was merged into the
candidate base, the lead ran the same product PostgreSQL project on this exact branch:

```bash
pnpm --filter @bersoncare/db-principal build
pnpm --filter @bersoncare/operator-db-schema build
pnpm run test:webapp:postgres
```

Result: `exit=0`; the real webapp migrator reported `count=307` for both private file clones, so the chain reached
and applied `0306`; `3` files / `4` tests passed in `21.41s`. The harness audit already proves that A0 is clean
migration/concurrency/isolation evidence only, not an ACL/RLS or actor proof. No DEV, TEST, PROD or deploy was
used for this closure.

## Final verdict

**PASS.** The independent row/function/scope audit is 38/38 PASS, all static gates are green, and the only named
evidence blocker is now closed by a clean disposable replay through migration count `307`. S02 may merge into
`wt/single-entry-integration`; this does not authorize S03 revoke/FORCE/caller work.
