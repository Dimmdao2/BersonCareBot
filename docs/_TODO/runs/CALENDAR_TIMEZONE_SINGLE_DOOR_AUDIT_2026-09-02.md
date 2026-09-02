# CALENDAR TIMEZONE SINGLE DOOR — independent acceptance

**Candidate:** `833997e5d851f9b83166be43943c1b7a95465cc8` (`refactor(timezone): unify device sync rule`)

**Authority:** `docs/_TODO/DEEP_CODE_AUDIT_PLAN.md`, `N2-R1`; owner timezone rule
`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §34.

## Verdict: PASS

## Blind kill-set (written before existing tests were read)

| ID | Classification | Failure to kill | Evidence |
|---|---|---|---|
| K1 | view | Patient, doctor, or admin keeps an executable copy of device normalization/validation/equality instead of delegating to one rule. | Candidate diff and final call-site inspection: both former sync functions delegate to `app-layer/platform-user/syncCalendarTimezoneFromDevice.ts`; doctor and admin share the staff route/guard. |
| K2 | test | Blank/invalid input reads or writes; equal valid input writes; changed/empty valid input does not call exactly its supplied adapter or loses its result. | New `syncCalendarTimezoneFromDevice.unit.test.ts`: 7 assertions across invalid/blank, equal, changed and empty branches. |
| K3 | view | Common rule broadens a DB role, accepts an HTTP target, or bypasses the patient definer door / staff-side patient row restriction. | `pgPatientCalendarTimezone.ts` still calls only `app.set_current_patient_calendar_timezone(..., false)` for a patient principal; staff update retains `id`, `role = 'client'`, and `merged_into_id IS NULL`. Patient and staff routes supply only their respective guards' authenticated user ID. |
| K4 | view | Shared read creates a race that can write an equal value. | Both adapters retain `WHERE calendar_timezone IS NULL OR calendar_timezone <> candidate`; patient staff-side update keeps its existing restriction. |
| K5 | test | Existing device routes or the previously observed patient no-write regression no longer work. | Focused route/bootstrap and existing regression tests, below. |
| K6 | view | The active plan says CLOSED using evidence not true of the final candidate. | `N2-R1` accurately names the single service and role adapters; its stated existing `calendarTimezoneNoWriteOnMatch.unit.test.ts` has three cases, and its shared-build → webapp typecheck evidence is reproduced below. |

## Fault map

| Fault injected once | Narrow oracle that turned red | Result |
|---|---|---|
| Replaced the common equality return in `syncCalendarTimezoneFromDevice.ts` with `await port.readCurrent(userId);`, so a matching valid timezone reached `writeChanged`. | `syncCalendarTimezoneFromDevice.unit.test.ts` → `reads a valid matching timezone but does not write it`, expected `false`, received `true`. | **RED as required:** 1 failed / 7; temporary production mutation reverted before final checks. |

## Commands and results

Fault injection oracle (temporary mutation described above):

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app-layer/platform-user/syncCalendarTimezoneFromDevice.unit.test.ts"
```

Result: exit `1`; 1 failed / 7, precisely the equal-valid no-write assertion.

Final candidate gate:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir packages/operator-db-schema run build && pnpm --dir packages/db-principal run build && pnpm --dir packages/platform-merge run build && pnpm --dir packages/error-tracking run build && pnpm --dir apps/webapp exec vitest run src/app-layer/platform-user/syncCalendarTimezoneFromDevice.unit.test.ts src/infra/repos/calendarTimezoneNoWriteOnMatch.unit.test.ts src/app/api/patient/profile/calendarTimezoneDeviceOnly.route.test.ts src/shared/ui/doctor/StaffCalendarTimezoneBootstrap.ui.test.tsx src/app/app/patient/calendarTimezoneBootstrap.ui.test.tsx && pnpm --dir apps/webapp exec eslint src/app-layer/platform-user/syncCalendarTimezoneFromDevice.ts src/app-layer/platform-user/syncCalendarTimezoneFromDevice.unit.test.ts src/infra/repos/pgPatientCalendarTimezone.ts src/infra/repos/pgPlatformUserCalendarTimezone.ts && pnpm exec prettier --check apps/webapp/src/app-layer/platform-user/syncCalendarTimezoneFromDevice.ts apps/webapp/src/app-layer/platform-user/syncCalendarTimezoneFromDevice.unit.test.ts apps/webapp/src/infra/repos/pgPatientCalendarTimezone.ts apps/webapp/src/infra/repos/pgPlatformUserCalendarTimezone.ts && pnpm --dir apps/webapp typecheck"
```

Result: exit `0`; shared package builds passed; focused timezone suite passed **5 files / 19 tests**;
scoped ESLint and Prettier passed; webapp typecheck passed.

No full CI, live DB/DEV/TEST, service, privilege, schema, fallback, or UI changes were made.
