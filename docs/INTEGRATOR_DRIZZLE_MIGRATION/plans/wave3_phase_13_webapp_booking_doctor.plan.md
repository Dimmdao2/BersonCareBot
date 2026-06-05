---
name: Wave3 Phase13 Webapp booking doctor
overview: Booking catalog, patient bookings tail, doctor appointments/clients/analytics, createDoctorClient, motivation actions.
status: pending
isProject: false
todos:
  - id: w3-p13-catalog
    content: "pgBookingCatalog.ts (37) — крупнейший блок; runWebappSql + Drizzle где просто."
    status: pending
  - id: w3-p13-bookings-appt
    content: "pgPatientBookings.ts (15), pgDoctorAppointments.ts (11), pgAppointmentProjection.ts (9)."
    status: pending
  - id: w3-p13-doctor-clients
    content: "pgDoctorClients.ts (18), pgDoctorAnalyticsMetricAccounts.ts (25), createDoctorClient.ts (7)."
    status: pending
  - id: w3-p13-motivation
    content: "app/doctor/content/motivation/actions.ts (10) — SQL в infra port."
    status: pending
  - id: w3-p13-verify
    content: "booking-rubitime-sync consumer tests + doctor clients tests."
    status: pending
---

# Wave 3 — фаза 13: Booking + doctor

## Размер

**L**

## Definition of Done

- [ ] Файлы фазы без необъяснённого `pool.query`.
- [ ] `pgPatientBookings` по-прежнему делегирует Rubitime upsert в `booking-rubitime-sync` package (не ломать P8).
- [ ] Doctor analytics SQL — parity тесты или snapshot counts.
- [ ] Фильтры/DTO booking/doctor paths валидируются Zod на boundary-слое.

## Scope

| Файл | queries |
|------|---------|
| `pgBookingCatalog.ts` | 37 |
| `pgDoctorAnalyticsMetricAccounts.ts` | 25 |
| `pgDoctorClients.ts` | 18 |
| `pgPatientBookings.ts` | 15 |
| `pgDoctorAppointments.ts` | 11 |
| `motivation/actions.ts` | 10 |
| `pgAppointmentProjection.ts` | 9 |
| `createDoctorClient.ts` | 7 |
| `pgBookingCalendarLegacy.ts` | 1 |
| `pgDoctorBroadcastDelivery.ts` | 6 |
| `pgDoctorProactiveInsights.ts` | 5 |
| `pgDoctorNotes.ts` | 2 |
| `pgBranches.ts` | 2 |

**Вне scope:** `packages/booking-rubitime-sync` internals.

## Порядок внутри PR

1. `pgBookingCatalog` (разбить на commits: read paths → write paths).
2. appointments + patient bookings.
3. doctor clients + analytics.
4. motivation actions → extract repo.

## Проверки

```bash
pnpm --dir packages/booking-rubitime-sync run test
pnpm --dir apps/webapp exec vitest run --project fast pgPatientBookings pgDoctorAppointments pgDoctorClients 2>/dev/null | tail -15
```
