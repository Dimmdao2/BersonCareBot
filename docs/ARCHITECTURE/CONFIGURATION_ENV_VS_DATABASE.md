# Конфигурация: env vs база данных

## Принцип

**Переменные окружения (`process.env`)** используются для:

1. **Секретов и учётных данных** — API-ключи, HMAC-секреты, OAuth client secret, токены ботов, пароли. В репозиторий и документацию попадают только **имена** переменных, не значения.
2. **Подключения к инфраструктуре** — `DATABASE_URL` и аналоги.
3. **Базовых параметров процесса** — `NODE_ENV`, `HOST`, `PORT`, `LOG_LEVEL`.
4. **Секретов интеграций** — ключи, токены, webhook URL/секреты внешних интеграций (`RUBITIME_API_KEY`, `RUBITIME_WEBHOOK_TOKEN`, `MAX_API_KEY`, `SMSC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `GOOGLE_*`, `YANDEX_*`, `INTEGRATOR_*`, `BOOKING_URL` и т.д.).

**Таблица `system_settings` (webapp, scope `admin`)** — источник истины для **несекретной** операционной конфигурации, которую разумно менять без передеплоя:

- Публичные ссылки: `support_contact_url`.
- Вайтлисты: `allowed_telegram_ids`, `allowed_max_ids`, `admin_telegram_ids`, `doctor_telegram_ids`, `admin_max_ids`, `doctor_max_ids`, `admin_phones`, `doctor_phones`, `allowed_phones`.
- Операционные флаги: `dev_mode`, `debug_forward_to_admin`, `important_fallback_delay_minutes`, `integration_test_ids`.
- Настройки пользователя (doctor scope): `patient_label`, `sms_fallback_enabled`.

**Таблицы-справочники интегратора** — источник истины для несекретных бизнес-контрактов:

- `rubitime_branches`, `rubitime_services`, `rubitime_cooperators`, `rubitime_booking_profiles` — маппинг доменного query (type/category/city) в Rubitime IDs.
  Управляется через admin UI webapp (`/app/settings` → раздел «Rubitime»).
  Ранее хранился в env (`RUBITIME_SCHEDULE_MAPPING`), что являлось ошибкой архитектуры.

## Интеграционные ключи, секреты и webhook

Все ключи, токены и URI внешних интеграций (Rubitime, MAX, SMSC, Google, Yandex, Telegram) хранятся **только в env**. `system_settings` не является хранилищем интеграционных секретов.

Это означает:

- Integrator читает конфиг из `config.ts` / `env.ts` напрямую, без DB override.
- Webapp читает интеграционные ключи из `env` через `integrationRuntime.ts` (прямые getter'ы без DB lookup).
- Admin UI не предоставляет редактирование интеграционных ключей и секретов.

## Что НЕ хранится в env (было ошибкой)

- `RUBITIME_SCHEDULE_MAPPING` — удалена. Данные теперь в `rubitime_booking_profiles` (integrator DB).
  Контракты (схемы, типы, ошибки) лежат в коде: `internalContract.ts`, `schema.ts`.

## Связанные файлы

- Webapp: `apps/webapp/src/modules/system-settings/types.ts` (`ALLOWED_KEYS`) — полный список ключей, допустимых в `system_settings`.
- Integrator: `apps/integrator/src/config/env.ts` — единый реестр env-переменных с zod-валидацией при старте.
- Webapp: `apps/webapp/src/config/env.ts` — единый реестр env-переменных webapp.
