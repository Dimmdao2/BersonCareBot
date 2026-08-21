# D30 specialist-task write-path — independent audit brief (2026-08-21)

## Источник оракула

> «D36 - очень внимательно! Вы любите писать тесты и гейты там где это не надо и так что они не проверяют поведение а сторожат код или цифры» — владелец, 21.08.2026.

Canonical stage: `docs/_TODO/runs/integrator-cleanup/D30_SCHEDULER_REVERSAL_PLAN.md`, Ш3. Repair authority:
`docs/_TODO/runs/integrator-cleanup/D30_SPECIALIST_TASK_WRITE_PATH_REPAIR_BRIEF_2026-08-21.md`. Live failure:
`docs/_TODO/runs/integrator-cleanup/D30_SPECIALIST_TASK_TEST_LIVE_FAILURE_2026-08-21.md`. Rules: `AGENTS.md`
§1/§1b/§5/§6/§10a/§10b/§24.

## Candidate and scope

Audit candidate product commit `b254ec1bf` after its merge with current `feat/doctor-ui-rebuild`. Inspect only:

- `deploy/postgres/privileges/relation-access.ts`;
- generated DEV/TEST privilege SQL;
- `deploy/postgres/privileges/specialist-tasks-staff-write.devDbProof.test.mjs`;
- existing real route/repository/schema/RLS paths needed to establish the emitted Drizzle statements and tenant wall.

Do not edit production code, grants, plan/checklists or generated artifacts. Do not create users, clinics, fixtures,
databases or durable rows. Never access PROD. Do not deploy or push.

## Required independent verdict

1. Before reading the candidate test, write a short kill-set from the authority: ordinary existing-owner staff can
   create a specialist task, set/change `remind_at`, complete and delete it; foreign organization/owner cannot acquire
   the row; no broad table grant, bypass-RLS role, HTTP hop, second store or extra DB port appears.
2. Inspect the real Drizzle statement shapes and determine whether the added INSERT/UPDATE column grants are exactly
   required — neither missing named/default columns nor granting unrelated write capability. Confirm generated DEV and
   TEST artifacts are byte-consistent with the declaration/generator.
3. Classify the candidate `*.devDbProof.test.mjs` under §10a/§24.4. It is forbidden to execute it: it performs live
   auto-committed `REVOKE`/`GRANT` and can leave or expose a changed privilege window. Decide whether it must be removed
   rather than retained as permanent machinery.
4. If a safe live proof is possible, use only named DEV `bcb_webapp_dev` and one explicit transaction: apply the
   candidate privilege statements inside `BEGIN`, establish the existing accepted staff/org context using canonical
   repo/runbook primitives, exercise the real create/update-remind/complete/delete SQL shape and a foreign-org denial,
   then `ROLLBACK`. Prove before/after row and ACL state unchanged. If the canonical accepted-context setup cannot be
   established without invention, report `BLOCKED` for live behavior rather than weakening the proof or using
   `SET ROLE app_staff` alone. No TEST/PROD and no disposable DB.
5. Run only existing targeted generator/check/type/lint commands that add missing signal; no full CI and no new test.

Return one line per required item: `PASS|FAIL|BLOCKED` with exact command and measured result. Any `MUST FIX` must name
the reachable failure, impact and violated owner/rule line. Save the audit report in the port artifact/log and do not
commit any file.
