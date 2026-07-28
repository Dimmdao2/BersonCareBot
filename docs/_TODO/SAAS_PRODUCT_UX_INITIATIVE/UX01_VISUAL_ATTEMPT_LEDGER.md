# UX-01 Visual Attempt Ledger

**Current runs:** `UX-ROLE-MATRIX/2026-07-15T16-42-31Z` + patient replay `2026-07-15T17-51-35Z`
**Evidence commit:** `a537e74df6e5e38d589dd7dc0ec8549dcf848756`

The former `UX01-EVIDENCE-FIX-20260715T142736Z` ledger is historical pre-refresh evidence. Its missing-function/read-only-DEV reasons are no longer current and its screenshots are not included in current totals.

## DEV role matrix

| Slice          | Attempted entrypoints                                                              | Retained | Result / gap                                                                                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------- | -------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public         | `/api/auth/dev-public` → `/app`; `/`                                               |        3 | Valid clean login desktop/mobile and landing mobile; no session and no identifiers.                                                                                                                              |
| Registration   | `/api/auth/dev-public?view=registration`                                           |        2 | Valid desktop/mobile specialist signup with email, password, specialist name and organization title. `specialist_signup_enabled=true` was enabled through the standard DEV admin settings API; no signup submit. |
| Patient        | `dev:client`; `/app/patient`, booking, treatment, profile, notification settings   |        9 | 7 valid: booking, treatment/program, profile, notification settings and mobile navigation. Desktop/mobile Today are finding-only `organization_principal_required`.                                              |
| Regular doctor | `dev:doctor`; Today, patients, schedule, communications, exercises                 |        5 | Today desktop/mobile plus patients, schedule and LFK desktop valid. Communications capture deleted: real-looking restored names/messages.                                                                        |
| Clinic admin   | `dev:clinic-admin`; Today, members, settings                                       |        4 | Desktop/mobile shell boundary and desktop management surfaces valid. Clinic links present; global sections absent.                                                                                               |
| Global admin   | `dev:admin`; Today, analytics, system health, audit log, promo, sensitive settings |        6 | Five valid/empty frames and one system-health finding. Five sensitive setting/health attempts deleted after privacy review. Expanded mobile Sheet remains unverified.                                            |

### Patient replay and controlled DEV mutations

With explicit owner authorization, the copied TEST-only lock trigger/function was removed from current DEV by a
database-name-guarded operation. `patient_app_maintenance_enabled=false` was then set through the standard admin API,
and synthetic `dev:client` active enrollment was restored in organization `a000...0001`. TEST/PROD and application
code were not changed. The two old maintenance captures are historical/superseded and excluded.

After that, booking, treatment, profile, notification settings and navigation rendered. Today was replayed after
enrollment restoration and still reaches `organization_principal_required`; its two captures are finding-only and
represent an independent RSC/product defect.

## Imported TEST walkthrough

| Run                    | Raw PNG | Current valid | Current finding-only | Superseded/excluded | Notes                                                                                                           |
| ---------------------- | ------: | ------------: | -------------------: | ------------------: | --------------------------------------------------------------------------------------------------------------- |
| `2026-07-15T13-50-53Z` |      40 |            32 |                    2 |                   6 | Public + clinic-owner A/B. Old Today and legacy appointments findings superseded; references remains a finding. |
| `2026-07-15T14-48-56Z` |      12 |             4 |                    0 |                   8 | Fixed Today/badge valid; KPI-bearing schedule frames superseded by final KPI replay and excluded.               |
| `2026-07-15T15-42-10Z` |       4 |             4 |                    0 |                   0 | Final schedule list/KPI A/B evidence; no findings.                                                              |

The TEST profiles are combined clinic-owner/clinic-admin with specialist context. They do not prove the isolated regular-doctor boundary; DEV `dev:doctor` does.

## Current totals

- Current safe retained/referenced PNG: `71`.
- Valid product/role-state PNG: `66`.
- Finding-only PNG excluded from verification: `5`.
- Superseded TEST PNG excluded from all current totals: `14`.
- Historical patient maintenance PNG excluded from all current totals: `2`.
- Deleted DEV attempts are not included in any total.

## Remaining visual gaps

- Patient Today healthy state: `organization_principal_required` after active enrollment restoration.
- Patient messages, reminders, diary, purchases/memberships and deeper program/booking states were not replayed.
- Specialist registration submit, identity verification and first-run states were not exercised.
- Regular-doctor communications: privacy/tenant-scope omission after unsafe capture deletion.
- Expanded global-admin mobile navigation Sheet: direct screenshot mode could not click it.
- Valid invite token, signed miniapp, payment/write/delivery and multi-organization patient states remain outside current safe fixture evidence.

A fresh independent audit must verify these classifications. The historical `UX01_INDEPENDENT_AUDIT.md` and
`UX01_FRESH_AUDIT_2026-07-15.md` verdicts remain FAIL records.
