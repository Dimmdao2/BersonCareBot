# Agent log: references soft delete + client-side filter UI

Дата: 2026-04-16

## Контекст

Доработан экран врача «Справочники» — таблица значений категории (`/app/doctor/references/[categoryCode]`):

- отдельная семантика **мягкого удаления** (`deleted_at`) в дополнение к архиву (`is_active`);
- поиск по названию или коду **только на клиенте**, без смены URL и без запросов при каждом символе;
- порог поиска **от 3 символов**;
- фильтр по статусу **Все / Активные / Архивные** — локально;
- колонка «Код» в таблице убрана (код для новых строк вводится в ячейке «Название»);
- переключение актив/архив — иконка глаза (как в CMS);
- в меню `...` вместо архивирования — **Удалить** (soft delete для сохранённых строк).

## Изменённые файлы

| Файл | Назначение |
|------|------------|
| `apps/webapp/migrations/078_reference_items_deleted_at.sql` | Колонка `deleted_at`, индекс |
| `apps/webapp/src/modules/references/types.ts` | Поле `deletedAt` у `ReferenceItem` |
| `apps/webapp/src/modules/references/ports.ts` | Метод `softDeleteItem` |
| `apps/webapp/src/infra/repos/pgReferences.ts` | SQL: фильтр `deleted_at IS NULL`, soft delete, `saveCatalog` только по не удалённым |
| `apps/webapp/src/infra/repos/inMemoryReferences.ts` | Зеркало логики для тестов |
| `apps/webapp/src/infra/repos/inMemoryReferences.test.ts` | Тест `softDeleteItem` |
| `apps/webapp/src/app/app/doctor/references/actions.ts` | `softDeleteReferenceItem` |
| `apps/webapp/src/app/app/doctor/references/[categoryCode]/page.tsx` | Загрузка всех не удалённых строк без `?mode=` |
| `apps/webapp/src/app/app/doctor/references/[categoryCode]/ReferenceItemsTableClient.tsx` | Новый UI, фильтры, глаз, удаление |
| `apps/webapp/src/app/api/**/references/**/route.test.ts` | Моки/ожидания под выборки с `deleted_at` |

## Поведение до / после

**До:** заголовок показывал код категории, бейджи «Системный/Активный», переключатель списка через `?mode=archived`; в таблице колонка «Код»; статус текстом; меню — архив/восстановление.

**После:** один запрос данных на загрузку страницы; фильтрация и поиск в `ReferenceItemsTableClient` через `useMemo` + `useDeferredValue`; актив/архив — `Eye`/`EyeOff`; удаление — `deleted_at`; публичные списки (`listActiveItemsByCategoryCode`) не отдают удалённые и неактивные строки.

## Проверки (автоматические)

- `pnpm --dir apps/webapp exec vitest run src/infra/repos/inMemoryReferences.test.ts` — успешно (включая новый тест soft delete).
- `pnpm --dir apps/webapp exec eslint` по изменённым путям doctor references + repos + types — успешно.
- `pnpm --dir apps/webapp run typecheck` — успешно.
- Перед отправкой в remote: `pnpm install --frozen-lockfile` и корневой **`pnpm run ci`** (lint, typecheck, integrator+webapp tests, build, audit) — успешно.

## Проверки UX (ручные, по чеклисту плана)

Рекомендуется в браузере:

1. Открыть категорию справочника, ввести в поиск длинную строку — фокус не должен теряться; в Network не должно быть новых запросов на каждый символ (только при первом SSR и при «Сохранить» / «Удалить»).
2. Длина запроса 1–2 символа — текстовый фильтр не сужает список (работает только фильтр статуса).
3. От 3 символов — фильтр по вхождению в `title` или `code` (регистронезависимо).
4. Иконка глаза переключает `isActive` до сохранения; после «Сохранить справочник» состояние фиксируется в БД.
5. «Удалить» для существующей строки вызывает server action и убирает строку из списка после успеха.

## Ограничения

- Повторное использование того же `code` после soft delete по-прежнему упирается в `UNIQUE(category_id, code)` на уровне БД (в рамках задачи reuse не менялся).
- `findItemById` по-прежнему может вернуть строку с `deletedAt` (для исторических ссылок); публичные списки такие строки не показывают.
- Отдельного порта/UI для **снятия** soft delete (восстановления строки в справочнике врача) нет — только мягкое удаление; при необходимости восстановление можно добавить позже (`restoreSoftDeletedItem` в порте + action).

## Деплой

- На окружениях с PostgreSQL нужно применить миграцию **`078_reference_items_deleted_at.sql`** до выкладки кода, который читает/пишет `deleted_at`.
