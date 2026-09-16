# Worker brief — #915 TherapyGo one-word product name correction

Apply the owner's naming correction as one coherent product pass: the patient product display name is `TherapyGo`,
one word with an uppercase `G`. Correct the Android/Capacitor label, default patient PWA identity and current product
documentation. Do not touch package/application IDs, routes, hosts, push `surface` identifiers, asset filenames,
clinic-specific branding, Therapysto identity, Jitsi/media/push behavior, schema/backend, tests, historical audit/run
artifacts or PROD. Do not write, edit, rename or delete tests; the independent auditor owns the behavioral oracle.

## Mandatory reading and authority

Run the `AGENTS.md` heading map before each action. Read the global decision method, §1/§1b, §5, §7, §9–§12,
§15–§17, §21 and §24 completely. Read `README.md`, `docs/README.md`, server/local-dev conventions,
`docs/ORCHESTRATION_BINDINGS.md`, the active mobile plan M1/M2/M7, `apps/mobile-shell/README.md`, brand README,
PWA name/manifest implementation and Android flavor/resource configuration before editing. Use code-search before
exact `rg`.

Источник оракула — `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`: «Владелец уточнил 2026-09-09: это
одно слово, `G` заглавная». The owner correction replaces the separated display spelling everywhere active; Git
history and completed audit artifacts preserve the old history and are not rewritten.

## Required product result

- Change the single default patient surface-name literal to `TherapyGo`. Existing parameterized metadata/manifest/
  install paths must consume it; do not add a second condition or duplicated manifest.
- Change Capacitor `appName` and Android patient/default resource labels to `TherapyGo` for both therapygo TEST and
  production variants. Therapysto labels stay exactly `Therapysto`.
- Update only current product READMEs in the allowed scope so they no longer instruct users/agents to display the
  separated spelling. Keep lowercase technical identity `therapygo` in app IDs, package IDs, route segments, hosts,
  push surfaces, directory names and asset filenames.
- Do not touch clinic-owned `patient_branded` names/icons. The correction changes only `patient_default`.
- Parameterize the existing name source; no new component, wrapper, manifest route, resource family or compatibility
  alias.

## Allowed scope

- `apps/webapp/src/config/productSurfaceNames.ts`
- `apps/mobile-shell/capacitor.config.ts`
- `apps/mobile-shell/android/app/src/main/res/values/strings.xml`
- `apps/mobile-shell/android/app/src/therapygo/res/values/strings.xml`
- `apps/mobile-shell/README.md`
- `apps/webapp/public/brand/README.md`

If exact discovery shows another active production display literal, stop and report it rather than expanding scope.

## Validation and delivery

No tests. Run webapp typecheck, mobile-shell build/typecheck, scoped ESLint where applicable, exact active-production
display-name census and `git diff --check`. Do not run full CI, Gradle/APK build, databases, shared dev services or
live calls; the auditor owns APK/PWA acceptance. Commit all and only allowed paths explicitly, never `git add -A`;
do not push. Commit message references `#915`, M1-01/M2-03 and the owner correction. Report SHA, exact changed
display surfaces, commands/results and any real blocker. Do not finish while a foreground check is running.
