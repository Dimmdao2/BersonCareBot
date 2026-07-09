# T0 Tenant Context Cutover Checklist

Status: T0.0 audit/decomposition artifact.

T0 is R2 from `ROADMAP_TO_SAAS.md`: make runtime reads/writes carry a tenant principal and prove the non-bypass role path before any production enforcement. T0 is not Phase 0. Phase 0 is complete and remains the dormant foundation.

Canonical inputs:

- `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/FUNNEL_COVERAGE_REPORT.md`
- `docs/_TODO/SAAS_FOUNDATION/CORRECTED_PLAN.md`
- `docs/_TODO/SAAS_FOUNDATION/P0_7_WRITER_CENSUS.md`
- `docs/_TODO/SAAS_FOUNDATION/P0_8_CODE_FACTS.md`
- `docs/_TODO/SAAS_FOUNDATION/P0_13_ISOLATION_FIXTURES_CHECKLIST.md`
- `docs/_TODO/SAAS_FOUNDATION/T0_DB_ACCESS_SURFACE.md`

Hard stop:

- Do not enable production enforcement without explicit owner approval.
- Do not read `/opt/env`, prod DB, or `bcb_webapp_prod`.
- Do not write to `bcb_webapp_dev` or test/prod application DBs unless a later checklist explicitly authorizes a staging/test cutover smoke.
- Do not invent a default organization when an org source is missing.
- Do not replace RLS with ad hoc service-layer tenant filtering. T0 must use the existing chokepoint and principal carrier.
- Do not broaden into R3 organization lifecycle, R5 billing/branding, or SaaS product UX.

## T0.0 Audit And Decomposition

Goal: create an executable cutover map without runtime implementation.

Checklist:

- [x] Confirm branch/status drift: `codex/saas-roadmap-foundation` and `origin/feat/doctor-ui-rebuild` both at `f3d8b87df1968c592f5cd6c67f462f2bc1f1a1c9`.
- [x] Create taskdb task for T0.0 and set it `doing`.
- [x] Run four read-only explorer audits: webapp DB surface, integrator/media-worker surface, DB_ACCESS/chokepoint contracts, Phase 0 artifacts/gates.
- [x] Snapshot current DB access surface in `T0_DB_ACCESS_SURFACE.md`.
- [x] Create this checklist.
- [x] Run targeted docs/check validation.
- [x] Run read-only audit on the plan/checklist.
- [x] Update `LOG.md`, commit, backup-push, then update taskdb: `commit_ref <hash>`, `seal_test true`, `seal_audit true`, `status done`, and a concise final `note`.

Local gate:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && node scripts/check-db-chokepoint.mjs && node scripts/check-db-chokepoint.mjs --self-test && git diff --check"
```

Skipped scope:

- No runtime code changes.
- No principal carrier changes.
- No non-bypass role grants/env changes.
- No staging/test/prod DB writes.
- No RLS enforcement flip.
- No full CI unless later T0.0 edits touch repo-level scripts/checkers in a way that requires it.

Rollback/cutover notes:

- Docs-only. Revert the T0 docs commit if decomposition is rejected.

## T0.1 Chokepoint Inventory Hardening

Goal: turn the current surface snapshot into an enforceable inventory before any broad cutover.

Checklist:

- [x] Reconcile `T0_DB_ACCESS_SURFACE.md` with `scripts/check-db-chokepoint.mjs` and `P0_7_WRITER_CENSUS.md`.
- [x] Split DB paths into: transaction-principal-safe, plain pool/Drizzle unsafe under RLS, infra/legacy/global exempt, and needs-decision.
- [x] Record the runtime principal contract gap: current carrier sets `app.org` only; patient/user GUC design remains blocked from route slices until T0.5 defines it.
- [x] Record the patient-wall rule: no T0.3/T0.4 slice may claim patient-wall enforcement until the carrier/API is explicitly designed.
- [x] Add or update a static inventory guard only if it prevents new unclassified T0 entrypoints without large allowlists.
- [x] Wire the T0 inventory guard into `check:saas-db-regression` only if it stays deterministic and cheap.

Local gate:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && node scripts/check-db-chokepoint.mjs && git diff --check"
```

Skipped scope:

- No endpoint rewrites.
- No runtime role flip.
- No RLS policy changes.

Rollback/cutover notes:

- Any guard added here must be removable independently from runtime changes.

## T0.2 Request Principal And Context Propagation Plan

Goal: define central webapp request/process wrappers before moving route families.

Checklist:

- [x] Add a small app-layer principal wrapper design for doctor/admin workspace context.
- [x] Define patient enrollment/org resolution for patient APIs without default-org fallback.
- [x] Define public/booking org source rules: host/profile/link/explicit booking data, or legacy exempt.
- [x] Define M2M/integrator-origin webapp route org source rules.
- [x] Document which wrappers are allowed to call `runWithDbOrganizationPrincipal`.

Artifact:

- `T0_2_REQUEST_PRINCIPAL_CONTEXT_PLAN.md`

Local gate:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && pnpm --dir apps/webapp typecheck && git diff --check"
```

Skipped scope:

- No mass route conversion.
- No frontend UX changes.
- No staging/test/prod DB writes.

Rollback/cutover notes:

- Wrappers must be dormant when org context is absent until the explicit shadow/enforcement stages.

## T0.3 Webapp Read/Write Path Slices

Goal: convert webapp runtime families in small, testable slices.

Completed slices:

- [x] T0.3.1: added `apps/webapp/src/app-layer/principal/withOrganizationPrincipal.ts` with focused tests and migrated `apps/webapp/src/app/app/doctor/content/motivation/actions.ts` reorder path from direct `runWithDbOrganizationPrincipal` to the named doctor workspace principal helper.
- [x] T0.3.2: made `apps/webapp/src/app-layer/db/drizzle.ts` apply the current `app.org` principal inside Drizzle transactions when AsyncLocalStorage principal exists; added focused tests and narrowed the DB chokepoint guard exception to exactly one `set_config('app.org', ...)` fragment.
- [x] T0.3.3: wrapped only the canonical admin/doctor booking-engine appointment lifecycle mutations (`manual-cancel`, `manual-reschedule`, `manual-no-show`) with `withDoctorWorkspacePrincipal(...)`. Auth gates, body parsing, Rubitime pre-sync/rollback, and after-canonical side effects remain outside the wrapper; booking helpers are not globally wrapped.
- [x] T0.3.4: migrated the doctor CMS reorder server actions for content pages and content sections from role-only access to `requireDoctorWorkspaceContext()` and wrapped only their transaction-safe reorder mutations with `withDoctorWorkspacePrincipal(...)`.
- [x] T0.3.5: wrapped only admin/doctor booking-engine working schedule template create/delete mutations with `withDoctorWorkspacePrincipal(...)` and converted the matching PostgreSQL repo methods to Drizzle transactions. GET/list and `POST?action=apply` remain unwrapped/deferred.
- [x] T0.3.6: migrated doctor treatment-program test-attempt accept route from role-only auth to `requireDoctorWorkspaceApiContext()` and wrapped only the transaction-safe `doctorAcceptTestAttempt(...)` mutation with `withDoctorWorkspacePrincipal(...)`. Instance/patient access pre-reads remain outside the wrapper.
- [x] T0.3.7: split membership patient-package recalc into a transaction-safe DB phase (`recalcPastSessionsForPackageDbPhase`) and post-DB best-effort calendar refresh, moved package load/status refresh/candidate/usages/recalc writes under `runWithPackageLock(...)`, and wrapped only the admin/doctor recalc DB phase with `withDoctorWorkspacePrincipal(...)`. Membership calendar refresh plus doctor `getAppointment(...)` / `emitPackageLinkedCalendarSync(...)` remain outside the principal wrapper.
- [x] T0.3.8: migrated only the doctor reference catalog batch save server action from `requireDoctorAccess()` to `requireDoctorWorkspaceContext()` and wrapped only `deps.references.saveCatalog(...)` with `withDoctorWorkspacePrincipal(...)`. The reference repo now performs the save-catalog category lookup inside `runWebappTransaction(...)` via `runWebappPgText(..., tx)` so category lookup and writes share the transaction executor; single-item reference actions and admin archive routes remain unchanged.
- [x] T0.3.9: migrated doctor reference single-item staff actions (`addReferenceItem`, `saveReferenceItem`, `toggleReferenceItem`, `softDeleteReferenceItem`) to `requireDoctorWorkspaceContext()` and wrapped only their staff mutations with `withDoctorWorkspacePrincipal(...)`. `pgReferencesPort.insertItemStaff/updateItem/softDeleteItem` now execute through `runWebappTransaction(...)`; staff insert copies `reference_categories.organization_id` into new `reference_items` rows.
- [x] T0.3.10: migrated narrow doctor CMS page/section toggle actions (`applyContentLifecycle`, `setContentPageRequiresAuth`, `setSectionRequiresAuth`, `setSectionVisibility`) to `requireDoctorWorkspaceContext()` and wrapped only `contentPages.updateLifecycle` / `contentSections.update` mutations with `withDoctorWorkspacePrincipal(...)`. `pgContentPages.updateLifecycle` and `pgContentSections.update` now execute through Drizzle transactions so the existing transaction principal hook applies.
- [x] T0.3.11: migrated remaining doctor motivation quote write actions (`upsertMotivationQuote`, `setQuoteArchived`, `setQuoteActive`) to `requireDoctorWorkspaceContext()` and wrapped only `doctorMotivationQuotesEditor.upsertQuote/setQuoteArchived/setQuoteActive` mutations with `withDoctorWorkspacePrincipal(...)`. `pgDoctorMotivationQuotesEditor` now runs those quote writes through `runWebappTransaction(...)`; reorder remains covered by T0.3.1.
- [x] T0.3.12: migrated doctor booking appointment staff comment POST from manual role/default-org checks to `requireDoctorBookingEngine()` workspace context and wrapped only `clientHistory.createAppointmentComment(...)` with `withDoctorWorkspacePrincipal(...)`. `pgClientHistory.createAppointmentComment` now inserts through a Drizzle transaction. GET/list comments remains a deferred read-path slice.
- [x] T0.3.13: migrated doctor/admin booking working-days PUT mutations (`upsert`, `close`, `clear`) to `withDoctorWorkspacePrincipal(...)` around only `bookingScheduling.upsertWorkingDays/closeWorkingDays/clearWorkingDays`. `pgBookingScheduling` now runs those working-days writes through Drizzle transactions. GET/list working-days remains a deferred read-path slice.
- [x] T0.3.14: migrated doctor/admin booking package catalog upserts to `withDoctorWorkspacePrincipal(...)` around only `memberships.upsertCatalogPackage`. `pgMemberships.upsertCatalogPackage` now runs package/items write plus readback through a Drizzle transaction. GET/list and PATCH pre-read remain outside-principal/deferred read paths.
- [x] T0.3.15: migrated doctor/admin booking product catalog `POST` upserts to `withDoctorWorkspacePrincipal(...)` around only `products.upsertProduct`. `pgProducts.upsertProduct` now runs create/update branches through Drizzle transactions. Product GET/list and pay-link/purchase/payment flows remain outside-principal/deferred slices.
- [x] T0.3.16: migrated doctor/admin booking working-hours mutations (`POST`, `PATCH`, `DELETE`) to `withDoctorWorkspacePrincipal(...)` around only `bookingScheduling.createWorkingHours/updateWorkingHours/deactivateWorkingHours`. `pgBookingScheduling` now runs those working-hours writes through Drizzle transactions. GET/list and doctor ownership pre-reads remain outside-principal.
- [x] T0.3.17: migrated admin booking schedule-block mutations (`POST`, `DELETE`) to `withDoctorWorkspacePrincipal(...)` around only `bookingScheduling.createScheduleBlock/deleteScheduleBlock`. `pgBookingScheduling` now runs those schedule-block writes through Drizzle transactions. GET/list remains outside-principal.
- [x] T0.3.18: migrated admin booking form-field `POST` upsert to `withDoctorWorkspacePrincipal(...)` around only `bookingForm.upsertAdminField`. The route now uses workspace `gate.ctx.organizationId` instead of default-org fallback for GET/POST. `pgBookingForm.upsertFieldAdmin` now runs create/update branches through Drizzle transactions.
- [x] T0.3.19: migrated doctor/admin booking working-schedule-template `POST ?action=apply` to `withDoctorWorkspacePrincipal(...)` around `bookingScheduling.applyScheduleTemplate`. Doctor apply still resolves/forces own specialist before the wrapper; `applyScheduleTemplate` writes via transaction-backed `upsertWorkingDays`.
- [x] T0.3.20: migrated doctor CMS section metadata actions (`saveContentSection`, `attachArticleSectionToSystemFolder`) to `requireDoctorWorkspaceContext()` and `withDoctorWorkspacePrincipal(...)` around only `contentSections.upsert/update`. `pgContentSections.upsert` now runs through a Drizzle transaction and stamps `organization_id` from the active DB principal.
- [x] T0.3.21: migrated doctor CMS section rename/delete actions (`renameContentSectionSlug`, `deleteContentSection`) to `requireDoctorWorkspaceContext()` and `withDoctorWorkspacePrincipal(...)` around only `contentSections.renameSectionSlug/deleteSectionWithPageReassign`. Underlying repo methods were already transaction-backed.
- [x] T0.3.22: migrated doctor CMS page save action (`saveContentPage`) to `requireDoctorWorkspaceContext()` and `withDoctorWorkspacePrincipal(...)` around only `contentPages.updateFull/upsert`. `pgContentPages.upsert/updateFull` now run through Drizzle transactions and stamp `organization_id` from the active DB principal when present; pre-write reads and slug-retarget side effects remain outside-principal.
- [x] T0.3.23: ran the doctor/admin write-path tail audit. Result: not clean; residuals were converted into #613-#620. T0.4 remains blocked until #613-#620 are done/sealed and a final tail audit passes.
- [x] T0.3.24: migrated doctor/admin booking manual appointment create POST mutations to `withDoctorWorkspacePrincipal(...)` around only `ctx.service.createAppointment`. The admin route uses the effective request/body `orgId` for the principal context; slot checks, Rubitime sync/rollback, package reserve, and events remain outside-principal.
- [x] T0.3.25: migrated doctor/admin booking cancelled appointment purge routes to `withDoctorWorkspacePrincipal(...)` around only the local projection purge via `staffPurgeCancelledAppointment.runLocalPurge`. Appointment validation/pre-reads, Rubitime remove-record, and `booking.deleted` emission remain outside-principal.
- [x] T0.3.26: migrated doctor/admin booking package detach/refund/unlink routes to `withDoctorWorkspacePrincipal(...)` around only `memberships.detachAppointmentPackage` via `runPackageDetach.runDetachMutation`. Appointment/policy/settings pre-reads and package calendar sync remain outside-principal.
- [x] T0.3.27: migrated doctor broadcast `executeBroadcastAction` and `saveDraftAction` to `requireDoctorWorkspaceContext()` and `withDoctorWorkspacePrincipal(...)` around the delivery commit and draft-save writes. `pgBroadcastDrafts.saveDraft` now runs through a Drizzle transaction so `app.org` is applied by the central transaction hook. Preview/list/load/count read paths remain role-only.
- [x] T0.3.28: migrated doctor LFK exercise/template catalog mutations to workspace principal with narrow service write runners. Exercise/template pre-read and usage validation remains outside-principal; exercise create/update/archive/unarchive/bulk-create and template create/update/updateExercises/publish/archive/unarchive writes run under source-specific principal callbacks and transaction-backed repos.
- [x] T0.3.29: migrated doctor recommendation, clinical-test, and test-set catalog mutations in server actions and `/api/doctor/...` write routes to workspace principal with narrow service write runners. Recommendation/clinical/test-set validation, pre-reads, usage checks, and test-set item/test validation remain outside-principal; recommendation/clinical/test-set create/update/archive and test-set item replace writes run under source-specific principal callbacks and transaction-backed repos.
- [x] T0.3.30: migrated doctor course and treatment-program-template catalog API mutations to workspace principal with narrow service write runners. Course intro/usage prechecks and treatment-template validation/prechecks remain outside-principal; course create/update/archive plus template create/update/archive/delete, constructor stage/group/item/reorder, and LFK/test-set expand writes run under source-specific principal callbacks and transaction-backed repos.
- [x] T0.3.31: migrated admin media file/folder mutations and admin reference archive to workspace principal with narrow write runners. Media writes keep doctor/admin workspace access because the admin media API backs the doctor media library; reference archive requires admin+adminMode. Media prechecks, S3 phases, usage checks, folder validation, and reference item pre-read remain outside-principal; media file/folder DB writes and `pgReferences.archiveItem` run through transaction-backed repos.
- [x] T0.3.32: ran the final doctor/admin write-path tail audit after #613-#620. Result: not clean; residual clusters converted into #623-#628. T0.4 remains blocked until #623-#628 are done/sealed and a clean final tail audit passes.
- [x] T0.3.33: migrated booking-engine residual mutations to workspace principal: admin branch/service/room/specialist/specialist-room/availability/policy/prepayment/scheduling-settings writes, doctor/admin patient-package create/offer/notes/consume, product pay-link, patient-product consume, and doctor booking-profile PATCH. Membership/product service write runners keep prechecks, provider calls, calendar refresh, system-settings sync, and readbacks outside-principal while DB writes run under source-specific principal callbacks and transaction-backed repos.
- [x] T0.3.34: migrated doctor patient clinical/EHR/media residual mutations to organization principal: patient profile/FIO/physical, anamnesis, visits, complaints, diagnoses/status/catalog, comorbidities, files, cash payments, acquiring ledger record writes, doctor support-settings writes, and patient program-submission DB row/folder creation. Validation, most GET/read paths, S3 object/presign phases, acquiring provider calls, payment settings reads, and readbacks remain outside-principal; touched clinical/profile/support/file/comorbidity/payment/media/client-media-folder repo writes run through transaction-backed or principal-aware chokepoints and stamp `organization_id` from active principal where applicable.

Recommended order:

1. Doctor/admin workspace routes and the remaining server actions.
2. Patient routes with enrollment-derived org.
3. Media upload/multipart/program-submission routes.
4. Booking/public/payment routes after org source classification.
5. Integrator M2M webapp routes.
6. Residual guarded-layer raw SQL allowlist files.

Checklist for each slice:

- [ ] Name the files, tables, org source, and whether the path is read, write, or both.
- [ ] Wrap the entrypoint or repo mutation through the central principal API.
- [ ] Ensure SCOPED writes that need `SET LOCAL app.org` run through transaction-safe paths.
- [ ] Preserve no-principal dormant behavior until shadow/enforcement stages.
- [ ] Add focused tests for correct org, missing org behavior, and no default-org fallback.

Local gate template:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && pnpm --dir apps/webapp exec vitest run <focused-tests> --reporter verbose && pnpm --dir apps/webapp typecheck && pnpm --dir apps/webapp exec eslint <changed-files> && git diff --check"
```

Skipped scope:

- No integrator/media-worker changes in webapp slices unless the slice explicitly covers an M2M boundary.
- No production enforcement.

Rollback/cutover notes:

- Each route family must be independently revertible.

## T0.4-pre Integrator/Public Schema Cleanup Gate

Goal: remove or explicitly classify integrator/public duplicate mirrors before principalizing integrator and media-worker runtime paths.

Canonical roadmap: [`T0_4_PRE_INTEGRATOR_SCHEMA_CLEANUP_PLAN.md`](T0_4_PRE_INTEGRATOR_SCHEMA_CLEANUP_PLAN.md).

This gate is intended to run after T0.3 and before T0.4. The purpose is to avoid spending T0.4 effort wrapping tables and flows that should be removed, moved to `public`, or retained only as technical integrator state.

Minimum gate:

- [ ] Inventory `public`/`integrator` duplicate and legacy candidates: settings, reminders, Rubitime projections, channel contacts, conversations/questions, queues/logs.
- [ ] Produce a table matrix with readers, writers, row counts, DB dependencies, target owner, migration/backfill need, and drop readiness.
- [ ] Record ADR decisions for settings mirror removal, reminder scheduling ownership, Rubitime sunset, channel contacts, conversations/questions, and retention.
- [ ] Build dry-run-first audit/backfill/reconcile/drop scripts that can be rehearsed on dev/test and repeated on production.
- [ ] Remove runtime code references before any drop.
- [ ] Validate on dev and test with focused tests, SaaS DB regression, and drop/access-denied smoke.
- [ ] Update this checklist and `T0_DB_ACCESS_SURFACE.md` so T0.4 covers only surviving integrator/media-worker paths.

Skipped scope:

- No destructive production DB action without explicit owner approval, backup, and test rollout pass.
- No real external sends during dev/test cleanup.
- No broad re-architecture of technical queues/logs unless they are true business mirrors or block tenant safety.

Rollback/cutover notes:

- Prefer a staged sequence: disable writers, deploy no-reference code, rehearse drop in test, then drop in production.
- Dropping stale tables is the final enforcement proof, but only after code and DB dependency scans show no surviving references.

## T0.4 Integrator And Media-Worker Path Slices

Goal: make process-runtime DB paths principal-safe without breaking queues, webhooks, or legacy Rubitime behavior.

Recommended order:

1. Integrator DB trunk: `DbPort.query`, `runIntegratorSql`, and pool Drizzle behavior under principal.
2. Integrator API entrypoint-to-org map: Telegram, MAX, BersonCare M2M, settings sync, Rubitime routes.
3. Integrator worker/scheduler: queue jobs, projection outbox, outgoing delivery, `schedule.tick`.
4. Media-worker queue claim/reclaim strategy under RLS.
5. Media-worker processing/failure/duration writes under job org.

Checklist for each slice:

- [ ] Classify every touched path as SCOPED, INFRA, LEGACY, BOOTSTRAP, or TELEMETRY.
- [ ] Prove no scoped path silently falls back to default org.
- [ ] Keep queue discovery and stale reclaim mechanics safe before org is known.
- [ ] Add fake-client tests that assert `SELECT set_config('app.org', ...)` is applied after `BEGIN` when required.
- [ ] Add scratch RLS smoke only when the slice changes enforcement-relevant DB behavior.

Local gate template:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && pnpm --dir apps/integrator exec vitest run <focused-tests> --reporter verbose && pnpm --dir apps/media-worker exec vitest run <focused-tests> --reporter verbose && pnpm --dir apps/integrator typecheck && pnpm --dir apps/media-worker typecheck && pnpm exec eslint <changed-files> && git diff --check"
```

Skipped scope:

- No real external channel sends.
- No prod/test/dev application DB mutation unless a later staging smoke explicitly permits it.
- No Rubitime re-architecture.

Rollback/cutover notes:

- Runtime trunk changes must be behind dormant behavior and covered by focused tests before any entrypoint mass conversion.

## T0.5 GUC Shadow Mode

Goal: make missing/wrong principal observable before enforcing.

Checklist:

- [ ] Define the full runtime GUC set. Current code sets only `app.org`; patient-wall enforcement may need an additional principal.
- [ ] Add shadow-only reporting for missing org, wrong org, and unset principal without changing production behavior.
- [ ] Ensure reports aggregate counts and route/job keys only; no PII samples.
- [ ] Make shadow reporting disabled by default unless explicitly enabled in non-prod/prod-parity.
- [ ] Document how to interpret expected legacy/infra denies vs real scoped leaks.

Local gate:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && pnpm --dir apps/webapp typecheck && pnpm --dir apps/integrator typecheck && pnpm --dir apps/media-worker typecheck && git diff --check"
```

Skipped scope:

- No blocking deny behavior.
- No production enforcement.
- No PII logging.

Rollback/cutover notes:

- Shadow reporting must be a config/flag off switch, not tied to migrations.

## T0.6 Non-Bypass Role Staging/Scratch Smoke

Goal: prove app runtime behavior under a non-owner, `NOBYPASSRLS` role in disposable or staging/prod-parity environments.

Checklist:

- [ ] Reuse P0.5 role contract and P0.13 synthetic fixtures.
- [ ] Create disposable `bcb_saas_*` or approved staging smoke only; never prod.
- [ ] Prove doctor/admin org wall and patient wall fail closed.
- [ ] Prove current single-clinic dormant smoke still passes under intended role and GUC setup.
- [ ] Document grants, migrations role, app role, worker role, and ops/migrator bypass list.

Local gate:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-p0-13-db-isolation.mjs && git diff --check"
```

Skipped scope:

- No `/opt/env` changes.
- No prod role flip.
- No real external channels.

Rollback/cutover notes:

- Store exact role/grant rollback SQL in the stage doc before staging role changes.

## T0.7 Shadow-Run Reporting

Goal: run the principal/RLS shadow path long enough to collect cutover evidence.

Checklist:

- [ ] Run shadow mode only in approved staging/test/prod-parity first.
- [ ] Capture aggregate counts by route/job/table class and expected exempt tier.
- [ ] Verify no unresolved missing-principal scoped path remains.
- [ ] Verify current single-clinic flows stay stable.
- [ ] Record exact time window, commit, env, role, and checks in `LOG.md`.

Local/staging gate:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && pnpm run ci"
```

Skipped scope:

- No production enforcement flip.
- No broad product/UI changes.

Rollback/cutover notes:

- Roll back by disabling shadow flag and restoring previous runtime DB role if staging role was changed.

## T0.8 Cutover Readiness Gate

Goal: prepare the owner go/no-go packet for enforcement.

Checklist:

- [ ] Full CI green on the exact commit.
- [ ] `pnpm run check:saas-db-regression` green.
- [ ] Non-bypass role smoke green in approved prod-parity/staging.
- [ ] Shadow-run report has no unresolved scoped principal gaps.
- [ ] Rollback plan names the exact flags, role/env changes, migrations, service restarts, and verification commands.
- [ ] Explicit owner approval captured before any production enforcement.

Gate:

```bash
bash /home/dev/orch/run-tests.sh "pnpm install --frozen-lockfile && pnpm run ci && pnpm run check:saas-db-regression && git diff --check"
```

Skipped scope:

- R3 organization lifecycle.
- R5 SaaS billing/branding/custom domain.
- Any production enforcement without owner approval.

Rollback/cutover notes:

- Cutover must be reversible without data loss: disable enforcement flag, restore previous app DB role, restart affected services, and verify current single-clinic smoke.
