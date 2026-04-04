# Stage 5 - Убрать хардкоды +03:00

## Цель этапа

Перевести логику слотов и M2M-обработки на timezone филиала, убрав жестко прошитые оффсеты `+03:00` / `+03`.

## Scope (только Stage 5)

- `scheduleNormalizer` и slot-потоки.
- M2M маршруты integrator/webapp для timezone филиала.
- Тесты на различающиеся timezone филиалов.

Не включать:

- Глобальный cleanup всех timezone артефактов (Stage 7).

## План реализации (детально)

### S5.T01 - Параметризовать `scheduleNormalizer`

В `apps/integrator/src/integrations/rubitime/scheduleNormalizer.ts`:

- Убрать `RUBITIME_SLOT_WALL_OFFSET` из рабочей логики.
- Добавить параметр `branchTimezone` в `normalizeRubitimeSchedule`.
- Все вычисления времени делать через IANA timezone.

### S5.T02 - Протащить timezone в `recordM2mRoute.ts`

- Получать timezone филиала из каталога/репозитория.
- Передавать timezone в normalizer/преобразования слотов.
- Если timezone отсутствует -> fallback по Stage 1 правилам (с обязательным инцидентом и Telegram-алертом, не "тихий" fallback).

### S5.T03 - Обновить webapp `bookingM2mApi.ts`

В `apps/webapp/src/modules/integrator/bookingM2mApi.ts`:

- Убрать `DEFAULT_SLOT_TZ` как основной механизм.
- Использовать timezone из `booking_branches`.
- Fallback: display-timezone только как резерв.

### S5.T04 - Тесты слотов

Минимум:

- Branch `Europe/Samara`: слот `"2026-04-07 11:00:00"` дает UTC `"2026-04-07T07:00:00.000Z"`.
- Branch `Europe/Moscow`: аналогичный слот -> `"2026-04-07T08:00:00.000Z"`.
- Нет регрессий в уже существующих MSK-тестах.

## Проверки и тесты

- Прогнать тесты schedule normalizer и slot API.
- Прогнать `pnpm run ci`.

Ручная проверка:

- Получить слоты для двух timezone филиалов.
- Проверить различия в UTC instant и корректный display в UI.

## Gate (обязателен для PASS)

- В продуктовом коде нет хардкодов `+03:00` / `+03` (кроме тестовых фикстур/исторических комментариев).
- Slot-потоки используют timezone филиала.
- `pnpm run ci` зеленый.

## Артефакты в лог

В `AGENT_EXECUTION_LOG.md` зафиксировать:

- Список мест, где удалены хардкоды.
- Тест-кейсы для Samara/Moscow.
- Результат `pnpm run ci`.
