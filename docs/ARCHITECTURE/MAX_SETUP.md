# Подключение MAX бота к интегратору и вебапп

По аналогии с Telegram: проверка конфигурации, переменные окружения, регистрация webhook и связка с вебапп.

---

## 1. Проверка конфигурации MAX (как для Telegram)

Скрипт проверяет, что `MAX_ENABLED=true`, задан `MAX_API_KEY` и что MAX API отвечает (GET /me).

```bash
npx tsx scripts/check-max.ts
```

- При успехе: вывод `user_id`, `name`, `username` бота и статус webhook secret.
- При ошибке: ненулевой exit code и подсказка (неверный ключ, сеть и т.д.).

Запускать из корня репозитория; используется `.env` (или переменные окружения из api.prod на хосте).

---

## 1a. Ключевые методы MAX API для интегратора

Ниже — рабочий минимум MAX API, который нужен интегратору для входящих событий, исходящей доставки и callback-UX.

| API | Где используется в интеграторе | Назначение |
|-----|--------------------------------|-----------|
| `GET /me` | `scripts/check-max.ts`, `apps/integrator/src/integrations/max/client.ts` (`getMaxBotInfo`) | Проверка ключа `MAX_API_KEY`, диагностика доступности API. |
| `POST /subscriptions` | ops/runbook, webhook setup | Регистрация webhook `POST /webhook/max`, `update_types`, `secret`. |
| `GET /updates` | dev fallback (когда webhook не настроен) | Long polling для локальной отладки/аварийного чтения событий. |
| `POST /messages` | `apps/integrator/src/integrations/max/client.ts` (`sendMaxMessage`) → `deliveryAdapter.ts` | Отправка сообщений пользователю (`chat_id`/`user_id`), включая inline-attachments. |
| `PUT /messages` | `apps/integrator/src/integrations/max/client.ts` (`editMaxMessage`) → `deliveryAdapter.ts` | Редактирование текста/клавиатуры сообщения (важно для callback-ответов без лишних пузырей). |
| `POST /answers` | `apps/integrator/src/integrations/max/client.ts` (`answerMaxCallback`) → `deliveryAdapter.ts` | Снятие «спиннера» на кнопке и пользовательская нотификация после callback. |
| `DELETE /messages` | `apps/integrator/src/integrations/max/client.ts` (`deleteMaxMessage`) → `deliveryAdapter.ts` | Удаление сообщения по `message_id` (stale reminder перед resend). Ошибки API **не рвут** основной send: логируются / soft-fail в адаптере. |

### Какие входящие события должны быть подписаны минимумом

Для рабочих сценариев integrator подписка обычно включает:

- `message_created` — входящий текст/команды/контент пользователя;
- `message_callback` — нажатия inline-кнопок;
- `bot_started` — стартовый сценарий после запуска бота;
- `user_added` — добавление бота в чат/контекст первого контакта.

### Reminders: parity с Telegram (outbound)

| Log / message key | Где | Смысл (кратко) |
|-------------------|-----|----------------|
| `max deleteMessage failed` | MAX client | API отказал delete по валидному id. |
| `max_reminder_delete_payload_invalid` | MAX adapter | Пустой/невалидный `message_id` в delete — no-op. |
| `max_reminder_stale_message_delete_soft_fail` | Adapter | Мягкий отказ stale-delete перед resend. |
| `max_reminder_stale_message_delete_failed` | Worker | Исключение после delete (ловится, send идёт дальше). |
| `max editMessage failed` | MAX client | Редактирование не удалось. |
| `reminder_stale_message_delete_failed` | Worker | Stale-delete для Telegram не удался (ловится). |

- Перед новой отправкой `reminder_dispatch` в MAX выполняется **best-effort** `message.delete` по `maxMessageId` из прошлого успешного лога той же rule (см. `reminders.delivery.staleMessengerMessage`, `deleteBeforeSendMessageId` в очереди).
- После успешной отправки в `user_reminder_delivery_logs.payload_json` пишется **`maxMessageId`** (строка `body.mid` от API).
- Free-text skip (`reminders.skip.applyFreeText`): при наличии **`replyToMessageId`** (в т.ч. из MAX `message.link` с `type: "reply"` на **`message_created`** или на **`message_callback`**, если платформа отдаёт `link` на сообщении с кнопками) — **сначала** `message.edit` промпт-сообщения, иначе fallback на `message.send`.
- Интент **`message.delete`** в MAX: при отсутствии `message_id` адаптер **не бросает** исключение; при отказе API после валидного id — см. ключи в таблице выше (`max deleteMessage failed`, `max_reminder_stale_message_delete_*`).
- Ограничения MAX (окно редактирования ~24h, права) могут приводить к отказу edit/delete: это **не** должно ломать enqueue следующей доставки; полный перечень ключей — в таблице выше.

### Важные ограничения MAX API

- Редактирование (`PUT /messages`) ограничено окном времени (до 24 часов от отправки).
- Для некоторых действий в чатах требуются права бота (роль/permissions в чате).
- Webhook принимает только публичный HTTPS endpoint.

Кодовая опора:

- MAX client: `apps/integrator/src/integrations/max/client.ts`
- MAX adapter: `apps/integrator/src/integrations/max/deliveryAdapter.ts`
- MAX webhook/mapIn/schema: `apps/integrator/src/integrations/max/webhook.ts`, `apps/integrator/src/integrations/max/mapIn.ts`, `apps/integrator/src/integrations/max/schema.ts`

---

## 2. Интегратор: переменные окружения

В файле окружения **интегратора** (корень репо: `.env`; прод: `/opt/env/bersoncarebot/api.prod`) задать:

| Переменная | Описание |
|------------|----------|
| `MAX_ENABLED` | `true` — включить приём webhook и отправку в MAX. |
| `MAX_API_KEY` | Ключ доступа к MAX Platform API (как у Telegram — токен бота). |
| `MAX_WEBHOOK_SECRET` | Секрет для проверки заголовка `X-Max-Bot-Api-Secret` в webhook; **рекомендуется в проде**. |
| `MAX_BOT_ID` | Идентификатор бота в MAX (при необходимости для сценариев). |
| `MAX_ADMIN_CHAT_ID` | Chat ID админского диалога в MAX для пересылки пользовательских вопросов и ответов администратора. Для личного чата с ботом обычно берётся из `recipient_chat_id` в логах webhook. |
| `MAX_ADMIN_USER_ID` | (Опционально.) User ID администратора в MAX; если задан, используется для проверки «пишет ли админ» (вместо сравнения по chat_id). |

Пример (dev, в `.env` рядом с `TELEGRAM_*`):

```env
MAX_ENABLED=true
MAX_API_KEY=your-max-bot-api-key
MAX_WEBHOOK_SECRET=your-webhook-secret-min-16-chars
MAX_BOT_ID=
MAX_ADMIN_CHAT_ID=   # обязателен для пересылки сообщений админу
MAX_ADMIN_USER_ID=   # опционально
```

После этого перезапустить интегратор и снова выполнить:

```bash
npx tsx scripts/check-max.ts
```

В production при `MAX_ENABLED=true` и пустом `MAX_API_KEY` интегратор при старте выведет предупреждение (аналогично `TELEGRAM_BOT_TOKEN`).

При старте webhook вызывается **`setMyCommands` с пустым списком** — в клиенте MAX не отображаются slash-команды бота; навигация через инлайн-кнопки сценариев (см. `MAX_CAPABILITY_MATRIX.md`).

---

## 3. Регистрация webhook в MAX

Интегратор отдаёт **один** endpoint для входящих событий MAX:

- Метод и путь: **POST** `/webhook/max`
- Полный URL на проде: `https://<домен-интегратора>/webhook/max`  
  (например, `https://tgcarebot.bersonservices.ru/webhook/max`).

### Как зарегистрировать URL в MAX

1. **Через MAX Platform API** (документация: https://dev.max.ru/docs-api):

   ```bash
   curl -X POST "https://platform-api.max.ru/subscriptions" \
     -H "Authorization: YOUR_MAX_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "url": "https://tgcarebot.bersonservices.ru/webhook/max",
       "update_types": ["message_created", "message_callback", "bot_started", "user_added"],
       "secret": "ТОТ_ЖЕ_ЧТО_MAX_WEBHOOK_SECRET"
     }'
   ```

   `secret` должен совпадать с `MAX_WEBHOOK_SECRET` в env интегратора (интегратор сравнивает его с заголовком `X-Max-Bot-Api-Secret`).
   `message_callback` нужен для inline-кнопок, `user_added` полезен для стартового меню при добавлении бота.

2. **Через чат MAX** (если поддерживается): команда `/set_webhook` в [@MasterBot](https://max.ru/MasterBot) и указание того же URL и секрета.

Ограничения MAX:

- Только **HTTPS**, порт **443**.
- Для локальной разработки нужен туннель (ngrok и т.п.) с публичным HTTPS URL, который вы укажете в `url` при регистрации webhook.

---

## 4. Связка MAX с вебапп

Два поддерживаемых пути входа в вебапп из MAX:

1. **Подписанная ссылка с `?t=<signed-token>`** (как у Telegram): интегратор формирует URL на `APP_BASE_URL/app?t=...`; в payload — привязка `bindings.maxId`. Вебапп вызывает `POST /api/auth/exchange` и создаёт сессию.
2. **MAX Mini App без токена в URL:** клиент открывает `APP_BASE_URL/app` внутри WebView; среда передаёт строку **`initData`**. Вебапп проверяет подпись через MAX Platform API, используя секрет бота из **`system_settings`** (ключ **`max_bot_api_key`**, admin; см. `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`). HTTP: **`POST /api/auth/max-init`**. На странице `/app` опрос и отправка `initData` делают **`AuthBootstrap`** и восстановление сессии в `miniAppSessionRecovery` (при 401 на `/api/me`).

Что нужно в **вебапп** (bootstrap / интеграция с ботом):

- `INTEGRATOR_SHARED_SECRET` (или `INTEGRATOR_WEBAPP_ENTRY_SECRET` / `INTEGRATOR_WEBHOOK_SECRET` по вашей схеме), `APP_BASE_URL`.
- В admin Settings задать **`max_bot_api_key`** (совпадает с ключом бота в MAX API для валидации `initData`).

Интегратор по-прежнему использует **`MAX_API_KEY`** в своём env для webhook и исходящих вызовов; webapp читает **`max_bot_api_key`** из БД, а не дублирует `MAX_API_KEY` в env webapp.

Кнопки «открыть приложение» из сценариев используют Telegram-разметку `web_app`; модуль [`deliveryAdapter.ts`](../../apps/integrator/src/integrations/max/deliveryAdapter.ts) преобразует её в кнопку MAX **`open_app`** (не `link`), чтобы не уводить пользователя во внешний браузер. В API уходит **`contact_id`** = числовой `chat_id` получателя (если есть), иначе из meta — для корректного `initData`/логина в мини-приложении.

**Канон miniapp-входа (Telegram + MAX):** в ссылках на webapp используется **`?ctx=bot`** (интегратор добавляет его к базовому URL). Middleware выставляет cookie платформы `bersoncare_platform=bot` и убирает `ctx` из URL; legacy **`?ctx=max`** обрабатывается так же (cookie `bot`, strip). JWT в query (`?t=`) в этих контекстах **не** используется как основной вход — только `initData` и `POST /api/auth/telegram-init` или **`POST /api/auth/max-init`**. После успешного `telegram-init` webapp выставляет ту же platform-cookie `bot`, что и после `max-init`, чтобы клиент не уходил в standalone-ветку. При таймауте/ошибке initData на `/app` показывается сообщение и кнопка **«Повторить»**, без автоматического перехода в телефонный `AuthFlowV2` (см. `docs/ARCHITECTURE/MINIAPP_AUTH_FIX_EXECUTION_LOG.md`). На клиенте `AuthBootstrap` определяет miniapp-контекст по **`useSearchParams()` (Next) и cookie**, а не по «сырому» `window.location`, чтобы не расходиться с URL после redirect.

---

## 5. Краткий чеклист

- [ ] В env интегратора: `MAX_ENABLED=true`, `MAX_API_KEY`, `MAX_WEBHOOK_SECRET` (и при необходимости `MAX_BOT_ID`).
- [ ] Запуск `npx tsx scripts/check-max.ts` — успех (бот отвечает по API).
- [ ] В MAX зарегистрирован webhook: URL = `https://<интегратор>/webhook/max`, `secret` = `MAX_WEBHOOK_SECRET`.
- [ ] В сценариях интегратора для кнопок/ссылок «Открыть приложение» используется тот же генератор подписанного токена, что и для Telegram, с подстановкой `maxId` в `bindings`.
- [ ] В вебапп заданы `INTEGRATOR_*` и `APP_BASE_URL`; для входа по MAX в вебапп при необходимости задать `ALLOWED_MAX_IDS` (список разрешённых max user id через запятую).
- [ ] В admin webapp сохранён **`max_bot_api_key`** (подпись MAX Mini App `initData`), если пользователи открывают приложение из WebView без `?t=...`.

После этого MAX бот подключён к интегратору (webhook + отправка сообщений), а вебапп принимает пользователей из MAX через **`?t=...`** и/или **Mini App `max-init`**.

---

## 6. Smoke-проверка (start → меню → открытие вебапп)

1. В MAX откройте чат с ботом: для приветствия с меню можно отправить `/start` (те же deep link параметры, что у Telegram: `link_*`, `setphone_…`, Rubitime, `noticeme` и т.д. — см. [`INTEGRATOR_TELEGRAM_START_SCRIPTS.md`](../archive/2026-04-initiatives/AUTH_RESTRUCTURE/INTEGRATOR_TELEGRAM_START_SCRIPTS.md)) или дождаться сценария старта; текст **`/menu`** по-прежнему обрабатывается ботом (`mapIn.ts`), но **список команд у бота в UI пустой** — главное меню через инлайн-кнопки под сообщениями.
2. После старта с привязанным номером — **одна строка** inline-кнопок: запись на приём, дневник (WebApp), **Меню** (WebApp на дом). Отдельного развёрнутого блока «ещё» в боте нет; уведомления и прочее — в вебаппе.
3. Нажмите **«Меню»** — сообщение с текстом-подсказкой и кнопкой открытия вебаппа (если в facts задан `links.webappHomeUrl`; иначе шаблон «не настроено»).
4. Откройте вебапп с кнопки — интегратор шлёт кнопку **`open_app`** (поле `web_app` = URL с `?t=...&ctx=bot`), мини-приложение открывается **внутри клиента MAX** с MAX Bridge и `initData` (`POST /api/auth/max-init`). Если пользователь открыл тот же URL как обычную ссылку (`link`) во внешнем браузере — работает только обмен по **`?t=`** (`exchange`), без `initData`.

При ошибках: проверьте логи интегратора (webhook received, pipeline accepted), наличие `links.webappEntryUrl` в facts для MAX (логировать при необходимости) и переменные вебапп `INTEGRATOR_WEBAPP_ENTRY_SECRET` / `APP_BASE_URL`.

Команда **`/show_my_id`** в чате с ботом должна отвечать текстом с user id MAX (шаблон `max:showMyId`, сценарий `max.debug.show_my_id` в контенте интегратора). Если вместо этого приходит «Сообщение отправлено…», см. разбор приоритета сценариев в `docs/ARCHITECTURE/CONTENT_AND_SCRIPTS_FLOW.md`.

---

## 7. Ограничения и следующие задачи

- Для **пересылки сообщений админу** (support relay) в env интегратора обязательно задать `MAX_ADMIN_CHAT_ID` и/или `MAX_ADMIN_USER_ID`. Без этого входящие текстовые сообщения пользователей не пересылаются админу.
- При первом текстовом сообщении пользователя (кроме команд `/start`, `/book`, `/diary`, `/menu` и кнопок меню) автоматически открывается диалог с поддержкой и сообщение уходит админу; последующие сообщения в этом диалоге тоже пересылаются.
- Сейчас для MAX при старте webhook автоматически настраиваются команды бота через `setMyCommands`: **`book`** (запись на приём), **`diary`** (дневник), **`menu`** (главное меню). Команда **`/start`** в это меню не регистрируется — старт остаётся обычным текстом/deep link.
- Это не полный аналог telegram-style menu button: в MAX сейчас основной UX строится на командах бота и inline-кнопках в сообщениях.
- Сейчас для support relay в MAX гарантированно поддерживается только **текст**.
- Если пользователь или администратор отправляет в MAX неподдерживаемый тип сообщения, бот отвечает, что пока поддерживается только текст и пересылка медиа появится позже.
- Сводка отличий сценариев Telegram vs MAX (гэпы, slash, меню), снимок 2026-04: [`docs/archive/2026-04-docs-cleanup/reports/TELEGRAM_VS_MAX_SCENARIOS_2026-04-13.md`](../archive/2026-04-docs-cleanup/reports/TELEGRAM_VS_MAX_SCENARIOS_2026-04-13.md). Матрица возможностей API: [`MAX_CAPABILITY_MATRIX.md`](MAX_CAPABILITY_MATRIX.md).
- Следующий этап:
  - определить типы вложений MAX (`image`, `file`, `audio`, `video`, `sticker`, `contact`, `location`) в webhook;
  - реализовать пересылку медиа через MAX API вместо текущего текстового fallback;
  - отдельно исследовать UX постоянного меню в MAX: сейчас используются inline-кнопки, а не telegram-style reply keyboard/menu button.
