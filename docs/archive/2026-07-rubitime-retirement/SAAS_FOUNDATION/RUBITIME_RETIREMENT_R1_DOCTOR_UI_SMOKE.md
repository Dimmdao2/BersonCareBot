# Rubitime retirement R1 — doctor UI smoke

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Run id: `R1-DOCTOR-UI-SMOKE-codex-2026-07-14`

Verdict: **PASS** after fixing two canonical doctor-read smoke blockers.

All evidence below is aggregate-only. No patient names, phones, emails, row ids, payloads, screenshots, or message
bodies are recorded in this file.

## Scope

The clean-dump data proof remains `RUBITIME_RETIREMENT_R1_CLEAN_DUMP_REHEARSAL.md`.

This smoke was run against current local `bcb_webapp_dev` because the disposable clean-dump mirror DBs were removed
after the owner request to clean up test mirrors. Before UI/API checks, the existing read-only R1 aggregate scripts were
rerun against `bcb_webapp_dev` with the owner Rubitime CSV (`records-2.csv`) to confirm that the visible-data risk
buckets were still closed.

## Pre-smoke aggregate state

| Check                                  |                  Result |
| -------------------------------------- | ----------------------: |
| `rubitime-r1-clean-dump-preflight.mjs` |                    PASS |
| CSV parsed Rubitime ids                |                     392 |
| CSV date span                          | 2026-01-16...2026-08-29 |
| Stale vs owner CSV                     |                       0 |
| Unmapped real active                   |                       0 |
| Duplicate clusters                     |                       0 |
| Raw-only records                       |                       0 |
| Legacy-only records                    |                     312 |
| Status mismatches                      |                       4 |
| `record_at` mismatches over 5 minutes  |                       2 |

Interpretation: `legacy-only` and raw mismatch counts are not R1 cleanup blockers under the owner source-of-truth
decision. Fresh Rubitime CSV is canon; `integrator.rubitime_records` is audit-only when it disagrees.

## Smoke blockers fixed

The first UI smoke attempt exposed two doctor-read failures unrelated to Rubitime cleanup semantics:

1. Canonical doctor appointment reads used Drizzle `notInArray` for UUID audience exclusions, which generated a
   `uuid = text` Postgres comparison in the doctor Today/KPI path.
2. Canonical doctor list reads joined `be_appointments.package_usage_ref` (`text`) directly to `be_package_usages.id`
   (`uuid`), which failed the doctor appointments list.

Fixes:

- `drizzleExcludeUserIdColumn` now renders UUID-cast values for Drizzle SQL fragments.
- `pgDoctorCanonicalAppointments` uses that helper for appointment audience exclusion.
- `pgDoctorCanonicalAppointments` joins package usages through a guarded UUID text cast.

## API smoke

Authenticated via documented dev-bypass (`dev:admin`) on `http://127.0.0.1:5200`.

| Surface                      | Endpoint / route                                    | Result                                               |
| ---------------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| Session                      | `/api/me`                                           | 200                                                  |
| Booking overview             | `/api/doctor/booking-engine/overview`               | 200                                                  |
| Doctor calendar              | `/api/doctor/booking-engine/calendar` over CSV span | 200, `readSource=canonical`, 301 events              |
| Doctor KPI                   | `/api/doctor/schedule-kpis` over CSV span           | 200                                                  |
| Doctor appointments list API | `/api/doctor/appointments/list?view=past&limit=50`  | 200, 47 rows returned                                |
| Doctor Today page            | `/app/doctor`                                       | 200                                                  |
| Doctor schedule page         | `/app/doctor/schedule?tab=cal`                      | 200                                                  |
| Legacy appointments URL      | `/app/doctor/appointments`                          | 200 after redirect to `/app/doctor/schedule?tab=cal` |

KPI aggregate returned:

| KPI                    | Count |
| ---------------------- | ----: |
| recordsInPeriod        |   286 |
| pastInPeriod           |   274 |
| futureInPeriod         |    12 |
| bySubscriptionInPeriod |     3 |
| firstVisitInPeriod     |    88 |
| repeatVisitInPeriod    |   198 |
| uniquePatientsInPeriod |    88 |
| cancellationsInPeriod  |     0 |
| reschedulesInPeriod    |     6 |

The old `/app/doctor/appointments` URL is intentionally redirected by `middleware/doctorRouteRedirects.ts` to the new
schedule aggregate page (`/app/doctor/schedule?tab=cal`). The list API remains available for past appointment lazy
loading.

## Browser smoke

Headless Chromium screenshots were captured locally through CDP for:

- `/app/doctor`;
- `/app/doctor/schedule?tab=cal`;
- `/app/doctor/appointments` (redirected schedule tab).

Screenshots were inspected locally and not committed because they contain production-derived personal data. No Next.js
error boundary or 500 page was visible on the inspected screenshots.

## Validation commands

- `pnpm -C apps/webapp exec vitest run src/modules/analytics/analyticsAudience.test.ts src/infra/repos/pgDoctorCanonicalAppointments.test.ts`
- `pnpm -C apps/webapp run typecheck`
