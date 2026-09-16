# Final audit — TherapyGo one-word correction

## Verdict

**PASS** for committed candidate `bc221c4a2` (`fix(mobile): spell TherapyGo as one word #915`).

The owner oracle is `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`: 2026-09-09 clarification — one word, capital `G`.

## Scope and retained test changes

Only the stale public PWA expectations were corrected:

- `apps/webapp/src/shared/lib/pwa/staffPwaManifest.unit.test.ts`: default identity and installed-manifest name/short name now expect `TherapyGo`.
- `apps/webapp/src/app/manifest.webmanifest/route.route.test.ts`: public patient manifest now expects `TherapyGo`.

No product code was changed by this audit. The two persistent artifacts in this directory are the only audit artifacts added.

## Evidence

### PWA / surface behavior

```bash
pnpm --dir apps/webapp exec vitest run \
  src/shared/lib/pwa/staffPwaManifest.unit.test.ts \
  src/app/manifest.webmanifest/route.route.test.ts \
  src/config/envDatabaseRuntime.unit.test.ts
```

Result: **3 files / 32 tests passed**. The set proves the exact default PWA name and installed identity, deploy env override, branded clinic name/icon preservation, and platform-admin manifest exclusion.

```bash
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp exec eslint \
  src/config/productSurfaceNames.ts \
  src/shared/lib/pwa/staffPwaManifest.unit.test.ts \
  src/app/manifest.webmanifest/route.route.test.ts
```

Result: both passed (exit 0).

### Android artifacts

The final debug matrix ran through the required host lock:

```bash
bash /home/dev/brain/host-orch/run-tests.sh \
  "pnpm --dir apps/mobile-shell run assemble:debug"
```

Result: **BUILD SUCCESSFUL**, four variants, lock released `rc=0`.

```bash
/home/dev/.local/share/bcb-android/sdk/build-tools/36.0.0/aapt dump badging <apk>
```

| APK | applicationId | label |
| --- | --- | --- |
| `therapygoEnvironmentTest/debug/app-therapygo-environmentTest-debug.apk` | `ru.therapygo.app.test` | `TherapyGo` |
| `therapygoProduction/debug/app-therapygo-production-debug.apk` | `ru.therapygo.app` | `TherapyGo` |
| `therapystoEnvironmentTest/debug/app-therapysto-environmentTest-debug.apk` | `ru.therapysto.app.test` | `Therapysto` |
| `therapystoProduction/debug/app-therapysto-production-debug.apk` | `ru.therapysto.app` | `Therapysto` |

`aapt dump --values resources <apk>` also resolves both `string/app_name` and `string/title_activity_main` to `TherapyGo` for each TherapyGo APK and `Therapysto` for each Therapysto APK. `AndroidManifest.xml` binds the application and launcher activity to those two resources.

### Blind kill-set and injections

| Class | Deliberate fault | Caught by | Result |
| --- | --- | --- | --- |
| default name / patient manifest | `PATIENT_DEFAULT_SURFACE_NAME: TherapyGo → Therapy Go` | installed-manifest default-name assertion and public manifest handler assertion | killed; 2 tests red |
| clinic branded preservation | `patient_branded` icon branch returned the default TherapyGo icon set | branded manifest icon assertion | killed; 1 test red |
| platform-admin exclusion | platform-admin metadata returned staff PWA metadata | admin PWA-declaration exclusion assertion | killed; 1 test red |
| Android label artifact | TherapyGo flavor `app_name` and `title_activity_main: TherapyGo → Therapy Go` | two rebuilt APKs inspected with `aapt dump badging` | killed; both labels became `Therapy Go` |

Every mutation was restored with `apply_patch`; the two TherapyGo APKs were rebuilt afterwards, then the final four-variant matrix was run. **Kill tally: 4/4 independent classes caught; 0 uncaught.**

### One-time boundaries

```bash
git diff --check HEAD^ HEAD
git diff --name-only HEAD^ HEAD
git diff --unified=0 HEAD^ HEAD -- \
  apps/mobile-shell/android/app/build.gradle \
  apps/mobile-shell/android/app/src/main/AndroidManifest.xml \
  apps/mobile-shell/capacitor.config.ts \
  apps/webapp/src/config/productSurfaceNames.ts \
  apps/webapp/src/shared/lib/pwa/patientPwaManifest.ts \
  apps/webapp/src/shared/lib/surface/surfaceLayoutMetadata.ts \
  apps/webapp/src/app/api/patient/native-push/route.ts
```

`git diff --check` was clean. The candidate changes seven files only: two Android name resources, Capacitor `appName`, the shared patient display literal, and documentation/comments. The exact diff shows no change to application/package IDs, flavor names, routes, hosts, PWA installation `id`/`scope`/`start_url`, push surface value, asset filenames, or deep-link ownership. No completed run/audit history was rewritten.

`rg -n -F "Therapy Go" apps/webapp apps/mobile-shell --glob '!android/app/build/**' --glob '!node_modules/**'` returned only the existing `videoMeetingInvitationNativePush.contract.test.ts` comment/test title. It names the unchanged technical `therapygo` push surface; it neither emits an application name nor changes push behavior, so it is intentionally outside this correction's public-name test scope.

## External blockers

None for this scoped source/PWA/unsigned-debug-APK audit. No signing, publishing, device, network, TEST, or PROD action was performed.
