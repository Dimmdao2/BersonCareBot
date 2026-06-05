---
name: Wave3 Phase13 Webapp booking doctor
overview: Booking catalog, patient bookings tail, doctor appointments/clients/analytics, createDoctorClient, motivation actions.
status: pending
isProject: false
todos:
  - id: w3-p13a-catalog-read-write
    content: "13A: pgBookingCatalog.ts (37) — сначала read paths, затем write paths, без big-bang rewrite."
    status: pending
  - id: w3-p13b-bookings-appointments
    content: "13B: pgPatientBookings.ts (15), pgDoctorAppointments.ts (11), pgAppointmentProjection.ts (9), pgBookingCalendarLegacy.ts (1)."
    status: pending
  - id: w3-p13c-doctor-clients-analytics
    content: "13C: pgDoctorClients.ts (18), pgDoctorAnalyticsMetricAccounts.ts (25), createDoctorClient.ts (7), pgDoctorNotes.ts (2), pgBranches.ts (2)."
    status: pending
  - id: w3-p13d-motivation-and-tail
    content: "13D: motivation/actions.ts (10), pgDoctorBroadcastDelivery.ts (6), pgDoctorProactiveInsights.ts (5) — SQL в infra портовом слое."
    status: pending
  - id: w3-p13-verify
    content: "13E: booking-rubitime-sync consumer tests + doctor clients/appointments/analytics parity checks + rg ноль по scope."
    status: pending
---

# Wave 3 — фаза 13: Booking + doctor

## Предшественник

- Фаза **12** **completed** (2026-06-06): intake / purge / identity — [wave3_phase_12_webapp_intake_purge_identity.plan.md](./wave3_phase_12_webapp_intake_purge_identity.plan.md), журнал [LOG.md §Wave 3 phase 12](../LOG.md).

## Размер

**L**

## Подфазы (обязательный порядок)

### 13A — booking catalog core

- Файл: `pgBookingCatalog.ts`.
- Порядок внутри подфазы: read paths -> write paths.
- Проверка:
  - targeted tests catalog read/write.
  - `rg "pool\\.query|client\\.query" apps/webapp/src/infra/repos/pgBookingCatalog.ts`.

### 13B — appointments and patient bookings

- Файлы: `pgPatientBookings.ts`, `pgDoctorAppointments.ts`, `pgAppointmentProjection.ts`, `pgBookingCalendarLegacy.ts`.
- Критичный инвариант: `pgPatientBookings` продолжает делегировать Rubitime upsert в `booking-rubitime-sync`.
- Проверка:
  - tests patient bookings + appointments;
  - `pnpm --dir packages/booking-rubitime-sync run test`.

### 13C — doctor clients and analytics

- Файлы: `pgDoctorClients.ts`, `pgDoctorAnalyticsMetricAccounts.ts`, `createDoctorClient.ts`, `pgDoctorNotes.ts`, `pgBranches.ts`.
- Цель: parity по агрегатам и фильтрам.
- Проверка:
  - snapshot/parity tests для doctor analytics;
  - regression tests для doctor client flows.

### 13D — motivation and remaining doctor tails

- Файлы: `app/doctor/content/motivation/actions.ts`, `pgDoctorBroadcastDelivery.ts`, `pgDoctorProactiveInsights.ts`.
- Цель: route/action остаются thin, SQL живёт в infra.
- Проверка:
  - targeted tests motivation/proactive/broadcast paths.
  - `rg "pool\\.query|client\\.query" apps/webapp/src/app/app/doctor/content/motivation/actions.ts apps/webapp/src/infra/repos/pgDoctorBroadcastDelivery.ts apps/webapp/src/infra/repos/pgDoctorProactiveInsights.ts`.

### 13E — phase verify

- Цель: закрыть raw SQL tail в пределах scope фазы и зафиксировать в LOG.
- Проверка:
  - `rg -l "pool\\.query|client\\.query" apps/webapp/src --glob "*.ts"` + фильтр по scope 13.
  - fast tests по booking/doctor paths.

## Definition of Done

- [ ] Файлы фазы без необъяснённого `pool.query`.
- [ ] `pgPatientBookings` по-прежнему делегирует Rubitime upsert в `booking-rubitime-sync` package (не ломать P8).
- [ ] Doctor analytics SQL — parity тесты или snapshot counts.
- [ ] Фильтры/DTO booking/doctor paths валидируются Zod на boundary-слое.
- [ ] Подфазы 13A-13E закрыты в указанном порядке и зафиксированы в LOG.

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
