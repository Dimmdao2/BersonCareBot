> STATUS (verified 2026-07-23, code-reconciled): see docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/CHECKPOINT_2026-07-23_STATE_AND_BACKEND_WORK_ORDER.md

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

- [x] Run `pnpm run check:saas-db-regression`. (✓ scripts/check-saas-db-regression.mjs | sub-checks green 2026-07-23)
- [x] Enumerate webapp route/action/page/app-layer writers touching SCOPED tables. (✓ P0_7_WRITER_CENSUS.md — 163 webapp write-signal files classified)
- [x] Enumerate integrator API/bot writers touching SCOPED tables. (✓ P0_7_WRITER_CENSUS.md — 46 integrator files)
- [x] Enumerate integrator worker/scheduler writers touching SCOPED tables. (✓ P0_7_WRITER_CENSUS.md integrator worker/scheduler family)
- [x] Enumerate media-worker writers touching SCOPED tables. (✓ P0_7_WRITER_CENSUS.md — 2 media-worker files)
- [x] Enumerate payment/webhook writers and boot/migration writers. (✓ P0_7_WRITER_CENSUS.md payment/webhook + boot/migration families)
- [x] Mark each writer as direct-org, FK-path, denorm-path, bootstrap, infra, legacy, or unknown. (✓ P0_7_WRITER_CENSUS.md classification columns)
- [x] Any unknown writer becomes a blocker before P0.7.2+. (✓ P0_7_WRITER_CENSUS.md — no unknown SCOPED writer left unclassified)
- [x] Update `LOG.md`. (✓ LOG.md P0.7.1 entry)

Local gate:

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && git diff --check"
```

## P0.7.2-P0.7.6 Writer Application Scope

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.


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

- [ ] P0.7.2 webapp route/action writers. (REMAINING: complete the broad webapp route/action writer sweep — central chokepoint applies principal via withClient prepare hook + stampStaffPrincipal (requireRole.ts:197), but exhaustive per-route coverage only partly proven; residual route audit tracked taskdb #725, C1 caveat lines 107,140 — target apps/webapp/src/app/**/route.ts + actions)
- [x] P0.7.3 integrator API/bot writers. (✓ apps/integrator/src/infra/principal/organizationPrincipal.ts | T0_TENANT_CONTEXT_CUTOVER_CHECKLIST support/reminder/contacts/mailing slices)
- [x] P0.7.4 integrator worker/scheduler writers. (✓ apps/integrator/src/infra/runtime/worker/projectionWorker.ts | .../scheduler/organizationTicks.ts | T0 entrypoint-to-org map)
- [x] P0.7.5 media-worker writers. (✓ apps/media-worker/src/jobs/claim.ts:52-53,67,113 org-equality + quarantine | processTranscodeJob.principal.test.ts)
- [ ] P0.7.6 payment/webhook writers; boot migrations remain migrator-only. (REMAINING: apply/prove dormant context on payment/webhook runtime writers — T0.4 covered mailing/reminder/contacts/rubitime, but the payment/webhook writer family mapping + per-path org-source + tests are not independently code-verified in this pass — target apps/webapp payment routes + integrator webhook writers)

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

- [x] Re-read `P0_7_WRITER_CENSUS.md` Media Worker section. (✓ P0_7_WRITER_CENSUS.md Media Worker family)
- [x] Inspect `apps/media-worker/src/jobs/claim.ts`, `processTranscodeJob.ts`, `processProgramSubmissionTranscode.ts`, `persistVideoDurationSeconds.ts`, `withClient.ts`, and `runMediaWorkerSql.ts`. (✓ files present; tests processTranscodeJob.principal.test.ts | processProgramSubmissionTranscode.test.ts | runMediaWorkerSql.test.ts)
- [x] Confirm the current schema/source of `organization_id` for `media_transcode_jobs` and `media_files`. (✓ jobs/claim.ts:52-53 joins j.organization_id / mf.organization_id)
- [x] Decide and document whether `claimNextJob` returns `organizationId` directly or the processor loads it before SCOPED writes. (✓ jobs/claim.ts:101,113 RETURNING organization_id, returned on claimed job)
- [x] Ensure successful transcode updates, retry/permanent failure updates, program submission updates, and duration persistence run under the resolved org context. (✓ processTranscodeJob.principal.test.ts proves principal-applied writer path)
- [x] Ensure missing org leaves current dormant behavior unchanged and is logged/handled without a fallback. (✓ jobs/claim.ts:67 quarantines null/mismatched org, no synthetic fallback)
- [x] Add focused tests for org-applied writer path, missing-org dormant path, and claim/reclaim behavior. (✓ jobs/claim.test.ts | processTranscodeJob.principal.test.ts)
- [x] Update `LOG.md`. (✓ LOG.md media-worker context slice entry | T0 checklist media-worker context slice)

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
