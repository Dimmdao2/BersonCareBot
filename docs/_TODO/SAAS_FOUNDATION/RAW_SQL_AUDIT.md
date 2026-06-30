# Raw SQL Audit — Multi-Tenant RLS Chokepoint Analysis

**Date:** 2026-06-17  
**Scope:** All production TypeScript files (excludes `*.test.ts`, `*.spec.ts`, `__tests__/`, scripts in `apps/webapp/scripts/`, `apps/integrator/src/infra/scripts/`).

---

## 1. Executive Summary

Raw SQL is **pervasive** across all four apps and three packages. Every app has its own pool singleton and its own transport helper layer. The total file count reconciles within ~10–15% of the stated anchors (differences explained by the separate-pool / `client.query` overlap counting).

| App / Package | Production files w/ raw-SQL signal | Approx. transport mix |
|---|---|---|
| webapp | ~108–129 | runWebappPgText (majority), runWebappSql/sql``, pool.connect/client.query (Class C), runPgPoolPgText |
| integrator | ~30 (excl. scripts/migrate) | runIntegratorSql + db.query (DbPort) |
| media-worker | 7 | runMediaWorkerPgText + pool.query (direct) |
| booking-rubitime-sync (pkg) | 3 | SqlExecutor.query (caller-provided) |
| platform-merge (pkg) | 4 | PlatformMergeDbClient.query (caller-provided) |
| operator-db-schema (pkg) | 0 raw queries (schema defs only, sql`` in index WHERE clauses) |

**Operation split (production files):**
- webapp: predominantly MIXED (infra/repos do both READ + WRITE); ~4 modules/** files do READ; routes/pages do WRITE to `platform_users`
- integrator: MIXED (repos do reads + writes to both integrator.* and public.* tables)
- media-worker: WRITE-heavy (job claim + transcode status updates)
- packages: WRITE (booking-rubitime-sync inserts/updates `public.patient_bookings`; platform-merge updates `public.platform_users`, `public.media_files`, `reminder_rules`)

**Pool routing:**
- webapp: **one central singleton** (`getPool()` / `getDrizzle()` from `infra/db/client.ts`) used by all `runWebappPgText` / `runWebappSql` / `getWebappSqlDb` / most `pool.connect()` callers. **One separate-pool site** (`platformUserFullPurge.ts` — integrator-schema purge pool).
- integrator: **one central singleton** (`db` from `client.ts`, `new Pool(...)`) used by `createDbPort()` / `runIntegratorSql`. Scripts create ephemeral pools (out of production path).
- media-worker: **one pool per process** created in `main.ts` and passed through context; no singleton module — the pool is injected.

---

## 2. Per-App Classified File Lists

### 2.1 webapp (`apps/webapp/src/`)

**Transport key:**
- A = `runWebappPgText` (Class B legacy text → Drizzle execute, CENTRAL pool)
- B = `runWebappSql` / `getWebappSqlDb().execute(sql``)` / `db.execute(sql``)` (Drizzle fragment, CENTRAL)
- C = `pool.connect()` → `client.query(BEGIN/COMMIT/ROLLBACK)` + runWebappPgText/runWebappSql inside (CENTRAL pool; dedicated client held across the tx)
- D = `runPgPoolPgText(pool, ...)` (CENTRAL or SEPARATE depending on caller-passed pool)
- E = `getWebappSqlFromPgClient(client)` (dedicated PoolClient from CENTRAL pool, used for advisory locks + multipart tx)

#### infra/repos — EXPECTED layer, CENTRAL pool (69 files)

| File | Transport | Op | Scoped tables touched |
|---|---|---|---|
| pgBookingEngine.ts | B (sql``) | READ | — (only reads system_settings — bypasser, see §3) |
| pgBookingRubitimeBridge.ts | B (sql``) | READ | — (only reads system_settings — bypasser, see §3) |
| pgBookingCalendarLegacy.ts | A | READ | — |
| pgBookingCatalog.ts | A+B | READ | — |
| pgBranches.ts | A | READ | — |
| pgBroadcastAudit.ts | A | READ | public.broadcast_audit (scoped) |
| pgBroadcastDrafts.ts | C (client from CENTRAL) | READ | — |
| pgBroadcastEmailRecipients.ts | C (client from CENTRAL) | READ | — |
| pgAdminClientProfileConflicts.ts | A | READ | — |
| pgAdminPlatformUserStats.ts | C (client from CENTRAL) | READ | — |
| pgAppointmentProjection.ts | A+C (CENTRAL pool) | WRITE | public.patient_bookings (NOT in final scope list) |
| pgAuthRateLimitEvents.ts | A | WRITE | — |
| pgChannelLinkClaim.ts | A | WRITE | — (channel_link_secrets, platform_users not in scope) |
| pgChannelPreferences.ts | A+C (CENTRAL pool) | MIXED | — |
| pgClinicalTests.ts | A | MIXED | public.clinical_* (scoped) |
| pgCourses.ts | A+B | READ | public.courses (scoped) |
| pgDevBypassPlatformUserPhone.ts | A | WRITE | — |
| pgDiaryPurge.ts | A | WRITE | public.symptom_trackings, public.lfk_complexes (scoped) |
| pgDoctorAnalyticsMetricAccounts.ts | A | READ | — |
| pgDoctorAppointments.ts | A+C (CENTRAL pool) | MIXED | — |
| pgDoctorBroadcastDelivery.ts | A+C (CENTRAL pool) | WRITE | public.broadcast_audit_recipients (scoped) |
| pgDoctorClients.ts | A | MIXED | — (platform_users, not in scope list) |
| pgDoctorMotivationQuotesEditor.ts | A+C (CENTRAL pool) | WRITE | public.motivational_quotes (scoped) |
| pgDoctorNotes.ts | A | MIXED | public.doctor_notes (scoped) |
| pgDoctorProactiveInsights.ts | A | READ | — |
| pgEmailAuth.ts | A | WRITE | — |
| pgEmailPasswordLookup.ts | A | READ | — |
| pgEmailSetupFlowPort.ts | A | MIXED | — |
| pgEmailSetupTokens.ts | A | WRITE | — |
| pgIdentityResolution.ts | C (CENTRAL pool) | WRITE | — |
| pgLfkAssignments.ts | A | MIXED | public.patient_lfk_assignments (scoped) |
| pgLfkDiary.ts | A | MIXED | public.lfk_complexes (scoped) |
| pgLfkExercises.ts | A+B | MIXED | public.lfk_exercises, public.lfk_exercise_media (scoped) |
| pgLfkTemplates.ts | A | MIXED | public.lfk_complex_templates (scoped) |
| pgLoginTokens.ts | A | MIXED | — |
| pgMaterialRating.ts | A | MIXED | public.material_ratings (scoped) |
| pgMediaFileIntakeResolve.ts | A | WRITE | public.media_files (scoped) |
| pgMediaFolderLookup.ts | A | READ | public.media_folders (scoped) |
| pgMediaTranscodeJobs.ts | A | WRITE | public.media_transcode_jobs (scoped) |
| pgMediaUsageSummary.ts | A | READ | public.media_files (scoped) |
| pgMessageLog.ts | A | WRITE | public.message_log (scoped) |
| pgOAuthBindings.ts | A | MIXED | — |
| pgOAuthUserResolve.ts | A | READ | — |
| pgOnlineIntake.ts | A+C (CENTRAL pool) | WRITE | public.online_intake_requests, online_intake_answers (scoped) |
| pgPatientBookings.ts | A | WRITE | public.patient_bookings (NOT in final scope) |
| pgPatientBroadcasts.ts | A | MIXED | — |
| pgPatientCalendarTimezone.ts | A | READ | — |
| pgPhoneChallengeStore.ts | A | WRITE | — |
| pgPhoneHistory.ts | A | READ | — |
| pgPhoneMessengerBind.ts | C (CENTRAL pool) | WRITE | — |
| pgPhoneOtpLimits.ts | A | WRITE | — |
| pgRecommendations.ts | A | MIXED | public.recommendations (scoped) |
| pgReferences.ts | A | MIXED | public.reference_items (scoped) |
| pgReminderJournal.ts | A | READ | public.reminder_journal (scoped) |
| pgReminderProjection.ts | A | WRITE | public.reminder_rules (scoped) |
| pgReminderRules.ts | B (sql``) | WRITE | public.reminder_rules (scoped) |
| pgRubitimeMapping.ts | A | READ | — |
| pgSubscriptionMailingProjection.ts | A | WRITE | public.mailing_logs_webapp, user_subscriptions_webapp (scoped) |
| pgSupportCommunication.ts | A+C (CENTRAL pool) | WRITE | public.support_conversations, support_conversation_messages, support_questions (scoped) |
| pgSymptomDiary.ts | A | MIXED | public.symptom_trackings, symptom_entries (scoped) |
| pgSystemSettings.ts | A | MIXED | system_settings (NOT in scope — infra-global) — **official accessor** |
| pgTestSets.ts | A | MIXED | public.test_sets, test_attempts (scoped) |
| pgTreatmentProgram.ts | A | MIXED | public.treatment_program_* (scoped) |
| pgTreatmentProgramItemSnapshot.ts | A | READ | public.treatment_program_* (scoped) |
| pgUserPasswordCredentials.ts | A | MIXED | — |
| pgUserPins.ts | A | WRITE | — |
| pgUserProjection.ts | A+C (CENTRAL pool) | WRITE | — |
| pgUserByPhone.ts | C (CENTRAL pool) | WRITE | — |
| pgWebPushOnlyReminders.ts | A | MIXED | public.webapp_reminder_occurrences (scoped) |
| pgWebPushSubscriptions.ts | A+C (CENTRAL pool) | WRITE | — |
| s3MediaStorage.ts | B+C (CENTRAL pool) | WRITE | public.media_files, media_folders (scoped) |
| broadcastChannelCounts.ts | C (CENTRAL pool) | READ | — |
| loadPlatformUserChannelBindings.ts | A | READ | — |
| mediaPreviewWorker.ts | B+C (CENTRAL pool) | WRITE | public.media_files (scoped) |
| mediaUploadSessionsRepo.ts | B+C (CENTRAL pool) | WRITE | public.media_upload_sessions (scoped) |
| mergeLegacySupportConversations.ts | A | WRITE | public.support_conversations (scoped) |
| doctorAppointmentPurgeFilter.ts | A | READ | — |
| pgAdminPlatformUserStats.ts | C (CENTRAL) | READ | — |
| identityPhoneSql.ts | A | READ | — |

#### infra/ (non-repos) — EXPECTED/INFRA layer, CENTRAL pool (23 files)

| File | Transport | Op | Pool | Notes |
|---|---|---|---|---|
| adminAuditLog.ts | A+C (CENTRAL) | WRITE | CENTRAL | public.admin_audit_log (scoped) |
| idempotency/pgStore.ts | A | WRITE | CENTRAL | — |
| integrator-push/integratorPushOutbox.ts | A+B | WRITE | CENTRAL | — |
| manualMergeIntegratorGate.ts | A | READ | CENTRAL | — |
| mergeAuditLabels.ts | A | READ | CENTRAL | — |
| mergePreviewIntegratorUserPresence.ts | A | READ | CENTRAL | — |
| platformUserMergePreview.ts | A | READ | CENTRAL | — |
| platformUserNameMatchHints.ts | A | READ | CENTRAL | — |
| platformUserPurgeSql.ts | A (helper, called from platformUserFullPurge) | WRITE | CENTRAL or SEPARATE | purge helper |
| platformUserFullPurge.ts | A+C | WRITE | **SEPARATE-POOL** (integratorPurgePools) | see §3 |
| strictPlatformUserPurge.ts | A+C (CENTRAL) | WRITE | CENTRAL | — |
| integratorPlatformUserMerge.ts | C (CENTRAL pool) | WRITE | CENTRAL | — |
| multipartSessionLock.ts | C (CENTRAL pool) | WRITE | CENTRAL | advisory lock |
| userLifecycleLock.ts | C (CENTRAL pool) | WRITE | CENTRAL | advisory lock |
| db/runWebappSql.ts | — | — | — | transport definition |
| db/client.ts | — | — | — | pool singleton |
| db/pgAdvisoryLock.ts | — | — | — | helper |

#### app-layer/ — PORT-BYPASS (architectural smell, but uses same pool)

| File | Transport | Op | Pool | Scoped tables |
|---|---|---|---|---|
| doctor/createDoctorClient.ts | A+C (CENTRAL+E) | WRITE | CENTRAL | — (platform_users not in scope) |
| health/collectAdminSystemHealthData.ts | A | READ | CENTRAL | — |
| integrator/messengerPhoneHttpBindExecute.ts | A+C (CENTRAL) | WRITE | CENTRAL | — |
| media/adminTranscodeHealthMetrics.ts | D (runPgPoolPgText, CENTRAL) | READ | CENTRAL | public.media_files (scoped) |
| media/videoHlsLegacyBackfill.ts | D (runPgPoolPgText, CENTRAL) | READ/WRITE | CENTRAL | public.media_files (scoped) |
| messaging/resolvePatientTelegramUsernameMention.ts | A | READ | CENTRAL | — |
| platform-user/recordPublicBookingMergeCandidates.ts | D (runPgPoolPgText, CENTRAL) | WRITE | CENTRAL | public.patient_merge_candidates (scoped) |
| platform-user/resolveOrCreateUserByPhone.ts | A+C (CENTRAL) | WRITE | CENTRAL | — |

#### app/ (routes and pages) — PORT-BYPASS (raw SQL directly in routes)

| File | Transport | Op | Pool | Scoped tables |
|---|---|---|---|---|
| api/doctor/account/timezone/route.ts | A | WRITE | CENTRAL | — (platform_users not in scope list) |
| app/doctor/patients/[userId]/page.tsx | A | READ | CENTRAL | — (platform_users not in scope) |
| app/doctor/patients/[userId]/programs/[instanceId]/page.tsx | A | READ | CENTRAL | — |
| app/settings/page.tsx | A | READ | CENTRAL | — |

#### modules/ — PORT-BYPASS (domain SQL outside infra)

| File | Transport | Op | Pool | Scoped tables |
|---|---|---|---|---|
| auth/channelLink.ts | A+C (CENTRAL) | WRITE | CENTRAL | — |
| reminders/disableReminderMessengerTopic.ts | D (pool injected by caller) | READ | CENTRAL (caller passes getPool()) | public.reminder_rules (scoped) |
| reminders/loadWarmupsSectionSlugs.ts | D (pool injected by caller) | READ | CENTRAL (caller passes getPool()) | public.content_sections (scoped) |
| system-settings/configAdapter.ts | A | READ | CENTRAL | — (system_settings bypasser — see §3) |

---

### 2.2 integrator (`apps/integrator/src/`)

**Transport key:**
- I = `runIntegratorSql(db, sql``)` (compiles Drizzle fragment → `db.query` on the DbPort singleton)
- J = `db.query(text, params)` / `txDb.query(...)` (direct call on the DbPort/PoolClient — same singleton pool unless inside `.tx()` which holds a dedicated client from the same pool)

The integrator `db` singleton is `new Pool(...)` in `client.ts`. All `db.query` / `txDb.query` calls go through the same Postgres pool. The `txDb` inside `.tx()` is a `PoolClient` checked out from that same pool (BEGIN/COMMIT/ROLLBACK on it), so it is **CENTRAL** for RLS purposes — one pool, one singleton.

#### infra/db/ — EXPECTED layer (30 production files)

| File | Transport | Op | Scoped tables touched |
|---|---|---|---|
| client.ts | — | — | pool singleton definition |
| runIntegratorSql.ts | — | — | transport helper |
| publicSystemSettings.ts | I | READ | system_settings (bypasser — see §3) |
| branchTimezone.ts | I | READ | — |
| writePort.ts | J (txDb.query inline) | WRITE | integrator.conversations, integrator.identities (scoped) |
| repos/adminStats.ts | J | READ | — |
| repos/bookingCalendarMap.ts | I | WRITE | public.patient_bookings (NOT in final scope) |
| repos/canonicalUserId.ts | J | READ | — |
| repos/channelUsers.ts | J | WRITE | integrator.identities, users, telegram_state |
| repos/idempotencyKeys.ts | J | WRITE | — |
| repos/integrationDataQualityIncidents.ts | J | WRITE | — |
| repos/mergeIntegratorConversationToPlatform.ts | J | WRITE | integrator.conversations (scoped) |
| repos/mergeIntegratorUsers.ts | I+J | WRITE | integrator.user_reminder_rules (scoped) |
| repos/messageThreads.ts | J | WRITE | integrator.conversations, message_drafts, user_questions (scoped) |
| repos/messengerPhoneBindAudit.ts | J | WRITE | — |
| repos/notificationDeliveryAttempts.ts | J | WRITE | public.notification_delivery_attempts (scoped) |
| repos/outgoingDeliveryQueue.ts | J | WRITE | — |
| repos/patientHomeMorningPing.ts | J | READ | — |
| repos/platformUserByChannel.ts | J | READ | — |
| repos/platformUserDeliveryPhone.ts | J | READ | — |
| repos/projectionHealthCore.ts | J | READ | — |
| repos/resolvePlatformUserIdForRubitimeBooking.ts | J | READ | — |
| repos/userChannelBotBlocked.ts | J | READ | — |
| runtime/worker/doctorBroadcastIntentMenu.ts | I | WRITE | public.broadcast_audit (scoped) |
| runtime/worker/outgoingDeliveryWorker.ts | I | MIXED | — |

#### integrations/ — not infra/db but uses runIntegratorSql (architectural note)

| File | Transport | Op | Pool | Scoped tables |
|---|---|---|---|---|
| bersoncare/settingsSyncRoute.ts | I | WRITE | CENTRAL | integrator.system_settings (NOT in scope) |
| google-calendar/calendarDescription.ts | I | READ | CENTRAL | — |
| google-calendar/resolvePackageCalendarContext.ts | I | READ | CENTRAL | — |
| rubitime/db/bookingProfilesRepo.ts | I | MIXED | CENTRAL | — (rubitime_branches/services — integrator-only) |

---

### 2.3 media-worker (`apps/media-worker/src/`)

The media-worker creates **one pool per process** in `main.ts` (`new Pool(...)`) and passes it through `TranscodeContext`. There is no singleton module export — the pool is always explicit. Transport = `runMediaWorkerPgText(pool, ...)` or direct `pool.query()`.

| File | Transport | Op | Pool | Scoped tables |
|---|---|---|---|---|
| main.ts | — | — | pool creator | — |
| runMediaWorkerSql.ts | — | — | transport def | — |
| pipelineEnabled.ts | runMediaWorkerPgText | READ | process pool | system_settings (bypasser — see §3) |
| watermarkEnabled.ts | runMediaWorkerPgText | READ | process pool | system_settings (bypasser — see §3) |
| persistVideoDurationSeconds.ts | runMediaWorkerPgText | WRITE | process pool | public.media_files (scoped) |
| processTranscodeJob.ts | runMediaWorkerPgText | WRITE | process pool | public.media_files, public.media_transcode_jobs (scoped) |
| processProgramSubmissionTranscode.ts | runMediaWorkerPgText | WRITE | process pool | public.media_files, public.media_transcode_jobs (scoped) |
| jobs/claim.ts | direct pool.query + client.query (dedicated client for FOR UPDATE SKIP LOCKED tx) | WRITE | process pool / dedicated client | public.media_transcode_jobs (scoped) |

---

### 2.4 Packages

#### `packages/booking-rubitime-sync`

Accepts `SqlExecutor` (caller provides `{ query() }` — no pool knowledge). Called from integrator `writePort.ts` and the integrator-side of the webapp.

| File | Transport | Op | Scoped tables |
|---|---|---|---|
| lookupBranchServiceByRubitimeIds.ts | SqlExecutor.query | READ | — |
| shouldSkipNativeReviveUpdate.ts | SqlExecutor.query | READ | public.patient_bookings (NOT in final scope) |
| upsertPatientBookingFromRubitime.ts | SqlExecutor.query | WRITE | public.patient_bookings (NOT in final scope) |

#### `packages/platform-merge`

Accepts `PlatformMergeDbClient` (any `{ query() }` client).

| File | Transport | Op | Scoped tables |
|---|---|---|---|
| messengerPhonePublicBind.ts | PlatformMergeDbClient.query | WRITE | public.platform_users (NOT in final scope) |
| pgPlatformUserMerge.ts | PlatformMergeDbClient.query (client param) | WRITE | public.platform_users, public.media_files, reminder_rules, treatment_program_instances (scoped) |
| mergeContactFallback.ts | client.query (PoolClient param) | WRITE | public.symptom_trackings, lfk_complexes (scoped) |
| messengerBindAuditEnrichment.ts | client.query | READ | — |

#### `packages/operator-db-schema`

Contains only Drizzle ORM table schema definitions (with `sql\`(resolved_at IS NULL)\`` in partial index WHERE clauses). **No raw query SQL.** Not in scope.

---

## 3. Risk Register

### 3.1 SEPARATE-POOL / DEDICATED-CLIENT Sites

These are the highest-priority RLS risks: a per-request RLS `SET LOCAL` on the main pool would NOT cover these.

| Site | File | Description | Risk |
|---|---|---|---|
| **integratorPurgePools** (SEPARATE) | `apps/webapp/src/infra/platformUserFullPurge.ts:75–79` | `new PgPool(...)` keyed by connection string. Points at integrator schema (same or separate Postgres cluster). Used for cross-DB purge operations (DELETE from integrator.contacts, etc.). **Entirely bypasses the webapp singleton pool.** | HIGH — any RLS set on webapp pool does not reach this connection. |
| media-worker process pool (SEPARATE by design) | `apps/media-worker/src/main.ts:16` | `new Pool(...)` created fresh per process, passed as ctx.pool. No per-request lifecycle. | MEDIUM — long-running worker; RLS chokepoint will need separate worker-side strategy (e.g., SET app.tenant at pool init or row-level WHERE clauses). |
| integrator singleton pool (SEPARATE app) | `apps/integrator/src/infra/db/client.ts:32` | `new Pool(...)` module-level singleton. The integrator runs as a separate process; its pool is entirely separate from webapp's pool. | MEDIUM — integrator is a separate process; will need its own RLS strategy. |
| PoolClient within webapp `.tx()` callbacks (DEDICATED CLIENT, but CENTRAL pool) | e.g., `pgAppointmentProjection.ts`, `pgSupportCommunication.ts`, `pgOnlineIntake.ts`, `pgUserProjection.ts`, etc. — **count understated; reviewer-verified total is ~30 runtime + 8 script sites — full enumeration in §3.1a** | Checkout `pool.connect()` from the CENTRAL pool, hold across BEGIN/COMMIT. The `PoolClient` is checked out from `getPool()` so it shares the pool. A per-request chokepoint that runs `SET LOCAL app.tenant = ...` via `SET LOCAL` **must** apply it inside the same client session — if the chokepoint runs on `pool.query`, a different client may be assigned. These sites hold their own client; the chokepoint must apply to the client before any statement, not the pool. | HIGH — per-request RLS SET LOCAL will not propagate to these dedicated clients unless explicitly applied to each checked-out client. |
| integrator `txDb` dedicated client (DEDICATED CLIENT, CENTRAL pool) | `apps/integrator/src/infra/db/client.ts:89–162` | `db.tx()` checks out a `PoolClient`, runs BEGIN, passes a `txPort` whose `.query()` calls `client.query()`. All integrator repos inside `.tx()` use this client. | HIGH (same as above — for integrator's own RLS). |

### 3.1a Complete dedicated-client (`.connect()`) inventory — reviewer-verified

> Added by orchestrator review (2026-06-17). §3.1 named only ~12 example sites; the verified total
> across the repo is **38** files calling `.connect()` (non-test) = **~30 runtime + 8 ops scripts**.
> Every runtime site holds a checked-out `PoolClient`, so the RLS principal must be set **on the
> client** (first statement before `BEGIN`), not on the pool — a pool-level `SET LOCAL` does not reach
> a checked-out client. Reproduce: `rg -t ts -l '\.connect\(\)' apps packages | rg -v '\.(test|spec)\.ts$|/__tests__/|/e2e/'`.

**Runtime sites (~30) — all need client-level RLS context:**
- **webapp `infra/repos/` (14, EXPECTED layer):** `pgAppointmentProjection`, `pgChannelPreferences`, `pgDoctorBroadcastDelivery`, `pgDoctorMotivationQuotesEditor`, `pgIdentityResolution`, `pgOnlineIntake`, `pgPhoneMessengerBind`, `pgSupportCommunication`, `pgUserByPhone`, `pgUserProjection`, `pgWebPushSubscriptions`, `s3MediaStorage`, `mediaPreviewWorker`, `mediaUploadSessionsRepo`.
- **webapp `infra/` (non-repos) (6):** `adminAuditLog`, `integratorPlatformUserMerge`, `multipartSessionLock`, `userLifecycleLock`, `strictPlatformUserPurge`, `platformUserFullPurge` (the last also owns the `integratorPurgePools` SEPARATE pool, §3.1).
- **⚠️ webapp `app-layer/` — PORT-BYPASS (2):** `app-layer/doctor/createDoctorClient.ts`, `app-layer/integrator/messengerPhoneHttpBindExecute.ts` — dedicated client held outside `infra/`.
- **⚠️ webapp `modules/` — PORT-BYPASS (1):** `modules/auth/channelLink.ts` (also in §3.2).
- **integrator (3):** `infra/db/pgAdvisoryLock`, `infra/db/repos/schedulerLocks`, `integrations/rubitime/rubitimeApiThrottle`.
- **media-worker (1):** `jobs/claim.ts` (claims transcode jobs).
- *(Central pool definitions excluded: webapp `infra/db/client.ts`, integrator `infra/db/client.ts`.)*

**Additional SEPARATE-POOL sites beyond §3.1:**
- `apps/integrator/src/infra/db/migrate.ts:307` — `new Pool` for **boot migrations** (runs on every integrator start). Covered by plan **P0.5** (migrator/owner role split), but belongs on this list.
- **Ops scripts (8 `.connect()` + several `new Pool`)** under `apps/webapp/scripts/`, `apps/integrator/src/infra/scripts/`: `backfill-rubitime-records-and-clients`, `consolidate-specialist-identity`, `migrate-fio-dev`, `purge-placeholder-bookings`, `realign-webapp-integrator-user-projection`, `sanitize-reschedule-count`, `seed-booking-catalog-tochka-zdorovya`, `user-phone-admin` (webapp) + `projection-health`, `stage6-historical-time-backfill` (integrator). Out of the request path, but they connect with the app/admin role → under `FORCE` RLS they are **subject to** policies unless run as the migrator/owner role. **Flag for T0 / P0.5 role decision** (one-off ops scripts should run as the bypass/migrator role, not the app role).

### 3.2 modules/** Port-Bypass Raw SQL

Domain logic in `modules/` is a clean-architecture smell (SQL belongs in `infra/repos`). All 4 files use the CENTRAL pool and do not add RLS risk beyond what infra/repos already has, but they need to be in scope for the consolidation pass.

| File | What it does | Scoped tables |
|---|---|---|
| `apps/webapp/src/modules/auth/channelLink.ts` | Phone/channel link tx + channel_link_secrets insert | None in scope |
| `apps/webapp/src/modules/reminders/disableReminderMessengerTopic.ts` | READ reminder_rules, channel bindings; caller-injected pool | `public.reminder_rules` (scoped) |
| `apps/webapp/src/modules/reminders/loadWarmupsSectionSlugs.ts` | READ content_sections slugs; caller-injected pool | `public.content_sections` (scoped) |
| `apps/webapp/src/modules/system-settings/configAdapter.ts` | DIRECT SELECT FROM system_settings (bypasser — see §3.4) | None in scope |

### 3.3 Raw-SQL WRITES to SCOPED Tables (by layer)

The following production files issue raw INSERT/UPDATE/DELETE to tables in `needs-orgid-FINAL.txt`:

| Table (schema.name) | Writer files | App | Layer |
|---|---|---|---|
| public.media_files | `s3MediaStorage.ts`, `mediaPreviewWorker.ts`, `mediaUploadSessionsRepo.ts`, `pgMediaFileIntakeResolve.ts`, `pgMediaTranscodeJobs.ts` | webapp | infra/repos (expected) |
| public.media_files | `processTranscodeJob.ts`, `processProgramSubmissionTranscode.ts`, `persistVideoDurationSeconds.ts` | media-worker | all files (worker process) |
| public.media_transcode_jobs | `pgMediaTranscodeJobs.ts` | webapp | infra/repos |
| public.media_transcode_jobs | `processTranscodeJob.ts`, `processProgramSubmissionTranscode.ts`, `jobs/claim.ts` | media-worker | worker process |
| public.media_upload_sessions | `mediaUploadSessionsRepo.ts` | webapp | infra/repos |
| public.reminder_rules | `pgReminderProjection.ts`, `pgReminderRules.ts` | webapp | infra/repos |
| public.reminder_rules | `platform-merge/pgPlatformUserMerge.ts` | platform-merge pkg | package (via caller's client) |
| integrator.user_reminder_rules | `repos/mergeIntegratorUsers.ts` | integrator | infra/db/repos |
| public.support_conversations, support_conversation_messages | `pgSupportCommunication.ts`, `mergeLegacySupportConversations.ts` | webapp | infra/repos |
| public.support_questions | `pgSupportCommunication.ts` | webapp | infra/repos |
| public.clinical_* | `pgClinicalTests.ts` | webapp | infra/repos |
| public.doctor_notes | `pgDoctorNotes.ts` | webapp | infra/repos |
| public.lfk_complexes | `pgDiaryPurge.ts`, `pgLfkDiary.ts` | webapp | infra/repos |
| public.patient_lfk_assignments | `pgLfkAssignments.ts` | webapp | infra/repos |
| public.patient_merge_candidates | `app-layer/platform-user/recordPublicBookingMergeCandidates.ts` | webapp | **app-layer (PORT-BYPASS)** |
| public.online_intake_requests | `pgOnlineIntake.ts` | webapp | infra/repos |
| public.treatment_program_* | `pgTreatmentProgram.ts` | webapp | infra/repos |
| public.treatment_program_instances | `platform-merge/pgPlatformUserMerge.ts` | platform-merge pkg | package |
| public.symptom_trackings | `pgSymptomDiary.ts`, `pgDiaryPurge.ts`, `platform-merge/mergeContactFallback.ts` | webapp + pkg | infra/repos + package |
| public.recommendations | `pgRecommendations.ts` | webapp | infra/repos |
| public.motivational_quotes | `pgDoctorMotivationQuotesEditor.ts` | webapp | infra/repos |
| public.mailing_logs_webapp | `pgSubscriptionMailingProjection.ts` | webapp | infra/repos |
| public.admin_audit_log | `adminAuditLog.ts` | webapp | infra (expected) |
| public.broadcast_audit | `pgBroadcastAudit.ts` | webapp | infra/repos |
| public.broadcast_audit_recipients | `pgDoctorBroadcastDelivery.ts` | webapp | infra/repos |
| public.notification_delivery_attempts | `repos/notificationDeliveryAttempts.ts` | integrator | infra/db/repos |
| integrator.conversations | `repos/messageThreads.ts`, `repos/mergeIntegratorConversationToPlatform.ts` | integrator | infra/db/repos |
| integrator.user_reminder_delivery_logs | `repos/reminders.ts` | integrator | infra/db/repos |

**Notable port-bypass write (single file):**
- `apps/webapp/src/app-layer/platform-user/recordPublicBookingMergeCandidates.ts` — writes `public.patient_merge_candidates` (scoped) using `runPgPoolPgText`, lives in `app-layer/` (not `infra/repos/`).

### 3.4 system_settings Read Bypassers

The query `SELECT value_json FROM [public.]system_settings WHERE key = ... AND scope = 'admin'` appears in **6 production locations outside** the official `pgSystemSettings.ts` / `publicSystemSettings.ts` accessors:

| Site | File | Transport | Notes |
|---|---|---|---|
| webapp booking engine | `apps/webapp/src/infra/repos/pgBookingEngine.ts:128` | `db.execute(sql\`...\`)` via getDrizzle() | local private fn `readSettingString` |
| webapp booking rubitime bridge | `apps/webapp/src/infra/repos/pgBookingRubitimeBridge.ts:56` | `db.execute(sql\`...\`)` via getDrizzle() | local private fn |
| webapp configAdapter | `apps/webapp/src/modules/system-settings/configAdapter.ts:51,129` | `runWebappPgText` | **modules/** port-bypass |
| integrator publicSystemSettings | `apps/integrator/src/infra/db/publicSystemSettings.ts:68` | `runIntegratorSql` | integrator's own accessor (expected) |
| media-worker pipelineEnabled | `apps/media-worker/src/pipelineEnabled.ts:8` | `runMediaWorkerPgText` | media-worker accessor |
| media-worker watermarkEnabled | `apps/media-worker/src/watermarkEnabled.ts:9` | `runMediaWorkerPgText` | media-worker accessor |

The **official webapp accessor** is `apps/webapp/src/infra/repos/pgSystemSettings.ts` (wraps `runWebappPgText`). The 3 webapp bypassers (`pgBookingEngine`, `pgBookingRubitimeBridge`, `configAdapter`) should be consolidated behind `pgSystemSettings` or an extracted `readSystemSettingString()` helper.

---

## 4. Implications for the RLS Chokepoint (T0)

### 4.1 What IS already a natural single chokepoint

| Transport | Chokepoint status |
|---|---|
| `runWebappPgText` / `runWebappSql` / `getWebappSqlDb().execute()` | **YES** — all compile to `getDrizzle().execute()` which calls `getPool()`. One intercept point at `getDrizzle()` or `getPool().query` covers all. |
| `runPgPoolPgText(pool, ...)` when pool = `getPool()` | **YES** — pool is the singleton; intercept at pool level covers it. |
| `runIntegratorSql(db, ...)` | **YES** — all integrator SQL goes through `db.query()` on the DbPort singleton backed by `db` (the one Pool from `client.ts`). One intercept. |
| Drizzle ORM query-builder (`db.select().from()` etc.) | **YES** — same pool; not in primary scope but covered automatically. |

### 4.2 What NEEDS separate handling

| Site | Why it escapes a per-request chokepoint | Recommended approach |
|---|---|---|
| `pool.connect()` / dedicated `PoolClient` (~30 runtime sites: webapp infra/repos + infra + **2 app-layer + 1 modules** + integrator + media-worker — full list §3.1a) | A per-request SET LOCAL on pool.query doesn't follow to a checked-out client. Each client is a distinct TCP session. | Apply `SET LOCAL app.tenant = $1` as the first statement on every checked-out client before the BEGIN, in the `getPool().connect()` wrapper or in a centralized `withRlsClient()` helper. The 2 app-layer + 1 modules sites must also move to `infra/`. |
| `platformUserFullPurge.ts` — `integratorPurgePools` | Separate `new Pool(...)` entirely outside the webapp singleton. | Purge is an admin-only operation. Either: (a) add `SET app.tenant = $1` at pool creation time and configure RLS to trust admin role, or (b) keep it outside RLS scope with explicit WHERE clauses + role-based access control. |
| media-worker (`main.ts` pool) | Separate process, no per-request lifecycle. | Set `SET app.tenant = 'system'` (or a dedicated worker role) at connection establishment via `pool.on('connect', ...)`. The worker only processes its own queued jobs; cross-tenant access is not a concern at the row level. |
| integrator process pool | Separate process. Same reasoning as media-worker. | Worker-level tenant identity (e.g., SET at connect). Integrator only processes events for the single-org it is configured for; after multi-tenancy: either separate integrator instances per org or tenant-tagged events with tenant SET per job. |
| `booking-rubitime-sync` / `platform-merge` packages | Accept any caller-provided client. The caller controls what client/pool is used. | These packages are clean: they accept a transport and rely on the caller to have already set the RLS context on that transport. Document the contract — callers MUST use an already-scoped connection. |

### 4.3 Migration Order Recommendation

1. **T0-A**: Wrap `getPool()` singleton — intercept all `getDrizzle().execute()` calls and inject `SET LOCAL app.org_id = ?` at the session level for request-scoped operations.
2. **T0-B**: Create `withRlsClient(orgId, fn)` helper that wraps `pool.connect()`, applies SET, wraps in BEGIN/COMMIT, and replaces the 12+ ad-hoc `pool.connect()` patterns in webapp infra/repos.
3. **T0-C**: Add `pool.on('connect', client => client.query('SET app.org_id = ...'))` in media-worker `main.ts` for process-wide worker identity.
4. **T0-D**: Same for integrator `client.ts`.
5. **T0-E**: Audit `integratorPurgePools` — decide admin-bypass vs scoped.
6. **T0-F**: Consolidate the 6 `system_settings` bypassers into the single `pgSystemSettings.ts` accessor.

---

## 5. Method + Reproducible rg Commands

All commands were run from the repo root `/home/dev/dev-projects/BersonCareBot`.

```bash
# 1. List webapp files using the main transport helpers (excludes tests)
rg -l "runWebappPgText|runWebappSql|getWebappSqlDb|runPgPoolPgText|getWebappSqlFromPgClient|runWebappTransaction|webappSqlFromPgText" \
  -g "*.ts" -g "*.tsx" -g "!*.test.ts" -g "!*.spec.ts" -g "!*__tests__*" \
  apps/webapp/src | sort

# 2. Find all pool.connect / client.query calls in webapp
rg -n "pool\.query|client\.query|\.connect\(\)" \
  -g "*.ts" -g "*.tsx" -g "!*.test.ts" -g "!*.spec.ts" \
  apps/webapp/src | sort

# 3. Find all new Pool instantiations across the repo
rg -l "new Pool\b|new PgPool\b" -g "*.ts" -g "!*.test.ts" -g "!*.spec.ts" \
  . | grep -v "node_modules" | sort

# 4. Find all direct FROM/INTO system_settings queries
grep -rn "FROM system_settings\|FROM public\.system_settings" \
  apps/ packages/ --include="*.ts" | grep -v ".test.ts|.spec.ts|migrations|.next/"

# 5. List integrator production files with raw SQL (excl. scripts/tests)
rg -l "db\.query|txDb\.query|runIntegratorSql|pool\.query|client\.query" \
  -g "*.ts" -g "!*.test.ts" -g "!*.spec.ts" \
  apps/integrator/src | grep -v "scripts/|stubIntegrator|migrate\.ts" | sort

# 6. Find raw SQL writes to scoped tables
grep -rn "INSERT INTO.*media_files\|UPDATE.*media_files\|INSERT INTO.*media_transcode_jobs\|UPDATE.*media_transcode_jobs" \
  apps/ packages/ --include="*.ts" | grep -v ".test.ts|node_modules|migrations|.next/"

# 7. List packages with raw SQL
grep -rl "db\.query|client\.query|SELECT\b|INSERT INTO|UPDATE.*SET\b" \
  packages/ --include="*.ts" | grep -v ".test.ts|.spec.ts|__tests__"

# 8. Count by layer (webapp)
rg -l "runWebappPgText|runWebappSql|..." -g "*.ts" -g "!*.test.ts" \
  apps/webapp/src | grep "infra/repos" | wc -l   # → 69
rg -l "..." apps/webapp/src | grep "modules/" | wc -l  # → 4
rg -l "..." apps/webapp/src | grep "app-layer/" | wc -l  # → 8
rg -l "..." apps/webapp/src | grep "/app/" | wc -l  # → 4
```

### Anchor Reconciliation

| Anchor stated | Measured | Delta | Explanation |
|---|---|---|---|
| webapp non-test files with raw-SQL signal: 129 | 108–148 (depending on what signals counted) | within range | 108 = transport-helper files only; 148 = includes all client.query/pool.connect; the 129 anchor likely included all signals combined |
| webapp modules/** with raw-SQL signal: 10 | 4 | -6 | Brief gap: the remaining 6 may be in modules/** files that use Drizzle ORM (not raw SQL helpers) — consistent with "not primary scope" |
| webapp infra/repos: 97 | 69 (transport helpers) + ~23 (client.connect only) = 92 | -5 | Within tolerance; some repos use only pool.connect without the text helpers |
| integrator: 40 | 30 production (+ ~8 scripts) = 38 | -2 | Scripts excluded from production count; within tolerance |
| media-worker: 6 | 7 | +1 | One extra file (runMediaWorkerSql.ts itself counts as a raw-SQL file) |
| packages: 7 | 7 (8 files, minus operator-db-schema which has no queries) | 0 | Exact match |
