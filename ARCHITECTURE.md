# Архитектура BersonCareBot

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
- `channels/telegram` вызывает `domain` use cases и исполняет `OutgoingAction[]` через Telegram API.
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
2. `channels/telegram/webhook.ts`:
   - проверка `TG_WEBHOOK_SECRET` (если задан),
   - валидация body (`schema.ts`),
   - upsert пользователя + dedup по `update_id`,
   - map во внутренний формат (`mapIn.ts`).
3. `domain/usecases/handleUpdate.ts` возвращает `OutgoingAction[]`.
4. `channels/telegram/mapOut.ts` исполняет actions через `grammY` API.
5. Ответ `200` (включая обработанные ошибки, чтобы не провоцировать лишние ретраи Telegram).

### Отдельная ветка в Telegram webhook

Для `/start <record_id>` + `contact` выполняется linking use case:

- `domain/usecases/linkTelegramByRubitimeRecord.ts`
- зависимости приходят из `channels/telegram/webhook.ts` (repo-методы через DI).

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
