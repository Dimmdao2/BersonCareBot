# DB access map — S0 baseline

**Date:** 2026-06-30  
**Branch:** `codex/saas-roadmap-foundation`  
**Stage:** R0/S0, inventory only. No runtime code, migrations or database writes.

## Sources read

- `AGENTS.md`, `README.md`, `docs/README.md`
- `docs/ARCHITECTURE/SERVER CONVENTIONS.md`
- `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`
- `deploy/HOST_DEPLOY_README.md`
- `docs/AGENT_AUTORUN_SCHEME.md`
- `.cursor/rules/*`, especially test policy, clean architecture, DB config/mirror, dev/prod isolation
- `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/{MASTER_PLAN.md,REQUIREMENTS.md,RAW_SQL_RULING.md,log.md}`
- `docs/_TODO/SAAS_FOUNDATION/{README.md,CORRECTED_PLAN.md,REQUIREMENTS.md,RAW_SQL_AUDIT.md,LOG.md,ROADMAP_TO_SAAS.md}`
- `docs/INTEGRATOR_DRIZZLE_MIGRATION/{DRIZZLE_TRANSITION_PLAN.md,RAW_SQL_INVENTORY.md,LOG.md}`

## Counting method

Code-only `rg` inventory, excluding tests/specs/e2e for runtime counts. Ops scripts are listed separately because ADR marks many of them as permanent `pg` zones.

Representative commands:

```bash
rg -n '\.connect\(' apps packages scripts --glob '*.ts' --glob '!**/*.test.ts' --glob '!**/*.spec.ts' --glob '!**/__tests__/**' --glob '!**/e2e/**'
rg -n 'new (PgPool|Pool)\b|new Pool\b|new PgPool\b' apps packages scripts --glob '*.ts' --glob '!**/*.test.ts' --glob '!**/*.spec.ts' --glob '!**/__tests__/**'
rg -n '\b(await\s+)?(db|txDb)\.query\(' apps/integrator/src --glob '*.ts' --glob '!**/*.test.ts' --glob '!**/*.spec.ts' --glob '!**/__tests__/**'
rg -n 'system_settings|FROM public\.system_settings|FROM system_settings|INSERT INTO system_settings|UPDATE system_settings' apps packages --glob '*.ts' --glob '!**/*.test.ts' --glob '!**/*.spec.ts' --glob '!**/__tests__/**'
```

## Process trunks

| Process / package | Current trunk | Pool source | S0 classification |
|---|---|---|---|
| Webapp runtime | `getPool()` + `getDrizzle()` + `runWebappSql()` / `runWebappPgText()` in `apps/webapp/src/infra/db/*`; Drizzle instance in `apps/webapp/src/app-layer/db/drizzle.ts` | `apps/webapp/src/infra/db/client.ts` singleton `new Pool` | Natural trunk exists, but dedicated `.connect()` and layer bypasses still need S1/S3/S4. |
| Webapp legacy pool bridge | `runPgPoolPgText(pool, ...)` | Caller-provided `Pool`/`PoolClient` | KEEP as bridge only; callers must be moved behind sanctioned repos/withClient. |
| Integrator runtime | `createDbPort(db)` + `runIntegratorSql(db, sql...)` | `apps/integrator/src/infra/db/client.ts` singleton `new Pool` | Natural trunk exists; `db.tx()`, scheduler locks and Rubitime throttle still checkout dedicated clients. |
| Media worker | `runMediaWorkerSql()` / `runMediaWorkerPgText()` | `apps/media-worker/src/main.ts` process-local `new Pool` passed in context | Separate process trunk; `jobs/claim.ts` remains permanent queue SQL, but pool needs named provider + dormant hook in S4. |
| `packages/booking-rubitime-sync` | Caller-injected `SqlExecutor.query` | Caller owns DB client | KEEP by ADR; package has no pool knowledge. |
| `packages/platform-merge` | Caller-injected `PlatformMergeDbClient.query` / `PoolClient` | Caller owns DB client | KEEP by ADR; merge engine stays pg-style but must only be entered through sanctioned callers. |

## Permanent KEEP zones from prior ADR

These are not candidates for wholesale Drizzle/query-builder migration in R0:

- SQL migration runners and ledgers, including `apps/integrator/src/infra/db/migrate.ts`.
- Queue/claim paths with `FOR UPDATE SKIP LOCKED`: integrator projection/job/outgoing queues and `apps/media-worker/src/jobs/claim.ts`.
- Ops and one-off scripts, provided they do not become runtime application paths.
- Cross-schema reads from integrator into `public.*` where the integrator process owns the runtime.
- Legacy Rubitime / booking tables marked couple-with-lifecycle: `rubitime_*`, old `booking_*`, `patient_bookings`, `appointment_records`.
- Package-level pg abstractions in `packages/booking-rubitime-sync` and `packages/platform-merge`.

R0 still needs these zones to be explicit in guards/allowlists, otherwise the CI guard would either be noisy or force low-value rewrites.

## Dedicated client inventory

Runtime `.connect()` files:

| Area | Count | Files |
|---|---:|---|
| Webapp runtime | 24 | `apps/webapp/src/app-layer/doctor/createDoctorClient.ts`; `apps/webapp/src/app-layer/integrator/messengerPhoneHttpBindExecute.ts`; `apps/webapp/src/infra/adminAuditLog.ts`; `apps/webapp/src/infra/db/client.ts`; `apps/webapp/src/infra/integratorPlatformUserMerge.ts`; `apps/webapp/src/infra/multipartSessionLock.ts`; `apps/webapp/src/infra/platformUserFullPurge.ts`; `apps/webapp/src/infra/repos/mediaPreviewWorker.ts`; `apps/webapp/src/infra/repos/mediaUploadSessionsRepo.ts`; `apps/webapp/src/infra/repos/pgAppointmentProjection.ts`; `apps/webapp/src/infra/repos/pgChannelPreferences.ts`; `apps/webapp/src/infra/repos/pgDoctorBroadcastDelivery.ts`; `apps/webapp/src/infra/repos/pgDoctorMotivationQuotesEditor.ts`; `apps/webapp/src/infra/repos/pgIdentityResolution.ts`; `apps/webapp/src/infra/repos/pgOnlineIntake.ts`; `apps/webapp/src/infra/repos/pgPhoneMessengerBind.ts`; `apps/webapp/src/infra/repos/pgSupportCommunication.ts`; `apps/webapp/src/infra/repos/pgUserByPhone.ts`; `apps/webapp/src/infra/repos/pgUserProjection.ts`; `apps/webapp/src/infra/repos/pgWebPushSubscriptions.ts`; `apps/webapp/src/infra/repos/s3MediaStorage.ts`; `apps/webapp/src/infra/strictPlatformUserPurge.ts`; `apps/webapp/src/infra/userLifecycleLock.ts`; `apps/webapp/src/modules/auth/channelLink.ts` |
| Integrator runtime | 4 | `apps/integrator/src/infra/db/client.ts`; `apps/integrator/src/infra/db/pgAdvisoryLock.ts`; `apps/integrator/src/infra/db/repos/schedulerLocks.ts`; `apps/integrator/src/integrations/rubitime/rubitimeApiThrottle.ts` |
| Media worker runtime | 1 | `apps/media-worker/src/jobs/claim.ts` |

Ops/script `.connect()` files:

- `apps/webapp/scripts/purge-placeholder-bookings.ts`
- `apps/webapp/scripts/user-phone-admin.ts`
- `apps/webapp/scripts/sanitize-reschedule-count.ts`
- `apps/webapp/scripts/backfill-rubitime-records-and-clients.ts`
- `apps/webapp/scripts/migrate-fio-dev.ts`
- `apps/webapp/scripts/realign-webapp-integrator-user-projection.ts`
- `apps/webapp/scripts/consolidate-specialist-identity.ts`
- `apps/webapp/scripts/seed-booking-catalog-tochka-zdorovya.ts`
- `apps/integrator/src/infra/scripts/stage6-historical-time-backfill.ts`

S3 target: runtime checkouts move to one `withClient()` / `withTransaction()` per process trunk. Ops scripts stay explicitly classified.

## Pool provider inventory

Runtime `new Pool` / `new PgPool` files:

| File | Current role | S4 disposition |
|---|---|---|
| `apps/webapp/src/infra/db/client.ts` | Webapp singleton pool. | KEEP as provider, add named provider/hook seam. |
| `apps/integrator/src/infra/db/client.ts` | Integrator singleton pool. | KEEP as provider, add named provider/hook seam. |
| `apps/media-worker/src/main.ts` | Media worker process pool. | Move behind named provider with hook seam. |
| `apps/webapp/src/infra/platformUserFullPurge.ts` | Separate integrator purge pool keyed by connection string. | Move behind named provider and document role/context. |
| `apps/integrator/src/infra/db/migrate.ts` | Boot migration pool. | KEEP as migrator/admin provider, not app-role runtime. |

Script-only pools:

- `scripts/check-telegram-users.ts`
- `apps/webapp/scripts/user-phone-admin.ts`
- `apps/webapp/scripts/migrate-fio-dev.ts`
- `apps/integrator/src/infra/scripts/projection-health.ts`
- `apps/integrator/src/infra/scripts/stage6-historical-time-backfill.ts`

## Port/layer bypass inventory for S1

The broad grep finds 54 webapp files under `modules`, `app-layer`, and `app` using DB helpers or pool injection. Not all are equal violations: some are composition/gate callers passing `getPool()` into infra functions; S1 should first remove raw SQL and direct infra DB access from domain/application layers, then leave ordinary DI/composition call sites alone.

High-confidence S1 candidates:

| File | Why it is a candidate |
|---|---|
| `apps/webapp/src/modules/auth/channelLink.ts` | Module imports DB transport and uses `getPool()`/dedicated client. Move SQL to infra repo + module port. |
| `apps/webapp/src/modules/doctor-clients/clientArchiveChange.ts` | Module calls `getPool().query(...)` for role precheck. Move to infra repo/port. |
| `apps/webapp/src/modules/system-settings/configAdapter.ts` | Module reads `system_settings` via raw SQL. S2 may own this specific read path. |
| `apps/webapp/src/modules/reminders/disableReminderMessengerTopic.ts` | Module owns SQL via caller-injected pool. Move to repo/port or sanctioned accessor. |
| `apps/webapp/src/modules/reminders/loadWarmupsSectionSlugs.ts` | Module owns SQL via caller-injected pool. Move to repo/port or sanctioned accessor. |
| `apps/webapp/src/app-layer/doctor/createDoctorClient.ts` | App-layer SQL + dedicated client. Move DB work to infra repo and call through DI/service. |
| `apps/webapp/src/app-layer/integrator/messengerPhoneHttpBindExecute.ts` | App-layer cross-schema SQL + dedicated client. Move DB work to infra repo/provider. |
| `apps/webapp/src/app-layer/health/collectAdminSystemHealthData.ts` | App-layer SQL/read helpers. Move data access behind infra repo if not pure composition. |
| `apps/webapp/src/app-layer/media/adminTranscodeHealthMetrics.ts` | App-layer SQL. Move to infra repo. |
| `apps/webapp/src/app-layer/media/videoHlsLegacyBackfill.ts` | App-layer SQL with injected pool. Move to infra repo. |
| `apps/webapp/src/app-layer/messaging/resolvePatientTelegramUsernameMention.ts` | App-layer SQL. Move to infra repo/port. |
| `apps/webapp/src/app-layer/platform-user/recordPublicBookingMergeCandidates.ts` | App-layer SQL with injected pool. Move to infra repo. |
| `apps/webapp/src/app-layer/platform-user/resolveOrCreateUserByPhone.ts` | App-layer SQL with injected pool. Move to infra repo. |
| `apps/webapp/src/app/api/doctor/account/timezone/route.ts` | Route owns SQL. Route should call service/repo through deps. |
| `apps/webapp/src/app/api/doctor/clients/[userId]/permanent-delete/route.ts` | Route calls `getPool().query(...)` for role precheck; also noted by `RAW_SQL_RULING.md`. |
| `apps/webapp/src/app/app/doctor/patients/[userId]/page.tsx` | Page owns SQL. Page should call app deps/repo. |
| `apps/webapp/src/app/app/doctor/patients/[userId]/programs/[instanceId]/page.tsx` | Page owns SQL. Page should call app deps/repo. |
| `apps/webapp/src/app/app/settings/page.tsx` | Page owns SQL. Page should call service/repo. |

Composition/gate call sites to review before changing:

- Routes that pass `getPool()` into existing infra repos, audit log helpers, merge helpers, multipart locks, or reminder handlers.
- `apps/webapp/src/app-layer/db/drizzle.ts`, which is the Drizzle composition root over `getPool()`.
- `apps/webapp/src/app-layer/product-analytics/recordAuthRegistration.ts`, `guards/requireRole.ts`, patient access gates, and health/audit wrappers where `getPool()` may be composition rather than domain SQL.

## `system_settings` read/write surface

Canonical webapp accessor:

- `apps/webapp/src/infra/repos/pgSystemSettings.ts`

Bypassers that S2 must close or explicitly classify:

| File | Current query |
|---|---|
| `apps/webapp/src/infra/repos/pgBookingEngine.ts` | `SELECT value_json FROM system_settings ...` |
| `apps/webapp/src/infra/repos/pgBookingRubitimeBridge.ts` | `SELECT value_json FROM system_settings ...` |
| `apps/webapp/src/modules/system-settings/configAdapter.ts` | `SELECT value_json FROM system_settings ...` |
| `apps/media-worker/src/pipelineEnabled.ts` | `SELECT value_json FROM public.system_settings ...` |
| `apps/media-worker/src/watermarkEnabled.ts` | `SELECT value_json FROM public.system_settings ...` |
| `apps/integrator/src/infra/db/publicSystemSettings.ts` | `SELECT value_json FROM public.system_settings ...` |

Writes/mirror:

- Webapp writes must remain through `createSystemSettingsService().updateSetting` and `syncSettingToIntegrator`.
- Integrator signed sync still writes `integrator.system_settings` in `apps/integrator/src/integrations/bersoncare/settingsSyncRoute.ts`.
- `apps/webapp/src/infra/platformUserFullPurge.ts` and `apps/webapp/scripts/user-phone-admin.ts` update `system_settings.updated_by` only as purge/admin cleanup; classify before adding CI grep.

S2 guard should allow canonical accessors and documented cleanup/sync paths, and fail any new direct `SELECT ... FROM system_settings`.

## Integrator `db.query` correction

`docs/_TODO/SAAS_FOUNDATION/RAW_SQL_AUDIT.md` §2.2 overstates direct `db.query` in integrator repos. Current grep for non-test integrator sources shows direct runtime `db.query` in:

- `apps/integrator/src/infra/db/client.ts` — DbPort transport + healthcheck.
- `apps/integrator/src/infra/db/migrate.ts` — migration runner, KEEP.
- `apps/integrator/src/infra/scripts/resync-rubitime-records.ts` — ops script, KEEP/script.

Runtime repos now use `runIntegratorSql(...)` or `DbPort.query` through the transport; the audit conclusion still stands, but the S0 baseline should use this corrected count.

## Handoff to next R0 stages

- **S1:** start with high-confidence webapp layer bypasses above. Keep behavior unchanged and move SQL to `infra/repos` + ports/DI. Do not touch tenancy/org/RLS.
- **S2:** centralize `system_settings` reads and add grep guard after the surface is closed.
- **S3:** add process-local `withClient()` / `withTransaction()` and migrate runtime dedicated-client files. Queue/advisory/tx paths should go through the helper, not disappear.
- **S4:** name pool providers and add dormant identity hooks to webapp, integrator, media-worker and purge/migration provider paths.
- **S5:** encode the final allowlist in CI guards only after S1-S4 reduce noise.
- **S6:** produce final funnel coverage report and full validation.
