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

`tgcarebot` and `webapp` are separate services with separate ownership.

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

- no direct SQL access across services
- no imports across service source trees
- no shared domain tables
- communication only via signed links, webhook contracts, and verified contact linking

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
