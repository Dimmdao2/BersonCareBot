Задачи по доработке бота:

## Каноничная целевая архитектура (V2)

Эта схема — источник истины для дальнейшей проработки и реализации:

- `src/app` — технический слой (server/di/routes).
- `src/kernel` — ядро:
  - `contracts` (`events`, `steps`, `scripts`, `ports`);
  - `eventGateway` (`handleIncoming`, `dedup`, `rateLimit`);
  - `orchestrator` (`resolver`, `runner`, `policies`, `scripts`);
  - `domain` (`executeStep`, `actions`, `services`, `state`).
- `src/infra` — инфраструктура:
  - `db`, `dispatch`, `queue`, `runtime`, `observability`.
- `src/edges` — внешние входы/выходы:
  - `integrations/telegram/*`,
  - `integrations/rubitime/*`, `integrations/smsc/*`, и др.
- `src/config` — конфигурация окружения.
- `src/content` — контент отдельно (если используется; сейчас не выделен).

### Входной pipeline (обязательный)

`edge webhook/ingress -> auth/validate/map -> IncomingEvent -> kernel/eventGateway -> dedup -> orchestrator -> domain.executeStep(step, ctx) -> StepResult -> orchestrator next step`

### Роли

- Центр потока: `kernel/orchestrator`.
- Центр бизнес-правил: `kernel/domain`.

### Роутинг (целевой)

- `POST /webhook/telegram` -> `edges/integrations/telegram/webhook.ts`
- `POST /webhook/rubitime/:token` -> `edges/integrations/rubitime/webhook.ts`
- `GET /api/rubitime?record_success=<id>` -> `edges/integrations/rubitime/reqSuccessIframe.ts`
- `GET /health` -> app/infra health check

### Ограничения слоев (обязательно)

Разрешено:
- `app -> kernel + infra + edges`
- `edges -> kernel/contracts + kernel/eventGateway`
- `kernel/eventGateway -> kernel/contracts + kernel/orchestrator`
- `kernel/orchestrator -> kernel/contracts + kernel/domain`
- `kernel/domain -> kernel/contracts + ports`
- `infra -> ports + kernel/contracts`

Запрещено:
- `edges -> infra/db/*`
- `kernel/** -> fastify|pg|grammy|http sdk`
- `app/routes -> infra/db/repos` напрямую
- `edges -> kernel/orchestrator` напрямую (только через gateway)

### Миграция: текущий статус (ветка `dev/isolation-step1`)

- Миграция выполнена в `src/*`, прежний runtime перенесен в `___src__old`.
- Перенесены 1:1 стабильные слои: `observability`, `domain/contracts`, `domain/ports`, `db/repos`, `integrations/{telegram,rubitime,smsc}` (без webhook handlers и без переключения потока).
- Контент Telegram перенесен в интеграционный слой: `src/integrations/telegram/content.ts`.
- Добавлены комментарии к перенесенным файлам и ключевым функциям.
- Зафиксировано правило: центр потока — `orchestrator`, центр бизнес-правил — `domain`.
- Добавлен каркас `eventGateway` в домене:
  - `src/domain/eventGateway.ts`
  - `src/domain/index.ts`
  - расширены контракты `EventGateway` в `src/domain/contracts/*`
- Начата миграция к V2-слоям:
  - добавлен `src/kernel/*` (contracts/eventGateway/orchestrator/domain каркас),
  - добавлены `src/infra/*` и `src/edges/*` как совместимые фасады,
  - `src/app/di.ts` переключен на `kernel` контракты и `infra/edges` импорты.
- Подключены edge handlers:
  - `src/edges/integrations/telegram/webhook.ts` (auth/validate/map -> eventGateway),
  - `src/edges/integrations/rubitime/webhook.ts` (auth/validate/map -> eventGateway),
  - `src/app/di.ts` теперь регистрирует Telegram/Rubitime handlers по умолчанию.
- `GET /api/rubitime` подключен через edge-слой:
  - `src/edges/integrations/rubitime/reqSuccessIframe.ts` собирает зависимости и регистрирует route,
  - `src/app/di.ts` использует edge-регистратор iframe route по умолчанию.
- Подключен реальный `kernel/orchestrator` в `app/di` (без `noop`):
  - `src/app/di.ts` теперь использует `createOrchestrator()` по умолчанию.
- Реализован первый рабочий контур исполнения шага:
  - `resolver` формирует базовый шаг `event.log`,
  - `runner` вызывает `domain.executeStep` последовательно,
  - `domain.executeStep` для `event.log` возвращает `DbWriteMutation(type=event.log)`.
- Введен `action-registry` в `kernel/domain/actions`:
  - подключены обработчики `event.log`, `booking.upsert`, `message.send`,
  - `domain.executeStep` исполняет шаги через registry.
- Расширен `resolver` для Rubitime webhook:
  - добавляет шаги `booking.upsert` и `message.send` (если достаточно данных в payload).
- Подключены default `infra` порты в `app/di`:
  - `DbWritePort` -> `src/infra/db/writePort.ts` (маппинг `DbWriteMutation` в репозитории),
  - `DispatchPort` -> `src/infra/dispatch/default.ts` (SMSC dispatch + warning для неподключенного Telegram outbound),
  - `IdempotencyPort` -> `src/infra/db/repos/idempotencyKeys.ts` (in-memory dedup).
- Формализован Шаг 5/6 (первый рабочий контур):
  - `kernel/domain/executeStep` нормализует `message.send` шаги и задает domain-level fallback policy (`delivery.channels`, `delivery.maxAttempts`),
  - `infra/dispatch/default.ts` исполняет единый pipeline `channels -> retry -> fallback`,
  - каждая попытка доставки пишет `DbWriteMutation(type=delivery.attempt.log)`.
- Выполнен следующий этап:
  - подключен реальный Telegram outbound adapter в dispatch pipeline (через `integrations/telegram/client`),
  - `delivery.attempt.log` сохраняется в persistent storage (`delivery_attempt_logs`) через `infra/db/repos/messageLogs.ts`,
  - добавлена миграция `migrations/010_add_delivery_attempt_logs.sql`.
- Выполнен следующий этап:
  - `infra/runtime/scheduler.ts` формирует канонический `IncomingEvent(schedule.tick)` через `buildScheduleTickEvent`,
  - `infra/runtime/worker.ts` добавлен `runWorkerTask`, который конвертирует worker task (`schedule.tick`/`retry.delivery`) в `IncomingEvent(schedule.tick)` и отправляет его только в `eventGateway`.
- Выполнен следующий этап:
  - добавлен единый шаблон edge-интеграций (`inbound/outbound + descriptor`) в `src/edges/integrations/template.ts`,
  - добавлены заглушки будущих коннекторов: `VK`, `Max`, `Instagram`, `Email`, `Calendar` в `src/edges/integrations/*/index.ts`,
  - `src/edges/registry.ts` расширен этими коннекторами для единого каталога интеграций.
- Выполнен следующий этап:
  - удалены совместимые фасады `src/domain/contracts/*`, `src/domain/eventGateway.ts`, `src/domain/index.ts`,
  - импорты интеграционных коннекторов переведены с `domain/contracts` на `kernel/contracts`.
- Выполнен следующий этап:
  - завершена структурная нормализация (`Шаг 10`): remaining зависимости на `src/domain/types|ports` убраны, типы/порты перенесены в `kernel/domain/*`, legacy `src/domain/*` удален.
- Текущее состояние: плановые шаги 5-10 закрыты; ветка готова к финальному ревью/коммиту.
- 2026-02-27: Выполнен финальный перенос в основном runtime (`src/*`): `src/domain` полностью перенесен в `src/kernel` (contracts + domain/usecases/types/ports), legacy `src/domain` удален, импорты переключены на `src/kernel/*`, проверки `typecheck`, `lint`, `test` зеленые.

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

=============================================СТРУКТУРА ТЕКУЩАЯ

### Актуальная структура (V2, март 2026)

- `src/app` — server/di/routes.
- `src/kernel` — contracts/eventGateway/orchestrator/domain.
- `src/infra` — db/dispatch/queue/runtime/observability.
- `src/edges` — integrations/*.
- `src/app/config` — env-конфигурация.
- `src/integrations` — переходный слой (реализации SDK/мэппинг), пока используется `edges`/`infra`.
- `src/observability` — удалено; используется `src/infra/observability`.
- `src/orchestrator` — удалено.
- `___src__old` — архив прежнего runtime.

### Поток данных (V2)

`edge webhook/ingress -> auth/validate/map -> IncomingEvent -> kernel/eventGateway -> orchestrator -> domain.executeStep -> infra(db/dispatch)`

### Границы зависимостей (V2)

- `edges -> kernel/contracts + kernel/eventGateway`
- `kernel/orchestrator -> kernel/domain`
- `infra -> kernel/contracts + ports`

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
- App logger (`infra/observability/logger.ts`): `getRequestLogger`, `getWorkerLogger`, `getMigrationLogger`.
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
6. Целевая структура папок: `src/app`, `src/kernel`, `src/infra`, `src/edges` (без смешивания сценариев и адаптеров).

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

- [x] Шаг 4. Orchestrator v1 (поведение 1:1 с текущим)
  - Перенести текущие сценарии без изменения бизнес-поведения.
  - Возвращать список `DbReadQuery`, `DbWriteMutation`, `OutgoingEvent`.
  - Критерий завершения: fixture-тесты текущих сценариев совпадают.

- [x] Шаг 5. Dispatcher исходящих событий + fallback policy
  - Реализовать маршрутизацию `OutgoingEvent(message.send)` в коннекторы.
  - Доменные правила fallback (например Telegram -> SMS).
  - Критерий завершения: fallback определяется в домене, а не в коннекторах.

- [x] Шаг 6. Ретраи доставки и журнал попыток
  - Добавить policy ретраев (`p-retry` или эквивалент) для временных ошибок.
  - Логировать попытки и причины фатальных отказов.
  - Критерий завершения: видны причины недоставки и история попыток.

- [x] Шаг 7. Cron/планировщик как `IncomingEvent(schedule.tick)`
  - Планировщик генерирует входящее событие в оркестратор.
  - Критерий завершения: scheduler не ходит напрямую в каналы.

- [x] Шаг 8. Заглушки и SDK для будущих коннекторов
  - Добавить шаблоны коннекторов: VK/Max/Instagram/Email/Calendar.
  - Использовать SDK/официальные клиенты там, где они есть.
  - Критерий завершения: каждый новый коннектор — только адаптер.

- [x] Шаг 9. Админка (после стабилизации событийной модели)
  - Сначала read-only метрики и логи.
  - Потом управление настройками/интеграциями/ретраями.
  - Критерий завершения: админка управляет конфигом через API, не обходя оркестратор.

- [x] Шаг 10. Структурная нормализация каталогов (без изменения поведения)
  - Убрать смешивание сценариев и интеграционных адаптеров по папкам.
  - Перенести orchestration-сценарии в `src/orchestrator`, контракты в `src/ports`.
  - Оставить в `src/integrations` только connector-слой (inbound/outbound mapping + SDK).
  - Критерий завершения: путь обработки соответствует канону `incoming -> middleware -> router -> orchestrator -> domain -> db/dispatch`.

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
- 2026-02-27: Добавлены целевые unit-тесты `orchestrateIncomingEventWithDeps` для Telegram linking (успешная привязка и ветка без контакта с возвратом в `idle`).
- 2026-02-27: Для Telegram main-path добавлены tracing-обертки `userPort/notificationsPort`, чтобы `orchestrateIncomingEventWithDeps` возвращал `DbReadQuery/DbWriteMutation` и для обычных сценариев меню/коллбэков.
- 2026-02-27: Добавлен fixture-driven тест `webhook.fixtures.test.ts` (01..13 Telegram fixtures) c mocked deps для проверки, что сценарии обрабатываются 1:1 и dispatch-форма не деградирует.
- 2026-02-27: Шаг 4 отмечен завершенным: Telegram/Rubitime сценарии проходят через orchestrator, DB traces (`reads/writes`) возвращаются, добавлено целевое покрытие (unit + fixture-driven).
- 2026-02-27: Начат формальный Шаг 5/6 — вынесен единый `OutgoingEvent` dispatcher (`createOutgoingEventDispatcher`) и подключен в Rubitime webhook, добавлены unit-тесты маршрутизации.
- 2026-02-27: Единый `OutgoingEvent` dispatcher расширен и на Telegram (`message.send`), Telegram webhook отправляет исходящие события через общий pipeline.
- 2026-02-27: Для `messageByPhone` dispatcher добавлена классификация причин отказа (`permanent/retry_exhausted`) и детализированное retry/fallback логирование; добавлены unit-тесты fallback/retry-сценариев.
- 2026-02-27: `ARCHITECTURE.md` обновлен до канонического pipeline и целевой структуры папок (`domain/db/orchestrator/ports/integrations`) как обязательного направления миграции.
- 2026-02-27: Начат Шаг 10 (структурная нормализация): добавлены целевые entrypoint-слои `src/orchestrator` и `src/ports`, интеграции переведены на новые импорты без изменения runtime-поведения.

