# Integrator Contract

This document defines the explicit contract between `tgcarebot` and `webapp`.

**Runtime note (2026-04):** production uses **one** PostgreSQL (`integrator` + `public` schemas). Machine-to-machine HTTP below remains for **cross-service** calls (separate Node processes). It is **not** the primary way to persist patient canon when integrator already has DB access to `public` — see `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`.

**JSON Schemas** (canonical payload shapes):

- [Webapp entry token payload](../../contracts/webapp-entry-token.json) — decoded payload of `?t=<signed-token>` (bindings may include telegramId, maxId)
- [POST /api/integrator/events body](../../contracts/integrator-events-body.json) — webhook events from tgcarebot
- [POST /api/integrator/reminders/dispatch body](../../contracts/integrator-reminders-dispatch-body.json) — reminder dispatch payload (channelBindings: telegramId, maxId)
- [reminder.delivery.result payload](../../contracts/reminder-delivery-result-payload.json) — per-channel delivery outcome when eventType is `reminder.delivery.result`

## Contract Principles

- **Legacy wording:** «no direct database reads between services» applied when integrator and webapp had **separate** databases. With **unified** PostgreSQL, integrator may read/write `public` per product rules; M2M HTTP stays for endpoints that are still process-boundary contracts (idempotency, auth, routing).
- **Signed HTTP JSON:** for integrator clients that parse JSON from webapp (including `webappEventsClient.emit` on `POST /api/integrator/events`), **success requires** `ok === true` in the body for 200/202. The same rule applies to signed **`GET`** integrations that return a JSON envelope: do not treat a call as successful unless `ok === true`, even when `fetch` reports `res.ok`.
- **Messenger phone bind (unified DB):** one SQL transaction updates `public` (binding-first) and `integrator` contact state; orchestrator link-data reads patient phone from `public` with a legacy fallback to `integrator.contacts`. Stable machine reasons and user copy: `docs/archive/2026-04-initiatives/WEBAPP_FIRST_PHONE_BIND/PRODUCT_REASONS_AND_UX_TABLE.md`.
- **Optional `POST /api/integrator/messenger-phone/bind` (M2M, external caller only):** same TX semantics as integrator `user.phone.link` (`writePort`), implemented in webapp as `executeMessengerPhoneHttpBind` (SQL aligned with `messengerPhonePublicBind` / `setUserPhone` / identity helpers — not imported from `apps/integrator` so the Next.js bundle does not pull integrator `.js`-path modules). **Do not** use this from the normal Telegram/Max phone-link hot path when integrator and webapp share one PostgreSQL — that path stays TX-local in the integrator process. **Auth:** `x-bersoncare-timestamp`, `x-bersoncare-signature` (HMAC-SHA256 of the concatenation `timestamp`, a dot, and the raw JSON body, with `INTEGRATOR_WEBHOOK_SECRET`, base64url — same construction as other signed integrator POST routes), **`x-bersoncare-idempotency-key`** (required, max 256 chars). **Body (JSON):** `channelCode` (`telegram` \| `max`), `externalId`, `phoneNormalized`; optional `correlationId`, optional `idempotencyKey` (must match header if present). **Idempotency:** response is cached only on **success** (`200`); semantic hash covers `channelCode` + `externalId` + `phoneNormalized` only. Replay with same key + same body → same `200`; key reused with different semantic body → **`409`**. **Responses:** **`200`** `{ ok: true, platformUserId, idempotencyKey }` · **`422`** `{ ok: false, reason, idempotencyKey }` for `no_channel_binding`, `no_integrator_identity`, `phone_owned_by_other_user`, `integrator_id_mismatch` · **`503`** `{ ok: false, reason: "db_transient_failure", idempotencyKey, indeterminate?: true }` · **`401`** invalid signature (no secret in logs) · **`400`** missing/invalid headers or body validation. Checklist: `docs/archive/2026-04-initiatives/WEBAPP_FIRST_PHONE_BIND/STAGE_06_OPTIONAL_HTTP_BIND_ROUTE.md`.
- **Channel-link complete (`POST /api/integrator/channel-link/complete`):** same signed headers as other integrator M2M POSTs (`x-bersoncare-timestamp`, `x-bersoncare-signature` over `timestamp + "." + rawBody`, `INTEGRATOR_WEBHOOK_SECRET`, base64url). **Body (JSON):** `linkToken` (`link_*`), `channelCode` (`telegram` \| `max`), `externalId`. **200** `{ ok: true, needsPhone?, phoneNormalized? }` on success; **200** `{ ok: true, status: "already_used", needsPhone }` when the token was already consumed (idempotent replay). **409** `{ ok: false, error: "conflict", mergeReason? }` when the row in `user_channel_bindings` cannot be reconciled with the token user — stable webapp codes include `channel_owned_by_real_user`, `channel_link_claim_rejected`, `channel_link_claim_failed` (see `apps/webapp/src/modules/auth/channelLink.ts`, `channelLinkClaim.ts`). **Integrator:** `webappEventsClient.completeChannelLink` passes **`mergeReason` in preference to `error`** when the HTTP response is not OK, so `executeAction` / `channelLinkCompleteFailureTemplateKey` can choose `channelLink.completeFailed.conflict` vs `…generic` vs `…expired`. **After HTTP success** with `phoneNormalized`, the scenario step `webapp.channelLink.complete` still runs **sequential** `writeDb` in integrator (`user.phone.link`, then for Telegram `user.state.set`); if `user.phone.link` does not apply (`userPhoneLinkApplied` / indeterminate), the action ends **`failed`** with `values.channelLink.ok: false`, `webappComplete: true`, user-visible `channelLink.completeFailed.*` — no success templates (`max:afterChannelLinked` / Telegram welcome keyboard). Product copy and policy: `apps/webapp/src/modules/auth/auth.md` (§Channel link → integrator). Plan / closure: [`.cursor/plans/archive/phone_bind_mismatch_ux.plan.md`](../../.cursor/plans/archive/phone_bind_mismatch_ux.plan.md).
- **Observability:** messenger TX bind logs use `event: messenger_phone_bind_tx` with `bind_tx_ok` / `bind_tx_fail`, fields `channelCode`, `externalId`, optional `correlationId` and `platformUserId`, `phoneSuffix` (not full numbers), and on failure `reason` (machine code, e.g. `no_channel_binding`, `MessengerPhoneLinkError` codes) plus optional `sqlState` when PostgreSQL reports an error. Log lines include a `metric` field for aggregation: `messenger_bind_ok` / `messenger_bind_tx_fail`. Legacy `webappEventsClient.emit` warns with `metric: integrator_emit_body_reject` when `POST /api/integrator/events` returns 200/202 but `ok` is not `true`, or the body is empty / not JSON. Checklist: `docs/archive/2026-04-initiatives/WEBAPP_FIRST_PHONE_BIND/STAGE_05_OBSERVABILITY_TESTS_DOCS.md`.
- all machine-to-machine calls are authenticated with a shared secret
- all machine-to-machine writes are idempotent
- transport/channel semantics stay in `tgcarebot`
- product semantics stay in `webapp`

## Flow 1: Signed Webapp Entry

`tgcarebot` sends a button or deep link that opens:

`https://bersoncare.ru/app?t=<signed-token>`

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

Если в `system_settings` включён `dev_mode` (scope: admin), исходящий relay из webapp разрешён только когда пара **`channel` + `recipient`** (Telegram chat id / Max user id) попадает в списки **`test_account_identifiers`** (`telegramIds` / `maxIds`). Проверка: `systemSettingsService.shouldDispatchRelayToRecipient({ channel, recipient })`. Ключ **`integration_test_ids`** остаётся в схеме настроек как legacy, **не** используется для этого guard в текущем webapp.

Экран **`/app/doctor/broadcasts`** в предпросмотре учитывает ту же семантику для оценки доставки в мессенджер (пересечение сегмента с тестовыми Telegram/Max ID). Подробнее: **`docs/ARCHITECTURE/DOCTOR_BROADCASTS.md`**.

**Массовые рассылки врача** (`/app/doctor/broadcasts`): после подтверждения webapp пишет `broadcast_audit` (в т.ч. флаг **`attach_menu_after_send`**) и строки в `public.outgoing_delivery_queue` с `kind = doctor_broadcast_intent` и **`payload_json.attachMenu`** при включённой опции меню; доставка идёт **воркером integrator** (`dispatchOutgoing`), без HTTP `relay-outbound` на каждого получателя. См. **`docs/ARCHITECTURE/DOCTOR_BROADCASTS.md`**.

### Каналы dispatch

| channel    | recipient              | Адаптер integrator              |
| ---------- | ---------------------- | ------------------------------- |
| `telegram` | chatId (string/number) | `createTelegramDeliveryAdapter` |
| `max`      | chatId (string/number) | `createMaxDeliveryAdapter`      |
| `sms`      | phoneNormalized        | `createSmscDeliveryAdapter`     |
| `email`    | не реализован          | пропуск с логом                 |

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

**Идемпотентность (integrator):** дедуп по `idempotencyKey` хранится **в памяти процесса** (`Map` в обработчике `/api/bersoncare/request-contact`): при нескольких инстансах API у каждого свой набор ключей; TTL задаётся в коде роутера. Это осознанное ограничение без отдельного shared store.

**Webapp → integrator:** если в сессии **оба** binding (Telegram и Max), заголовок **`X-Bersoncare-Contact-Channel: telegram | max` обязателен**; иначе **`400`** с `contact_channel_required`. При одном канале заголовок опционален (канал выводится из сессии). Лимит **60 с** на `userId` на route handler обновляется **только после успешного** ответа integrator (`ok: true`, в т.ч. **`duplicate`** — чат уже получил или дедупнул запрос).

**До вызова integrator:** `POST /api/patient/messenger/request-contact` может вернуть **`400 { ok: false, error: "not_required" }`**, если активация телефона уже не в состоянии `need_activation` — тогда integrator не вызывается; Mini App снимает гейт и закрывает WebView (`closeMessengerMiniApp`), без отдельной кнопки «Проверить снова».

Для `telegram` integrator дополнительно выставляет состояние диалога `await_contact:subscription` (как при сценарии привязки в боте). Для **max** отдельного `setUserState` в PostgreSQL интегратора нет (состояние ведёт сценарий MAX).

**Reply-меню Telegram (`sendMenuOnButtonPress`):** автоподмешивание главной reply-клавиатуры из `replyMenu.json` к `message.send` / `message.compose` для пользователя выполняется в executor **только при** `ctx.base.linkedPhone === true`, чтобы не обходить гейт контакта.

**Главное инлайн-меню MAX:** для исходящих `message.send` / `message.compose`, если в `delivery.channels` есть **`max`** (или канал не задан и `event.meta.source === 'max'`), у пользователя **`linkedPhone === true`**, в payload задан числовой **`recipient.chatId`** (иначе MAX send недопустим и меню не подмешивается — напр. телефон без fan-out) и ещё **нет** `replyMarkup`, executor подмешивает **`menus.main`** из контент-бандла **`max/user`** (три кнопки WebApp из фактов `links.*`). При fan-out с Rubitime обогащение применяется **отдельно** к каждому интенту с каналом `max`, чтобы не подмешивать MAX-клавиатуру в Telegram.

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

**Интервал между вызовами Rubitime API2 (integrator):** по правилам Rubitime запросы к `https://rubitime.ru/api2/*` не чаще одного раза в ~5 секунд на API-ключ. В integrator все исходящие вызовы api2 (`create-record`, `get-record`, `get-schedule`, `update-record`, `remove-record`) проходят через общий throttle: минимум **5500 ms** между завершением одного запроса и началом следующего, координация между процессами — `pg_advisory_lock` + таблица `rubitime_api_throttle` (миграция `rubitime:20260413_0001_rubitime_api_throttle.sql`). Повторный вызов после ответа Rubitime про лимит («consecutive requests» / «5 second») снова проходит через этот throttle — отдельная пауза в коде клиента не дублируется. В production/staging throttle **нельзя отключить** (нет env «skip»). После деплоя нужно применить миграции integrator; при отсутствии строки throttle — ошибка `RUBITIME_THROTTLE_ROW_MISSING`. Пока integrator обрабатывает M2M `create-record` (в т.ч. ожидание throttle и повторные вызовы api2), HTTP-запрос webapp к integrator остаётся открытым — на стороне webapp уместен индикатор загрузки до ответа. Post-create projection: при ошибке первого `get-record` дополнительно пауза **5200 ms** перед второй попыткой (см. `postCreateProjection.ts`). Подробности и backlog очереди/async/мультислотов: `docs/REPORTS/RUBITIME_API2_PACING_AND_PHASE2_BACKLOG.md`.

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
