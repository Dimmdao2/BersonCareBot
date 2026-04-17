# Stage C — Закрытие инициативы

**Цель:** формально завершить Platform User Merge v2 после успешного Deploy 4.

**Статус:** инициатива **закрыта на уровне audited repository tree** — **2026-04-10**.  
Этот документ относится к **конкретному проверенному состоянию дерева репозитория**, на котором были прогнаны команды из раздела «Регрессия». Если `git diff main...HEAD` пустой, source of truth для closeout — текущее audited working tree плюс `git status --short --branch`, а не абстрактное «любое будущее состояние main/рабочего дерева».  
Операционные проверки на конкретной production-паре (winner/loser) после каждого merge — по [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md) и [`sql/README.md`](sql/README.md); вывод `psql` сохраняет оператор в ticket / ops record. [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md) используется только для repo-level engineering milestones.

---

## Evidence baseline

- `git rev-parse HEAD`: `eee67350445547ddc2df1370cc535b64c2651324`
- `git rev-parse --short HEAD`: `eee6735`

```text
## main...origin/main
 M apps/webapp/src/app/api/api.md
 M apps/webapp/src/app/api/doctor/clients/integrator-merge/route.test.ts
 M apps/webapp/src/app/api/doctor/clients/integrator-merge/route.ts
 M apps/webapp/src/app/api/doctor/clients/merge/route.test.ts
 M apps/webapp/src/app/api/doctor/clients/merge/route.ts
 M apps/webapp/src/infra/integrations/integratorUserMergeM2mClient.flow.test.ts
 M apps/webapp/src/infra/integrations/integratorUserMergeM2mClient.ts
 M apps/webapp/src/infra/manualMergeIntegratorGate.test.ts
 M apps/webapp/src/infra/manualMergeIntegratorGate.ts
 M apps/webapp/src/infra/manualPlatformUserMerge.test.ts
 M apps/webapp/src/infra/manualPlatformUserMerge.ts
 M apps/webapp/src/infra/repos/pgPlatformUserMerge.test.ts
 M apps/webapp/src/infra/repos/pgPlatformUserMerge.ts
 M docs/ARCHITECTURE/PLATFORM_USER_MERGE.md
 M docs/PLATFORM_USER_MERGE_V2/AGENT_EXECUTION_LOG.md
 M docs/PLATFORM_USER_MERGE_V2/AUDIT_FINAL.md
 M docs/PLATFORM_USER_MERGE_V2/CUTOVER_RUNBOOK.md
 M docs/PLATFORM_USER_MERGE_V2/README.md
 M docs/PLATFORM_USER_MERGE_V2/STAGE_C_CLOSEOUT.md
 M docs/VIDEO_HLS_DELIVERY/00-master-plan.md
 M docs/VIDEO_HLS_DELIVERY/02-target-architecture.md
 M docs/VIDEO_HLS_DELIVERY/04-test-strategy.md
 M docs/VIDEO_HLS_DELIVERY/05-risk-register.md
 M docs/VIDEO_HLS_DELIVERY/06-execution-log.md
 M docs/VIDEO_HLS_DELIVERY/phases/phase-02-transcoding-pipeline-and-worker.md
 M docs/VIDEO_HLS_DELIVERY/phases/phase-03-storage-layout-and-artifact-management.md
 M docs/VIDEO_HLS_DELIVERY/phases/phase-04-playback-api-and-delivery-strategy.md
 M docs/VIDEO_HLS_DELIVERY/phases/phase-05-player-integration-and-dual-mode-frontend.md
 M docs/VIDEO_HLS_DELIVERY/phases/phase-09-signed-urls-ttl-and-private-access.md
?? docs/PLATFORM_USER_MERGE_V2/AUDIT_INDEPENDENT.md
```

---

## Регрессия

- [x] `pnpm run ci` на audited repository tree.

**Evidence (2026-04-10):**

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

Результат: **exit 0**. В составе CI: integrator **649** passed (6 skipped), webapp **1417** passed (5 skipped); `pnpm audit --prod` — без известных уязвимостей.

- [x] Targeted tests:
  - **webapp** (9 файлов, **130** тестов, OK):

```bash
cd apps/webapp && pnpm exec vitest run \
  src/infra/repos/pgPlatformUserMerge.test.ts \
  src/infra/platformUserMergePreview.test.ts \
  src/modules/integrator/events.test.ts \
  src/app/api/doctor/clients/merge-preview/route.test.ts \
  src/app/api/doctor/clients/merge/route.test.ts \
  src/app/api/doctor/clients/integrator-merge/route.test.ts \
  src/infra/manualMergeIntegratorGate.test.ts \
  src/app/app/doctor/clients/adminMergeAccountsLogic.test.ts \
  src/infra/integrations/integratorUserMergeM2mClient.flow.test.ts
```

  - **integrator** (4 файла, **26** тестов, OK):

```bash
cd apps/integrator && pnpm exec vitest run \
  src/infra/db/repos/mergeIntegratorUsers.test.ts \
  src/infra/db/repos/projectionOutboxMergePolicy.test.ts \
  src/integrations/bersoncare/userMergeM2mRoute.test.ts \
  src/infra/db/repos/projectionHealth.test.ts
```

**Сценарий e2e (репозиторный):** цепочка «canonical-pair → integrator merge → webapp gate» покрыта unit/stub-flow тестами (`integratorUserMergeM2mClient.flow.test.ts`, `integrator-merge/route.test.ts`, preview/merge routes). Полный браузерный прогон на двух живых БД в CI не входит в обязательный контракт — при появлении стабильного staging см. [`AUDIT_STAGE_5.md`](AUDIT_STAGE_5.md) MANDATORY §5.

---

## Документация

- [x] [`../ARCHITECTURE/PLATFORM_USER_MERGE.md`](../ARCHITECTURE/PLATFORM_USER_MERGE.md) — § v1/v2 и статус закрытия v2.
- [x] [`MASTER_PLAN.md`](MASTER_PLAN.md) — статус «завершено», дата, readiness gates.
- [x] [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md) — итоговая запись Stage C.

---

## Отчёт о закрытии

### 1. Снятые риски

| Риск | Как снят (проверяемо) |
|------|------------------------|
| Phantom user / рассинхрон при двух non-null `integrator_user_id` | Integrator canonical merge + outbox policy + webapp conditional flow под флагом; см. [`AUDIT_STAGE_3.md`](AUDIT_STAGE_3.md), [`AUDIT_STAGE_4.md`](AUDIT_STAGE_4.md), [`AUDIT_STAGE_5.md`](AUDIT_STAGE_5.md), targeted тесты выше. |
| Loser id в read-side webapp projection после merge | Job/SQL realignment + gate UNION в коде с CI-сверкой файла; см. Stage 4 doc и `webappIntegratorUserProjectionRealignment.ts`. |
| Нарушение `UNIQUE(idempotency_key)` в `projection_outbox` при merge | Логика rewrite/dedup в транзакции merge; тесты `mergeIntegratorUsers`, `projectionOutboxMergePolicy`; см. [`AUDIT_STAGE_3.md`](AUDIT_STAGE_3.md). |
| Регрессия ingestion / merge-class 503-loop | `events.test.ts`, `integrator/events/route.test.ts` (в полном webapp suite); Stage A аудит. |

### 2. Оставшееся вне scope (как в `MASTER_PLAN`)

- Physical delete alias-строк `platform_users` / `users`.
- Полный replay отложенных событий после `auto_merge_conflict` (в т.ч. `preferences.updated` без отдельного replay).
- Объединение двух отдельных PostgreSQL в одну БД.
- Опционально: отдельный CI job с двумя БД и UI e2e — усиление, не блокер закрытия репозитория ([`AUDIT_STAGE_5.md`](AUDIT_STAGE_5.md) MANDATORY §5).

### 3. Operational notes

- **Feature flag (admin `system_settings`):** `platform_user_merge_v2_enabled` — whitelist в `apps/webapp/src/modules/system-settings/types.ts`, UI **Настройки → Админ**, PATCH `/api/admin/settings`. Зеркалирование в БД integrator — через стандартный `updateSetting` (см. правила проекта).
- **Rollback:** выключить флаг в админке (без redeploy); полный откат кода — deploy предыдущего коммита + политика миграций — [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md).
- **Runbook / SQL gates:** [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md), [`sql/README.md`](sql/README.md). Подключение к БД на production — только с `source` env из [`../ARCHITECTURE/SERVER CONVENTIONS.md`](../ARCHITECTURE/SERVER%20CONVENTIONS.md).
- **On-call / владелец:** роль владельца операционного контура merge — **команда продукта / дежурный по релизам** организации (имя персоны в репозиторий не фиксируется); инциденты — по стандартному каналу on-call организации.

### 4. Evidence на production (шаблон для оператора, не вывод из этого прогона)

После **каждого** реального merge пары с разными integrator id на production сохранить в тикете:

1. Webapp gate — все `cnt = 0` в [`sql/diagnostics_webapp_integrator_user_id.sql`](sql/diagnostics_webapp_integrator_user_id.sql) для `loser_id`:

```bash
set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v loser_id='LOSER_ID' \
  -f /opt/projects/bersoncarebot/docs/PLATFORM_USER_MERGE_V2/sql/diagnostics_webapp_integrator_user_id.sql
```

2. Integrator outbox — сводка по статусам и проверка pending с quoted `"integratorUserId":"LOSER_ID"` в payload (заменить `LOSER_ID`):

```bash
set -a && source /opt/env/bersoncarebot/api.prod && set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
SELECT status, count(*)::bigint AS cnt
FROM projection_outbox
GROUP BY status
ORDER BY status;
"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
SELECT count(*)::bigint AS pending_rows_with_loser
FROM projection_outbox
WHERE status = 'pending'
  AND payload::text LIKE '%' || chr(34) || 'integratorUserId' || chr(34) || ':' || chr(34) || 'LOSER_ID' || chr(34) || '%';
"
```

Этот `payload::text LIKE` — **heuristic signal**, а не математически полное доказательство для всех будущих форм payload. Если есть сомнение или нестандартный event type, дополнительно смотреть `node apps/integrator/scripts/projection-health.mjs` и sample raw payload по релевантным типам событий.

3. При необходимости: `node apps/integrator/scripts/projection-health.mjs` на хосте после deploy — см. [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md).

---

## Архив

- По политике проекта: при полном завершении можно перенести материалы в `docs/archive/` с индексом в `docs/archive/README.md` (опционально).

## Связь с todo «enablement-closeout»

Закрытие = выполнение чек-листов этого файла + финальная запись в execution log.
