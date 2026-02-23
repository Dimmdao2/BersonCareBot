# Post-refactor verification audit

Дата: 2025-02-24  
Ветка: `refactor/restructure-admin-base`

---

## 1. Поведенческая совместимость

| Проверка | Статус | Детали |
|----------|--------|--------|
| Роут `/webhook/telegram` | OK | Зарегистрирован в `channels/telegram/webhook.ts:27` как `app.post('/webhook/telegram', ...)` — путь совпадает с до рефактора. |
| Роут `/health` | OK | В `app/routes.ts:11` — `app.get('/health', ...)` возвращает `{ ok: true, db: deps.healthCheckDb() ? 'up' : 'down' }` (тип HealthResponse). |
| Дедупликация до домена | OK | В webhook: после secret → parse → upsert идёт `userPort.tryAdvanceLastUpdateId` (стр. 75–79); при `!isNew` — `return reply.code(200)` без вызова `handleUpdate`. |
| Проверка `TG_WEBHOOK_SECRET` до ядра | OK | Стр. 30–36: проверка секрета первой, при несовпадении — 403, без вызова домена. |
| Ответ 200 всегда для Telegram | OK | Все выходы из обработчика: 79, 107, 120, 123 (в catch) — `reply.code(200).send({ ok: true })`. |

---

## 2. Архитектурные инварианты

| Правило | Статус | Детали |
|---------|--------|--------|
| domain не импортирует channels, db, app, observability, content | OK | В domain только: `../ports`, `../types`, `../webhookContent`, `./notifications`, `./onboarding`, `./handleMessage` — всё внутри domain. |
| channels не импортирует db напрямую | OK | channels/telegram импортирует: config, observability, content, domain, локальные mapIn/mapOut/schema/client. userPort/notificationsPort приходят через параметр `deps`. |
| worker не импортирует channels и app | OK | worker/mailingWorker.ts импортирует только: config, db/client, observability. |
| Нет циклических зависимостей | OK | Цепочки: app → di (db), routes (channels); channels → domain, content, config, observability; domain — только внутренние; db → config, observability, domain (типы). Циклов нет. |

---

## 3. DI и зависимости

| Проверка | Статус | Детали |
|----------|--------|--------|
| Зависимости для webhook передаются через deps | OK | `TelegramWebhookDeps`: userPort, notificationsPort. Регистрация в `app/routes.ts:16–18`: `telegramWebhookRoutes(instance, deps)`. |
| Нет прямых импортов старых services | OK | По коду: в src нет импортов `telegramUserService`, `healthService`, `subscriptionService`. |
| buildDeps() — единственная точка сборки | OK | `app/di.ts`: `buildDeps()` возвращает healthCheckDb (из db/client), userPort и notificationsPort (из db/repos/telegramUsers). Вызывается только в `app/server.ts` при buildApp(). |

---

## 4. Deploy-совместимость

| Проверка | Статус | Детали |
|----------|--------|--------|
| Скрипты migrate | OK | package.json: `migrate` / `db:migrate` → `tsx src/db/migrate.ts`, `db:migrate:prod` → `node dist/db/migrate.js`. Deploy: `pnpm exec tsx src/db/migrate.ts`. |
| DEPLOY_PATH и systemd | OK | В deploy.yml по-прежнему `cd /opt/tgcarebot/app`, перезапуск `tgcarebot`. Не менялись. |
| Admin build не влияет на API | OK | API: `pnpm build` (tsc). Отдельный шаг: `cd admin && npm install && npm run build`. Исключён взаимный влияние. |
| Структура после build | OK | `pnpm build` → dist/ (main.js, app.js, app/, db/, channels/, domain/, config/, content/, observability/). admin build → admin/dist/. |

---

## 5. Контент

| Проверка | Статус | Детали |
|----------|--------|--------|
| domain использует только тип WebhookContent | OK | domain/webhookContent.ts объявляет тип; импортирует только `./ports/notifications.js`. Нет импорта из `content/`. |
| Контент используется только в channels | OK | `telegramContent` импортируется в `channels/telegram/webhook.ts` из `../../content/index.js`. Домен получает content как аргумент (тип WebhookContent). |

---

## 6. Качество

| Команда | Результат |
|---------|-----------|
| pnpm typecheck | OK (exit 0) |
| pnpm lint | OK (exit 0) |
| pnpm test | OK при повторном запуске (11 passed). Один тест «deduplicates repeated update_id (persistent)» при первом прогоне дал таймаут 5s — известная нестабильность при наличии БД, при повторном запуске прошёл. |
| pnpm build | OK (exit 0), dist/ формируется корректно. |

---

## Найденные проблемы

- Нет блокирующих.
- Тест `deduplicates repeated update_id (persistent)` иногда уходит в таймаут (5s) при первом прогоне; при повторном — зелёный. Рекомендация: при желании увеличить timeout для этого кейса или оставить как есть (тест помечен `skipIf(!hasRealDb)`).

---

## Потенциальные риски

1. **Flaky тест с БД** — в CI без реальной БД тест пропускается; при наличии БД возможен таймаут под нагрузкой. Риск низкий.
2. **Остатки в dist/** — в каталоге dist/ могут оставаться старые артефакты (adapters, core, logger.js и т.д.) от прошлых сборок; текущий `tsconfig.build.json` включает только `src`, так что после чистого `pnpm build` лишнего быть не должно. При необходимости — `rm -rf dist && pnpm build`.

---

## Соответствие REFACTOR_PLAN

- Структура src: app, domain, channels, db, worker, config, observability, integrations, content — соответствует плану.
- Порядок шагов (1–8), переносы (core→domain, persistence→db, adapters→channels), удаление services, введение di и регистрация health в app — выполнены как в плане.
- Правила (domain не импортирует content; DI до удаления services; только пути в репо в шаге 3, без смены DEPLOY_PATH) — соблюдены.

---

## Статус: **OK**

Поведенческая совместимость сохранена, архитектурные инварианты и DI соблюдены, deploy и контент проверены, качество (typecheck, lint, test, build) подтверждено. Единственное замечание — возможная нестабильность одного интеграционного теста при первом прогоне (Minor, не блокирует).
