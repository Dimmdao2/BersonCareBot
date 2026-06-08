# BersonCareBot

Монорепозиторий платформы BersonCare: PWA webapp (кабинеты пациента и врача, CMS, программы лечения, запись), integrator (Telegram/MAX, webhook, доставка, Rubitime) и media-worker (HLS-транскод).

- **Стек:** TypeScript (ESM), Next.js, Fastify, PostgreSQL (Drizzle + SQL-migrations integrator), grammY, Vitest
- **Каналы:** PWA (`/app`) — основной UI; **Web Push — основной канал уведомлений**; Telegram, MAX, SMS, email — дополнительные; запись — собственный движок + legacy Rubitime (см. [`docs/ARCHITECTURE/NOTIFICATION_CHANNELS.md`](docs/ARCHITECTURE/NOTIFICATION_CHANNELS.md))
- **Инфраструктура:** host deploy (systemd, nginx, cron) + GitHub Actions

Суть продукта (пациент / специалист): [`docs/PRODUCT_OVERVIEW.md`](docs/PRODUCT_OVERVIEW.md). Оглавление документации: [`docs/README.md`](docs/README.md). Контракт слоёв integrator: [`ARCHITECTURE.md`](ARCHITECTURE.md). Эксплуатация на хосте: [`docs/ARCHITECTURE/SERVER CONVENTIONS.md`](docs/ARCHITECTURE/SERVER%20CONVENTIONS.md). В каталогах `apps/*/src/**` лежат файлы `имя_папки.md` с кратким назначением модуля — при изменении модуля их стоит дополнять.

## Состав монорепо

| Путь | Назначение |
|------|------------|
| [`apps/webapp`](apps/webapp) | Next.js: patient/doctor UI, API routes, Drizzle-миграции схемы `public` |
| [`apps/integrator`](apps/integrator) | Fastify API, webhooks, worker, scheduler; схема `integrator` |
| [`apps/media-worker`](apps/media-worker) | FFmpeg/HLS-транскод медиатеки |
| [`packages/*`](packages) | Shared: `operator-db-schema`, `booking-rubitime-sync`, `platform-merge` |

## Локальный запуск

**Node.js ≥22** (см. `engines` в корневом `package.json`). С **nvm**: `nvm use` — версия в `.nvmrc`.

```bash
pnpm install
cp .env.example .env
cp apps/webapp/.env.example apps/webapp/.env.dev
# заполните DATABASE_URL, SESSION_COOKIE_SECRET, секреты integrator — см. комментарии в файлах
pnpm run migrate          # integrator SQL + webapp Drizzle (нужна поднятая БД)
pnpm run dev              # integrator + webapp параллельно
```

Dev-порты по умолчанию: **webapp** `http://127.0.0.1:5200`, **integrator API** `http://127.0.0.1:4200` (см. `.env` и `apps/webapp/.env.dev`).

Отдельные процессы integrator (при необходимости — второй терминал):

```bash
pnpm run worker:dev       # projection / delivery jobs
pnpm run scheduler:dev    # schedule.tick (напоминания и др.)
```

Только webapp: `pnpm run webapp:dev`. Только integrator: `pnpm run dev:integrator`.

Проверки перед коммитом:

```bash
pnpm run typecheck
pnpm run lint
pnpm test                 # integrator
pnpm test:webapp          # webapp (fast + inprocess)
pnpm run build && pnpm run build:webapp
```

**Перед пушем** — полный CI: `pnpm run ci` (или `pnpm check`).

В GitHub Actions на **pull request** для webapp гоняется только быстрый набор (`pnpm test:webapp:fast`, шардирование); полный in-process (`pnpm test:webapp:inprocess`) — на **push в `main`**. Локально перед пушем нужен полный `pnpm run ci` (включая `pnpm test:webapp`). Политика «не раздувать» webapp-тесты: [`.cursor/rules/webapp-tests-lean-no-bloat.mdc`](.cursor/rules/webapp-tests-lean-no-bloat.mdc), подробности — [`apps/webapp/e2e/README.md`](apps/webapp/e2e/README.md).

## Конфигурация

**Env** — bootstrap и инфраструктура процесса (`DATABASE_URL`, `HOST`, `PORT`, `NODE_ENV`, `LOG_LEVEL`, секреты сессии и обмена webapp↔integrator). Полный список имён: [`.env.example`](.env.example), [`apps/webapp/.env.example`](apps/webapp/.env.example). Integrator подхватывает цепочку файлов через [`apps/integrator/src/config/loadEnv.ts`](apps/integrator/src/config/loadEnv.ts): корневой `.env` → `apps/integrator/.env` → `apps/webapp/.env.dev` → `apps/webapp/.env`.

**`system_settings`** (webapp, scope `admin`) — источник истины для ключей интеграций, публичных URL, OAuth, VAPID, флагов и прочей операционной конфигурации, редактируемой без redeploy. Канон: [`docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`](docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md). Запись — через admin Settings (`/app/settings`) и `updateSetting` (зеркало в `integrator.system_settings`).

Обязательный минимум для старта:

- `DATABASE_URL` — в production **один** URL у webapp и integrator (схемы `public` + `integrator`; см. [`docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`](docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md))
- `BOOKING_URL` — для integrator (Rubitime / legacy booking surface)
- webapp: `SESSION_COOKIE_SECRET`, `INTEGRATOR_WEBAPP_ENTRY_SECRET` / `INTEGRATOR_WEBHOOK_SECRET` (или `INTEGRATOR_SHARED_SECRET`)

Ручные ops webapp, затрагивающие телефон и tier patient: [`apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md`](apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md) · [`apps/webapp/scripts/README.md`](apps/webapp/scripts/README.md).

## Основные скрипты

| Команда | Назначение |
|---------|------------|
| `pnpm run dev` | Integrator + webapp в dev |
| `pnpm run webapp:dev` | Только webapp (порт 5200) |
| `pnpm run dev:integrator` | Только integrator API |
| `pnpm run worker:dev` / `scheduler:dev` | Фоновые процессы integrator |
| `pnpm run build` | Сборка integrator + packages |
| `pnpm run build:webapp` | Production-сборка Next.js |
| `pnpm start` / `pnpm run webapp:start` | Prod-запуск из артефактов |
| `pnpm run worker:start` / `scheduler:start` | Prod worker / scheduler |
| `pnpm run migrate` | Обе миграции (integrator + webapp Drizzle) |
| `pnpm run db:migrate` | Только integrator (dev, `tsx`) |
| `pnpm run migrate:webapp` | Только webapp Drizzle |
| `pnpm run typecheck` | Typecheck всех workspace-пакетов |
| `pnpm run lint` | ESLint (integrator + webapp) |
| `pnpm test` | Тесты integrator |
| `pnpm test:webapp` | Тесты webapp (fast + inprocess) |
| `pnpm test:media-worker` | Тесты media-worker |
| `pnpm run ci` / `pnpm check` | Полный пайплайн CI |
| `pnpm run ci:resume:after-*` | Догон хвоста CI после падения шага |

## HTTP-поверхности

**Integrator** (dev `:4200`, prod `:3200` за nginx):

- `GET /health`
- `POST /webhook/telegram`
- `POST /webhook/rubitime/:token`
- `GET /api/rubitime?record_success=<record_id>`

**Webapp** (dev `:5200`, prod `https://bersoncare.ru`): основной продуктовый API и UI под `/app/*`, публичная запись `/book/*`, реестр маршрутов — [`apps/webapp/src/app/api/api.md`](apps/webapp/src/app/api/api.md).

## Rubitime: уведомления о записи

Кратко (подробнее — [`docs/ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`](docs/ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md)):

- `event-create-record`: при привязке Telegram/MAX — сразу в мессенджер; иначе delayed job (2 проверки/мин) → SMS fallback
- `event-remove-record`, `event-update-record`: без ожидания, в доступный канал (мессенджер или SMS)

Параллельно развивается **собственный движок записи** — см. [`docs/OWN_BOOKING_ENGINE_INITIATIVE/README.md`](docs/OWN_BOOKING_ENGINE_INITIATIVE/README.md).

## Деплой

Workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml): проверки (`pnpm run ci`) и, после успеха на `main`, job **Deploy** по SSH (`deploy/host/deploy-prod.sh`). На хосте: API, worker, scheduler, webapp, media-worker — systemd-юниты `bersoncarebot-*-prod`. Runbook: [`deploy/HOST_DEPLOY_README.md`](deploy/HOST_DEPLOY_README.md).
