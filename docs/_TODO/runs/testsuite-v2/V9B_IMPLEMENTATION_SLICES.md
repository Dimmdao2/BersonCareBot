# В9б — исполнимые slices tenant-wall

Статус: **revised docs-only plan; S04+ audit correction applied**. Этот round не меняет product code, миграции,
DB/DEV/TEST/PROD, deploy, taskdb или checkbox. `V9B_IMPLEMENTATION_SLICES_REAUDIT_REPORT.md` с
`9/9 PASS` superseded для S04+ decomposition и не является gate этого плана; он сохраняется только как
историческое evidence тех RF1/RF2 portions, которые фактически аудировал.

## Цель и источник фактов

Оракул В9б: `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md` — **данные недостижимы без
принципала**, и это доказано прогоном: маршрут без принципала не получает данных ни по одному
пути. Маршрутный guard остаётся UX-отказом; security boundary — единый DB port + exact
capability либо `ENABLE` + `FORCE RLS` с одинаковыми `USING` / `WITH CHECK`.

`p0-5b-grants-sql.mjs` — source-level baseline текущих grants, не заменяет TEST
introspection. В нём `app_staff` получает full DML на tiered table, кроме
`migrationOnlyTables`, `overlayManagedAppStaffTables` и retired Rubitime set; `app_patient`
получает только curated bootstrap grants. Overlay `c4-*` уже задаёт пять узких operational
contours, а `integrator-login-public-identity-grants.sql` — bare NOINHERIT integrator-login
overlay. Перед каждым implementation land worker обязан сверить эту baseline с фактическими
`information_schema.role_table_grants`, `pg_proc`, `pg_auth_members` и `pg_roles`; расхождение
— технический blocker, не повод вернуть broad grant.

Для tenant tables contract сохраняет/выдаёт `app_staff` и `app_patient` те table verbs, которые
нужны их разрешённому пути; `ENABLE` + `FORCE RLS` ограничивают строки одинаковыми `USING` / `WITH
CHECK`. Здесь `direct table deny` означает один из трёх случаев: bare login без нужной role не имеет
grant; foreign/no-principal row отказывает через RLS; capability-only/global table не имеет tenant
table grant и разрешает только named capability. Это не означает, что у staff/patient исчезают все
table grants на tenant tables. `A1` — disposable `check:saas-a1-rls-conformance`; `TEST` повторяет
тот же `<table>.<actor>.<verb>` на named non-owner TEST login. `app_owner`/migrator никогда не
являются evidence actor.

## Deployable порядок и семь файлов

Каждый land остаётся рабочим сам по себе:

1. **expand — S02 и S04-E, migrations:** создать/reuse exact `SECURITY DEFINER` seams и `EXECUTE` /
   existing narrow operational-role grants. Каждый expand-only land не отзывает table ACL, не включает
   RLS/FORCE и не меняет caller.
2. **adopt — S04 code families:** S03 добавляет/stamps booking ownership; каждая S04 family переводит
   только свой named file scope на уже существующий либо S04-E seam и доказывает этот путь. S04 не
   создаёт второй D1 writer.
3. **contract + policy — S05a/S05b/S05c migrations:** global/capability ACL можно отозвать после
   green adoption, но direct ACL tenant table отзывается только в том же S05 land, что ставит её
   grants/policies/FORCE. Поэтому ни один отдельный S04 contract land не может забрать у staff/patient
   работающий table path до готовой policy.

| Migration assignment | Status / count | Содержимое и binary prerequisite |
| --- | ---: | --- |
| S01 | accepted / 1 | Remove exactly five legacy booking projections/FKs/grants after board reservation. |
| S02 expand | accepted / 1 | Capability definitions/reused function ACL and narrow role ACL only; no caller-breaking revoke. |
| S03 | accepted / 1 | Nullable booking `organization_id`, deterministic backfill and transactional abort. |
| S04-E expand | pending / 1 | Missing exact capabilities only: public idempotency, signed D1 bootstrap membership/identity, booking/appointment exceptional operations, and operator writes; no caller change/revoke/policy. Reserve its number on the common board immediately before the file is created. |
| S05a | pending / 1 | After every S05a-table family is green, atomically install identity/preferences tenant-role verbs, policies/FORCE and revoke bare-login/unscoped direct ACL. |
| S05b | pending / 1 | After every S05b-table family is green, atomically install booking tenant-role verbs, policies/FORCE and revoke bare-login/unscoped direct ACL. |
| S05c | pending / 1 | After every S05c-table family is green, atomically install membership/analytics tenant-role verbs, policies/FORCE and revoke bare-login/unscoped direct ACL; it also contracts adopted global/capability rows not owned by S05a/b. |

Thus the count is **7**, derived from the table above (`awk`/manual row count: 7), rather than a
pre-reserved claim. The pending S04-E number is not reserved by this document: every number is reread from
`docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` and reserved there immediately before creating
its file.

## Per-table closure matrix — ten FORCE rows

| Table | Current source-level grants / role | Live callers | Exact seam and implementing slice | Contract / policy owner column | A1 and TEST oracle |
| --- | --- | --- | --- | --- | --- |
| `patient_bookings` | `app_staff` broad tier; no FORCE | `pgPatientBookings`, `pgAppointmentProjection`, `canonicalCreate`, `pgChannelLinkClaim`, payment and merge/purge paths | S03 stamps `organization_id`; S04 converts ID/public/integrator/merge paths to signed exact booking or platform-ops capability; patient history stays `app.read_current_patient_booking_rows` | S05b atomically sets the required tenant-role verbs and staff `organization_id = app.current_org_id()`, patient `platform_user_id = app.current_patient_user_id()` policies/FORCE; bare/unscoped access is revoked | `no_principal`, patient A/B and staff org A/B `SELECT/INSERT/UPDATE/DELETE`; same actual TEST staff/nonstaff logins |
| `appointment_records` | `app_staff` broad tier; no FORCE | `pgAppointmentProjection`, admin soft-delete route, `pgDoctorClients`, integrator admin stats, merge/purge | S03 stamps `organization_id`; S04 exact integrator-record and staff-delete capability | S05b atomically sets the required tenant-role verbs and the same `organization_id` / `platform_user_id` policies/FORCE; bare/unscoped access is revoked | Same four verbs; exact record capability succeeds only for signed record, foreign record denies |
| `be_organization_members` | `app_staff` tier; D1 overlay bare-login `SELECT` | `pgOrganizationMembership`, `pgOrganizationInvites`, `seatUsageSql`, integrator org resolvers/reminders/message threads | S02 exact bootstrap membership lookup; S04 moves integrator/bootstrap callers to it | S05c atomically retains required staff table verbs and sets staff `organization_id = app.current_org_id()` policies/FORCE; bootstrap has no table grant | staff A reads/mutates own org only; `bootstrap_direct_table` denies and `bootstrap_exact_capability` returns only exact membership |
| `platform_users` | `app_staff` broad; `app_patient SELECT` + restricted updates; D1 bare-login overlay `SELECT/INSERT/UPDATE` | D1 writer, `pgUserProjection`, channel/phone repos, merge/purge, reminder/support direct writers | S04 adopts existing `writeIdentityAndPreferencesDirect.ts` under exact pre-principal integrator capability; other cross-user operations use exact platform-ops capability | S05a atomically retains the required tenant-role verbs and sets patient `id = app.current_patient_user_id()`, staff via active current-org enrollment/member relation policies/FORCE; D1/bare unscoped ACL is revoked | patient self vs B; staff current-org relation; D1 `exact_capability` upsert only; bare integrator direct table denies |
| `product_analytics_hourly` | `app_staff` broad; existing web-push role `SELECT/INSERT/UPDATE` | `pgProductAnalytics`, retention module, web-push reminder | S02 retains only named web-push operational role; S04 moves retention to its function/role seam | S05c atomically retains required staff table verbs and sets staff `organization_id = app.current_org_id()` policies/FORCE; null-org is platform analytics capability only | staff cannot read null/B-org; web-push may operate only installed org partition; direct table for its base login denies |
| `user_channel_bindings` | `app_staff` broad; `app_patient SELECT`; D1 bare-login `SELECT/INSERT` | D1 writer, channel users/by-channel/bot-blocked, support writer, webapp bindings/merge/purge | S04 uses the same D1 writer and exact channel lookup/cross-user operational seam | S05a atomically retains the required tenant-role verbs and sets owner `user_id = app.current_patient_user_id()` policies/FORCE; bare D1/unscoped grants are revoked | patient own row only; D1 exact insert/read only its signed identity; no direct bare table access |
| `user_channel_preferences` | `app_staff` broad; `app_patient SELECT` plus restricted insert/update; D1 bare-login `SELECT/INSERT/UPDATE` | D1 writer, `pgChannelPreferences`, broadcasts, `pgDoctorClients`, profile model | S04 adopts D1 writer and existing patient preference port; cross-user delivery only operational seam | S05a atomically retains the required tenant-role verbs and sets owner `platform_user_id = app.current_patient_user_id()` policies/FORCE; bare D1/unscoped ACL is revoked | own preference DML; foreign user and direct bootstrap deny; operational role only its assigned reminder relation |
| `user_notification_topic_channels` | `app_staff` broad; `app_patient SELECT/INSERT/UPDATE` | patient unsubscribe, reminder model/disable port, merge/purge | S02/S04 exact patient notification port; delivery uses named operational seam | S05a atomically retains the required tenant-role verbs and sets owner `user_id = app.current_patient_user_id()` policies/FORCE; unscoped ACL is revoked | patient self DML only; foreign/D1 bare/operational direct table deny unless listed role path |
| `user_notification_topics` | `app_staff` broad; `app_patient SELECT/INSERT/UPDATE`; D1 bare-login `INSERT/UPDATE` | D1 writer, `pgUserProjection`, reminder gate, patient notification port, merge/purge | S04 uses existing D1 writer for exact identity and patient notification port for self edits | S05a atomically retains the required tenant-role verbs and sets owner `user_id = app.current_patient_user_id()` policies/FORCE; D1/bare unscoped ACL is revoked | D1 exact topic upsert succeeds, bare table denied; patient A cannot modify B |
| `user_web_push_subscriptions` | `app_staff` broad; `app_patient SELECT/INSERT/UPDATE/DELETE`; web-push operational `SELECT` | `pgWebPushSubscriptions`, broadcast counts/`pgDoctorClients`, reminder stats, merge/purge | S02 retains only `app_operational_web_push_reminder`; S04 moves delivery/cross-user reads to that role/seam | S05a atomically retains the required tenant-role verbs and sets owner `user_id = app.current_patient_user_id()` policies/FORCE; bare/unscoped access is revoked | self `SELECT/INSERT/UPDATE/DELETE`; operational selected rows only by reminder/org relation; base login direct deny |

All S05 staff predicates use the existing `app.current_org_id()`; patient predicates use the
row's declared `platform_user_id` or `user_id` with `app.current_patient_user_id()`. `WITH CHECK`
is identical to `USING`; a missing helper or a `NULL` principal denies. S05a cannot land until D1
adoption tests below are green; it then performs the final bare-login revoke and its A1
exact-capability/direct-deny proof atomically with the policy/FORCE.

## Per-table closure matrix — 29 capability/ACL rows

`Current` says source-level role state, which S02 validates live before changing it: **staff DML** =
generated broad `app_staff` tier; **overlay** = excluded from that generator and owned by an existing
function/overlay; **none** = retired/absent or no runtime direct grant. Each global/capability
revoke below is in S05c after its named adoption, never an S02 expand or standalone S04 contract.

| Table | Current grants / roles | Live caller family | Exact seam → slice/adoption | Revoke land and final actor+verb oracle |
| --- | --- | --- | --- | --- |
| `auth_rate_limit_events` | staff DML | auth rate limiter | existing `0254_auth_rate_limit_action_accessors` → S02 reuse, caller S04 | revoke staff; `no_principal.SELECT` deny, `auth_exact_key.INSERT/UPDATE` only accessor |
| `booking_calendar_map` | none: retired `integrator` Rubitime table | none (registry only) | no seam; S02 proves absent via `to_regclass` | no revoke file against absent relation; TEST migrator confirms absent/no runtime grant |
| `channel_link_secrets` | staff DML | `pgChannelLinkClaim`, merge | existing exact claim token function → S02; S04 caller | revoke staff; `claim_foreign_token.SELECT` fails, exact token consume succeeds |
| `email_challenges` | staff DML | email-password forgot, email setup port | exact normalized email challenge accessor → S02/S04 | revoke staff; `email_exact_key.SELECT/INSERT` capability only |
| `email_otp_locks` | staff DML | `pgEmailAuth`, email auth service | exact email OTP lock accessor → S02/S04 | revoke staff; `email_exact_key.UPDATE` only |
| `email_send_cooldowns` | staff DML | transactional email cooldown repo | exact normalized email cooldown accessor → S02/S04 | revoke staff; service `INSERT/UPDATE` only through accessor |
| `idempotency_keys` | public staff DML; integrator scheduler role already exact on `integrator.idempotency_keys` | webapp `pgStore`; integrator idempotency repo/routes | split by schema: webapp exact request-key capability, integrator scheduler existing role → S02/S04 | revoke public staff; scheduler `SELECT/INSERT/UPDATE/DELETE` only `integrator.idempotency_keys`; foreign key deny |
| `integration_webhook_error_events` | staff DML | health guard/operator-health port | exact health read capability → S02/S04 | revoke staff; diagnostic `SELECT` only capability, no tenant login verb |
| `integration_webhook_last_status` | staff DML | operator-health port | exact health status capability → S02/S04 | revoke staff; diagnostic `SELECT` only capability |
| `integrator_push_outbox` | staff DML | push worker/tick/health guard/reminders | dedicated push worker capability, not tenant role → S02/S04 | revoke staff; operational assigned queue `SELECT/UPDATE`, direct tenant deny |
| `login_tokens` | staff DML | admin phone utility, purge, merge | exact token lookup/revoke capability → S02/S04 | revoke staff; exact token `SELECT/DELETE` only platform-ops capability |
| `operator_health_alert_sent` | staff DML | health collector | exact health marker capability → S02/S04 | revoke staff; diagnostic `SELECT/INSERT` capability only |
| `operator_incidents` | staff DML; delivery functions already definer | health tick/admin routes, delivery failure reporter | existing `app.operator_incident_alert_already_sent` / `mark_operator_incident_alert_sent` plus exact admin health port → S02/S04 | revoke staff; delivery capability functions only; admin exact incident verb, arbitrary tenant deny |
| `outgoing_delivery_queue` | staff DML; `app_operational_delivery_worker SELECT/UPDATE` | integrator delivery repo/pipeline, doctor broadcast, health metrics | existing delivery role plus `app.resolve_outgoing_delivery_scope` → S02/S04 | revoke staff; delivery `SELECT/UPDATE` assigned queue; every other operational role direct deny |
| `password_altcha_challenges` | overlay, no broad staff | password admission flow | existing password exact challenge functions → S02/S04 verification only | retain deny; `password_exact_key.SELECT/INSERT` function only |
| `password_login_identifier_protection` | overlay, no broad staff | password admission flow | existing identifier-protection function → S02/S04 verification | retain deny; exact identifier function only |
| `phone_challenges` | staff DML | phone challenge store, public booking OTP, admin utility | existing exact phone challenge capability → S02/S04 | revoke staff; phone proof `SELECT/INSERT/UPDATE` only capability |
| `phone_messenger_bind_secrets` | staff DML | `pgPhoneMessengerBind` | existing exact bind-secret consume seam → S02/S04 | revoke staff; exact secret `SELECT/DELETE` only capability |
| `phone_otp_locks` | staff DML | `pgPhoneOtpLimits`, public booking rate limit/OTP | existing normalized phone lock seam → S02/S04 | revoke staff; exact phone `INSERT/UPDATE` only capability |
| `reference_catalog_snapshot_receipts` | overlay, no broad staff | none outside seed infrastructure | existing `0182/0183/0184` definer seed seam → S02 evidence | retain deny; seed definer `INSERT/SELECT`, tenant `SELECT` deny |
| `specialist_signup_intents` | overlay, no broad staff | `pgOrganizationProvisioning` | existing specialist provisioning definer → S02/S04 verification | retain deny; verified signup `INSERT/UPDATE` function only |
| `staff_security_profiles` | overlay, patient already revoked | role/session security routes | existing `0215` / `0256` self-scoped functions → S02/S04 | retain direct deny; authenticated staff self function `SELECT/UPDATE` only |
| `user_email_setup_tokens` | staff DML | full purge | platform-ops exact user cleanup capability → S02/S04 | revoke staff; platform-ops exact user `DELETE` only |
| `user_oauth_bindings` | app_patient direct `SELECT` is explicitly revoked; staff DML | platform access gate, merge/purge/admin utility | existing `app.current_patient_has_web_oauth_binding()` plus platform-ops exact seam → S02/S04 | revoke remaining staff; patient boolean function only, no raw binding read |
| `user_passkey_accounts` | overlay, no broad staff | passkey functions (no TS direct table caller) | existing passkey exact function API → S02 verification | retain deny; passkey account function verb only |
| `user_passkey_challenges` | overlay, no broad staff | passkey functions (no TS direct table caller) | existing passkey exact function API → S02 verification | retain deny; challenge exact-key function only |
| `user_passkey_credentials` | overlay, no broad staff | passkey functions (no TS direct table caller) | existing passkey exact function API → S02 verification | retain deny; credential exact key function only |
| `user_password_credentials` | app_patient already revoked; staff DML | email password lookup/setup, forgot route, merge | `app.current_patient_has_password_credentials()` plus exact password setup/reset seam → S02/S04 | revoke staff; patient boolean and verified reset `SELECT/INSERT/UPDATE` functions only |
| `user_pins` | staff DML; patient `SELECT/INSERT` + `pin_hash UPDATE` | PIN profile/API, merge/purge/admin utility | existing exact set/verify PIN accessor → S02/S04 | revoke patient/staff direct; patient `set/verify` capability only, never hash SELECT |

S04 manifest is the union of the caller families above: the named existing repos/routes plus their
module ports/tests, not only booking paths. A worker may replace a listed seam only after proving an
existing one cannot carry that caller's exact input/result; a second general writer is prohibited.

## Per-table closure matrix — nine global/no-RLS rows

| Table | Current grants / roles | Live caller | Final allow/deny contract and slice | Binary A1 / TEST oracle |
| --- | --- | --- | --- | --- |
| `booking_cities` | staff DML | patient help address link | S02 removes tenant direct grant; catalog read becomes bounded public/patient catalog capability, no RLS | patient catalog `SELECT` only; `INSERT/UPDATE/DELETE` deny |
| `clinical_test_measure_kinds` | staff DML (current overlays already revoke staff `UPDATE/DELETE`; platform catalog role has `SELECT/UPDATE`) | `GET/POST/PATCH /api/doctor/measure-kinds` → `buildAppDeps().measureKinds` → `pgClinicalTestMeasureKindsPort` (`SELECT`, idempotent label `SELECT/INSERT`, bulk `UPDATE`) | S02 expands three `SECURITY DEFINER` catalog seams — `app.list_clinical_test_measure_kinds()`, `app.upsert_clinical_test_measure_kind_by_label(text)`, `app.save_clinical_test_measure_kinds(jsonb)` — with `EXECUTE` only for the doctor/platform route principals; S04 changes that port to those seams and proves GET/POST/PATCH adoption, then S05c revokes every remaining direct table ACL | Before S05c contract the live route remains on its current direct ACL; after it, direct table `SELECT/INSERT/UPDATE/DELETE` deny for staff/patient/bare roles and only the three catalog capabilities allow their assigned operation |
| `media_playback_stats_hourly` | staff DML | playback hourly retention/internal route | S02 operational retention capability, no tenant grant | retention `SELECT/DELETE` assigned retention verb; staff/patient direct deny |
| `reference_catalog_baselines` | overlay, no broad staff | no live TS caller found | existing seed/baseline capability only; no tenant direct grant | seed capability exact verb; staff/patient direct `SELECT` deny |
| `saas_isolation_coverage_runs` | overlay, no broad staff | no product caller | existing isolation operator capability only | operator exact `INSERT/SELECT`; staff/patient deny |
| `saas_isolation_event_hourly` | overlay, no broad staff | no product caller | existing isolation operator capability only | operator exact `INSERT/SELECT`; staff/patient deny |
| `saas_isolation_events` | overlay, no broad staff | no product caller | existing isolation operator capability only | operator exact `INSERT/SELECT`; staff/patient deny |
| `schema_migrations` | migrator only, excluded by generator | `apps/integrator/src/infra/db/migrate.ts` | S02 asserts migrator-only, never runtime role | migrator `SELECT/INSERT`; every A1/runtime role all verbs deny |
| `webapp_schema_migrations` | migrator only, excluded by generator | no runtime caller | S02 asserts migrator-only | migrator `SELECT/INSERT`; every A1/runtime role all verbs deny |

## S04-E and caller-adoption decomposition

### Measured `feat` baseline — repeat before product work

The following was measured on `feat/doctor-ui-rebuild`, not copied from an earlier report:

```bash
git show feat/doctor-ui-rebuild:docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES.md | awk '/^## Per-table closure matrix — 29 capability\/ACL rows/{in_matrix=1;next}/^## Per-table closure matrix — nine global\/no-RLS rows/{in_matrix=0}in_matrix && /^\| `/{count++}END{print count}'
# 29
git show feat/doctor-ui-rebuild:docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES.md | awk '/^## Per-table closure matrix — nine global\/no-RLS rows/{in_matrix=1;next}/^## D1 pre-principal contract/{in_matrix=0}in_matrix && /^\| `/{count++}END{print count}'
# 9
git show feat/doctor-ui-rebuild:apps/webapp/db/drizzle-migrations/0306_v9b_capability_seams_local.sql | rg -c 'CREATE OR REPLACE FUNCTION'
# 6
git show feat/doctor-ui-rebuild:apps/webapp/db/drizzle-migrations/0306_v9b_capability_seams_local.sql | rg -ni 'CREATE OR REPLACE FUNCTION.*idempotency|idempotency.*CREATE OR REPLACE FUNCTION'
# no output (exit 1): no idempotency function
```

The six actual `0306` functions are `app.list_active_booking_cities()`,
`app.list_clinical_test_measure_kinds()`,
`app.upsert_clinical_test_measure_kind_by_label(text)`,
`app.save_clinical_test_measure_kinds(jsonb)`,
`app.read_reminder_transactional_email_cooldown(uuid)`, and
`app.record_reminder_transactional_email_cooldown(uuid)`. Its only operational table surfaces are
`app_operational_delivery_worker` → `public.integrator_push_outbox SELECT, UPDATE` and
`app_operational_media_worker` → `public.media_playback_stats_hourly SELECT, DELETE`.
It therefore does not supply the claimed public idempotency, D1/bootstrap membership,
booking/appointment exceptional-operation, or remaining operator-write seams.

### S04-E — expand only, before every family below

Create one future migration only after reserving its number on
`docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`. It adds the missing exact capabilities for: (1)
public `idempotency_keys` request-key read/write; (2) the signed D1 integrator identity/bootstrap
transaction and its exact membership/org-resolution lookup; (3) booking/appointment exceptional
operations (signed projection, staff soft-delete, platform merge/purge); and (4) the exact
operator-health/queue writes still performed by a tenant role. It is expand-only: no caller
conversion, direct-table `REVOKE`, policy, `ENABLE RLS`, or `FORCE RLS`.

`0306_v9b_capability_seams_local.sql` is already applied history and is not edited. The capability
must carry the current caller's exact input/result; it must not introduce a general writer or a
second D1 writer.

### S04 caller families — code-only adoption, non-overlapping scope

Each family starts only after its S04-E capability exists, changes only the files named in its
scope, and has a binary acceptance. The listed scope is derived from the current matrices and
`code-search`; a discovered caller outside it is a blocker for that family, not permission to widen
it. `raw-SQL` caller files belong to exactly one family.

| Family | Exact file scope | Binary acceptance and following contract |
| --- | --- | --- |
| small/global + auth | `apps/webapp/src/infra/idempotency/pgStore.ts`, `pgAuthRateLimitEvents.ts`, `pgChannelLinkClaim.ts` (**booking + identity**), `pgEmailAuth.ts`, `pgEmailPasswordLookup.ts`, `pgEmailSetupFlowPort.ts`, `pgEmailSetupTokens.ts`, `pgPhoneChallengeStore.ts`, `pgPhoneMessengerBind.ts`, `pgPhoneOtpLimits.ts`, `pgLoginTokens.ts`, `pgUserPasswordCredentials.ts`, `pgUserPins.ts`, `pgClinicalTestMeasureKinds.ts` (**the existing `0306` catalog caller**), and their existing focused tests | Each named auth/key/catalog operation succeeds through its exact capability; the matching global/capability-table direct verb fails for staff/patient/bare login. `pgChannelLinkClaim` is green before both S05a and S05b because it touches booking + identity. Its global/capability ACL is contracted only by the S05c land after this green evidence. |
| booking | `apps/webapp/src/infra/repos/pgPatientBookings.ts`, `pgAppointmentProjection.ts`, `pgDoctorClients.ts` (**booking + identity/preferences**), `apps/webapp/src/app-layer/booking/staffManualNoShow.ts`, `apps/webapp/src/modules/patient-booking/service.ts`, and their existing booking ownership tests | Signed booking projection and staff exceptional operation succeed; foreign/non-principal operation denies; no direct booking-table caller remains in these files. `pgDoctorClients` is also green before S05a because it touches identity/preferences. S05b then atomically installs required tenant-role verbs and enables/FORCEs its policies. |
| D1 identity/bootstrap | `apps/integrator/src/infra/db/directPublic/writeIdentityAndPreferencesDirect.ts`, `apps/integrator/src/infra/db/writePort.ts`, `apps/integrator/src/infra/db/withClient.ts`, `deploy/postgres/integrator-login-public-identity-grants.sql`, and existing D1 tests | One signed `(channel_code, external_id, integrator_user_id)` transaction resolves/upserts only its canonical identity and bootstrap membership; ambiguity and every bare direct table verb deny. S05a atomically contracts the D1 direct ACL and installs identity/preferences policy/FORCE. |
| platform merge/purge | `packages/platform-merge/src/pgPlatformUserMerge.ts`, `apps/webapp/src/infra/platformUserFullPurge.ts`, `apps/integrator/src/infra/db/directPublic/mergeCandidatesDirect.ts`, and their existing merge/purge tests | Exact platform-ops merge/purge succeeds for its nominated user; arbitrary tenant-role cross-user DML and direct table access deny. It touches S05a/S05b/S05c tables, so all three S05 lands wait for it; this family takes no independent tenant revoke. |
| patient preferences / cross-user delivery | `apps/webapp/src/infra/repos/pgChannelPreferences.ts`, `pgWebPushSubscriptions.ts`, `apps/webapp/src/modules/reminders/platformUserReminderWebPushNotify.ts`, `apps/integrator/src/infra/db/directPublic/writeReminderRulesDirect.ts`, and existing preference/reminder tests | Patient self-edit and the named delivery relation succeed; foreign patient, bare D1, and unrelated operational login deny. S05a owns the preference/subscription tenant-role grants + policy/FORCE contract. |
| operator queues / health | `apps/webapp/src/infra/repos/pgOperatorHealthRead.ts`, `pgOperatorHealthWrite.ts`, `apps/webapp/src/app-layer/health/runIntegratorPushOutboxHealthGuardTick.ts`, `apps/integrator/src/infra/operatorIncident/reportOperatorFailure.ts`, `recordIntegrationWebhookOutcome.ts`, `apps/webapp/src/infra/repos/pgReminderTransactionalEmailCooldown.ts` and `apps/webapp/src/app-layer/media/playbackHourlyRetention.ts` (**the existing `0306` cooldown and media-retention callers**), and existing focused tests | Each diagnostic/delivery capability completes only its named read/write; its base login cannot directly read/write an unrelated queue or tenant table. S05c contracts the adopted global/operator ACL. |
| membership / analytics | `apps/webapp/src/infra/repos/pgOrganizationMembership.ts`, `seatUsageSql.ts`, `pgProductAnalytics.ts`, `apps/webapp/src/modules/product-analytics/productAnalyticsRetention.ts`, `apps/webapp/src/infra/repos/pgOrgEntitlements.ts`, `stockQuotaCheck.ts`, and their existing focused tests | **First run quota Ч4б:** the quota checks above are converted/proven before any membership/analytics conversion. Then own-org membership/analytics succeeds and foreign/null-org tenant access denies. S05c atomically contracts its tenant ACL and installs policy/FORCE. |

Track D D1/idempotency/delivery work follows, rather than overlaps, the corresponding green S04
families. The quota Ч4б ordering and the one-family ownership of raw-SQL files prevent a second
caller from silently retaining the old ACL.

### Exact S05 dependency table

Each S05 land waits for **every** adoption family that touches a table it contracts; a family that
touches several groups is listed in each affected row and is green only once.

| S05 land | Tables/contracts it owns | Required green S04 families | Multi-table accounting |
| --- | --- | --- | --- |
| S05a | identity/preferences: `platform_users`, `user_channel_bindings`, `user_channel_preferences`, `user_notification_topic_channels`, `user_notification_topics`, `user_web_push_subscriptions` | D1 identity/bootstrap; patient preferences / cross-user delivery; small/global + auth; booking; platform merge/purge | `pgChannelLinkClaim` (small/global + auth) touches booking + identity; `pgDoctorClients` (booking) touches booking + identity/preferences; platform merge/purge touches S05a/S05b/S05c. |
| S05b | booking: `patient_bookings`, `appointment_records` | booking; small/global + auth; platform merge/purge | `pgChannelLinkClaim` touches booking + identity, so its family also gates S05a; `pgDoctorClients` is in booking and also gates S05a; platform merge/purge touches all S05 lands. |
| S05c | membership/analytics plus adopted global/capability/operator rows: `be_organization_members`, `product_analytics_hourly` and S05c-owned rows in the 29/9 matrices | D1 identity/bootstrap; membership / analytics; small/global + auth; operator queues / health; platform merge/purge | D1's bootstrap membership lookup touches `be_organization_members`; `pgClinicalTestMeasureKinds`, `pgReminderTransactionalEmailCooldown` and `playbackHourlyRetention` have exactly one family each (small/global + auth; operator queues / health; operator queues / health); platform merge/purge touches all S05 lands. |

### Grant overlays and existing evidence contours

Every contract change synchronizes the source generator
`docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs`, its generated
`deploy/postgres/p0-5b-grants.sql`, and the applicable overlays
`deploy/postgres/integrator-login-public-identity-grants.sql`,
`deploy/postgres/c4-operational-runtime.sql`, and
`deploy/postgres/c4-web-push-reminder-runtime.sql`; otherwise a deploy can restore the revoked
grant. This is synchronization of existing grant provenance, not a new grant system.

Use the existing disposable A1 evidence only: `pnpm run check:saas-a1-rls-conformance` via
`scripts/verify-a1-rls-conformance.mjs` (private A0-derived cluster) and its real non-owner logins
`app_runtime_staff_login` → `app_staff` and `app_runtime_nonstaff_login` → `app_patient`.
S06 extends that existing disposable contour with the five named operational `a1_*_login` actors in
the matrix above; S07 uses the existing TEST deploy contour
`deploy/host/deploy-test-saas.sh` and `deploy/postgres/test-strict-rls-finalizer.sql` with the
matching `bcb_test_*_login` actors. No new harness is designed here.

## D1 pre-principal contract

There is exactly one identity writer:
`apps/integrator/src/infra/db/directPublic/writeIdentityAndPreferencesDirect.ts`, called from
`apps/integrator/src/infra/db/writePort.ts` inside the existing transaction. S04 must amend that
writer and `writePort.ts`, its existing D1 tests, and
`deploy/postgres/integrator-login-public-identity-grants.sql`; it must not create another writer or
definer replacement.

The exact pre-principal seam is **a signed bootstrap/integrator identity event bound to one
`(channel_code, external_id, integrator_user_id)`**, running the existing writer's candidate
resolution/upsert transaction. Its permitted result is the one canonical `platform_users` row and
its bindings/preferences/topics; ambiguous candidates abort. S04-E supplies only the capability
transaction and helper ACL; the D1 family proves it while the legacy overlay remains usable. Only
then does **S05a**, in the same land as its identity/preferences policy/FORCE, revoke the overlay's
bare-login table grants on `platform_users`, `user_channel_bindings`, `user_channel_preferences`,
`user_notification_topics`, and its membership/org-resolution direct reads, while retaining the
tenant-role table verbs required by their RLS-constrained paths; it proves every bare
`SELECT/INSERT/UPDATE/DELETE` denial. D10 is drain-only transport teardown and is not a prerequisite.

## Operational actors: exact A1 and TEST matrix

| A1 synthetic login → TEST login | Membership (only) | Allowed tables/functions and verbs | Required deny |
| --- | --- | --- | --- |
| `a1_operational_diagnostic_login` → `bcb_test_operational_diagnostic_login` | `app_operational_diagnostic` | `integrator.projection_outbox SELECT` | all sibling queue, business and tenant tables |
| `a1_operational_delivery_login` → `bcb_test_operational_delivery_login` | `app_operational_delivery_worker` | queue `SELECT/UPDATE`; `projection_outbox`, `message_retry_jobs`; `app.resolve_outgoing_delivery_scope`, `operator_incident_alert_already_sent`, `mark_operator_incident_alert_sent`, `record_operator_delivery_attempt EXECUTE` | `idempotency_keys`, reminder, media, arbitrary queue DML |
| `a1_operational_scheduler_login` → `bcb_test_operational_scheduler_login` | `app_operational_scheduler` | `integrator.idempotency_keys SELECT/INSERT/UPDATE/DELETE`; `app.list_scheduler_reminder_organization_ids EXECUTE` | delivery queue, media, tenant tables |
| `a1_operational_media_login` → `bcb_test_operational_media_login` | `app_operational_media_worker` | `media_transcode_jobs`, `media_files SELECT/UPDATE`; `app.read_media_worker_runtime_setting EXECUTE` | queue, scheduler, tenant tables |
| `a1_operational_web_push_login` → `bcb_test_operational_web_push_reminder_login` | `app_operational_web_push_reminder` | listed C4 web-push org-scoped `SELECT`; `product_analytics_hourly SELECT/INSERT/UPDATE`; named reminder discovery functions | direct unrelated business/queue access; other org; arbitrary `operator_job_status` key |

All five login roles are `LOGIN NOINHERIT NOBYPASSRLS`, have exactly the shown terminal capability
membership, and no `app_owner` membership. S06 creates the five synthetic roles with the same shape
and tests each allow plus every named denial; S07 records `session_user`, `current_user`,
`rolbypassrls`, `pg_auth_members`, function ACL and table verb results for precisely the named TEST
logins above. `app_worker` is not an evidence actor or fallback capability.

## Slices, conditions and first worker

| Slice | Status / measurable prerequisite | Deliverable |
| --- | --- | --- |
| S01 | **ACCEPTED AND INTEGRATED 02.08.** Product `86344858e`, independent report `79f3dd0b8`; after building the four workspace packages the same webapp typecheck passed. Merged into `wt/single-entry-integration` and migration `0304` applied on DEV through the unified `0300…0305` ledger. | Removed only `booking_branch_services`, `booking_branches`, `booking_services`, `booking_specialists`, `branches`, their FK/backrefs, `pgBranches` and three DI lines; regenerated grant SQL. |
| S02 | **ACCEPTED AND INTEGRATED 02.08.** Product `ddab86eda`, audit `cfb813a96`, replay closure `f54468e67`, land `c6b844bbc`; disposable migration replay reached `count=307` twice. | Limited expand-only artifact: six named functions and two operational table surfaces; no final revoke/FORCE. S04-E owns the remaining matrix seams. |
| S03 | **ACCEPTED, INTEGRATED AND APPLIED TO DEV 02.08.** Product `ff803c1e9`, independent FAIL `e24e021f4`, bounded fix `f536539d1`, CI fixture correction `96a93da8d`, land `7e8cd2c0b`. Final full CI: `pnpm install --frozen-lockfile && pnpm run ci` → exit 0 / 450s; PostgreSQL oracle 7 files / 21 tests. DEV migration used `migrate-dev.sh --preflight` then `--execute`; read-only postcheck: journal 0309 exactly once, both columns nullable, 440 exact-parent rows stamped and 233 historical rows NULL. | Nullable `organization_id` on `patient_bookings` and `appointment_records`; deterministic stamp for exact live/soft-deleted parents, NULL preservation for zero-match history, and transactional abort for ambiguity/mapping-org contradiction, user mismatch, or provider mismatch; writers thread org through `createPending` and all four native projection writes; staff-delete tombstone persists resolved org; existing patient reader provides self-only NULL-org history without canonical navigation. |
| S04 | **NOT READY: S02 did not create all seams.** Measured `feat`: 29+9 matrix rows, but `0306` has 6 functions and 2 operational table surfaces; public idempotency, D1/bootstrap membership, booking/appointment exceptional paths and some operator writes remain absent. First S04-E expand-only, then exactly one caller family at a time. | Seven non-overlapping code-only adoption families; no tenant direct ACL revoke in S04. |
| S05a | S04-E exists; every family named for S05a in the exact S05 dependency table is green. | In one migration: identity/preferences capability and required tenant-role grants, policies/FORCE, bare/unscoped direct-ACL revoke, and A1 direct-deny proof. |
| S05b | S04-E exists; every family named for S05b in the exact S05 dependency table is green; staff non-NULL org scope, patient self-read and non-NULL writes are proven. | In one migration: booking capability and required tenant-role grants, policies/FORCE, bare/unscoped direct-ACL revoke, and A1 proof. |
| S05c | S04-E exists; every family named for S05c in the exact S05 dependency table is green; quota Ч4б precedes membership/analytics. | In one migration: membership/analytics required tenant-role grants and policies/FORCE, bare/unscoped direct-ACL revoke plus adopted global/capability/operator contract and A1 proof. |
| S06 | all S05 A1 additions ready. | Existing A1 harness only, full table/actor/verb matrix. |
| S07 | S06 green and explicit authorized TEST action. | Existing TEST deploy contour records the exact same matrix. |

### S02 execution status — 2026-08-02

The bounded S02 artifact `0306_v9b_capability_seams_local.sql` and
`V9B_S02_CAPABILITY_SEAMS_REPORT.md` passed independent 38/38 inspection and clean disposable replay
(`ddab86eda` + `cfb813a96` + `f54468e67`) and landed through `c6b844bbc`. It remains expand-only: no caller
adoption, direct-table revoke, RLS/FORCE, or D1 writer change is claimed here. S03 is now integrated below;
before S04 caller adoption, S04-E must add the missing expand seams named in the S04 row.

S03 backfill is transactional and deterministic. It stamps only exact canonical matches, including
soft-deleted canonical parents, and keeps both new `organization_id` columns nullable. A
`zero_match` has no immutable tenant proof and therefore remains NULL; it is neither guessed,
deleted nor quarantined. The migration **raises an exception that aborts the whole migration** only
for `multiple_match` (including mapping-org contradiction), `user_mismatch`, or
`provider_mismatch`. No `patient_bookings`, `appointment_records`, pending booking, `be_*` row or
canonical record is deleted/denied to fake a result. `canonicalCreate.ts` resolves and writes the
canonical appointment's organization before a pending booking insert.

The existing `app.read_current_patient_booking_rows` remains the only patient reader. It keeps the
canonical tenant checks and lets a signed enrolled patient self-read a NULL-org legacy row without
canonical navigation/context. S04/S05 are still absent: after S04 adoption and the atomic S05b contract, staff must match
a non-NULL org, patient access is self-read, and INSERT/UPDATE/DELETE require non-NULL org.

### S03 execution status — 2026-08-02

Accepted chain: product `ff803c1e9`, audit `e24e021f4`, fix `f536539d1`, CI compatibility
`96a93da8d`, land `7e8cd2c0b`. Absence of DELETE/DROP/REVOKE/RLS/FORCE in 0309 was verified by
one-time diff inspection; a permanent source-text oracle was intentionally not retained.

**Test evidence:**
- `bookingOwnershipMigration.postgres.integration.test.ts` — behavior oracles stamp exact live and
  soft-deleted parents, preserve zero-match rows as NULL, abort ambiguity/user/provider mismatch,
  rerun idempotently, and prove self-only NULL-org history at the existing reader seam.
- `bookingOwnershipWriters.postgres.integration.test.ts` — 3/3: createPending persists org, upsert
  conflict rejects org change, staff-delete tombstone writes org.
- Full disposable PostgreSQL suite after audit handoff: 7/7 files, 21/21 tests; migration replay reached
  `count=310`. Final repo CI on the landed candidate passed in 450s.

**DEV census (read-only, 2026-08-02):** 27 live + 17 soft-deleted exact parents in
`patient_bookings`, 316 live + 80 soft-deleted exact parents in `appointment_records`, and 233
rows without an immutable tenant key. All 440 exact-parent rows are stamped; the 233 unresolved
historical rows remain NULL. See `V9B_S03_DEV_BOOKING_OWNERSHIP_CENSUS_AUDIT.md`.

**Outcome and remaining later slices:**
- Independent audit **FAIL** at `e24e021f4`: REG-1 made a NULL-org legacy projection record impossible for an admin to soft-delete, and Appendix A supplied the missing B2/D4 acceptance oracles. Bounded fix `f536539d1` restores that Appendix A file verbatim and permits this pre-S03 legacy delete only when the stored org is NULL; two non-NULL differing organizations still refuse. Land `7e8cd2c0b`; DEV read-only postcheck after canonical migrate returned `appointment_records|396|14` and `patient_bookings|44|219`, exactly 440 stamped / 233 NULL.
- S04/S05 adoption, revoke and enforcement (out of S03 scope); historical NULL rows are not
  reconciled by inference.
- S04 caller conversion (out of S03 scope).
- Journal re-ordering is not pending: `0309_v9b_booking_ownership_local` is already idx 309.

### Historical first-worker brief — S01, COMPLETED 02.08

> Work only S01 on a fresh `wt/` branch from the current single-entry integration SHA. Before any
> migration file: reread `NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`, inspect active SHA/diff only for the
> `buildAppDeps.ts` branches hunk, reserve one currently free number on the board, then create it.
> Modify only `apps/webapp/db/schema/{schema.ts,relations.ts}`, `pgBranches.ts`,
> `buildAppDeps.ts`, `di.md`, one numbered webapp Drizzle migration, and
> `p0-5b-grants-sql.mjs` with regenerated `deploy/postgres/p0-5b-grants.sql` and its existing grant
> smoke. Remove exactly five legacy declarations/FKs/backrefs, `pgBranches`, its import/factory/returned
> DI property and generator entries. Preserve `stockQuotaCheck.ts`, `pgOrganizationInvites.ts`, canonical
> `be_*`, all `patient_bookings`/`appointment_records` data declarations, D1 writer and D10 transport.
> Regenerate `p0-5b-grants.sql` from its generator; run schema/type/grant smoke. If a runtime consumer
> appears, report `path:symbol` and set the technical blocker with its branch/SHA/path condition — do
> not ask an owner for release and do not build an RLS wall.

## Required repeat audit gate

The independent repeat audit checks F1–F7 against this document only: every matrix row has current
role, caller, seam, implementing slice, adoption/revoke condition and actor+verb oracle; D1 is the
existing writer; every land is expand/adopt/contract-safe; S03 aborts rather than deletes; all waits
are binary; operational logins are named; policies use `app.current_org_id()`; and the seven-file
assignment is countable. For S04+ it also verifies that the three existing `0306` callers each have
one adoption family, the S05 dependency table accounts for every multi-table caller, and tenant-role
verbs remain RLS/FORCE-constrained rather than disappearing. Product work starts only after that
audit returns PASS; the superseded re-audit report is not that gate.
