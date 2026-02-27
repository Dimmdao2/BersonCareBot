Задачи по доработке бота:

Вводная техническая инфа:

адрес в веб: http://bersonservices.ru - основной домен, там заглушка nginx (вероятно стоит ее убрать или пока забить ?)

Адрес работающего апи сейчас https://tgcarebot.bersonservices.ruвозвращает в веб {"message":"Route GET:/ not found","error":"Not Found","statusCode":404}

адрес базы данных psql postgresql://tgcarebot:'ПАРОЛЬ'@127.0.0.1:5432/tgcarebot

адрес вебхука для рубитайм: tgcarebot.bersonservices.ru/webhook/rubitime/СЕКРЕТ
Хранение .env на проде: /opt/tgcarebot/
SSH на сервер прода: ssh root@151.241.228.122



1. ВАЖНО!! имеет cмысл сдалать логику приложения максмально чистой - входящее событие ничего не знает о дальнейшей его обработке, только отдает в ядро логики.
2. логика обрабатывает сценарий события , выясняет все , что связано с этим событием: данные о событии и связанных событиях, о юзере, его настройках;понимает, что с этим событием надо сделать. например изменить характеристики юзера, сохранить запись на прием в нашу базу и подготовить исходящее событие (сообщение) юзеру.Для этого отправляет список изменяемых объектов и харакетристик в модуль работы с БД. не зная ничего о самой БД. и отправляет в модуль сообщений / рассылок необходимые сообщения и данные о том кому отправить, когда отправить (в какой мессенджер или провайдер рассылок), как долго пытаться при неудаче.Потом ждет ответ от модуля сообщений и на основании сценариев / настроек (например режим продакшен, девелоп или отладка) решает, что сделать после ( лог / не лог, сообщать ли куда-то еще об успехе доставки, как обработать успех или ошибку отправки).
3. Сейчас уже нужна привязка смс сервиса (smsc)
    1. нужна отправка смс о записи на прием по номеру клиента в случае, если он не привязан к телеграм или не смогли доставить туда сообщение
4. нужны логи сообщений (событий, вебхуков) входящих / исходящих с основной информаций
5. Нужны логи попыток отправки сообщения для ретраев
6. Нужен крон для уведомлений по распианию
7. нужны заглушки (структура папок) для подключения других вебхуков: инстаграм, ватсап, вк, макс, других смс-провайдеров, имэйл сендера, гугл-календарь, яндекс календарь. Возможно стоит разложить по группам по типу сервиса (календарь, мессенджер/бот, провайдер рассылок)
8. Нужен модуль-оркестратор управления событиями:В нем астройки, скрипты событий, и обработчик скриптов который дергает другие модули по заданному сценарию.Продумать структуру для максимальной изоляции внутри модуля - облегчение масштабирования структуры модуля: впоследствии пункты меню и скрипты будут управляться через админку и храниться в базе данных.Изначально:В скрипте определить ключевые триггеры:
    1. поступило cобытие, например сообщение в мессенджер
    2. какое это сообщение:
        1. от админа или нет
        2. /start, 
        3. выбор пункта меню пользователем, 
        4. сообщение в режиме ожидания вопроса (кнопка «задать вопрос»)
        5. неопрделенное сообщение от пользователя
        6. пользователь новый или нет
        7. есть привязка к номеру телефона или нет
        8. есть ли недоставленные сообщения за последние N часов (сделать настройку для времени ретраев)
        9. список актуальных записей на прием
        10. какие выбраны подписки у пользователя
        11. как реагировать
    3. вебхук - тоже событие:
        1. какой источник
        2. привязан ли пользователь (клиент) по номеру в телеграм
        3. надо ли что-то делать еще(писать админу например, писать лог, отправлять сообщения и куда)
        4. есть ли у него уже уведомления об этом событии
9. Скрипты которые нужны уже сейчас:
    1. перенос в эти скрипты текущих уже исполняемых сейчас сценариев. Напрмер реакции на нажатие пунктов меню
    2. если пользователь открывает из рубитайм «получать напоминания в телеграм» (то tсть приходит событие в тг (/rubitime?start=rec_id), при этом у пользователя уже есть такая подписка и он в системе - то вместо того чтобы снова писать стартовое сообщение, бот удаляет последнее сообщение пользователя (/start)
    3. если происходит событии о котором надо уведомить пользователя (запись на прием например), то пробуем доставить сообщение во все подключенные мессенджеры кроме смс, а если их нет или ошибка доставки - отправляем в смс!
    4. Если пользователь пишет сообщение в бота без нажатия кнопки «задать вопрос» надо спросить - вопрос ли это? и если да то отправить админу. если нет - очистить режим ожидания ответа и написать «хорошо, если будут вопросы - обращайтесь»
    5. если пользователь нажимает на кнопку «Мои записи» надо получить из рубитацм список актуальных записей и прислать пользователю очередью сообщений по схеме:1) «запись на такое-то число время» + ссылка на страницу записи2) «запись на такое-то число время» + ссылка на страницу записи…———кнопка «Адрес кабинета» (в разработке)кнопка «Как подготовиться?» (в разработке)
10. вероятно, впоследствии имеет смысл пробразовывать скрипты сценариев в действия из какого-то формата, а не писать это как чистую функцию (если - то). То есть функция должна сверять по скрипту привязку - триггер = последовательность событий.например, выбранный пункт меню это триггер. На него надо ответить сообщением с кнопками (вложенное инлайн меню), или получить список записей на прием и прислать в иде сообщения или кнопок со ссылками на каждую запись, или открыть виджет для записи на прием, или задать вопрос и ждать ответ.В идеале - продумать как сделать переход на универсальную обработку событий постепенным, не будет ли опасно и слишком сложно делать это сразу. Возможно, вначале нужно сделать промежуточный обработчик, который по конкретному триггеру будет выполнять сценарии не через универсальный парсер-обработчик, а пока как набор событий функций «если-то» где все действия уже прописаны в коде триггера.
11. Нужна админка веб и телеграм.
    1. Веб:ПРодумать структуру админки, адрес как ее октрывать, авторизацию (можно временный секрет-токен из бота ТГ пока сделать, без пароля
        1. ОБЗОР:
            1. статистика по количеству юзеров, сколько из них с номером телефона, сколько подписаны на какие рассылки. открыть таблицу
            2. сколько актуальных записей на прием, сколько в истоии, сколько отменены. Открыть расписание
            3. статистика сообщений в разные мессенджеры. доставлено / недоставлено, среднее в день, открыть историю сообщений / ошибокОТДЕЛЬНО ВЫДЕЛИТЬ в статистике ошибки доставки по типу: 
                1. не найден / не привязан мессенджер, но отправлено в смс (низкая вадность)
                2. мессенджер привязан , но ошибка доставки и потому отправлено в смс - важно (чтобы выяснить почему не отправить в мессенджер)
                3. сообщение не доставлено вообще! - неверный номер телефона, нет денег на счету смс провайера, другие ошибки — КРИТИЧНО ВАЖНО
            4. сколько висит недоставленных сообщений - открыть список (с временем попыток / осталось до отмены и количеством попыток)
            5. статистика вебхуков / событий - источник, успешная обработка / ошибка - открыть логи (если лог ошибок, то указано на каком этапе)
            6. стаистика по юзеру: когда зарегистрирован, какие подкдючены каналы, отправленые / полученные сообщения, записи на прием, задано вопросов админу (с указанием источника - тг, макс, вк и тд), 
        2. Списки (таблицы):
            1. таблица юзеров с телефонами, никами, статусом привязан или нет телефон к телеграму, ссылка на историю записей (актуальные и прошедшие / отмененные)
        3. подключенные интеграции и все изменяемые настройки. вынести из env допустимые по безопасности настройки и коннекторы
        4. логи событий 
            1. по типам (вебхуки, сообщения, записи на прием), 
            2. все события по конкретному юзеру
        5. управление настройками
            1. время ретрая для сообщений, в зависимости от типа (новыя запись, напоминание о записи, сообщение пользоватлю от админа, информационная рассылка)
            2. включение и отключение интеграций (календари, провайдеры рассылок, боты в мессенджерах и тд)
            3. хранение веб адресов и секретов для вебхуков
            4. впоследствии - сценарии для вебхуков
        6. отправка сообщения юзеру в выбранный мессенджер или все сразу (телеграм, смс, в дальнейшем макс, ватсап, инстаграм. имэйл)
        7. создание информационных рассылок и управление ими (планировщик, логи, ручное управление адресатами)
    2. Телеграм:меню для админа отличается от меню юзера: две кнопки: веб-админка и тг-админка 
        1. веб-админка - при нажатии ссылка открывает мобильный вид страницы админ-панели
        2. тг админка: при нажатии сообщение со списком команд.Возможности:
            1. посмотреть статистику: сколько юзеров в базе бота, сколько из них с номером телефона, сколько подписаны на какие рассылки
            2. посмотреть список недоставленных сообщений в очереди ретраев для бота - только по сообщениям, которые есть кому отправить (пользователь привязан к номеру телефона или сообщение отправляется на ник / чат_ид
            3. посмотреть список неотвеченных вопросов/сообщений от юзеров телеграм бота с возможностью быстрого ответа
            4. отправка сообщения по нику (напрямую в лс) или по чат_ид ( через бота, с уведомлением админа о доставке/недоставке)

=============================================СТРУКТУРА ТЕКУЩАЯСТРУКТУРА ТЕКУЩАЯ 

### Основное ядро

- **`src/main.ts`**
  - `start()`

- **`src/app/server.ts`**
  - `buildApp()`

- **`src/app/routes.ts`**
  - `registerRoutes(app, deps)`

- **`src/app/di.ts`**
  - `buildDeps()`

- **`src/config/env.ts`**
  - (нет экспортируемых функций, только `env` как результат `zod.parse`)

---

### Telegram-канал

- **`src/integrations/telegram/webhook.ts`**
  - `telegramWebhookRoutes(app, deps)`

- **`src/integrations/telegram/mapIn.ts`**
  - `isNotifyCallback(data)`
  - `fromTelegram(body, context)`

- **`src/integrations/telegram/mapOut.ts`**
  - `toTelegram(actions, api)`

- **`src/integrations/telegram/client.ts`**
  - `getBotInstance()`
  - `createMessagingPort()`

- **`src/integrations/telegram/schema.ts`**
  - `parseWebhookBody(body)`  
    (и схемы Zod)

---

### Домен

- **`src/domain/types.ts`**
  - типы `IncomingUpdate`, `OutgoingAction`, и т.п. (без функций)

- **`src/domain/webhookContent.ts`**
  - тип `WebhookContent`

- **`src/domain/ports/user.ts`**
  - тип `UserPort`

- **`src/domain/ports/notifications.ts`**
  - тип `NotificationsPort`

- **`src/domain/usecases/handleUpdate.ts`**
  - `handleUpdate(incoming, userPort, notificationsPort, content)`

- **`src/domain/usecases/handleMessage.ts`**
  - `handleStart(chatId, telegramId, startText, hasLinkedPhone, userPort, content)`
  - `handleAsk(chatId, telegramId, userPort, content)`
  - `handleQuestion(chatId, telegramId, text, userPort, content, adminForward)`
  - `handleBook(chatId, telegramId, userPort, content)`
  - `handleMore(chatId, content)`
  - `handleDefaultIdle(chatId, content)`

- **`src/domain/usecases/handleCallback.ts`**
  - `handleNotificationCallback(...)`
  - `handleShowNotifications(...)`
  - `handleMyBookings(...)`
  - `handleBack(...)`

- **`src/domain/usecases/onboarding.ts`**
  - `tryConsumeStart(telegramId, userPort)`

- **`src/domain/usecases/notifications.ts`**
  - `getSettings(telegramId, notificationsPort)`
  - `updateSettings(telegramId, patch, notificationsPort)`

- **`src/domain/usecases/linkTelegramByRubitimeRecord.ts`**
  - `linkTelegramByRubitimeRecord(input, deps)`

- **`src/domain/phone.ts`**
  - `normalizePhone(value)`

---

### БД и репозитории

- **`src/db/client.ts`**
  - `healthCheckDb()`
  - `db` (pg-pool клиент)

- **`src/db/migrate.ts`**
  - `runMigrations()` (по коду)

- **`src/db/repos/telegramUsers.ts`**
  - `tryConsumeStart(telegramId)`
  - `tryAdvanceLastUpdateId(telegramId, updateId)`
  - `upsertTelegramUser(from)`
  - `setTelegramUserState(telegramId, state)`
  - `getTelegramUserState(telegramId)`
  - `updateNotificationSettings(telegramId, patch)`
  - `getNotificationSettings(telegramId)`
  - `findByPhone(phoneNormalized)`
  - `getTelegramUserLinkData(telegramId)`
  - `setTelegramUserPhone(telegramId)`
  - `userPort` (объект-реализация `UserPort`)
  - `notificationsPort` (объект-реализация `NotificationsPort`)

- **`src/db/repos/rubitimeRecords.ts`**
  - `upsertRecord(input)`
  - `insertEvent(input)`
  - `getRecordByRubitimeId(rubitimeRecordId)`

---

### Интеграция Rubitime

- **`src/integrations/rubitime/webhook.ts`**
  - `rubitimeWebhookRoutes(app, deps)`

- **`src/integrations/rubitime/reqSuccessEligibility.ts`**
  - `isReqSuccessRecordFresh(recordAt, now, windowMinutes)`
  - `evaluateReqSuccessEligibility(input)`

- **`src/integrations/rubitime/reqSuccessIframe.ts`**
  - `registerRubitimeReqSuccessIframeRoute(app, deps)`

---

### Контент и наблюдаемость

- **`src/content/telegram.ts`**
  - константа `telegramContent` (объект с текстами и клавиатурами)

- **`src/content/index.ts`**
  - `telegramContent` (реэкспорт)

- **`src/observability/logger.ts`**
  - `serializeError(err)`
  - `logger`
  - `getRequestLogger(requestId)`
  - `getWorkerLogger(jobId?, mailingId?)`
  - `getMigrationLogger(version)`

---

### Воркер

- **`src/worker/mailingWorker.ts`**
  - `runMailings()`
  - (внутренние функции: `resetStuckMailings`, `getActiveUsersForTopic`, `markUserInactive`, `logMailingResult`, `wasMailingSent`, `sendTelegramMessage`, `getErrorMessage`)=============================================
АРХИТЕКТУРА:# Архитектура BersonCareBot

Актуальная структура слоёв и потоков данных по состоянию кода.

## Слои

- `app` — сборка приложения, DI, регистрация HTTP-роутов.
- `channels` — адаптер канала Telegram (входящее/исходящее API Telegram).
- `domain` — use cases и внутренние типы действий/апдейтов.
- `db` — клиент PostgreSQL, миграции, репозитории.
- `integrations` — внешние интеграции (Rubitime webhook и iframe endpoint).
- `worker` — фоновая рассылка по подпискам.
- `config` — парсинг и валидация env.
- `observability` — логирование (Pino).
- `content` — тексты и клавиатуры.

## Границы зависимостей

- `domain` не вызывает Telegram API и не знает о Fastify/pg.
- `integrations/telegram` вызывает `domain` use cases и исполняет `OutgoingAction[]` через Telegram API.
- `integrations/rubitime` не идёт через `domain`; это отдельный интеграционный orchestrator:
  - валидирует webhook,
  - пишет события/срез в БД,
  - пытается отправить уведомление в Telegram,
  - fallback в SMS.
- `app/routes.ts` связывает всё вместе через DI.

## Ключевые маршруты

- `GET /health`
- `POST /webhook/telegram`
- `POST /webhook/rubitime/:token`
- `GET /api/rubitime?record_success=<record_id>`

## Поток: Telegram webhook

1. `app/routes.ts` регистрирует `telegramWebhookRoutes(...)`.
2. `integrations/telegram/webhook.ts`:
   - проверка `TG_WEBHOOK_SECRET` (если задан),
   - валидация body (`schema.ts`),
   - upsert пользователя + dedup по `update_id`,
   - map во внутренний формат (`mapIn.ts`).
3. `domain/usecases/handleUpdate.ts` возвращает `OutgoingAction[]`.
4. `integrations/telegram/mapOut.ts` исполняет actions через `grammY` API.
5. Ответ `200` (включая обработанные ошибки, чтобы не провоцировать лишние ретраи Telegram).

### Отдельная ветка в Telegram webhook

Для `/start <record_id>` + `contact` выполняется linking use case:

- `domain/usecases/linkTelegramByRubitimeRecord.ts`
- зависимости приходят из `integrations/telegram/webhook.ts` (repo-методы через DI).

## Поток: Rubitime webhook

1. `app/routes.ts` регистрирует `rubitimeWebhookRoutes(...)`.
2. `integrations/rubitime/webhook.ts`:
   - принимает только `POST /webhook/rubitime/:token`,
   - проверяет token из path (`params.token`),
   - валидирует payload (`parseRubitimeBody`),
   - сохраняет `rubitime_events` и upsert в `rubitime_records`.
3. Ищет Telegram пользователя по `phone_normalized`.
4. Если пользователь найден — отправляет сообщение в Telegram.
5. Если не найден/нет телефона/ошибка отправки в Telegram — вызывает `smsClient.sendSms(...)`.
6. Для валидного запроса всегда отвечает `200`, при неверном токене `403`, при невалидном body `400`.

## Поток: iframe endpoint Rubitime

`GET /api/rubitime?record_success=<record_id>`:

- проверка rate limits (IP + global),
- искусственная задержка,
- проверка свежести записи и наличия Telegram-привязки,
- возврат HTML:
  - `''` (кнопку не показывать),
  - или кнопка deep link на `t.me/bersoncarebot?start=<record_id>`.

## Воркер рассылок

`worker/mailingWorker.ts`:

- подбирает `mailings` в статусе `scheduled`,
- переводит в `processing`,
- рассылает по активным подпискам (`user_subscriptions`),
- пишет результат в `mailing_logs`,
- отмечает блокировки бота (`403`) как `telegram_users.is_active=false`,
- завершает `completed` или `failed`,
- имеет reset зависших `processing`.

## Логи

- Fastify request logs (`incoming request`, `request completed`).
- App logger (`observability/logger.ts`): `getRequestLogger`, `getWorkerLogger`, `getMigrationLogger`.
- Telegram webhook: `tg_update`, validation warnings, send errors.
- Rubitime webhook: validation warnings, notify errors, data warnings.
- Worker: batch start/completion, retry, per-user send status, failures.

=============================================РИДМИ ФАЙЛ
# BersonCareBot

Telegram-бот и backend для обработки webhook-событий, уведомлений клиентов и интеграции с Rubitime.

- Стек: TypeScript (ESM), Fastify, PostgreSQL, grammY, Vitest
- Каналы: Telegram webhook + Rubitime webhook
- Инфраструктура: systemd, GitHub Actions (deploy)

Архитектура и потоки: `ARCHITECTURE.md`.

## Быстрый старт

```bash
pnpm install
cp .env.example .env
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
pnpm run dev
```

Продакшен-запуск: `pnpm start` (после `pnpm run build`).

## Переменные окружения

Источник истины: `src/config/env.ts`. Пример: `.env.example`.

Обязательные ключи:

- `BOT_TOKEN`
- `ADMIN_TELEGRAM_ID`
- `INBOX_CHAT_ID`
- `BOOKING_URL`
- `DATABASE_URL`
- `RUBITIME_WEBHOOK_TOKEN`

Часто используемые опциональные:

- `TG_WEBHOOK_SECRET`
- `HOST`, `PORT`, `LOG_LEVEL`, `NODE_ENV`
- `RUBITIME_REQSUCCESS_*` (настройки iframe-проверки)

## Скрипты

| Команда | Назначение |
|---|---|
| `pnpm run dev` | Запуск в режиме разработки |
| `pnpm run build` | Сборка в `dist/` |
| `pnpm start` | Запуск собранного приложения |
| `pnpm run typecheck` | Проверка типов |
| `pnpm run lint` | ESLint |
| `pnpm test` | Основной набор тестов |
| `pnpm run test:e2e` | E2E webhook-сценарии (`RUN_E2E_TESTS=true`) |
| `pnpm run migrate` | Применение SQL-миграций |
| `pnpm run scenarios` | Отдельный сценарный прогон webhook-фикстур |

## API

- `GET /health`
- `POST /webhook/telegram`
- `POST /webhook/rubitime/:token`
- `GET /api/rubitime?record_success=<record_id>`

## Деплой

Типовой путь на сервере: `/opt/tgcarebot` (`.env` рядом с приложением).  
Сервис systemd: `tgcarebot`.

Полезные команды:

```bash
sudo systemctl restart tgcarebot
sudo systemctl status tgcarebot
journalctl -u tgcarebot -n 100 --no-pager
```


## ROADMAP ИЗОЛЯЦИИ И ДОРАБОТКИ (КАНОНИЧЕСКИЙ)

Источник истины для реализации. Любые новые задачи добавляются только сюда.

### Правила выполнения (обязательно)

1. Один шаг = один атомарный коммит.
2. Перед каждым коммитом обязательный прогон:
   - `pnpm run typecheck`
   - `pnpm run lint`
   - `pnpm test`
3. После завершения шага обновить этот файл:
   - отметить статус шага (`[x]` или `[ ]`);
   - добавить короткую запись в журнал выполнения внизу.
4. Нельзя начинать следующий шаг, если предыдущий не зеленый по тестам.
5. В домен не импортируем SDK интеграций (Telegram/VK/etc), только унифицированные сущности.

### Базовые сущности (фиксируем)

- `IncomingEvent` — входящее событие из любого коннектора.
- `OutgoingEvent` — исходящее событие для отправки в один или несколько коннекторов.
- `DbReadQuery` — унифицированный запрос чтения в БД.
- `DbWriteMutation` — унифицированная мутация записи в БД.

### Классификация интеграций (фиксируем)

- Все внешние адаптеры лежат в `src/integrations/*` (без отдельной папки `channels`).
- Каждая интеграция имеет `kind`:
  - `messenger` — Telegram/VK/Max/WhatsApp и другие каналы общения с пользователем.
  - `system` — Rubitime/Google Calendar/Yandex Calendar и другие бизнес-системы.
  - `provider` — SMS/email/иные провайдеры доставки.
- Для всех `kind` единый контракт: входящие `IncomingEvent` и исходящие `OutgoingEvent`.

### Событийная модель (версия 1)

- Типы `IncomingEvent.type`:
  - `message.received`
  - `callback.received`
  - `webhook.received`
  - `schedule.tick`
  - `admin.command`
- Типы `OutgoingEvent.type`:
  - `message.send`
  - `booking.changed`
  - `integration.sync`
  - `audit.log` (опционально, можно оставить обычным логом)
- Типы `DbReadQuery.type`:
  - `user.byTelegramId`
  - `user.byPhone`
  - `booking.byRubitimeId`
  - `booking.activeByUser`
  - `delivery.pending`
- Типы `DbWriteMutation.type`:
  - `user.upsert`
  - `user.state.set`
  - `user.phone.link`
  - `booking.upsert`
  - `delivery.attempt.log`
  - `event.log`

### Порядок шагов (без лишних переделок)

- [x] Шаг 0. Контрактный каркас (без изменения поведения)
  - Добавить TS + zod контракты: `IncomingEvent`, `OutgoingEvent`, `DbReadQuery`, `DbWriteMutation`.
  - Ввести интерфейсы ядра: `orchestrate`, `readDb`, `writeDb`, `dispatchOutgoing`.
  - Поведение существующих роутов не менять.
  - Критерий завершения: проект собирается, тесты зеленые, контракты доступны для дальнейшей миграции.

- [x] Шаг 1. Логирование и безопасность (pino + redaction)
  - Настроить redaction секретов/PII в логах.
  - Добавить correlation id/event id по цепочке обработки.
  - Критерий завершения: в логах нет токенов/секретов/полных телефонов.

- [x] Шаг 2. Telegram как чистый inbound/outbound connector
  - Telegram webhook только мапит в `IncomingEvent`.
  - Telegram sender только исполняет `OutgoingEvent(type=message.send)`.
  - Критерий завершения: Telegram не содержит доменной логики fallback/маршрутизации.

- [x] Шаг 3. Rubitime как чистый inbound connector
  - Rubitime webhook только принимает/валидирует/мапит во `IncomingEvent`.
  - Решения по маршрутизации уведомлений — только в оркестраторе.
  - Критерий завершения: Rubitime не знает про Telegram/SMS напрямую.

- [ ] Шаг 4. Orchestrator v1 (поведение 1:1 с текущим)
  - Перенести текущие сценарии без изменения бизнес-поведения.
  - Возвращать список `DbReadQuery`, `DbWriteMutation`, `OutgoingEvent`.
  - Критерий завершения: fixture-тесты текущих сценариев совпадают.

- [ ] Шаг 5. Dispatcher исходящих событий + fallback policy
  - Реализовать маршрутизацию `OutgoingEvent(message.send)` в коннекторы.
  - Доменные правила fallback (например Telegram -> SMS).
  - Критерий завершения: fallback определяется в домене, а не в коннекторах.

- [ ] Шаг 6. Ретраи доставки и журнал попыток
  - Добавить policy ретраев (`p-retry` или эквивалент) для временных ошибок.
  - Логировать попытки и причины фатальных отказов.
  - Критерий завершения: видны причины недоставки и история попыток.

- [ ] Шаг 7. Cron/планировщик как `IncomingEvent(schedule.tick)`
  - Планировщик генерирует входящее событие в оркестратор.
  - Критерий завершения: scheduler не ходит напрямую в каналы.

- [ ] Шаг 8. Заглушки и SDK для будущих коннекторов
  - Добавить шаблоны коннекторов: VK/Max/Instagram/Email/Calendar.
  - Использовать SDK/официальные клиенты там, где они есть.
  - Критерий завершения: каждый новый коннектор — только адаптер.

- [ ] Шаг 9. Админка (после стабилизации событийной модели)
  - Сначала read-only метрики и логи.
  - Потом управление настройками/интеграциями/ретраями.
  - Критерий завершения: админка управляет конфигом через API, не обходя оркестратор.

### Журнал выполнения

- 2026-02-27: Рабочее дерево приведено к состоянию последнего коммита (с сохранением `PLAN.md`).
- 2026-02-27: Добавлен канонический roadmap с фиксированными правилами выполнения и критериями завершения.
- 2026-02-27: Завершен Шаг 0 — добавлен контрактный слой `IncomingEvent`/`OutgoingEvent`/`DbReadQuery`/`DbWriteMutation`, `zod` схемы и интерфейсы оркестрации без изменения поведения runtime.
- 2026-02-27: Завершен Шаг 1 — включен pino redaction для чувствительных полей и добавлены `correlationId`/`eventId` в цепочку webhook-логов.
- 2026-02-27: Завершен Шаг 2 — Telegram webhook и sender переведены на connector-адаптер (`IncomingEvent`/`OutgoingEvent`) без изменения текущей доменной логики.
- 2026-02-27: Завершен Шаг 3 — Rubitime webhook стал inbound-коннектором (валидация + маппинг + запуск оркестрации), отправка и fallback вынесены в dispatch-зависимость.
- 2026-02-27: Для Шага 4 добавлен `orchestrateIncomingEvent` (пока покрывает Rubitime-сценарий; перенос Telegram-сценариев в оркестратор остается отдельной подзадачей).
- 2026-02-27: Шаг 4 расширен — Telegram main-path теперь также проходит через `orchestrateIncomingEventWithDeps`; перенос ветки linking `/start <record>` и полное покрытие read/write-списками еще в работе.
- 2026-02-27: Для Шагов 5/6 добавлен `messageByPhone` dispatcher с retry policy (`p-retry`) и логированием fallback/ошибок; пока задействован в Rubitime-потоке.
- 2026-02-27: Подготовлен реальный SMSC-коннектор (`SMSC_ENABLED`, `SMSC_API_KEY`, `SMSC_API_BASE_URL`) с безопасным fallback на stub; ключи хранятся только в env.
- 2026-02-27: Структура выровнена: Telegram перенесен из `src/channels/telegram` в `src/integrations/telegram`, слой `channels` удален.
- 2026-02-27: Добавлен реестр интеграций и дескрипторы `kind` (`messenger/system/provider`) в `src/integrations/*` без изменения runtime-логики.
- 2026-02-27: Реестр интеграций подключен в runtime (`buildApp`) как единый источник структуры подключенных коннекторов.
- 2026-02-27: Ветка linking Telegram (`await_contact:rubitime_record:*`) перенесена из `telegram/webhook` в `orchestrateIncomingEventWithDeps`; webhook стал тоньше и единообразнее.
- 2026-02-27: В orchestrator для Telegram linking добавлен явный trace `DbReadQuery/DbWriteMutation` (booking/user reads, user.state.set, user.phone.link) без изменения фактического поведения.

