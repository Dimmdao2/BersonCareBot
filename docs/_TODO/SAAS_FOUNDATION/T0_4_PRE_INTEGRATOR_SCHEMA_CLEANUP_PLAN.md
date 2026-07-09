# T0.4-pre Integrator Schema Cleanup Plan

**Status:** draft execution roadmap.  
**Intended window:** after T0.3 webapp doctor/admin principal closure, before T0.4 integrator/media-worker principalization.  
**Owner model:** orchestrator-led execution with focused subagents for inventory, implementation, validation, and audit.  
**Primary goal:** enter T0.4 and SaaS production prep with a clear ownership split between `public` and `integrator`, without business-data mirrors that can drift.

## Why This Exists

T0.4 is currently scoped as "make integrator and media-worker runtime DB paths principal-safe". That work becomes harder and riskier if the integrator still has semi-canonical duplicates of webapp data. Before wrapping remaining integrator paths in tenant principal mechanics, we should first decide which integrator tables are real technical state and which are legacy mirrors that must be moved, drained, disabled, or dropped.

The expected result is not just "some tables removed". The expected result is a rehearsed, repeatable cleanup path:

- dev branch/worktree proves the code can run without deprecated mirrors;
- dev DB/test DB prove backfills, reconciles, writer-disable steps, and drops are idempotent;
- production rollout has a dry-run/apply runbook with backup, rollback, and monitoring steps;
- T0.4 only principalizes the runtime paths that should still exist.

## Current Findings

### Confirmed Architecture Baseline

- Production/runtime model is one PostgreSQL database with `public` for webapp/business data and `integrator` for integration technical state.
- `public` is the canonical home for SaaS-owned business state: organizations, members, patients, enrollments, settings, product rules, appointments/bookings, and user-facing notification preferences.
- `integrator` should keep provider/channel runtime state: webhook/session state, provider identities, transport attempts, retries, throttling/idempotency, projection outbox, and provider audit logs.
- Current docs already describe `integrator.system_settings` as a mirror of `public.system_settings`, with webapp pushing writes to integrator until refactored.

### `system_settings`

Known facts:

- Integrator runtime readers have already been moved to canonical `public.system_settings` through `apps/integrator/src/infra/db/publicSystemSettings.ts`.
- `integrator.system_settings` is still present as a legacy compatibility mirror.
- `apps/integrator/src/integrations/bersoncare/settingsSyncRoute.ts` still accepts signed sync writes into `integrator.system_settings`.
- `apps/webapp/src/modules/system-settings/syncToIntegrator.ts` still posts settings sync and enqueues `system_settings_sync` into `public.integrator_push_outbox` on failure.

Risk:

- As long as the mirror writer/endpoint/outbox kind exists, future code can accidentally keep the old two-write contract alive.

Likely target:

- `public.system_settings` remains the only source of truth.
- The sync route, sync client, and `system_settings_sync` outbox path are removed or explicitly disabled after compatibility checks.
- `integrator.system_settings` is dropped only after a reference scan and deploy phase prove no runtime path reads or writes it.

### Reminder Dispatch And Notification State

Known facts:

- `public.reminder_rules` is the product source of truth.
- For bot-linked reminders, webapp upserts a mirror into `integrator.user_reminder_rules`; integrator plans due occurrences and writes `integrator.user_reminder_occurrences` plus `integrator.user_reminder_delivery_logs`.
- For web-push-only reminders, integrator does not plan; webapp tick uses `public.webapp_reminder_occurrences`.
- Webapp also keeps product-facing history/events in public tables such as reminder occurrence history and delivery events.
- `public.outgoing_delivery_queue` is a shared outgoing queue; integrator scheduler/worker uses it for retryable delivery.
- Integrator reminder migrations explicitly call some columns "mirror webapp" fields.

Risk:

- Reminder state is currently split across product source, integrator mirror, integrator occurrence state, webapp occurrence state, public queue, and public history/events. This is workable only while the split is perfectly understood; it is a bad starting point for SaaS enforcement if left undocumented and partially duplicated.

Decision required:

- Choose a single owner for reminder scheduling state before T0.4 principalization.

Recommended target:

- `public` owns reminder rules, scheduling/occurrence state, product history, and the outgoing delivery queue.
- `integrator` owns only channel/provider delivery attempts, transport logs, provider response metadata, throttling, and idempotency.
- If the final decision keeps occurrence planning inside integrator, then webapp occurrence tables must not duplicate the same scheduling responsibility; the split must be explicit by channel/type and covered by tests.

### Rubitime Legacy Tables

Known facts:

- RubyTime/Rubitime is being sunset as a write path in favor of the platform's own booking path.
- Existing integrator cleanup notes classify several Rubitime tables as move-to-public/deprecate candidates:
  - `rubitime_branches`
  - `rubitime_services`
  - `rubitime_cooperators`
  - `rubitime_booking_profiles`
  - `rubitime_records`
  - `booking_calendar_map`
- `rubitime_events` is closer to provider audit/technical log and may remain with retention.
- `public.appointment_records` and `public.patient_bookings` are the canonical business appointment/booking targets.

Risk:

- If old Rubitime projection/mirror tables remain writable after the switch, future booking fixes can silently revive stale assumptions.

Likely target:

- Freeze old Rubitime write paths after own-booking cutover.
- Backfill any still-needed business facts into public tables.
- Keep only explicit provider audit tables with retention; drop mirror/profile/service tables once no runtime references remain.

### Platform User / Channel Identity

Known facts:

- `integrator.identities`, `integrator.users`, `integrator.contacts`, and `integrator.telegram_state` are not all equivalent.
- `integrator.identities` and `telegram_state` are provider/channel runtime state and likely remain in integrator.
- Current integrator code resolves organization through `public.platform_users.integrator_user_id` and public org membership/enrollment tables.
- `getLinkDataByIdentity` prefers public phone/channel binding data but still has a legacy fallback to `integrator.contacts`; it logs drift mismatches.

Risk:

- `integrator.contacts` can become a stale duplicate of public channel/contact data.

Likely target:

- Keep provider identity/session tables in integrator.
- Prove public bindings cover all required link flows.
- Remove `integrator.contacts` fallback or narrow it to a short-lived migration-only path, then drop/archive the table if no technical-only use remains.

### Conversations, Questions, Drafts, Transport Logs

Known facts:

- Existing inventory marks `conversations`, `conversation_messages`, `message_drafts`, `user_questions`, and `question_messages` as review-needed.
- Some of these may be product/support data, some may be provider transport logs.

Decision required:

- Decide the product canonical home for support/question conversations.
- Keep integrator-only rows only when they are truly provider transport logs or webhook processing state.

### Queues, Idempotency, Audit, And Technical State

Known facts:

- `projection_outbox`, provider retry jobs, delivery audit logs, throttle/advisory/idempotency tables, and webhook/provider event logs are technical state.
- These are not the same kind of duplication as business mirrors.

Likely target:

- Keep technical tables in integrator or public according to current runtime ownership.
- Add retention/cleanup notes where log growth matters.
- Do not spend this cleanup budget moving purely technical state unless it blocks SaaS tenant safety.

## Target End State

At the end of this cleanup track:

- `public` is the only canonical store for SaaS/business data:
  - organizations and memberships;
  - platform users, enrollments, patient/doctor-facing data;
  - settings and integration configuration;
  - booking/appointment business records;
  - reminder rules and product-visible reminder state, unless a documented ADR chooses a narrower exception.
- `integrator` contains only integration runtime state:
  - provider/channel identities and session/webhook state;
  - provider delivery attempts, retries, throttles, idempotency, and technical audit logs;
  - projection/outbox mechanics that are not business mirrors;
  - provider raw events retained by policy.
- Deprecated mirror tables are either dropped or documented as retained technical logs with a retention owner.
- Runtime code has no reads/writes to dropped/deprecated mirrors.
- T0.4 checklist is adjusted so agents principalize only surviving integrator/media-worker paths.

## Execution Model

The lead agent is responsible for orchestration, taskdb status, decision records, and final go/no-go. Subagents should be used aggressively but narrowly.

Recommended roles:

- **Lead/orchestrator:** owns this roadmap, taskdb, sequencing, owner-facing decision points, branch hygiene, final integration.
- **Inventory agents:** one per domain (`settings`, `reminders`, `rubitime`, `identity`, `conversations`, `queues`) to collect readers/writers, row counts, dependencies, and proposed classification.
- **Implementation agents:** one domain batch at a time; no broad refactors.
- **Migration/backfill agent:** writes idempotent dry-run-first scripts and migrations.
- **Test agent:** runs focused gates, typecheck, lint, smoke tests, and records exact commands/results.
- **Audit agent:** independently verifies reference scans, DB dependency scans, and behavior after each destructive step.

The lead should not let implementation begin until the inventory and decision matrix for the relevant domain are complete.

## Phase 0 - Bootstrap And Guardrails

Objective: start from a known, documented state.

Steps:

1. Create a parent taskdb task for this cleanup track and child tasks per domain.
2. Confirm branch/worktree and dirty state. Do not mix with unfinished T0.3 code batches.
3. Read current canonical docs:
   - `docs/_TODO/SAAS_FOUNDATION/T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md`
   - `docs/_TODO/SAAS_FOUNDATION/T0_DB_ACCESS_SURFACE.md`
   - `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`
   - `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`
   - `docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md`
   - `docs/INTEGRATOR_DRIZZLE_MIGRATION/RAW_SQL_INVENTORY.md`
4. Confirm that dev/test/prod database access rules are understood from server conventions.
5. Declare non-negotiable safety rules:
   - no production mutation until code is deployed and test rollout has passed;
   - destructive DB steps require backup and owner approval;
   - scripts default to `--dry-run`;
   - no patient PII in chat, logs, taskdb notes, or audit artifacts;
   - no real external sends from dev/test cleanup work;
   - no direct writes to task tables outside `taskdb.mjs`.

Deliverables:

- Task tree in taskdb.
- Short entry in `docs/_TODO/SAAS_FOUNDATION/LOG.md` with start date, branch, owner, and scope.

## Phase 1 - Inventory And Baseline Evidence

Objective: produce a fact base before changing code or schema.

Required inventory outputs:

- `docs/_TODO/SAAS_FOUNDATION/T0_4_PRE_SCHEMA_CLEANUP_INVENTORY.md`
- `docs/_TODO/SAAS_FOUNDATION/scope-derivation/t0-4-pre-table-matrix.tsv`

The table matrix should include:

- schema;
- table;
- current classification: `canonical_public`, `technical_integrator`, `mirror_candidate`, `move_to_public_candidate`, `drop_candidate`, `needs_decision`;
- known readers;
- known writers;
- scheduled jobs/workers/routes;
- approximate row count per environment where allowed;
- FK/dependency notes;
- PII risk;
- proposed target;
- required migration/backfill;
- destructive-drop readiness.

Inventory commands and scans:

```bash
bash /home/dev/brain/tools/code-search.sh "integrator.system_settings" --repo bcb -k 50
bash /home/dev/brain/tools/code-search.sh "user_reminder_rules" --repo bcb -k 50
bash /home/dev/brain/tools/code-search.sh "rubitime_booking_profiles" --repo bcb -k 50
bash /home/dev/brain/tools/codeq.sh "integrator schema mirror tables settings reminders Rubitime contacts conversations" --repo bcb --k 20
```

For database row counts and dependencies, use read-only SELECTs first. On production, commands must follow `docs/ARCHITECTURE/SERVER CONVENTIONS.md` exactly and must not print sensitive values.

Deliverables:

- Inventory doc.
- TSV matrix.
- List of all code references by table.
- List of all DB dependencies by table: FKs, indexes, triggers, views, grants, scheduled jobs, migrations.

Gate:

- No implementation until the lead and audit agent agree that all candidate tables have known readers/writers or are explicitly marked `unknown` with next discovery steps.

## Phase 2 - Target Ownership Decisions

Objective: convert inventory into decisions, not assumptions.

Required decision records:

1. **Settings ADR**
   - Confirm `public.system_settings` as only runtime source.
   - Decide whether to delete the integrator sync endpoint immediately or disable it for one release before drop.
   - Decide fate of `system_settings_sync` outbox rows.

2. **Reminder ADR**
   - Decide one scheduling owner.
   - Recommended: public owns rules, occurrences, product history, and outgoing delivery queue; integrator owns provider delivery attempts/transport logs.
   - If rejected, document exactly why integrator occurrence state remains and how webapp-only occurrence state avoids duplication.

3. **Rubitime Sunset ADR**
   - Define the exact cutover point when old Rubitime writes are forbidden.
   - Define which raw events are retained and for how long.
   - Define which business mirror tables are backfilled, archived, or dropped.

4. **Channel Identity ADR**
   - Confirm which integrator identity/session tables are technical state.
   - Decide whether `integrator.contacts` is removable after public binding coverage proof.

5. **Conversations/Questions ADR**
   - Decide whether the product/support canonical home is public.
   - Classify integrator conversation/question tables as product data, transport logs, or drop candidates.

6. **Retention ADR**
   - Set retention expectations for provider raw events, delivery logs, webhook logs, and retry/audit state.

Deliverables:

- ADR sections appended to `T0_4_PRE_SCHEMA_CLEANUP_INVENTORY.md` or separate files linked from it.
- Updated table matrix with final target classification.

Gate:

- Implementation can start domain-by-domain only after the relevant ADR is decided.
- If a decision needs the owner, mark taskdb `blocked`, set `owner_waiting=true`, and ask one concrete question.

## Phase 3 - Dry-Run-First Scripts And Migration Plan

Objective: make cleanup repeatable across dev, test, and production.

Recommended script structure:

```text
apps/webapp/scripts/integrator-schema-cleanup/
  01_audit.ts
  02_backfill.ts
  03_reconcile.ts
  04_disable_writers.ts
  05_drop_deprecated.ts
  README.md
```

Script rules:

- default mode is `--dry-run`;
- `--apply` is required for writes;
- destructive actions require a second explicit flag such as `--allow-drop`;
- scripts are idempotent;
- scripts print counts, table names, and decision IDs, not PII;
- scripts use existing DB access conventions and type-safe project patterns;
- scripts can run against dev/test/prod using environment-sourced connection config, never embedded secrets;
- each script has a verification query set.

Backfill/reconcile classes:

- settings: verify public/integrator mirror parity, then prove runtime uses public only;
- reminders: migrate/merge occurrence state according to Reminder ADR;
- Rubitime: move any remaining business facts to public appointment/booking tables or mark raw provider logs retained;
- contacts: compare public bindings to `integrator.contacts`, produce coverage/drift report, then remove fallback only after clean coverage or explicit exception list;
- conversations/questions: migrate product records to public if chosen.

Deliverables:

- Scripts.
- Script README with environment/run order.
- Dry-run output captured in execution log.

Gate:

- No drop migration is created until `audit`, `backfill`, and `reconcile` have passed in dry-run and apply mode on a disposable/dev-safe database.

## Phase 4 - Code Cleanup Batches

Objective: remove runtime dependencies before dropping tables.

Recommended order:

1. **Settings**
   - Remove or disable `syncSettingToIntegrator`.
   - Remove or disable integrator `settingsSyncRoute`.
   - Remove `system_settings_sync` enqueue/consumer behavior if no longer needed.
   - Add tests proving integrator reads `public.system_settings` with org fallback.

2. **Reminder Scheduling**
   - Implement Reminder ADR.
   - Remove rule mirror writes if public becomes the scheduling source.
   - Move due planning to the chosen canonical table(s).
   - Keep integrator delivery attempts/logs technical-only.
   - Add tests for bot-linked, web-push-only, quiet hours, org scoping, and retry behavior.

3. **Rubitime Sunset**
   - Freeze old write paths after platform booking cutover.
   - Remove mirror/profile/service dependencies.
   - Preserve explicit provider audit reads only where still needed.

4. **Channel Identity**
   - Remove public-to-`integrator.contacts` fallback after coverage proof.
   - Keep provider identity/session state.
   - Add tests for link flows and organization resolution.

5. **Conversations/Questions**
   - Move product/support state to public if decided.
   - Retain only provider transport logs in integrator.

6. **Drop Candidates**
   - After code removal and audit pass, create drop migrations/scripts for deprecated tables.
   - Drop in test first, then production.

Deliverables:

- Focused commits per domain.
- Tests attached to each domain batch.
- Updated `T0_DB_ACCESS_SURFACE.md` and T0.4 checklist after each domain changes surviving runtime paths.

Gate:

- A table cannot be dropped while any runtime reference remains in code search, migrations expected by tests, scheduled jobs, or DB dependencies.

## Phase 5 - Dev Validation

Objective: prove the cleanup works before test/prod rollout.

Validation expectations:

- Run scripts in `--dry-run` and `--apply` where safe.
- Run focused domain tests.
- Run typecheck/lint for changed packages.
- Run SaaS DB regression checks.
- Run app smoke for:
  - admin settings save/read;
  - doctor/patient reminder create/edit/delete;
  - reminder due dispatch without real external send;
  - own booking flow without Rubitime write dependence;
  - Telegram/MAX link identity resolution if test harness exists;
  - outgoing delivery queue retry classification.

Minimum gate template:

```bash
pnpm run check:saas-db-regression
pnpm --dir apps/webapp typecheck
pnpm --dir apps/integrator typecheck
pnpm --dir apps/webapp exec vitest run <focused-webapp-tests> --reporter verbose
pnpm --dir apps/integrator exec vitest run <focused-integrator-tests> --reporter verbose
pnpm exec eslint <changed-files>
git diff --check
```

For wider changes, use full CI:

```bash
pnpm run ci
```

Gate:

- Dev validation must include a hard proof that deprecated tables can be absent or blocked without breaking surviving flows. Prefer drop-on-disposable DB or temporary permission denial before real drop.

## Phase 6 - Test Environment Rollout

Objective: rehearse production sequencing on a prod-like environment.

Order:

1. Deploy cleanup branch to test.
2. Confirm test external channel behavior is safe and no real sends are triggered.
3. Run audit script in `--dry-run`.
4. Run backfill/reconcile scripts with `--apply`.
5. Deploy code that no longer references deprecated tables if not already deployed.
6. Run drop script/migration for candidates.
7. Restart relevant services.
8. Run smoke checks.
9. Run audit agent verification:
   - no runtime references;
   - no failed jobs caused by missing tables;
   - no queue growth regression;
   - no settings/reminder/booking regressions.

Deliverables:

- Test rollout log.
- Exact commands used.
- Smoke checklist results.
- Any discovered exceptions added back into the table matrix.

Gate:

- Production rollout cannot start until test has passed with tables dropped or access-denied for every production drop candidate.

## Phase 7 - Production Rollout

Objective: execute the same rehearsed sequence under explicit approval.

Production order:

1. Owner approval for production cleanup window.
2. Backup before destructive changes.
3. Deploy code version that no longer references deprecated tables.
4. Run audit script in `--dry-run`.
5. Confirm dry-run counts match test expectations or explain differences.
6. Run backfill/reconcile with `--apply` if needed.
7. Run drop script/migration with explicit destructive flag only after final confirmation.
8. Restart relevant services where required.
9. Monitor:
   - webapp errors;
   - integrator worker/scheduler errors;
   - outgoing queue depth;
   - webhook processing;
   - reminder dispatch;
   - booking writes;
   - settings reads.
10. Record commit, migration IDs, backup ID/path, and validation results in taskdb/docs.

Rollback:

- Code rollback must be possible before drop.
- After drop, rollback requires restore or forward fix; therefore drop is the last step and only after no-reference proof.
- For high-risk tables, prefer one release with writers disabled and table access revoked/denied in test before production drop.

Gate:

- Production cleanup is complete only when monitoring is clean and audit scripts report no deprecated runtime references/state drift.

## Phase 8 - T0.4 Readiness Gate

Objective: start T0.4 with a clean and stable integrator/media-worker surface.

T0.4 may begin when:

- all cleanup ADRs are resolved;
- table matrix has no unresolved `mirror_candidate` or `needs_decision` rows in T0.4 runtime scope;
- deprecated mirrors are dropped or converted into documented retained technical logs;
- settings mirror sync is gone or explicitly disabled with an owner-approved compatibility sunset date;
- reminder scheduling has one documented owner;
- Rubitime old write paths are frozen/removed after own-booking cutover;
- contact fallback is removed or timeboxed with a documented exception list;
- tests and audit pass in dev and test;
- production plan is either executed or explicitly scheduled before SaaS production enablement;
- `T0_DB_ACCESS_SURFACE.md` reflects the final surviving runtime paths.

## Decision Points That Must Not Be Guessed

- Reminder scheduling owner: public scheduler vs integrator scheduler, and one occurrence/history model.
- Retention period for provider raw events, delivery logs, and Rubitime events.
- Product canonical home for conversations/questions.
- Whether `integrator.contacts` has any remaining technical-only purpose after public binding coverage.
- Whether `settingsSyncRoute` is deleted immediately or disabled for one compatibility release.
- Exact production drop window and backup/rollback expectations.

## Definition Of Done

- Inventory and table matrix completed.
- ADR decisions recorded.
- Idempotent dry-run-first scripts written and rehearsed.
- Code no longer reads/writes deprecated mirrors.
- Deprecated tables are dropped, access-denied, or documented as retained technical state with retention.
- Dev and test validation passed.
- Production runbook is executable and has been either executed or scheduled before SaaS production launch.
- T0.4 checklist updated so principal work targets only surviving runtime paths.
- Taskdb tasks have status, test seal, audit seal, and commit references filled by the responsible agents.
