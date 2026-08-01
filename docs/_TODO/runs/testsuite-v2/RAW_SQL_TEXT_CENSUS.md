# Webapp legacy SQL-text census — Single-entry пункт 1

**Scope and authority.** This is a research-only census of production
`apps/webapp/src/**` on `wt/sql-text-census`.  The current oracle is
[`SINGLE_ENTRY_CLEANUP_2026-08-01.md`](../../SINGLE_ENTRY_CLEANUP_2026-08-01.md),
п. 1: `runWebappPgText` is a legacy `$1..$n` text bridge, not a query builder.
It is therefore not evidence that the raw-SQL-text part of пункт 1 is closed.
No source, migration, package, test, deploy artefact, or plan checkbox was
changed for this census.

`docs/INTEGRATOR_DRIZZLE_MIGRATION/**` was read only as history.  The current
Track D authority is
[`WORK_ORDER.md`](../../UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md) §2.3 and
D10/D18: D10 removes the projection transport only after a zero-producer census;
D18 says not to translate code which will be removed by owner stages.  D10a's
current decision retains `public.outgoing_delivery_queue`, removes
`integrator.message_retry_jobs`, and uses `public.notification_delivery_attempts`
as the delivery-attempt log.  The older `D10A_PART1_OBSERVERS_BRIEF.md` sentence
saying that `outgoing_delivery_queue` is removed conflicts with this later/current
decision and is not used as an oracle.

## Baseline and method

Measured on this worktree, rather than copied from an earlier report:

```sh
rg -l --glob '*.{ts,tsx}' --glob '!**/*.test.*' --glob '!**/*.spec.*' \
  'runWebappPgText\(' apps/webapp/src | sort | wc -l
# 44

rg -n --glob '*.{ts,tsx}' --glob '!**/*.test.*' --glob '!**/*.spec.*' \
  'runWebappPgText\(' apps/webapp/src | wc -l
# 155
```

The denominator is an invocation (`runWebappPgText(`), not an import.  Every
site below is assigned exactly once as a live translation candidate, an
owner-stage deletion/overlap, or a proven low-level exemption.  There are **no
proven `LOW_LEVEL_EXEMPT` sites**: callers are application/repository code, not
the `infra/db` execution port; a stored procedure, advisory lock, `FOR UPDATE`,
RLS principal, or caller-supplied transaction changes the target to a typed
`sql` fragment/Drizzle transaction, not to an exemption.

Legend:

- **TL** = `TRANSLATE_LIVE`; preserve the listed operation contract and replace
  text with the existing Drizzle schema/query/`sql`-fragment facility.
- **WO** = `WAIT_OVERLAP`; a live and an eventual transport deletion coexist.
  Do not translate its transport-only operation before the named owner stage.
- **DO** = `DELETE_BY_OWNER_STAGE`; no standalone implementation slice; deletion
  remains owned by the stated stage.  No site met this bar in the current
  webapp denominator.
- **Schema/pattern** records the existing reusable boundary: `schema` means a
  table/function model in `apps/webapp/db/schema/**`; `sql` means an existing
  safe Drizzle-fragment pattern in this or a sibling repository; `tx` means the
  same caller-provided transaction/principal must remain in scope.  Absence of a
  direct import is not permission to make a parallel schema copy.

### What the current raw-query gate proves (and does not)

Read `scripts/check-no-new-raw-sql.mjs` directly.  Its scan roots include
`apps/webapp/src`, but the guarded AST predicate is a `.query(...)` call (and
aliases of that call); `apps/webapp/src/infra/db/` is the only webapp port
directory.  It does not inspect `runWebappPgText(...)` query text or require
`sql` fragments.  Exact verification attempted:

```sh
node scripts/check-no-new-raw-sql.mjs
```

It could not start in this checkout because dependencies are absent:
`ERR_MODULE_NOT_FOUND: Cannot find package 'typescript' imported from
.../scripts/check-no-new-raw-sql.mjs`.  This is **not** a green gate and no
claim about its current pass status is made.  Its source and the current
single-entry oracle nevertheless establish the limited `.query` coverage above.

## Census by domain contract

The `ops` column names every distinct operation family in the file; a slash
separates independently executable operations, not merely adjacent calls.
Counts add to the 155-call baseline.  `Tests` is the existing directly named
test evidence found by exact `rg --files apps/webapp | rg '<base>.*\.(test|spec)'`;
`—` means none was found by that exact search, not that the entire application
has no indirect test.

| File | calls; human/domain path and operation(s) | tables / difficult semantics | schema or reusable pattern; tests | verdict and minimum acceptance |
|---|---|---|---|---|
| `app-layer/media/playbackStatsHourly.ts` | 1; patient media playback telemetry: increment delivery/fallback hourly counter | `app.increment_media_playback_resolution_stat`; best-effort (logs, does not fail playback) | function `sql` fragment; tests — | **TL**; verify four ordered args and swallowed DB failure remains non-blocking. |
| `infra/adminAuditLog.ts` | 9; staff audit trail: write, dedupe open conflict, count/list/filter, resolve conflict | `admin_audit_log`; JSON details, conflict key, array filter, returned row shape | schema exists; `adminAuditLog.devDb.integration.test.ts` | **TL**; write/list/resolve slice must retain actor/org principal, dedupe and resolve transition. |
| `pgAppRuntimeSettings.ts` | 7; runtime feature/config read, public/server view, snapshot, upsert | `app.read_*_runtime_setting`, `app_runtime_settings`; scope arrays, JSON, UPSERT | `db/schema/appRuntimeSettings.ts`; tests — | **TL**; test scoped read precedence and `ON CONFLICT` return shape. |
| `pgAppointmentProjection.ts` | 15; legacy appointment projection lookup/tombstone/upsert/reconcile | `appointment_records`, `be_appointments`, `patient_bookings`, phone history; UPSERT, cleanup writes | schema partially present; tests — | **WO (D10/D9b)** for projection/tombstone operations: first prove producers are zero, then delete with D10 rather than translate. |
| `pgAuthRateLimitEvents.ts` | 8; login/OTP rate-limit prune/count/record/reset | `app.auth_rate_limit_*`; `runWebappTransaction`, transaction advisory locks, prune-before-count | existing `sql` lock pattern in file; `pgAuthRateLimitEvents.devDb.integration.test.ts` | **TL**; preserve same `tx`, lock ordering, and limited/count result. |
| `pgChannelLinkClaim.ts` | 16; link messenger account, classify/merge owner, claim binding | platform identity, bindings, diary/booking/note/LFK references; multiple `FOR UPDATE` locks and merger transaction | schema models exist; tests — | **TL**; transaction slice must lock both owners/binding and prove retry/merge idempotency. |
| `pgChannelLinkStart.ts` | 7; start/consume channel-link secret and bind user | link-secret accessors, `platform_users`, `user_channel_bindings`; atomic used marker | schema for users/bindings; tests — | **TL**; one-time token consumption and binding conflict/return shape. |
| `pgChannelPreferences.ts` | 6; user notification/auth-channel preferences get/upsert/preferred switch | `user_channel_preferences`; tx helper, unique/preferred semantics | schema exists; tests — | **TL**; save two preferences and assert exactly one preferred result. |
| `pgDevBypassPlatformUserPhone.ts` | 2; dev-only client/staff phone setup | `platform_users`; client trust column differs from staff write | `platformUsers` schema; tests — | **TL**; role-specific update preserves client trust and `$1/$2` order. |
| `pgDiaryPurge.ts` | 4; account purge of diary/LFK data | `lfk_complexes`, assignments, `symptom_trackings`; supplied transaction, ordered soft/hard deletes | diary/LFK schemas; tests — | **TL**; execute atomically and assert no partial purge after induced failure. D11 removed only the integrator block, not this webapp path. |
| `pgDoctorBroadcastDelivery.ts` | 2; doctor broadcast commits audit and all delivery jobs | `broadcast_audit`, `outgoing_delivery_queue`, recipients; caller `PoolClient`, `ON CONFLICT DO NOTHING`, all-or-error | queue and audit schemas/patterns; tests — | **TL**. Current D10a retains this queue; accept atomic audit+jobs, duplicate `event_id` error policy, and rollback. |
| `pgDoctorClients.ts` | 36; doctor client card/list: channel, clinical, support, program, booking, analytics, contact and profile edits | many `platform_users`/booking/support/program tables; CTEs, LATERAL, `ANY(uuid[])`, aggregate JSON, org scoping | direct schemas `bookingEngine`, `bookingMemberships`, `bookingPolicies`; two devDb client tests | **TL**, split by contract: read projection, support/program metrics, booking history, profile/support/physical/contact writes. Acceptance per contract must preserve org predicate and DTO shape. |
| `pgDoctorMotivationQuotesEditor.ts` | 7; doctor CMS quote list/create/archive/activate/reorder | `motivational_quotes`; position ordering/multi-write | schema and `sql` imports already in file; tests — | **TL**; reorder slice must preserve ordering and inactive/archive visibility. |
| `pgEmailAuth.ts` | 19; email challenge creation/cooldown, ownership, verify/consume, OTP lockout | `app.email_auth_*`, `platform_users`; transaction lock, challenge/attempt/expiry state | function-fragment route; tests — | **TL**; verify resend/consume race and returned owner-conflict/lockout codes. |
| `pgEmailSetupFlowPort.ts` | 4; complete password-email setup | credentials + `platform_users`; verification transition and upsert | credential/user schemas; tests — | **TL**; success transaction creates credential and marks exact user verified. |
| `pgEmailSetupTokens.ts` | 5; read/consume setup tokens | email setup accessor functions; one-time/expiry semantics | function `sql` fragment; tests — | **TL**; expired/replayed token must not complete setup. |
| `pgLfkDiary.ts` | 14; patient LFK complex/session CRUD and range reads | `lfk_complexes`, sessions/exercises; user predicate, joins, soft delete | LFK schemas; tests — | **TL**; user-isolated create/session/update/delete and list shape. |
| `pgLfkExercises.ts` | 12; doctor exercise media/regions/catalog/usage/archive | exercise/media/complex/program graph; arrays, JSON aggregation, cross-domain usage scan | schemas exist; tests — | **TL**, separate catalog CRUD from usage-summary read; preserve org principal and usage-ref shape. |
| `pgLfkTemplates.ts` | 7; complex-template usage and editor reads/writes | templates/exercises/program and assignment graph; JSON usage refs | schemas exist; tests — | **TL**; ensure template in-use summary blocks unsafe mutation with same principal. |
| `pgLoginTokens.ts` | 5; login-token read/create/consume lifecycle | `app.auth_login_token_*`; date normalization and one-time token state | function `sql` fragment; tests — | **TL**; create → read → consume, then replay returns no valid token. |
| `pgMessengerPhoneHttpBind.ts` | 7; signed webapp↔integrator phone bind | integrator `users`/`identities`/`contacts`; supplied Pool/PoolClient contract and transaction identity | `getWebappSqlFromPgClient`/`runPgPoolPgText`; caller path `messengerPhoneHttpBindExecute`; tests — | **TL**; retain injected connection, no implicit webapp DB; atomic identity/phone result. |
| `pgOAuthUserResolve.ts` | 5; OAuth verified-email/phone resolve, create and binding upsert | `platform_users`, OAuth accessor; unique identity outcome | `platformUsers` schema; tests — | **TL**; test verified-email collision and canonical user resolution. |
| `pgOrgBranding.ts` | 8; organization branding context/revision save/publish | branding revision table; `FOR UPDATE`, revision state/returned rows | existing `sql`/Drizzle pattern; tests — | **TL**; concurrent publish/update must preserve locked revision and return the published revision. |
| `pgOrganizationInvites.ts` | 12; staff invite issue/list/seat reservation/token accept/revoke/expire | invite/member/org/entitlement tables; CTE/LATERAL quota computation, accessors | `organizationMemberInvites` schema; tests — | **TL**; invitation acceptance slice must hold seat decision + token consumption atomically. |
| `pgOrganizationProvisioning.ts` | 6; specialist signup intent and owner provisioning | signup intent accessors, booking org/member rows; slug conflict mapping | `bookingEngine`/schema imports already present; tests — | **TL**; retry provision keeps slug-conflict mapping and does not duplicate owner. |
| `pgPatientBookings.ts` | 15; patient booking state machine/listing | `patient_bookings`; CTE overlap creation, conditional transitions, `RETURNING` | schema exists; `pgPatientBookings.devDb.integration.test.ts` | **TL**; state-machine slice must reject invalid transition and retain exact returned booking. |
| `pgPatientCalendarTimezone.ts` | 5; patient calendar timezone read/set/first-write | `platform_users`, patient accessor; RLS operation family, conditional first-set | `platformUsers` schema; tests — | **TL**; preserve patient-principal accessor versus staff fallback and conditional no-overwrite. |
| `pgPhoneChallengeStore.ts` | 5; phone challenge load/merge/consume | phone auth accessors, JSON channel context, TTL/attempt return | function `sql` fragment; `pgPhoneChallengeStore.unit.test.ts` | **TL**; prove channel context merge and no row-shape/date regression. |
| `pgPhoneHistory.ts` | 3; canonical user phone history transition | `user_phone_history`; current/history ordering | schema exists; tests — | **TL**; transaction preserves previous phone row before new transition. |
| `pgPhoneOtpLimits.ts` | 4; anonymous phone OTP lock/read/reset | `app.phone_auth_*`; lockout exponent/cap and dates | function `sql` fragment; tests — | **TL**; repeated lockout and reset slice must retain cap and `$1/$2` mapping. |
| `pgPlatformUserCalendarTimezone.ts` | 2; non-patient platform-user timezone read/set | `platform_users`; simple typed select/update, nullable return | `platformUsers` schema; tests — | **TL; first safe live slice** described below. |
| `pgPlaybackResolutionEvents.ts` | 1; record chosen HLS/MP4/file delivery | `app.record_media_playback_resolution_event`; four typed args | function `sql` fragment; tests — | **TL**; assert ordered user/media/delivery/fallback arguments. |
| `pgProductAnalytics.ts` | 4; product analytics hourly/user counters, event batch, push open | analytics tables/functions; `ON CONFLICT`, JSON and retention helpers | `productAnalytics`/schema imports already present; tests — | **TL**; batch/push slice must retain count key and idempotent aggregate update. |
| `pgReferences.ts` | 15; clinician reference catalog category/item CRUD | reference categories/items; supplied principal transaction, ordered save, JSON/array selection | schemas exist; tests — | **TL**; save/archival slice preserves org write principal and catalog ordering. |
| `pgStaffSecurity.ts` | 10; staff TOTP/recovery/challenge/failure/session revocation | `app.*staff*_security*`; security state machine, JSON recovery hashes, strict row parsing | function `sql` fragments; tests — | **TL**; acceptance must cover challenge consume/replay, lockout, and session-version return. |
| `pgSupportCommunication.ts` | 47; projection upserts plus patient/doctor conversation/question/message read/write/unread paths | support conversation/message/question/delivery tables; many UPSERTs, return shapes, unread bulk updates, joins/LATERAL | schemas/relations exist; `pgSupportCommunication.devDb.integration.test.ts` | **WO** only for `*FromProjection`/projection ingestion (D10 producer-zero gate); **TL** for live patient/doctor chat, unread and admin operations. Keep these as separate slices. |
| `pgSymptomDiary.ts` | 18; patient symptom tracking/entry CRUD and date ranges | `symptom_trackings`, `symptom_entries`; user isolation, idempotent well-being/warmup setup, joins | schemas exist; tests — | **TL**; one tracking+entry CRUD slice verifies ownership, ranges and soft-delete. |
| `pgSystemSettings.ts` | 31; admin/public/current-patient settings read, CAS/upsert/delete, audit/runtime writes | `system_settings`, audit, runtime settings; scoped fallback, `FOR UPDATE`, CAS, JSON audit | schemas exist; tests — | **TL**, split read resolver from write/CAS/UoW. Acceptance must retain scope precedence, compare-and-swap failure, tx audit and runtime mirror. |
| `pgUserPasswordCredentials.ts` | 7; password registration/resend/verify/login/update | `app.email_password_*`; candidate selection/verification semantics | function `sql` fragment; tests — | **TL**; register/verify/login slice detects challenge/user parameter swap. |
| `pgUserPins.ts` | 4; user PIN read/upsert/fail/reset | `app.auth_user_pin_*`; date conversion/lockout row shape | function `sql` fragment; tests — | **TL**; failed-attempt increment and reset must preserve returned `lockedUntil`. |
| `pgUserProjection.ts` | 9; integrator projection identity upsert/find/profile/topics | `platform_users`, notification topics; tx, conditional merge/update, UPSERT | user schema; `pgUserProjection.devDb.integration.test.ts` | **WO** for the three integrator-event writes (`upsertFromProjection`, `updateProfileByPhone`, `upsertNotificationTopics`) under D15b→D10; **TL** for six live canonical lookup/profile/auth operations, which have webapp callers. |
| `pgWebPushSubscriptions.ts` | 6; save/cap/delete/list subscriptions | subscription table; same `PoolClient` transaction for upsert+cap deletion | schema exists; tests — | **TL**; transaction test must reject a partial sixth-subscription outcome and retain endpoint return mapping. |
| `stockQuotaCheck.ts` | 2; organization stock quota decision at write time | entitlement/tariff/org; concurrent reservation correctness, lock/transaction dependent | existing `sql`/entitlement patterns; tests — | **TL**; retain atomic quota check inside caller transaction; JS-only precheck is unacceptable. |
| `upsertBroadcastDefaultsAfterChannelBind.ts` | 1; default broadcast preferences after channel bind | `user_channel_preferences`; supplied transaction, idempotent UPSERT | preference schema; tests — | **TL**; bind+default write succeeds once and retry does not duplicate/default-overwrite. |

## Execution order

Deletion comes before translation where the owner has actually decided deletion.
There are no current **DO** sites in this denominator, but the following transport
operations are deliberately held:

1. D10/D15 overlap proof and removal: `pgAppointmentProjection` (15), the first
   20 calls of `pgSupportCommunication` (all `*FromProjection` ingestion and its
   resolver), and the three integrator-event writes of `pgUserProjection`.  The
   required gate is the owner-defined exact zero-producer census, not a textual
   rewrite of the consumer.
2. Live low-risk typed-table reads/writes: calendar timezone, playback event,
   preferences, runtime settings and simple credential/token slices.
3. Live state/transaction contracts: OTP/rate limiting, PIN/TOTP, web push,
   invites, booking and settings CAS.
4. Larger product projections: diaries/LFK/references, doctor client/card,
   support-chat live operations and analytics.

This order is by independently verifiable human contract; it is not a request to
translate ten arbitrary files at a time.

## Exact negative searches

The following exact commands supported the `Tests —` and direct-schema findings
above.  They must be rerun for any selected slice; their empty output is not
replaced by an assertion in this document.

```sh
# direct test filename / symbol search (replace BASE and SYMBOL for the selected operation)
rg --files apps/webapp | rg '/BASE[^/]*\.(test|spec)\.(ts|tsx)$'
rg -n --glob '*.{test,spec}.{ts,tsx}' 'SYMBOL|createPg...Port' apps/webapp/src

# direct schema import and table declaration search
rg -n "from ['\"][^'\"]*(db/schema|schema/)" apps/webapp/src/infra/repos/BASE.ts
rg -n 'export const (platformUsers|systemSettings|patientBookings|...)' apps/webapp/db/schema

# caller and Track-D back-reference searches
node /home/dev/brain/tools/code-search.mjs 'SYMBOL caller' --repo bcb -k 30
rg -n 'D10|D15|D18|projection_outbox|outgoing_delivery_queue' \
  docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md \
  docs/_TODO/runs/integrator-cleanup
```

Applied examples were `pgSupportCommunication`, `pgAppointmentProjection`,
`createPgChannelLinkClaim`, `createPgMessengerPhoneHttpBind`, and the direct
`outgoing_delivery_queue` search.  The latter found one writer in
`pgDoctorBroadcastDelivery.ts`; current WORK_ORDER §2.3 says the queue remains,
so it is not a deletion candidate.  D18c reports establish that the old raw
`.query` exemptions for `broadcastChannelCounts.ts` and
`pgAdminPlatformUserStats.ts` were false and were already converted; they are
not in this 44-file text-bridge denominator.

## Totals and reconciliation

| Category | calls | reconciliation |
|---|---:|---|
| `TRANSLATE_LIVE` | **117** | 155 baseline minus the 38 named `WO` calls; mixed files are split by operation, not classified wholesale |
| `WAIT_OVERLAP` | **38** | `pgAppointmentProjection` 15 + `pgSupportCommunication` projection ingestion/resolver 20 + `pgUserProjection` integrator-event writes 3 |
| `DELETE_BY_OWNER_STAGE` | **0** | no current webapp text site has an owner-approved deletion proof independent of D10/D15 |
| `LOW_LEVEL_EXEMPT` | **0** | no caller is itself the execution port |
| baseline | **155 in 44 files** | `117 + 38 + 0 + 0 = 155`; the classification counts are derived from the exact per-call baseline and the named operation partition above |

### НЕ ПРОВЕРЕНО

- The D10/D15 producer-zero conclusion: the 38 named transport calls are held
  because they remain reachable today; this report does not pretend they are
  already deletable.
- A current runnable gate/test result: dependencies are absent, and DB/DEV/TEST
  were prohibited for this task.
- Any claim that every table has a complete one-to-one Drizzle model.  Existing
  schema files and sibling `sql` patterns were located; selected implementation
  must inspect the exact columns/functions before changing one site.

## First bounded live-slice brief

**Target:** only
`apps/webapp/src/infra/repos/pgPlatformUserCalendarTimezone.ts`:
`getPlatformUserCalendarTimezone` and `setPlatformUserCalendarTimezone` (2
calls).  Do not combine it with the patient-principal variant in
`pgPatientCalendarTimezone.ts`.

**Human contract:** a non-patient platform-user calendar surface reads its
nullable IANA timezone and writes precisely that user’s timezone.  The current
queries are a typed `SELECT` and a typed `UPDATE` against `platform_users`; no
transaction, lock, RLS accessor, or Track D overlap is involved.

**Implementation boundary:** reuse the existing `platformUsers` declaration in
`apps/webapp/db/schema/schema.ts` and the application's Drizzle executor.  No
new table/schema, SQL parser, DB port, principal shortcut, or migration.

**Acceptance:** a focused repository/integration test must seed two users,
read null then the saved timezone for user A, confirm user B is unchanged, and
assert the returned `null|string` shape.  It must be shown to fail for (a)
reversed user/timezone binding, (b) an update missing the user predicate, and
(c) an accidental non-null empty result.  Run only the targeted test plus the
webapp typecheck/lint appropriate to the changed file; do not start DEV/TEST or
deploy in the research worktree.  Commit code and its test together only after
that isolated execution work is separately authorized.
