# P0.7.1 Writer Census Inventory

Status: P0.7.1 inventory-only artifact. No writer code changes, no RLS policy work, no DB mutation.

Sources reconciled:

- `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/FUNNEL_COVERAGE_REPORT.md`
- `docs/_TODO/SAAS_FOUNDATION/RAW_SQL_AUDIT.md`
- `docs/_TODO/SAAS_FOUNDATION/scope-derivation/tiers-218.tsv`
- `docs/_TODO/SAAS_FOUNDATION/scope-derivation/p0-4-batches.tsv`
- Fresh code-index and `rg` scans from this branch after P0.6.1.

## Repro Commands

```bash
bash /home/dev/brain/tools/codeq.sh "SAAS P0.7 writer census scoped writers raw SQL audit DB access funnel" --repo bcb --k 8
bash /home/dev/brain/tools/code-search.sh "WRITER_CENSUS" --repo bcb -k 10
bash /home/dev/brain/tools/code-search.sh "INSERT INTO" --repo bcb -k 10

rg -l "INSERT\\s+INTO|UPDATE\\s+[a-zA-Z_][a-zA-Z0-9_.]*\\s+SET|DELETE\\s+FROM|\\.insert\\([a-zA-Z_][a-zA-Z0-9_]*\\)|\\.update\\([a-zA-Z_][a-zA-Z0-9_]*\\)|\\.delete\\([a-zA-Z_][a-zA-Z0-9_]*\\)" \
  apps/webapp/src apps/integrator/src apps/media-worker/src packages/booking-rubitime-sync/src packages/platform-merge/src \
  --glob "*.ts" --glob "!**/*.test.ts" --glob "!**/*.spec.ts" --glob "!**/*.devDb.integration.ts"
```

Fresh write-signal upper-bound count: 215 files:

| Family | Count |
|---|---:|
| `apps/webapp/src` | 163 |
| `apps/integrator/src` | 46 |
| `apps/media-worker/src` | 2 |
| `packages/booking-rubitime-sync/src` | 1 |
| `packages/platform-merge/src` | 3 |

This is an upper bound: it includes Drizzle writes and some non-SCOPED writes. `RAW_SQL_AUDIT.md` remains the classified baseline for SCOPED raw writers.

## DB_ACCESS Reconciliation

P0.6.1 added the dormant principal carrier at the existing checkout/transaction chokepoints. P0.7.1 finds that writers still fall into these DB_ACCESS families:

| DB access family | Coverage state | P0.7 implication |
|---|---|---|
| Webapp `runWebappPgText` / `runWebappSql` / Drizzle singleton | Covered by central webapp pool, but not yet pinned to a request principal for non-transaction statements. | P0.7.2 must either run SCOPED writers in transaction context or add a safe per-statement strategy before enforcement. |
| Webapp `withPoolTransaction` / `startPoolTransaction` | P0.6.1 applies `app.org` after `BEGIN` when context is set. | Ready for P0.7.2 writer-family wiring. |
| Integrator `createDbPort().tx` | P0.6.1 applies `app.org` after `BEGIN` when context is set. | Ready for P0.7.3/P0.7.4 writer-family wiring. |
| Integrator plain `db.query` / `runIntegratorSql` | Central pool, but no transaction-local principal today. | P0.7.3/P0.7.4 must classify per route/job and introduce context before SCOPED writes. |
| Media-worker `startMediaWorkerTransaction` | P0.6.1 applies `app.org` after `BEGIN` when context is set. | `jobs/claim.ts` still uses its own claim transaction and needs explicit P0.7.5 handling. |
| Separate pools / boot migrators / ops scripts | Named by DB_ACCESS funnel; not request runtime. | BOOTSTRAP/migrator-only. Keep out of app-role RLS path until role cutover. |

## Process Family Census

### Webapp Routes / Actions / App Layer

| Entrypoint family | Writer files / ports | SCOPED treatment |
|---|---|---|
| Doctor/admin content, tests, recommendations, references, comments | `pgContentSections`, `pgContentPages`, `pgClinicalTests`, `pgRecommendations`, `pgReferences`, `pgComments`, `pgProgramItemDiscussion` | Mostly catalog-org or polymorphic resolver (`P0.4.P8`, `P0.4.D`). Needs current doctor org context in P0.7.2. |
| Doctor patient clinical/card writes | `pgPatientClinical`, `pgPatientComorbidities`, `pgDoctorNotes`, `pgPatientFiles`, `pgPatientPayments`, `pgSpecialistTasks` | Patient-org / patient-or-author-org / assignee-or-patient-org. Needs doctor workspace org and patient enrollment validation in P0.7.2. |
| Treatment programs / LFK / tests | `pgTreatmentProgram`, `pgTreatmentProgramInstance`, `pgTreatmentProgramEvents`, `pgLfkAssignments`, `pgLfkDiary`, `pgLfkExercises`, `pgLfkTemplates`, `pgTreatmentProgramTestAttempts`, `pgTestSets` | Mixed patient-org, catalog-org, parent-denorm, and test-attempt paths. Needs per-writer mapping before P0.7.2. |
| Reminders / notifications / support | `pgReminderProjection`, `pgReminderRules`, `pgReminderJournal`, `pgWebPushOnlyReminders`, `pgNotificationDeliveryAttempts`, `pgSupportCommunication`, `mergeLegacySupportConversations`, `pgMessageLog` | Patient-org and parent-denorm. Integrator M2M routes under `app/api/integrator/**` enter these ports. |
| Media library / previews / playback analytics | `s3MediaStorage`, `mediaUploadSessionsRepo`, `mediaPreviewWorker`, `pgMediaTranscodeJobs`, playback event app-layer files | Media-owner-org / user-or-media-org / parent-denorm. Needs P0.7.2 for webapp writers and P0.7.5 for media-worker. |
| Broadcasts / audit / admin audit | `pgDoctorBroadcastDelivery`, `pgBroadcastAudit`, `adminAuditLog` | Audit actor org and audit parent denorm. Needs doctor/admin org context. |
| Booking/payments/memberships/product purchases | `pgPayments`, `pgMemberships`, `pgBookingAppointmentLifecycle`, `pgClientHistory`, booking payment routes and `/api/payments/**` webhooks | Mostly existing `be_*` org-direct tables plus payment/user timeline refs. Must be explicitly mapped before P0.7.6. |
| Platform merge / booking merge candidates | `app-layer/platform-user/recordPublicBookingMergeCandidates`, `platform-merge` package callers | `patient_merge_candidates` already direct-org; platform merge touches many SCOPED patient rows. Needs scoped caller contract before P0.7.2/P0.7.6. |

No server actions with direct DB write were found as a separate family in this pass; current route/page raw SQL write signals are covered by the route/app-layer/port families above.

### Integrator API / Bot / Webhooks

| Entrypoint family | Writer files / ports | SCOPED treatment |
|---|---|---|
| Telegram/MAX inbound webhooks and event gateway | `integrations/telegram/webhook.ts`, `integrations/max/webhook.ts` -> `createDbWritePort` / `writePort.ts` / `messageThreads.ts` | `integrator.conversations`, `message_drafts`, `user_questions`, parent message tables. Needs bridge identity/user org in P0.7.3. |
| BersonCare M2M routes | `integrations/bersoncare/*Route.ts` | Mix of BOOTSTRAP/INFRA plus SCOPED reminder/contact writes. `settingsSyncRoute` is `integrator.system_settings` BOOTSTRAP, not SCOPED. |
| Rubitime webhook / booking integration | `integrations/rubitime/*`, `booking-rubitime-sync` package | Current booking mirror writes mostly LEGACY `patient_bookings` / Rubitime tables. No P0.7 SCOPED context except downstream notification/support side effects. |
| Google Calendar sync | `integrations/google-calendar/*` | Reads/writes booking/calendar integration data; treat as INFRA/LEGACY unless it reaches `be_*`/patient rows through ports. Needs confirmation before P0.7.3. |
| Operator incident / webhook status | `recordIntegrationWebhookOutcome`, `reportOperatorFailure` | `integration_webhook_*`, `operator_incidents`, `operator_health_*` mostly INFRA; user-bearing failure archive is SCOPED on webapp side. |

### Integrator Worker / Scheduler

| Runtime | Writer files / ports | SCOPED treatment |
|---|---|---|
| Worker retry/projection loop | `infra/runtime/worker/*`, `jobQueuePort`, `projectionWorker`, `outgoingDeliveryWorker` | Queue tables are INFRA, but job execution can call SCOPED write ports (`notificationDeliveryAttempts`, reminders, support/message threads). Needs job-derived org context in P0.7.4. |
| Scheduler tick | `infra/runtime/scheduler/*`, `createPostgresJobQueue`, reminder planning/dispatch ports | Generates due reminder jobs through INFRA queue and may hit SCOPED reminder occurrences/logs. Needs rule/org-derived context in P0.7.4. |
| Broadcast intent menu worker | `doctorBroadcastIntentMenu.ts` | Writes `public.broadcast_audit` (SCOPED audit actor org) from worker context. Needs audit/org source before P0.7.4. |

### Media Worker

| Writer files | Tables | SCOPED treatment |
|---|---|---|
| `processTranscodeJob.ts` | `public.media_files`, `public.media_transcode_jobs` | Media-parent / transcode-job parent denorm. Needs job `organization_id` context in P0.7.5. |
| `processProgramSubmissionTranscode.ts` | `public.media_files`, `public.media_transcode_jobs` | Same as above. |
| `persistVideoDurationSeconds.ts` | `public.media_files` | Media-owner org. |
| `jobs/claim.ts` | `public.media_transcode_jobs` | Claim transaction must set org from queued job or remain migrator/worker-role until per-job context exists. |

### Boot / Migration / Ops Paths

| Path | Classification |
|---|---|
| `apps/integrator/src/infra/db/migrate.ts` | BOOTSTRAP/migrator-only. Runs schema migrations and ledgers; do not apply request org context. |
| `apps/webapp/db/drizzle-migrations/**` and `apps/integrator/src/infra/db/migrations/**` | BOOTSTRAP/migrator-only SQL. Out of app writer migration scope. |
| Webapp/integrator one-off scripts named in `RAW_SQL_AUDIT.md` §3.1a | Ops/migrator-only. Must not run under non-bypass app role once FORCE RLS is enabled. |

## SCOPED Writer Matrix

Classified SCOPED writer files inherited from `RAW_SQL_AUDIT.md` §3.3 and reconciled with P0.4 batches:

| Table family | Writer files | Process | Org path |
|---|---|---|---|
| Media files/jobs/uploads | `s3MediaStorage`, `mediaPreviewWorker`, `mediaUploadSessionsRepo`, `pgMediaFileIntakeResolve`, `pgMediaTranscodeJobs`, media-worker transcode files | webapp, media-worker | media owner / parent denorm |
| Reminders and reminder logs | `pgReminderProjection`, `pgReminderRules`, `pgReminderJournal`, `pgWebPushOnlyReminders`, `integrator repos/reminders.ts` | webapp, integrator | patient org / parent denorm |
| Support and messages | `pgSupportCommunication`, `mergeLegacySupportConversations`, integrator `messageThreads`, `writePort` | webapp, integrator | patient org / identity bridge / parent denorm |
| Clinical/card data | `pgClinicalTests`, `pgDoctorNotes`, `pgPatientClinical`, `pgPatientComorbidities`, `pgPatientFiles`, `pgPatientPayments` | webapp | patient org / author validation |
| Treatment/LFK/tests | `pgTreatmentProgram*`, `pgProgramActionLog`, `pgLfk*`, `pgTestSets`, `pgTreatmentProgramTestAttempts`, platform-merge selected updates | webapp, package | patient org / catalog org / parent denorm |
| Content/catalog/audit | `pgContentSections`, `pgContentPages`, `pgCourses`, `pgRecommendations`, `pgReferences`, `pgDoctorMotivationQuotesEditor`, `adminAuditLog`, `pgBroadcastAudit`, `pgDoctorBroadcastDelivery` | webapp, integrator worker for broadcast audit | catalog org / audit actor org / parent denorm |
| Analytics/user media events | playback app-layer files, `pgProductAnalytics`, `pgHealthFailureArchive` | webapp | user org / media org |
| Integrator scoped tables | `contacts`, `content_access_grants`, `conversations`, `message_drafts`, `user_questions`, `mailing_logs`, `mailings`, reminder child tables | integrator | bridge user / identity bridge / parent denorm / single-org root |
| Merge packages | `packages/platform-merge/src/pgPlatformUserMerge.ts`, `mergeContactFallback.ts` | caller-provided client | caller must provide scoped transaction; touches multiple SCOPED patient rows |

## Blockers Before P0.7.2+

- The fresh write-signal scan finds many Drizzle writers not individually classified in `RAW_SQL_AUDIT.md`; P0.7.2 must use the table-level P0.4 batch map, not only the older raw-SQL table.
- Payment and membership routes write existing `be_*` org-direct tables and payment history/event tables. They are covered as a family here, but need a dedicated P0.7.6 mapping before code changes.
- Integrator worker/scheduler writes often start from INFRA queue rows and then touch SCOPED rows. P0.7.4 must define how org is derived from job payload, reminder rule, broadcast audit row, or bridge identity before setting `app.org`.
- Media-worker `jobs/claim.ts` claims before loading the full media/job row. P0.7.5 must decide whether claim remains worker-role/INFRA until the job org is loaded, or whether claim query itself becomes org-aware.
- `platform-merge` and `booking-rubitime-sync` are caller-transport packages. `platform-merge` is SCOPED and must require an already-scoped transaction. `booking-rubitime-sync` is LEGACY `patient_bookings` today.
- `integrator.mailings` is classified SCOPED/direct-org in the SAAS artifacts, but this pass found no active runtime writer. Confirm it as no-writer/migration-only before P0.7.3/P0.7.4 changes assume a runtime entrypoint.

## P0.7.1 Done / Explicitly Not Done

Done:

- Reconciled process families against DB_ACCESS chokepoint coverage.
- Reconciled known SCOPED raw writers against P0.4 org-resolution classes.
- Covered webapp routes/app-layer, integrator API/bot, worker/scheduler, media-worker, payment/webhook, and boot/migration paths.

Not done:

- No writer code was changed.
- No P0.7.2+ context application.
- No RLS policies, SQL renderer, role flip, DB writes, or dev/prod DB access.
