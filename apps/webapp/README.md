# BersonCare Webapp

`webapp/` is a standalone fullstack `Next.js` service for the BersonCare platform.

It is intentionally separated from the current `tgcarebot` integrator **as a process**:

- `tgcarebot` owns channels, scenarios, inbound messaging, outbound delivery, and retry worker logic
- `webapp` owns the platform UI, roles, cabinets, diaries, lessons, reminders scheduler, and future billing/program logic
- **PostgreSQL (production, 2026-04):** одна база, схемы `integrator` и `public`; integrator пишет/читает канон в `public` напрямую SQL где код переведён; HTTP/webhook — для контрактов между **процессами**, не как единственный способ записи в ту же БД (см. `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`)
- integration also uses signed entry links, webhook contracts, and verified contact linking

## URL Spaces

- **`/`** — публичный маркетинговый лендинг и блок установки PWA (`manifest.webmanifest` с **`scope: "/app"`**; `public/sw.js` с лендинга — **`scope: "/app"`**, только `install`/`activate`; **только** вне Mini App; канон и фазы — [`docs/PWA_INITIATIVE/README.md`](../../docs/PWA_INITIATIVE/README.md)). **Web Push (этап 4):** пара VAPID в **`system_settings`** (`web_push_vapid`, admin), редактирование — блок на **`/app/settings`**; ответы API без `privateKey` (см. [`WEB_PUSH_VAPID_ADMIN.plan.md`](../../docs/PWA_INITIATIVE/WEB_PUSH_VAPID_ADMIN.plan.md)). Полный push — backlog; заглушка **`GET /api/patient/web-push/status`**.
- `/app` - common entrypoint with role resolution (legacy miniapp: optional `?ctx=bot|max`; **`ctx=max` на `/app` → redirect на `/app/max`**). **Контракт публичного входа, OAuth, телефона, miniapp:** [`src/modules/auth/auth.md`](src/modules/auth/auth.md).
- `/app/tg` - Telegram Mini App entry (shared `AppEntryRsc` + messenger auth); proxy ставит platform/surface cookies при первом заходе
- `/app/max` - MAX Mini App entry (shared `AppEntryRsc` + messenger auth); то же — см. `applyMessengerEntryPathCookies` в `middleware/platformContext.ts`
- При одновременном наличии строк Telegram и MAX initData в WebView порядок выбора канала задаётся **surface-first** в [`AuthBootstrap`](src/shared/ui/AuthBootstrap.tsx) (`flowHint`, `pickInitDataForMessengerTick`; для browser остаётся прежний безопасный порядок и `getMaxWebAppInitDataForAuth()` для stale-bot).
- `/app/patient` - patient workspace (в т.ч. `/app/patient/support` — форма обращения в поддержку, `POST /api/patient/support` → Telegram админу; см. `src/modules/auth/auth.md`; **`/app/patient/install`** — краткие инструкции PWA **для залогиненного пациента**, отдельно от публичного лендинга **`/`**; **`/app/patient/messages`** — чат + inbox рассылок и lifecycle записи; legacy **`/app/patient/broadcasts/[auditId]`** → redirect в чат — см. `docs/ARCHITECTURE/PATIENT_SUPPORT_CHAT_INBOX.md`, `docs/ARCHITECTURE/DOCTOR_BROADCASTS.md`)
- `/app/doctor` - doctor workspace
- `/app/settings` - shared settings space with role guards
- `/api/*` - backend layer of the webapp service

## Local Development

```bash
cp webapp/.env.example webapp/.env.dev
pnpm install
pnpm webapp:dev          # webpack (default)
pnpm dev:turbo           # from repo root — Turbopack, faster HMR
pnpm dev:stop            # stop dev listeners on :5200 / :4200 only (not prod :6200 / :3200)
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
