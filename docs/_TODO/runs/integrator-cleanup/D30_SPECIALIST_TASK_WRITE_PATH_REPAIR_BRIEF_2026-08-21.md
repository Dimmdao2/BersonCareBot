# D30 Ш3 specialist-task write-path repair brief (2026-08-21)

## Источник оракула
«Вебапп пишет задание в момент установки `remind_at`» — `docs/_TODO/runs/integrator-cleanup/D30_SCHEDULER_REVERSAL_PLAN.md`, Ш3; live failure and exact catalog evidence — `docs/_TODO/runs/integrator-cleanup/D30_SPECIALIST_TASK_TEST_LIVE_FAILURE_2026-08-21.md`; `AGENTS.md` §5/§10a/§24.

Current TEST behavior is broken before D30 delivery logic: ordinary existing-owner
`POST /api/doctor/tasks` fails SQLSTATE `42501` on the `specialist_tasks` INSERT. The current generated privilege
artifact has column-scoped app_staff INSERT/UPDATE, while the actual Drizzle INSERT names defaulted columns too.

## Work

1. Trace the complete existing `createPgSpecialistTasksPort` create/update/complete/delete path and the exact SQL
   Drizzle emits. Reproduce the privilege mismatch without creating a new fixture framework or disposable DB.
2. Keep the one existing DB port/repository. Do not add an HTTP hop, second store, parallel repository, broad
   relation grant or bypass-RLS role.
3. Choose the smallest boundary-correct repair:
   - if the existing relation-port model can honestly carry this behavior, align only the exact required columns
     and generated declaration/artifact with the statement;
   - if direct column grants cannot preserve field/tenant invariants, use one exact named capability through the
     existing port-context seam and ask first whether an existing specialist-task root can be extended rather than
     creating a parallel root.
4. Any function/body/schema change is timestamp-forward only. Privileges remain in declaration/generator, never
   `GRANT`/`REVOKE` in a migration. Do not edit an applied migration.
5. Preserve organization/owner RLS, current product semantics, atomic write-time queue materialization and
   terminalization of unsent reminders on update/complete/delete.
6. **ЗАМЕНЕНО owner-коррекцией 21.08.2026:** постоянный DB-proof/test для этой разовой сверки грантов не добавлять.
   Форма реальных Drizzle statements и итоговые ACL принимаются инспекцией diff/generator output, а поведение —
   отдельным rollback-only живым проходом на именованной DEV через существующую owner-учётку и данные. Не писать
   source-text/count/SQL-form gate и не создавать fixture/user/clinic. Временное ослабление живых grants для fault
   injection также запрещено: доказательство не должно оставлять окно с изменёнными правами.

## Validation and handoff

Run existing targeted tests, webapp typecheck, scoped lint, privilege generator/checks and `git diff --check`. No
new permanent test file and no full CI.
Worker must not access DB/DEV/TEST/PROD, create fixtures/users/clinics, run deploy or push. Commit all work.

After worker completion: one independent audit. If a migration/function is present, a separate owner-aware named-
DEV rollback-only preflight is mandatory before landing. Candidate live behavior must be checked before landing on
an isolated port or rollback-only named DEV path; TEST is post-land only after full CI/deploy.
