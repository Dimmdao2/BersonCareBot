# Конфигурация: env vs база данных

> ⚠️ **УСТАРЕЛО для роли администратора (26.07.2026).** Правило ниже — «операционная конфигурация, включая
> часть параметров авторизации, живёт в `system_settings`» — для **роли администратора** больше не действует:
> по новому канону закрепление владельца переезжает в переменную окружения, а роль не выдаётся списками в БД.
> Канон: [ADMIN_ACCESS_MODEL.md](ADMIN_ACCESS_MODEL.md). Остальные вайтлисты (клиентские id, MAX/Telegram
> технические параметры) и адресаты оповещений (`admin_incident_alert_config` и т.п.) этим решением не
> затронуты — они остаются в БД как есть.

## Принцип

**Переменные окружения (`process.env`)** используются для:

1. **Подключения к инфраструктуре** — `DATABASE_URL` и аналоги.
2. **Секретов процесса веб-приложения** — `SESSION_COOKIE_SECRET`, секреты обмена с интегратором (`INTEGRATOR_WEBAPP_ENTRY_SECRET`, `INTEGRATOR_WEBHOOK_SECRET`), при необходимости `INTEGRATOR_SHARED_SECRET`.
3. **Базовых параметров процесса и deployment identity** — `NODE_ENV`, `HOST`, `PORT`, **`APP_BASE_URL`**. Оба сервиса читают один публичный origin из своего validated env; у integrator значение обязательно и валидируется как URL при старте.
4. **Опционально в клиентском бандле webapp:** `NEXT_PUBLIC_APP_BASE_URL` — тот же канонический базовый URL приложения, что и **`APP_BASE_URL`** у процесса Next.js (публичная строка, **не секрет**). Нужен только если в **`body_md`** страниц контента встречаются **абсолютные** ссылки на медиабиблиотеку вида `https://<ваш-хост>/api/media/{uuid}` и при открытии страницы origin браузера может не совпасть с этим хостом; иначе достаточно относительных путей `/api/media/…`. Логика: [`MarkdownEmbeddedLink.tsx`](../../apps/webapp/src/shared/ui/markdown/MarkdownEmbeddedLink.tsx), [`parseApiMediaIdFromMarkdownHref`](../../apps/webapp/src/shared/lib/parseApiMediaIdFromPlayableUrl.ts).
5. **Bootstrap интегратора** — env integrator (`apps/integrator`) по своему `config`/`env.ts`; webhook/SMS к интегратору на стороне webapp: `INTEGRATOR_API_URL` + shared secret для вызовов отправки SMS/email OTP.

**Таблица `system_settings` (webapp, scope `admin`)** — источник истины для **операционной** конфигурации, которую разумно менять без передеплоя, включая **часть интеграционных параметров авторизации**, согласно правилам репозитория. Таблица поддерживает глобальные строки (`organization_id IS NULL`) и org-specific overrides (`organization_id` задан); текущие admin Settings формы пишут глобальные строки, если конкретный flow явно не передаёт organization context.

### S5 runtime store (additive compatibility state)

`public.app_runtime_settings` — отдельное хранилище только для typed-registry-approved безопасных runtime values и
allowlisted derived projections; оно хранит global row либо org override с теми же identity semantics. Restricted
keys, credential envelopes и секретные поля не копируются в него. `public.app_runtime_settings_audit` фиксирует
old/new runtime JSON, actor, source, org и time в той же PostgreSQL transaction через runtime-table trigger.

На S5-1 `public.system_settings` остаётся existing compatibility authoring store и единственным хранилищем
настроек. S5-1 не переносит write chokepoint и не включает patient grants/RLS; это последующие S5-2/S5-3
stages. Runtime audit belongs to the database trigger only, so S5-3 must reuse it rather than create a second
application audit.

- **Публичный origin deployment:** `APP_BASE_URL` в validated env webapp и integrator. Это идентичность конкретного развёртывания, поэтому она не редактируется через admin Settings и не читается из `system_settings`; отсутствие или невалидный URL блокирует старт integrator. Миграция `0273_remove_app_base_url_setting` удаляет оставшиеся глобальные и org-scoped строки старого ключа.
- Публичные ссылки: `support_contact_url`.
- Telegram Login Widget: `telegram_login_bot_username`.
- Диплинк MAX для привязки в браузере (`POST /api/auth/channel-link/start`): только DB-backed **`max_login_bot_nickname`** (ник или `https://max.ru/<nick>`), см. `getMaxLoginBotNickname()`. Ошибка или отсутствие строки не подменяются env/константой.
- Подпись MAX Mini App `initData` на webapp: **`max_bot_api_key`** (тот же секрет, что у бота в MAX Platform API для проверки подписи; не путать с webhook-secret интегратора). Хранится в **`public.system_settings`** (admin), UI в `/app/doctor/admin/auth`; запись проходит через `updateSetting`.

### Telegram в webapp env: username бота vs числовые id

Частая путаница:

| Что                           | Где                                                                                                 | Формат                                                                | Назначение                                                                                                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Публичный username бота**   | `TELEGRAM_BOT_USERNAME` (env, fallback) и/или **`telegram_login_bot_username`** в `system_settings` | строка **без** `@`, как в `t.me/your_bot` (например `bersoncare_bot`) | Deep links `https://t.me/…`, Telegram Login Widget (`data-telegram-login`). **Не** подставлять сюда числовой id бота из BotFather — для `t.me/` нужен именно username, если он задан у бота в Telegram. |
| **Числовые id пользователей** | `ALLOWED_TELEGRAM_IDS`, `ADMIN_TELEGRAM_ID`, списки в БД (`allowed_telegram_ids`, …)                | целые числа (Telegram user id аккаунтов людей)                        | Вайтлист/роли входа. Это **не** имя бота и **не** замена `telegram_login_bot_username`.                                                                                                                 |

Итог: в env рядом могут лежать и **id людей** (whitelist), и отдельно **`TELEGRAM_BOT_USERNAME`** — это **не id**, а **handle бота** для ссылок и виджета.

### MAX: ник бота для channel-link vs числовые id пользователей

| Что                                     | Где                                                                                                                                         | Назначение                                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ник бота MAX** (путь `max.ru/<nick>`) | **`max_login_bot_nickname`** в `system_settings` | Диплинк `https://max.ru/<nick>?start=link_…` при привязке из веба ([документация MAX](https://dev.max.ru/docs/chatbots/bots-coding/prepare)); DB-read fail-closed. |
| **Числовые Max user id**                | `allowed_max_ids`, `admin_max_ids`, `doctor_max_ids` и т.д.                                                                                 | Вайтлист/роли входа; **не** замена ника бота для диплинка.                                                                                    |

- **Yandex OAuth (backend-only):** `yandex_oauth_client_id`, `yandex_oauth_client_secret`, `yandex_oauth_redirect_uri` — редактирование через admin Settings; **не** дублировать в env webapp.
- **Google Calendar OAuth + integration:** платформа хранит `google_client_id`, `google_client_secret`, `google_redirect_uri` — это регистрация нашего приложения в Google. Каждая клиника хранит только свою связь: `google_refresh_token`, `google_calendar_id`, `google_calendar_enabled`, `google_connected_email`, с exact `organization_id` read без global fallback. Поэтому запись одной клиники не может попасть в календарь другой. Миграция `0271_google_calendar_clinic_connection` переносит legacy-строки автоматически только в действительно одно-клиничной базе; в multi-clinic базе не угадывает владельца, и клиника подключает Google заново в своём Settings UI. Env-переменные `GOOGLE_*` в integrator помечены `@deprecated` и оставлены как fallback только для платформенной OAuth-идентичности на переходный период.
- **Глобальная доступность интеграций:** объект `platform_integration_availability` читается integrator из канонического `public.system_settings` одним typed accessor (`infra/db/platformIntegrationAvailability.ts`) при каждом запросе. Явный `false` для Telegram, MAX, Email, SMSC или Web Push останавливает канал в едином `dispatchPort` до выбора адаптера; ошибка конфигурационная и не ретраится. Тот же accessor управляет Google Calendar поверх exact-org связи. Фоновая/M2M доставка без request-scoped принципала резолвится тем же allowlisted infra-принципалом (`source: 'delivery-handler'`), что и `logDeliveryAttempt` — это не отказ. Отсутствующая/невалидная additive-строка — это отказ чтения (СБОЙ): accessor бросает исключение, доставка по этому вызову не идёт, а не тихо откатывается на скомпилированный default. Объявленный, но не реализованный Yandex Calendar по умолчанию выключен (когда строка читается успешно). Operator-health для Google сначала перечисляет org-scoped строки `google_calendar_enabled` и пробует первую полностью настроенную клинику — без безорганизационного чтения credentials.
- Отображение времени: **`app_display_timezone`** (IANA).
- ⚠️ **УСТАРЕЛО (26.07.2026):** описание ниже про то, как `admin_*`/`doctor_*` списки выдают роль (`isAdmin`
  как объединение по спискам) — устаревшая схема. Канон: [ADMIN_ACCESS_MODEL.md](ADMIN_ACCESS_MODEL.md).
  Клиентские вайтлисты (`allowed_*`) этим не затронуты.
- Вайтлисты: `allowed_telegram_ids`, `allowed_max_ids`, `admin_telegram_ids`, `doctor_telegram_ids`, `admin_max_ids`, `doctor_max_ids`, `admin_phones`, `doctor_phones`, `allowed_phones`. Ключи по-прежнему в `ALLOWED_KEYS` и `PATCH /api/admin/settings`; **отдельный экран вайтлистов в Settings UI не показывается** (один админ / упрощённый продукт). Первый слот админских идентификаторов редактируется во вкладке **«Режимы»** (`admin_phones`, `admin_telegram_ids`, `admin_max_ids`). Сохранение вкладки **«Режимы»** — **один** batch-запрос с телом `{ items: [...] }` (ключи из `MODES_FORM_KEYS`), см. [`patchAdminSetting.ts`](../../apps/webapp/src/app/app/settings/patchAdminSetting.ts) и [`route.ts`](../../apps/webapp/src/app/api/admin/settings/route.ts). **Integrator `facts.isAdmin`:** env-admin ∪ `admin_*_ids` ∪ `doctor_*_ids`; DB-списки читаются из `public.system_settings` на каждом разрешении.
- **Инциденты идентичности (оператор, вне админки):** ключ **`admin_incident_alert_config`** — включение тем (`channel_link`, `auto_merge_conflict`, `auto_merge_conflict_anomaly`, `messenger_phone_bind_blocked`, `messenger_phone_bind_anomaly`) и каналов Telegram/Max; **доставка на списки `admin_telegram_ids` / `admin_max_ids` считается доверенной зоной**: в текстах допускается контекст для расследований merge/bind (ФИО, телефоны, email, идентификаторы мессенджеров из БД, ссылки на карточки клиентов по `APP_BASE_URL`). **Не** включать в такие сообщения пароли, сессионные токены, подписанные секреты, сырые webhook/URL секретов и иной мастер-секрет конфигурации. `PATCH /api/admin/settings` нормализует тело: неизвестные ключи в `topics`/`channels` отбрасываются, отсутствующие v1-флаги тем и отсутствующие `telegram`/`max` получают значения по умолчанию (**true**). **Не** относится к: качеству данных интеграций (`recordDataQualityIncidentAndMaybeTelegram` — всегда по своим правилам), ручному сбою merge / частичному purge (in-app / аудит, отдельные дорожки).
- Операционные флаги: **`dev_mode`** (relay только на тестовые Telegram/Max из `test_account_identifiers`; **включает** тестовые аккаунты в агрегаты аналитики кабинета — см. [`DOCTOR_DASHBOARD_METRICS.md`](DOCTOR_DASHBOARD_METRICS.md)), **`debug_forward_to_admin`** (полнота серверных логов webapp+integrator в journalctl: `false` (default) — только значимое `warn`/`error`/DLQ/retry-fail/security; `true` — подробные operational `info`; **не меняет доставку сообщений и не включает тестовые аккаунты в аналитику**; webapp читает через deps-helper `operationalVerboseLog` и `configAdapter.getConfigBool`, integrator — через `getOperationalVerboseLogEnabled` с чтением на каждый вызов; см. [`docs/BACKLOG_TAILS.md`](../BACKLOG_TAILS.md)), **`max_debug_page_enabled`** (показ диагностического маршрута `/max-debug` для MAX Mini App; по умолчанию выключено; только админ Settings, не env), `important_fallback_delay_minutes`, **`test_account_identifiers`** (телефоны / Telegram / Max ID тестовых аккаунтов — техработы patient UI, dev_mode relay и исключение из аналитики при выключенном `dev_mode`), **`integration_test_ids`** (legacy в БД, без основного UI), `sms_fallback_enabled` (doctor scope и др. — см. `ALLOWED_KEYS`).
- **Техработы patient app:** `patient_app_maintenance_enabled`, `patient_app_maintenance_message`, `patient_booking_url` — UI во вкладке **«Режимы»** (`AdminSettingsSection`), не в «Параметры приложения».
- **Помощь при неподдерживаемом client boot (dormant):** `patient_unsupported_client_fallback_enabled` — global
  public boolean, default `false`; редактируется только global admin на `/app/doctor/admin/auth`. Включает SSR fallback,
  classic watchdog и bounded technical ingress; не включает persistent analytics/operator-health и не активируется
  на TEST/PROD без отдельного решения владельца.
- **Главная пациента / программа (admin, scalar, не форма «Режимы»):** `patient_home_daily_warmup_repeat_cooldown_minutes`, `patient_treatment_plan_item_done_repeat_cooldown_minutes` (целые минуты **5–180**, default **60**), `patient_home_warmup_skip_to_next_available_enabled` (legacy boolean, default **true** — **deprecated**, pick игнорирует), **`patient_home_daily_practice_target`** (1–10, default **3**), **`patient_home_daily_warmup_rotation_enabled`** (boolean, default **false**), **`patient_home_daily_warmup_rotation_times`** (1–3 уникальных `HH:MM` при enabled; TZ слотов — календарь пациента) — автосмена разминки на главной. UI — `/app/doctor/patient-home`. Подробнее: [`apps/webapp/src/modules/patient-home/patient-home.md`](../../apps/webapp/src/modules/patient-home/patient-home.md).
- **Private media / VIDEO_HLS_DELIVERY (admin):** `video_hls_pipeline_enabled`, `video_hls_new_uploads_auto_transcode`, **`video_hls_reconcile_enabled`** (периодический internal reconcile легаси-каталога в `media_transcode_jobs`; cron на хосте — `deploy/HOST_DEPLOY_README.md`), `video_playback_api_enabled`, `video_default_delivery`, **`video_presign_ttl_seconds`** (TTL presigned GET для `GET /api/media/[id]` и полей HLS в playback JSON), **`video_watermark_enabled`** (опциональный burn-in watermark при транскоде в `apps/media-worker`; путь к шрифту — bootstrap env **`MEDIA_WORKER_WATERMARK_FONT`** или системный TTF на хосте воркера, см. `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/PHASE_10_WATERMARK_POLICY.md`). UI: **`/app/doctor/admin/app-settings`** (компонент `apps/webapp/src/app/app/settings/VideoSystemSettingsSection.tsx`).
- **Integrator `linkedPhone`:** единственный источник — подтверждённый `phone_normalized` канонического пользователя в `public.platform_users`; runtime-переключателя и fallback на legacy contacts нет.
- **Исходящий SMTP (код на email через integrator `POST /api/bersoncare/send-email`):** **`smtp_outbound`** — restricted-объект `{ host, port, secure, user, password, from }` в `public.system_settings` (admin); UI на вкладке **«Параметры приложения»**. Единственный runtime-reader integrator — беспараметрическая `SECURITY DEFINER` capability `app.read_integrator_smtp_outbound_setting()`, доступная точному API base-login. У login нет прямого `SELECT` на `public.system_settings`, а у staff/patient/worker ролей нет `EXECUTE` этой capability. SMTP env fallback отсутствует: неполная DB-настройка означает `configured=false`, недоступная база — отказ маршрута.
- **Booking payments (этап 5, own booking engine):** **`booking_payment_enabled`** (boolean), **`booking_payment_providers`** (JSON: `defaultProviderId`, `providers[]` с `id`, `label`, `enabled`, `webhookSecret` / `apiKey` для mock и будущих адаптеров) — admin Settings на `/app/doctor/admin/booking`; секреты **не** в ENV; модуль `modules/payments`.
- **Web Push VAPID (пара ключей для будущей подписки/отправки; только БД, не env):** **`web_push_vapid`** — в `system_settings` (admin) хранится `{ publicKey, privateKey }` (строки base64url, валидация материала P-256 при PATCH); UI на **`/app/doctor/admin/app-settings`** (блок «Параметры приложения»); запись через `PATCH /api/admin/settings` → `updateSetting`. Ответы **`GET /api/admin/settings`** и тело **`PATCH` для этого ключа** клиенту отдают только **`publicKey`** и **`hasPrivateKey`**, без приватной строки; RSC admin-страницы применяют тот же **`redactAdminSettingsForClient`**, чтобы приватный ключ не участвовал в композиции. Чтение пары для будущего sender — **`getWebPushVapidKeyPair`** в `apps/webapp/src/modules/system-settings/webPushVapidRuntime.ts` (не `getConfigValue`). План и DoD: [`PWA_INITIATIVE/WEB_PUSH_VAPID_ADMIN.plan.md`](../PWA_INITIATIVE/WEB_PUSH_VAPID_ADMIN.plan.md).

**Таблицы-справочники интегратора** — несекретные бизнес-контракты (Rubitime mapping и т.д.), см. отдельные миграции.

## Несколько redirect URI в Google Cloud (OAuth 2.0)

- В Google Cloud Console у одного OAuth 2.0 Client ID можно указать **несколько** Authorized redirect URIs.
- Сейчас в `system_settings` (webapp, admin) хранится **одна** строка `google_redirect_uri`. Её использует только поток подключения **Google Calendar** (колбэк вида `…/api/admin/google-calendar/callback`), см. `apps/webapp/src/app/api/admin/google-calendar/start/route.ts`.
- Отдельный **вход пользователя через Google** в webapp в текущей версии кода не реализован. Если появится второй OAuth-поток с другим путём колбэка, его URI нужно добавить в GCP **и** завести отдельный ключ в `system_settings` (или согласовать единую схему), не дублируя произвольно одни и те же поля в двух вкладках UI без изменения контракта БД.

## Устаревшее / исправлено

- Ранее в документе фигурировало утверждение, что «все интеграционные ключи только в env». Для **webapp** это не так: ключи из списка выше живут в **`system_settings`**, чтение через `configAdapter` / `integrationRuntime` (см. `apps/webapp/src/modules/system-settings/types.ts`).
- `RUBITIME_SCHEDULE_MAPPING` в env — удалена; маппинг в таблицах webapp/integrator.

## Интегратор (отдельное приложение)

- Integrator читает bootstrap-инфраструктуру, process secrets и deployment identity из **своего** env (`apps/integrator`). `APP_BASE_URL` — обязательный URL. Операционные integration settings остаются DB-backed и читаются по требованию из `public.system_settings`.
- **Google Calendar** — integrator `runtimeConfig.ts` читает настройки и платформенный switch только из канонической `public.system_settings` через общий public-accessor helper. Неполная, отсутствующая или недоступная DB-конфигурация даёт `enabled=false` и пустые credentials; env-подстановки нет. Чтение выполняется на каждый вызов без process cache.

### Одна БД, схемы `public` и `integrator` (актуально)

**Обновлённая модель (2026-04):** на production webapp и integrator подключаются к **одной** базе PostgreSQL (`DATABASE_URL` в `api.prod` и `webapp.prod` совпадает). Таблицы webapp/канона — в схеме **`public`**; таблицы integrator — в схеме **`integrator`**. Запись канона и связей пациента из integrator в `public` — **прямой SQL в транзакции**, без обязательного HTTP в webapp как основного пути. Подробнее: [`DATABASE_UNIFIED_POSTGRES.md`](./DATABASE_UNIFIED_POSTGRES.md).

### Каноническая таблица `public.system_settings`

Таблица настроек существует только в схеме **`public`** и создаётся webapp-миграциями. Runtime-код integrator читает её напрямую через `publicSystemSettings` helper. Логическая идентичность строки — `(key, scope, organization_id)`: `organization_id IS NULL` означает глобальный default, non-null row — override конкретной организации. Чтения с org context сначала ищут org row и затем fallback на global NULL row.

**Канонический путь записи из webapp:** `createSystemSettingsService` → **`updateSetting`** (одиночный ключ) **или** **`persistAdminModesBatch`** (только форма «Режимы», преднормализованные строки) → upsert в **`public.system_settings`**. Без явного `organizationId` запись остаётся глобальной (`organization_id IS NULL`); org-specific запись должна пройти тем же сервисным путём с organization context. Никакого invalidation-push в integrator после записи нет: reader-ы SMTP, timezone, Google Calendar, staff IDs, verbose logging и platform availability запрашивают актуальное значение непосредственно из той же PostgreSQL.

**Правила для агентов и разработчиков:**

1. **Новый ключ** — добавить в `ALLOWED_KEYS` (`apps/webapp/src/modules/system-settings/types.ts`) и в UI/API при необходимости.
2. **Не создавать** вторую таблицу настроек, HTTP push или outbox-kind для их копирования/инвалидации.
3. **Скрипты и миграции** меняют только каноническую строку в `public.system_settings`.

**Файлы:** webapp `apps/webapp/src/modules/system-settings/service.ts`; integrator reader `apps/integrator/src/infra/db/publicSystemSettings.ts`.

### Уведомления: тема × канал (webapp) и integrator

**Канон приоритета каналов:** [`NOTIFICATION_CHANNELS.md`](./NOTIFICATION_CHANNELS.md) — **Web Push основной** для PWA (пациент и staff); Telegram/MAX/email — дополнительные при наличии привязок и prefs.

Per-channel предпочтения по темам (`user_notification_topic_channels` в `public`) — источник истины для **webapp** при расчёте доставки с учётом темы. **Integrator** продолжает зеркалить агрегат `user_notification_topics` (`topic_code`, `is_enabled`) из событий `preferences.updated`; детализация «тема × канал» в схеме integrator **не синхронизируется** автоматически. Для исходящих напоминаний integrator вызывает подписанный **`GET /api/integrator/delivery-targets`** с опциональным query-параметром **`topic`** (id из `notifications_topics`, например `training_reminders` или `warmup_reminders`): webapp возвращает `channelBindings`, уже отфильтрованные через `getDeliveryTargetsForUser` и per-topic prefs. На правиле напоминания в **`public.reminder_rules`** и зеркале **`integrator.user_reminder_rules`** хранится **`notification_topic_code`** (тот же id темы, что в `notifications_topics`): при диспатче он задаёт тему доставки; если колонка пуста, используется эвристика по категории/intent/связке. Правила категории **«важное»** синхронизируются с **`notification_topic_code = null`** — доставка без фильтра по теме (все каналы, разрешённые общими prefs). Напоминания по слоту записи (Rubitime booking lifecycle) запрашивают targets с **`topic=appointment_reminders`**. Обработчик **`reminders.dispatchDue`** сопоставляет правило/категорию напоминания с темой и отбрасывает канал, если webapp не вернул соответствующий `telegramId`/`maxId`. В **`contextQueryPort`** для **`subscriptions.forUser`** сначала по `public.platform_users` (uuid или `integrator_user_id`) выясняется `phone_normalized`, затем тот же delivery API по телефону; если в БД нет строки, используется переданная строка как телефон (обратная совместимость). Новые env-переменные для этого не используются.

### Legacy: две отдельные БД

До unification на проде могли быть **две** базы (`tgcarebot` / `bcb_webapp_prod` и т.п.). Cutover/backfill-скрипты и `cutover.prod` с `INTEGRATOR_DATABASE_URL` описывают этот **исторический** режим. Новые фичи не проектировать под «две БД + HTTP как единственный способ записи канона».

### Доставка HTTP и очереди (fallback / legacy-потоки)

При **разнесённых** процессах webapp и integrator обмен по-прежнему может идти подписанными POST. **Очереди в БД** (`projection_outbox`, `integrator_push_outbox`) и worker — **запасной путь** при сбоях и для кода, ещё не переведённого на прямой SQL в одной БД; не позиционировать их как основной механизм для новых сценариев записи в `public`.

- **Integrator → webapp (проекции, legacy):** после коммита транзакции события могут отправляться в webapp по HTTP (`webappEventsPort.emit` / `POST /api/integrator/events`). При ошибке сети/5xx строка может попасть в **`integrator.projection_outbox`** и обрабатываться worker’ом (`bersoncarebot-worker-prod.service`). Код: `apps/integrator/src/infra/db/repos/projectionFanout.ts`, `createDbWritePort` + `fanoutProjectionsAfterTx`.

- **Webapp → integrator:** **`public.integrator_push_outbox`** и `pnpm integrator-push-outbox-tick` сохраняются для `reminder_rule_upsert`; настройки через эту очередь не передаются.

## Что НЕ хранится в документации

- Значения секретов, паролей, полных connection string с паролем — только имена ключей env или ключей `system_settings`.

## Связанные файлы

- Webapp: `apps/webapp/src/modules/system-settings/types.ts` (`ALLOWED_KEYS`).
- Webapp: `apps/webapp/src/modules/system-settings/service.ts`, `configAdapter.ts`, `integrationRuntime.ts`.
- Webapp: `apps/webapp/src/config/env.ts`.
- Webapp (UI): личные настройки специалиста (в т.ч. матрица staff push) — `/app/settings` → `apps/webapp/src/app/app/settings/page.tsx` (`SettingsForm`); **операционные** admin-формы — `/app/doctor/admin/*`, `/app/doctor/system-health`, `/app/doctor/audit-log` (см. [`DOCTOR_CABINET_NAVIGATION.md`](DOCTOR_CABINET_NAVIGATION.md)): компоненты по-прежнему в `apps/webapp/src/app/app/settings/*`, маршруты — `apps/webapp/src/app/app/doctor/admin/**/page.tsx`; `patchAdminSetting.ts` (`patchAdminSetting`, **`patchAdminSettingsBatch`** для технических режимов). Старые URL `/app/settings?adminTab=…` редиректят.
- Webapp (главная пациента — doctor UI, server actions с `revalidatePath`): `apps/webapp/src/app/app/doctor/patient-home/patientHomeDoctorSettingsActions.ts` (в т.ч. `savePatientHomeRepeatCooldownsAction` для пауз повтора).
- Webapp (нормализация / batch): `apps/webapp/src/modules/system-settings/modesFormKeys.ts`, `adminSettingsPatchNormalize.ts`, `ports.ts` (`upsertManyInTransaction`), `infra/repos/pgSystemSettings.ts`, `infra/repos/inMemorySystemSettings.ts`.
- Integrator: `apps/integrator/src/config/env.ts`, `apps/integrator/src/infra/db/publicSystemSettings.ts`.
