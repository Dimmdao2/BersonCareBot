# NTF-01 — App push and messenger auth-only boundary

Статус: `planned`; owner channel direction принят 2026-07-19. Текущий runtime всё ещё многоканальный.

## Цель

Отделить аутентификацию от продуктовых коммуникаций:

- Telegram/MAX: только login/bind code и минимальный auth handshake;
- product reminders/notifications: in-app source of truth + push;
- browser/PWA transport: существующий Web Push до отдельного retirement decision;
- native transport: APNs/FCM через [`NATIVE_MOBILE_APP_INITIATIVE`](../../NATIVE_MOBILE_APP_INITIATIVE/README.md);
- отсутствие push target не включает скрытый fallback в messenger/email/SMS.

Этап не требует делать каждый push бессодержательным. Он вводит контролируемую матрицу: полезные routine details
разрешены, произвольный clinical/free-text payload остаётся внутри авторизованного приложения.

## 1. Зафиксированное owner ruling (`G-15`)

- Telegram/MAX не являются notification/inbox/support surface.
- Разрешены только: запрос/получение одноразового кода, contact step для привязки, отмена auth flow и короткая
  ссылка «открыть приложение» без token/clinical context.
- Mini Apps, свободная переписка, bot menu, reminder/booking/program callbacks, admin replies и рассылки выводятся.
- Все продуктовые reminders/notifications идут через push приложения. Пока native app не готов, существующий Web
  Push является migration transport, но не повод сохранять messenger fallback.
- Полностью обезличивать каждый push не требуется: пользователь должен видеть разумный полезный контекст.

Engineering safe default до exact `MOB-O9`: Email/SMS не используются как fallback product reminders; invitation,
access recovery, receipt/fiscal, contract/legal/export/deletion и operator/security monitoring классифицируются
отдельно. Точные allowlists и field-level preview rules агент приносит владельцу одним пакетом после `N0` census.

## 2. Current-state baseline

Read-only audit 2026-07-19 подтвердил:

- `notifyPatientDoctorReply.ts`: doctor reply fan-out в Web Push, Telegram, MAX и email; messenger preview до 500,
  email до 2000, push до 120 символов;
- `notifyDoctorPatientMessageToStaff.ts`: staff default `web_push + telegram + max`; сообщение/комментарий содержит
  patient label и preview;
- integrator reminders/booking lifecycle всё ещё создают Telegram/MAX sends; часть booking push связана с успешным
  messenger job и не создаётся при отсутствии messenger target;
- broadcasts, specialist tasks, online intake и public/patient support имеют messenger/email/SMS paths;
- bot support relay, reply callbacks, menus, booking/reminder scripts и mini-app auth/product surfaces активны;
- Web Push subscriptions/VAPID/topic preferences/in-app chat+notification inbox и delivery attempts уже существуют;
- native APNs/FCM targets, mobile sessions и Capacitor package отсутствуют.

Текущий runtime-канон до cutover:
[`docs/ARCHITECTURE/NOTIFICATION_CHANNELS.md`](../../../ARCHITECTURE/NOTIFICATION_CHANNELS.md). Он описывает факт,
а этот stage — целевую миграцию; документы синхронизируются с runtime только в `N7`.

## 3. Матрица message classes и каналов

| Class | Примеры | In-app | App push | Telegram/MAX | Email/SMS |
|---|---|---:|---:|---:|---:|
| `auth_code` | login/bind OTP, contact handshake | да | нет | **да** | существующие email auth/recovery flows отдельно |
| `routine_product` | запись, перенос, отмена, обычный reminder, quota/trial status | **да** | **да** | нет | нет |
| `conversation_event` | новое сообщение, program note, intake reply | **да** | **да** | нет | нет |
| `broadcast_event` | врачебная рассылка | **да** | **да** | нет | нет |
| `account_service` | invite, reset, receipt, договор, export/deletion notices | по событию | по policy | нет | **да по allowlist** |
| `operator_security` | provider outage, security incident, health alert | admin/monitoring | по принятому contour | нет | отдельный monitoring allowlist |

Новый/неизвестный class = default deny для messenger/email/SMS. Allowlist хранится централизованно в typed policy,
а не размножается по feature modules.

## 4. Матрица текста push — engineering safe default до `MOB-O9/G-04B`

| Tier | Что можно показать | Что нельзя автоматически подставлять | Default copy |
|---|---|---|---|
| `T0 public/general` | общий news/product text | secrets/tokens/PII in URL | полезный полный короткий текст |
| `T1 transactional` | дата/время записи, отмена/перенос, payment/subscription/trial status, сумма при необходимости | payment credentials, телефон, email, token | конкретный статус и действие |
| `T2 controlled product` | generic training/warmup copy, notification-safe broadcast/reminder title | диагноз, symptom/test value, internal clinical field | полезный title + короткий context |
| `T3 arbitrary sensitive` | факт события, sender role/безопасный short label | raw chat, complaint, intake summary, diagnosis, note, task free text, filename, attachment preview | «Новое сообщение от специалиста» / «Новый комментарий к программе» |

Правила:

- существующие appointment date/time и generic warmup/training copies допустимы;
- broadcast title допустим, если author UI явно маркирует его как notification preview;
- raw chat preview по умолчанию выключен. Будущая настройка `show_notification_previews` может включить короткий
  preview только после `G-04B`/privacy review; отсутствие настройки не блокирует полезные `T0–T2` details;
- push payload — не canonical data store; tap делает authenticated fetch;
- route/deep link allowlisted и не содержит ФИО, телефон, диагноз, message text, presigned URL или auth token.

Эта матрица является рекомендуемым безопасным baseline агента, а не приписанным владельцу дословным решением.
После `N0` census владелец одним пакетом принимает/корректирует exact event/field rows; общий принцип «полезный
push без blanket masking» повторно не открывается.

## 5. Этапы исполнения

### N0 — census, contracts and exact manifests (`AI`, executable now docs/read-only)

- [x] Построить source-backed producer → resolver → queue → dispatch → provider → canonical in-app map ниже.
- [x] Для каждого path записать current channels, copied fields, queue/log/attempt facts, tests и replacement source.
- [x] Зафиксировать provisional class/tier matrix: она является engineering safe default и ждёт одного пакета
      `MOB-O9` acceptance; `G-15` не переоткрывается, `G-04B` остаётся правовым gate.
- [x] Выявить pending legacy row kinds и direct-provider surfaces для отдельного controlled cutover.
- [x] Описать exact non-overlapping N1/N3 child manifests. Это предложения для orchestrator triage, не новые
      taskdb items и не расширение `#751/#844/#845`.

#### N0 method, scope and status vocabulary

This is a repository-only audit at `c610c11ed`. `codeq` was attempted first but its semantic backend reported
`no DSN (secrets/storage.env)`; lexical `code-search` plus scoped exact searches and targeted reads supplied the
repository evidence below. No provider, DB, host, environment, queue, live log or send was read. A referenced
adapter is a repository fact, **not** evidence that it is enabled or active in PROD.

`covered` means the present repository path was traced; `active_dependency` means a traced current path still has a
cutover dependency; `executable_now` applies only to the proposed docs/code child after triage; `owner_or_legal_gate`
means no agent decision or send; `prod_host_later` means a later approved drain/rollout only. No required family is
`unclassified`.

#### Current egress spine and retained-copy facts

- **Inline relay spine:** product code commonly calls
  `apps/webapp/src/modules/messaging/relayOutbound.ts`, which retries M2M submission at `0s/10s/60s/5m` and uses its
  organization/message/channel/recipient idempotency key. Integrator `relayOutboundRoute.ts` and
  `apps/integrator/src/infra/adapters/dispatchPort.ts` select a channel adapter. The dispatch layer logs
  `delivery.attempt.log`; except for the OTP redaction branch it currently passes the intent payload to that log.
  Provider adapter evidence is in `apps/integrator/src/integrations/telegram/deliveryAdapter.ts`,
  `apps/integrator/src/integrations/max/deliveryAdapter.ts` and
  `apps/integrator/src/integrations/web-push/deliveryAdapter.ts`;
  email/SMS are also accepted channel vocabulary in `sendUnified.ts`. Retention/cleanup policy is **not established
  by this census** and remains `LOG-01/N6` work.
- **Durable queue spine:** `public.outgoing_delivery_queue` is written through
  `apps/integrator/src/infra/db/repos/outgoingDeliveryQueue.ts` (`event_id` unique; `pending → processing → sent |
  failed_retryable | dead`). `outgoingDeliveryWorker.ts` claims due rows, dispatches their intent and records
  messenger attempts in `notification_delivery_attempts`; retry delay is `60/300/900/3600` seconds, stale processing
  resets after about ten minutes. Source-backed queue kinds are `reminder_dispatch`, `doctor_broadcast_intent` and
  `operator_alert`; the worker also accepts legacy payloads. Its tests and the repo tests named in the family rows
  prove code behaviour, not a live queue count or retention period.
- **Legacy booking retry spine:** booking 24h/2h reminders separately write `message.deliver` rows to
  `integrator.rubitime_create_retry_jobs` through `jobQueue.ts`. A row retains normalized recipient reference,
  rendered message text, next-run time, attempt counters/limit, status (`pending → processing → done | dead`), last
  error and the payload containing intent, Telegram/MAX targets, booking reference and optional Web Push follow-up.
  `jobQueuePort.ts` claims/maps rows and `jobExecutor.ts` selects the target for the current attempt, calls the same
  dispatch chokepoint and only then calls the Web Push follow-up; the booking producer configures two attempts and a
  60-second retry. This is repository behaviour only: this census did not query whether any such row exists.
- **Existing canonical in-app sources:** `support_conversation_messages` is canonical for 1:1 chat, program replies,
  broadcasts and appointment lifecycle (`docs/ARCHITECTURE/PATIENT_SUPPORT_CHAT_INBOX.md`); reminder occurrences and
  specialist task records are their respective canonical objects. There is no evidence in this audit of a canonical
  in-app object for public support, intake-to-staff alert, account service, or operator/security alert.

#### Required-family census — current repository fact versus target policy

Each row names current copied fields only at a category level, never values. `Class/tier` is the target safe-default
classification for N1/N3, not proof that current code enforces it.

| Family | Current producer → resolver/queue → dispatch/provider; canonical in-app source | Current copied content / route; target class and tier | Attempts, tests, cutover hazard; status and evidence |
|---|---|---|---|
| Patient ↔ specialist chat (doctor → patient) | `doctorSupportMessagingService.sendAdminReply` persists the reply, then `notifyPatientDoctorReply.ts` resolves patient preferences and sends inline relay legs (`web_push`, Telegram, MAX, email). Canonical: `support_conversation_messages` / `/app/patient/messages`. | Current messenger preview is normalized reply text (500 chars), email body up to 2000, Web Push body from the message; route is messages. Target `conversation_event`, `T3`: neutral sender/event copy, authenticated fetch after tap. | Relay retry/idempotency above; tests: `notifyPatientDoctorReply.test.ts`, `resolveNotificationChannels.test.ts`. Hazard: no queue drain protects already accepted inline relay requests; current raw-text copies are messenger-coupled. `covered`; `apps/webapp/src/modules/messaging/doctorSupportMessagingService.ts`, `apps/webapp/src/modules/messaging/notifyPatientDoctorReply.ts`, `apps/webapp/src/modules/messaging/relayOutbound.ts`. |
| Patient → specialist chat | Patient-message write triggers `notifyDoctorPatientMessage.ts` → `notifyDoctorPatientMessageToStaff.ts` → staff topic resolver and inline relay. Canonical incoming message is `support_conversation_messages`. | Current staff payload includes patient label, message preview, title/body, route and optional reply markup; channels default to Web Push + Telegram + MAX. Target `conversation_event`, `T3`; route only to staff inbox/client conversation. | Tests: `notifyDoctorPatientMessageToStaff.test.ts`, `resolveDoctorNotificationChannels.test.ts`; relay retry/idempotency applies. Hazard: reply markup and message text survive to bots. `covered`; `apps/webapp/src/modules/messaging/notifyDoctorPatientMessage.ts`, `apps/webapp/src/modules/doctor-notifications/notifyDoctorPatientMessageToStaff.ts`. |
| Program notes/comments (both directions) | Patient note uses `notifyDoctorPatientProgramNote.ts` → same staff fanout; clinician reply uses `sendProgramNoteReply.ts` / `notifyPatientDoctorReply.ts`. Canonical thread/message is the support conversation; program item remains linked domain data. | Current staff/patient payload can include item label, patient label and free-text note/reply; chat route. Target `conversation_event`, `T3`, neutral “new program comment/reply”. | Tests: `notifyDoctorPatientProgramNote.test.ts`, `notifyPatientDoctorReply.test.ts`. Hazard: legacy bot callback `program_reply:*` and raw preview must be drained/disabled only after in-app replacement. `covered`; `apps/webapp/src/modules/messaging/notifyDoctorPatientProgramNote.ts`, `apps/webapp/src/modules/messaging/sendProgramNoteReply.ts`, `apps/webapp/src/modules/messaging/notifyPatientDoctorReply.ts`. |
| Patient reminders / warmups | Legacy integrator scheduler `handlers/reminders.ts` creates `reminder_dispatch` Telegram/MAX queue rows. Separately `webPushOnlyScheduler.ts` claims reminder occurrences and `platformUserReminderWebPushNotify.ts` relays Web Push. Canonical: reminder rule/occurrence and linked treatment object. | Current legacy queue has occurrence id, channel, target, log text and messenger keyboard/deep link; Web Push uses generated warmup/training/custom copy and allowlisted route. Target `routine_product`, `T2` (generic warmup/training); arbitrary custom clinical text is `T3` neutral. | Queue retries/attempts above; Web Push skipped attempts include muted/no subscription; tests: `handlers/reminders*.test.ts`, `webPushOnlyScheduler.test.ts`, `platformUserReminderWebPushNotify.test.ts`. Hazard: pending `reminder_dispatch` Telegram/MAX rows and callbacks cannot be blindly replayed; schedule has two delivery paths. `active_dependency`; `apps/integrator/src/kernel/domain/executor/handlers/reminders.ts`, `apps/webapp/src/modules/reminders/webPushOnlyScheduler.ts`, `apps/webapp/src/modules/reminders/platformUserReminderWebPushNotify.ts`. |
| Specialist tasks/reminders | Task scheduler calls `notifySpecialistTaskReminder.ts`; resolver reads doctor setting/topic prefs and emits Telegram, MAX, email and Web Push relay. Canonical: specialist task record; no separate in-app notification row was found. | Current text includes task title, optional patient label and due date; deep link is task/client task section. Target `routine_product`, `T3` for title/free text and patient label; neutral task reminder plus route. | Inline relay retry/idempotency; tests: `notifySpecialistTaskReminder.test.ts`, `resolveSpecialistTaskReminderChannels.test.ts`. Hazard: `sent` can mean any legacy channel and no-target does not yet establish canonical unread state. `covered`; `apps/webapp/src/modules/specialist-tasks/notifySpecialistTaskReminder.ts`, `apps/webapp/src/modules/doctor-notifications/resolveSpecialistTaskReminderChannels.ts`. |
| Booking create/cancel/reschedule / 24h/2h / payment lifecycle | Integrator `bookingLifecycleRoute.ts` creates lifecycle intents and separately enqueues each 24h/2h `message.deliver` job in `integrator.rubitime_create_retry_jobs`; `jobQueuePort.ts` claims it and `jobExecutor.ts` dispatches Telegram/MAX before its Web Push follow-up. Webapp `patientWebPushNotify.ts` appends lifecycle notification records and relays Web Push. Canonical lifecycle is `support_conversation_messages` (`source=appointment_lifecycle`); appointment is linked object. | Current lifecycle/reminder copy includes patient label and date/time. The legacy row also retains normalized phone, rendered message, Telegram/MAX targets, booking/reminder code and Web Push follow-up fields. Booking confirmation email includes service/location and `.ics`; payment-captured is declared in `bookingLifecycleNotifications.ts`. Target `routine_product`, `T1` for date/time/status/payment amount only after exact matrix; no credentials; route `/app/patient?notifications=1` or booking. | Legacy job state is `pending/processing/done/dead`, with next-run time, last error, two attempts and 60-second retry; queue/executor tests plus `bookingLifecycleRoute`, `patientWebPushNotify` and booking-email tests cover code behaviour. Hazard: 24h/2h push is coupled to messenger target/job success; pending `message.deliver` booking rows and `reminder_dispatch` rows must not replay to messenger; email receipt/confirmation is service allowlist, never fallback. `active_dependency`; `apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts`, `apps/integrator/src/infra/db/repos/jobQueue.ts`, `apps/integrator/src/infra/adapters/jobQueuePort.ts`, `apps/integrator/src/infra/runtime/worker/jobExecutor.ts`, `apps/webapp/src/modules/patient-notifications/patientWebPushNotify.ts`, `apps/webapp/src/modules/patient-booking/sendBookingConfirmationEmail.ts`, `apps/webapp/src/modules/patient-booking/bookingLifecycleNotifications.ts`. |
| Broadcasts | `doctor-broadcasts/service.ts` first appends per-recipient canonical notification messages, builds `doctor_broadcast_intent` queue jobs for Telegram/MAX/SMS, and independently runs `fanOutBroadcastWebPush.ts`. | Current queue payload contains broadcast text/image/menu/recipient refs; Web Push uses broadcast title and notification route. Target `broadcast_event`, `T2` only for author-marked preview title; body/free text is `T3` neutral. | Queue retry/dedup/attempt facts above; tests: `doctor-broadcasts/service.test.ts`, `doctor-broadcasts/deliveryJobs.test.ts`. Hazard: pending `doctor_broadcast_intent` rows (including SMS) and bot menu must be cancel/archive metadata-only during cutover. `covered`; `apps/webapp/src/modules/doctor-broadcasts/service.ts`, `apps/webapp/src/modules/doctor-broadcasts/deliveryJobs.ts`, `apps/webapp/src/modules/doctor-broadcasts/fanOutBroadcastWebPush.ts`. |
| Online intake | `online-intake/service.ts` writes the request then calls `intakeNotificationRelay.ts`, which resolves configured admin/doctor Telegram/MAX ids and relays inline. A reply can use the existing support conversation service. | Current alert copies patient name, summary and intake-card deep link. Target `conversation_event`, `T3`, neutral “new intake request”; canonical request exists but no canonical staff notification/inbox record was evidenced. | Relay retry/idempotency applies; tests: `online-intake/service.test.ts`, `online-intake/intakeNotificationRelay.test.ts`. Hazard: current notification targets are global configured messenger ids and source text is sensitive. `covered`; `apps/webapp/src/modules/online-intake/service.ts`, `apps/webapp/src/modules/online-intake/intakeNotificationRelay.ts`. |
| Public and patient support | `app/api/public/support/route.ts` and `app/api/patient/support/route.ts` construct a detailed Telegram body and relay it inline. Patient support has a session but this route does not establish a canonical support conversation before egress. | Current payload includes contact/identity/context/device metadata and raw support text; no safe product deep link. Target `conversation_event`, `T3`; first create/reuse the existing admin/support inbox (`#808/U9`), then neutral alert. | In-memory rate limit + relay retry; tests: `public/support/route.test.ts`, `patient/support/route.test.ts` where present. Hazard: direct Telegram surface leaks the widest field set and has no queue drain. `active_dependency`; `apps/webapp/src/app/api/public/support/route.ts`, `apps/webapp/src/app/api/patient/support/route.ts`. |
| Account invites / recovery / receipts / contracts / export / deletion | Invite/auth code producers use `patient-invites/service.ts`, `auth/emailAuth.ts` and `auth/emailSendPort.ts`; booking receipt/confirmation uses the email path above. Scoped read found no implemented outbound producer for contract, export or deletion notices. | OTP/code is `auth_code` (T3 secret, never preview/URL). Invite/recovery/receipt/contract/export/deletion are `account_service`; exact email/SMS allowlist and fields are open. Receipt may be `T1`; all token/file/link/contract/export/deletion content remains `T3` until `MOB-O9`. | Tests: `patient-invites/service.test.ts`, `auth/emailAuth.test.ts`, `auth/emailOtpPublic.test.ts`, booking email tests. Hazard: do not misclassify email service notices as product fallback; absent producers must not be invented in N1. `owner_or_legal_gate` for the service matrix; evidence `apps/webapp/src/modules/patient-invites/service.ts`, `apps/webapp/src/modules/auth/emailAuth.ts`, `apps/webapp/src/modules/auth/emailSendPort.ts`. |
| Operator/security alerts | `operator-alerts/dispatchOperatorAlert.ts` deduplicates for 24 hours, relays Telegram/MAX and, with org scope/runtime deps, uses staff Web Push. Integrator operator incidents can enqueue `operator_alert`. No end-user canonical in-app source was found. | Current lines are clipped but can contain operational detail; title/body/technical route supplied to push. Target `operator_security`, `T3` unless an approved non-sensitive operational class; replacement contour is owner-selected monitoring/admin inbox. | Queue retry/dedup/attempt facts where queued; tests: `operator-alerts/dispatchOperatorAlert.test.ts`, `infra/operatorIncident/reportOperatorFailure.test.ts`. Hazard: global alerts have no synthetic tenant and messenger relay remains current. `active_dependency`; `apps/webapp/src/modules/operator-alerts/dispatchOperatorAlert.ts`, `apps/integrator/src/infra/operatorIncident/reportOperatorFailure.ts`. |
| Auth/login/bind handshake | Auth routes/modules (`phoneAuth.ts`, `phoneMessengerBind.ts`, email auth and channel-link flows) create purpose-bound OTP/contact/bind interactions; dispatch ultimately uses the same relay/adapter spine or email port. Canonical state is auth challenge/session/binding, not a product inbox. | Code/contact step/cancel/open-app only; no token in URL. Target `auth_code`, `T3` secret; permitted messenger exception under `G-15`. | OTP-specific log sanitisation in `dispatchPort.ts`; tests include `phoneAuth.test.ts`, `phoneMessengerBind.test.ts`, `authFlow.integration.test.ts`, `preferredAuthChannelPolicy.test.ts`. Hazard: mini-app/product callbacks must not be retained under the auth exception. `covered`; `apps/webapp/src/modules/auth/phoneAuth.ts`, `apps/webapp/src/modules/auth/phoneMessengerBind.ts`, `apps/webapp/src/modules/auth/emailAuth.ts`, `apps/integrator/src/infra/adapters/dispatchPort.ts`. |

#### Direct-provider and pending-row cutover inventory (read-only)

- **Dispatch choke points:** `apps/integrator/src/infra/adapters/dispatchPort.ts` and
  `apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts`. Product-facing direct call surfaces are
  `relayOutbound.ts`, `intakeNotificationRelay.ts`, `dispatchOperatorAlert.ts`, public/patient support routes,
  `notifyPatientDoctorReply.ts`, `notifyDoctorPatientMessageToStaff.ts`, and `notifySpecialistTaskReminder.ts`.
  Existing `apps/webapp/src/modules/web-push/sendWebPushToSubscriptions.ts` is a direct Web Push sender surface;
  N1 must prohibit new product-provider bypasses without replacing the established Web Push infrastructure.
- **Rows for later controlled cutover:** `public.outgoing_delivery_queue` kinds `reminder_dispatch`,
  `doctor_broadcast_intent`, `operator_alert`, plus any legacy rows whose
  `payload_json.intent.payload.delivery.channels` selects Telegram/MAX/SMS/email; and
  `integrator.rubitime_create_retry_jobs` booking-reminder rows with `kind=message.deliver` and
  `payload_json.booking`. This census does not query their presence or count. The later change window must classify
  them as auth allowlist / cancel / archive metadata-only / already-sent; it must never replay product rows to
  messenger. The existing booking-id cancellation path proves a scoped state transition exists, not that a cutover
  has already run.
- **Messenger-coupled push:** booking 24h/2h target construction is messenger-binding dependent; task success is
  channel-aggregated; chat/program note staff fanout carries bot reply markup. These are N3 acceptance failures until
  push is independently resolved from canonical in-app state.

#### Exact child manifests for orchestrator triage (not taskdb creation)

All manifests depend on this census SHA `c610c11ed` and on the N1 integration SHA recorded by its owner. They are
file ownership boundaries, not permission to touch active SaaS/Product UX/billing/FIO/Doctor DNA scope. Each child
must first re-check worktrees, dependency SHA and owner gates; an absent/changed source invalidates the manifest.

| Proposed child | Owned files/directories (only) | Dependencies and gates | Acceptance / risk / PR-00 status |
|---|---|---|---|
| `NTF-N1-egress-policy` | `apps/integrator/src/infra/adapters/dispatchPort.ts`, `apps/integrator/src/infra/adapters/sendUnified.ts`, `apps/integrator/src/infra/adapters/channelRouting.ts`, `apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts`, `apps/integrator/src/infra/runtime/worker/doctorBroadcastIntentMenu.ts`, `apps/integrator/src/integrations/bersoncare/relayOutboundRoute.ts`, and co-located tests | `c610c11ed`; `G-15 decided`; service allowlists and field matrix remain `MOB-O9`; provider legality `G-04B` does not block topology guard | Typed class/capability reaches both inline and queue dispatch; unknown/product messenger/email/SMS is denied; auth regression and direct-call checker pass; no feature route/UI change. High security risk; `executable_now` after triage. |
| `NTF-N3-chat-program` | `apps/webapp/src/modules/messaging/notifyPatientDoctorReply.ts`, `apps/webapp/src/modules/messaging/notifyDoctorPatientMessage.ts`, `apps/webapp/src/modules/messaging/notifyDoctorPatientProgramNote.ts`, `apps/webapp/src/modules/messaging/sendProgramNoteReply.ts`, `apps/webapp/src/modules/messaging/doctorSupportMessagingService.ts`, `apps/webapp/src/modules/doctor-notifications/notifyDoctorPatientMessageToStaff.ts`, `apps/webapp/src/modules/doctor-notifications/resolveDoctorNotificationChannels.ts`, `apps/webapp/src/modules/doctor-notifications/doctorTopicChannelDefaults.ts`, and their tests | accepted N1 SHA; `MOB-O9` exact T3 rows; stable support conversation contract | Canonical message precedes intent, no bot/email fallback or callback, no-target retains unread state, tenant/dedup/deep-link negative tests. High clinical-content risk; `owner_or_legal_gate` until field acceptance. |
| `NTF-N3-reminders-tasks` | `apps/webapp/src/modules/reminders/**`, `apps/webapp/src/modules/patient-reminders/**`, `apps/webapp/src/modules/specialist-tasks/**`, `apps/webapp/src/modules/doctor-notifications/resolveSpecialistTaskReminderChannels.ts`, `apps/integrator/src/kernel/domain/executor/handlers/reminders.ts`, their tests | accepted N1 SHA; exact generic warmup/training T2 and task T3 rows; stable org reminders contract | No legacy messenger queue/callback; push no-target is observable and canonical occurrence/task remains; retry/dedup/tenant tests. High data/clinical risk; `owner_or_legal_gate` for task fields. |
| `NTF-N3-booking-payment` | `apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts`, `apps/integrator/src/infra/db/repos/jobQueue.ts`, `apps/integrator/src/infra/adapters/jobQueuePort.ts`, `apps/integrator/src/infra/runtime/worker/jobExecutor.ts`, `apps/integrator/src/infra/runtime/worker/runner.ts`, `apps/webapp/src/modules/patient-notifications/patientWebPushNotify.ts`, `apps/webapp/src/modules/patient-booking/bookingLifecycleNotifications.ts`, `apps/webapp/src/modules/patient-booking/sendBookingConfirmationEmail.ts`, `apps/webapp/src/modules/web-push/pushNotificationCopy.ts`, and their co-located tests | accepted N1 SHA; `MOB-O9` T1 booking/payment matrix; payment/billing owner; later queue drain window | Lifecycle in-app source first; 24h/2h push independent from messenger binding/job success; service email explicitly allowlisted; pending `message.deliver` and outgoing-delivery rows classified/cancelled or archived metadata-only without replay. High financial/scheduling risk; `owner_or_legal_gate`. |
| `NTF-N3-broadcasts` | `apps/webapp/src/modules/doctor-broadcasts/**` and its tests | accepted N1 SHA; `MOB-O9` broadcast-preview decision; controlled queue drain | One canonical inbox record per intended recipient, T2 labelled title or T3 neutral copy, no messenger/SMS job/menu; audience/dedup/no-target tests. High fanout risk; `owner_or_legal_gate`. |
| `NTF-N3-intake-support` | `apps/webapp/src/modules/online-intake/**`, `apps/webapp/src/app/api/public/support/route.ts`, `apps/webapp/src/app/api/patient/support/route.ts`, their tests | accepted N1 SHA; reuse `#808/U9` admin/support inbox; `MOB-O9` T3 decision | Persist/reuse the existing support/inbox source before alert, no global messenger target, no raw intake/support preview, tenant/rate-limit/no-target tests. High sensitive-data risk; `active_dependency`. |
| `NTF-N3-operator-security` | `apps/webapp/src/modules/operator-alerts/**`, `apps/webapp/src/modules/admin-incidents/sendAdminIncidentStaffWebPush.ts`, `apps/webapp/src/modules/admin-incidents/adminIncidentAlertConfig.ts`, `apps/integrator/src/infra/operatorIncident/**`, and their tests | accepted N1 SHA; owner-approved monitoring/admin-inbox contour; `G-04` service-recipient review | No messenger product relay; global-vs-org handling explicit, dedup preserved, payload/log marker-negative tests. High operational/security risk; `owner_or_legal_gate`. |
| `NTF-N3-account-service-matrix` | Docs-only extension of this stage and privacy `LOG.md`; no runtime files until owner acceptance | `MOB-O9`, `G-04`, `G-03` for deletion/export, billing/legal owner for receipt/contract | One dated allowlist for invite/recovery/receipt/contract/export/deletion; no invented producer and no product fallback. Medium legal risk; `owner_or_legal_gate`. |

Auth/login/bind remains a separately serialized `N4` manifest, owning `apps/webapp/src/modules/auth/**` and the
integrator Telegram/MAX content/auth routes after the N1 SHA. Its acceptance is the minimal `auth_code` allowlist,
no product menu/callback/mini-app surface, OTP redaction and auth regression; it is high identity risk and
`executable_now` only after N1, not an N3 child.

Checks completed for this docs-only N0: every required family is classified; every row has source path, status,
class and tier; no PII/secret values or runtime claims were added. Relative link and path verification plus
`git diff --check` are recorded in the execution log. No test, lint, build, CI, DB/server/network/deploy/send was
run.

### N1 — central egress policy guard (`AI`, after exact dispatch scope)

- [ ] Ввести strict typed `OutboundMessageClass/Capability`; product module не передаёт произвольную строку.
- [ ] В нижнем integrator dispatch chokepoint Telegram/MAX допускают только `auth_code` и минимальный auth
      handshake allowlist. Ошибка resolver/legacy setting не обходит guard.
- [ ] Email/SMS product delivery default-deny; разрешённые service classes имеют отдельные tests/templates.
- [ ] Static/runtime checker запрещает product notification → Telegram/MAX/email/SMS и direct provider calls.
- [ ] Существующий OTP/login/bind regression остаётся зелёным; code/token не логируется и не попадает в URL.

Scope boundary: не менять feature UI/routes в этом slice. Checks: dispatch policy tests, fake legacy config, replay,
unknown class, direct-call checker, auth regression, independent security audit.

Messenger topology guard не ждёт `MOB-O9`. Конкретные content builders из `N3/N6` используют safe default только в
DEV fixtures и не получают production release до exact matrix acceptance.

### N2 — provider-neutral push target and delivery (`AI`, coordinated with `MOB-03`)

- [ ] Notification intent отделён от transport; Web Push/APNs/FCM — adapters одного push capability.
- [ ] Native targets имеют отдельную модель от `user_web_push_subscriptions`; token lifecycle/retention/revoke
      описаны в mobile plan.
- [ ] Org-scoped event несёт `organizationId`; target resolution не превращает device token в tenant bypass.
- [ ] Provider credentials читаются через restricted DB-backed settings после S5/CRYPTO gates, не из новых env.
- [ ] Provider response/metrics не содержат payload/token; invalid token деактивируется идемпотентно.

Checks: wrong-org, multiple devices, token rotation, duplicate/retry, provider failure, no-target, payload marker.

### N3 — migrate product families to in-app + push (`AI`, independent vertical slices)

Порядок с непересекающимися exact scopes:

1. patient ↔ specialist chat and program notes;
2. patient reminders and specialist task reminders;
3. booking created/cancelled/rescheduled/24h/2h/payment lifecycle; push job независим от messenger target/success;
4. broadcasts;
5. online intake and public/patient support после готового admin/support inbox (`#808/U9` reuse);
6. operator/security alerts после принятого replacement contour.

Для каждого slice:

- [ ] canonical in-app record/linked object существует до send intent;
- [ ] content tier builder единственный и покрыт positive/negative fixtures;
- [ ] нет product messenger/email/SMS job, callback или fallback;
- [ ] no push target даёт `no_active_target`, сохраняет unread/in-app state и health metric;
- [ ] muting/topic preferences не уничтожают canonical event;
- [ ] tenant/dedup/retry/deep-link tests зелёные.

### N4 — bots auth-only (`AI`, after replacement surfaces)

- [ ] Сохранить phone auth/messenger bind contact/code/cancel/open-app flows и их rate limits.
- [ ] Отключить mini-app init login, product menus, booking/reminder/program callbacks, support relay, clinical
      inbound/outbound text и admin reply surfaces.
- [ ] Старые product callback/free-text получают короткий safe redirect в app; clinical text не сохраняется как
      новая bot conversation.
- [ ] `#822` поглощается этим stage; `#816` помечается superseded после push-only deep-link replacement, а не
      исполняется ради выводимого messenger feature.
- [ ] Bot capability docs/scripts/tests отражают auth-only allowlist; stale callback не вызывает product action.

### N5 — settings and compatibility (`AI`, waits stable S5-7 and free Doctor DNA scope)

- [ ] Notification settings UI показывает product topics и app push/preview policy, но не Telegram/MAX/email/SMS
      как каналы product delivery.
- [ ] Auth channel bindings/preferences остаются отдельной настройкой и не удаляются.
- [ ] Legacy DB enum/rows сначала ignored-at-runtime + compatibility read; cleanup migration только после zero-caller
      census и отдельного backward-compatible manifest.
- [ ] Web Push subscription UI остаётся только browser surface; native app не показывает PWA install/SW controls.

### N6 — content, logs and queues (`AI`, linked `LOG-01`)

- [ ] Все event families назначены `T0–T3`; arbitrary sensitive fixtures не попадают в push.
- [ ] Delivery attempts/queues/dead-letter/provider errors не создают дополнительные clinical copies.
- [ ] Pending legacy messenger product jobs перед TEST/PROD cutover классифицированы: cancel/archive metadata-only;
      auth jobs не затрагиваются.
- [ ] `SENSITIVE_TEST_MARKER` отсутствует во внешнем payload, SQL/error/provider logs и retained queue state.

### N7 — TEST, rollout and documentation (`AI + owner`)

- [ ] Synthetic send-safe matrix доказывает: product event → in-app + push only; auth code → selected auth channel.
- [ ] Проверены permission denied, no/expired token, multiple devices, muted topic, retry/dedup, provider outage,
      background/killed state для native и browser compatibility.
- [ ] До native release Web Push migration population и undeliverable metric видимы; messenger fallback не
      возвращается для улучшения процента доставки.
- [ ] Runtime docs обновляются только после фактического cutover: `NOTIFICATION_CHANNELS`, inbox/broadcast/bot/MAX/
      auth/integrator/reminder contracts.
- [ ] PROD drain/config/provider rollout — отдельный owner-approved change window с rollback, не часть DEV worker.

## 6. Dependencies and non-overlap

- N0/N1 и `LOG-01/L0-L1` не зависят от billing.
- N2 native provider ждёт `MOB-00/MOB-02`, `G-04B` и restricted setting/key gate; Web Push migration work может
  идти раньше.
- N3 support ждёт существующий `#808/U9` admin/support source; второй support backend запрещён.
- N5 ждёт stable S5-7 и свободный file scope после active Doctor DNA `#885`.
- Active D3/D4/S5/Product UX/billing plans не редактируются этим stage. Tenant-aware runtime slices ждут stable D4
  там, где меняют org-scoped write/read paths.
- `CRYPTO-01/C4`, `SEC-04` и `PR-04A` требуют закрытых NTF/LOG evidence.

## 7. Definition of Done

- [ ] Ни один product runtime path не отправляет Telegram/MAX/email/SMS.
- [ ] Telegram/MAX технически способны только на login/bind code/auth handshake allowlist.
- [ ] Product events имеют canonical in-app state и push transport; no target не включает hidden fallback.
- [ ] Booking/reminder push не зависит от messenger target/job success.
- [ ] `T0–T3` policy сохраняет полезные routine details и исключает raw clinical/free-text/file/secret payload.
- [ ] Pending queues, bot callbacks, settings UI и legacy rows прошли controlled migration.
- [ ] Auth, push, in-app, tenant-negative, marker, real-device/TEST tests и independent security audit зелёные.
- [ ] Один full CI выполнен на integration/release checkpoint; owner принял real-device behavior.
