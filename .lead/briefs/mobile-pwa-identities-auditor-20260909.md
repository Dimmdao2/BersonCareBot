# Тест или взгляд

Повторяемые manifest/metadata route, role gate и bootstrap side-effect contracts проверяй поведенческими тестами
через публичные builders/routes. PNG derivation, safe-zone, retained legacy assets, layout/source consolidation и
отсутствие дублирования проверяй одноразовым asset/diff inspection; тесты на текст/DOM/число файлов не пиши.

# Auditor-live brief — #915 PWA identities/install surfaces

Independently audit the exact committed M1-01…M1-06 candidate. Product code is read-only. You may add/commit only
stable behavioral acceptance tests and audit artifacts. Do not fix product code, change M1-07/native runtime, touch
push/video/media business paths, modify the plan, deploy, or replace/delete retained legacy clinic/admin assets.

## Mandatory reading and blind order

1. Run `grep -n "^## \|^### " AGENTS.md`; read the global decision method, §1/§1b, §5, §9–§12, §15–§17,
   §21 and §24 completely. Read §10a/§10b before opening any test. Read the active M1/M7 authority in
   `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`, patient/doctor
   style guides, surface/branding authority and exact base→candidate diff.
2. Before reading tests, persist the kill-set below in
   `.lead/runs/mobile-pwa-identities-audit-20260909/00-blind-killset.md`. Existing tests are implementation evidence,
   not the oracle.
3. Separate stable output/side-effect behavior from one-time PNG/layout/source consolidation inspection. Never add
   tests for source strings, filenames/counts, UI wording/DOM/layout or pixel dimensions.

## Blind behavioral kill-set

1. Default patient metadata/manifest says `Therapy Go`, still honors `PATIENT_APP_NAME`, and preserves stable
   `id=/app`, `scope=/app`, `start_url=/app/patient`.
2. Default patient and staff manifests/metadata emit distinct current-brand `any` + separate `maskable` + Apple
   icon paths; swapping/cross-wiring one brand is observable. Staff remains `Therapysto` with stable
   `id=/app-staff`, `scope=/app`, `start_url=/app/doctor`.
3. A branded patient surface keeps `effectivePatientBrand.patientAppName` and legacy blue clinic icon paths; a
   default Therapy Go change never rebrands a tenant/custom-domain surface.
4. `platform_admin` resolved metadata contains no manifest, apple-web-app or patient/staff PWA icons. Both public
   manifest handlers return 404 for admin while keeping their valid patient/staff behavior.
5. Platform-admin shell mounts neither staff install/service-worker bootstrap nor staff web-push bootstrap, so no
   registration/push/install listener side effect occurs.
6. `/app/doctor/install` redirects specialist to `/app/account?tab=install`; platform admin never reaches staff
   install UI. Account install is impossible for admin regardless of tab/query while specialist still sees it.
7. Patient install uses the established patient install primitive and retains its existing push opt-in behavior;
   browser/PWA service-worker behavior outside admin is unchanged. No native detector is invented in M1.

## Permanent tests and fault injection

Extend the current manifest/metadata output unit tests rather than create a parallel suite. Reuse the existing env
runtime test that proves `PATIENT_APP_NAME` reaches metadata/manifest. Add route tests only for actual handler 404/
success behavior; add one UI/side-effect test only if needed to prove admin causes no service-worker/push/bootstrap
registration. Prefer a public RSC/route seam for doctor-install role redirects. Do not freeze instruction copy,
component counts or DOM shape.

Temporarily inject/restore and record exact failed assertions for:

- regress `Therapy Go`/ignore the env override or change stable id/scope/start;
- cross-wire patient/staff icon paths or remove the distinct maskable entry;
- give branded patient Therapy Go name/icons;
- return staff metadata/manifest for platform admin;
- remove the admin shell bootstrap guard;
- invert specialist/admin doctor-install behavior;
- remove patient push opt-in while consolidating the install guide.

Every named behavior fault must be killed by a retained green test or represented by a failing acceptance test on
the untouched candidate. Restore all production mutations. UI copy/layout and “no second component/page” are
one-time inspections, not test inventions.

## One-time asset/source/live inspection

Run the single shared brand-asset generator twice and prove a byte-stable result. Use `identify`/pixel alpha-bounds
and visual inspection to verify new Therapy Go/Therapysto 192/512/maskable/Apple assets, transparent square canvas
and safe-zone. Confirm the old blue `/pwa-icon-*`/Apple and black `/staff-pwa-*` assets remain byte-present and are
not referenced by the wrong default surface. Verify one generator/safe-zone algorithm, honest renamed command,
no duplicate install component, no `/setup`, and no patient/staff icon cross-reference.

Run changed-app typecheck/lint/build, targeted retained tests, `git diff --check` and clean status. Perform a bounded
local rendered metadata/install check for patient default, patient branded, staff and platform admin if the current
auth/runtime can do so without fixtures or shared server disruption; otherwise record exact source/route evidence.
Full root CI belongs to final integration.

## Delivery

Commit only justified tests and
`.lead/runs/mobile-pwa-identities-audit-20260909/{00-blind-killset.md,90-final-audit-report.md}` with explicit paths,
never `git add -A`; do not push. Report binary PASS/MUST FIX, kill tally, fault→failed assertion, exact commands/SHA,
asset/live inspection and any factual blocker. Do not finish while a foreground build is running.
