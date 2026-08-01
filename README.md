# BersonCareBot

Монорепозиторий платформы BersonCare: PWA webapp (кабинеты пациента и врача, CMS, программы лечения, запись), integrator (Telegram/MAX, webhook, доставка) и media-worker (HLS-транскод).

- **Стек:** TypeScript (ESM), Next.js, Fastify, PostgreSQL (Drizzle + SQL-migrations integrator), grammY, Vitest
- **Каналы:** PWA (`/app`) — основной UI; **Web Push — основной канал уведомлений**; Telegram, MAX, SMS, email — дополнительные; запись — собственный движок (см. [`docs/ARCHITECTURE/NOTIFICATION_CHANNELS.md`](docs/ARCHITECTURE/NOTIFICATION_CHANNELS.md))
- **Инфраструктура:** host deploy (systemd, nginx, cron) + GitHub Actions

Суть продукта (пациент / специалист): [`docs/PRODUCT_OVERVIEW.md`](docs/PRODUCT_OVERVIEW.md). Оглавление документации: [`docs/README.md`](docs/README.md). **Инструкции для AI-агентов:** [`AGENTS.md`](AGENTS.md) (дублирует `.cursor/rules/`). Контракт слоёв integrator: [`ARCHITECTURE.md`](ARCHITECTURE.md). Эксплуатация на хосте: [`docs/ARCHITECTURE/SERVER CONVENTIONS.md`](docs/ARCHITECTURE/SERVER%20CONVENTIONS.md). В каталогах `apps/*/src/**` лежат файлы `имя_папки.md` с кратким назначением модуля — при изменении модуля их стоит дополнять.

## Состав монорепо

| Путь                                     | Назначение                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| [`apps/webapp`](apps/webapp)             | Next.js: patient/doctor UI, API routes, Drizzle-миграции схемы `public`          |
| [`apps/integrator`](apps/integrator)     | Fastify API, webhooks, worker, scheduler; схема `integrator`                     |
| [`apps/media-worker`](apps/media-worker) | FFmpeg/HLS-транскод медиатеки                                                    |
| [`packages/*`](packages)                 | Shared: `operator-db-schema`, `db-principal`, `error-tracking`, `platform-merge` |

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

**База локально:** целевая модель — **одна** PostgreSQL с схемами **`public`** + **`integrator`** (тот же `DATABASE_URL` в корневом `.env` и в `apps/webapp/.env.dev`). См. [`docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`](docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md). Шаблоны env: [`deploy/env/README.md`](deploy/env/README.md).

Dev-порты по умолчанию: **webapp** `http://127.0.0.1:5200`, **integrator API** `http://127.0.0.1:4200` (см. `.env` и `apps/webapp/.env.dev`).

Отдельные процессы integrator (при необходимости — второй терминал):

```bash
pnpm run worker:dev       # projection / delivery jobs
pnpm run scheduler:dev    # schedule.tick (напоминания и др.)
```

Только webapp: `pnpm run webapp:dev`. Turbopack: `pnpm run dev:turbo`. Polling (VM/Docker): `pnpm --dir apps/webapp run dev:visual`. Только integrator: `pnpm run dev:integrator`. Остановка dev-портов: `pnpm run dev:stop`. Подробно: [`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`](docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md).

Проверки перед коммитом:

```bash
pnpm run typecheck
pnpm run lint
pnpm test                 # integrator
pnpm test:webapp          # webapp (fast + inprocess)
pnpm run build && pnpm run build:webapp
```

**Полный CI** — перед deploy, merge/integration checkpoint и repo-level изменениями: `pnpm run ci` (или `pnpm check`). Обычный feature-branch backup-push после локального gate не требует полного CI сам по себе.

В GitHub Actions на **pull request** для webapp гоняется только быстрый набор (`pnpm test:webapp:fast`, шардирование); полный in-process (`pnpm test:webapp:inprocess`) — на **push в `main`**. Локально полный `pnpm run ci` нужен перед deploy, merge/integration checkpoint и repo-level изменениями (включая `pnpm test:webapp`). Политика «не раздувать» webapp-тесты: [`AGENTS.md` §11](AGENTS.md#11-webapp-тесты-компактность), подробности — [`apps/webapp/e2e/README.md`](apps/webapp/e2e/README.md).

## Конфигурация

**Env** — bootstrap и инфраструктура процесса (`DATABASE_URL`, `HOST`, `PORT`, `NODE_ENV`, `LOG_LEVEL`, секреты сессии и обмена webapp↔integrator). Полный список имён: [`.env.example`](.env.example), [`apps/webapp/.env.example`](apps/webapp/.env.example). Integrator подхватывает цепочку файлов через [`apps/integrator/src/config/loadEnv.ts`](apps/integrator/src/config/loadEnv.ts): корневой `.env` → `apps/integrator/.env` → `apps/webapp/.env.dev` → `apps/webapp/.env`.

**`system_settings`** (webapp, scope `admin`) — источник истины для ключей интеграций, OAuth, VAPID, флагов и прочей операционной конфигурации, редактируемой без redeploy. Deployment origin `APP_BASE_URL` живёт только в env обоих сервисов. Канон: [`docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`](docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md). Запись настроек — через admin Settings (`/app/settings`) и `updateSetting`; integrator читает одну каноническую таблицу `public.system_settings` по требованию.

Обязательный минимум для старта:

- `DATABASE_URL` — в production **один** URL у webapp и integrator (схемы `public` + `integrator`; см. [`docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`](docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md))
- webapp: `SESSION_COOKIE_SECRET`, `INTEGRATOR_WEBAPP_ENTRY_SECRET` / `INTEGRATOR_WEBHOOK_SECRET` (или `INTEGRATOR_SHARED_SECRET`)

Ручные ops webapp, затрагивающие телефон и tier patient: [`apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md`](apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md) · [`apps/webapp/scripts/README.md`](apps/webapp/scripts/README.md).

## Основные скрипты

| Команда                                     | Назначение                                 |
| ------------------------------------------- | ------------------------------------------ |
| `pnpm run dev`                              | Integrator + webapp в dev                  |
| `pnpm run webapp:dev`                       | Только webapp (порт 5200, webpack)         |
| `pnpm run dev:turbo`                        | Только webapp (Turbopack, быстрый HMR)     |
| `pnpm --dir apps/webapp run dev:visual`     | Webapp + file polling (VM/Docker)          |
| `pnpm run dev:stop`                         | Остановить dev-порты 5200/4200             |
| `pnpm run dev:integrator`                   | Только integrator API                      |
| `pnpm run worker:dev` / `scheduler:dev`     | Фоновые процессы integrator                |
| `pnpm run build`                            | Сборка integrator + packages               |
| `pnpm run build:webapp`                     | Production-сборка Next.js                  |
| `pnpm start` / `pnpm run webapp:start`      | Prod-запуск из артефактов                  |
| `pnpm run worker:start` / `scheduler:start` | Prod worker / scheduler                    |
| `pnpm run migrate`                          | Обе миграции (integrator + webapp Drizzle) |
| `pnpm run db:migrate`                       | Только integrator (dev, `tsx`)             |
| `pnpm run migrate:webapp`                   | Только webapp Drizzle                      |
| `pnpm run typecheck`                        | Typecheck всех workspace-пакетов           |
| `pnpm run lint`                             | ESLint (integrator + webapp)               |
| `pnpm test`                                 | Тесты integrator                           |
| `pnpm test:webapp`                          | Тесты webapp (fast + inprocess)            |
| `pnpm test:media-worker`                    | Тесты media-worker                         |
| `pnpm run ci` / `pnpm check`                | Полный пайплайн CI                         |
| `pnpm run ci:resume:after-*`                | Догон хвоста CI после падения шага         |

## HTTP-поверхности

**Integrator** (dev `:4200`, prod `:3200` за nginx):

- `GET /health`
- `POST /webhook/telegram`
  **Webapp** (dev `:5200`, prod `https://bersoncare.ru`): основной продуктовый API и UI под `/app/*`, публичная запись `/book/*`, реестр маршрутов — [`apps/webapp/src/app/api/api.md`](apps/webapp/src/app/api/api.md).

## Деплой

Workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) выполняет проверки (`pnpm run ci`) и не деплоит автоматически. Production deployment — отдельный ручной [`.github/workflows/deploy-prod.yml`](.github/workflows/deploy-prod.yml) (`workflow_dispatch` + environment approval), который принимает только `DEPLOY_HOST=135.106.162.170`. PROD находится только на `135.106.162.170` (`adelaide`): API, worker, scheduler, webapp, media-worker — systemd-юниты `bersoncarebot-*-prod`. Текущий `151.241.228.122` — DEV/RELAY/TEST и PROD-юниты там запускать нельзя. Runbook: [`deploy/HOST_DEPLOY_README.md`](deploy/HOST_DEPLOY_README.md).
