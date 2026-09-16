# Funnel coverage report — R0 DB access chokepoint

Date: 2026-07-04
Branch: `codex/saas-roadmap-foundation`

## Scope

R0 is a behavior-preserving pre-SaaS chokepoint initiative. It does not add `org_id`, RLS, tenancy semantics, schema migrations, billing, marketplace, product-platform work, or UI polish.

## Process trunks

| Process / path                                   | Pool provider                                                               | Checkout / transaction path                                                                                | Dormant identity hook                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Webapp main runtime                              | `apps/webapp/src/infra/db/webappPoolProvider.ts`                            | `apps/webapp/src/infra/db/withClient.ts` (`withPoolClient`, `withPoolTransaction`, `startPoolTransaction`) | `prepareWebappPoolClient`; `prepareClientForRequest`          |
| Webapp integrator purge cleanup                  | `apps/webapp/src/infra/db/integratorPurgePoolProvider.ts`                   | `apps/webapp/src/infra/db/withClient.ts`                                                                   | `prepareIntegratorPurgePoolClient`; `prepareClientForRequest` |
| Integrator main runtime                          | `apps/integrator/src/infra/db/integratorPoolProvider.ts`                    | `apps/integrator/src/infra/db/withClient.ts` (`checkoutIntegratorPoolClient`)                              | `prepareIntegratorPoolClient`; `prepareIntegratorClient`      |
| Integrator migrator                              | `apps/integrator/src/infra/db/integratorMigrationPoolProvider.ts`           | migrator `Pool.query` transport                                                                            | `prepareIntegratorMigrationPoolClient`                        |
| Integrator projection-health ops script          | `apps/integrator/src/infra/scripts/projectionHealthPoolProvider.ts`         | script `ProjectionHealthQueryable` transport                                                               | `prepareProjectionHealthPoolClient`                           |
| Integrator stage6 historical backfill ops script | `apps/integrator/src/infra/scripts/stage6HistoricalBackfillPoolProvider.ts` | script-owned paired sessions + savepoints (`KEEP`)                                                         | `prepareStage6HistoricalBackfillPoolClient`                   |
| Media worker                                     | `apps/media-worker/src/poolProvider.ts`                                     | `apps/media-worker/src/withClient.ts` (`startMediaWorkerTransaction`)                                      | `prepareMediaWorkerPoolClient`; `prepareMediaWorkerClient`    |

## Verified inventory

`new Pool` / `new PgPool` appears only in named provider files:

- `apps/webapp/src/infra/db/webappPoolProvider.ts`
- `apps/webapp/src/infra/db/integratorPurgePoolProvider.ts`
- `apps/integrator/src/infra/db/integratorPoolProvider.ts`
- `apps/integrator/src/infra/db/integratorMigrationPoolProvider.ts`
- `apps/integrator/src/infra/scripts/projectionHealthPoolProvider.ts`
- `apps/integrator/src/infra/scripts/stage6HistoricalBackfillPoolProvider.ts`
- `apps/media-worker/src/poolProvider.ts`

Runtime `.connect()` appears only in checkout helpers:

- `apps/webapp/src/infra/db/withClient.ts`
- `apps/integrator/src/infra/db/withClient.ts`
- `apps/media-worker/src/withClient.ts`

The only non-helper `.connect()` is the documented one-off ops KEEP path:

- `apps/integrator/src/infra/scripts/stage6-historical-time-backfill.ts`

Reason: it owns paired integrator/webapp sessions and row-level `SAVEPOINT` flow. This is not request runtime.

## Guards

`pnpm ci` starts with `pnpm lint`.

Root `pnpm lint` runs:

- `eslint .`
- `node scripts/check-db-chokepoint.mjs`
- `pnpm --dir apps/webapp run lint`

`scripts/check-db-chokepoint.mjs` blocks:

- `new Pool` / `new PgPool` outside named provider files;
- `.connect()` outside checkout helpers and the documented stage6 ops KEEP path;
- raw SQL signals in guarded webapp layers (`modules/**`, `app-layer/**`, `app/**/route.ts`, `page.tsx`, `actions.ts`) outside the explicit S5 residual allowlist.

Webapp lint also runs:

- `node apps/webapp/scripts/check-system-settings-accessors.mjs`

That guard blocks new direct `system_settings` reads outside canonical accessors.

## Known residuals

Strict "zero raw SQL in every guarded layer" is intentionally represented as a guarded allowlist, not as silent drift:

- module residual SQL fragments:
  - `apps/webapp/src/modules/analytics/analyticsAudience.ts`
  - `apps/webapp/src/modules/booking-rubitime-bridge/recoverExistingProjection.ts`
  - `apps/webapp/src/modules/doctor-clients/activeMessengerBindingSql.ts`
- app-layer Drizzle metric fragments:
  - `apps/webapp/src/app-layer/health/adminReminderPipelineMetrics.ts`
  - `apps/webapp/src/app-layer/health/adminWebPushHealthMetrics.ts`
  - `apps/webapp/src/app-layer/media/adminPlaybackHealthMetrics.ts`
  - `apps/webapp/src/app-layer/media/hlsProxyErrorEvents.ts`
  - `apps/webapp/src/app-layer/media/playbackClientEvents.ts`
  - `apps/webapp/src/app-layer/media/playbackHourlyRetention.ts`
  - `apps/webapp/src/app-layer/media/playbackStatsHourly.ts`
  - `apps/webapp/src/app-layer/stats/loadAdminReminderStats.ts`
  - `apps/webapp/src/app-layer/stats/reminderNotificationPeopleStats.ts`

New growth in those zones now requires an explicit guard allowlist change.

## Acceptance commands

Read-only/guard checks:

- `rg -n "new Pool\\b|new PgPool\\b|new pg\\.Pool\\b" apps/webapp/src apps/integrator/src apps/media-worker/src --glob "*.ts" --glob "!**/*.test.ts" --glob "!**/*.devDb.integration.ts"`
- `rg -n "\\.connect\\(" apps/webapp/src apps/integrator/src apps/media-worker/src --glob "*.ts" --glob "!**/*.test.ts" --glob "!**/*.devDb.integration.ts"`
- `rg -n "pool\\.on\\(['\\\"]connect|Dormant SAAS hook|DB principal setup" apps/webapp/src/infra/db apps/integrator/src/infra/db apps/integrator/src/infra/scripts apps/media-worker/src --glob "*Provider.ts" --glob "*.ts"`
- `node scripts/check-db-chokepoint.mjs`
- `node scripts/check-db-chokepoint.mjs --self-test`
- `node apps/webapp/scripts/check-system-settings-accessors.mjs`

Full validation:

- `bash /home/dev/orch/run-tests.sh "pnpm run ci"`

Result on 2026-07-04: PASS, wrapper runtime 805s.

Render smoke:

- Current worktree dev server: `next dev --webpack -H 127.0.0.1 -p 6201`
- Auth: `/api/auth/dev-bypass?token=dev%3Aadmin` -> 200, `/api/me` -> `{ ok: true, role: "admin", hasUser: true }`
- `/app/doctor/analytics` -> 200
- `/app/settings` -> 200
- `/app/doctor/system-health` -> 200
- `/app/patient` as admin -> 307 to `/app/doctor?app_access_denied=1`, final 200

## Result

The R0 DB access chokepoint passed S6 validation: all database access paths are enumerable through provider/checkout trunks or documented ops KEEP paths, CI guards block regressions, full CI is green, and key authenticated pages render without DB chokepoint regressions.
