# Rubitime retirement R3 — patient/public slots and create canonical-only

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Run id: `R3-SLOTS-CREATE-codex-2026-07-14`

Verdict: **PASS for patient/public slots and create cutover in code**. No production DB, prod env, live services, real
channels, or destructive table operations were touched.

All evidence below is aggregate-only. No patient names, phones, emails, row ids, raw payloads, screenshots, or message
bodies are recorded in this file.

## Runtime Boundary

R3 covers patient/public slot reads and patient/public create only.

| Surface                     | Runtime source after R3                                     |
| --------------------------- | ----------------------------------------------------------- |
| `GET /api/booking/slots`    | canonical `booking-scheduling`                              |
| public/patient create       | native `be_appointments` through booking engine             |
| create overlap guard        | canonical `assertSlotAvailable` plus DB constraints         |
| reschedule overlap guard    | canonical `assertSlotAvailable` with `excludeAppointmentId` |
| `booking_slots_read_source` | retired; old `rubitime` rows parse to `canonical`           |
| Settings UI                 | no longer offers Rubitime slots source                      |
| Settings API                | rejects `booking_slots_read_source=rubitime`                |

The old setting row may remain for audit/rollback, but it no longer changes patient/public slots or create behavior.

## What Is Not Closed Here

R3 does not remove all Rubitime references:

- cancel/reschedule mirror to Rubitime remains a later downstream/lifecycle phase (R4/R6);
- Rubitime mapping/admin catalog routes remain until R5/R6;
- raw provider tables and `appointment_records` remain until R7;
- branch-only rollback code in `canonicalCreate.ts` is frozen by helper functions returning `false`, not selected by
  settings or normal runtime.

## Code Boundary

Implemented R3 runtime changes:

- `parseBookingSlotsReadSource` returns `canonical` for old/unknown values.
- app DI defaults in-memory slots source to `canonical`.
- `getSlots` fails closed with `canonical_booking_unavailable` when canonical scheduling/booking engine deps are missing;
  it no longer falls back to integrator `fetchSlots`.
- `createBooking` fails closed with `canonical_booking_unavailable` when canonical deps are missing; it no longer falls
  back to Rubitime-first `createRecord`.
- normal canonical create disables both Rubitime-first create and best-effort create mirror.
- `rescheduleBooking` always checks canonical slot availability; old `rubitime` source no longer skips overlap checks.

## Validation

Commands:

| Command                                                                                                                                                                                                                                | Result                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `pnpm -C apps/webapp exec vitest run src/modules/patient-booking/canonicalCreate.test.ts src/modules/patient-booking/service.test.ts src/app/api/admin/booking-engine/overview/route.test.ts src/app/api/admin/settings/route.test.ts` | PASS, 4 files / 140 tests |
| `pnpm -C apps/webapp run typecheck`                                                                                                                                                                                                    | PASS                      |
| `pnpm run check:rubitime-retirement-r0`                                                                                                                                                                                                | PASS                      |
| `git diff --check`                                                                                                                                                                                                                     | PASS                      |

Additional runtime smoke with the full local webapp server is still useful before production deployment, but not required
to prove the R3 code boundary above.
