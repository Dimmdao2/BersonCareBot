# SAAS Foundation Autonomous Nightly Runbook

Status: execution base document for autonomous/nightly agents after P0.7.4.

Purpose: let agents continue Phase 0 one micro-stage at a time without broadening scope, touching
production, overusing full CI, or leaving unlogged work.

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
- `.cursor/rules/pre-push-ci.mdc`
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

Each autonomous pass handles exactly one micro-stage from `CORRECTED_PLAN.md`.

Allowed:

- one stage, one worktree/branch, one focused implementation;
- targeted tests/lint/typecheck through `/home/dev/orch/run-tests.sh`;
- `LOG.md` update in the same commit;
- taskdb status/note updates through `node /home/dev/brain/tools/taskdb.mjs`;
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

- [ ] Confirm `git status --short` is clean or unrelated changes are understood.
- [ ] Confirm current branch is not `main` or `test`.
- [ ] Confirm the next stage from `LOG.md` and `CORRECTED_PLAN.md`.
- [ ] Find or create the taskdb task for this exact stage; set `status doing`.
- [ ] Run the stage preflight guard through the wrapper:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && git diff --check"
```

- [ ] Read the exact stage checklist and the named source files.
- [ ] If the stage requires a decision not already documented, stop: set task `blocked`, set `owner_waiting true`, and write the exact question.

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

- [ ] Re-read `P0_7_WRITER_CENSUS.md` -> Media Worker section.
- [ ] Confirm `media_transcode_jobs.organization_id` and `media_files.organization_id` exist from P0.4.P7.
- [ ] Decide from current code whether `claimNextJob` can return `organizationId` with the claimed job.
- [ ] Keep stale reclaim and queue claim status transitions as worker/queue mechanics unless the row org is loaded in the same transaction.
- [ ] Make processing/failure/duration writes execute under `runWithDbOrganizationPrincipal(job.organizationId, ...)` or an equivalent central API from `@bersoncare/db-principal`.
- [ ] Do not add manual `SET app.org` in media business logic.
- [ ] Add tests proving org context is applied for job processing writes.
- [ ] Add tests proving missing org leaves current behavior unchanged.
- [ ] Add tests proving claim/reclaim does not require a synthetic default org.
- [ ] Run media-worker targeted tests, media-worker typecheck, focused eslint, and `git diff --check`.
- [ ] Update `LOG.md`.

Local gate template:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && pnpm --dir apps/media-worker exec vitest run src/jobs/claim.test.ts src/processProgramSubmissionTranscode.test.ts src/withClient.test.ts src/runMediaWorkerSql.test.ts --reporter verbose && pnpm --dir apps/media-worker typecheck && pnpm --dir apps/media-worker exec eslint src/jobs/claim.ts src/processTranscodeJob.ts src/processProgramSubmissionTranscode.ts src/persistVideoDurationSeconds.ts src/withClient.ts src/runMediaWorkerSql.ts && git diff --check"
```

### P0.7.6 Payment/Webhook Writers

Goal: apply dormant tenant context to payment, booking/payment webhook, membership, and merge writers
that touch SCOPED or org-direct `be_*` rows. Boot migrations remain migrator-only.

Execution checklist:

- [ ] Use code index for payment/webhook writer discovery before `rg`.
- [ ] Build a small mapping table in the stage notes: entrypoint, tables touched, org source, tests.
- [ ] Separate runtime webhooks from boot/migration/ops scripts.
- [ ] For `be_*` writes, use existing organization ownership, not a default org fallback.
- [ ] For platform merge/package writers, require caller-provided scoped transaction or document a blocker.
- [ ] Add focused tests for correct org, missing org dormant behavior, and no boot-migration context.
- [ ] Update `LOG.md`.

### P0.8.1-P0.8.7 RLS Descriptors And Policies

Run in this order only:

- [ ] P0.8.1 descriptor model, no DB mutation.
- [ ] P0.8.2 pure SQL renderer tests, no DB mutation.
- [ ] P0.8.3 public direct-org generator + scratch smoke first; policy migration only after smoke passes.
- [ ] P0.8.4 public FK/denorm preflight + scratch smoke by subgroup before migration.
- [ ] P0.8.5 integrator bridge/denorm preflight + scratch smoke by source family before migration.
- [ ] P0.8.6 bootstrap hybrid policies plus pre-context read smoke.
- [ ] P0.8.7 INFRA/LEGACY/TELEMETRY exemption checks plus unsupported user-ref denial.

Each policy application stage must name the family, scratch DB, smoke command, and skipped production
scope in `LOG.md`.

Read `P0_8_CODE_FACTS.md` before any P0.8.3+ pass. If the required generator/smoke tooling for the
stage does not exist, building that tooling is the first part of the stage; do not hand-write a real
policy migration first.

### P0.9.1 Default-Deny Descriptors

- [ ] Add enforce-mode descriptor state.
- [ ] Prove unknown descriptor defaults to deny.
- [ ] Run only scratch/non-prod non-bypass role smoke.
- [ ] Keep production dormant.

### P0.10.1-P0.10.3 CI Invariants

- [ ] P0.10.1: tier completeness and artifact agreement.
- [ ] P0.10.2: FK/soft user-ref guard, including the prior audit-root leak class.
- [ ] P0.10.3: scoped tenant semantics and no-NULL org checks.
- [ ] Wire stable checks into `pnpm run audit` only when they are deterministic and not PII-printing.

### P0.11.1-P0.11.4 Org-Aware system_settings

Run storage before runtime:

- [ ] P0.11.1 storage/mirror shape in public and integrator.
- [ ] P0.11.2 read path with NULL fallback and accessor guard.
- [ ] P0.11.3 write path through `updateSetting` and mirror sync only.
- [ ] P0.11.4 UI/rules/docs; no new `ALLOWED_KEYS` unless a real setting is added.

Do not write only one schema. Public and integrator mirror semantics must stay in lockstep.

### P0.12.1-P0.12.2 Residual References

- [ ] P0.12.1 scan polymorphic references and document resolver paths.
- [ ] P0.12.2 scan JSON/text payload columns without printing PII samples.
- [ ] Any unknown scoped reference blocks later RLS family application.

### P0.13.1-P0.13.3 Isolation Fixtures

- [ ] P0.13.1 build scratch-safe synthetic fixtures with deterministic IDs.
- [ ] P0.13.2 run DB isolation assertions under non-bypass app role.
- [ ] P0.13.3 run current single-clinic dormant smoke.
- [ ] Full CI is appropriate at the final integration checkpoint before push/merge readiness, not after each fixture edit.

## Stop Conditions

Stop and mark the task blocked if:

- branch baseline does not include the required P0.6/P0.7 commits;
- the next stage would cross into another micro-stage;
- an org source cannot be derived without inventing a fallback;
- a check would need prod DB or real external channels;
- a test requires printing PII or mutating dev PII data outside an explicitly approved migration/backfill;
- full CI is being used to compensate for unclear scope.
