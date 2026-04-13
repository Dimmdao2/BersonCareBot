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

Вебапп **не** заводит отдельный «MAX токен» (как отдельный TELEGRAM_BOT_TOKEN). Вход из MAX идёт так же, как из Telegram:

1. Пользователь в MAX нажимает кнопку/ссылку «Открыть приложение».
2. Интегратор формирует подписанную ссылку на вебапп с параметром `?t=<signed-token>` (тот же механизм, что и для Telegram).
3. В payload токена интегратор передаёт привязку к каналу MAX: `bindings.maxId`.
4. Вебапп по приходу на `/app?t=...` вызывает `POST /api/auth/exchange`, создаёт сессию и при необходимости привязывает `maxId` к пользователю.

Что нужно в **вебапп**:

- Те же переменные, что и для Telegram: `INTEGRATOR_SHARED_SECRET` (или отдельные `INTEGRATOR_WEBAPP_ENTRY_SECRET` / `INTEGRATOR_WEBHOOK_SECRET`), `APP_BASE_URL`.
- Дополнительных MAX-специфичных ключей в вебапп не требуется.

То есть: **подключение MAX к вебапп** = корректная выдача интегратором ссылок с `?t=...` при действиях пользователя в MAX и одинаковые настройки интегратора/вебапп (секреты, APP_BASE_URL).

---

## 5. Краткий чеклист

- [ ] В env интегратора: `MAX_ENABLED=true`, `MAX_API_KEY`, `MAX_WEBHOOK_SECRET` (и при необходимости `MAX_BOT_ID`).
- [ ] Запуск `npx tsx scripts/check-max.ts` — успех (бот отвечает по API).
- [ ] В MAX зарегистрирован webhook: URL = `https://<интегратор>/webhook/max`, `secret` = `MAX_WEBHOOK_SECRET`.
- [ ] В сценариях интегратора для кнопок/ссылок «Открыть приложение» используется тот же генератор подписанного токена, что и для Telegram, с подстановкой `maxId` в `bindings`.
- [ ] В вебапп заданы `INTEGRATOR_*` и `APP_BASE_URL`; для входа по MAX в вебапп при необходимости задать `ALLOWED_MAX_IDS` (список разрешённых max user id через запятую).

После этого MAX бот подключён к интегратору (webhook + отправка сообщений), а вебапп принимает пользователей из MAX через общий механизм `?t=...`.

---

## 6. Smoke-проверка (start → меню → открытие вебапп)

1. В MAX откройте чат с ботом: для приветствия с меню можно отправить `/start` (deep link `link_*` и т.п.) или дождаться сценария старта; команда **`/menu`** в списке команд бота открывает то же главное меню (как reply-меню в Telegram).
2. Должно прийти сообщение с inline-меню: в первом ряду — запись на приём, дневник, «ещё»; ниже — пункты из раздела «ещё» (скорая помощь, персональный помощник, уроки, мои записи, уведомления).
3. Нажмите «Персональный помощник» — должно прийти сообщение с кнопкой «Открыть приложение» (если интегратор настроен: `APP_BASE_URL`, entry secret).
4. Нажмите «Открыть приложение» — откроется браузер с `APP_BASE_URL/app?t=...`; вебапп выполнит обмен токена и создаст сессию (при заданном `ALLOWED_MAX_IDS` в вебапп или без whitelist в dev).

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
- Сводка отличий сценариев Telegram vs MAX (гэпы, slash, меню): [`docs/REPORTS/TELEGRAM_VS_MAX_SCENARIOS_2026-04-13.md`](../REPORTS/TELEGRAM_VS_MAX_SCENARIOS_2026-04-13.md). Матрица возможностей API: [`MAX_CAPABILITY_MATRIX.md`](MAX_CAPABILITY_MATRIX.md).
- Следующий этап:
  - сценарий под callback **`notifications.show`** в меню «ещё» или временное снятие кнопки, пока сценария нет;
  - определить типы вложений MAX (`image`, `file`, `audio`, `video`, `sticker`, `contact`, `location`) в webhook;
  - реализовать пересылку медиа через MAX API вместо текущего текстового fallback;
  - отдельно исследовать UX постоянного меню в MAX: сейчас используются inline-кнопки, а не telegram-style reply keyboard/menu button.
