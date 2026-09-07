# Audit — login surface split (`a3183f03e`)

## Classification before test reading

| Acceptance area | Evidence |
| --- | --- |
| Route isolation, canonical cross-origin navigation, selected auth policy, post-auth guards | Repeatable behavior: route/behavior tests and fault injection where a stable public seam exists. |
| Information hierarchy, clarity, absence of role-selection clutter, branding, desktop and narrow responsive presentation | Live view only; no copy/DOM/count/layout tests. |

## Blind fault list (before test reading)

1. A second auth engine or Host resolver is added, or Host resolution is used to grant authorization.
2. Staff or platform-admin presentation exposes a role chooser; platform-admin exposes a patient/staff escape link.
3. A staff-to-patient or patient-to-staff link preserves the current origin, or forwards an untrusted `next` across products.
4. A patient path can be served on a staff Host, a staff path can be served on a patient Host, or an unknown Host no longer returns 404.
5. A post-auth role/membership guard is bypassed or a surface's resolved auth policy is not enforced.

## Candidate inspection

`a3183f03e` keeps the existing `AuthBootstrap`/`AuthFlowV2` engine and the existing
`resolveRequestSurface` Host resolver. The resolver selects a surface and auth policy; proxy still
applies the independent role/membership post-auth gates. The login-door route constraint accepts
only staff → doctor, platform-admin → admin, and patient → patient. `AppEntryRsc` constructs the
two permitted escape links from typed `PATIENT_DEFAULT_SURFACE.origin` / `STAFF_SURFACE.origin` and
passes no `next` value; admin receives `null`.

## Behavior evidence

- `pnpm --dir apps/webapp exec vitest run --project route src/proxy.route.test.ts` → 97/97 pass.
  The stale platform-admin expectation was changed from `/app/doctor/login` to `/app/admin/login`;
  compact cases now prove that doctor and patient login doors are 404 on the platform-admin Host.
- `pnpm --dir apps/webapp exec vitest run --project unit src/config/surfaceRoutes.unit.test.ts src/app/app/AppEntryRsc.unit.test.ts src/modules/auth/redirectPolicy.unit.test.ts` → 20/20 pass.
  The added RSC acceptance proves both canonical origins, no forwarded hostile `next`, the absent
  admin alternate link, and the resolved auth policy passed to the shared engine.
- `pnpm --dir apps/webapp exec vitest run --project ui src/shared/ui/patient/auth/AuthFlowV2.oauthProviders.ui.test.tsx` → 3/3 pass.
  Replaced two implementation-ID assertions with the observable password method; no harmful
  source, call-shape, count, or layout test remains in this scoped cleanup.
- Scoped ESLint and `git diff --check` passed. `pnpm --dir apps/webapp typecheck` failed outside
  these test changes because the workspace cannot resolve `@bersoncare/platform-merge` and
  `@bersoncare/shared-contracts`; the same failure also reports existing implicit-`any` errors.

## Fault injection

| Deliberate fault | Failing oracle |
| --- | --- |
| Allow doctor login on platform-admin Host | `proxy.route.test.ts` expected 404, received 200. |
| Build staff → patient escape link on staff origin | `AppEntryRsc.unit.test.ts` expected Therapygo origin, received Therapysto origin. |
| Accept external `next` from admin login | `redirectPolicy.unit.test.ts` expected `/app/admin/system-health`, received attacker URL. |
| Enable patient passkey in the default surface policy | `proxy.route.test.ts` policy snapshot detected the extra enabled method. |

All temporary product mutations were reverted before the final green suites.

## Live gate

An isolated candidate was started on free `127.0.0.1:5211` with only process-local safe DEV overrides:
`APP_BASE_URL=http://staff.localhost:5211` and
`PATIENT_APP_ORIGIN=http://patient.localhost:5211`. It reached Next readiness, but the first staff
login compilation failed before a page could render: `Module not found: @bersoncare/platform-merge`.
Therefore staff, platform-admin, and patient desktop/narrow views were not performed. The exact
candidate process group was terminated; `ss -ltn '( sport = :5211 )'` confirmed listener cleanup.

## Queue verdict

**FAIL — HOLD, NOT FOR LAND.** `a3183f03e` is behaviorally covered by the named tests, but the required live
acceptance and webapp typecheck are blocked by unresolved workspace packages. Restore the workspace package
resolution, then repeat one isolated six-view staff/admin/patient desktop+narrow pass; `TPB-20`–`TPB-22` remain
outside this earlier substage's acceptance.
