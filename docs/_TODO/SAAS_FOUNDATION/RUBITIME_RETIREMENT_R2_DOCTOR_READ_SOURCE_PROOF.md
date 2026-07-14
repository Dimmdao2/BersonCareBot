# Rubitime retirement R2 — doctor read-source canonical-only

Run id: `R2-DOCTOR-READ-SOURCE-codex-2026-07-14`

Verdict: **PASS for doctor-facing read-source cutover in code**. No production DB, prod env, live services, real channels,
or destructive table operations were touched.

All evidence below is aggregate-only. No patient names, phones, emails, row ids, raw payloads, screenshots, or message
bodies are recorded in this file.

## Source Of Truth

Owner decision for this phase:

- Fresh Rubitime CSV export is the canon for R1/R2 appointment preservation.
- The export is matched through existing city/branch mappings.
- The appointment set belongs to the owner doctor/specialist resolved through the owner-provided phone tail
  `9643805480`.
- If a row is present in the fresh Rubitime CSV, it must be preserved in canonical appointment state.
- If a row is absent from the fresh Rubitime CSV, it is not a preservation blocker for doctor read-source cutover.
- `integrator.rubitime_records` is audit-only when it disagrees with the fresh Rubitime export and current canonical
  history. It is not the source of truth for deciding which doctor appointments are needed.

This closes the recurring ambiguity around legacy-only/raw-only counts: current doctor cutover follows Rubitime export
canon, not stale integrator residue.

## Code Boundary

Doctor-facing appointment reads now use canonical data at runtime:

| Surface | Runtime source after R2 |
| --- | --- |
| Doctor appointments list API | `be_appointments` through `pgDoctorCanonicalAppointments` |
| Doctor Today/KPI | `be_appointments` through canonical KPI queries |
| Doctor schedule/calendar | canonical booking calendar, unchanged |
| Doctor dashboard appointment metrics | canonical port through the R2 read switch |
| Doctor appointment analytics metric account lists | canonical SQL, independent of the retired setting |
| Admin booking overview read-source display | reports doctor read source as `canonical` |
| Settings UI | no longer offers Rubitime legacy for doctor appointment reads |
| Settings API | rejects `booking_doctor_appointments_read_source=rubitime_legacy` |

The old DB setting row may still exist for rollback/audit, but it no longer changes doctor-facing runtime behavior.

## Remaining `appointment_records` Consumers

R2 does not drop `appointment_records`. The table remains a deprecated projection/archive table until later phases.

Current non-R2 consumers are assigned as follows:

| Consumer area | Disposition |
| --- | --- |
| Projection writes and cleanup (`pgAppointmentProjection`, Rubitime bridge/backfill scripts) | Keep until R6/R7 cutoff, archive, and drop proof. |
| Patient booking history UI (`/app/patient/booking/new`) | Migrated to `patientBooking.listMyBookings` / `patient_bookings`; no longer calls `patientCabinet.getPastAppointments` or `appointment_records` projection. |
| Doctor analytics contact breakdown (`pgDoctorClients.getClientContactBreakdown`) | Migrated to canonical `be_appointments` for patients-vs-subscribers classification. |
| Doctor dashboard patient metrics (`pgDoctorClients.getDashboardPatientMetrics`) | Migrated visited/new/former/subscriber/cancellation buckets to canonical `be_appointments`. |
| Doctor client list badges and filters (`pgDoctorClients.listClients`) | Migrated history/upcoming/visited/cancellation badges to canonical `be_appointments`; reschedule badge uses `be_appointment_reschedules` as the existing canonical lifecycle source of truth. |
| Doctor patient card header stats (`pgDoctorClients.getPatientCardHeader`) | Migrated total/first/last/next/cancellation counters to canonical `be_appointments`; reschedule count uses `be_appointment_reschedules`. |
| Doctor patient appointment tab (`pgDoctorClients.listPatientAppointments`) | Migrated to canonical `be_appointments`; service/branch/duration/package data now comes from canonical booking tables. |
| Doctor clinical booking link (`pgPatientClinical`) | Added `clinical_visit.canonical_appointment_id`, backfilled it from legacy links, and moved new visit linking/package enrichment to canonical appointment ids. Legacy `appointment_record_id` stays nullable compat/archive until R7. |
| Membership/package appointment status/session accounting (`pgMemberships`) | Migrated appointment verdicts to canonical `be_appointments`; package session accounting no longer reads `appointment_records`. |
| Staff delete/purge tombstone filter (`doctorAppointmentPurgeFilter`) | Keep until canonical deletion/tombstone replacement is designed. |
| Legacy doctor appointments port (`pgDoctorAppointments`) | Frozen rollback branch only; no longer selected when canonical port exists. |
| Legacy booking calendar port | Frozen compatibility only; doctor schedule calendar currently uses canonical feed. |

This assignment is the R2 boundary: doctor-facing read-source is canonical-only, while destructive cleanup of the legacy
projection table is blocked until R7.

## Rollback Boundary

Normal runtime rollback is a code rollback to the previous branch/commit. The settings value is intentionally no longer
a rollback switch for doctor appointment reads.

If emergency rollback is required before R7 table-drop work:

1. Revert the R2 code commit on the branch.
2. Redeploy the reverted code.
3. Only then may the old `booking_doctor_appointments_read_source` setting affect runtime again.

Do not use ad hoc SQL to resurrect Rubitime legacy reads while R2 code is deployed.

## Validation

Code/test validation for this R2 patch passed:

- `doctorAppointmentsReadSwitch` tests assert canonical reads even when the retired setting resolves to
  `rubitime_legacy`.
- `pgDoctorAnalyticsMetricAccounts` tests assert canonical SQL even when the retired resolver returns
  `rubitime_legacy`.
- Admin booking overview test asserts `doctorAppointmentsReadSource=canonical` while the mocked DB row is legacy.
- Admin settings test asserts `rubitime_legacy` is rejected for `booking_doctor_appointments_read_source`.

Commands:

| Command | Result |
| --- | --- |
| `pnpm -C apps/webapp exec vitest run src/infra/repos/doctorAppointmentsReadSwitch.test.ts src/infra/repos/pgDoctorAnalyticsMetricAccounts.test.ts src/infra/repos/pgDoctorAnalyticsMetricAccounts.parity.test.ts src/app/api/admin/booking-engine/overview/route.test.ts src/app/api/admin/settings/route.test.ts` | PASS, 5 files / 142 tests |
| `pnpm --dir apps/webapp exec vitest run src/infra/repos/pgDoctorClients.repo.test.ts` | PASS, 1 file / 16 tests |
| `pnpm --dir apps/webapp exec vitest run src/infra/repos/pgDoctorClients.repo.test.ts src/infra/repos/pgPatientClinical.test.ts src/infra/repos/patientResidualPrincipalOrgStamp.test.ts src/app/api/doctor/patients/[userId]/appointments/unlinked/route.test.ts src/app/api/doctor/patients/[userId]/visits/route.test.ts` | PASS, 5 files / 31 tests |
| `pnpm --dir apps/webapp exec vitest run src/infra/repos/pgMemberships.test.ts src/modules/memberships/service.test.ts` | PASS, 2 files / 48 tests |
| `pnpm -C apps/webapp run typecheck` | PASS |
| `pnpm -C apps/webapp run lint` | PASS |
| `pnpm --dir apps/webapp exec drizzle-kit check --config=drizzle.config.ts` | PASS |
| `pnpm run check:rubitime-retirement-r0` | PASS |
| `git diff --check` | PASS |

Runtime/API smoke for the same canonical doctor surfaces was already recorded in
`RUBITIME_RETIREMENT_R1_DOCTOR_UI_SMOKE.md` after the fresh CSV/canonical data proof:

- Doctor calendar API: `readSource=canonical`.
- Doctor KPI API: 200 with non-zero canonical aggregate.
- Doctor appointments list API: 200.
- Doctor Today, schedule, and legacy appointments redirect pages: 200.
