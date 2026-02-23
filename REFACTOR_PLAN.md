# План реорганизации BersonCareBot (структура + задел под Admin)

Ветка: `refactor/restructure-admin-base`  
Критерии: без изменения поведения бота, все тесты зелёные, коммит после каждого шага.

---

## Шаг 1 — Ветка и observability

- Создать ветку `refactor/restructure-admin-base`.
- Создать `src/observability/logger.ts` (перенос из `src/logger.ts`).
- Создать `src/observability/README.md`: текущий статус (Pino), планы (OTel, metrics, tracing, Sentry, correlation id), правило «никакой бизнес-логики».
- Обновить все импорты `logger`/`getRequestLogger`/`getWorkerLogger`/`getMigrationLogger` на `observability/logger`.
- Удалить `src/logger.ts`.
- Запустить тесты, коммит.

---

## Шаг 2 — core → domain

- Создать `src/domain/types.ts` (перенос из `src/core/types.ts`).
- Создать `src/domain/webhookContent.ts` (перенос из `src/core/webhookContent.ts`), импорт `NotificationSettings` из `./ports/notifications.js`.
- Создать `src/domain/ports/`: `user.ts`, `notifications.ts`, `messaging.ts`, `index.ts` (импорты из `../types.js` где нужно).
- Создать `src/domain/usecases/`: перенос `handleUpdate`, `handleMessage`, `handleCallback` из `core/messaging/`; перенос `core/notifications/service.ts`, `core/onboarding/service.ts` (как usecases).
- Обновить все импорты с `core/*` на `domain/*` (adapters, persistence, content, e2e при необходимости).
- Удалить папку `src/core/`.
- Тесты, коммит.

---

## Шаг 3 — persistence → db

- Создать `src/db/client.ts` (перенос из `src/persistence/client.ts`), импорт logger из `../observability/logger.js`.
- Создать `src/db/migrate.ts` (перенос из `src/persistence/migrate.ts`), использовать пул из `./client.js` или оставить свой Pool с `env` из config.
- Создать `src/db/repos/`: `telegramUsers.ts`, `topics.ts`, `subscriptions.ts` (перенос из `persistence/repositories/`), импорты `db` и типы из `../../domain/`.
- Обновить все импорты с `persistence/*` на `db/*` (в т.ч. `package.json` скрипты `migrate`/`db:migrate` и путь в deploy workflow). **Не менять DEPLOY_PATH и systemd** — только пути внутри репозитория и импорты.
- Удалить папку `src/persistence/`.
- Тесты, коммит.

---

## Шаг 4 — app (server, routes, di) и health в app

- **Сначала** создать `src/app/di.ts`: composition root — создание `db`, `userPort`, `notificationsPort` (из db/repos), `healthCheckDb`, опционально контент для Telegram. Так зависимости не разрываются при последующем удалении services.
- Создать `src/app/server.ts`: создание Fastify, регистрация плагинов, вызов регистрации роутов (передача зависимостей из di).
- Создать `src/app/routes.ts`: регистрация GET `/health` (использование `healthCheckDb` из di) и POST `/webhook/telegram` (зависимости из di). Контракт HealthResponse — в `routes.ts` или `routes/contract.ts`.
- Перенести логику из `src/app.ts` в `server.ts`; `buildApp()` экспортировать из `server.ts` (или из `app/index.ts` как реэкспорт).
- Health: убрать `adapters/rest/health.ts` и `adapters/rest/contract.ts`, перенести в `app/routes.ts` (и при необходимости `app/routes/health.ts` + типы).
- Обновить `main.ts`: импорт `buildApp` из `./app/server.js` (или `./app/index.js`).
- Обновить тест health: мокать `db`/`healthCheckDb` через di или оставить мок на уровне проверки БД.
- Тесты, коммит.

---

## Шаг 5 — channels/telegram и удаление services

- Создать `src/channels/telegram/`: `schema.ts`, `mapIn.ts` (fromTelegram), `mapOut.ts` (toTelegram), `client.ts`, `webhook.ts`.
- Перенести код из `adapters/telegram/` в `channels/telegram/` с обновлением импортов (domain, config, observability, db через di).
- Webhook-роут получает `userPort`, `notificationsPort`, контент и т.д. из di (передаются при регистрации из `app/routes.ts`).
- Удалить слой services: в di использовать напрямую репозитории из `db/repos`; `healthCheckDb` из `db/client`.
- Удалить `adapters/telegram/` и `adapters/rest/`.
- Удалить `services/` (telegramUserService, healthService, subscriptionService — последний используется воркером: воркер импортирует из `db/repos` или оставить один тонкий фасад в app/di, subscriptionService импортировать из db/repos в worker).
- Обновить ESLint: правила для `src/adapters/**` заменить на `src/channels/**` (no-restricted-imports *persistence* → *db*); для `src/core/**` уже будет `src/domain/**`; worker по-прежнему не импортирует *adapters* и *app* (заменить на *channels* и *app*).
- Тесты (unit webhook, health, e2e), коммит.

---

## Шаг 6 — content и integrations

- Контент: оставить `src/content/` как есть или перенести реализацию в `src/channels/telegram/content.ts` и реэкспорт из `content/index.ts`. **Правило:** domain не импортирует content напрямую — только через тип/порт (WebhookContent и т.п.).
- Создать `src/integrations/` с заглушкой (README или .gitkeep); при необходимости перенести `adapters/rubitime` в `integrations/rubitime`.
- Тесты, коммит.

---

## Шаг 7 — Admin SPA и CI

- Создать папку `admin/` в корне: минимальный SPA (Vite + React), билд в `admin/dist`.
- В `package.json` добавить скрипт сборки admin (например `build:admin`); при `pnpm build` или отдельно.
- В `.github/workflows/deploy.yml`: добавить шаг сборки admin перед/после основного build, чтобы `admin/dist` оказывался в `DEPLOY_PATH` (например копирование в `app/admin/dist` или текущая структура такова, что репозиторий уже содержит `admin/`, и на сервере после `pnpm build` и сборки admin итог в `/opt/tgcarebot/app` включает `admin/dist`).
- Не менять базовую схему деплоя (DEPLOY_PATH, systemd).
- Тесты, коммит.

---

## Шаг 8 — Финальная проверка и архитектура

- Обновить `src/architecture.md` под новую структуру (app, domain, channels, db, worker, config, observability, integrations).
- Проверить отсутствие циклических и запрещённых импортов (domain не импортирует channels/db/admin/observability).
- Полный прогон тестов, линт, typecheck.
- Коммит.

---

## Порядок и зависимости

- Шаг 1 не зависит ни от чего.
- Шаг 2 (domain) — до шагов 4–5 (app и channels зависят от domain).
- Шаг 3 (db) — до шагов 4–5 (app/di и channels используют db).
- Шаги 4 и 5 можно объединить по желанию (app + channels + удаление services и adapters в одном шаге), но разбито на два для меньшего объёма за раз.
- Шаг 6 — после 5. Шаг 7 — независим. Шаг 8 — в конце.
