# Этап B — `1.1a` Деталь программы (`[instanceId]`)

← Индекс: [`STAGE_PLAN.md`](STAGE_PLAN.md) · канон: [`../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md`](../../../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md) §3 (п. **1.1a**).

**Место в цепочке:** после **A**; не начинать, пока не закрыт [`STAGE_A.md`](STAGE_A.md) по DoD.

**Цель.** Рабочий экран: текущий этап, этап 0 отдельно, архив этапов, без «чек-листа на сегодня» в MVP, «План обновлён», дата контроля от `started_at`.

## Gate перед началом (обязательно)

- [x] Прочитаны rules из [`STAGE_PLAN.md`](STAGE_PLAN.md) (блок «Жесткий gate перед любым исполнением»).
- [x] В [`LOG.md`](LOG.md) добавлена запись `read-rules + scope` до UI-правок.
- [x] Подтверждено, что `A` закрыт по DoD (иначе `B` не стартует).

## Scope этого этапа

**Разрешено менять:**

- `apps/webapp/src/app/app/patient/treatment-programs/[instanceId]/page.tsx`
- `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx`
- при необходимости `apps/webapp/src/modules/treatment-program/stage-semantics.ts`
- локальные UI-компоненты/типы рядом с detail-страницей

**Явно вне scope:**

- migration/data-layer (`started_at`) кроме чтения уже готового поля.
- список `/treatment-programs` (этап `C`).
- процентные метрики прогресса, новый комментарий к факту выполнения.

## Подробный чек-лист реализации

### 1) Структура detail-экрана

- [x] Верхний блок: название программы + номер/название текущего этапа.
- [x] Есть CTA «Открыть текущий этап» и ссылка «Архив этапов».
- [x] Этап `sort_order=0` показан отдельным блоком «Общие рекомендации».

### 2) Рабочая часть и архив

- [x] Текущий этап показан как основной рабочий блок.
- [x] Архив `completed`/`skipped` этапов вынесен под `<details>` и по умолчанию закрыт.
- [x] Блок «Чек-лист на сегодня» на detail-странице удален/скрыт.

### 3) Сигналы и дата контроля

- [x] Показан сигнал «План обновлён» (тот же смысл, что на Today).
- [x] Дата ожидаемого контроля считается только при `started_at != null` и `expected_duration_days != null`.
- [x] Дата считается от `started_at` этапа, а не от старта всей программы.

### 4) UI-инварианты

- [x] Нет процентов `за сегодня`/`% этапа`/`% программы`.
- [x] Использованы patient primitives + shadcn base; нет одноразового custom chrome.

## Локальные проверки

```bash
rg "Чек-лист на сегодня|План обновлён|expected_duration_days|started_at" apps/webapp/src/app/app/patient/treatment-programs
pnpm --dir apps/webapp lint --max-warnings=0 -- src/app/app/patient/treatment-programs
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs
```

## DoD этапа B

- Соответствует `ROADMAP_2` §1.1a DoD.
- Нет процентной аналитики на detail в MVP.
- В [`LOG.md`](LOG.md) отражены: `read-rules`, scope, проверки, ограничения.

**Предыдущий шаг:** [`STAGE_A.md`](STAGE_A.md) · **следующий:** [`STAGE_C.md`](STAGE_C.md).
