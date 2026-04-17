# Stage 7 - Зачистка downstream-костылей

## Цель этапа

После стабилизации нормализации на входе убрать временные обходы и устаревшие timezone-механизмы, не ломая backward safety.

## Scope (только Stage 7)

- Cleanup и унификация функций преобразования времени.
- Удаление deprecated timezone env-переменных.
- Обновление документации по конфигурации.

Не включать:

- Новый функционал интеграций.
- Большие архитектурные изменения вне timezone-темы.

## План реализации (детально)

### S7.T01 - `parseBusinessInstant` как safety-net

В webapp:

- Ветку обработки наивной строки не удалять резко.
- Добавить `warn`, что после Stage 3 такие входы считаются аномалией.
- Обеспечить, что warn не шумит бесконечно (по возможности).

### S7.T02 - Документировать защитные ветки в patient bookings

В `pgPatientBookings.ts`:

- Сохранить защитный `CASE` для edge cases.
- Явно задокументировать в коде/доках, что это legacy guard, а не нормальный путь.

### S7.T03 - Resync scripts -> `normalizeToUtcInstant`

В `apps/integrator/src/infra/scripts/resync-rubitime-records.ts`:

- Убрать `rubitimeMaybeDateToIso`.
- Заменить вызовами `normalizeToUtcInstant`.

### S7.T04 - Google sync -> `normalizeToUtcInstant`

В `apps/integrator/src/integrations/google-calendar/sync.ts`:

- Убрать `parseRecordAtToIso`.
- Использовать canonical normalizer.

### S7.T05 - Удалить deprecated timezone env

- Удалить `RUBITIME_RECORD_AT_UTC_OFFSET_MINUTES` из runtime env-схемы.
- Убедиться, что нет активных callsites.

### S7.T06 - Обновить документацию

Обновить:

- `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`

Смысл:

- timezone и integration runtime-настройки, которые должны жить в БД, зафиксированы как policy.

## Проверки и тесты

- Прогнать targeted tests затронутых модулей.
- Прогнать `pnpm run ci`.
- Прогнать поиск по репозиторию:
  - `+03:00`
  - `RUBITIME_RECORD_AT_UTC_OFFSET`
  - `BOOKING_DISPLAY_TIMEZONE`

## Gate (обязателен для PASS)

- Canonical normalizer используется в ключевых скриптах/интеграциях.
- Deprecated timezone env удалены из active runtime paths.
- В продуктовом коде не осталось hardcoded timezone оффсетов (кроме фикстур).
- `pnpm run ci` зеленый.

## Артефакты в лог

В `AGENT_EXECUTION_LOG.md` зафиксировать:

- Результаты grep-проверок.
- Список удаленных legacy символов/функций.
- Результат `pnpm run ci`.
