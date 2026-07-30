# Webapp Architecture

## Service Purpose

`webapp` is the main product service of the BersonCare platform.

It provides:

- patient and doctor interfaces inside one `Next.js` application
- its own backend layer through `Next.js` route handlers
- role-aware navigation and access control
- product domain modules such as lessons, diaries, reminders, appointments, and purchases

It does not replace the existing integrator.

## Boundary With `tgcarebot`

`tgcarebot` and `webapp` are separate **services** (processes) with separate ownership. They may share **one** PostgreSQL database (`integrator` and `public` schemas); see `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`.

`tgcarebot` owns:

- channel integrations
- scripts and scenario execution
- outbound delivery to messengers
- retry worker
- channel-level commands such as `/show_my_id`
- issuing signed webapp entry tokens

`webapp` owns:

- web sessions
- platform users and role checks
- patient and doctor UI
- patient cabinet
- doctor workspace foundation
- lessons and emergency content
- diaries and reminder scheduler
- future billing/program domains

Hard rules:

- **Нет ПРЯМЫХ импортов между деревьями приложений** (`apps/integrator` ↔ `apps/webapp`) — но общее выносится в пакет,
  и это разрешённый и уже используемый путь: `packages/db-principal`, `packages/operator-db-schema`,
  `packages/platform-merge` подключены обоими приложениями. Формулировка уточнена 30.07: прежнее «No imports» читалось
  как полный запрет общего кода и заставляло агентов возвращать HTTP там, где нужен пакет или общий SQL.
  **Почему прямой импорт запрещён — техническая причина, не соглашение:** сборка Next тянет к себе модули интегратора с
  путями в `.js` и ломается (прецедент зафиксирован в `INTEGRATOR_CONTRACT.md`), а два отдельных деплоя связываются
  релизами намертво. Плюс у приложений разные принципалы (вебапп — из сессии, интегратор — из опознания в мессенджере)
  и разные транзакционные контексты.
- **One PostgreSQL** in production: same `DATABASE_URL` and DB **role** for both services; canonical platform data in schema **`public`**, integrator runtime in **`integrator`** — see `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`. Integrator writes to `public` only through repository/transaction code agreed in that doc, not by importing webapp modules.
- **Cross-process** integration where not same-DB SQL: signed entry links, webhooks, `INTEGRATOR_API_URL`, verified contact linking, HTTP sync and outbox queues as fallback.

## Целевая схема: кто что делает (зафиксировано 30.07)

```text
Telegram / MAX / provider webhook
        │  проверка подписи, разбор, дедупликация события провайдера
        ▼
  интегратор — приём и доставка
        │  узкая команда в домен
        ▼
  вебапп — единственный владелец продуктовых решений и канона
        │  настройки клиники и пациента → планировщик → что и когда отправить
        ▼
  очередь исходящей доставки (в интеграторе: попытки, отступы, «мёртвая полка»)
        ▼
  Telegram / MAX / SMS / email / push
```

**В интеграторе остаётся:** приём вебхуков и проверка подписи, разбор и нормализация, дедупликация по идентификатору
события провайдера, опознание человека по внешнему идентификатору, отправка во все каналы с повторами и учётом попыток,
подписанные ссылки входа в приложение, технические проверки здоровья.

**В интеграторе НЕ остаётся:** продуктовые правила и расчёты, канон пациента, планировщик, решения «что и когда
отправить», собственный резолвер прав и состояний.

**Общее между приложениями — тремя способами, в этом порядке предпочтения:** одна база и схема `public` · одна функция
в базе там, где обоим нужен одинаковый расчёт (образец — дверь жизненного цикла `app.resolve_organization_mechanic_access`) ·
пакет в `packages/*` для чистого кода без обращения к базе. Межпроцессный HTTP — только для того, что действительно
является контрактом на границе процессов, и не способ писать канонические данные.

**Права:** после вычистки интегратор получает узкую роль — свои таблицы, очередь доставки, привязки каналов; доступа к
продуктовому канону нет. До этого момента изоляция обеспечивается только договорённостью в коде, то есть фактически
отсутствует. План работ — `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, Track D-полный.

## Layering Model

The service mirrors the clean layering principles from the root `ARCHITECTURE.md`.

### `src/app`

Framework entrypoints only:

- route files
- layouts
- pages
- `Next.js` API handlers

This layer must not contain business decisions.

### `src/app-layer`

Application bootstrap and orchestration:

- composition root
- guards
- service assembly
- route-safe helpers

This is the only place where modules and infrastructure are wired together.

### `src/modules`

Business and application logic, grouped by domain:

- `auth`
- `users`
- `contacts`
- `roles`
- `lessons`
- `emergency`
- `patient-cabinet`
- `doctor-cabinet`
- `diaries`
- `reminders`
- `appointments`
- `purchases`
- `billing`

Modules depend only on contracts, pure utilities, and injected ports.

### `src/infra`

Infrastructure adapters:

- Postgres access
- webhook verification
- outbound calls to `tgcarebot`
- scheduler implementation
- storage and security helpers

Infra implements ports exposed by modules and never owns business branching.

### `src/config`

Configuration and env parsing.

### `src/shared`

Framework-agnostic helpers, types, constants, and presentational building blocks.

## Folder Shape

```text
webapp/
  README.md
  ARCHITECTURE.md
  INTEGRATOR_CONTRACT.md
  MVP_PLAN.md
  package.json
  src/
    app/
      api/
      app/
    app-layer/
      di/
      guards/
      routes/
    modules/
      auth/
      users/
      contacts/
      roles/
      lessons/
      emergency/
      patient-cabinet/
      doctor-cabinet/
      diaries/
      reminders/
      appointments/
      purchases/
      billing/
    infra/
      db/
      repos/
      integrations/
      webhooks/
      scheduler/
      security/
      storage/
    config/
    shared/
```

## DI Pattern

The service uses a manual composition root similar to the root backend.

Rules:

- no hidden framework container
- services are built through explicit factories
- route handlers resolve dependencies from a single entrypoint
- tests can override adapters by replacing inputs at the composition root

## Route Spaces

- `/app` resolves the current session and redirects to the role space
- `/app/patient/*` is the patient-facing area
- `/app/doctor/*` is the doctor-facing area
- `/app/settings/*` is shared, but access is checked by role
- `/api/auth/*` owns session bootstrap and logout
- `/api/integrator/*` owns explicit machine-to-machine contracts with `tgcarebot`

## Data Ownership

`webapp` stores:

- its own users
- role assignments
- verified contacts
- channel bindings
- sessions and auth grants
- product data such as diaries, reminders, lessons access, programs, and billing state

`tgcarebot` stores:

- its own users and channel identities
- scenario state
- delivery jobs
- integrator-side contact and messaging context

Cross-service linking is explicit and must be auditable.

## Evolution Path

This structure is designed so the service can grow without re-architecture:

- add richer doctor workflows later under `doctor-cabinet`
- add billing under `billing`
- add content-service integration under `lessons` and `infra/integrations`
- move from stub adapters to real Postgres/storage/webhook implementations without changing UI routes
