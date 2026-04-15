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
- Диплинк MAX для привязки в браузере (`POST /api/auth/channel-link/start`): **`max_login_bot_nickname`** (ник или `https://max.ru/<nick>`). Fallback порядка чтения: env **`MAX_LOGIN_BOT_NICKNAME`** → ник из **`CHANNEL_LIST`** в `apps/webapp/src/modules/channel-preferences/constants.ts` (поле `openUrl` у канала MAX), см. `getMaxLoginBotNickname()`.
- Подпись MAX Mini App `initData` на webapp: **`max_bot_api_key`** (тот же секрет, что у бота в MAX Platform API для проверки подписи; не путать с webhook-secret интегратора). Хранится в **`system_settings`** (admin), UI в `/app/settings`; после сохранения зеркалируется в integrator через `updateSetting` / sync.

### Telegram в webapp env: username бота vs числовые id

Частая путаница:

| Что | Где | Формат | Назначение |
|-----|-----|--------|------------|
| **Публичный username бота** | `TELEGRAM_BOT_USERNAME` (env, fallback) и/или **`telegram_login_bot_username`** в `system_settings` | строка **без** `@`, как в `t.me/your_bot` (например `bersoncare_bot`) | Deep links `https://t.me/…`, Telegram Login Widget (`data-telegram-login`). **Не** подставлять сюда числовой id бота из BotFather — для `t.me/` нужен именно username, если он задан у бота в Telegram. |
| **Числовые id пользователей** | `ALLOWED_TELEGRAM_IDS`, `ADMIN_TELEGRAM_ID`, списки в БД (`allowed_telegram_ids`, …) | целые числа (Telegram user id аккаунтов людей) | Вайтлист/роли входа. Это **не** имя бота и **не** замена `telegram_login_bot_username`. |

Итог: в env рядом могут лежать и **id людей** (whitelist), и отдельно **`TELEGRAM_BOT_USERNAME`** — это **не id**, а **handle бота** для ссылок и виджета.

### MAX: ник бота для channel-link vs числовые id пользователей

| Что | Где | Назначение |
|-----|-----|------------|
| **Ник бота MAX** (путь `max.ru/<nick>`) | **`max_login_bot_nickname`** в `system_settings`, иначе **`MAX_LOGIN_BOT_NICKNAME`** в env, иначе разбор **`CHANNEL_LIST`** (`max.openUrl`) | Диплинк `https://max.ru/<nick>?start=link_…` при привязке из веба ([документация MAX](https://dev.max.ru/docs/chatbots/bots-coding/prepare)). |
| **Числовые Max user id** | `allowed_max_ids`, `admin_max_ids`, `doctor_max_ids` и т.д. | Вайтлист/роли входа; **не** замена ника бота для диплинка. |
- **Yandex OAuth (backend-only):** `yandex_oauth_client_id`, `yandex_oauth_client_secret`, `yandex_oauth_redirect_uri` — редактирование через admin Settings; **не** дублировать в env webapp.
- **Google Calendar OAuth + integration:** `google_client_id`, `google_client_secret`, `google_redirect_uri`, `google_refresh_token`, `google_calendar_id`, `google_calendar_enabled`, `google_connected_email` — управление через admin Settings UI (OAuth consent flow + выбор календаря). Env-переменные `GOOGLE_*` в integrator помечены `@deprecated` и оставлены как fallback на переходный период.
- Отображение времени: **`app_display_timezone`** (IANA).
- Вайтлисты: `allowed_telegram_ids`, `allowed_max_ids`, `admin_telegram_ids`, `doctor_telegram_ids`, `admin_max_ids`, `doctor_max_ids`, `admin_phones`, `doctor_phones`, `allowed_phones`. На странице `/app/settings` (вкладка «Доступ и роли») в UI редактируются списки **Telegram / Max ID**; ключи `admin_phones`, `doctor_phones`, `allowed_phones` поддерживаются тем же `PATCH /api/admin/settings`, отдельной формы в этом экране пока нет.
- Операционные флаги: `dev_mode`, `debug_forward_to_admin`, **`max_debug_page_enabled`** (показ диагностического маршрута `/max-debug` для MAX Mini App; по умолчанию выключено; только админ Settings, не env), `important_fallback_delay_minutes`, `integration_test_ids`, `sms_fallback_enabled` (doctor scope и др. — см. `ALLOWED_KEYS`).
- **Integrator `linkedPhone`:** строковый ключ **`integrator_linked_phone_source`** (`public_then_contacts` \| `public_only` \| `contacts_only`) — как объединять телефон из `public.platform_users` и legacy `integrator.contacts` при гейте `/start` и меню; редактирование в `/app/settings` (админ, диагностика), зеркало в `integrator.system_settings`.

**Таблицы-справочники интегратора** — несекретные бизнес-контракты (Rubitime mapping и т.д.), см. отдельные миграции.

## Несколько redirect URI в Google Cloud (OAuth 2.0)

- В Google Cloud Console у одного OAuth 2.0 Client ID можно указать **несколько** Authorized redirect URIs.
- Сейчас в `system_settings` (webapp, admin) хранится **одна** строка `google_redirect_uri`. Её использует только поток подключения **Google Calendar** (колбэк вида `…/api/admin/google-calendar/callback`), см. `apps/webapp/src/app/api/admin/google-calendar/start/route.ts`.
- Отдельный **вход пользователя через Google** в webapp в текущей версии кода не реализован. Если появится второй OAuth-поток с другим путём колбэка, его URI нужно добавить в GCP **и** завести отдельный ключ в `system_settings` (или согласовать единую схему), не дублируя произвольно одни и те же поля в двух вкладках UI без изменения контракта БД.

## Устаревшее / исправлено

- Ранее в документе фигурировало утверждение, что «все интеграционные ключи только в env». Для **webapp** это не так: ключи из списка выше живут в **`system_settings`**, чтение через `configAdapter` / `integrationRuntime` (см. `apps/webapp/src/modules/system-settings/types.ts`).
- `RUBITIME_SCHEDULE_MAPPING` в env — удалена; маппинг в таблицах webapp/integrator.

## Интегратор (отдельное приложение)

- Integrator читает свои секреты и URL из **своего** env (`apps/integrator`); это не смешивается с `system_settings` webapp, кроме случая **одной PostgreSQL** (см. ниже).
- **Исключение: Google Calendar** — integrator `runtimeConfig.ts` читает `system_settings` из зеркалированной таблицы в схеме integrator (push от webapp через `syncSettingToIntegrator` или прямой SQL после рефакторинга), с **пофайловым** слиянием с env: для каждого поля (`clientId`, `secret`, `redirectUri`, `calendarId`, `refreshToken`, `enabled`) используется значение из БД, если строка/флаг заданы; иначе — env. Так частично синхронизированная БД не затирает рабочий env пустыми полями. Кэш сбрасывается при приёме `google_*` ключей через `/api/integrator/settings/sync`.

### Одна БД, схемы `public` и `integrator` (актуально)

**Обновлённая модель (2026-04):** на production webapp и integrator подключаются к **одной** базе PostgreSQL (`DATABASE_URL` в `api.prod` и `webapp.prod` совпадает). Таблицы webapp/канона — в схеме **`public`**; таблицы integrator — в схеме **`integrator`**. Запись канона и связей пациента из integrator в `public` — **прямой SQL в транзакции**, без обязательного HTTP в webapp как основного пути. Подробнее: [`DATABASE_UNIFIED_POSTGRES.md`](./DATABASE_UNIFIED_POSTGRES.md).

### Зеркало `system_settings` (webapp → integrator)

Таблица `system_settings` в **`public`** создаётся **webapp-миграциями**; в схеме integrator — **отдельная миграция** с тем же контрактом колонок (`key`, `scope`, `value_json`, …), без FK на `platform_users`. При **одной БД** это две таблицы в **разных схемах** одного кластера; код integrator по-прежнему может получать настройки из `integrator.system_settings`.

**Канонический путь записи из webapp:** `createSystemSettingsService` → `updateSetting` → upsert в **`public.system_settings`**. После успешного upsert вызывается **`syncSettingToIntegrator`** (подписанный HTTP `POST` на integrator `POST /api/integrator/settings/sync`) — пока контракт не переведён на запись в `integrator.system_settings` тем же процессом/SQL без round-trip.

**Правила для агентов и разработчиков:**

1. **Новый ключ** — добавить в `ALLOWED_KEYS` (`apps/webapp/src/modules/system-settings/types.ts`), UI/API при необходимости, затем **тот же** `(key, scope)` должен оказаться в integrator после следующего сохранения в админке (push) или после прямой синхронизации схем.
2. **Не дублировать** вызовы sync в route handlers — только через `updateSetting`.
3. **Скрипты и миграции**, которые меняют `system_settings` в `public` напрямую, должны либо повторить строку в `integrator.system_settings`, либо документировать одноразовый backfill и при необходимости вызвать тот же HTTP sync из ops.

**Файлы:** `apps/webapp/src/modules/system-settings/service.ts`, `syncToIntegrator.ts`; integrator: `apps/integrator/src/integrations/bersoncare/settingsSyncRoute.ts`, миграция `apps/integrator/src/infra/db/migrations/core/20260406_0002_create_system_settings.sql`.

### Legacy: две отдельные БД

До unification на проде могли быть **две** базы (`tgcarebot` / `bcb_webapp_prod` и т.п.). Cutover/backfill-скрипты и `cutover.prod` с `INTEGRATOR_DATABASE_URL` описывают этот **исторический** режим. Новые фичи не проектировать под «две БД + HTTP как единственный способ записи канона».

### Доставка HTTP и очереди (fallback / legacy-потоки)

При **разнесённых** процессах webapp и integrator обмен по-прежнему может идти подписанными POST. **Очереди в БД** (`projection_outbox`, `integrator_push_outbox`) и worker — **запасной путь** при сбоях и для кода, ещё не переведённого на прямой SQL в одной БД; не позиционировать их как основной механизм для новых сценариев записи в `public`.

- **Integrator → webapp (проекции, legacy):** после коммита транзакции события могут отправляться в webapp по HTTP (`webappEventsPort.emit` / `POST /api/integrator/events`). При ошибке сети/5xx строка может попасть в **`integrator.projection_outbox`** и обрабатываться worker’ом (`bersoncarebot-worker-prod.service`). Код: `apps/integrator/src/infra/db/repos/projectionFanout.ts`, `createDbWritePort` + `fanoutProjectionsAfterTx`.

- **Webapp → integrator:** `syncSettingToIntegrator`, `notifyIntegrator` и связанные вызовы сначала делают немедленный POST; при сбое полезная нагрузка может записываться в **`public.integrator_push_outbox`** (миграция webapp `071_integrator_push_outbox.sql`). Повторная доставка — `pnpm integrator-push-outbox-tick` (см. `apps/webapp/package.json`).

## Что НЕ хранится в документации

- Значения секретов, паролей, полных connection string с паролем — только имена ключей env или ключей `system_settings`.

## Связанные файлы

- Webapp: `apps/webapp/src/modules/system-settings/types.ts` (`ALLOWED_KEYS`).
- Webapp: `apps/webapp/src/modules/system-settings/service.ts`, `syncToIntegrator.ts`, `configAdapter.ts`, `integrationRuntime.ts`.
- Webapp: `apps/webapp/src/config/env.ts`.
- Webapp (UI админских настроек, вкладки): `apps/webapp/src/app/app/settings/page.tsx`, `AppParametersSection.tsx`, `AuthProvidersSection.tsx`, `AccessListsSection.tsx`, `GoogleCalendarSection.tsx`, `patchAdminSetting.ts`.
- Integrator: `apps/integrator/src/config/env.ts`, `settingsSyncRoute.ts`.
