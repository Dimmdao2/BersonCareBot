# STAGE_D — §1.1 list page polish

## Цель

Довести страницу списка `/treatment-programs` до MVP-структуры из `ROADMAP_2` §1.1.

## Модель агента

- Основная: `claude-4.6-sonnet-medium-thinking`.
- Допустимо: `composer-2` для узкого S-прохода без архитектурных изменений.

## Предусловие

- Stage C закрыт и закоммичен.

## Существующие файлы в scope

| Файл | Статус |
|------|--------|
| `apps/webapp/src/app/app/patient/treatment-programs/page.tsx` | существующий — loader и RSC-шелл |
| `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramsListClient.tsx` | существующий — клиентский компонент списка |
| `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramsListClient.test.tsx` | существующий — **должен оставаться зелёным** |
| `apps/webapp/src/app/app/patient/treatment-programs/page.nudgeResilience.test.tsx` | существующий — **должен оставаться зелёным** |
| `apps/webapp/src/shared/ui/patientVisual.ts` | существующий — только reuse-токены, без новых одноразовых классов |

## Out of scope (запрещено)

- Любые миграции/контрактные изменения.
- Процентная аналитика прогресса.
- Пациентское создание программ.
- Новый custom chrome на уровне route-компонента вместо shared primitives.

## Подэтапы (декомпозиция)

| Шаг | Что сделать | Критерий готовности |
|-----|-------------|---------------------|
| D1 | Hero активной программы: название, `current_stage_title`, бейдж «План обновлён» (через `planUpdatedLabel`), CTA → `/treatment-programs/[instanceId]` | Hero отображается только при наличии активной программы; использует patient primitives |
| D2 | Архив завершённых программ в отдельной секции под `<details>` с заголовком «Завершённые программы» | Секция свёрнута по умолчанию |
| D3 | Empty state: нет активной программы → «Здесь появится программа после назначения врачом» + ссылка на `/messages` | Empty state соответствует roadmap-копирайту |
| D4 | Проверка на отсутствие `%` прогресса в hero и в списке | Метрики прогресса отсутствуют |
| D5 | Убедиться, что `PatientTreatmentProgramsListClient.test.tsx` и `nudgeResilience` зелёные | Все существующие тесты зелёные |
| D6 | Прогнать целевые проверки | Зелёные lint / typecheck / tests |
| D7 | Обновить `LOG.md` | Зафиксированы scope, проверки и итог этапа |

## Проверки

```bash
pnpm --dir apps/webapp lint --max-warnings=0 -- src/app/app/patient/treatment-programs
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs
```

## Коммит-гейт этапа

- После `EXEC -> AUDIT -> FIX` этапа D: **только commit**, без полного `ci`.
- Формулировка в логе: `Stage D closed`.
