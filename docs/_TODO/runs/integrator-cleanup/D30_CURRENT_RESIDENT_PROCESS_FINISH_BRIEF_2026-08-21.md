# D30: finish the current resident-process topology from measured reality

Role: complex worker. Read `AGENTS.md` headings first, then §1 server rules, §5, §10/§10a, §24, current `WORK_ORDER.md` Р-D30/D30, `docs/OWNER_DECISIONS.md` Track D and `D30_SCHEDULER_REVERSAL_PLAN.md` in full. Search later owner decisions again before editing.

Источник оракула: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — «`worker` и `scheduler` сводятся в один резидентный процесс: один systemd-unit, один замок и один цикл.»

## Current measured starting point

- `public.outgoing_delivery_queue` is already the single delivery queue and already carries `organization_id`, `specialist_task_reminder`, `reminder_dispatch` and `operator_health_digest` paths. Do not rebuild or migrate it again.
- Web-push scheduling, specialist-task materialization and operator digest/guard scheduler wakes already exist. Old open Ш1–Ш5 prose is not implementation authority; measure code and preserve only genuinely missing live gates.
- Two process entrypoints and two systemd units still exist: `infra/runtime/worker/main.ts` and `infra/runtime/scheduler/main.ts`; this is the real Ш9 gap.
- Removal of overlapping host cron is allowed only after the plan's required live observation. This isolated worker performs no live observation and therefore must not delete cron entries merely from static confidence.

## One coherent implementation stage

1. Freshly trace both resident entrypoints, their loops, locks, shutdown/error-tracking lifecycle, DB/principal ownership and all systemd/dev/test/prod descriptors. Use `code-search` first.
2. Implement Р-D30 Ш9 completely: one resident integrator process, one systemd unit, one leader lock and one top-level cycle owns the current scheduler wakes and due outgoing-delivery execution. Preserve `FOR UPDATE SKIP LOCKED`, stable event-id idempotency, retry/reclaim semantics, principal context and graceful shutdown. Do not create a third runtime or a wrapper that still starts two independent processes.
3. Reuse/parameterize the existing scheduler coordinator and worker tick instead of adding another coordinator (§5 “one common door”). Remove the retired entrypoint/unit and update DEV/TEST/PROD service lists, deploy/restart scripts, capacity/server docs and package scripts coherently.
4. Re-measure D30 Ш1–Ш6 against current code. In `D30_SCHEDULER_REVERSAL_PLAN.md`, replace stale active implementation instructions with one current state: mark code-complete portions with exact evidence, keep only genuinely missing live observation/cron-removal gates open, and close Ш9 only with this commit's evidence. Do not edit the shared `WORK_ORDER.md` in this branch because D18 concurrently owns that file; report the exact follow-up line the lead must apply after merge.
5. Tests: reuse/update existing behavioral scheduler/worker tests. Add a new test only for an expensive and silent behavior regression that cannot be made impossible structurally. Forbidden: tests/gates for source strings, file counts, import names, line order, number of loops/units or documentation text. Do not extend `schedulerDecisionGuard` or add a second structural census gate. Static removal and service-file consistency are one-time review evidence, not permanent tests.
6. Run focused integrator runtime suites, integrator typecheck/lint, relevant deploy script syntax/unit checks, `git diff --check`, and record exact commands/results in a result artifact next to this brief. Commit explicit paths before ending.

## Hard boundaries

No DB access or migration, no DEV/TEST/PROD mutation, no cronport changes on the host, no deploy/restart, no fixtures/accounts/data, no disposable database, no full CI, no push. Keep the external `operator-health-critical` watchdog, media housekeeping, media-worker and backup/deploy jobs. Do not remove digest/guard/specialist/probe cron artifacts until their named live observation gate is proven by the lead.

Done means: the code has exactly one resident worker+scheduler runtime/unit/lock/cycle by construction; existing scheduling and delivery behavior remains green; D30 plan has one non-contradictory current formulation with only real live cron gates left open; tree is clean and commit SHA is reported.
