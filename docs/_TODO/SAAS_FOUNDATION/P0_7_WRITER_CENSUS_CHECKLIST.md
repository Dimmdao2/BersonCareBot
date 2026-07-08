# P0.7 Writer Census Checklist

Status: executable checklist for P0.7.1-P0.7.6.

Purpose: make every SCOPED writer visible, then apply the dormant tenant context to writer families through
the chokepoint without changing current behavior while the context is unset.

## Shared Inputs

- `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/FUNNEL_COVERAGE_REPORT.md`
- `docs/_TODO/SAAS_FOUNDATION/scope-derivation/tiers-218.tsv`
- `docs/_TODO/SAAS_FOUNDATION/scope-derivation/p0-4-batches.tsv`
- `docs/_TODO/SAAS_FOUNDATION/RAW_SQL_AUDIT.md`
- `docs/_TODO/SAAS_FOUNDATION/UPSTREAM_SYNC_REGRESSION_CHECKLIST.md`

## P0.7.1 Inventory-Only Scope

Allowed:

- Produce a writer census artifact, grouped by process family.
- Reconcile against DB_ACCESS funnel coverage and SCOPED table artifacts.
- Add read-only scripts/checks if they only scan code.

Forbidden:

- No writer code changes in P0.7.1.
- No RLS policies.
- No DB writes.
- No route behavior changes.

Checklist:

- [ ] Run `pnpm run check:saas-db-regression`.
- [ ] Enumerate webapp route/action/page/app-layer writers touching SCOPED tables.
- [ ] Enumerate integrator API/bot writers touching SCOPED tables.
- [ ] Enumerate integrator worker/scheduler writers touching SCOPED tables.
- [ ] Enumerate media-worker writers touching SCOPED tables.
- [ ] Enumerate payment/webhook writers and boot/migration writers.
- [ ] Mark each writer as direct-org, FK-path, denorm-path, bootstrap, infra, legacy, or unknown.
- [ ] Any unknown writer becomes a blocker before P0.7.2+.
- [ ] Update `LOG.md`.

Local gate:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && git diff --check"
```

## P0.7.2-P0.7.6 Writer Application Scope

Allowed:

- Apply dormant tenant context to one process family at a time.
- Add focused tests around the touched writer family.
- Keep unset context permissive/dormant until RLS enforcement stages.

Forbidden:

- No mixed-family mega-PR.
- No manual `SET app.org` in business services/routes.
- No policy migrations.
- No production role/env changes.

Family checkpoints:

- [ ] P0.7.2 webapp route/action writers.
- [ ] P0.7.3 integrator API/bot writers.
- [ ] P0.7.4 integrator worker/scheduler writers.
- [ ] P0.7.5 media-worker writers.
- [ ] P0.7.6 payment/webhook writers; boot migrations remain migrator-only.

### P0.7.5 Media-Worker Execution Checklist

Allowed:

- Keep the stage limited to `apps/media-worker`.
- Add an `organizationId` to the claimed job shape only if it is loaded from `media_transcode_jobs` or its `media_files` parent.
- Wrap SCOPED media/job writes in the existing dormant DB principal carrier.
- Keep queue claim/reclaim mechanics explicit: either scoped from the loaded row or intentionally worker/queue-only.

Forbidden:

- No synthetic default organization for jobs with missing org.
- No manual `SET app.org` in transcode business functions.
- No real S3 writes or external delivery in tests.
- No policy migrations, role flip, payment/webhook work, or webapp/integrator writer work.

Checklist:

- [ ] Re-read `P0_7_WRITER_CENSUS.md` Media Worker section.
- [ ] Inspect `apps/media-worker/src/jobs/claim.ts`, `processTranscodeJob.ts`, `processProgramSubmissionTranscode.ts`, `persistVideoDurationSeconds.ts`, `withClient.ts`, and `runMediaWorkerSql.ts`.
- [ ] Confirm the current schema/source of `organization_id` for `media_transcode_jobs` and `media_files`.
- [ ] Decide and document whether `claimNextJob` returns `organizationId` directly or the processor loads it before SCOPED writes.
- [ ] Ensure successful transcode updates, retry/permanent failure updates, program submission updates, and duration persistence run under the resolved org context.
- [ ] Ensure missing org leaves current dormant behavior unchanged and is logged/handled without a fallback.
- [ ] Add focused tests for org-applied writer path, missing-org dormant path, and claim/reclaim behavior.
- [ ] Update `LOG.md`.

Suggested local gate:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && pnpm --dir apps/media-worker exec vitest run src/jobs/claim.test.ts src/processProgramSubmissionTranscode.test.ts src/withClient.test.ts src/runMediaWorkerSql.test.ts --reporter verbose && pnpm --dir apps/media-worker typecheck && pnpm --dir apps/media-worker exec eslint src/jobs/claim.ts src/processTranscodeJob.ts src/processProgramSubmissionTranscode.ts src/persistVideoDurationSeconds.ts src/withClient.ts src/runMediaWorkerSql.ts && git diff --check"
```

### P0.7.6 Payment/Webhook Execution Checklist

Allowed:

- Build a small mapping before code changes: entrypoint, tables touched, org source, test file.
- Apply context only to runtime payment/webhook writers.
- Keep boot migrations, migration ledgers, and one-off ops scripts under migrator-only semantics.

Forbidden:

- No default-org fallback for payment/user/member writes.
- No broad platform-merge rewrite without a scoped caller contract.
- No production payment provider calls or real webhook replays.

Checklist:

- [ ] Use code index for payment/webhook writer discovery, then targeted `rg`.
- [ ] Classify each path as runtime SCOPED/org-direct, BOOTSTRAP, INFRA, LEGACY, or migrator-only.
- [ ] For each runtime SCOPED path, identify the organization source before writing code.
- [ ] For package/caller-transport writers, require an already-scoped transaction or block with a documented decision.
- [ ] Add focused tests for correct-org context, missing-org dormant behavior, and migrator-only exclusion.
- [ ] Update `LOG.md`.

Per-family local gate:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && <family targeted tests> && <family lint/typecheck> && git diff --check"
```

## Definition Of Done

- P0.7.1 census covers every known SCOPED writer family.
- Each implementation substage changes exactly one process family.
- Unset context preserves current runtime behavior.
- No writer bypasses the DB chokepoint after the family stage.
