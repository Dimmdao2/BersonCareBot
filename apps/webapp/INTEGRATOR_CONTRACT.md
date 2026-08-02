# Integrator Contract

This document defines the explicit contract between `tgcarebot` and `webapp`.

**Runtime note (2026-04):** production uses **one** PostgreSQL (`integrator` + `public` schemas). Machine-to-machine HTTP below remains for **cross-service** calls (separate Node processes). It is **not** the primary way to persist patient canon when integrator already has DB access to `public` — see `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`.

**JSON Schemas** (canonical payload shapes):

- [Webapp entry token payload](../../contracts/webapp-entry-token.json) — decoded payload of `?t=<signed-token>` (bindings may include telegramId, maxId)
- [POST /api/integrator/events body](../../contracts/integrator-events-body.json) — webhook events from tgcarebot
- [POST /api/integrator/reminders/dispatch body](../../contracts/integrator-reminders-dispatch-body.json) — reminder dispatch payload (channelBindings: telegramId, maxId)
- [reminder.delivery.result payload](../../contracts/reminder-delivery-result-payload.json) — per-channel delivery outcome when eventType is `reminder.delivery.result`

## Contract Principles

- **Доступ к базе (действующее правило, 30.07):** при единой PostgreSQL интегратор читает и пишет `public` **только
  через свой слой портов** — `apps/integrator/src/infra/db/**` (репозитории и транзакции); из доменного и сценарного кода
  обращаться к базе нельзя. Вебапп так же ходит только через свои порты и адаптеры. M2M HTTP существует исключительно для
  того, что действительно является контрактом на границе процессов (идемпотентность, авторизация, маршрутизация), и
  **не** является способом писать канонические данные.
- **Signed HTTP JSON:** for integrator clients that parse JSON from webapp (including `webappEventsClient.emit` on `POST /api/integrator/events`), **success requires** `ok === true` in the body for 200/202. The same rule applies to signed **`GET`** integrations that return a JSON envelope: do not treat a call as successful unless `ok === true`, even when `fetch` reports `res.ok`.
- **Messenger phone bind (unified DB):** one SQL transaction updates `public` (binding-first) and `integrator` contact state; orchestrator link-data reads patient phone from `public` with a legacy fallback to `integrator.contacts`. Stable machine reasons and user copy: `docs/archive/2026-04-initiatives/WEBAPP_FIRST_PHONE_BIND/PRODUCT_REASONS_AND_UX_TABLE.md`.
- **Optional `POST /api/integrator/messenger-phone/bind` (M2M, external caller only):** same TX semantics as integrator `user.phone.link` (`writePort`), implemented in webapp as `executeMessengerPhoneHttpBind` (SQL aligned with `messengerPhonePublicBind` / `setUserPhone` / identity helpers — not imported from `apps/integrator` so the Next.js bundle does not pull integrator `.js`-path modules). **Do not** use this from the normal Telegram/Max phone-link hot path when integrator and webapp share one PostgreSQL — that path stays TX-local in the integrator process. **Auth:** `x-bersoncare-timestamp`, `x-bersoncare-signature` (HMAC-SHA256 of the concatenation `timestamp`, a dot, and the raw JSON body, with `INTEGRATOR_WEBHOOK_SECRET`, base64url — same construction as other signed integrator POST routes), **`x-bersoncare-idempotency-key`** (required, max 256 chars). **Body (JSON):** `channelCode` (`telegram` \| `max`), `externalId`, `phoneNormalized`; optional `correlationId`, optional `idempotencyKey` (must match header if present). **Idempotency:** response is cached only on **success** (`200`); semantic hash covers `channelCode` + `externalId` + `phoneNormalized` only. Replay with same key + same body → same `200`; key reused with different semantic body → **`409`**. **Responses:** **`200`** `{ ok: true, platformUserId, idempotencyKey }` · **`422`** `{ ok: false, reason, idempotencyKey }` for `no_channel_binding`, `no_integrator_identity`, `phone_owned_by_other_user`, `integrator_id_mismatch` · **`503`** `{ ok: false, reason: "db_transient_failure", idempotencyKey, indeterminate?: true }` · **`401`** invalid signature (no secret in logs) · **`400`** missing/invalid headers or body validation. Checklist: `docs/archive/2026-04-initiatives/WEBAPP_FIRST_PHONE_BIND/STAGE_06_OPTIONAL_HTTP_BIND_ROUTE.md`.
- **Phone messenger bind complete (`POST /api/integrator/phone-messenger-bind/complete`):** same signed headers as channel-link M2M. **Body (JSON):** `setupToken` (`auth_*` from deep link), `channelCode` (`telegram` \| `max`), `externalId`, `phoneNormalized` (contact from messenger, E.164). **200** always includes **`purpose`**: `login` \| `profile_bind`. **`purpose: login`** — `{ ok: true, purpose: "login", otpCode, accountCreated, challengeId }`; OTP in webapp, secret → `otp_ready`; integrator runs **`user.phone.link` before success UX** and sends `*:phoneAuthReturnToApp` + main menu (no OTP text in messenger; Max inline via **`expandContentMenuParam`** in executor). When `facts.links.webappHomeUrl` is present, integrator also sends a separate inline message `*:phoneAuthOpenAppPrompt` with a **browser URL** button (`urlFact: links.webappHomeUrl` in `buildReplyMarkup` — ordinary `{ url }`, not `{ web_app }`) so login can continue in the mobile browser via `/app/tg?t=…`. **Replay** when secret already **`otp_ready`**: `{ …, replay: true }` — menu only, no duplicate code message and **no** open-app URL button. **`purpose: profile_bind`** — `{ ok: true, purpose: "profile_bind" }` (no `otpCode`); secret → `consumed`; integrator `user.phone.link` + `*:phoneAuthPhoneLinked` + main menu (Telegram reply keyboard «Запись» + Web App «Приложение»; Max inline `menu.main`). Any bind failure (webapp error, indeterminate `user.phone.link`, missing `writePort`) → failure template when configured + **main menu** (`menuOnly`, no `request_contact`). **Cancel in phoneauth:** scripts `*.phoneauth.cancel.*` (priority 57), not `menu.default` / `confirmQuestion`. **409** `phone_mismatch` \| `conflict` + `mergeReason`. **200** `{ ok: true, status: "already_used" }` when secret **`consumed`** / `used_token`. **Integrator:** action `webapp.phoneMessengerBind.complete`; `/start auth_*` → `start.phoneauth`; state `await_phoneauth:<token>` until contact. **Webapp client:** `POST /api/auth/phone/messenger-bind/start`, `POST /api/auth/phone/messenger-bind/status` — **`login`:** poll until `otp_ready` then **`POST /api/auth/phone/messenger-bind/finish`** (server-side confirm, no OTP in browser); on return to the PWA tab, **`visibilitychange`** triggers an immediate status refetch (not only the 2.5s interval). **`profile_bind`:** until `consumed`. **Staff bot admin:** `isAdmin` in webhook facts = env admin ∪ `admin_*_ids` ∪ `doctor_*_ids` from `public.system_settings`; resolver cache expires within 60 seconds. Plans: [`.cursor/plans/phone_messenger_bind_pwa_autologin.plan.md`](../../.cursor/plans/phone_messenger_bind_pwa_autologin.plan.md), [`.cursor/plans/phone_messenger_bind_bot_ux.plan.md`](../../.cursor/plans/phone_messenger_bind_bot_ux.plan.md). Runbook: `docs/OPERATIONS/PHONE_MESSENGER_AUTH_RUNBOOK.md`. Module doc: `apps/webapp/src/modules/auth/auth.md` (§ Phone messenger bind).
- **Channel-link complete (`POST /api/integrator/channel-link/complete`):** same signed headers as other integrator M2M POSTs (`x-bersoncare-timestamp`, `x-bersoncare-signature` over `timestamp + "." + rawBody`, `INTEGRATOR_WEBHOOK_SECRET`, base64url). **Body (JSON):** `linkToken` (`link_*`), `channelCode` (`telegram` \| `max`), `externalId`. **200** `{ ok: true, needsPhone?, phoneNormalized? }` on success; **200** `{ ok: true, status: "already_used", needsPhone }` when the token was already consumed (idempotent replay). **409** `{ ok: false, error: "conflict", mergeReason? }` when the row in `user_channel_bindings` cannot be reconciled with the token user — stable webapp codes include `channel_owned_by_real_user`, `channel_link_claim_rejected`, `channel_link_claim_failed` (see `apps/webapp/src/modules/auth/channelLink.ts`, `channelLinkClaim.ts`). **Integrator:** `webappEventsClient.completeChannelLink` passes **`mergeReason` in preference to `error`** when the HTTP response is not OK, so `executeAction` / `channelLinkCompleteFailureTemplateKey` can choose `channelLink.completeFailed.conflict` vs `…generic` vs `…expired`. **After HTTP success** with `phoneNormalized`, the scenario step `webapp.channelLink.complete` still runs **sequential** `writeDb` in integrator (`user.phone.link`, then for Telegram `user.state.set`); if `user.phone.link` does not apply (`userPhoneLinkApplied` / indeterminate), the action ends **`failed`** with `values.channelLink.ok: false`, `webappComplete: true`, user-visible `channelLink.completeFailed.*` — no success templates (`max:afterChannelLinked` / Telegram welcome keyboard). Product copy and policy: `apps/webapp/src/modules/auth/auth.md` (§Channel link → integrator). Plan / closure: [`.cursor/plans/archive/phone_bind_mismatch_ux.plan.md`](../../.cursor/plans/archive/phone_bind_mismatch_ux.plan.md).
- **Observability:** messenger TX bind logs use `event: messenger_phone_bind_tx` with `bind_tx_ok` / `bind_tx_fail`, fields `channelCode`, `externalId`, optional `correlationId` and `platformUserId`, `phoneSuffix` (not full numbers), and on failure `reason` (machine code, e.g. `no_channel_binding`, `MessengerPhoneLinkError` codes) plus optional `sqlState` when PostgreSQL reports an error. Log lines include a `metric` field for aggregation: `messenger_bind_ok` / `messenger_bind_tx_fail`. Legacy `webappEventsClient.emit` warns with `metric: integrator_emit_body_reject` when `POST /api/integrator/events` returns 200/202 but `ok` is not `true`, or the body is empty / not JSON. Checklist: `docs/archive/2026-04-initiatives/WEBAPP_FIRST_PHONE_BIND/STAGE_05_OBSERVABILITY_TESTS_DOCS.md`.
- all machine-to-machine calls are authenticated with a shared secret
- all machine-to-machine writes are idempotent
- transport/channel semantics stay in `tgcarebot`
- product semantics stay in `webapp`

## Flow 1: Signed Webapp Entry

`tgcarebot` sends a button or deep link that opens the webapp entry with a signed token:

- **Telegram:** `https://bersoncare.ru/app/tg?t=<signed-token>` (and optional `&next=` URL-encoded path under `/app/...`).
- **MAX:** `https://bersoncare.ru/app/max?t=<signed-token>` (same optional `next=`).

Integrator/reminder URLs **usually include** `?t=` (JWT-style signed token); if it is absent, bootstrap may still authenticate from messenger **initData** first (`telegram-init` / `max-init`) and only rely on **`POST /api/auth/exchange`** with `?t=` after the messenger poll soft-cap — see client `AuthBootstrap`.

Legacy `https://bersoncare.ru/app?t=<signed-token>&ctx=bot|max` may still appear in old links; webapp middleware normalizes `ctx` into cookies and (for `ctx=max` on `/app`) redirects to `/app/max`. **Канон (2026-05-27):** заход на **`/app/tg`** / **`/app/max`** без `ctx` тоже выставляет **`bersoncare_platform=bot`** и **`bersoncare_messenger_surface`** через **`applyMessengerEntryPathCookies`** в `proxy.ts` (если cookie ещё нет) — см. `apps/webapp/src/shared/lib/platform.md`.

Token payload shape:

```json
{
  "sub": "tg:123456789",
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

`sub` encoding (integrator token builder):

- Telegram users: **`tg:<chatId>`** (numeric Telegram chat/user id).
- MAX users: **`max:<externalMaxId>`** (string external id).

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

**Канон для пациентских напоминаний по правилам:** доставка идёт через integrator **`schedule.tick`** → **`reminders.dispatchDue`** → запись в **`public.outgoing_delivery_queue`** и обработку integrator worker (см. `apps/integrator/src/content/scheduler/scripts.json`, unit **`bersoncarebot-scheduler-prod.service`** в `deploy/systemd/`). Паритет доставки напоминаний в MAX (очередь, stale-delete, ключи логов): `docs/ARCHITECTURE/MAX_SETUP.md`.

Этот HTTP-эндпоинт остаётся **legacy/контрактным**: после проверки подписи и idempotency тело валидируется и передаётся в `handleReminderDispatch`, который **не** выполняет доставку в мессенджеры (ответ **503** с `accepted: false`). Не использовать его как основной путь напоминаний в production.

Purpose (исторический контекст в контракте):

- allow the `webapp` reminder scheduler to ask `tgcarebot` to deliver a reminder through messenger channels

After signature and idempotency checks, the body is validated and passed to domain handler `handleReminderDispatch(body)`.

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

### D7: callback capabilities for reminder actions

HTTP routes `POST /api/integrator/reminders/occurrences/{done,snooze,skip}`, `mute`,
`messenger-topic/disable` and `notification-settings` are retired. The integrator invokes the narrow
`app.patient_*` reminder functions via its Drizzle port under the already-installed signed callback
principal; each function derives the integrator user and exact organization itself and returns no row
on an unresolved or foreign principal. `done` returns `doneAt`, `firstDoneForOccurrence`,
`dayDoneCount`, `daySentTotal` and `dayFullyDone` for the existing callback UX; it records the
canonical `reminder_journal` action and acts on the exact-organization occurrence history.

After a successful `done`, the bot deletes the reminder message; when
`firstDoneForOccurrence && dayFullyDone && daySentTotal > 0`, it sends `reminder.dayAllDone`. See
[`apps/webapp/src/modules/reminders/reminders.md`](src/modules/reminders/reminders.md) §«Бот».

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

**SMTP на integrator:** параметры исходящей почты читаются из **`system_settings.smtp_outbound`** (admin, зеркало после sync) с коротким TTL-кэшем; при неполной строке в БД используется legacy **env** `SMTP_*` / `MAIL_*` интегратора (см. `apps/integrator/src/config/smtpOutbound.ts`).

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

Транзакционное письмо с готовым текстом (legacy/прочие transactional, не OTP):

```json
{
  "to": "patient@example.com",
  "subject": "Информационное письмо BersonCare",
  "text": "…готовый текст письма…"
}
```

Поля:

- `to` — email получателя (обязательно)
- `code` — OTP-код (обязательно для OTP; **не** указывать вместе с `text`)
- `text` — готовый текст письма (для transactional без OTP; обязателен, если нет `code`)
- `subject` — тема письма (опционально)
- `templateId` — идентификатор шаблона для будущего расширения (опционально)

Требуется **либо** непустой `code`, **либо** непустой `text`.

**Ответы integrator:**

- `200 { "ok": true }` — письмо принято к отправке
- `400 { "ok": false, "error": "missing_headers" | "invalid_payload" }`
- `401 { "ok": false, "error": "invalid_signature" }`
- `503 { "ok": false, "error": "email_not_configured" }` — не настроен SMTP (нет полного `smtp_outbound` в БД и нет полного набора `SMTP_*` / `MAIL_*` в env integrator)

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
  "organizationId": "required UUID for web_push; optional for legacy non-tenant channels",
  "channel": "telegram" | "max" | "sms" | "email" | "web_push",
  "recipient": "channel recipient; platform user UUID for web_push",
  "text": "Текст сообщения",
  "idempotencyKey": "organizationId-or-global:messageId:channel:recipient",
  "metadata": { "optional": "meta" }
}
```

**Idempotency key:** `${organizationId ?? "global"}:${messageId}:${channel}:${recipient}` — TTL 24 часа, хранится durable в `integrator.idempotency_keys` (через `IdempotencyPort`, тот же store, что и у event gateway / booking-lifecycle) и переживает рестарт процесса и смену реплики. Tenant входит в ключ; одновременный дубль в рамках одного процесса, пока первая отправка ещё не завершена, получает retryable `503 dispatch_in_flight` (in-memory guard, не переживает рестарт); после рестарта или на другой реплике повтор с тем же ключом получает `200 duplicate` сразу, без повторной доставки.

**Ответы integrator:**

- `200 { ok: true, status: "accepted" }` — принято, доставлено в канал.
- `200 { ok: true, status: "duplicate" }` — idempotency hit, уже обрабатывалось.
- `200 { ok: true, status: "skipped" }` — канал намеренно пропущен по fail-closed readiness.
- `400 { ok: false, error: "invalid_payload" | "missing_headers" }` — невалидный запрос.
- `401 { ok: false, error: "invalid_signature" }` — неверная подпись.
- `502 { ok: false, error: "dispatch_failed" }` — ошибка доставки в канал.
- `503 { ok: false, error: "dispatch_in_flight" }` — тот же tenant-scoped ключ ещё обрабатывается; запрос можно повторить.
- `503 { ok: false, error: "service_unconfigured" }` — не задан секрет.

### Retry-политика webapp

Клиент `relayOutbound` в webapp делает до 4 попыток с задержками: `0s → 10s → 60s → 5min`.

### Dedicated operator-alert relay

Критические операторские алерты используют только `POST /api/bersoncare/operator-alert-relay` через
typed server-owned клиент `relayOperatorAlert`. Каналы фиксированы: `telegram | max | sms | email | web_push`.
Маркер policy capability `operator_security/operator_alert` создаёт только этот route; generic
`relay-outbound` отвергает поле `purpose` и не может повысить capability произвольного сообщения.

Для incident cadence `messageId` включает UUID строки incident и фазу (`initial` или
`one_hour_repeat`). Поэтому повтор одной фазы попадает в 24h dedup, а T0, T+1h и новый incident
после resolve получают разные стабильные ключи. SMS readiness и фактический `SmsClient` читают одну
fail-closed конфигурацию из глобального `public.system_settings` через integrator
`publicSystemSettings` helper (`smsc_enabled` + `smsc_api_key`). Disabled/missing/read failure
возвращает `200 skipped`, не блокируя остальные каналы. WebPush всегда передаёт фактическую пару
`organizationId + platform user UUID`, полученную из активного staff membership.

### dev_mode guard

> **KNOWN GAP — 2026-07-27.** Описанный telegram/max-only filter ниже не является correct behaviour: §23 требует покрыть каждый канал, включая SMS и email. См. строку **«Уведомления»** в [`CURRENT_AUTHORITY_MAP.md`](../../docs/CURRENT_AUTHORITY_MAP.md).

Если в `system_settings` включён `dev_mode` (scope: admin), исходящий relay из webapp разрешён только когда пара **`channel` + `recipient`** (Telegram chat id / Max user id) попадает в списки **`test_account_identifiers`** (`telegramIds` / `maxIds`). Проверка: `systemSettingsService.shouldDispatchRelayToRecipient({ channel, recipient })`. Ключ **`integration_test_ids`** остаётся в схеме настроек как legacy, **не** используется для этого guard в текущем webapp.

Экран **`/app/doctor/broadcasts`** в предпросмотре учитывает ту же семантику для оценки доставки в мессенджер (пересечение сегмента с тестовыми Telegram/Max ID). Подробнее: **`docs/ARCHITECTURE/DOCTOR_BROADCASTS.md`**.

**Массовые рассылки врача** (`/app/doctor/broadcasts`): после подтверждения webapp пишет `broadcast_audit`, **`broadcast_audit_recipients`** (все eligible, в т.ч. push-only) и строки в `public.outgoing_delivery_queue` с `kind = doctor_broadcast_intent` и **`payload_json.attachMenu`** при включённой опции меню; доставка идёт **воркером integrator** (`dispatchOutgoing`), без HTTP `relay-outbound` на каждого получателя. См. **`docs/ARCHITECTURE/DOCTOR_BROADCASTS.md`**.

### Каналы dispatch

| channel    | recipient              | Адаптер integrator              |
| ---------- | ---------------------- | ------------------------------- |
| `telegram` | chatId (string/number) | `createTelegramDeliveryAdapter` |
| `max`      | chatId (string/number) | `createMaxDeliveryAdapter`      |
| `sms`      | phoneNormalized        | `createSmscDeliveryAdapter`     |
| `email`    | email address          | `createEmailDeliveryAdapter`    |
| `web_push` | platform user UUID     | `createWebPushDeliveryAdapter`  |

---

## Flow 6b: BersonCare → Integrator (request-contact)

**Направление:** webapp вызывает integrator, чтобы в **личный чат** пользователя ушло сообщение с кнопкой запроса контакта (Telegram: reply keyboard `request_contact`; MAX: inline `request_contact`). **Основной** сценарий привязки — действия пользователя **в боте** без привязанного номера в канале: сценарии `scripts.json` с `context.linkedPhone: false` и центральный гейт в `buildPlan` для callback (прод: `processAcceptedIncomingEvent` → `buildPlan`, не `handleUpdate`). M2M-вызов — **страховка** из Mini App, если WebApp уже открыт, а в `/api/me` ещё нет tier **patient** (см. `patientMessengerContactGate`).

**Метод и URL:** `POST {INTEGRATOR_API_URL}/api/bersoncare/request-contact`

**Заголовки:** как Flow 6 (`X-Bersoncare-Timestamp`, `X-Bersoncare-Signature`, raw JSON body).

**Тело (JSON):**

```json
{
  "channel": "telegram" | "max",
  "recipientId": "внешний id пользователя в канале (chat id)",
  "idempotencyKey": "строка с окном времени (webapp: bucket 5 минут на channel+recipientId)"
}
```

**Ответы:** `200 { ok: true, status: "accepted" | "duplicate" }`, ошибки как у send-otp / relay-outbound (`invalid_signature`, `dispatch_failed`, …).

**Идемпотентность (integrator):** дедуп по `idempotencyKey` хранится в durable store `integrator.idempotency_keys` (через `IdempotencyPort`, тот же механизм, что и у event gateway) — переживает рестарт процесса и общий для всех реплик API; TTL задаётся в коде роутера.

**Webapp → integrator:** если в сессии **оба** binding (Telegram и Max), заголовок **`X-Bersoncare-Contact-Channel: telegram | max` обязателен**; иначе **`400`** с `contact_channel_required`. При одном канале заголовок опционален (канал выводится из сессии). Лимит **60 с** на `userId` на route handler обновляется **только после успешного** ответа integrator (`ok: true`, в т.ч. **`duplicate`** — чат уже получил или дедупнул запрос).

**До вызова integrator:** `POST /api/patient/messenger/request-contact` может вернуть **`400 { ok: false, error: "not_required" }`**, если активация телефона уже не в состоянии `need_activation` — тогда integrator не вызывается; Mini App снимает гейт и закрывает WebView (`closeMessengerMiniApp`), без отдельной кнопки «Проверить снова».

Для `telegram` integrator дополнительно выставляет состояние диалога `await_contact:subscription` (как при сценарии привязки в боте). Для **max** отдельного `setUserState` в PostgreSQL интегратора нет (состояние ведёт сценарий MAX).

**Reply-меню Telegram (`sendMenuOnButtonPress`):** автоподмешивание главной reply-клавиатуры из `replyMenu.json` к `message.send` / `message.compose` для пользователя выполняется в executor **только при** `ctx.base.linkedPhone === true`, чтобы не обходить гейт контакта.

**Главное инлайн-меню MAX:** для исходящих `message.send` / `message.compose`, если в `delivery.channels` есть **`max`** (или канал не задан и `event.meta.source === 'max'`), у пользователя **`linkedPhone === true`**, в payload задан числовой **`recipient.chatId`** (иначе MAX send недопустим и меню не подмешивается — напр. телефон без fan-out) и ещё **нет** `replyMarkup`, executor подмешивает **`menus.main`** из контент-бандла **`max/user`** (три кнопки WebApp из фактов `links.*`).

---

## Flow: Webapp M2M — patient Web Push (запись, рассылки)

**Endpoint:** `POST /api/integrator/patient-notifications/web-push`

**Headers:** `x-bersoncare-timestamp`, `x-bersoncare-signature`, `x-bersoncare-idempotency-key` (как у других signed M2M).

**Body (JSON):** обязательный `organizationId` (UUID подписанного tenant-контекста) и один из идентификаторов пользователя — `integratorUserId` (digits) или `phoneNormalized`; для internal fan-out из webapp допустим `platformUserId` (UUID, не используется integrator HTTP-клиентом). После HMAC webapp устанавливает organization principal до idempotency/read-path и отклоняет разрешившегося пользователя без активного enrollment в этой организации.

| Поле             | Описание                                                                     |
| ---------------- | ---------------------------------------------------------------------------- |
| `intentType`     | `appointment_lifecycle` \| `appointment_reminder` \| `news`                  |
| `topicCode`      | id темы из `notifications_topics` (например `appointment_reminders`, `news`) |
| `variant`        | для lifecycle: `created` \| `cancelled` \| `rescheduled`                     |
| `slotStartIso`   | ISO слота (lifecycle / reminder)                                             |
| `broadcastTitle` | для `news` — заголовок рассылки (тело push = «Новости» + preview)            |
| `openUrl`        | same-origin путь (`/app/...`)                                                |
| `stableKey`      | idempotency tag push (≤240 символов)                                         |
| `nowIso`         | опционально для расчёта «осталось N часов/дней»                              |

**Ответ 200:** `{ ok: true, webPushDelivered?, webPushErrors?, skipped? }`.

**Doctor broadcasts:** webapp fan-out при канале `push` в UI рассылок (`intentType: news`, `topicCode: news`) — in-process, без HTTP. Полный текст — в PWA-чат (`support_conversation_messages`); `openUrl` для push: `/app/patient/messages`. Legacy `/app/patient/broadcasts/{auditId}` → редирект в чат.

**Booking lifecycle (`appointment_lifecycle`):** при web-push из integrator текст дублируется в PWA-чат; `openUrl` для push — `/app/patient/messages` (integrator и webapp переопределяют `/app/patient/booking`). `appointment_reminder` и напоминания о занятиях — без изменений.

---

## Flow: Webapp M2M — reminder notify-channels (push copy)

**Endpoint:** `POST /api/integrator/patient-reminders/notify-channels`

Помимо `title` / `bodyText` (для email и legacy) в body передаются поля для **Web Push copy**: `linkedObjectType`, `linkedObjectId`, `reminderIntent`, `occurrenceCategory`, `customTitle`. Модуль `pushNotificationCopy` строит заголовок/тело (разминка, тренировка, custom, skip legacy категорий). Idempotency: `prn:<occurrenceId>:channels`.

---

## Flow: Webapp M2M — support chat (пациент ↔ врач)

Канон UX и ограничения: [`docs/ARCHITECTURE/PATIENT_SUPPORT_CHAT_INBOX.md`](../../docs/ARCHITECTURE/PATIENT_SUPPORT_CHAT_INBOX.md), program note: [`docs/ARCHITECTURE/DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md`](../../docs/ARCHITECTURE/DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md).

**Headers:** `x-bersoncare-timestamp`, `x-bersoncare-signature`, `x-bersoncare-idempotency-key` (как у других signed M2M).

### `POST /api/integrator/support/sync-user-message`

Входящее сообщение пациента из бота в thread `webapp:platform:{platformUserId}`. После записи в thread — уведомление staff (doctor/admin). **Канон каналов:** [`docs/ARCHITECTURE/NOTIFICATION_CHANNELS.md`](../../docs/ARCHITECTURE/NOTIFICATION_CHANNELS.md) — **Web Push основной**; topics `doctor_patient_messages` / `doctor_patient_program_notes`: по умолчанию **`web_push` → `telegram` → `max`** (при подписке/привязках); матрица `/app/settings`; env `doctor_telegram_ids` / `admin_telegram_ids` — fallback **только** для telegram/max.

### `POST /api/integrator/support/admin-reply`

Ответ врача/админа из бота в тот же thread.

**Body (JSON):** `integratorConversationId`, `integratorMessageId`, `text`, `createdAt`; опционально
**`senderDisplayName`** (имя отправителя для redacted-уведомления) и **`programNoteStageItemId`** — при ответе
на наблюдение по упражнению webapp добавляет префикс `Ответ на ваш комментарий к упражнению «…»:` перед текстом.
Если `senderDisplayName` отсутствует (в том числе при rolling deploy со старым integrator), payload принимается,
а уведомление содержит нейтральное «новое сообщение от специалиста» без текста ответа.

**Idempotency key:** `support-admin:{integratorMessageId}`.

**Ответ 200:** `{ ok: true }` (и поля доставки пациенту по каналам — см. `integratorSupportBridge`).

### `POST /api/integrator/program-note/reply-begin`

Подготовка режима ответа на program note (callback `program_reply:{stageItemId}` в Telegram/MAX).

**Body (JSON):** `{ stageItemId: uuid }`.

**Ответ 200:** `{ ok: true, programNoteReplyState, platformUserId, exerciseTitle, integratorConversationId }` — `programNoteReplyState` имеет вид `admin_reply:webapp:platform:{platformUserId}#pn:{stageItemId}` для `user.state.set` в integrator.

**Integrator action:** `webapp.programNote.replyBegin` → сценарии `telegram.admin.programNote.reply.start` / `max.admin.programNote.reply.start`.

---

## Future Extensions

The contract is intentionally narrow so the services can evolve independently.

Later additions may include:

- booking synchronization events
- content access events
- payment access grants
- specialist assignment updates
