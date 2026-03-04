# BersonCareBot

Telegram-бот и backend для обработки webhook-событий, уведомлений клиентов и интеграции с Rubitime.

- Стек: TypeScript (ESM), Fastify, PostgreSQL, grammY, Vitest
- Каналы: Telegram webhook + Rubitime webhook
- Инфраструктура: systemd, GitHub Actions (deploy)

Архитектура и потоки: `ARCHITECTURE.md`. Legacy runtime до миграции лежит в `___src__old`.

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

## Docker Compose

В репозитории есть готовая схема контейнеров:

- `api` (Fastify backend)
- `worker` (отдельный фоновый процесс)
- `db` (PostgreSQL, только во внутренней сети compose)
- `admin` (статический frontend на nginx, порт `8080`)

Запуск:

```bash
cp .env.example .env
docker compose build
docker compose up -d
```

Проверка:

```bash
docker compose ps
docker compose logs -f api
docker compose logs -f worker
```

Миграции внутри контейнера `api`:

```bash
docker compose exec api pnpm run db:migrate
```

## Blue/Green деплой API

Для API используется схема `api_blue` и `api_green`:

- `api_blue` публикуется на `127.0.0.1:3001`
- `api_green` публикуется на `127.0.0.1:3002`
- Nginx переключает `proxy_pass` между этими портами без остановки всего сервиса.

Скрипты:

- `deploy/deploy-bluegreen.sh` — автоматический deploy + migrate + health-check + switch
- `deploy/rollback-bluegreen.sh` — ручной быстрый rollback на предыдущий слот

Workflow GitHub Actions `Deploy`:

- `push` в `main` запускает `deploy`
- `workflow_dispatch` с `action=rollback` выполняет rollback
