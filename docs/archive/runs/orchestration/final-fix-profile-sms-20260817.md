# Final correction: patient greeting and clinic SMS fallback — 2026-08-17

## Scope and result

- Base: `5e7ee1f75`; branch: `wt/final-fix-profile-sms-20260817`.
- Audit-A greeting failure fixed: Today uses only structured `firstName`; surname-first legacy
  `displayName` is not guessed. Structured FIO profile read/write code is unchanged.
- Audit-A clinic settings failure fixed: `sms_fallback_enabled` is an organization-owned setting and
  is read, displayed, written and read back in the same three-row transactional batch as comments and
  media defaults. The doctor route rejects a stale platform-global row from clinic readback.
- The intentional platform-global fallback remains available only through the existing explicit
  platform fallback-write option; no second setting/entity was introduced.
- The audit UI test's contradictory two-key equality plus third-key containment was replaced by the
  stronger exact three-key batch oracle.
- No DB, DEV, TEST, PROD, env, deploy or push action was performed.

## Validation

- Pre-fix authority reproduction:
  `pnpm -C apps/webapp exec vitest run src/modules/patient-home/patientGreetingPersonalizedName.unit.test.ts src/app/api/doctor/settings/route.route.test.ts src/app/app/settings/SettingsForm.ui.test.tsx`
  — expected red, `3 failed | 2 passed`.
- Focused product/service gate:
  `pnpm -C apps/webapp exec vitest run src/modules/patient-home/patientGreetingPersonalizedName.unit.test.ts src/app/api/doctor/settings/route.route.test.ts src/app/app/settings/SettingsForm.ui.test.tsx src/modules/system-settings/clinicOwnerSettingsBatch.unit.test.ts src/modules/system-settings/platformGlobalFallback.unit.test.ts`
  — PASS, `5 files`, `11/11` tests.
- Broad settings/FIO regression gate:
  `pnpm -C apps/webapp exec vitest run src/modules/system-settings src/app/api/admin/settings/route.route.test.ts src/app/api/doctor/settings/route.route.test.ts src/app/app/settings/SettingsForm.ui.test.tsx src/app/app/settings/page.unit.test.ts src/modules/patient-home/patientGreetingPersonalizedName.unit.test.ts src/shared/lib/fio.test.ts 'src/app/api/doctor/patients/[userId]/fio/fio.route.test.ts'`
  — PASS, `15 files`, `68/68` tests.
- Final focused/page gate after cleanup — PASS, `6 files`, `12/12` tests; final route-only rerun —
  PASS, `1 file`, `3/3` tests.
- `pnpm -C apps/webapp typecheck` — PASS.
- Scoped ESLint over all changed production files — PASS; final route-only rerun — PASS.
- `git diff --check` — PASS.
