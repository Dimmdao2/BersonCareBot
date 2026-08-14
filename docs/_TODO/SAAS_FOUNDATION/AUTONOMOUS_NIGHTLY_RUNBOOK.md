# SAAS Foundation Autonomous Nightly Runbook

Status: historical Phase 0 execution base. Phase 0 is complete as of 2026-07-08. Do not execute the P0 "Next Stage Plans" below as live work. The next live direction is T0/R2 tenant-context cutover via `T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md`.

Purpose: preserve the Phase 0 autonomous execution rules and evidence. For new T0 work, use this document only for general discipline (taskdb, logs, targeted validation, no prod touch) and use the T0 checklist for scope.

> **Checkbox marking 2026-07-27, corrected 2026-07-29.** Was: 51 open `- [ ]` boxes counted as live backlog by
> every raw grep sweep, even though the header had already disowned the historical execution section. None had an
> owner cancellation. Under §6.4, the 44 entries inside "Next Stage Plans" were re-derived individually below:
> completed facts use `[x]` with anchored evidence, transferred work uses prose pointers, the contradictory P0.10.1
> state and the unrerunnable media gate remain `[ ]`, and the P0.13 full-CI policy is ordinary prose. The 7
> "Start Checklist" entries are ordinary per-run procedure bullets, not checkboxes.
>
> **Correction 2026-07-27 (post-audit).** The first pass wrote one generic pointer
> (`T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md` / `R2_MVP_MASTER_CHECKLIST.md`) on all 44 boxes. An independent
> audit found each P0.x group actually has its own dedicated tracker, and — critically — P0.7.6
> (payment/webhook writers) is **not done**: `[-]` here means only "not executed from this runbook", not
> "closed". Per-group notes now point at: P0.7.5 → `T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md:27` (closed);
> P0.7.6 → `P0_7_WRITER_CENSUS_CHECKLIST.md:72` (**still open**); P0.8.x → `P0_8_RLS_DESCRIPTOR_CHECKLIST.md`
> (17/17); P0.9.1 → `P0_9_DEFAULT_DENY_CHECKLIST.md` (9/9); P0.10.x → `P0_10_CI_INVARIANTS_CHECKLIST.md`
> (15/15); P0.11.x → `P0_11_SYSTEM_SETTINGS_ORG_CHECKLIST.md` (20/20); P0.12.x →
> `P0_12_RESIDUAL_REFS_CHECKLIST.md` (12/12); P0.13.x → `P0_13_ISOLATION_FIXTURES_CHECKLIST.md` (17/17).

## Current Branch Baseline

Before starting any stage, verify the branch includes these completed commits:

```bash
git log --oneline --max-count=40
```

Required history markers:

- `d04e4cb8 P0.6.1 dormant DB principal context`
- `6e6a72f8 P0.7.1 writer census inventory`
- `aa7227d6 Apply tenant context to motivation reorder writer`
- `960e182b Apply tenant context to integrator API bot writers`
- `f039224d Apply tenant context to integrator worker scheduler writers`
- `885d6b0a Merge SaaS P0.6/P0.7 foundation into doctor UI rebuild`

If any marker is absent, stop and sync the branch before continuing.

## Mandatory Read Set

Read these before every nightly pass:

- `AGENTS.md`
- `.cursor/rules/test-execution-policy.md`
- `AGENTS.md` §9–§10 (смысловой full-CI gate и уровни проверок)
- `.cursor/rules/dev-prod-isolation-no-real-creds.mdc`
- `.cursor/rules/unified-task-db.mdc`
- `docs/_TODO/SAAS_FOUNDATION/README.md`
- `docs/_TODO/SAAS_FOUNDATION/CORRECTED_PLAN.md`
- `docs/_TODO/SAAS_FOUNDATION/LOG.md`
- the checklist for the exact next stage

For code discovery, ask the index before broad scans:

```bash
bash /home/dev/brain/tools/codeq.sh "<semantic query>" --repo bcb --k 8
bash /home/dev/brain/tools/code-search.sh "<exact token>" --repo bcb -k 20
```

## One-Pass Contract

Historical Phase 0 autonomous passes handled exactly one P0 micro-stage from `CORRECTED_PLAN.md`. For live T0 work, use `T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md` instead.

Allowed:

- one stage, one worktree/branch, one focused implementation;
- targeted tests/lint/typecheck through `/home/dev/orch/run-tests.sh`;
- `LOG.md` update in the same commit;
- taskdb status/service-field updates through `node /home/dev/brain/tools/taskdb.mjs`; ход и доказательства —
  только в stage checklist/каноническом плане;
- commit after the local gate passes;
- backup push to the current non-main/non-test feature branch after the stage-appropriate local gate is satisfied.

Forbidden:

- no aggregate `P0.7`, `P0.8`, `P0.11`, or `P0.13` task execution;
- no production DB, `/opt/env/*`, prod services, real channels, or secret printing;
- no writes to `bcb_webapp_dev` except a stage explicitly requires a dev migration/backfill and the checklist allows it;
- no full CI after every small edit;
- no push to `main` or `test`;
- no RLS enforcement/runtime role flip unless the exact stage says scratch-only.

## Start Checklist

- Confirm `git status --short` is clean or unrelated changes are understood.
- Confirm current branch is not `main` or `test`.
- Historical P0 only: confirm the next stage from `LOG.md` and `CORRECTED_PLAN.md`. For T0, confirm the next stage from `T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md`.
- Find the taskdb workstream for this stage; a stage is a checklist section, not a new card. Set the existing
  workstream to `status doing`.
- Run the stage preflight guard through the wrapper:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && git diff --check"
```

- Read the exact stage checklist and the named source files.
- If the stage requires a decision not already documented, write the exact question and context in the canonical
  plan, then set the task `blocked` and service flag `owner_waiting true`.

## Validation Policy

Use `.cursor/rules/test-execution-policy.md` as the default.

Step or stage work:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && <targeted tests> && <targeted lint/typecheck> && git diff --check"
```

Do not run `pnpm run ci` for normal micro-stage validation or ordinary backup-push. Full CI is reserved for:

- deploy / production-readiness / release gate;
- merge/sync/integration checkpoint between branches;
- root/shared/tooling/lockfile/CI changes;
- a stage checklist that explicitly marks repo-level risk.

If full CI fails, fix the failed step first, then use `ci:resume:*` before the final deploy/merge/integration full-CI barrier.

## Logging And Commit Discipline

Every completed stage must update `LOG.md` with:

- stage id;
- what changed;
- exact validation command and result;
- explicit skipped scope;
- whether full CI was intentionally not run.

Commit only stage-related files. Use a stage-specific message, for example:

```bash
git commit -m "Apply tenant context to media worker writers"
```

After commit, update taskdb:

```bash
node /home/dev/brain/tools/taskdb.mjs set <id> commit_ref <hash>
node /home/dev/brain/tools/taskdb.mjs set <id> seal_test true
node /home/dev/brain/tools/taskdb.mjs set <id> status done
```

Backup push only after the stage-appropriate local gate has passed. Do not promote backup-push to full CI unless the stage is a deploy, merge/integration checkpoint, repo-level/global change, or the user explicitly asks for full CI:

```bash
git push origin HEAD
```

Do not push `main`, `test`, or `dimmdao` without explicit owner instruction.

## Next Stage Plans

Historical P0 section only. Phase 0 is complete; do not execute these P0 next-stage plans as live work.

### P0.7.5 Media-Worker Writers

Goal: ensure media-worker SCOPED writes run under dormant org principal when the job source provides
an organization, while queue claiming remains safe and unset context stays no-op.

Primary files:

- `apps/media-worker/src/jobs/claim.ts`
- `apps/media-worker/src/processTranscodeJob.ts`
- `apps/media-worker/src/processProgramSubmissionTranscode.ts`
- `apps/media-worker/src/persistVideoDurationSeconds.ts`
- `apps/media-worker/src/withClient.ts`
- `apps/media-worker/src/runMediaWorkerSql.ts`
- existing tests in `apps/media-worker/src/*.test.ts` and `apps/media-worker/src/jobs/*.test.ts`

Execution checklist:

- [x] Re-read `P0_7_WRITER_CENSUS.md` -> Media Worker section. — `P0_7_WRITER_CENSUS_CHECKLIST.md` §P0.7.5 Media-Worker Execution Checklist — «Re-read `P0_7_WRITER_CENSUS.md` Media Worker section.»
- [x] Confirm `media_transcode_jobs.organization_id` and `media_files.organization_id` exist from P0.4.P7. — `P0_7_WRITER_CENSUS_CHECKLIST.md` §P0.7.5 Media-Worker Execution Checklist — «Confirm the current schema/source of `organization_id` for `media_transcode_jobs` and `media_files`.»
- [x] Decide from current code whether `claimNextJob` can return `organizationId` with the claimed job. — `P0_7_WRITER_CENSUS_CHECKLIST.md` §P0.7.5 Media-Worker Execution Checklist — «Decide and document whether `claimNextJob` returns `organizationId` directly or the processor loads it before SCOPED writes.»
- [x] Keep stale reclaim and queue claim status transitions as worker/queue mechanics unless the row org is loaded in the same transaction. — `P0_7_WRITER_CENSUS_CHECKLIST.md` §P0.7.5 Media-Worker Execution Checklist / Allowed — «Keep queue claim/reclaim mechanics explicit: either scoped from the loaded row or intentionally worker/queue-only.»
- [x] Make processing/failure/duration writes execute under `runWithDbOrganizationPrincipal(job.organizationId, ...)` or an equivalent central API from `@bersoncare/db-principal`. — `P0_7_WRITER_CENSUS_CHECKLIST.md` §P0.7.5 Media-Worker Execution Checklist — «Ensure successful transcode updates, retry/permanent failure updates, program submission updates, and duration persistence run under the resolved org context.»
- [x] Do not add manual `SET app.org` in media business logic. — `P0_7_WRITER_CENSUS_CHECKLIST.md` §P0.7.5 Media-Worker Execution Checklist / Forbidden — «No manual `SET app.org` in transcode business functions.»
- [x] Add tests proving org context is applied for job processing writes. — `P0_7_WRITER_CENSUS_CHECKLIST.md` §P0.7.5 Media-Worker Execution Checklist — «Add focused tests for org-applied writer path, missing-org dormant path, and claim/reclaim behavior.»
- [x] Add tests proving missing org leaves current behavior unchanged. — `P0_7_WRITER_CENSUS_CHECKLIST.md` §P0.7.5 Media-Worker Execution Checklist — «Ensure missing org leaves current dormant behavior unchanged and is logged/handled without a fallback.»
- [x] Add tests proving claim/reclaim does not require a synthetic default org. — `P0_7_WRITER_CENSUS_CHECKLIST.md` §P0.7.5 Media-Worker Execution Checklist / Forbidden — «No synthetic default organization for jobs with missing org.»
- [ ] Run media-worker targeted tests, media-worker typecheck, focused eslint, and `git diff --check`.
- [x] Update `LOG.md`. — `P0_7_WRITER_CENSUS_CHECKLIST.md` §P0.7.5 Media-Worker Execution Checklist — «Update `LOG.md`.»

Local gate template:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && pnpm --dir apps/media-worker exec vitest run src/jobs/claim.test.ts src/processProgramSubmissionTranscode.test.ts src/withClient.test.ts src/runMediaWorkerSql.test.ts --reporter verbose && pnpm --dir apps/media-worker typecheck && pnpm --dir apps/media-worker exec eslint src/jobs/claim.ts src/processTranscodeJob.ts src/processProgramSubmissionTranscode.ts src/persistVideoDurationSeconds.ts src/withClient.ts src/runMediaWorkerSql.ts && git diff --check"
```

### P0.7.6 Payment/Webhook Writers

Goal: apply dormant tenant context to payment, booking/payment webhook, membership, and merge writers
that touch SCOPED or org-direct `be_*` rows. Boot migrations remain migrator-only.

Execution checklist:

~~Use code index for payment/webhook writer discovery before `rg`.~~ — ВЕДЁТСЯ В `P0_7_WRITER_CENSUS_CHECKLIST.md` §P0.7.6 Payment/Webhook Execution Checklist — «Use code index for payment/webhook writer discovery, then targeted `rg`.»
~~Build a small mapping table in the stage notes: entrypoint, tables touched, org source, tests.~~ — ВЕДЁТСЯ В `P0_7_WRITER_CENSUS_CHECKLIST.md` §P0.7.6 Payment/Webhook Execution Checklist / Allowed — «Build a small mapping before code changes: entrypoint, tables touched, org source, test file.»
~~Separate runtime webhooks from boot/migration/ops scripts.~~ — ВЕДЁТСЯ В `P0_7_WRITER_CENSUS_CHECKLIST.md` §P0.7.6 Payment/Webhook Execution Checklist / Allowed — «Apply context only to runtime payment/webhook writers.»; «Keep boot migrations, migration ledgers, and one-off ops scripts under migrator-only semantics.»
~~For `be_*` writes, use existing organization ownership, not a default org fallback.~~ — ВЕДЁТСЯ В `P0_7_WRITER_CENSUS_CHECKLIST.md` §P0.7.6 Payment/Webhook Execution Checklist — «For each runtime SCOPED path, identify the organization source before writing code.»
~~For platform merge/package writers, require caller-provided scoped transaction or document a blocker.~~ — ВЕДЁТСЯ В `P0_7_WRITER_CENSUS_CHECKLIST.md` §P0.7.6 Payment/Webhook Execution Checklist — «For package/caller-transport writers, require an already-scoped transaction or block with a documented decision.»
~~Add focused tests for correct org, missing org dormant behavior, and no boot-migration context.~~ — ВЕДЁТСЯ В `P0_7_WRITER_CENSUS_CHECKLIST.md` §P0.7.6 Payment/Webhook Execution Checklist — «Add focused tests for correct-org context, missing-org dormant behavior, and migrator-only exclusion.»
~~Update `LOG.md`.~~ — ВЕДЁТСЯ В `P0_7_WRITER_CENSUS_CHECKLIST.md` §P0.7.6 Payment/Webhook Execution Checklist — «Update `LOG.md`.»

### P0.8.1-P0.8.7 RLS Descriptors And Policies

Run in this order only:

- [x] P0.8.1 descriptor model, no DB mutation. — `P0_8_RLS_DESCRIPTOR_CHECKLIST.md` §P0.8.1 Descriptor Model — «Descriptor represents exactly one tier for every artifact in `tiers-218.tsv`.»
- [x] P0.8.2 pure SQL renderer tests, no DB mutation. — `P0_8_RLS_DESCRIPTOR_CHECKLIST.md` §P0.8.2 SQL Renderer Tests — «Direct `organization_id = app.org` predicate.»
- [x] P0.8.3 public direct-org generator + scratch smoke first; policy migration only after smoke passes. — `P0_8_RLS_DESCRIPTOR_CHECKLIST.md` §P0.8.3-P0.8.7 Policy Application — «P0.8.3 public direct-org SCOPED families.»
- [x] P0.8.4 public FK/denorm preflight + scratch smoke by subgroup before migration. — `P0_8_RLS_DESCRIPTOR_CHECKLIST.md` §P0.8.3-P0.8.7 Policy Application — «P0.8.4 public FK/denorm-path SCOPED families.»
- [x] P0.8.5 integrator bridge/denorm preflight + scratch smoke by source family before migration. — `P0_8_RLS_DESCRIPTOR_CHECKLIST.md` §P0.8.3-P0.8.7 Policy Application — «P0.8.5 integrator bridge/denorm SCOPED families.»
- [x] P0.8.6 bootstrap hybrid policies plus pre-context read smoke. — `P0_8_RLS_DESCRIPTOR_CHECKLIST.md` §P0.8.3-P0.8.7 Policy Application — «P0.8.6 BOOTSTRAP hybrid policies.»
- [x] P0.8.7 INFRA/LEGACY/TELEMETRY exemption checks plus unsupported user-ref denial. — `P0_8_RLS_DESCRIPTOR_CHECKLIST.md` §P0.8.3-P0.8.7 Policy Application — «P0.8.7 INFRA/LEGACY/TELEMETRY descriptors and unsupported user-ref denial.»

Each policy application stage must name the family, scratch DB, smoke command, and skipped production
scope in `LOG.md`.

Read `P0_8_CODE_FACTS.md` before any P0.8.3+ pass. If the required generator/smoke tooling for the
stage does not exist, building that tooling is the first part of the stage; do not hand-write a real
policy migration first.

### P0.9.1 Default-Deny Descriptors

- [x] Add enforce-mode descriptor state. — `P0_9_DEFAULT_DENY_CHECKLIST.md` §Checklist — «Define enforce-mode descriptor state for SCOPED, BOOTSTRAP, INFRA, LEGACY, and TELEMETRY.»
- [x] Prove unknown descriptor defaults to deny. — `P0_9_DEFAULT_DENY_CHECKLIST.md` §Checklist — «Default for unknown/missing descriptor is deny, not permit.»
- [x] Run only scratch/non-prod non-bypass role smoke. — `P0_9_DEFAULT_DENY_CHECKLIST.md` §Scope / Allowed — «Add scratch/non-prod tests proving fail-closed behavior.»
- [x] Keep production dormant. — `P0_9_DEFAULT_DENY_CHECKLIST.md` §Definition Of Done — «Production remains dormant.»

### P0.10.1-P0.10.3 CI Invariants

- [ ] P0.10.1: tier completeness and artifact agreement.
- [x] P0.10.2: FK/soft user-ref guard, including the prior audit-root leak class. — `P0_10_CI_INVARIANTS_CHECKLIST.md` §P0.10.2 User-Reference Tier Guard — «Introspect FK references to `public.platform_users`.»
- [x] P0.10.3: scoped tenant semantics and no-NULL org checks. — `P0_10_CI_INVARIANTS_CHECKLIST.md` §P0.10.3 Scoped Tenant Semantics And Null Checks — «Every SCOPED descriptor has direct org, declared FK path, or declared denorm path.»
- [x] Wire stable checks into `pnpm run audit` only when they are deterministic and not PII-printing. — `P0_10_CI_INVARIANTS_CHECKLIST.md` §Wiring / Allowed — «Wire stable invariants into `pnpm run audit` or an explicit root check script.»

### P0.11.1-P0.11.4 Org-Aware system_settings

Run storage before runtime:

- [x] P0.11.1 storage/mirror shape in public and integrator. — `P0_11_SYSTEM_SETTINGS_ORG_CHECKLIST.md` §P0.11.1 Storage Shape — «Add nullable `organization_id` to `public.system_settings`.»
- [x] P0.11.2 read path with NULL fallback and accessor guard. — `P0_11_SYSTEM_SETTINGS_ORG_CHECKLIST.md` §P0.11.2 Read Path — «Port reads accept optional organization context.»
- [x] P0.11.3 write path through `updateSetting` and mirror sync only. — `P0_11_SYSTEM_SETTINGS_ORG_CHECKLIST.md` §P0.11.3 Write Path And Mirror Sync — «`updateSetting` writes org-aware rows through the service path.»
- [x] P0.11.4 UI/rules/docs; no new `ALLOWED_KEYS` unless a real setting is added. — `P0_11_SYSTEM_SETTINGS_ORG_CHECKLIST.md` §P0.11.4 UI / Rules / Docs — «Admin UI remains global unless a setting is explicitly org-scoped.»

Do not write only one schema. Public and integrator mirror semantics must stay in lockstep.

### P0.12.1-P0.12.2 Residual References

- [x] P0.12.1 scan polymorphic references and document resolver paths. — `P0_12_RESIDUAL_REFS_CHECKLIST.md` §P0.12.1 Polymorphic References — «Scan schema/code for polymorphic reference columns.»
- [x] P0.12.2 scan JSON/text payload columns without printing PII samples. — `P0_12_RESIDUAL_REFS_CHECKLIST.md` §P0.12.2 JSON Payload / Queue PII — «Scan JSONB/text payload columns in SCOPED/BOOTSTRAP/INFRA/TELEMETRY tables.»
- [x] Any unknown scoped reference blocks later RLS family application. — `P0_12_RESIDUAL_REFS_CHECKLIST.md` §P0.12.1 Polymorphic References — «For unresolved target types, block RLS family application until owner decision.»

### P0.13.1-P0.13.3 Isolation Fixtures

- [x] P0.13.1 build scratch-safe synthetic fixtures with deterministic IDs. — `P0_13_ISOLATION_FIXTURES_CHECKLIST.md` §P0.13.1 Synthetic Fixture Factory — «Create synthetic second organization fixture.»
- [x] P0.13.2 run DB isolation assertions under non-bypass app role. — `P0_13_ISOLATION_FIXTURES_CHECKLIST.md` §P0.13.2 DB-Level Isolation Assertions — «Run under non-bypass app role in scratch/non-prod.»
- [x] P0.13.3 run current single-clinic dormant smoke. — `P0_13_ISOLATION_FIXTURES_CHECKLIST.md` §P0.13.3 App-Level Dormant Smoke — «Current single-clinic doctor smoke unchanged.»
Full CI is appropriate at the final integration checkpoint before push/merge readiness, not after each fixture edit.

## Stop Conditions

Stop and mark the task blocked if:

- branch baseline does not include the required P0.6/P0.7 commits;
- the next stage would cross into another micro-stage;
- an org source cannot be derived without inventing a fallback;
- a check would need prod DB or real external channels;
- a test requires printing PII or mutating dev PII data outside an explicitly approved migration/backfill;
- full CI is being used to compensate for unclear scope.
