# План: перенос `booking` display timezone из env в БД

## Зачем

`BOOKING_TIMEZONE` в [`apps/integrator/src/config/env.ts`](../../apps/integrator/src/config/env.ts) дублирует роль **операционной** настройки (как URL записи, флаги календаря). Такие значения уже живут в webapp [`system_settings`](../../apps/webapp/migrations/037_system_settings_config_keys.sql) с паттерном **БД → (опционально) env fallback**. Часовой пояс для текста напоминаний/уведомлений должен:

- меняться без передеплоя integrator;
- в перспективе допускать разные значения по тенантам (через ту же таблицу).

Правило разделения: [`docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`](../ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md).

## Предпосылки

- Integrator и webapp используют **одну и ту же** БД (или integrator видит схему, где есть `system_settings`). Если нет — сначала зафиксировать в документе модель БД или ввести промежуточный слой (не входит в минимальный план).

## Шаги реализации

### 1. Миграция webapp: ключ в `system_settings`

- Файл: `apps/webapp/migrations/043_booking_display_timezone.sql` (или следующий свободный номер).
- `INSERT ... ON CONFLICT DO NOTHING` для ключа, например `booking_display_timezone`, `scope = 'admin'`, `value_json = '{"value": "Europe/Moscow"}'`.
- Комментарий в SQL: IANA timezone для форматирования дат/времени в booking-уведомлениях integrator (и при необходимости webapp).

### 2. Разрешить ключ в админке

- [`apps/webapp/src/modules/system-settings/types.ts`](../../apps/webapp/src/modules/system-settings/types.ts) — добавить `booking_display_timezone` в `ALLOWED_KEYS`.
- [`apps/webapp/src/app/api/admin/settings/route.ts`](../../apps/webapp/src/app/api/admin/settings/route.ts) — если список ключей дублируется вручную, синхронизировать.
- UI: [`AppParametersSection.tsx`](../../apps/webapp/src/app/app/settings/AppParametersSection.tsx) (вкладка «Параметры приложения»; ранее `RuntimeConfigSection`) и [`settings/page.tsx`](../../apps/webapp/src/app/app/settings/page.tsx) — поле ввода (строка IANA, плейсхолдер `Europe/Moscow`), валидация опционально через список известных зон или regex `^[A-Za-z_]+(/[A-Za-z_]+)*$`.

### 3. Integrator: чтение из БД с кэшем

- Удалить `BOOKING_TIMEZONE` из [`apps/integrator/src/config/env.ts`](../../apps/integrator/src/config/env.ts).
- Добавить модуль, например `apps/integrator/src/infra/db/repos/bookingDisplayTimezone.ts` или `apps/integrator/src/config/bookingDisplayTimezone.ts`:
  - `getBookingDisplayTimezone(db: DbPort): Promise<string>`;
  - запрос: `SELECT value_json FROM system_settings WHERE key = 'booking_display_timezone' AND scope = 'admin' LIMIT 1`;
  - разбор `value_json` как в webapp `configAdapter.fetchFromDb` (объект с полем `value`: string);
  - **in-memory TTL-кэш** (например 60 с), чтобы не бить БД на каждое напоминание;
  - fallback строки **`Europe/Moscow`**, если строка нет или БД недоступна (лог `warn`).

### 4. Проводка в booking-уведомлениях

- [`recordM2mRoute.ts`](../../apps/integrator/src/integrations/rubitime/recordM2mRoute.ts): в начале `handleBookingLifecycleEvent` один раз `await getBookingDisplayTimezone(createDbPort())` и передавать `timeZone` в форматтеры / обёртки.
- [`bookingNotificationFormat.ts`](../../apps/integrator/src/integrations/rubitime/bookingNotificationFormat.ts): убрать зависимость от `env`; `formatBookingRuDateTime(value, timeZone)` — **обязательный** или с дефолтным аргументом только для тестов (`Europe/Moscow`).
- Вызовы `formatRuDateTime` / `formatBookingRuDateTime` в том же файле получают `timeZone` из замыкания или параметра.

### 5. Тесты

- `bookingNotificationFormat.test.ts` — явно передавать `Europe/Moscow` (без чтения env).
- Интеграционный/юнит-тест на `getBookingDisplayTimezone` с моком `DbPort` (строка из `value_json` и fallback).
- При необходимости smoke: один тест `recordM2mRoute` с моком репозитория timezone.

### 6. Документация и артефакты

- Обновить [`PHASE_2_FIX_TASKS.md`](./PHASE_2_FIX_TASKS.md) и/или [`AGENT_LOG.md`](./AGENT_LOG.md): F.4 timezone перенесён в БД.
- В [`README.md`](../../README.md) integrator/webapp не добавлять `BOOKING_TIMEZONE` в список env (если где-то упоминали — убрать).

### 7. Выкат на прод

- Применить миграцию webapp на prod **до** или вместе с деплоем integrator без `BOOKING_TIMEZONE`.
- Проверить в Admin → Settings значение `booking_display_timezone`.
- Откат: вернуть деплой предыдущего integrator с env (если оставляли временный fallback — не обязательно, если есть дефолт в коде).

## Критерии готовности

- [x] В `env.ts` integrator нет `BOOKING_TIMEZONE`.
- [x] Значение читается из `system_settings`, кэш + fallback документированы.
- [x] Ключ в `ALLOWED_KEYS` и редактируется из админки.
- [x] `pnpm run ci` зелёный.

## Дальнейшая зачистка env (вне этого плана)

Провести отдельный аудит [`apps/integrator/src/config/env.ts`](../../apps/integrator/src/config/env.ts) и `.env.example`: вынести в БД или `appSettings.ts` всё несекретное, что не является DSN/секретом/процессным дефолтом; оставить в env только то, что описано в [`CONFIGURATION_ENV_VS_DATABASE.md`](../ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md).
