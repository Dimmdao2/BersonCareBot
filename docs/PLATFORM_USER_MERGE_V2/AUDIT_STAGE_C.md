# Audit — Stage C (initiative closeout)

**Дата аудита (текущий прогон):** 2026-04-10  
**Предыдущий цикл:** первичный аудит → follow-up Stage C closeout — см. [§6](#6-история-аудита).

**Источник требований:** [`STAGE_C_CLOSEOUT.md`](STAGE_C_CLOSEOUT.md), [`MASTER_PLAN.md`](MASTER_PLAN.md), [`PROMPTS_EXEC_AUDIT_FIX.md`](PROMPTS_EXEC_AUDIT_FIX.md)

**Метод:** сверка документов в репозитории + независимая верификация **`pnpm run ci`** и счётчиков vitest на дереве на дату аудита.

---

## 1) Readiness gates из `MASTER_PLAN` — закрыты

В [`MASTER_PLAN.md`](MASTER_PLAN.md) (раздел **Readiness gates**, строки с `[x]`):

| # | Gate (смысл) | Факт в репо | Вердикт |
|---|----------------|-------------|---------|
| 1 | Нет loser `integrator_user_id` в webapp projection по [`sql/README.md`](sql/README.md) | Реализация + job/SQL + [`AUDIT_STAGE_4.md`](AUDIT_STAGE_4.md); **per-merge** на production — шаблон и обязанность оператора в [`STAGE_C_CLOSEOUT.md`](STAGE_C_CLOSEOUT.md) §4 | **PASS** (репозиторий + задокументированная операторская проверка) |
| 2 | `projection_outbox`: `idempotency_key`, pending без «ломающих» loser-only ключей | Код merge + [`AUDIT_STAGE_3.md`](AUDIT_STAGE_3.md), `projection-health.mjs`; **per-merge** на production — SQL в `STAGE_C_CLOSEOUT` §4 | **PASS** |
| 3 | E2e два integrator id → merge → канон в webapp | Репозиторно: stub-flow + route/API тесты (см. `STAGE_C_CLOSEOUT`, [`AUDIT_STAGE_5.md`](AUDIT_STAGE_5.md)); полный UI/две БД — опционально (MANDATORY §5 в Stage 5 audit) | **PASS** по принятому контракту closeout |
| 4 | `pnpm run ci` + targeted ingestion/merge/purge | Зафиксировано в `STAGE_C_CLOSEOUT` + подтверждено повторным прогоном ниже | **PASS** |

**Итог §1:** все четыре gate **закрыты** в смысле, зафиксированном в `MASTER_PLAN` и `STAGE_C_CLOSEOUT` (явное разделение **репозиторного** evidence и **операторского** вывода SQL на production после каждой реальной пары merge).

---

## 2) Синхронизация документации (README, ARCHITECTURE, runbook, stage docs)

| Документ | Проверка | Вердикт |
|----------|----------|---------|
| [`docs/README.md`](../README.md) | Инициатива v2: `MASTER_PLAN`, `AGENT_EXECUTION_LOG`, `CUTOVER_RUNBOOK`, `STAGE_C_CLOSEOUT`, `AUDIT_STAGE_C` | **PASS** |
| [`README.md`](README.md) (пакет v2) | Оглавление: stages, `STAGE_C_CLOSEOUT`, `AUDIT_STAGE_C`, runbook, sql | **PASS** |
| [`../ARCHITECTURE/PLATFORM_USER_MERGE.md`](../ARCHITECTURE/PLATFORM_USER_MERGE.md) | Статус v2, ссылки на closeout/runbook/sql, § ограничений v1/v2 | **PASS** |
| [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md) | psql-префикс `source` env, health, Deploy 3/4, rollback | **PASS** |
| [`STAGE_C_CLOSEOUT.md`](STAGE_C_CLOSEOUT.md) | Чек-листы `[x]`, closure report | **PASS** |
| [`MASTER_PLAN.md`](MASTER_PLAN.md) | Gates `[x]`, блок **Статус инициативы (Stage C)** | **PASS** |
| [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md) | Запись «Stage C: закрытие инициативы v2» | **PASS** |

**Итог §2:** **PASS** (замечание про отсутствие прямых ссылок на closeout/audit в `docs/README.md` **устранено** — см. [§6](#6-история-аудита), MANDATORY §3).

---

## 3) Closure report: полный и проверяемый

В [`STAGE_C_CLOSEOUT.md`](STAGE_C_CLOSEOUT.md) присутствует:

- **Регрессия:** команды, **exit 0**, числа тестов (integrator/webapp), targeted списки файлов.
- **Отчёт о закрытии:** таблица снятых рисков с отсылками к аудитам/коду; список вне scope; operational notes (ключ `platform_user_merge_v2_enabled`, rollback, runbook, роль on-call без ПДн).
- **Production:** §4 — воспроизводимые блоки `psql` с обязательным `source` из [`SERVER CONVENTIONS`](../ARCHITECTURE/SERVER%20CONVENTIONS.md); явно указано, что вывод **не** из репозиторного прогона, а приложает оператор.

**Итог §3:** **PASS** — отчёт полный для контракта «repo closeout + операторский gate на каждый merge».

---

## 4) Независимая CI-evidence (дата аудита)

```bash
pnpm run ci
```

**Результат (2026-04-10):** **exit 0** (lint, typecheck, integrator + webapp tests, build, `pnpm audit --prod`).

**Счётчики vitest (тот же день, полные suite):**

- integrator: **649** passed (6 skipped)
- webapp: **1410** passed (5 skipped)

Совпадает с цифрами в [`STAGE_C_CLOSEOUT.md`](STAGE_C_CLOSEOUT.md) § регрессии — дрейфа нет.

---

## 5) Сводный verdict

| Критерий запроса аудита | Статус |
|-------------------------|--------|
| 1) Все readiness gates из `MASTER_PLAN` закрыты | **PASS** |
| 2) Доки синхронизированы (README, ARCHITECTURE, runbook, stage docs) | **PASS** |
| 3) Closure report полный и проверяемый | **PASS** |

**Общий verdict Stage C:** **PASS** — инициатива v2 закрыта в репозитории; операционная проверка данных на production остаётся по `STAGE_C_CLOSEOUT` §4 и `CUTOVER_RUNBOOK`.

---

## 6) История аудита

| Дата | Событие |
|------|---------|
| 2026-04-10 | Первичный аудит: REWORK_REQUIRED (нет closeout evidence) |
| 2026-04-10 | Выполнение Stage C: `STAGE_C_CLOSEOUT`, `MASTER_PLAN`, follow-up `AUDIT_STAGE_C` |
| 2026-04-10 | Текущий прогон: подтверждение трёх критериев + повторный `pnpm run ci` |
| 2026-04-10 | Follow-up: [`docs/README.md`](../README.md) — добавлены ссылки на `STAGE_C_CLOSEOUT.md`, `AUDIT_STAGE_C.md` (закрытие MANDATORY §3) |

---

## MANDATORY FIX INSTRUCTIONS

Обязательные действия при триггере; формат: **severity**, **files**, **критерий done**.

### MANDATORY FIX §1 — Production merge без gate-evidence

- **severity:** **critical** (операционный)
- **Триггер:** выполнен ручной merge пары с двумя разными non-null `integrator_user_id` на production, в тикете **нет** вывода `diagnostics_webapp_integrator_user_id.sql` и сводки outbox.
- **files:** тикет / runbook — [`STAGE_C_CLOSEOUT.md`](STAGE_C_CLOSEOUT.md) §4, [`sql/README.md`](sql/README.md), [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md)
- **Действия:** выполнить SQL из §4 с корректными `LOSER_ID`/`winner`/`loser` из факта merge; при `cnt > 0` — realignment по Stage 4 + повтор gate.
- **Критерий done:** в тикете сохранён вывод psql (все `cnt = 0` для loser) + сводка `projection_outbox` по статусам.

### MANDATORY FIX §2 — Регрессия после PR в merge/outbox/ingestion

- **severity:** **major**
- **Триггер:** изменены `mergeIntegratorUsers`, `projectionOutboxMergePolicy`, `platformUserMergePreview`, `manualMergeIntegratorGate`, M2M integrator routes, gate SQL builder.
- **files:** соответствующие тесты; [`STAGE_C_CLOSEOUT.md`](STAGE_C_CLOSEOUT.md); при необходимости [`AUDIT_STAGE_3.md`](AUDIT_STAGE_3.md) / [`AUDIT_STAGE_4.md`](AUDIT_STAGE_4.md) / [`AUDIT_STAGE_5.md`](AUDIT_STAGE_5.md)
- **Действия:** `pnpm run ci`; обновить в `STAGE_C_CLOSEOUT` числа тестов и список targeted файлов, если менялся набор.
- **Критерий done:** `pnpm run ci` зелёный; документы Stage C согласованы с фактом.

### MANDATORY FIX §3 — Оглавление `docs/README.md` (ссылки на closeout / audit)

- **severity:** **minor**
- **Статус:** **выполнено** (2026-04-10) — в строке про Platform User Merge v2 добавлены `PLATFORM_USER_MERGE_V2/STAGE_C_CLOSEOUT.md` и `PLATFORM_USER_MERGE_V2/AUDIT_STAGE_C.md`.
- **files:** [`docs/README.md`](../README.md)
- **Критерий done (для будущих регрессий):** при изменении путей к пакету v2 строка в `docs/README.md` по-прежнему содержит master plan, журнал, runbook, closeout и audit.

### MANDATORY FIX §4 — Полный UI e2e на двух БД (усиление)

- **severity:** **minor** (не блокер текущего PASS)
- **Триггер:** появился стабильный staging с двумя PostgreSQL; крупный рефакторинг M2M.
- **files:** CI config, тесты; см. [`AUDIT_STAGE_5.md`](AUDIT_STAGE_5.md) MANDATORY §5
- **Критерий done:** отдельный job или ручной сценарий задокументирован; `pnpm run ci` зелёный.

---

## Связанные документы

- [`STAGE_C_CLOSEOUT.md`](STAGE_C_CLOSEOUT.md)
- [`MASTER_PLAN.md`](MASTER_PLAN.md)
- [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md)
- [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md)
- [`../ARCHITECTURE/PLATFORM_USER_MERGE.md`](../ARCHITECTURE/PLATFORM_USER_MERGE.md)
