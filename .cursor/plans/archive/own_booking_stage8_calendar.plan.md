---
name: "Own Booking Engine — Stage 8: Specialist/admin calendar"
overview: "Этап 8 закрыт: календарь врача (luxon+shadcn) на каноне `be_appointments` + blocks + free/busy слоты; список записей на канон; GCal зеркало `be:{appointmentId}`; lifecycle/оплаты/абонементы в карточке."
gitBranch: initiative/own-booking-engine
status: completed
isProject: false
todos:
  - id: s8-component
    content: "Выбор календарного компонента; решение Q3 в SCOPE_DECISIONS (luxon+shadcn grid)"
    status: completed
  - id: s8-read
    content: "Read-модель booking-calendar из be_appointments + schedule_blocks; tenant-safe агрегация"
    status: completed
  - id: s8-view
    content: "Представление: записи, free/busy слоты, статусы, оплаты, абонементы, блокировки, lifecycle"
    status: completed
  - id: s8-actions
    content: "Действия: manual create/reschedule/cancel через booking-engine lifecycle + assertSlotAvailable"
    status: completed
  - id: s8-filters
    content: "Фильтры: specialist/branch/room/service; view day|week|month; includeFreeSlots"
    status: completed
  - id: s8-gcal
    content: "GCal зеркало syncCanonicalAppointmentToCalendar; booking.* + payment_captured"
    status: completed
  - id: s8-list
    content: "Список /doctor/appointments на pgDoctorCanonicalAppointments; actions booking-engine API"
    status: completed
  - id: s8-verify
    content: "Тесты; typecheck/lint; api.md, DOCTOR_CABINET_NAVIGATION, LOG, ROADMAP, STAGE_CHECKLISTS"
    status: completed
  - id: s8-audit
    content: "Post-audit: dedupe intents, SSA duration для слотов, lifecycle UI, docs B-list"
    status: completed
---

# Этап 8 — Календарь специалиста / администратора

> **Статус:** `completed` (2026-05-30). ТЗ: `STAGE_CHECKLISTS.md` §Этап 8. План в архиве: `.cursor/plans/archive/`.

## Итог поставки

| Область | Реализация |
|---------|------------|
| Read-модель | `modules/booking-calendar` + `infra/repos/pgBookingCalendar.ts` |
| API | `GET /api/doctor|admin/booking-engine/calendar`; manual appointments |
| UI врача | `/app/doctor/calendar` — `DoctorBookingCalendarClient` + `DoctorCalendarEventPanel` |
| Список записей | `/app/doctor/appointments` → `pgDoctorCanonicalAppointments` (`be_appointments`) |
| Free/busy | `includeFreeSlots=1` при specialist+branch+service; SSA duration/room |
| GCal | `syncCanonicalAppointmentToCalendar`, map key `be:{id}`; integrator `booking.*` + `payment_captured` |
| Компонент | Q3: собственный grid luxon + shadcn (без FullCalendar) |

## Scope boundaries (факт)

- **Сделано:** календарь и список врача на каноне; admin calendar API (без отдельного admin UI-страницы).
- **Вне scope этапа 8:** карточка клиента / полный таймлайн (этап 9); список клиентов с фильтром по `appointment_records`; пациентский upcoming/past (проекция до этапа 9).

## Definition of Done (этап 8)

- [x] Календарь специалиста на каноне: просмотр/создание/перенос/отмена/фильтры (§15.1,§15.4).
- [x] Список записей врача читает `be_appointments`, не `appointment_records` (UI §B-list).
- [x] Календарная выборка tenant-safe по `organization_id` (C1).
- [x] Статусы/оплаты/абонементы/lifecycle/комментарии в карточке события.
- [x] Free/busy слоты при полном наборе фильтров (§15.1).
- [x] GCal — зеркало; канон — БД (§15.3,C8).
- [x] UI §B-calendar; целевые тесты; docs/навигация обновлены; Q3 закрыт.

## Gate

Сужения и выбор компонента — в `SCOPE_DECISIONS.md` Q3.
