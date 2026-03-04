# BersonCareBot

Telegram-бот и backend для обработки webhook-событий, уведомлений клиентов и интеграции с Rubitime.

- Стек: TypeScript (ESM), Fastify, PostgreSQL, grammY, Vitest
- Каналы: Telegram webhook + Rubitime webhook
- Инфраструктура: Docker Compose + Nginx + GitHub Actions deploy

Архитектура и потоки: `ARCHITECTURE.md`.

## Локальный запуск

```bash
pnpm install
cp .env.example .env
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
pnpm run dev
```

Worker локально:

```bash
pnpm run worker:dev
```

## Конфигурация

- Секреты и переменные окружения: `src/config/env.ts` (файл `.env`)
- Несеkретные runtime-настройки: `src/config/appSettings.ts`

Обязательные env-переменные:

- `BOT_TOKEN`
- `ADMIN_TELEGRAM_ID`
- `INBOX_CHAT_ID`
- `BOOKING_URL`
- `DATABASE_URL`
- `RUBITIME_WEBHOOK_TOKEN`

Часто используемые опциональные:

- `TG_WEBHOOK_SECRET`
- `DEBUG_FORWARD_ALL_EVENTS_TO_ADMIN`
- `SMSC_ENABLED`, `SMSC_API_KEY`
- `HOST`, `PORT`, `LOG_LEVEL`, `NODE_ENV`
- `RUBITIME_REQSUCCESS_*`

## Основные скрипты

| Команда | Назначение |
|---|---|
| `pnpm run dev` | API в dev-режиме |
| `pnpm run worker:dev` | Worker в dev-режиме |
| `pnpm run build` | Сборка в `dist/` |
| `pnpm start` | Запуск API из `dist/` |
| `pnpm run worker:start` | Запуск worker из `dist/` |
| `pnpm run db:migrate` | Миграции в dev (`tsx`) |
| `pnpm run db:migrate:prod` | Миграции в prod (`node dist/infra/db/migrate.js`) |
| `pnpm run typecheck` | Проверка типов |
| `pnpm run lint` | ESLint |
| `pnpm test` | Тесты |

## HTTP endpoints

- `GET /health`
- `POST /webhook/telegram`
- `POST /webhook/rubitime/:token`
- `GET /api/rubitime?record_success=<record_id>`

## Поведение уведомлений Rubitime

- `event-create-record`:
  - если пользователь уже привязан к Telegram -> уведомление уходит в Telegram сразу
  - если привязки нет -> создается delayed job, worker делает 2 проверки раз в минуту
  - если привязка не появилась -> SMS fallback
- `event-remove-record` и `event-update-record` (включая перенос/отмену): без ожидания, сразу отправка в доступный канал (Telegram или SMS fallback)

## Docker Compose

Сервисы:

- `api_blue` (`127.0.0.1:3001 -> 3000`)
- `api_green` (`127.0.0.1:3002 -> 3000`)
- `worker`
- `db` (только внутренняя сеть compose)
- `admin` (`127.0.0.1:8080 -> 80`)

Первый запуск:

```bash
cd /opt/tgcarebot/app
cp /opt/tgcarebot/.env .env
docker compose build api_blue api_green worker admin
docker compose up -d db worker admin api_blue
docker compose run --rm api_blue pnpm run db:migrate:prod
```

Проверка:

```bash
docker compose ps
curl -fsS http://127.0.0.1:3001/health
```

## Blue/Green deploy

Скрипты:

- `deploy/deploy-bluegreen.sh` — build candidate slot, migrate, health-check, Nginx switch
- `deploy/rollback-bluegreen.sh` — переключение на предыдущий слот

Workflow GitHub Actions `Deploy`:

- `push` в `main` -> deploy
- `workflow_dispatch` с `action=rollback` -> rollback

## Обновление только нужного сервиса

- Только API: `docker compose build api_blue && docker compose up -d --force-recreate api_blue`
- Только worker: `docker compose build worker && docker compose up -d --force-recreate worker`
- Только admin: `docker compose build admin && docker compose up -d --force-recreate admin`
- Изменился только `.env`: `cp /opt/tgcarebot/.env .env` и `docker compose up -d --force-recreate <service>`
