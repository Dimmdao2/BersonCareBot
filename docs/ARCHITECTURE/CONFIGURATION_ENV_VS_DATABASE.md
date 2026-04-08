# Конфигурация: env vs база данных

## Принцип

**Переменные окружения (`process.env`)** используются для:

1. **Подключения к инфраструктуре** — `DATABASE_URL` и аналоги.
2. **Секретов процесса веб-приложения** — `SESSION_COOKIE_SECRET`, секреты обмена с интегратором (`INTEGRATOR_WEBAPP_ENTRY_SECRET`, `INTEGRATOR_WEBHOOK_SECRET`), при необходимости `INTEGRATOR_SHARED_SECRET`.
3. **Базовых параметров процесса** — `NODE_ENV`, `HOST`, `PORT`, `APP_BASE_URL`.
4. **Bootstrap интегратора** — env integrator (`apps/integrator`) по своему `config`/`env.ts`; webhook/SMS к интегратору на стороне webapp: `INTEGRATOR_API_URL` + shared secret для вызовов отправки SMS/email OTP.

**Таблица `system_settings` (webapp, scope `admin`)** — источник истины для **операционной** конфигурации, которую разумно менять без передеплоя, включая **часть интеграционных параметров авторизации**, согласно правилам репозитория:

- Публичные ссылки: `support_contact_url`.
- Telegram Login Widget: `telegram_login_bot_username`.
- **Yandex OAuth (backend-only):** `yandex_oauth_client_id`, `yandex_oauth_client_secret`, `yandex_oauth_redirect_uri` — редактирование через admin Settings; **не** дублировать в env webapp.
- **Google Calendar OAuth + integration:** `google_client_id`, `google_client_secret`, `google_redirect_uri`, `google_refresh_token`, `google_calendar_id`, `google_calendar_enabled`, `google_connected_email` — управление через admin Settings UI (OAuth consent flow + выбор календаря). Env-переменные `GOOGLE_*` в integrator помечены `@deprecated` и оставлены как fallback на переходный период.
- Отображение времени: **`app_display_timezone`** (IANA).
- Вайтлисты: `allowed_telegram_ids`, `allowed_max_ids`, `admin_telegram_ids`, `doctor_telegram_ids`, `admin_max_ids`, `doctor_max_ids`, `admin_phones`, `doctor_phones`, `allowed_phones`.
- Операционные флаги: `dev_mode`, `debug_forward_to_admin`, `important_fallback_delay_minutes`, `integration_test_ids`, `sms_fallback_enabled` (doctor scope и др. — см. `ALLOWED_KEYS`).

**Таблицы-справочники интегратора** — несекретные бизнес-контракты (Rubitime mapping и т.д.), см. отдельные миграции.

## Устаревшее / исправлено

- Ранее в документе фигурировало утверждение, что «все интеграционные ключи только в env». Для **webapp** это не так: ключи из списка выше живут в **`system_settings`**, чтение через `configAdapter` / `integrationRuntime` (см. `apps/webapp/src/modules/system-settings/types.ts`).
- `RUBITIME_SCHEDULE_MAPPING` в env — удалена; маппинг в таблицах webapp/integrator.

## Интегратор (отдельное приложение)

- Integrator читает свои секреты и URL из **своего** env (`apps/integrator`); это не смешивается с `system_settings` webapp, кроме общей БД если используется один PostgreSQL для проекций.
- **Исключение: Google Calendar** — integrator `runtimeConfig.ts` читает `system_settings` из зеркалированной таблицы в integrator DB (push от webapp через `syncSettingToIntegrator`), с **пофайловым** слиянием с env: для каждого поля (`clientId`, `secret`, `redirectUri`, `calendarId`, `refreshToken`, `enabled`) используется значение из БД, если строка/флаг заданы; иначе — env. Так частично синхронизированная БД не затирает рабочий env пустыми полями. Кэш сбрасывается при приёме `google_*` ключей через `/api/integrator/settings/sync`.

### Две отдельные БД: зеркало `system_settings` в integrator

На проде у webapp и integrator часто **разные** PostgreSQL (`bcb_webapp_prod` и `tgcarebot` — см. `docs/ARCHITECTURE/SERVER CONVENTIONS.md`). Таблица `system_settings` создаётся **webapp-миграциями**; в БД integrator — **отдельная миграция** с тем же контрактом колонок (`key`, `scope`, `value_json`, …), без FK на `platform_users`.

**Единственный канонический путь записи в webapp:** `createSystemSettingsService` → `updateSetting` → `port.upsert` (PostgreSQL webapp). Сразу после успешного upsert вызывается **`syncSettingToIntegrator`** (подписанный HTTP `POST` на integrator `POST /api/integrator/settings/sync`). Так синхронизируются **и** admin PATCH, **и** doctor PATCH, **и** любой будущий код, который пишет настройки только через сервис.

**Правила для агентов и разработчиков:**

1. **Новый ключ** — добавить в `ALLOWED_KEYS` (`apps/webapp/src/modules/system-settings/types.ts`), UI/API при необходимости, затем **тот же** `(key, scope)` должен оказаться в integrator после следующего сохранения в админке (push). Ручные SQL-вставки только в webapp оставляют integrator без строки до следующего PATCH.
2. **Не дублировать** вызовы sync в route handlers — только через `updateSetting`.
3. **Скрипты и миграции**, которые меняют `system_settings` в webapp напрямую, должны либо повторить строку в integrator (одинаковые `key`, `scope`, `value_json`), либо документировать одноразовый backfill и при необходимости вызвать тот же HTTP sync из ops.

**Файлы:** `apps/webapp/src/modules/system-settings/service.ts`, `syncToIntegrator.ts`; integrator: `apps/integrator/src/integrations/bersoncare/settingsSyncRoute.ts`, миграция `apps/integrator/src/infra/db/migrations/core/20260406_0002_create_system_settings.sql`.

## Что НЕ хранится в документации

- Значения секретов, паролей, полных connection string с паролем — только имена ключей env или ключей `system_settings`.

## Связанные файлы

- Webapp: `apps/webapp/src/modules/system-settings/types.ts` (`ALLOWED_KEYS`).
- Webapp: `apps/webapp/src/modules/system-settings/service.ts`, `syncToIntegrator.ts`, `configAdapter.ts`, `integrationRuntime.ts`.
- Webapp: `apps/webapp/src/config/env.ts`.
- Integrator: `apps/integrator/src/config/env.ts`, `settingsSyncRoute.ts`.
