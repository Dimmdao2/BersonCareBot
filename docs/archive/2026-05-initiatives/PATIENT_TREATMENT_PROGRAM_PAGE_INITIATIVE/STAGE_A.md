# STAGE_A — §1.0 started_at data enabler

## Цель

Верификация и финальный аудит data-enabler `started_at` для этапов программы лечения.

> **Статус по состоянию на 2026-05-05:** реализация уже в кодовой базе — см. «Pre-flight» ниже. Этап A — это верификация, не с нуля написание кода.

## Модель агента

- Основная: `gpt-5.3-codex`.
- Режим: проверка + аудит существующего кода, патчинг только при выявленных пробелах.

## Pre-flight: что уже сделано

| Артефакт | Статус | Путь |
|----------|--------|------|
| Drizzle schema | ✅ | `apps/webapp/db/schema/treatmentProgramInstances.ts` — поле `startedAt` (l. 81) |
| Миграция с backfill | ✅ | `apps/webapp/db/drizzle-migrations/0043_treatment_program_instance_stage_started_at.sql` |
| pg repo | ✅ | `pgTreatmentProgramInstance.ts` — map + idempotent patch при `in_progress` |
| inMemory repo | ✅ | `inMemoryTreatmentProgramInstance.ts` — аналогичная логика |
| Доменный тип | ✅ | `types.ts` — `startedAt: string \| null` в `TreatmentProgramInstanceStageRow` |
| Contract test | ✅ | `pgTreatmentProgramInstance.startedAt.contract.test.ts` |
| `progress-service.ts` | не нужен | логика `startedAt` живёт на уровне repo-patch, не в сервисе |

## Scope (разрешено только при выявленных пробелах)

- `apps/webapp/db/schema/treatmentProgramInstances.ts`
- `apps/webapp/db/drizzle-migrations/0043_*.sql`
- `apps/webapp/src/modules/treatment-program/types.ts`
- `apps/webapp/src/modules/treatment-program/ports.ts` (если read-модель требует добавления поля)
- `apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts`
- `apps/webapp/src/infra/repos/inMemoryTreatmentProgramInstance.ts`
- `apps/webapp/src/infra/repos/pgTreatmentProgramInstance.startedAt.contract.test.ts`

## Out of scope (запрещено)

- `progress-service.ts` — не трогать.
- Любые UI-правки страниц пациента.
- Любые новые сущности контроля/расписания.
- Любые изменения закрытого ядра помимо `startedAt`.

## Подэтапы (декомпозиция)

| Шаг | Что сделать | Критерий готовности |
|-----|-------------|---------------------|
| A1 | Прочитать `pgTreatmentProgramInstance.ts`, `inMemoryTreatmentProgramInstance.ts`, `types.ts` и убедиться, что `startedAt` везде присутствует и консистентен | Поле есть во всех трёх, логика idempotent |
| A2 | Проверить миграцию `0043`: additive, backfill ограничен `status = 'in_progress'` | Миграция безопасна и не затирает уже установленные значения |
| A3 | Выявить и закрыть пробелы, если нашлись (read-модели, маппинги, edge cases) | Пробелов нет или они задокументированы + закрыты |
| A4 | Прогнать целевые проверки | Зелёные lint / typecheck / contract test |
| A5 | Обновить `LOG.md` | Записано: pre-flight результат, найденные пробелы (если есть), статус `Stage A closed` |

## Проверки

```bash
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp lint --max-warnings=0 -- src/modules/treatment-program src/infra/repos db/schema
pnpm --dir apps/webapp exec vitest run src/infra/repos/pgTreatmentProgramInstance.startedAt.contract.test.ts src/modules/treatment-program
```

## Коммит-гейт этапа

- После `EXEC -> AUDIT -> FIX` этапа A: **только commit**, без `pnpm run ci`.
- Формулировка в логе: `Stage A closed`.
