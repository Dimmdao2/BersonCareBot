# Appointment delivery format — independent audit

Candidate: `411949f64` relative to `9b0f8965a`.

Overall: **FAIL**. The two failing acceptance tests below are intentionally retained for the worker handoff; no production code was changed by this audit.

| Required class | Verdict | Evidence |
| --- | --- | --- |
| 1. Create/default/backfill | PASS | View: migration backfills Online location or linked online `patient_bookings.booking_type`, then sets `NOT NULL DEFAULT 'in_person'`; `canonicalCreate` explicitly writes `online` for a branchless online patient booking. Acceptance: `pnpm --dir apps/webapp exec vitest run src/modules/patient-booking/canonicalCreate.d14.test.ts --testNamePattern 'persists online as the canonical delivery format'` passed before injection. |
| 2. Edit semantics | FAIL | `pgBookingAppointmentLifecycle.awaitingPayment.unit.test.ts` fails on candidate: an end/duration-only edit with unchanged start is returned as the old slot with `rescheduleCount: 0`, rather than being a real reschedule. The format-only branch itself is green and has a fault injection below. |
| 3. Projection/permissions | FAIL | `pgPatientBookings.deliveryFormat.unit.test.ts` fails on candidate: `updateStaffProjection({ bookingType: 'online' })` does not bind `online` to the database write, so an existing legacy projection retains stale `patient_bookings.booking_type`. View/generator checks otherwise pass: migration has no ACL statements; owner, schema/language and rehome markers are present; declaration covers staff write plus five whole-row function surfaces and patient-booking seam; `node deploy/postgres/privileges/generate-cli.mjs --check && node deploy/postgres/privileges/generate-cli.mjs --all --check --port-context-only` passed. |
| 4. Today CTA | PASS | `DoctorTodayNextAppointment` uses the stored delivery format, effective video capability and linked patient account to select live destination; fallback stays on ordinary visit destination. `pnpm --dir apps/webapp exec vitest run src/app/app/doctor/DoctorTodayNextAppointment.ui.test.tsx --testNamePattern 'selects the appointment call destination'` passed before injection. |
| 5. Independence | PASS | View: candidate diff changes no video entitlement/live access or `PatientCardClient` path; only the old Today-card camera is replaced with the format-aware primary action. Calendar receives `isOnline` from repository-side `isBuiltInOnlineLocation`, not a label guess. This is a one-time architecture/diff check under AGENTS.md §24.4, not a source-text test. |

## Findings for handoff

1. **Duration-only reschedule is lost.** A doctor can change an appointment's end/duration while preserving start time; `applyReschedule` treats it as format-only and updates neither end nor duration, creates no reschedule record, and does not retain the established reschedule semantics. This violates Flow G: real time changes must retain existing reschedule behavior. Oracle: `apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.awaitingPayment.unit.test.ts`, test `изменение окончания при неизменном начале остаётся настоящим переносом`.

2. **Canonical format does not reach an existing patient-booking projection.** A format-only edit correctly reaches `ensureStaffBookingProjection`, but `pgPatientBookingsPort.updateStaffProjection` does not persist its `bookingType` input. Patient/staff projection can therefore continue saying `in_person` after the canonical appointment is online, violating Flow G's single source requirement. Oracle: `apps/webapp/src/infra/repos/pgPatientBookings.deliveryFormat.unit.test.ts`, test `sends the canonical online format across the existing-projection write boundary`.

## Fault injections

All temporary production mutations were reverted before this artifact was written.

| Class | Temporary fault | Command and red assertion |
| --- | --- | --- |
| Create/default | Changed online patient create to persist `in_person`. | `pnpm --dir apps/webapp exec vitest run src/modules/patient-booking/canonicalCreate.d14.test.ts --testNamePattern 'persists online as the canonical delivery format'` → `deliveryFormat`: expected `online`, received `in_person`. |
| Edit semantics | Disabled the format-only early branch in `applyReschedule`. | `pnpm --dir apps/webapp exec vitest run src/infra/repos/pgBookingAppointmentLifecycle.awaitingPayment.unit.test.ts --testNamePattern 'смена только формата'` → `rescheduleCount`: expected `0`, received `1`. |
| Projection/permissions | Baseline acceptance failure; no separate injection needed. | `pnpm --dir apps/webapp exec vitest run src/infra/repos/pgPatientBookings.deliveryFormat.unit.test.ts` → driver-bound values omit `online`. |
| Today CTA | Disabled effective-video predicate. | `pnpm --dir apps/webapp exec vitest run src/app/app/doctor/DoctorTodayNextAppointment.ui.test.tsx --testNamePattern 'selects the appointment call destination'` → expected appointment live href missing. |
| Independence | One-time architecture/diff evidence; no behavioral test applies. | `node /home/dev/brain/tools/code-search.mjs "PatientCardClient live video call appointment" --repo bcb -k 20` plus `git diff --name-only 9b0f8965a..411949f64 | rg 'video|live|PatientCard|entitlement|meeting'` found no candidate changes to entitlement/live access or patient-card camera path. |

## Additional targeted checks

- `pnpm --dir apps/webapp typecheck` — PASS.
- `node deploy/postgres/privileges/generate-cli.mjs --check && node deploy/postgres/privileges/generate-cli.mjs --all --check --port-context-only` — PASS.
- Already supplied exact-SHA evidence was reused, not repeated: `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` — PASS, rollback-only.

