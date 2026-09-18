# S11 lifecycle outbox — audit 2 after correction

Дата: 2026-09-18

Роль: независимый auditor, один проход новой correction-поверхности

Candidate: `1daecd17bcaddcda8f2c6e151f6c3617123cf3d0`

Integration base: `d4cce29f6`

Сохранённые audit1 tests: `17c9df6cc`

## Verdict

| Объект приёмки | Verdict | Причина |
| --- | --- | --- |
| Core outbox candidate | **FAIL** | Atomic enqueue и worker mechanics построены, но durable consumer не восстанавливает `patient_bookings` после commit и durable payload не сохраняет семантику одного payment-сообщения и настройки каналов. Post-commit callback всё ещё обязателен для корректного результата. |
| Весь S11 | **FAIL** | Кроме core findings, producer inventory остаётся незакрытым: creation/reschedule/cancel/no-show всё ещё best-effort, reminder не пишет feed, cash capture/refund/retention не имеют lifecycle producer. |

`PASS core` не выставлен: зелёные static/behavioral gates подтверждают механику очереди, но не устраняют два достижимых нарушения owner requirements ниже.

## Core correction surface

| Проверяемая поверхность | Результат | Evidence |
| --- | --- | --- |
| Atomic settlement + queue insert | PASS | Trigger на переходе `be_payment_provider_events.processed_at: NULL → value` выполняет insert в той же транзакции, что и `app.settle_booking_payment_webhook_event`. Ошибка trigger body откатывает settlement. |
| Stable unique event id | PASS | `booking.payment_captured:<paymentUuid>:<appointmentUuid>`; queue имеет `uq_outgoing_delivery_queue_event_id`, insert использует `ON CONFLICT (event_id) DO NOTHING`. |
| Privilege declaration/generated SQL | PASS, static gate | Function и relation surfaces объявлены в `declaration.ts`; generated dev/test/prod artifacts совпадают. Live owner-aware rollback-only preflight/introspection по brief оставлены лиду на именованной DEV. |
| Internal claim/reclaim/finalize | PASS | `booking_lifecycle` claim переводит row в `processing`, stale `processing` reclaimable, success завершает `sent`. |
| Retry/backoff/dead/operator incident | PASS | Ошибка common passage возвращает queue row в retry/backoff либо `dead`; step runner регистрирует operator incident и не блокирует независимые последующие steps. |
| Нет `dispatching` для повторяемой internal work | PASS | Internal branch исполняется до transport `markDispatching`; stale-`dispatching` policy относится только к внешнему transport. |
| Payload tenant/scope | PASS | Queue row и payload несут `orgId`; worker резолвит организацию из row и вызывает handler под tenant principal. |
| Existing common lifecycle passage | PASS | Worker вызывает существующий `handleBookingLifecycleEvent`; Notifications append остаётся в существующем patient inbox/store со стабильным integrator message id. |
| Post-commit callback больше не является гарантией captured payment | **FAIL** | См. F1 и F2. Без callback durable consumer даёт неполное и семантически неверное состояние. |

## MUST FIX findings

### F1 — durable worker не восстанавливает patient booking projection

Достижимый сценарий:

1. Provider webhook вызывает `app.settle_booking_payment_webhook_event`.
2. Транзакция подтверждает canonical appointment и атомарно создаёт `booking_lifecycle` queue row.
3. Процесс падает после commit, до `onAppointmentPaymentConfirmed`.
4. Worker забирает durable row и вызывает общий lifecycle passage.

Результат: `patient_bookings.status` остаётся `awaiting_payment`. Единственный найденный вызов `patientBookings.markConfirmedByCanonicalAppointment(...)` находится в post-commit `createAppointmentPaymentConfirmedHandler`; SQL trigger только читает projection, а `handleBookingLifecycleEvent` её не обновляет. В schema/generated migrations не найден trigger, зеркалирующий canonical appointment status в `patient_bookings`.

Impact: captured payment может оставить пациенту и downstream consumers устаревшее booking state; повтор queue job этого не исправляет. Это прямое нарушение `PAY-REL-01` и `PAY-REL-02`: post-commit callback остаётся гарантией projection, а replay worker не исполняет projection независимо.

Evidence:

- `apps/webapp/src/modules/payments/appointmentPaymentConfirmedHandler.ts` — projection update выполняется до lifecycle emit только в callback handler.
- `apps/webapp/db/drizzle-migrations/20260918T200000_payment_settlement_lifecycle_outbox.sql` — trigger читает `patient_bookings`, но не изменяет её.
- `apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts` — common passage исполняет calendar/patient/doctor steps, не projection.
- Точный поиск зеркала: `rg -n 'UPDATE public\.patient_bookings|CREATE TRIGGER.*patient|patient_bookings.*TRIGGER|canonical_appointment_id.*status' apps/webapp/db/drizzle-migrations deploy/postgres/generated/prod-to-target/schema-pre.sql deploy/postgres/generated/prod-to-target/schema-post.sql --glob '*.sql'` — найдены отдельные write doors/expiry paths, но не status mirror для settlement.

### F2 — durable fallback меняет payment notification semantics и обходит channel settings

Достижимый сценарий тот же: settlement commit проходит, callback не исполняется либо durable worker выигрывает race у callback. SQL producer создаёт отдельный event на каждый appointment с `doctorNotify: true`, но без `suppressPatientNotification`, агрегированного `patientMessageText` и `doctorMessageText`. Worker фиксирует step idempotency раньше callback с тем же event id.

Результат для multi-slot payment: вместо одного patient payment message и одного doctor message со всеми слотами durable path создаёт сообщения по каждому appointment; корректный callback затем не может заменить уже принятые steps. Persistent patient feed также получает несколько booking-level записей для одного payment fact. Durable payload не переносит фактические booking notification settings callback-пути.

Impact: дубли/изменённый смысл patient и doctor notifications, несколько feed rows на один domain fact и внешняя доставка вопреки настройкам. Нарушены сохранённый S8 contract, `PAT-NOTIF-02`, `PAT-NOTIF-03` и owner rules §21/§24.1.

Evidence:

- `apps/webapp/src/modules/payments/appointmentPaymentConfirmedHandler.ts` — callback агрегирует все slots, разрешает patient/doctor messages только на первом event и выставляет suppression для остальных.
- `apps/webapp/db/drizzle-migrations/20260918T200000_payment_settlement_lifecycle_outbox.sql` — durable payload создаётся per appointment с `doctorNotify: true` и без агрегированных текстов/suppression.
- `apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts` и `patientWebPushNotify.ts` — common consumer принимает payload как authority и append-ит persistent patient message до выбора внешних web-push recipients.

Новый тест не добавлен. Самый дешёвый недостающий oracle для обоих findings — состояние реальной транзакции/очереди после crash boundary; SQL/source-text тест запрещён §10a и brief, а live DB run этим аудитом запрещён. Findings следуют из достижимого вызовного пути и конечных writes, не из форматирования SQL.

## Privilege analysis (§1 migrations)

1. Migration создаёт `app.on_payment_settlement_enqueue_booking_lifecycle()` и trigger `trg_payment_settlement_enqueue_booking_lifecycle`; новых таблиц нет.
2. Function — `SECURITY DEFINER`, owner `app_seam_payment_webhook_owner`; trigger DDL выполняется под `app_object_owner`.
3. Function требует `SELECT` на provider events/intents/payments/appointments/patient bookings, UPDATE-class privilege для `FOR KEY SHARE`, и `INSERT` на outgoing queue.
4. Текущая declaration и generated grants дают эти surfaces, включая подходящие UPDATE grants для row-lock relations. Static generated/privilege gates зелёные. Проверка реальных owners/grants и rollback-only execution на именованной DEV остаётся обязательной live-приёмкой лида; в этом проходе она не выполнялась.

## S11 IDs

| ID | Verdict | Незакрытый результат / evidence |
| --- | --- | --- |
| `PAY-REL-01` | **FAIL** | Settlement+enqueue atomic, но без post-commit callback projection остаётся `awaiting_payment` (F1). |
| `PAY-REL-02` | **FAIL** | Queue mechanics replayable, но worker не replay-ит projection; durable payload нарушает message semantics (F1, F2). |
| `PAY-REL-03` | PASS for this code pass | Audit1 oracle сохранён и зелёный; correction surface просмотрена; focused/type/static gates зелёные. Live post-landing verification ещё не относится к этому candidate audit. |
| `PAT-NOTIF-01` | **FAIL** | Единый passage существует, но обязательный producer inventory не переведён на durable path. |
| `PAT-NOTIF-02` | **FAIL** | Durable captured-payment payload не сохраняет channel/settings decisions; reminder/feed gap также остаётся. |
| `PAT-NOTIF-03` | **FAIL** | Store и keys стабильны, но durable multi-slot capture производит несколько feed rows на один payment fact; inventory неполон. |

## Remaining producer inventory / continuation handoff

| Owner-scope fact | Фактический producer/path | Verdict | Gap / evidence |
| --- | --- | --- | --- |
| Confirmed / awaiting-payment creation | `canonicalCreate.ts` → `bookingCreatedEffects.apply` → `syncPort.emitBookingEvent(booking.created)` | **FAIL** | Emit после business commit; default sync port использует Next `after()` и логирует deferred failure. Не durable. |
| Staff manual booking | `manual/route.ts` и `manual-patient-visit/route.ts` → `emitBookingEvent(booking.created)` | **FAIL** | Post-commit `try/catch`, failure best-effort. Manual walk-in с ранним return не имеет patient lifecycle event; отдельной patient-visible walk-in surface не найдено. |
| Patient reschedule | `patient-booking/service.ts` → `booking.rescheduled` | **FAIL** | Post-commit best-effort emit. |
| Staff reschedule | `staffAppointmentLifecycleEffects.ts` → `booking.rescheduled` | **FAIL** | Suppression больше не отрезает technical passage, но transport всё ещё deferred/best-effort. |
| Patient cancel | `patient-booking/service.ts` → `booking.cancelled` | **FAIL** | Post-commit best-effort emit. |
| Staff cancel / no-show | `staffAppointmentLifecycleEffects.ts`; no-show отображается как `booking.cancelled` | **FAIL** | Реальный producer существует, но остаётся deferred/best-effort. |
| Due reminder | `pgAppointmentReminderMaterialization.ts` → queue kind `appointment_reminder` | **FAIL** | Durable external delivery существует, но путь не создаёт запись в Notifications feed. |
| Online capture | settlement trigger → queue kind `booking_lifecycle` | **FAIL** | Atomic producer есть; F1/F2 делают durable result неполным/неверным. |
| Cash capture | `staffAppointmentPayments.ts` → `patientPayments.addCashPayment` → `app.settle_appointment_cash_prepayment(text)` | **FAIL** | Lifecycle/Notifications producer не найден. |
| Online/cash refund | payment history `refund_succeeded`; cash path через `addCashRefund` | **FAIL** | Lifecycle/Notifications producer не найден. |
| Retention | payment history `prepayment_retained` | **FAIL** | Lifecycle/Notifications producer не найден. |
| Реально существующий no-show fact | Staff no-show side effect → `booking.cancelled`; patient cabinet отображает `no_show` | **FAIL** | Producer есть, но недолговечен, как выше. |
| Completed / visit-confirmed fact | Cabinet умеет отрисовать `completed`; lifecycle schema не содержит completed/visit event | N/A — owner decision needed | Exact identifier search, code-search и event registry не показали действующий status-transition producer. Новый product producer не придуман. Clinical walk-in не найден как patient-visible cabinet fact. |

## Executed acceptance and gates

## S11 booking producer worker evidence (2026-09-18)

All seven scoped producers now enter `public.outgoing_delivery_queue` atomically.  The queue key
uses the immutable canonical fact, and the resident worker replays the signed webapp seam before it
marks the internal row sent; it does not use `Next after()` or a best-effort signed POST.

| Producer path | Atomic root | Stable queue key | Disabled legacy handoff |
| --- | --- | --- | --- |
| Patient browser/widget/app confirmed creation | `AFTER INSERT public.be_appointments` | `booking.lifecycle:created:<appointment-id>` | `BookingSyncPort` no longer schedules `booking.created` through `after()` |
| Patient browser/widget/app awaiting-payment creation | `AFTER INSERT public.be_appointments` | `booking.lifecycle:awaiting_payment:<appointment-id>` | direct post-commit booking-created effect is absent from production DI |
| Staff manual booking | `AFTER INSERT public.be_appointments` | `booking.lifecycle:created:<appointment-id>` | manual route compatibility call reaches the disabled lifecycle branch of `BookingSyncPort` |
| Patient reschedule | `AFTER INSERT public.be_appointment_history_events` (`rescheduled`) | `booking.lifecycle:rescheduled:<history-id>` | post-commit `booking.rescheduled` branch is disabled in `BookingSyncPort` |
| Staff reschedule | `AFTER INSERT public.be_appointment_history_events` (`rescheduled`) | `booking.lifecycle:rescheduled:<history-id>` | `emitStaffCanonicalBookingEvent` can no longer reach external delivery through the production sync port |
| Patient cancel | `AFTER INSERT public.be_appointment_history_events` (`cancelled`) | `booking.lifecycle:cancelled:<history-id>` | post-commit `booking.cancelled` branch is disabled in `BookingSyncPort` |
| Staff cancel / existing no-show | `AFTER INSERT public.be_appointment_history_events` (`cancelled` / `no_show`) | `booking.lifecycle:cancelled:<history-id>` / `booking.lifecycle:no_show:<history-id>` | staff side-effect seam cannot bypass the atomic history producer |

The S11 plan remains open: payment money/refund/retention and reminder inventory are intentionally
outside this bounded booking-producer stage.

Сохранённый oracle был запущен первым после чтения authority; FI K1–K5/K9 повторно не проводился.

| Command | Result |
| --- | --- |
| `pnpm --dir apps/webapp exec vitest --run src/modules/payments/providerWebhookSettlement.test.ts src/modules/patient-notifications/patientWebPushNotify.unit.test.ts src/app-layer/booking/staffBookingIntegratorEvent.d14.test.ts` | PASS: 3 files, 20 tests. |
| `pnpm --dir apps/integrator exec vitest --run src/integrations/bersoncare/bookingLifecycleRoute.stepIsolation.test.ts src/integrations/bersoncare/bookingLifecycleRoute.dedup.test.ts src/integrations/bersoncare/bookingLifecycleRoute.patientSuppression.test.ts` | PASS: 3 files, 13 tests. |
| `pnpm --dir apps/integrator exec vitest --run src/infra/runtime/worker/outgoingDeliveryWorker.finalize.test.ts src/integrations/bersoncare/bookingLifecycleRoute.d14.test.ts` | PASS: 2 files, 30 tests. |
| `pnpm --dir apps/webapp exec vitest --run src/app-layer/booking/appointmentPaymentConfirmedHandler.d14.test.ts src/modules/payments/service.test.ts` | PASS: 2 files, 24 tests. |
| `pnpm --dir apps/webapp typecheck` | PASS. |
| `pnpm --dir apps/integrator typecheck` | PASS. |
| `bash apps/webapp/scripts/check-drizzle-migration-order.sh` | PASS: transaction-safe layout and migration order. |
| `pnpm run check:db-privileges-generated` | PASS: dev/test/prod privilege, allowlist and port-context artifacts match generators. |
| `/home/dev/brain/host-orch/run-tests.sh "pnpm run test:db-privileges"` | PASS: 391 tests, 188 passed, 203 skipped, 0 failed; static row-lock gate passed. DB opt-in tests were not run. |

Не запускались по brief: full CI, live server/DB, deploy, push. Product code не изменялся.
