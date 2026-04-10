# Platform User Merge v2

Инициатива по **integrator-side canonical merge** и снятию hard blocker `different_non_null_integrator_user_id` для ручного merge в webapp. Webapp-only **v1** задокументирован в [`../ARCHITECTURE/PLATFORM_USER_MERGE.md`](../ARCHITECTURE/PLATFORM_USER_MERGE.md).

## Оглавление

| Документ | Назначение |
|----------|------------|
| [`MASTER_PLAN.md`](MASTER_PLAN.md) | Северная звезда: цели, non-goals, deploy slicing, readiness gates |
| [`PROMPTS_EXEC_AUDIT_FIX.md`](PROMPTS_EXEC_AUDIT_FIX.md) | Copy-paste промпты: EXEC, AUDIT, FIX, pre-deploy audit/fix, final audit/fix |
| [`CHECKLISTS.md`](CHECKLISTS.md) | Чек-листы по каждому deploy-slice |
| [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md) | Production: порядок действий, мониторинг, rollback |
| [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md) | Хронология работ и проверок |
| [`STAGE_A_V1_STABILIZATION.md`](STAGE_A_V1_STABILIZATION.md) | Стабилизация v1 перед v2 |
| [`STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md`](STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md) | Deploy 1: schema prep integrator |
| [`STAGE_2_CANONICAL_READ_WRITE_PATH.md`](STAGE_2_CANONICAL_READ_WRITE_PATH.md) | Deploy 2: canonical read/write integrator |
| [`STAGE_3_TRANSACTIONAL_MERGE_AND_OUTBOX.md`](STAGE_3_TRANSACTIONAL_MERGE_AND_OUTBOX.md) | Deploy 3: merge service + outbox |
| [`STAGE_4_WEBAPP_REALIGNMENT.md`](STAGE_4_WEBAPP_REALIGNMENT.md) | Deploy 3: realignment webapp |
| [`AUDIT_STAGE_3.md`](AUDIT_STAGE_3.md) | Аудит репозитория: Stage 3 (merge + outbox) |
| [`AUDIT_STAGE_4.md`](AUDIT_STAGE_4.md) | Аудит репозитория: Stage 4 (webapp projection) |
| [`STAGE_5_FEATURE_FLAG_AND_FLOW_SWITCH.md`](STAGE_5_FEATURE_FLAG_AND_FLOW_SWITCH.md) | Deploy 4: флаг + порядок merge |
| [`STAGE_C_CLOSEOUT.md`](STAGE_C_CLOSEOUT.md) | Закрытие инициативы |
| [`sql/README.md`](sql/README.md) | Диагностические SQL (шаблоны) |

## Быстрые ссылки (код)

- Integrator merge / outbox: `apps/integrator/src/infra/db/repos/mergeIntegratorUsers.ts`, `projectionOutboxMergePolicy.ts`
- Webapp Stage 4 rekey: `apps/webapp/scripts/realign-webapp-integrator-user-projection.ts`, `apps/webapp/src/infra/ops/webappIntegratorUserProjectionRealignment.ts`
- Integrator: `apps/integrator/src/infra/db/writePort.ts`, `projectionOutbox.ts`, миграции `apps/integrator/src/infra/db/migrations/core/`
- Webapp merge: `apps/webapp/src/infra/repos/pgPlatformUserMerge.ts`, `platformUserMergePreview.ts`
- Ingestion: `apps/webapp/src/modules/integrator/events.ts`
- Деплой: `deploy/host/deploy-prod.sh` — один push в `main` → integrator migrate → webapp migrate → рестарт всех сервисов
