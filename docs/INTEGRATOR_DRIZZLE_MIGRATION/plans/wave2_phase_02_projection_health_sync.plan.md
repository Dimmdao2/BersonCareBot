---
name: Wave2 Phase02 Projection health sync
overview: Устранить расхождение между projectionHealth.ts и scripts/projection-health.mjs; опционально перевести агрегаты на Drizzle после единого источника истины.
status: pending
isProject: false
todos:
  - id: p02-single-source
    content: "Вынести общие SQL/агрегаты projection_outbox в один модуль (например apps/integrator/src/infra/db/repos/projectionHealthCore.ts), использовать из projectionHealth.ts и из CLI (через import TS или subprocess — выбрать минимально рискованный вариант)."
    status: pending
  - id: p02-cli-align
    content: "Обновить apps/integrator/scripts/projection-health.mjs так, чтобы цифры совпадали с библиотечной функцией; задокументировать запуск в LOG."
    status: pending
  - id: p02-optional-drizzle
    content: "Опционально: заменить сырой SQL в core на Drizzle select+groupBy; сохранить те же поля snapshot для webapp proxy / admin health."
    status: pending
  - id: p02-verify
    content: "Сравнение вывода CLI и GET integrator /health/projection (ручной или скриптовый smoke); integrator test/typecheck."
    status: pending
---

# Wave 2 — этап 2: projection health + CLI

## Размер

**S** (основной риск — расхождение метрик, не данные пациентов).

## Definition of Done

- [ ] Один канон расчёта метрик `projection_outbox`; CLI и HTTP health дают согласованные числа на одной БД.
- [ ] В LOG зафиксирован способ запуска CLI и известные ограничения (unified DB vs legacy).

## Scope

**Разрешено:** `apps/integrator/src/infra/db/repos/projectionHealth.ts`, `apps/integrator/scripts/projection-health.mjs`, вынесенный общий модуль.

**Вне scope:** изменение семантики outbox delivery worker, webapp UI.

## Примечание

Перенос агрегатов на чистый Drizzle builder — **после** пункта «единый источник», иначе двойная работа.
