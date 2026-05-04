# Этап A — `1.0` Data enabler: `started_at`

← Индекс: [`STAGE_PLAN.md`](STAGE_PLAN.md) · канон порядка и критериев: [`../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md`](../../../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md) §3 (п. **1.0**).

**Место в цепочке:** первый шаг **A → B → C**; предпосылок нет.

**Цель.** Колонка `started_at` на `treatment_program_instance_stages`: заполнение при первом `in_progress`, backfill для существующих данных, типы и репозитории.

## Gate перед началом (обязательно)

- [x] Прочитаны rules из [`STAGE_PLAN.md`](STAGE_PLAN.md) (блок «Жесткий gate перед любым исполнением»).
- [x] В [`LOG.md`](LOG.md) добавлена запись `read-rules + scope` до правок кода.
- [x] Подтверждено, что этап `B`/`C` не стартует раньше закрытия `A`.

## Scope этого этапа

**Разрешено менять:**

- `apps/webapp/db/schema/treatmentProgramInstances.ts`
- `apps/webapp/src/modules/treatment-program/types.ts`
- `apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts`
- `apps/webapp/src/infra/repos/inMemoryTreatmentProgramInstance.ts`
- `apps/webapp/src/modules/treatment-program/progress-service.ts`
- tests для treatment-program instance/progress

**Явно вне scope:**

- UI detail/list (`/treatment-programs`, `[instanceId]`) — это этапы `B` и `C`.
- Новые сущности контролей и multi-control логика (post-MVP).
- Любые несвязанные рефакторы в соседних модулях.

## Подробный чек-лист реализации

### 1) Схема + миграция

- [x] Добавить `started_at` (`timestamptz`, nullable) в Drizzle schema.
- [x] Сгенерировать миграцию.
- [x] Добавить/описать backfill-эвристику для активных этапов от `instance.created_at`.
- [x] Зафиксировать выбранную эвристику и ограничения в [`LOG.md`](LOG.md).

### 2) Типы + репозитории

- [x] Протащить `started_at` в `TreatmentProgramInstanceStageRow`.
- [x] Обновить `pg` репозиторий (read/write mapping).
- [x] Обновить `inMemory` репозиторий (симметрия контракта).
- [x] Проверить, что detail read-модель видит `started_at`.

### 3) Бизнес-логика перехода статуса

- [x] В точке `available -> in_progress` выставлять `started_at`, только если поле `NULL`.
- [x] Повторный перевод/повторные операции не перетирают уже выставленный `started_at`.

### 4) Тесты

- [x] Unit test: автоматическая установка `started_at` на первом старте этапа.
- [x] Unit test: повторный переход не меняет уже заполненный `started_at`.
- [x] Интеграционный/репозиторный тест: чтение `started_at` в detail/row (минимум — контракт PG-репо [`pgTreatmentProgramInstance.startedAt.contract.test.ts`](../../../apps/webapp/src/infra/repos/pgTreatmentProgramInstance.startedAt.contract.test.ts); live PG — см. [`AUDIT_STAGE_A.md`](AUDIT_STAGE_A.md) FIX closure / defer).

## Локальные проверки

```bash
rg "started_at|startedAt" apps/webapp/db/schema/treatmentProgramInstances.ts apps/webapp/src/modules/treatment-program apps/webapp/src/infra/repos
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/progress-service.test.ts src/infra/repos/pgTreatmentProgramInstance.startedAt.contract.test.ts
```

Если появились дополнительные тестовые файлы по этапу, прогнать их точечно и зафиксировать в [`LOG.md`](LOG.md).

## DoD этапа A

- Поле читается в `TreatmentProgramInstanceDetail` / stage row.
- Новые переходы в `in_progress` получают `started_at`.
- Старые строки не оставляют `NULL` там, где эвристика применима (или явно задокументировано исключение в [`LOG.md`](LOG.md)).
- В [`LOG.md`](LOG.md) отражены: `read-rules`, scope, проверки, ограничения.

**Следующий шаг:** [`STAGE_B.md`](STAGE_B.md).
