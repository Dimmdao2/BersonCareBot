# STAGE_B — §1.1a detail MVP

## Цель

Собрать рабочую detail-страницу программы `/treatment-programs/[instanceId]` в MVP-формате из `ROADMAP_2` §1.1a.

## Модель агента

- Основная: `claude-4.6-sonnet-medium-thinking`.
- Допустимо: `composer-2` при строгом соблюдении scope и без изменений портов/контрактов.

## Предусловие

- Stage A закрыт и закоммичен.

## Существующие файлы в scope

| Файл | Тип |
|------|-----|
| `apps/webapp/src/app/app/patient/treatment-programs/[instanceId]/page.tsx` | RSC, основной loader |
| `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx` | client-компонент, основной UI |
| `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx` | тесты — **должны оставаться зелёными** |
| `apps/webapp/src/app/app/patient/treatment-programs/[instanceId]/page.nudgeResilience.test.tsx` | тест SSR resilience (nudge на detail) — **должен оставаться зелёным** |
| `apps/webapp/src/app/app/patient/treatment-programs/[instanceId]/page.templateDescription.test.tsx` | RSC: `getTemplate` + описание — **должен оставаться зелёным** |
| `apps/webapp/src/modules/treatment-program/stage-semantics.ts` | точечные правки только при необходимости отбора текущего/архивного этапов |

## Out of scope (запрещено)

- Любые миграции или изменения портовых контрактов.
- Процентные метрики прогресса.
- Новый маршрут `stages/[stageId]` (это этап C).
- Изменение существующих тестов под другое поведение без явного продуктового обоснования.

## Подэтапы (декомпозиция)

| Шаг | Что сделать | Критерий готовности |
|-----|-------------|---------------------|
| B1 | Верхний блок detail: название программы, текущий этап, CTA «Открыть текущий этап», ссылка «Архив этапов» | Блок рендерится без ошибок SSR; CTA ведёт на нужный раздел страницы |
| B2 | Этап 0 (`sort_order = 0`) отдельным блоком «Общие рекомендации» | Stage 0 визуально и логически отделён от текущего этапа прохождения |
| B3 | Текущий этап: единый список назначений (exercise / lfk_complex / recommendation / test_set / lesson) | Пациент видит «что делать сейчас» полным списком |
| B4 | Завершённые/пропущенные этапы под `<details>`, закрыт по умолчанию | Архив скрыт; открывается без ошибок |
| B5 | Убрать «Чек-лист на сегодня» с detail | Чек-лист отсутствует на detail |
| B6 | «План обновлён» — отдельный сигнал (не метрика прогресса); дата контроля от `started_at + expected_duration_days` | Блок показывается только при наличии обоих значений |
| B7 | Прогнать целевые проверки, в т.ч. существующие тесты | Зелёные lint / typecheck / tests (включая `.test.tsx` и `.nudgeResilience.test.tsx`) |
| B8 | Обновить `LOG.md` | Записаны scope, проверки, что не делали |

## Проверки

```bash
pnpm --dir apps/webapp lint --max-warnings=0 -- src/app/app/patient/treatment-programs
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs
```

## Коммит-гейт этапа

- После `EXEC -> AUDIT -> FIX` этапа B: **только commit**, без полного `ci`.
- Формулировка в логе: `Stage B closed`.
