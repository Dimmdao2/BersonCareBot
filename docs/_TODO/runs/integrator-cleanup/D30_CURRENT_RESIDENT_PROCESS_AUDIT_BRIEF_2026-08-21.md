# D30 Ш9 — independent audit brief (21.08.2026)

## Источник оракула

`AGENTS.md` обязателен. Authority: `docs/OWNER_DECISIONS.md` — «D30 (перенос работ по расписанию в один
резидентный процесс)»; `docs/_TODO/runs/integrator-cleanup/D30_SCHEDULER_REVERSAL_PLAN.md`, Ш9 — «worker и
scheduler сводятся в один резидентный процесс: один systemd-unit, один замок, один цикл, захват через SKIP
LOCKED»; worker brief `D30_CURRENT_RESIDENT_PROCESS_FINISH_BRIEF_2026-08-21.md`.

Candidate is `7cf580712`; base is `5662a9f57`. Audit only this Ш9 surface. D30 as a whole remains open.

## Audit contract

Before any audit action, read the AGENTS.md heading map, §10a/§10b and §24. Before accepting the branch, repeat
that read. Search later owner decisions before relying on older plan prose.

Classify each item before testing:

1. One process topology, retired worker entrypoint/unit/launchers and coherent deploy/systemd/docs are a one-time
   state inspection. Inspect the actual diff and current executable entrypoints. Do not create source-text,
   filename, import, count, unit-number or grep gates.
2. Lock ownership, lock loss, single-flight bodies and shutdown are repeatable behavior. Build the blind kill-set
   from the authority before reading tests, then inspect the existing tests and perform the minimum fault injection
   required by AGENTS.md §24.5. Do not add tests unless a named expensive and silent behavior failure is genuinely
   uncovered.
3. Verify that both former worker ticks are hosted by the already-existing scheduler coordinator, not a parallel
   coordinator or a second top-level loop; both DI graphs must preserve their former capabilities.
4. Verify deployment cannot still start a second worker service in any active non-historical path changed or owned
   by this stage. Historical reports/archive are out of scope. Check shell syntax, systemd/bootstrap self-test,
   package JSON and compose parsing with the cheapest sufficient commands.
5. Confirm existing delivery claim/idempotency/retry/reclaim code is not behaviorally rewritten by this change.
6. Do not access PROD. Do not deploy, migrate, use fixtures or create a database. No full CI. No broad test suite.

Write `docs/_TODO/runs/integrator-cleanup/D30_CURRENT_RESIDENT_PROCESS_AUDIT_2026-08-21.md` with one line per
in-scope item: PASS/FAIL/BLOCKED and exact evidence. A finding must name a reachable scenario, impact and violated
authority; style or alternative architecture is not a finding. If tests are added, commit only those tests plus
the audit artifact; otherwise commit only the audit artifact. Temporary production-code mutations must be fully
reverted. Stage explicit paths, never `git add -A`; do not push, merge or land.

Run commands synchronously and wait for them. End only after the audit artifact is committed and the tree is clean.
