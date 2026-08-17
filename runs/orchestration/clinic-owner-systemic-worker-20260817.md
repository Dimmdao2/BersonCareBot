# Clinic-owner systemic worker — 2026-08-17

## Scope and boundary

- Branch/worktree: `wt/clinic-owner-systemic-20260817` / `/home/dev/dev-projects/bcb-wt-clinic-owner-systemic-20260817`.
- Source oracle: owner DEV traversal from 2026-08-17 and `clinic-owner-forensic-handoff.md`.
- Offline-only implementation. No named DEV, TEST, PROD, database, deployment, environment or historical migration replay was touched.
- The inherited checkpoint was preserved. Shared patient/B0 changes were not repaired or rewritten unless the clinic capability required an exact declaration overlap.

## Delivered owner paths

1. **Branch/location creation** — active tariffs now require an explicit `branches` stock; migration 0016 repairs only missing stock on the named Start (1) and Developer (unlimited) tariffs. Branch create/update returns an explicit `409 branch_quota_reached`, while declaration tests cover the exact default columns used by Drizzle.
2. **Past appointment unlink setting** — removed the duplicate allowlist entry, added the missing admin-scope key and direct route regression for save/readback of `booking_allow_doctor_unlink_past_package_sessions`.
3. **Cancellation/reschedule policies** — an empty organization state now exposes editable organization drafts for both policy kinds; POST creates without a fake UUID, reloads the persisted policy, and behavior tests prove cancellation/reschedule selection and cross-organization exclusion.
4. **Booking form field** — canonical field types include the existing UI's `text`; the route has bounded validation and safe duplicate/not-found/capability responses; repository checks empty writes; canonical privileges cover Drizzle default columns, with create/readback route regression.
5. **Cabinet settings** — clinic settings no longer expose or submit global `sms_fallback_enabled`; comment/media defaults use one validated transactional batch, return both persisted rows, verify readback, and reject stale/global payloads.
6. **Doctor screens** — a successful toggle refreshes the RSC shell exactly once; component/poller tests prove disabled clinical capability unmounts summary/unread polling and enabling restores it without a refresh loop.
7. **Clinic slug** — slug writes return validation/conflict results and redacted `503` capability/repository diagnostics; successful writes return fresh management state. Canonical grants cover every default/touched column in claims, public directory and rename-event writes.
8. **Clinic tariff/billing** — removed direct catalog-table access. Billing arithmetic now uses two exact fixed-column named roots: one for the clinic principal and one for the platform principal used by manual global-admin invoices. Provider/configuration failures map to safe 501/502/503 responses; existing full service regressions cover fiscal fail-closed and idempotent/no-duplicate invoice behavior.
9. **Clinic calendar appointment** — create form now exposes specialist, branch and dependent service controls with explicit empty-state explanations. Both manual routes require branch/service, preserve specialist access resolution, and return safe not-found/conflict/unavailable errors; route/UI tests cover exact IDs and invalid/cross-scope input.

## Green evidence

- `pnpm --filter webapp exec vitest --run src/app/api/admin/booking-engine/branches/route.route.test.ts src/app/api/admin/booking-engine/form-fields/route.route.test.ts src/app/api/admin/booking-engine/policies/route.route.test.ts src/app/api/admin/settings/route.route.test.ts src/app/api/admin/saas-billing/payments/manual/route.route.test.ts src/app/api/clinic/billing/route.route.test.ts src/app/api/clinic/slug/route.route.test.ts src/app/api/doctor/booking-engine/appointments/manual-patient-visit/route.route.test.ts src/app/api/doctor/booking-engine/appointments/manual/route.route.test.ts src/app/api/doctor/settings/route.route.test.ts src/app/app/doctor/calendar/DoctorCalendarEventPanel.ui.test.tsx src/app/app/settings/BookingPoliciesSection.ui.test.tsx src/app/app/settings/DoctorScreensToggleSection.ui.test.tsx src/app/app/settings/SettingsForm.ui.test.tsx src/modules/booking-policies/policyResolver.test.ts src/modules/org-entitlements/service.test.ts src/modules/saas-billing/service.test.ts src/modules/system-settings/clinicOwnerSettingsBatch.unit.test.ts src/shared/ui/doctor/shell/doctorClinicalPolling.ui.test.tsx`: **18 files passed, 178 tests passed** (one listed optional path had no matching test file and Vitest ignored it).
- `pnpm --filter webapp typecheck`: **PASS** after the final clinic/platform billing-root split.
- `git status --short | cut -c4- | rg '^apps/webapp/.*\.(ts|tsx)$' | sed 's#^apps/webapp/##' | xargs pnpm --filter webapp exec eslint --no-warn-ignored`: **PASS** for every changed TypeScript/TSX path.
- `pnpm exec tsc -p deploy/postgres/privileges/tsconfig.json --noEmit`: **PASS**.
- `node deploy/postgres/privileges/generate-cli.mjs --check`: **PASS**, both privilege and allowlist artifacts byte-identical to the declaration.
- `node deploy/postgres/privileges/generate-cli.mjs --census`: **PASS**, 219 ACTIVE relations across 3266 source files for each of `bcb_webapp_dev` and `bersoncarebot_test`.
- `node --test deploy/postgres/privileges/relation-access.test.mjs`: **38/38 PASS**.
- `node scripts/check-no-new-raw-sql.mjs`, both infra-boundary checks, both transaction-quota boundary checks, `check-legacy-migrations-frozen.sh`, `check-drizzle-journal-sync.sh`: **PASS**.
- Custom `parseOwnerStatements` assertion for migration 0016: **PASS**, one bounded backfill plus two owner-ordered named roots.
- `git diff --check`: **PASS** before report/staging.

## Inherited checkpoint failures, not clinic regressions

These gates are already stale against the preserved B0/patient checkpoint. The clinic additions are declared and independently covered; the worker did not rewrite shared B0 counters or patient oracles outside scope.

- `pnpm --filter webapp lint`: the repository-wide ESLint pass stops on inherited `PositiveSizeResponsiveContainer.tsx:36` (`react-hooks/set-state-in-effect`). The file is not changed by this work; changed-path ESLint is green.
- `node --test deploy/postgres/privileges/port-context-callsite-catalog.test.mjs`: after changing the billing calls back to literal named-root arguments, both clinic roots are accepted. Remaining first undeclared callsite is inherited `pgMaterialRating.ts:40`; discovery reports **143 actual vs 139 expected**, exactly four inherited patient roots.
- `node --test deploy/postgres/privileges/function-census.test.mjs`: stale fixed census **323 actual vs 317 expected** (four inherited patient roots plus the two clinic/platform catalog roots); relation/function declaration gates themselves pass.
- `node --test deploy/postgres/privileges/port-context-catalog.test.mjs`: stale fixed descriptor count **164 actual vs 158 expected** for the same six roots; target-role and generated catalog subtests otherwise pass.
- `node --test deploy/postgres/privileges/migrate-local-parse.test.mjs`: 3/4 pass; inherited test still opens deleted historical `0449_patient_acquiring_webhook_bootstrap_resolver_local.sql` and fails with `ENOENT`. Migration 0016 itself passes the same parser in the custom assertion above.

## Named DEV verification still required

After this commit is independently audited and merged, named DEV needs a clean restart and one live owner traversal. This worker deliberately did not perform it:

1. Start owner: create first branch, read it back, then prove a second branch returns the precise quota response; Developer remains unlimited.
2. Save/read back the unlink-past boolean.
3. From an empty organization policy state, create both policies and exercise real cancel/reschedule decisions.
4. Create a `text` booking form field and observe it in the booking form.
5. Save both per-org support defaults together; confirm no clinic request includes SMS fallback.
6. Toggle doctor screens off/on; inspect navigation and confirm no `/summary` or `/unread-count` 403 polling while off.
7. Change to a unique slug and read back the fresh public state; verify conflict text with an occupied slug.
8. Change tariff/create a renewal checkout and global-admin manual invoice; confirm a URL and no duplicate draft on retry.
9. Create a calendar appointment using visible specialist/branch/service selectors and confirm the same IDs in calendar/upcoming readback.
