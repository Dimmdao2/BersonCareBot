# Integrator Contract

This document defines the explicit contract between `tgcarebot` and `webapp`.

**JSON Schemas** (canonical payload shapes):

- [Webapp entry token payload](../../contracts/webapp-entry-token.json) — decoded payload of `?t=<signed-token>` (bindings may include telegramId, maxId)
- [POST /api/integrator/events body](../../contracts/integrator-events-body.json) — webhook events from tgcarebot
- [POST /api/integrator/reminders/dispatch body](../../contracts/integrator-reminders-dispatch-body.json) — reminder dispatch payload (channelBindings: telegramId, maxId)
- [reminder.delivery.result payload](../../contracts/reminder-delivery-result-payload.json) — per-channel delivery outcome when eventType is `reminder.delivery.result`

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

**Rubitime / профиль:**

- `user.email.autobind` — payload: `phoneNormalized`, `email`. Эмитится интегратором при `event-create-record`, если в записи есть телефон и email. В webapp: невалидный email → пропуск; уже есть подтверждённый email → пропуск; email занят другим пользователем → конфликт (лог), автопривязка не выполняется; иначе email сохраняется как неподтверждённый.

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

The signature is an HMAC over `timestamp + "." + rawBody` using the **webhook secret** (webapp: `INTEGRATOR_WEBHOOK_SECRET`, or `INTEGRATOR_SHARED_SECRET` if not set). **Secret separation:** use one secret for webapp-entry tokens (`INTEGRATOR_WEBAPP_ENTRY_SECRET`) and a different one for webhooks (`INTEGRATOR_WEBHOOK_SECRET`). Integrator must support both: when building `?t=` tokens use entry secret; when signing outbound webhook requests or verifying incoming webapp→integrator calls use webhook secret. For backward compatibility, a single `INTEGRATOR_SHARED_SECRET` can be used for both; for production, set separate secrets.

## User Linking

`webapp` never trusts channel identifiers as the canonical user key.

Canonical linking rules:

- platform ownership belongs to `webapp` users
- channel bindings are attributes, not the primary identity
- phone-based linking requires verified contact flows
- links are stored explicitly and audited

## Flow 4: BersonCare → Integrator (send SMS code)

**Направление:** вебапп (bersoncare) вызывает интегратор для отправки SMS с кодом подтверждения. Код генерируется в вебапп; проверка кода — только в вебапп (интегратор не участвует в верификации).

### Запрос от вебапп к интегратору

**Метод и URL:** `POST {INTEGRATOR_API_URL}/api/bersoncare/send-sms`

**Заголовки:**

- `Content-Type: application/json`
- `X-Bersoncare-Timestamp` — Unix timestamp (секунды), строка
- `X-Bersoncare-Signature` — подпись: `HMAC-SHA256(secret, timestamp + "." + rawBody)` в base64url

**Тело (JSON):**

```json
{
  "phone": "+79991234567",
  "code": "123456"
}
```

Опционально: `idempotencyKey` (для идемпотентности на стороне интегратора при необходимости).

**Ответ интегратора:**

- `200`: `{ "ok": true }` — SMS принято к отправке
- `400`: `{ "ok": false, "error": "missing_headers" | "phone and code required" }`
- `401`: `{ "ok": false, "error": "invalid_signature" }`
- `502`: `{ "ok": false, "error": "<SMSC error>" }` — ошибка провайдера SMS
- `503`: `{ "ok": false, "error": "service_unconfigured" }` — не задан секрет

**Сценарий интегратора:** получение запроса от bersoncare → проверка подписи → вызов SMSC (или заглушки) с текстом вида «Ваш код BersonCare: {code}». Повторная проверка кода и привязка номера — только в вебапп.

---

## Flow 5: BersonCare → Integrator (send email code)

**Направление:** webapp (bersoncare) вызывает integrator для отправки email с OTP-кодом подтверждения. Генерация и проверка кода остаются на стороне webapp.

### Запрос от webapp к integrator

**Метод и URL:** `POST {INTEGRATOR_API_URL}/api/bersoncare/send-email`

**Заголовки:**

- `Content-Type: application/json`
- `X-Bersoncare-Timestamp` — Unix timestamp (секунды), строка
- `X-Bersoncare-Signature` — подпись: `HMAC-SHA256(secret, timestamp + "." + rawBody)` в base64url

**Тело (JSON):**

```json
{
  "to": "patient@example.com",
  "subject": "Ваш код BersonCare",
  "code": "123456",
  "templateId": "otp-default"
}
```

Поля:

- `to` — email получателя (обязательно)
- `code` — OTP-код (обязательно)
- `subject` — тема письма (опционально)
- `templateId` — идентификатор шаблона для будущего расширения (опционально)

**Ответы integrator:**

- `200 { "ok": true }` — письмо принято к отправке
- `400 { "ok": false, "error": "missing_headers" | "invalid_payload" }`
- `401 { "ok": false, "error": "invalid_signature" }`
- `503 { "ok": false, "error": "email_not_configured" }` — SMTP/mailer не настроен

---

## Flow: BersonCare → Integrator (send OTP — Telegram / Max)

**Направление:** webapp отправляет одноразовый код входа в привязанный мессенджер (не deep-link login). Подпись и заголовки — как в Flow 4 (send-sms) и Flow 6 (relay-outbound): `HMAC-SHA256(secret, timestamp + "." + rawBody)` в base64url.

**Метод и URL:** `POST {INTEGRATOR_API_URL}/api/bersoncare/send-otp`

**Заголовки:** как у Flow 4 (`Content-Type`, `X-Bersoncare-Timestamp`, `X-Bersoncare-Signature`).

**Тело (JSON):**

```json
{
  "channel": "telegram",
  "recipientId": "123456789",
  "code": "123456"
}
```

- `channel` — `telegram` | `max`
- `recipientId` — chat id в соответствующем боте
- `code` — OTP (обычно 6 цифр)

Текст пользователю: `Код для входа в BersonCare: {code}` (доставка через тот же dispatch, что и relay-outbound для канала).

**Ответы integrator:**

- `200 { "ok": true }` — сообщение принято к доставке
- `400 { "ok": false, "error": "missing_headers" | "invalid_payload" | "dispatch_client_error" }`
- `401 { "ok": false, "error": "invalid_signature" }`
- `502 { "ok": false, "error": "dispatch_failed" }`
- `503 { "ok": false, "error": "service_unconfigured" }` — не задан секрет

---

## Flow 6: BersonCare → Integrator (relay-outbound)

**Направление:** webapp (bersoncare) вызывает integrator для доставки сообщения врача пациенту через его мессенджер-канал.

### Запрос от webapp к integrator

**Метод и URL:** `POST {INTEGRATOR_API_URL}/api/bersoncare/relay-outbound`

**Заголовки:**

- `Content-Type: application/json`
- `X-Bersoncare-Timestamp` — Unix timestamp (секунды), строка
- `X-Bersoncare-Signature` — подпись: `HMAC-SHA256(secret, timestamp + "." + rawBody)` в base64url

**Тело (JSON):**

```json
{
  "messageId": "webapp-msg:uuid",
  "channel": "telegram" | "max" | "sms" | "email",
  "recipient": "chatId или phoneNormalized",
  "text": "Текст сообщения",
  "idempotencyKey": "messageId:channel:recipient",
  "metadata": { "optional": "meta" }
}
```

**Idempotency key:** `${messageId}:${channel}:${recipient}` — TTL 24 часа (in-memory).

**Ответы integrator:**

- `200 { ok: true, status: "accepted" }` — принято, доставлено в канал.
- `200 { ok: true, status: "duplicate" }` — idempotency hit, уже обрабатывалось.
- `400 { ok: false, error: "invalid_payload" | "missing_headers" }` — невалидный запрос.
- `401 { ok: false, error: "invalid_signature" }` — неверная подпись.
- `502 { ok: false, error: "dispatch_failed" }` — ошибка доставки в канал.
- `503 { ok: false, error: "service_unconfigured" }` — не задан секрет.

### Retry-политика webapp

Клиент `relayOutbound` в webapp делает до 4 попыток с задержками: `0s → 10s → 60s → 5min`.

### dev_mode guard

Если в `system_settings` включён `dev_mode` (scope: admin), relay отправляется только для userId из whitelist `integration_test_ids`. Проверка выполняется через `systemSettingsService.shouldDispatch(userId)`.

### Каналы dispatch

| channel | recipient | Адаптер integrator |
|---------|-----------|-------------------|
| `telegram` | chatId (string/number) | `createTelegramDeliveryAdapter` |
| `max` | chatId (string/number) | `createMaxDeliveryAdapter` |
| `sms` | phoneNormalized | `createSmscDeliveryAdapter` |
| `email` | не реализован | пропуск с логом |

---

## Flow: BersonCare → Integrator (Rubitime record create + projection)

**Направление:** webapp → integrator → Rubitime API2 `create-record`. После успешного создания integrator автоматически запускает post-create projection: fetch записи → нормализация → Google Calendar sync (best-effort) → `booking.upsert` (→ `appointment_records` через projection outbox).

### `POST {INTEGRATOR_API_URL}/api/bersoncare/rubitime/create-record`

**Заголовки:** как Flow 4 (`X-Bersoncare-Timestamp`, `X-Bersoncare-Signature`, raw JSON body).

**Тело (v2 — explicit IDs):**

```json
{
  "version": "v2",
  "rubitimeBranchId": "10",
  "rubitimeCooperatorId": "20",
  "rubitimeServiceId": "30",
  "slotStart": "2026-04-10T10:00:00.000Z",
  "patient": { "name": "Иван", "phone": "+79990001122", "email": "ivan@example.com" }
}
```

**Ответ:**

- `200 { ok: true, recordId: "79380", data: {...} }` — создано + projection запущена.
- `200 { ok: true, recordId: "79380", data: {...}, projectionWarning: "fetch_failed" }` — создано, но projection не прошла (запись видна пациенту, но не врачу до следующего webhook).
- `400 { ok: false, error: "invalid_create_record_input" | "invalid_rubitime_ids" }` — невалидные данные.
- `502 { ok: false, error: "..." }` — ошибка Rubitime API.

**Политика ошибок:** ошибка Rubitime API = ошибка для юзера (502). Projection (fetch/gcal/upsert) — non-blocking: HTTP 200 возвращается с `projectionWarning`, если projection не прошла. Webapp не блокирует UX при projection failure — webhook Rubitime впоследствии закроет gap.

---

## Flow: BersonCare → Integrator (Rubitime record reverse API)

**Направление:** вебапп (сессия врача) вызывает интегратор; интегратор — `POST https://rubitime.ru/api2/update-record` / `remove-record` с API-ключом Rubitime.

### `POST {INTEGRATOR_API_URL}/api/bersoncare/rubitime/update-record`

**Заголовки:** как Flow 4 (`X-Bersoncare-Timestamp`, `X-Bersoncare-Signature`, raw JSON body).

**Тело:**

```json
{
  "recordId": "79379",
  "patch": { "status": 4 }
}
```

`patch` — дополнительные поля Rubitime API (кроме `id`/`rk`, они подставляются интегратором).

### `POST {INTEGRATOR_API_URL}/api/bersoncare/rubitime/remove-record`

**Тело:** `{ "recordId": "79379" }` (или числовой `recordId`).

**Webapp proxy (doctor):**

- `POST /api/doctor/appointments/rubitime/update`
- `POST /api/doctor/appointments/rubitime/cancel`

Те же подписи к integrator формируются на стороне webapp через общий webhook secret.

---

## Future Extensions

The contract is intentionally narrow so the services can evolve independently.

Later additions may include:

- booking synchronization events
- content access events
- payment access grants
- specialist assignment updates
