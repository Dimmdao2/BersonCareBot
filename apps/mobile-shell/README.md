# Android Capacitor shell

`apps/mobile-shell` is one remote-origin Capacitor 8 Android shell for four product variants. It contains no copied Next.js pages, auth/session code, or clinical business logic.

## Toolchain and commands

The DEV-only, user-owned toolchain is outside Git. Source it in every terminal that runs Gradle:

```bash
source /home/dev/.local/share/bcb-android/env.sh
pnpm install --frozen-lockfile
pnpm --dir apps/mobile-shell run sync
pnpm --dir apps/mobile-shell run typecheck
pnpm --dir apps/mobile-shell run lint
pnpm --dir apps/mobile-shell run assemble:debug
pnpm --dir apps/mobile-shell run assemble:release
pnpm --dir apps/mobile-shell run bundle:release
```

`sync` deterministically derives launcher/adaptive and splash PNGs from the two checked-in source marks before invoking `cap sync android`:

```bash
pnpm --dir apps/mobile-shell run derive:icons
```

The marks are centred on a 1024px transparent square and constrained to a 66% safe zone. Therapy Go uses the supplied mark with the sphere; Therapysto uses the supplied mark without it.

## Flavor matrix

| Brand | Environment | Application ID | WebView remote URL |
| --- | --- | --- | --- |
| Therapy Go | test | `ru.therapygo.app.test` | `https://test.therapygo.ru/app/patient` |
| Therapy Go | production | `ru.therapygo.app` | `https://therapygo.ru/app/patient` |
| Therapysto | test | `ru.therapysto.app.test` | `https://test.therapysto.ru/app/doctor` |
| Therapysto | production | `ru.therapysto.app` | `https://therapysto.ru/app/doctor` |

The URL origin and start path are distinct deliberately: Capacitor receives the exact HTTPS origin as `server.url` and the path as `server.appStartPath`. Each variant allows only its one exact platform origin inside the privileged WebView. A redirect or link to a clinic/custom domain is external and has no bridge access.

Android Gradle reserves flavor names beginning with `test`, so the physical flavor is `environmentTest`; it is the documented logical `test` environment and the package exposes `*Test*` assemble/bundle task aliases. This does not add a fifth product variant.

## Artifacts

Debug APKs are debug-key signed by Gradle:

```text
android/app/build/outputs/apk/therapygoEnvironmentTest/debug/app-therapygo-environmentTest-debug.apk
android/app/build/outputs/apk/therapygoProduction/debug/app-therapygo-production-debug.apk
android/app/build/outputs/apk/therapystoEnvironmentTest/debug/app-therapysto-environmentTest-debug.apk
android/app/build/outputs/apk/therapystoProduction/debug/app-therapysto-production-debug.apk
```

Release APKs and AABs are intentionally unsigned until the owner-controlled signing gate:

```text
android/app/build/outputs/apk/therapygoEnvironmentTest/release/app-therapygo-environmentTest-release-unsigned.apk
android/app/build/outputs/apk/therapygoProduction/release/app-therapygo-production-release-unsigned.apk
android/app/build/outputs/apk/therapystoEnvironmentTest/release/app-therapysto-environmentTest-release-unsigned.apk
android/app/build/outputs/apk/therapystoProduction/release/app-therapysto-production-release-unsigned.apk
android/app/build/outputs/bundle/therapygoEnvironmentTestRelease/app-therapygo-environmentTest-release.aab
android/app/build/outputs/bundle/therapygoProductionRelease/app-therapygo-production-release.aab
android/app/build/outputs/bundle/therapystoEnvironmentTestRelease/app-therapysto-environmentTest-release.aab
android/app/build/outputs/bundle/therapystoProductionRelease/app-therapysto-production-release.aab
```

To make a release artifact, obtain the RuStore keystore through the owner-controlled secret store, keep it outside this repository, and pass its path/passwords as Gradle properties or environment variables in the signing environment. Never add a private key, `local.properties`, service configuration, token, or SDK path to Git. The repository has no release credentials and cannot produce a store-signed artifact.

## Remote-content risk

Capacitor documents that `server.url` is intended for live reload and is not intended for production. The owner explicitly selected it here for existing same-origin Next.js cookies, CSRF, SSR/RSC, and browser cache semantics. Consequently, deployment of either privileged web origin is a native-app security boundary: an unreviewed or compromised web deployment can execute with this shell's bridge. This shell therefore pins each build to one exact HTTPS origin, rejects navigation to all other origins, and exposes only a minimal runtime-info plugin with false capability placeholders. It does not override Capacitor HTTP/cookies and it adds no offline clinical-data or video cache.
