# BersonCare Webapp

`webapp/` is a standalone fullstack `Next.js` service for the BersonCare platform.

It is intentionally separated from the current `tgcarebot` integrator **as a process**:

- `tgcarebot` owns channels, scenarios, inbound messaging, outbound delivery, and retry worker logic
- `webapp` owns the platform UI, roles, cabinets, diaries, lessons, reminders scheduler, and future billing/program logic
- **PostgreSQL (production, 2026-04):** одна база, схемы `integrator` и `public`; integrator пишет/читает канон в `public` напрямую SQL где код переведён; HTTP/webhook — для контрактов между **процессами**, не как единственный способ записи в ту же БД (см. `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`)
- integration also uses signed entry links, webhook contracts, and verified contact linking

## URL Spaces

- `/app` - common entrypoint with role resolution
- `/app/patient` - patient workspace (в т.ч. `/app/patient/support` — форма обращения в поддержку, `POST /api/patient/support` → Telegram админу; см. `src/modules/auth/auth.md`)
- `/app/doctor` - doctor workspace
- `/app/settings` - shared settings space with role guards
- `/api/*` - backend layer of the webapp service

## Local Development

```bash
cp webapp/.env.example webapp/.env.dev
pnpm install
pnpm webapp:dev
```

Default local URL: `http://127.0.0.1:5200/app`

**Режим разработки (вход в браузере без Telegram):** в `.env.dev` задайте `ALLOW_DEV_AUTH_BYPASS=true`. На странице `/app` появятся кнопки «Как пациент» и «Как врач / админ» — по клику создаётся сессия и выполняется переход в интерфейс пациента или врача/админа.

## Environment

The service expects its own env file:

- development env: `apps/webapp/.env.dev` (или symlink from `webapp/.env.dev` depending on layout)
- production env: `/opt/env/bersoncarebot/webapp.prod`

**PostgreSQL:** в production **`DATABASE_URL` совпадает** с integrator (`api.prod`): **одна** база, **одна** роль PostgreSQL, схемы `public` (webapp) и `integrator` (бот). В dev удобно завести одну базу с обеими схемами; до выравнивания возможны два URL. См. `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`, `docs/ARCHITECTURE/SERVER CONVENTIONS.md`.

## Design Rules

- `Next.js` route handlers stay thin and delegate to DI-built services
- business logic lives in `src/modules/*`
- infrastructure adapters live in `src/infra/*`
- framework/bootstrap wiring lives in `src/app-layer/*`
- no direct domain coupling to `tgcarebot`

See `ARCHITECTURE.md`, `INTEGRATOR_CONTRACT.md`, and `MVP_PLAN.md` for the canonical service structure.

## Ops scripts and manual SQL

Папка [`scripts/`](scripts/) — разовые и сервисные утилиты (backfill, reconcile, админка по телефону). Любые изменения `platform_users` / телефона **в обход UI** влияют на tier **patient** только если согласованы с колонкой **`patient_phone_trust_at`** (см. инициативу Platform Identity & Access).

- **Чек-лист и порядок действий:** [`scripts/PLATFORM_IDENTITY_OPS.md`](scripts/PLATFORM_IDENTITY_OPS.md)
- **Оглавление скриптов:** [`scripts/README.md`](scripts/README.md)
- **Карта trusted paths в коде и ссылка на ops:** [`docs/ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md`](../../docs/ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md) §8

## Описание модулей

В каждой значимой папке внутри `src/` лежит файл с именем папки в формате `.md` (например `app/app.md`, `modules/diaries/diaries.md`, `infra/db/db.md`). В нём кратко описано назначение модуля и что он делает. При изменении или расширении модуля этот файл стоит дополнять (изменения, отклонения от изначальной логики, новые обязанности).
