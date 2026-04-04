# Stage 3 - Нормализация на входе (ingest)

## Цель этапа

Нормализовать Rubitime-времена (`recordAt`, `dateTimeEnd`) в UTC instant на границе integrator, до записи в БД и до отправки в projection/webhook-события.

## Scope (только Stage 3)

- Integrator connector: нормализация входа.
- Защита SQL-вставок через `::timestamptz`.
- Тесты ingest/writePort.
- Вариант A для невалидного времени: запись не теряется, но создаются инцидент и админ-алерт.

Не включать:
- Перенос display timezone integrator на БД (Stage 4).
- Удаление всех legacy костылей (Stage 7).

## План реализации (детально)

### S3.T01 - Нормализовать `recordAt` в connector

В `apps/integrator/src/integrations/rubitime/connector.ts`:

- Достать сырое поле (`record`/`datetime` по контракту).
- Получить timezone филиала через `getBranchTimezone(integratorBranchId)`.
- Пропустить через `tryNormalizeToUtcInstant` (или `normalizeToUtcInstant`, если причина не нужна); для инцидента использовать `reason` при `ok: false`.
- Если нормализация не удалась при наличии raw-времени:
  - не ломать ingest целиком (вариант A),
  - передавать `recordAt = undefined` в доменную запись (дальше в БД это `NULL`),
  - обязательно создать инцидент качества данных в отдельном хранилище,
  - обязательно отправить Telegram-алерт администратору (с дедупом).

### S3.T02 - Нормализовать `dateTimeEnd` аналогично

- Та же схема: raw -> branch timezone -> normalizer -> ISO-Z.
- При неуспешной нормализации при наличии raw-времени: инцидент + админ-алерт обязательны.
- Важно сохранить прежнюю структуру payload, не ломая внешние контракты.

### S3.T03 - Укрепить SQL insert/update

В `apps/integrator/src/infra/db/repos/bookingRecords.ts`:

- В SQL-выражениях для `record_at` добавить явное `::timestamptz` на параметр.
- Проверить все точки upsert/insert, а не только одну ветку.

Цель: даже при будущем регрессе входного формата PG не будет молча трактовать строку неоднозначно.

### S3.T04 - Тесты connector

Добавить/обновить тесты:

- Вебхук с `"2026-04-07 11:00:00"` + branch `Europe/Moscow`.
- Проверить, что в internal incoming event уходит `"2026-04-07T08:00:00.000Z"`.
- Отдельный кейс для `Europe/Samara`.

### S3.T05 - Тесты writePort/repo

- При `booking.upsert` с ISO-Z убедиться, что в repo вызывается корректный instant.
- Тест на отсутствие деградации полей, не связанных с временем.

### S3.T06 - Контракт инцидентов качества данных

Добавить единый контракт записи инцидента (не только для Rubitime, но как reusable-механизм для интеграций):

- `integration`
- `entity`
- `externalId`
- `field` (`recordAt` / `dateTimeEnd` / др.)
- `rawValue`
- `timezoneUsed`
- `errorReason` (`invalid_datetime` | `invalid_timezone` | `unsupported_format`)
- `status` (`open` | `resolved`)
- `firstSeenAt` / `lastSeenAt` / `occurrences`

Инциденты дедуплицировать по ключу (`integration + entity + externalId + field + errorReason`).

### S3.T07 - Признак качества данных в событии/проекции

В projection payload добавить признак, что время не прошло нормализацию (`timeNormalizationStatus` и/или список полей с ошибкой), чтобы downstream мог явно отличать "нет времени по бизнесу" от "время было, но не нормализовалось".

### S3.T08 - Разделить бизнес-семантику `recordAt` и `dateTimeEnd`

Явно зафиксировать в коде и тестах:

- `recordAt` — бизнес-обязательное время записи; при невалидном raw-времени обязателен путь Variant A (сохранение + инцидент + алерт).
- `dateTimeEnd` — вспомогательное поле; его отсутствие/`NULL` допустимо, но при невалидном raw-значении инцидент и алерт также обязательны.

## Проверки и тесты

- Прогнать tests для connector/writePort/repo.
- Прогнать `pnpm run ci`.

Ручная валидация (желательно в dev DB):

- Отправить webhook fixture с наивной датой.
- Проверить в `rubitime_records.record_at`, что в БД UTC instant.
- Проверить projection event payload: `recordAt` уже ISO-Z.
- Отправить webhook с невалидным временем и убедиться:
  - запись сохранена (вариант A),
  - `record_at IS NULL`,
  - создан инцидент качества данных,
  - ушел Telegram-алерт админу.

## Gate (обязателен для PASS)

- Наивная дата из Rubitime больше не попадает в БД в сыром виде.
- `rubitime_records.record_at` хранит корректный UTC instant.
- Projection payload содержит `recordAt` как ISO-Z.
- **Variant A — обязательная политика** (не опциональная): при невалидной дате/зоне при наличии сырого времени запись сохраняется с `recordAt`/`dateTimeEnd` = `NULL` в БД где применимо, фиксируется инцидент (в т.ч. с `errorReason` из `tryNormalizeToUtcInstant`), отправляется Telegram-алерт админу с дедупом.
- Все релевантные тесты и `pnpm run ci` зеленые.

## Артефакты в лог

В `AGENT_EXECUTION_LOG.md` зафиксировать:

- Fixture входного вебхука.
- Пример значения до/после нормализации.
- SQL/тест evidence для `record_at`.
- Evidence по невалидному времени: запись инцидента + алерт.
- Результат `pnpm run ci`.
