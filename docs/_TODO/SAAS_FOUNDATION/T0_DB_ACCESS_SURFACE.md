# T0 DB Access Surface Snapshot

Status: T0.0 read-only snapshot, 2026-07-09.

This file records the runtime surface that T0 must cut over. It is not a replacement for static guards. It gives the next micro-stage a starting point so agents do not rediscover the same facts with broad scans.

## Branch And Baseline

- Worktree: `/home/dev/dev-projects/BersonCareBot-saas-roadmap`
- Branch: `codex/saas-roadmap-foundation`
- Baseline commit: `f3d8b87df1968c592f5cd6c67f462f2bc1f1a1c9`
- `origin/codex/saas-roadmap-foundation`: same commit
- `origin/feat/doctor-ui-rebuild`: same commit
- Worktree at snapshot start: clean

## Existing Chokepoints

Webapp:

- `apps/webapp/src/infra/db/client.ts` - `getPool()`
- `apps/webapp/src/app-layer/db/drizzle.ts` - `getDrizzle()`; T0.3.2 applies the current `app.org` principal inside Drizzle transactions when AsyncLocalStorage principal exists.
- `apps/webapp/src/infra/db/runWebappSql.ts` - `runWebappSql`, `runWebappPgText`, `runPgPoolPgText`
- `apps/webapp/src/infra/db/withClient.ts` - `withClient`, `withTransaction`

Integrator:

- `apps/integrator/src/infra/db/client.ts` - process `DbPort`
- `apps/integrator/src/infra/db/integratorPoolProvider.ts` - runtime pool provider
- `apps/integrator/src/infra/db/runIntegratorSql.ts` - Drizzle SQL bridge
- `apps/integrator/src/infra/db/withClient.ts` - checkout/transaction helpers

Media-worker:

- `apps/media-worker/src/poolProvider.ts` - pool provider
- `apps/media-worker/src/withClient.ts` - transaction helper
- `apps/media-worker/src/runMediaWorkerSql.ts` - SQL bridge and optional organization principal helper

Principal carrier:

- `packages/db-principal/src/index.ts`
- Current runtime carrier stores only `organizationId` and applies `SELECT set_config('app.org', $1, true)` inside transaction chokepoints.
- `app.patient_user_id` appears in descriptor/smoke artifacts, not in the runtime carrier. If T0 enforces a patient wall through GUC, this is a separate design stage.

## Snapshot Counts

Commands were run against non-test TypeScript files unless otherwise noted.

| Surface | Count |
|---|---:|
| Webapp non-test files using DB helper APIs (explorer count) | 185 |
| Webapp modules/app-layer/app files using DB helper APIs (explorer count) | 45 |
| API route files total (explorer count) | 489 |
| API route files with DB signals | 27 |
| Server action files total (top-level `"use server"` files) | 28 |
| Server action files with DB signals | 1 |
| Files using `getPool(` | 74 |
| Files using `getDrizzle(` | 86 |
| Files using `runWebappPgText` | 66 |
| Runtime `.connect(` files | 4 |
| Runtime `new Pool` files | 7 |
| Runtime files using `runWithDbOrganizationPrincipal` | 6 |
| Guarded-layer raw SQL allowlist files in `check-db-chokepoint.mjs` | 12 |

Guard status:

```bash
node scripts/check-db-chokepoint.mjs --self-test
node scripts/check-db-chokepoint.mjs
```

Both passed during T0.0.

## Webapp Route DB Signal Files

These route files had `getPool`, `getDrizzle`, `runWebappPgText`, direct query, or Drizzle SQL signals during T0.0:

- `apps/webapp/src/app/api/admin/audit-log/resolve/route.ts`
- `apps/webapp/src/app/api/admin/audit-log/route.ts`
- `apps/webapp/src/app/api/admin/booking-engine/public-appointments/route.ts`
- `apps/webapp/src/app/api/admin/health-failure-archive/clear/route.ts`
- `apps/webapp/src/app/api/admin/operator-incidents/resolve-all/route.ts`
- `apps/webapp/src/app/api/admin/users/[userId]/profile/route.ts`
- `apps/webapp/src/app/api/booking/public/create/route.ts`
- `apps/webapp/src/app/api/doctor/clients/[userId]/merge-candidates/route.ts`
- `apps/webapp/src/app/api/doctor/clients/integrator-merge/route.ts`
- `apps/webapp/src/app/api/doctor/clients/merge-preview/route.ts`
- `apps/webapp/src/app/api/doctor/clients/merge-user-search/route.ts`
- `apps/webapp/src/app/api/doctor/clients/merge/route.ts`
- `apps/webapp/src/app/api/doctor/clients/name-match-hints/route.ts`
- `apps/webapp/src/app/api/integrator/events/route.ts`
- `apps/webapp/src/app/api/integrator/reminders/messenger-topic/disable/route.ts`
- `apps/webapp/src/app/api/integrator/reminders/mute/route.ts`
- `apps/webapp/src/app/api/integrator/reminders/notification-settings/route.ts`
- `apps/webapp/src/app/api/integrator/reminders/notification-settings/toggle/route.ts`
- `apps/webapp/src/app/api/integrator/reminders/occurrences/done/route.ts`
- `apps/webapp/src/app/api/integrator/reminders/occurrences/skip/route.ts`
- `apps/webapp/src/app/api/integrator/reminders/occurrences/snooze/route.ts`
- `apps/webapp/src/app/api/internal/media-multipart/cleanup/route.ts`
- `apps/webapp/src/app/api/media/multipart/abort/route.ts`
- `apps/webapp/src/app/api/media/multipart/complete/route.ts`
- `apps/webapp/src/app/api/media/multipart/init/route.ts`
- `apps/webapp/src/app/api/media/presign/route.ts`
- `apps/webapp/src/app/api/patient/media/program-submission/presign/route.ts`

## Webapp Server Action Entrypoints

All App Router server action entrypoints at T0.1. Only one currently has a direct DB/principal signal, but all 28 top-level `"use server"` files are T0 entrypoints because most reach DB through services:

- `apps/webapp/src/app/app/doctor/broadcasts/actions.ts`
- `apps/webapp/src/app/app/doctor/clinical-tests/actions.ts`
- `apps/webapp/src/app/app/doctor/clinical-tests/actionsInline.ts`
- `apps/webapp/src/app/app/doctor/content/actions.ts`
- `apps/webapp/src/app/app/doctor/content/contentPageAuthActions.ts`
- `apps/webapp/src/app/app/doctor/content/inlineEditorActions.ts`
- `apps/webapp/src/app/app/doctor/content/lifecycleActions.ts`
- `apps/webapp/src/app/app/doctor/content/motivation/actions.ts`
- `apps/webapp/src/app/app/doctor/content/reorderContentPages.ts`
- `apps/webapp/src/app/app/doctor/content/sections/actions.ts`
- `apps/webapp/src/app/app/doctor/content/sections/reorderContentSections.ts`
- `apps/webapp/src/app/app/doctor/content/sections/sectionVisibilityActions.ts`
- `apps/webapp/src/app/app/doctor/exercises/actions.ts`
- `apps/webapp/src/app/app/doctor/exercises/actionsInline.ts`
- `apps/webapp/src/app/app/doctor/lfk-templates/actions.ts`
- `apps/webapp/src/app/app/doctor/patient-home/patientHomeDoctorSettingsActions.ts`
- `apps/webapp/src/app/app/doctor/recommendations/actions.ts`
- `apps/webapp/src/app/app/doctor/recommendations/actionsInline.ts`
- `apps/webapp/src/app/app/doctor/references/actions.ts`
- `apps/webapp/src/app/app/doctor/test-sets/actions.ts`
- `apps/webapp/src/app/app/doctor/test-sets/actionsInline.ts`
- `apps/webapp/src/app/app/patient/diary/lfk/actions.ts`
- `apps/webapp/src/app/app/patient/diary/symptoms/actions.ts`
- `apps/webapp/src/app/app/patient/notifications/notificationPrefsActions.ts`
- `apps/webapp/src/app/app/patient/profile/actions.ts`
- `apps/webapp/src/app/app/patient/reminders/actions.ts`
- `apps/webapp/src/app/app/settings/doctorNotificationPrefsActions.ts`
- `apps/webapp/src/app/app/settings/patient-home/actions.ts`

## Current Principal Coverage

Files using `runWithDbOrganizationPrincipal` in runtime code:

- `apps/integrator/src/infra/principal/organizationPrincipal.ts`
- `apps/media-worker/src/runMediaWorkerSql.ts`
- `apps/webapp/src/app-layer/principal/withOrganizationPrincipal.ts`
- `apps/webapp/src/infra/repos/pgPatientPayments.ts`
- `apps/webapp/src/infra/repos/pgPayments.ts`
- `packages/db-principal/src/index.ts`

Known coverage:

- Webapp payment and patient-payment write paths have focused org principal wiring from P0.7.6.
- Webapp motivation reorder action now uses the app-layer doctor workspace principal helper from T0.3.1.
- Webapp admin/doctor booking-engine manual appointment lifecycle mutation calls for cancel/reschedule/no-show now use the app-layer doctor workspace principal helper from T0.3.3. The surrounding pre-reads/external sync/side effects remain outside the wrapper until later slices classify those DB paths.
- Webapp doctor CMS content page/section reorder server actions now use the app-layer doctor workspace principal helper from T0.3.4 around their transaction-safe reorder mutations.
- Webapp admin/doctor booking-engine working schedule template create/delete mutations now use the app-layer doctor workspace principal helper from T0.3.5; the underlying PostgreSQL repo methods are transaction-bound so the Drizzle `app.org` hook applies. Listing and template application remain deferred.
- Webapp doctor treatment-program test-attempt accept route now uses the app-layer doctor workspace principal helper from T0.3.6 around only the transaction-safe accept mutation. Instance and client identity pre-reads remain outside the wrapper.
- Webapp admin/doctor booking-engine patient-package recalc routes now use the app-layer doctor workspace principal helper from T0.3.7 around only `memberships.recalcPastSessionsForPackageDbPhase(...)`. That service DB phase starts with `runWithPackageLock(...)` and includes package load, expiry refresh, candidate/usages reads, and recalc writes. Membership best-effort calendar refresh plus doctor `getAppointment(...)` / `emitPackageLinkedCalendarSync(...)` run after the wrapper.
- Webapp doctor reference catalog batch save action now uses `requireDoctorWorkspaceContext()` and the app-layer doctor workspace principal helper from T0.3.8 around only `deps.references.saveCatalog(...)`. `pgReferencesPort.saveCatalog(...)` now runs its category lookup and item reads/writes inside `runWebappTransaction(...)` with the transaction executor.
- Webapp doctor reference single-item staff actions now use `requireDoctorWorkspaceContext()` and the app-layer doctor workspace principal helper from T0.3.9 around only `deps.references.insertItemStaff/updateItem/softDeleteItem(...)`. `pgReferencesPort.insertItemStaff/updateItem/softDeleteItem` now run through `runWebappTransaction(...)`; staff insert copies the parent category `organization_id` to satisfy `reference_items` scoped writes.
- Webapp doctor CMS page/section toggle actions now use `requireDoctorWorkspaceContext()` and the app-layer doctor workspace principal helper from T0.3.10 around only `deps.contentPages.updateLifecycle(...)` / `deps.contentSections.update(...)`. `pgContentPages.updateLifecycle` and `pgContentSections.update` now run through Drizzle transactions so the existing transaction `app.org` hook applies.
- Webapp doctor motivation quote write actions now use `requireDoctorWorkspaceContext()` and the app-layer doctor workspace principal helper from T0.3.11 around only `deps.doctorMotivationQuotesEditor.upsertQuote/setQuoteArchived/setQuoteActive(...)`. `pgDoctorMotivationQuotesEditor` now runs those quote writes through `runWebappTransaction(...)` with the transaction executor.
- Webapp doctor appointment staff comment POST now uses `requireDoctorBookingEngine()` and the app-layer doctor workspace principal helper from T0.3.12 around only `deps.clientHistory.createAppointmentComment(...)`. `pgClientHistory.createAppointmentComment` now inserts through a Drizzle transaction; GET/list comments remains a deferred read-path slice.
- Telegram/MAX integrator webhooks already resolve org and wrap event pipeline through integrator organization principal helper.
- Media-worker transcode processing is wrapped by job organization where available.

Known gaps:

- Webapp plain `getDrizzle()` and pool-based reads/writes do not automatically pin `app.org`.
- Webapp doctor/admin gates resolve `organizationId`, but route handlers are not centrally wrapped.
- Patient APIs need enrollment-derived org, not default organization.
- Integrator `DbPort.query` and cached pool Drizzle paths are plain pool operations unless they run in `db.tx`.
- Scheduler has no outer org; scoped writes must derive org per job/row.
- Media-worker claim/reclaim happens before job org is known and needs an RLS-safe strategy.
- Rubitime routes need explicit classification: legacy exempt, infra/global, or derived org.

## Static Guard Boundaries

Existing guard:

- `scripts/check-db-chokepoint.mjs`
- `docs/_TODO/SAAS_FOUNDATION/scripts/check-t0-db-access-surface.mjs`
- included in `scripts/check-saas-db-regression.mjs`

It currently enforces:

- no runtime `new Pool` outside named provider allowlist;
- no runtime `.connect()` outside checkout helpers and documented ops keep path;
- no raw SQL signal in guarded webapp layers outside the current S5 allowlist.
- exact T0.1 route/action/principal inventory parity with current source discovery.
- the T0.3.2 Drizzle transaction principal hook has a narrow DB chokepoint guard exception for exactly one `set_config('app.org', ...)` SQL fragment, not a general app-layer SQL exception.

It does not enforce:

- that a route/action/repo ran under `runWithDbOrganizationPrincipal`;
- that a plain pool/Drizzle query was transaction-bound;
- that all SCOPED reads have a principal;
- that patient-wall GUCs are present.

T0.1 adds the inventory guard above. Later T0 stages should extend it only when a new exact inventory stays cheap and low-noise.

## T0 Risk Register

| Risk | Impact | First stage to address |
|---|---|---|
| Principal currently applies only inside transaction chokepoints | FORCE RLS can deny plain reads/writes unexpectedly | T0.1/T0.3/T0.4 |
| Runtime carrier lacks patient/user GUC | Patient-wall claims may be overstated | T0.1/T0.5 |
| Webapp route handlers pass `getPool()` into infra helpers | Org context may be resolved but not active during DB access | T0.2/T0.3 |
| Integrator `DbPort.query` bypasses `app.org` under ALS | Scoped bot/worker/scheduler reads may deny under RLS | T0.4 |
| Scheduler and queues do not have one request org | Need per-row/per-job org derivation | T0.4 |
| Media claim/reclaim occurs before org context exists | Queue discovery can break under RLS | T0.4/T0.6 |
| Rubitime path ownership is unclear | Legacy/booking rows may be misclassified | T0.4 |
| Shadow reporting could print PII if designed poorly | Security/compliance regression | T0.5/T0.7 |

## Recommended Next Discovery Commands

Use the code index before broad scans:

```bash
bash /home/dev/brain/tools/codeq.sh "T0 tenant principal route org source webapp" --repo bcb --k 8
bash /home/dev/brain/tools/code-search.sh "runWithDbOrganizationPrincipal" --repo bcb -k 20
```

Focused current-surface commands:

```bash
rg -l 'getPool\(|getDrizzle\(|runWebappPgText|pool\.query|client\.query|sql`' apps/webapp/src/app -g 'route.ts'
rg -l 'runWithDbOrganizationPrincipal' apps packages -g '*.ts' -g '!**/*.test.ts' -g '!**/*.spec.ts'
node scripts/check-db-chokepoint.mjs
pnpm run check:saas-db-regression
```
