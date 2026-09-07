# #787 — audit the three surface-specific login experiences

You are the independent `auditor-live` for the committed worker delta in `/home/dev/dev-projects/bcb-wt-branding-login-split-20260907`. Product code is read-only. Audit the login-surface behavior and perform one live visual acceptance; do not redesign or perform serial style critique. Commit before ending; do not push, land, deploy, mutate DEV/TEST/PROD, or touch DNS/TLS/services.

## Test or view classification — first action

Before reading tests, read `AGENTS.md` §§10a, 10b, 11, 15, 16, 17, 21 and 24 completely. Classify route isolation, canonical cross-origin navigation, auth-policy selection and post-auth guards as repeatable behavior (`test`). Classify hierarchy, clarity, absence of role-selection clutter, branding and responsive appearance as live `view`; never encode those as text/DOM/count/layout tests. Record the classification first.

## Authority

Read `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` §§1.2c and `TPB-02`, `TPB-03`, `TPB-05`, `TPB-18`, `TPB-19`; `SURFACE_AND_DOMAIN_MAP_2026-08-22.md` §§1–4; and worker brief `runs/branding-login-surfaces-worker-brief-20260907.md`.

## Exact acceptance

1. Inspect the worker delta and current request-surface path. There remains one auth engine and one Host resolver. Host selects staff/platform-admin/patient presentation and auth policy; it does not grant authorization.
2. `therapysto.ru`: clear staff login for specialists, clinic owners/admins and employees, without a role chooser. `admin.therapysto.ru`: clearly platform-operator-only, without clinic-admin ambiguity or alternate-role controls. TherapyGo/default/slug/custom patient surfaces: patient-only login with resolved platform/clinic identity.
3. If staff↔patient escape links remain, they must change origin using existing typed/resolved surface data: staff → canonical patient origin, every patient/branded surface → canonical staff origin. No same-Host `/app/patient/*` from staff and no same-Host `/app/doctor/*` from patient. Admin has no alternate link. Preserve path/query only where explicitly safe; never forward untrusted cross-product `next`.
4. Direct wrong-surface paths are refused or canonically redirected as the authority requires; unknown Host remains 404. Signed-in users land only in their own guarded hub. Clinic admin remains staff, never platform admin.
5. Run the existing route/surface/auth-policy/post-auth behavior suites. Before reading touched tests, prepare the applicable fault list from the requirements above; reuse existing oracles. Add a compact behavior acceptance only for an uncovered stable routing/security contract. Do not write UI-copy/DOM/layout/count tests.
6. Inspect touched tests and delete harmful source/format/function-spelling/call-shape/UI-copy/layout/DOM/count/table-count oracles. A test that asserts exact headings or link count is harmful; live view accepts presentation.
7. Start the candidate only on a free port in `5211..5219` with safe DEV env and distinct local Host mapping. Perform one desktop and one narrow/mobile live view of all three login surfaces, including a branded patient case only if an existing named-DEV slug exists. Do not create tenant data. Capture concise evidence; do not turn the screenshot shape into a permanent test. Stop the exact process group and prove the listener is gone.

## Validation and deliverables

Run webapp typecheck, scoped ESLint, relevant targeted suites and `git diff --check`; no full CI. Product files remain untouched. Persistent changes may be only justified behavior tests, harmful-test deletion and an audit artifact under `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/`. Append one concise main audit-queue verdict row for each new candidate commit, stage explicit paths only, and commit. Report binary readiness, killed/uncaught count for any new test work, live views, cleanup and commit SHA.
