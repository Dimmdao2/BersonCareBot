---
name: Wave2 Phase02 Projection health sync
overview: Устранить расхождение между projectionHealth.ts и scripts/projection-health.mjs; Drizzle builder для агрегатов вынесен из DoD этапа.
status: pending
isProject: false
todos:
  - id: p02-single-source
    content: "Вынести общие SQL/агрегаты projection_outbox в один runtime-канон (например apps/integrator/src/infra/db/repos/projectionHealthCore.ts), использовать из projectionHealth.ts и CLI; не оставлять второй SQL-клон в scripts/projection-health.mjs."
    status: pending
  - id: p02-cli-align
    content: "Обновить CLI так, чтобы цифры совпадали с библиотечной функцией: предпочтительно перенести исполняемый CLI в src/infra/scripts/projection-health.ts и запускать host через dist; scripts/projection-health.mjs оставить thin compatibility wrapper, если нужен старый npm script."
    status: pending
  - id: p02-drizzle-deferred
    content: "Drizzle builder для агрегатов projectionHealth не входит в этап 2: перенос cancelled до отдельного follow-up после выравнивания CLI/HTTP цифр."
    status: cancelled
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

**Решение:** этап 2 закрывается по единому источнику метрик и совпадению CLI/HTTP. Переписывание агрегатов на чистый Drizzle builder не требуется для DoD и не должно задерживать этап.

## Примечание

`apps/integrator/package.json` сейчас запускает `projection-health` как `node scripts/projection-health.mjs`. Этап меняет это на compiled/runtime CLI: source в `src/infra/scripts/projection-health.ts`, npm script на dev/runtime запуск, `.mjs` — совместимый wrapper без собственной SQL-логики.

## Декомпозиция исполнения

### 1. Baseline текущих метрик

- [ ] Прочитать поля ответа `projectionHealth.ts` и вывода `scripts/projection-health.mjs`; составить список метрик и имён полей.
- [ ] Зафиксировать в LOG baseline: какие поля должны совпадать между HTTP и CLI.
- [ ] Не менять пороги release-gate и интерпретацию статусов на этом шаге.

### 2. Общий runtime core

- [ ] Вынести расчёт в один модуль, который принимает DB/session dependency и возвращает typed snapshot.
- [ ] Оставить SQL внутри core параметризованным; не дублировать SQL в route/repo и CLI.
- [ ] Сохранить поля, которые потребляют `/health/projection`, webapp proxy и admin health.

### 3. HTTP path

- [ ] `projectionHealth.ts` должен стать тонкой обёрткой над core.
- [ ] Сохранить обработку ошибок и форму degraded/error ответа.
- [ ] Тесты: snapshot shape, counts by status, oldest pending, retries distribution, last success.

### 4. CLI path

- [ ] Перенести CLI в `src/infra/scripts/projection-health.ts`, который импортирует core.
- [ ] Обновить `package.json` script так, чтобы dev запускал TS через `tsx`; host/runbook в LOG указывает compiled `dist` после build.
- [ ] `scripts/projection-health.mjs` оставить только как compatibility wrapper, который делегирует в compiled module и не содержит SQL.
- [ ] CLI должен возвращать тот же exit-code contract, что раньше.

### 5. Сравнение и закрытие

- [ ] На одной БД сравнить CLI output и `GET /health/projection` по всем baseline полям.
- [ ] `pnpm --dir apps/integrator run typecheck`
- [ ] `pnpm --dir apps/integrator run test`
- [ ] LOG: команда запуска CLI, что осталось на raw SQL, почему builder отложен.

## Решения по сложным местам

- `.mjs` CLI не импортирует TS напрямую; рабочий код живёт в `src/infra/scripts/projection-health.ts`, wrapper остаётся только для совместимости старой команды.
- Builder-перенос агрегатов отменён в этом этапе; сырой SQL внутри единого core допустим, если CLI/HTTP используют один код.
- Названия полей, severity и exit-code contract сохраняются. Любое изменение release-gate semantics — отдельный план.

## Stop conditions

- Если compiled CLI требует нового packaging/build контракта, остановиться и обновить deploy/runbook до кода.
- Если сравнение CLI/HTTP показывает разные цифры на одной БД, не закрывать этап даже при зелёных тестах.
