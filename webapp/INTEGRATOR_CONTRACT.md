# Integrator Contract

This document defines the explicit contract between `tgcarebot` and `webapp`.

**JSON Schemas** (canonical payload shapes):

- [Webapp entry token payload](../../contracts/webapp-entry-token.json) — decoded payload of `?t=<signed-token>`
- [POST /api/integrator/events body](../../contracts/integrator-events-body.json) — webhook events from tgcarebot
- [POST /api/integrator/reminders/dispatch body](../../contracts/integrator-reminders-dispatch-body.json) — reminder dispatch payload

## Contract Principles

- no direct database reads between services
- all machine-to-machine calls are authenticated with a shared secret
- all machine-to-machine writes are idempotent
- transport/channel semantics stay in `tgcarebot`
- product semantics stay in `webapp`

## Flow 1: Signed Webapp Entry

`tgcarebot` sends a button or deep link that opens:

`https://webapp.bersonservices.ru/app?t=<signed-token>`

Token payload shape:

```json
{
  "sub": "platform-user-or-external-user-id",
  "role": "client",
  "displayName": "User Name",
  "bindings": {
    "telegramId": "123456789"
  },
  "phone": "+79990000000",
  "purpose": "webapp-entry",
  "exp": 1760000000
}
```

Token requirements:

- HMAC-signed with the **webapp-entry secret** (webapp: `INTEGRATOR_WEBAPP_ENTRY_SECRET`, or `INTEGRATOR_SHARED_SECRET` if not set; tgcarebot: `INTEGRATOR_SHARED_SECRET` for building the token)
- short-lived
- audience is `webapp`
- carries only data needed for bootstrap

## Flow 2: Auth Exchange

The browser calls:

`POST /api/auth/exchange`

Request body:

```json
{
  "token": "<signed-token>"
}
```

Response body:

```json
{
  "ok": true,
  "role": "client",
  "redirectTo": "/app/patient"
}
```

The route sets the web session cookie and never exposes long-lived session secrets in the URL.

## Flow 3: Integrator Webhooks

`webapp` exposes explicit webhook endpoints for `tgcarebot`.

### `POST /api/integrator/events`

Purpose:

- receive machine events from `tgcarebot`
- link a messenger action to a webapp-side domain reaction

After signature and idempotency checks, the body is parsed per [integrator-events-body schema](../../contracts/integrator-events-body.json) and passed to domain handler `handleIntegratorEvent(event)`. Event types can then drive appointments, contact verified, reminder delivery result, etc.

Examples:

- appointment status updated
- booking confirmed
- contact verified
- external reminder delivery result

**Diary symptom events** (payload must include `userId`; integrator resolves from channel when omitted):

- `diary.symptom.tracking.created` — payload: `userId`, `symptomTitle`, optional `symptomKey`
- `diary.symptom.entry.created` — payload: `userId`, `trackingId`, `value0_10` (0–10), `entryType` (`instant` | `daily`), `recordedAt` (ISO), optional `notes`

**Diary LFK events:**

- `diary.lfk.complex.created` — payload: `userId`, `title`, optional `origin` (`manual` | `assigned_by_specialist`)
- `diary.lfk.session.created` — payload: `userId`, `complexId`, `completedAt` (ISO), optional

### `POST /api/integrator/reminders/dispatch`

Purpose:

- allow the `webapp` reminder scheduler to ask `tgcarebot` to deliver a reminder through messenger channels

After signature and idempotency checks, the body is validated and passed to domain handler `handleReminderDispatch(body)`. Future: enqueue for orchestrator or HTTP call to tgcarebot with signature.

Payload example:

```json
{
  "idempotencyKey": "uuid",
  "userId": "user_123",
  "channelBindings": {
    "telegramId": "123456789"
  },
  "message": {
    "title": "Напоминание",
    "body": "Пора выполнить упражнение"
  },
  "actions": [
    { "id": "done", "label": "Сделал" },
    { "id": "later_30m", "label": "Напомнить позже" },
    { "id": "open_lfk", "label": "Посмотреть упражнение" }
  ]
}
```

## Authentication

Webhook requests use:

- `X-Bersoncare-Timestamp`
- `X-Bersoncare-Signature`
- `X-Bersoncare-Idempotency-Key`

The signature is an HMAC over `timestamp + "." + rawBody` using the **webhook secret** (webapp: `INTEGRATOR_WEBHOOK_SECRET`, or `INTEGRATOR_SHARED_SECRET` if not set). For backward compatibility, a single `INTEGRATOR_SHARED_SECRET` can be used for both entry token and webhook; for stronger separation, set `INTEGRATOR_WEBAPP_ENTRY_SECRET` and `INTEGRATOR_WEBHOOK_SECRET` separately.

## User Linking

`webapp` never trusts channel identifiers as the canonical user key.

Canonical linking rules:

- platform ownership belongs to `webapp` users
- channel bindings are attributes, not the primary identity
- phone-based linking requires verified contact flows
- links are stored explicitly and audited

## Future Extensions

The contract is intentionally narrow so the services can evolve independently.

Later additions may include:

- booking synchronization events
- content access events
- payment access grants
- specialist assignment updates
