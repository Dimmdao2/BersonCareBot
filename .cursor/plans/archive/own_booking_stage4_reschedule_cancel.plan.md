---
name: "Own Booking Engine — Stage 4: Reschedule & cancellation policies"
overview: "Этап 4 (done): раздельные политики отмены/переноса, самостоятельный перенос/отмена, ручные решения, anti-bypass §8.4, append-only история, integrator booking.rescheduled, проекция appointment_records. План в archive; статус этапа — ROADMAP/MASTER_PLAN/LOG."
status: completed
gitBranch: initiative/own-booking-engine
isProject: false
todos:
  - id: s4-policies
    content: "Drizzle 0091: be_cancellation_policies, be_reschedule_policies; booking-policies resolver"
    status: completed
  - id: s4-reschedule
    content: "Самостоятельный перенос (lifecycle + UI rescheduleBookingId); excludeAppointmentId в слотах"
    status: completed
  - id: s4-cancel
    content: "Отмена по политикам; порядок Rubitime → канон; legacy без canonical_appointment_id"
    status: completed
  - id: s4-manual
    content: "Admin/doctor manual-cancel|manual-reschedule; staffAppointmentLifecycleEffects"
    status: completed
  - id: s4-antibypass
    content: "original_start_at + история; policyResolver §8.4 + unit-тесты"
    status: completed
  - id: s4-history
    content: "be_appointment_reschedules / be_appointment_cancellations; GET .../lifecycle (admin + doctor)"
    status: completed
  - id: s4-notify
    content: "emit booking.cancelled|rescheduled; integrator schema+handler; notifications_sent"
    status: completed
  - id: s4-projection
    content: "projectCanonicalAppointment Rescheduled/Cancelled → appointment_records"
    status: completed
  - id: s4-ui
    content: "BookingPoliciesSection, BookingManualLifecycleSection, CabinetBookingActions"
    status: completed
  - id: s4-verify
    content: "Тесты policyResolver, lifecycle, routes, integrator; typecheck; docs sync"
    status: completed
  - id: s4-audit
    content: "Аудит: lifecycle_failed, doctor API, api.md, DB_STRUCTURE, patient-booking.md"
    status: completed
---

# Этап 4 — Переносы и отмены

> ТЗ: [`STAGE_CHECKLISTS.md`](../../../docs/OWN_BOOKING_ENGINE_INITIATIVE/STAGE_CHECKLISTS.md) §Этап 4. Зависит от этапа 2. **Статус:** `done` ([`ROADMAP.md`](../../../docs/OWN_BOOKING_ENGINE_INITIATIVE/ROADMAP.md)).

## Реализовано (карта кода)

| Область | Пути |
|--------|------|
| Миграция | `apps/webapp/db/drizzle-migrations/0091_booking_stage4_policies_lifecycle.sql`, `db/schema/bookingPolicies.ts` |
| Политики | `modules/booking-policies/` (`policyResolver.ts`, `service.ts`) |
| Lifecycle | `modules/booking-appointment-lifecycle/`, `infra/repos/pgBookingAppointmentLifecycle.ts` |
| Пациент | `modules/patient-booking/service.ts` (cancel/reschedule/preview), `projectCanonicalAppointment.ts`, `bookingLifecycleNotifications.ts` |
| API пациент | `GET /api/booking/actions`, `POST /api/booking/reschedule`, `POST /api/booking/cancel` |
| API admin | `.../policies`, `.../appointments/[id]/manual-cancel`, `manual-reschedule`, `GET .../lifecycle` |
| API doctor | `/api/doctor/booking-engine/appointments/[id]/manual-cancel`, `manual-reschedule`, `GET .../lifecycle` |
| Staff FX | `app-layer/booking/staffAppointmentLifecycleEffects.ts` |
| Integrator | `booking.rescheduled` в `schema.ts` + `recordM2mRoute.ts`; webapp `bookingM2mApi.updateRecord` |
| UI | `BookingPoliciesSection`, `BookingManualLifecycleSection`, `CabinetBookingActions`, режим переноса в booking wizard |

## Поведение (контракты)

- **Отмена (канон):** preview → `markCancelling` → Rubitime `cancelRecord` (если есть id) → `patientCancel` → `patient_bookings.cancelled` → проекция `native.cancelled` → `booking.cancelled` → `notifications_sent`.
- **Сбой канона после Rubitime:** `patient_bookings.cancel_failed`, ошибка `lifecycle_failed` (API 502).
- **Перенос:** слот с `excludeAppointmentId` → lifecycle → mirror Rubitime `updateRecord` (best-effort) → `booking.rescheduled` → проекция `native.rescheduled`.
- **Ручные решения:** override; integrator-события для staff — `skipped` в `notifications_sent` (без patient_booking id).

## Scope boundaries

- **Вне scope (этапы 5/6):** фактические возвраты/списания абонемента; UI политик specialist/service/product (API + org-default в UI) — см. [`SCOPE_DECISIONS.md`](../../../docs/OWN_BOOKING_ENGINE_INITIATIVE/SCOPE_DECISIONS.md) §6.

## Definition of Done (этап 4)

- [x] Раздельные CancellationPolicy/ReschedulePolicy с уровнями и резолвером (§8.5, §8.3).
- [x] Таблицы политик и истории tenant-aware (`organization_id`) (C1).
- [x] Самостоятельный перенос + отмена по правилам (§8.1, §9.1).
- [x] Ручные решения admin/doctor (§9.2, §22.5).
- [x] Анти-обход §8.4 (тест `policyResolver.test.ts`, C7).
- [x] Append-only история + `notifications_sent` (§9.4, C3); C6 на уровне контракта.
- [x] Уведомления: integrator lifecycle events (C4).
- [x] UI §A8 / §C-actions / §B-actions; docs: `LOG.md`, `api.md`, `DB_STRUCTURE.md`, `patient-booking.md`, `RUBITIME_BOOKING_PIPELINE.md`.

## Gate

Этап 5 — предоплата и оплаты. Полный `pnpm run ci` — перед merge ветки инициативы в `main` (не обязателен на каждый подшаг этапа 4).
