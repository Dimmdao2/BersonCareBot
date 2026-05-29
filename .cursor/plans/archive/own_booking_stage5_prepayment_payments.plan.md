---
name: "Own Booking Engine — Stage 5: Prepayment & payments layer"
overview: "Этап 5 (done): платёжный слой 0092–0093, mock-провайдер и system_settings, предоплата (услуга + онлайн-категория), awaiting_payment → capture → confirmed, refund/retain, перенос → history, integrator booking.payment_captured. UI §A9–A10, §B-pay, §C-pay, §P-pay. YooKassa — Q1 backlog."
status: completed
gitBranch: initiative/own-booking-engine
isProject: false
todos:
  - id: s5-core
    content: "Drizzle 0092 + bookingPayments schema; payment layer tables"
    status: completed
  - id: s5-online-policy
    content: "0093 online_category на be_prepayment_policies; patient_bookings awaiting_payment"
    status: completed
  - id: s5-provider-port
    content: "PaymentProviderPort + mock adapter"
    status: completed
  - id: s5-config-db
    content: "booking_payment_* in system_settings + merge/redaction"
    status: completed
  - id: s5-webhooks
    content: "payment_provider_event + /api/payments/webhook/[provider]"
    status: completed
  - id: s5-prepay
    content: "PrepaymentPolicy + awaiting_payment → paid → confirmed flow"
    status: completed
  - id: s5-refund-flow
    content: "Refund/retain on cancel (stage 4 integration)"
    status: completed
  - id: s5-reschedule-pay
    content: "prepayment_carried_on_reschedule; payment_ref on capture"
    status: completed
  - id: s5-history
    content: "be_payment_history_events; patient + staff lists"
    status: completed
  - id: s5-ui
    content: "A9/A10, B-pay, C-pay, P-pay (/book/pay)"
    status: completed
  - id: s5-notify
    content: "integrator booking.payment_captured (schema + handler)"
    status: completed
  - id: s5-verify
    content: "Tests + typecheck; LOG/ROADMAP/STAGE_CHECKLISTS/UI_SURFACES"
    status: completed
  - id: s5-audit
    content: "Post-audit: online quote, staff summary, schema status check, docs/api.md"
    status: completed
---

# Этап 5 — Предоплата и базовые оплаты

> ТЗ: [`STAGE_CHECKLISTS.md`](../../../docs/OWN_BOOKING_ENGINE_INITIATIVE/STAGE_CHECKLISTS.md) §Этап 5. Зависит от этапов 1–2, интеграция с отменой/переносом этапа 4. **Статус:** `done` ([`ROADMAP.md`](../../../docs/OWN_BOOKING_ENGINE_INITIATIVE/ROADMAP.md)).

## Реализовано (карта кода)

| Область | Пути |
|--------|------|
| Миграции | `0092_booking_stage5_payments.sql`, `0093_booking_prepayment_online_category.sql`; `db/schema/bookingPayments.ts` |
| Модуль | `modules/payments/` (`service.ts`, `ports.ts`, `prepaymentCalculator.ts`, `prepaymentContextFromBooking.ts`) |
| Infra | `infra/repos/pgPayments.ts`, `infra/payments/mockPaymentProvider.ts` |
| Создание | `patient-booking/canonicalCreate.ts` — intent + `markAwaitingPayment` при required prepay |
| DI | `buildAppDeps.ts` — `paymentsService`, `booking.payment_captured` → confirm projection |
| API пациент | `GET /api/booking/payment-status`, `POST /api/booking/payments/mock-complete`, `GET /api/booking/payment-history` |
| API публичный | `GET /api/booking/public/payment-status`, `POST /api/booking/public/payments/mock-complete` |
| API staff | `GET .../admin|doctor/booking-engine/appointments/[id]/payment`; `PUT .../prepayment-policies` |
| Webhook | `POST /api/payments/webhook/[provider]` |
| Integrator | `booking.payment_captured` в `schema.ts` + `recordM2mRoute.ts` |
| UI | `BookingPaymentsSection`, `BookingPrepaymentSection`, `BookingStaffPaymentPanel`, `/app/patient/booking/pay`, `/book/pay`, `BookingUpcomingSection`, `PatientBookingPaymentHistorySection` |
| Staff helper | `app-layer/booking/staffAppointmentPaymentSummary.ts`, `getByCanonicalAppointmentId` на bookings port |

## Поведение (контракты)

- **Предоплата:** политика по `service_id` (очно) или `online_category` (онлайн); глобальный выключатель `booking_payment_enabled`.
- **Создание:** `be_appointments.status = awaiting_payment` → intent; `patient_bookings.awaiting_payment`; **`booking.created` не эмитится** до оплаты.
- **Capture:** mock / webhook → `payment_ref` на appointment → `paid` → `confirmed` → `markConfirmedByCanonicalAppointment` → `booking.payment_captured` (напоминания).
- **Отмена:** `applyCancelPaymentOutcome` — refund или retain (этап 4 decision types).
- **Перенос:** `prepayment_carried_on_reschedule` в `be_payment_history_events` (patient + staff reschedule).

## Scope boundaries

- **Вне scope (Q1/Q2):** YooKassa/реальный эквайринг; ledger «баланс пациента»; расширенные §A13-уведомления об оплате (базовый текст в `payment_captured` есть).

## Definition of Done (этап 5)

- [x] Платёжный слой с идемпотентными вебхуками; деньги в minor units; `organization_id`.
- [x] Провайдеры из `system_settings` (НЕ ENV); mock без релиза; список провайдеров в UI.
- [x] Предоплата по услуге и онлайн-категории; статусы записи увязаны с оплатой.
- [x] Возврат/удержание при отмене; перенос фиксируется в history.
- [x] История оплат (`be_payment_history_events`).
- [x] UI: §A9/§A10 admin, §B-pay staff, §C-pay patient, §P-pay public.
- [x] Integrator `booking.payment_captured`; docs: `LOG.md`, `STAGE_CHECKLISTS`, `UI_SURFACES`, `DATA_MODEL_REFERENCE`, `CONFIGURATION_ENV_VS_DATABASE`, `api.md`, `patient-booking.md`, `DB_STRUCTURE.md`, `RUBITIME_BOOKING_PIPELINE.md`.

## Gate

Этап 6 — абонементы (списания поверх платёжного слоя). Полный `pnpm run ci` — перед merge ветки инициативы в `main`.
