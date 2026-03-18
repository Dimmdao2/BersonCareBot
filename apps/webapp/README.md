# BersonCare Webapp

`webapp/` is a standalone fullstack `Next.js` service for the BersonCare platform.

It is intentionally separated from the current `tgcarebot` integrator:

- `tgcarebot` owns channels, scenarios, inbound messaging, outbound delivery, and retry worker logic
- `webapp` owns the platform UI, roles, cabinets, diaries, lessons, reminders scheduler, and future billing/program logic
- the services use different databases
- the services do not read each other's domain tables directly
- integration happens only through signed entry links, webhook contracts, and verified contact linking

## URL Spaces

- `/app` - common entrypoint with role resolution
- `/app/patient` - patient workspace
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

The service expects its own env file and database:

- development env: `webapp/.env.dev`
- production env: `/opt/env/bersoncarebot/webapp.prod`
- development DB: `bcb_webapp_dev`
- production DB: `bcb_webapp_prod`

## Design Rules

- `Next.js` route handlers stay thin and delegate to DI-built services
- business logic lives in `src/modules/*`
- infrastructure adapters live in `src/infra/*`
- framework/bootstrap wiring lives in `src/app-layer/*`
- no direct domain coupling to `tgcarebot`

See `ARCHITECTURE.md`, `INTEGRATOR_CONTRACT.md`, and `MVP_PLAN.md` for the canonical service structure.

## Описание модулей

В каждой значимой папке внутри `src/` лежит файл с именем папки в формате `.md` (например `app/app.md`, `modules/diaries/diaries.md`, `infra/db/db.md`). В нём кратко описано назначение модуля и что он делает. При изменении или расширении модуля этот файл стоит дополнять (изменения, отклонения от изначальной логики, новые обязанности).
