# Stage 4 - Integrator display-timezone из БД

## Цель этапа

Убрать расхождение источников timezone: integrator должен читать display-timezone из `system_settings` (scope `admin`), как и webapp.

## Scope (только Stage 4)

- Асинхронный accessor display timezone через БД.
- Обновление callsites integrator.
- Удаление timezone env-конфига из runtime-схемы (с аккуратным transitional fallback, если нужно).

**Согласованность с Stage 1 (branch timezone):** любой **операционный** IANA-fallback в integrator для времени (timezone филиала из `getBranchTimezone` — Stage 1; display-timezone из `system_settings` — этот stage) должен быть **наблюдаемым**: инцидент + Telegram-алерт с дедупом, а не только `warn`. Требования к fallback филиала зафиксированы в `STAGE_1_BRANCH_TIMEZONE_DB.md` (S1.T06); этот документ задаёт то же для display-timezone.

Не включать:

- Полный отказ от всех legacy env в проекте.
- Рефактор unrelated notification/rendering логики.

## План реализации (детально)

### S4.T01 - Новый accessor `getAppDisplayTimezone()`

В `apps/integrator/src/config/appTimezone.ts`:

- Реализовать async чтение из `system_settings`:
  - key: `app_display_timezone`
  - scope: `admin`
- Добавить TTL cache 60 секунд.
- Поведение при отсутствии настройки: fallback `Europe/Moscow` + warn.

### S4.T05 - Наблюдаемость fallback по display-timezone

Если `app_display_timezone` отсутствует или невалиден:

- создавать инцидент конфигурации в хранилище инцидентов;
- отправлять Telegram-алерт админу (с дедупом);
- не допускать "тихого" постоянного fallback без операционного сигнала.

### S4.T02 - Обновить callsites на async API

Проверить и обновить места:

- `recordM2mRoute.ts`
- `bookingNotificationFormat.ts`
- `scheduleBookingReminders`
- `formatIsoInstantAsRubitimeRecordLocal`

Важно:

- Не оставлять смешение sync/async API.
- Не блокировать event loop искусственными sync-обертками.

### S4.T03 - Очистка env-схемы timezone

В `apps/integrator/src/config/env.ts`:

- Убрать `APP_DISPLAY_TIMEZONE` и `BOOKING_DISPLAY_TIMEZONE` из основной zod-схемы.
- Если нужен временный fallback, оставить только депрекейтнутый механизм с явным warn.

### S4.T04 - Тесты на DB-source timezone

Сценарии:

- В `system_settings` выставлен `Europe/Samara`.
- Форматирование уведомления/сообщения использует `+4`, а не `+3`.
- При пустой настройке используется fallback `Europe/Moscow`.

## Проверки и тесты

- Прогнать тесты config + форматирования + notifications.
- Прогнать `pnpm run ci`.

Ручной smoke:

- Поменять `app_display_timezone` в dev.
- Проверить изменение вывода времени в integrator путях.

## Gate (обязателен для PASS)

- Integrator и webapp читают display timezone из одного источника (БД).
- Env timezone переменные удалены/депрекейтнуты по плану.
- TTL cache работает корректно.
- fallback-кейсы по display-timezone наблюдаемы через инцидент + Telegram-алерт.
- `pnpm run ci` зеленый.

## Артефакты в лог

В `AGENT_EXECUTION_LOG.md` зафиксировать:

- SQL/код evidence чтения `system_settings`.
- Список обновленных callsites.
- Тест-кейс с `Europe/Samara`.
- Результат `pnpm run ci`.
