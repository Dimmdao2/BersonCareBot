# BersonCareBot

Telegram-бот и backend для обработки webhook-событий, уведомлений клиентов и интеграции с Rubitime.

- Стек: TypeScript (ESM), Fastify, PostgreSQL, grammY, Vitest
- Каналы: Telegram webhook + Rubitime webhook
- Инфраструктура: host deploy (systemd, nginx) + GitHub Actions

Архитектура и потоки: `ARCHITECTURE.md`. Оглавление документации: `docs/README.md`. Ручные скрипты/SQL webapp, затрагивающие телефон и tier patient: `apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md` · оглавление `apps/webapp/scripts/README.md`. В папках внутри `src/` и `webapp/src/` лежат файлы `имя_папки.md` с кратким назначением модуля; при изменении модуля их стоит дополнять.

## Локальный запуск

**Node.js ≥22** (см. `engines` в корневом `package.json`). При использовании **nvm**: в корне репозитория выполните `nvm use` — версия задана в `.nvmrc`.

```bash
pnpm install
cp .env.example .env
# проверьте src/integrations/*/config.ts
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
pnpm run dev
```

**Перед пушем** запустите те же проверки, что и в CI: `pnpm run ci` (или `pnpm check`). Если `pnpm ci` проходит локально — пройдёт и в GitHub Actions.

В GitHub Actions для webapp: на **pull request** гоняется только быстрый набор (`pnpm test:webapp:fast`, шардирование); полный in-process (`pnpm test:webapp:inprocess`) — на **push в `main`**. Локально перед пушем по-прежнему нужен полный `pnpm run ci` (включая `pnpm test:webapp`). Политика для агентов и разработчиков — не раздувать webapp-тесты (импорты страниц, лишние файлы): `.cursor/rules/webapp-tests-lean-no-bloat.mdc`, подробности — `apps/webapp/e2e/README.md`.

Worker локально:

```bash
pnpm run worker:dev
```

## Конфигурация

- Общие runtime-переменные окружения: `src/config/env.ts` (файл `.env`)
- Ключи интеграций: `src/integrations/<name>/config.ts`
- Несеkретные runtime-настройки: `src/config/appSettings.ts`

Обязательные env-переменные:

- `BOOKING_URL`
- `DATABASE_URL` — в production совпадает у webapp и integrator (одна база PostgreSQL, схемы `public` и `integrator`; см. `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`)

Часто используемые опциональные:

- `DEBUG_FORWARD_ALL_EVENTS_TO_ADMIN`
- `HOST`, `PORT`, `LOG_LEVEL`, `NODE_ENV`
- `RUBITIME_REQSUCCESS_*`

Интеграционные ключи и токены лежат рядом с кодом:

- `src/integrations/telegram/config.ts`
- `src/integrations/rubitime/config.ts`
- `src/integrations/smsc/config.ts`

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
| `pnpm run ci` / `pnpm check` | Всё, что запускает CI: lint, typecheck, test, test:webapp, webapp:typecheck, build, audit |
| `pnpm run ci:resume:after-*` | Догон хвоста CI после падения конкретного шага (без повтора уже зелёных шагов) |

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

## Деплой

Проверки и деплой на хост: workflow `.github/workflows/ci.yml` — job проверок (`pnpm run ci`) и, после успеха на `main`, job **Deploy** по SSH (`deploy/host/deploy-prod.sh` на сервере). Подробности и operational runbook: `deploy/HOST_DEPLOY_README.md`.
