# Промпты для авто-агентов (copy-paste)

Контекст инициативы:

- Master plan: `docs/PLATFORM_USER_MERGE_V2/MASTER_PLAN.md`
- Stage docs: `docs/PLATFORM_USER_MERGE_V2/STAGE_*.md`
- Checklists: `docs/PLATFORM_USER_MERGE_V2/CHECKLISTS.md`
- Runbook: `docs/PLATFORM_USER_MERGE_V2/CUTOVER_RUNBOOK.md`
- Execution log: `docs/PLATFORM_USER_MERGE_V2/AGENT_EXECUTION_LOG.md`

Общие правила для всех запусков:

1. Работать строго в scope указанного stage.
2. После выполнения задач обновлять `AGENT_EXECUTION_LOG.md`.
3. В каждом EXEC/FIX прогонять релевантные тесты и `pnpm run ci`.
4. В каждом AUDIT сохранять отдельный отчет:
   - `docs/PLATFORM_USER_MERGE_V2/AUDIT_STAGE_<ID>.md` для stage audit,
   - `docs/PLATFORM_USER_MERGE_V2/AUDIT_PRE_DEPLOY_<N>.md` для pre-deploy audit,
   - `docs/PLATFORM_USER_MERGE_V2/AUDIT_FINAL.md` для финального аудита.
5. Каждый audit-файл обязан содержать раздел `MANDATORY FIX INSTRUCTIONS`:
   - нумерованный список обязательных фиксов,
   - severity (`critical|major|minor`),
   - файлы,
   - критерий done.
6. Любой FIX обязан закрыть все `critical` и `major` из `MANDATORY FIX INSTRUCTIONS`.
7. Не добавлять новые env vars для интеграционной конфигурации. Флаги/ключи - через `system_settings`.
8. Не менять правила deploy pipeline: source of truth `deploy/host/deploy-prod.sh`, `docs/ARCHITECTURE/SERVER CONVENTIONS.md`.

---

## Stage A - EXEC (v1 stabilization)

```text
Выполни Stage A по документу:
docs/PLATFORM_USER_MERGE_V2/STAGE_A_V1_STABILIZATION.md

И контекст:
- docs/PLATFORM_USER_MERGE_V2/MASTER_PLAN.md
- docs/ARCHITECTURE/PLATFORM_USER_MERGE.md
- docs/REPORTS/STRICT_PURGE_MANUAL_MERGE_EXECUTION_LOG.md

Требования:
1) Проверь фактическую эксплуатацию v1 (audit actions, 503-loop risks, merge/purge regressions).
2) Зафиксируй результат в docs/PLATFORM_USER_MERGE_V2/AGENT_EXECUTION_LOG.md.
3) Не менять runtime код на этом шаге без явного дефекта.

Формат итога:
- checks performed
- findings
- gate verdict: PASS | REWORK_REQUIRED
```

## Stage A - AUDIT

```text
Проведи аудит Stage A.

Проверь:
1) Есть evidence, что v1 стабилен перед v2.
2) Явно зафиксирован blocker different_non_null_integrator_user_id до v2.
3) В AGENT_EXECUTION_LOG.md есть полная запись (что проверяли, что нашли, verdict).

Сохрани отчет:
docs/PLATFORM_USER_MERGE_V2/AUDIT_STAGE_A.md

Добавь раздел MANDATORY FIX INSTRUCTIONS.
```

## Stage A - FIX

```text
Исправь замечания из:
docs/PLATFORM_USER_MERGE_V2/AUDIT_STAGE_A.md

Только Stage A scope.
Обнови AGENT_EXECUTION_LOG.md.
```

---

## Stage 1 - EXEC (integrator canonical schema / Deploy 1)

```text
Выполни Stage 1 по документу:
docs/PLATFORM_USER_MERGE_V2/STAGE_1_INTEGRATOR_CANONICAL_SCHEMA.md

Сделай:
1) Добавь integrator migration с users.merged_into_user_id (+ check + index).
2) Обнови docs:
   - apps/integrator/src/infra/db/schema.md
   - docs/ARCHITECTURE/DB_STRUCTURE.md (раздел integrator users)
3) Не меняй behavior webapp и не снимай blocker.
4) Прогони релевантные тесты + pnpm run ci.
5) Обнови AGENT_EXECUTION_LOG.md.

Итог:
- changed files
- migration name
- checks run
- gate verdict
```

## Stage 1 - AUDIT

```text
Проведи аудит Stage 1.

Проверь:
1) Миграция лежит в apps/integrator/src/infra/db/migrations/core/.
2) users.merged_into_user_id nullable и корректно ссылается на users(id).
3) Есть check self-reference и индекс alias lookup.
4) Docs обновлены и непротиворечивы.
5) CI evidence есть.

Сохрани отчет:
docs/PLATFORM_USER_MERGE_V2/AUDIT_STAGE_1.md

Добавь MANDATORY FIX INSTRUCTIONS.
```

## Stage 1 - FIX

```text
Исправь замечания из:
docs/PLATFORM_USER_MERGE_V2/AUDIT_STAGE_1.md

Scope только Stage 1.
Обнови AGENT_EXECUTION_LOG.md.
Повтори проверки + pnpm run ci.
```

---

## Stage 2 - EXEC (canonical read/write path / Deploy 2)

```text
Выполни Stage 2 по документу:
docs/PLATFORM_USER_MERGE_V2/STAGE_2_CANONICAL_READ_WRITE_PATH.md

Сделай:
1) В integrator write path canonicalize user id перед enqueue projection_outbox.
2) Добавь guards от записи доменных данных в alias loser.
3) Обнови тесты writePort/outbox/canonical resolution.
4) Не снимай webapp blocker.
5) Обнови AGENT_EXECUTION_LOG.md.
6) Прогони tests + pnpm run ci.
```

## Stage 2 - AUDIT

```text
Проведи аудит Stage 2.

Проверь:
1) Canonical resolution реально используется до enqueueProjectionEvent.
2) idempotency key не ломается и не расходится по alias/winner.
3) Нет silent resurrection loser id на write path.
4) CI evidence есть.

Сохрани отчет:
docs/PLATFORM_USER_MERGE_V2/AUDIT_STAGE_2.md

Добавь MANDATORY FIX INSTRUCTIONS.
```

## Stage 2 - FIX

```text
Исправь замечания из:
docs/PLATFORM_USER_MERGE_V2/AUDIT_STAGE_2.md

Только Stage 2 scope.
Обнови AGENT_EXECUTION_LOG.md.
Повтори tests + pnpm run ci.
```

---

## Stage 3 - EXEC (transactional merge + outbox / часть Deploy 3)

```text
Выполни Stage 3 по документу:
docs/PLATFORM_USER_MERGE_V2/STAGE_3_TRANSACTIONAL_MERGE_AND_OUTBOX.md

Сделай:
1) Реализуй mergeIntegratorUsers(winnerId, loserId, ...) в транзакции.
2) Детерминированный порядок lock.
3) Перенос FK-зависимостей loser -> winner.
4) loser помечается merged_into_user_id.
5) Реализуй политику для projection_outbox (rewrite/dedup/replay), не нарушая UNIQUE(idempotency_key).
6) Добавь тесты и логирование.
7) Обнови AGENT_EXECUTION_LOG.md.
8) Прогони tests + pnpm run ci.
```

## Stage 3 - AUDIT

```text
Проведи аудит Stage 3.

Проверь:
1) Merge транзакционный и идемпотентный.
2) Нет deadlock-prone порядка блокировок.
3) Outbox rewrite не создает duplicate idempotency_key.
4) Поведение при коллизиях clearly defined.
5) CI evidence есть.

Сохрани отчет:
docs/PLATFORM_USER_MERGE_V2/AUDIT_STAGE_3.md

Добавь MANDATORY FIX INSTRUCTIONS.
```

## Stage 3 - FIX

```text
Исправь замечания из:
docs/PLATFORM_USER_MERGE_V2/AUDIT_STAGE_3.md

Только Stage 3 scope.
Обнови AGENT_EXECUTION_LOG.md.
Повтори tests + pnpm run ci.
```

---

## Stage 4 - EXEC (webapp realignment / часть Deploy 3)

```text
Выполни Stage 4 по документу:
docs/PLATFORM_USER_MERGE_V2/STAGE_4_WEBAPP_REALIGNMENT.md

Сделай:
1) Реализуй rekey/replay/backfill стратегию для webapp таблиц с integrator_user_id.
2) Добавь безопасные SQL/job-скрипты для realignment.
3) Добавь диагностику и gate evidence по sql/README.md.
4) Обнови AGENT_EXECUTION_LOG.md.
5) Прогони tests + pnpm run ci.
```

## Stage 4 - AUDIT

```text
Проведи аудит Stage 4.

Проверь:
1) После realignment loser integrator_user_id отсутствует в целевых таблицах.
2) Нет регрессии для ingestion потоков (reminders/support/subscriptions).
3) SQL gates воспроизводимы.
4) CI evidence есть.

Сохрани отчет:
docs/PLATFORM_USER_MERGE_V2/AUDIT_STAGE_4.md

Добавь MANDATORY FIX INSTRUCTIONS.
```

## Stage 4 - FIX

```text
Исправь замечания из:
docs/PLATFORM_USER_MERGE_V2/AUDIT_STAGE_4.md

Только Stage 4 scope.
Обнови AGENT_EXECUTION_LOG.md.
Повтори tests + pnpm run ci.
```

---

## Stage 5 - EXEC (feature flag + flow switch / Deploy 4)

```text
Выполни Stage 5 по документу:
docs/PLATFORM_USER_MERGE_V2/STAGE_5_FEATURE_FLAG_AND_FLOW_SWITCH.md

Сделай:
1) Добавь ключ feature flag в system_settings ALLOWED_KEYS.
2) Обнови flow: сначала integrator merge, затем webapp merge.
3) Введи conditional blocker (off -> v1 behavior; on -> v2 path).
4) Обнови API docs (apps/webapp/src/app/api/api.md) и stage docs при необходимости.
5) Обнови AGENT_EXECUTION_LOG.md.
6) Прогони tests + pnpm run ci.
```

## Stage 5 - AUDIT

```text
Проведи аудит Stage 5.

Проверь:
1) Флаг в system_settings реально управляет поведением.
2) При flag=off поведение полностью как v1.
3) При flag=on сценарий двух non-null integrator_user_id проходит через integrator merge.
4) Нет новых env vars для этого флага.
5) CI evidence есть.

Сохрани отчет:
docs/PLATFORM_USER_MERGE_V2/AUDIT_STAGE_5.md

Добавь MANDATORY FIX INSTRUCTIONS.
```

## Stage 5 - FIX

```text
Исправь замечания из:
docs/PLATFORM_USER_MERGE_V2/AUDIT_STAGE_5.md

Только Stage 5 scope.
Обнови AGENT_EXECUTION_LOG.md.
Повтори tests + pnpm run ci.
```

---

## Stage C - EXEC (closeout)

```text
Выполни Stage C по документу:
docs/PLATFORM_USER_MERGE_V2/STAGE_C_CLOSEOUT.md

Сделай:
1) Полный regression pass: pnpm run ci + targeted e2e/scenario checks.
2) Обнови архитектурные docs и execution log.
3) Подготовь closure report: снятые риски, остатки вне scope.
```

## Stage C - AUDIT

```text
Проведи аудит Stage C.

Проверь:
1) Все readiness gates из MASTER_PLAN закрыты.
2) Доки синхронизированы (README, ARCHITECTURE, runbook, stage docs).
3) Closure report полный и проверяемый.

Сохрани:
docs/PLATFORM_USER_MERGE_V2/AUDIT_STAGE_C.md

Добавь MANDATORY FIX INSTRUCTIONS.
```

## Stage C - FIX

```text
Исправь замечания из:
docs/PLATFORM_USER_MERGE_V2/AUDIT_STAGE_C.md

Обнови AGENT_EXECUTION_LOG.md.
```

---

## PRE-DEPLOY AUDIT (перед каждым Deploy N)

```text
Проведи pre-deploy аудит для Deploy <N> (N=1..4).

Документы:
- docs/PLATFORM_USER_MERGE_V2/CHECKLISTS.md
- docs/PLATFORM_USER_MERGE_V2/CUTOVER_RUNBOOK.md
- docs/PLATFORM_USER_MERGE_V2/STAGE_<...>.md по текущему деплою

Проверь:
1) Scope PR соответствует только текущему deploy slice.
2) Миграции лежат в правильных папках.
3) Rollback-путь описан.
4) SQL gates подготовлены.
5) Нет нарушений server conventions.
6) pnpm run ci green.

Сохрани:
docs/PLATFORM_USER_MERGE_V2/AUDIT_PRE_DEPLOY_<N>.md

Добавь MANDATORY FIX INSTRUCTIONS.
```

## PRE-DEPLOY FIX

```text
Исправь замечания из:
docs/PLATFORM_USER_MERGE_V2/AUDIT_PRE_DEPLOY_<N>.md

После фиксов:
1) Обнови AGENT_EXECUTION_LOG.md.
2) Повтори проверки и pnpm run ci.
3) Подтверди readiness к деплою.
```

---

## FINAL AUDIT (ветка или audited working tree перед merge/закрытием)

```text
Проведи финальный сквозной аудит инициативы Platform User Merge v2.

Вход:
- docs/PLATFORM_USER_MERGE_V2/MASTER_PLAN.md
- docs/PLATFORM_USER_MERGE_V2/CHECKLISTS.md
- docs/PLATFORM_USER_MERGE_V2/CUTOVER_RUNBOOK.md
- docs/PLATFORM_USER_MERGE_V2/AGENT_EXECUTION_LOG.md
- все AUDIT_STAGE_*.md и AUDIT_PRE_DEPLOY_*.md
- git diff main...HEAD
- git status --short --branch

Важно:
- если `git diff main...HEAD` непустой, аудируй инициативу как branch diff;
- если `git diff main...HEAD` пустой, но дерево грязное, аудируй **текущее audited working tree** и явно зафиксируй это в отчёте;
- не считать пустой `main...HEAD` автоматическим fail, если evidence честно привязан к текущему дереву и все входные артефакты присутствуют.

Проверь:
1) Реализованы Stage A, 1, 2, 3, 4, 5, C.
2) Нет gap между docs и кодом.
3) Readiness gates реально закрыты.
4) Feature flag и rollback подтверждены.
5) CI и targeted checks подтверждены.

Сохрани:
docs/PLATFORM_USER_MERGE_V2/AUDIT_FINAL.md

Добавь MANDATORY FIX INSTRUCTIONS.
```

## FINAL FIX

```text
Исправь все critical/major из:
docs/PLATFORM_USER_MERGE_V2/AUDIT_FINAL.md

После фиксов:
1) Обнови AGENT_EXECUTION_LOG.md.
2) Прогони финальный набор проверок + pnpm run ci.
3) Добавь финальный summary: changed files, tests, gate verdict.
```
