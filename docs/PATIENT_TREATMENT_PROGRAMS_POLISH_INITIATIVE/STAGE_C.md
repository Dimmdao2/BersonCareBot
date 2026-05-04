# Этап C — `1.1` Список программ (`/treatment-programs`)

← Индекс: [`STAGE_PLAN.md`](STAGE_PLAN.md) · канон: [`../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md`](../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md) §3 (п. **1.1**).

**Место в цепочке:** после **B**; не начинать, пока не закрыт [`STAGE_B.md`](STAGE_B.md) по DoD.

**Цель.** Hero активной программы + архив завершённых + empty state; без процентов прогресса.

## Gate перед началом (обязательно)

- [x] Прочитаны rules из [`STAGE_PLAN.md`](STAGE_PLAN.md) (блок «Жесткий gate перед любым исполнением»).
- [x] В [`LOG.md`](LOG.md) добавлена запись `read-rules + scope` до правок.
- [x] Подтверждено, что `B` закрыт по DoD (иначе `C` не стартует).

## Scope этого этапа

**Разрешено менять:**

- `apps/webapp/src/app/app/patient/treatment-programs/page.tsx`
- `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramsListClient.tsx` (или актуальный list-компонент)
- локальные UI-компоненты списка в папке `treatment-programs`

**Явно вне scope:**

- Деталь `[instanceId]` (этап `B`), кроме безопасных синхронных мелочей без изменения UX-контракта.
- Data layer/migrations (`started_at`) — это этап `A`.
- Любая процентная аналитика прогресса.

## Подробный чек-лист реализации

### 1) Hero активной программы

- [x] Loader получает активный instance + `current_stage_title`.
- [x] Hero рендерит название программы, текущий этап, CTA в detail.
- [x] Показан nudge/бейдж «План обновлён» при наличии сигнала.

### 2) Архив и empty state

- [x] Завершённые программы находятся в `<details>` «Завершённые программы» (как в ROADMAP §1.1).
- [x] Архив скрыт по умолчанию.
- [x] При отсутствии активной программы — empty state «программа появится после назначения» + ссылка на `/messages`.

### 3) UI-инварианты

- [x] На странице списка нет процентов прогресса.
- [x] Используются `patientVisual`/shadcn primitives; home-only геометрия не переносится.

## Локальные проверки

```bash
rg "Завершённые программы|Завершенные программы|План обновлён|% этапа|% программы|% за день" apps/webapp/src/app/app/patient/treatment-programs
pnpm --dir apps/webapp lint --max-warnings=0 -- src/app/app/patient/treatment-programs
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs
```

## DoD этапа C

- Соответствует `ROADMAP_2` §1.1 DoD.
- В [`LOG.md`](LOG.md) отражены: `read-rules`, scope, проверки, ограничения.

**Предыдущий шаг:** [`STAGE_B.md`](STAGE_B.md).
