# Android Capacitor shell

`apps/mobile-shell` is one remote-origin Capacitor 8 Android shell for four product variants. It contains no copied Next.js pages, auth/session code, or clinical business logic.

The native Jitsi SDK 13.1.1 requires Android API 26, so the shell's minimum Android version is 8.0. The Gradle configuration does not override that SDK requirement.

## Native capability boundary

All native calls are unavailable unless the active main-frame URL has the exact HTTPS platform origin of the compiled flavor. `TrustedOriginGate` is the single authorization boundary used by every plugin; a plugin never accepts a runtime brand, surface or origin from JavaScript. URLs, JWTs, selected content URIs, filenames, tokens, push payloads and presigned URLs are not logged.

`ShellRuntime.getRuntimeInfo()` reports the three compiled capabilities as `true`. The later web `NativeRuntime` adapter consumes the following stable JSON shapes; the shell does not implement a second meeting, media upload authorization or notification delivery product.

| Plugin | Methods | Events / result shape |
| --- | --- | --- |
| `NativeJitsi` | `start({endpoint, roomReference, accessToken})`, `hangup()`, `retry()` | `conference`: `{state: 'joined'|'terminated'|'error', code?}`. The endpoint is an exact build-time match, the room is opaque and token never enters logs. |
| `DeviceMedia` | `captureMedia({kind})`, `pickMedia({requiresDuration?})`, `pickDocument({mimeTypes})`, `upload({handle, offset, length, presignedUrl, headers})`, `cancelUpload()`, `release({handle})` | Selection returns `{outcome:'selected', handle, mimeType, displayName, sizeBytes, durationSeconds?, source, kind}`; cancellation is `{outcome:'cancelled', reason}`. The URI and bytes stay native. |
| `UniversalPush` | `configure({projectId})`, `requestPermission()`, `getState()`, `revoke()` | `push`: non-secret state/permission/error/deleted-message events and a token only over the trusted bridge; a valid data message gives `{event:'message', surface, kind, route}`. |

Jitsi opens the full-screen SDK Activity only after an explicit call and camera/microphone permission. It allows exactly `https://meet.therapysto.ru` in production and `https://meet.test.therapysto.ru` in TEST. The welcome page, analytics, recording, livestreaming, invite/calendar and add-people features are disabled. Returning from the Activity leaves the existing WebView page in place. `CONFERENCE_TERMINATED` and `READY_TO_CLOSE` are two possible signals for one terminal conference: exactly one terminal event (`error` if the first carries one, otherwise `terminated`) is emitted per launch, `hangup()` is a no-op unless this plugin owns an active conference, and `retry()` rechecks camera/microphone permission (requesting it again if Android settings revoked it since the prior attempt) before relaunching the last terminal session.

CameraX binds Preview plus one capture use-case at a time: Photo is Preview + ImageCapture and Video is Preview + VideoCapture. The system gallery accepts image/video; documents use `ACTION_OPEN_DOCUMENT`, `CATEGORY_OPENABLE` and a closed MIME set — the same closed set is re-checked against the picked document's actual `ContentResolver` MIME, since Android never guarantees a `DocumentsProvider` honors the request filter. A captured photo/video's URI and MIME are returned together (`Intent#setDataAndType`); `setData`/`setType` as two separate calls would silently clear each other and turn every successful capture into a reported cancellation. Unknown/non-seekable sources are copied once to private cache before their measured descriptor is returned. Multipart upload reopens and seeks the opaque handle for each exact range, one upload at a time; it accepts only HTTPS, no redirects/userinfo/non-default port, and the compiled storage hosts: TEST MinIO `fs.bersonservices.ru`, production Selectel `s3.ru-7.storage.selcloud.ru` and Yandex `storage.yandexcloud.net`. A part resolves `{outcome:'uploaded', status, etag}` only for an HTTP 2xx response carrying the ETag a later complete/finalize call needs; a followed redirect, 4xx/5xx or a 2xx missing that ETag resolves a typed `{outcome:'upload_failed', status}` instead.

Universal Push contains only the direct RuStore provider, not FCM/HMS artifacts. The backend supplies the non-secret project id at authenticated runtime; auth tokens and send endpoints are never native configuration. The SDK initializes from a custom `Application.onCreate()` (declared in the manifest) on every process start, reading the project id persisted by the first trusted `configure` call, so a data-only message still renders a notification after the process is killed and restarted for delivery, with no `MainActivity`/WebView involved; a fresh install with no project id ever configured is a safe no-op. The SDK's own logger is replaced with a no-op implementation so no token/payload/project-id detail reaches logcat. Android 8+ channels are versioned `*_v1` for messages, reminders and calls. The deterministic original WAV tones are generated from [`scripts/generate-notification-tones.mjs`](scripts/generate-notification-tones.mjs); changing a default sound later requires a new channel id because Android channel sound is immutable after creation. System channel settings and Android 13+ notification permission win. Data-only messages must carry this process's own compiled brand as `surface` (never the sibling brand's), a bounded `kind` and a same-surface `/app/patient...`/`/app/doctor...` route with no `.`/`..` path segment before a local notification is shown; the notification title is the current flavor's app label (`Therapy Go` or `Therapysto`), never hardcoded. `revoke()` (logout) deletes only the provider token; the persisted project id survives for the next cold-process bootstrap.

## Pinned dependencies and licensing

The pins are intentional and repository-scoped:

- Capacitor `8.5.1` ([MIT](https://github.com/ionic-team/capacitor/blob/main/LICENSE));
- Jitsi Meet Android SDK `13.1.1`, from Jitsi's release Maven repository ([Apache-2.0](https://github.com/jitsi/jitsi-meet/blob/master/LICENSE)); it targets the product's self-hosted Jitsi, not JaaS;
- CameraX `1.6.2` family ([Apache-2.0](https://source.android.com/docs/setup/about/licenses));
- RuStore Universal Push and Universal RuStore `7.4.1`, from the official VKTeam Maven repository. RuStore SDK is governed by its provider agreement and is **not claimed to be open source**.

The version evidence was re-read with these primary-source commands on 2026-09-09:

```bash
curl -fsSL https://raw.githubusercontent.com/jitsi/jitsi-maven-repository/master/releases/org/jitsi/react/jitsi-meet-sdk/maven-metadata.xml | tail -n 30
curl -fsSL https://nexus-external.vkteam.ru/repository/maven/ru/rustore/sdk/universalpush/maven-metadata.xml | tail -n 35
curl -fsSL https://dl.google.com/android/maven2/androidx/camera/camera-core/maven-metadata.xml | tail -n 35
```

The Jitsi graph brings React/Hermes/WebRTC and other transitive Android libraries; do not force a separate OkHttp version. Inspect that resolved graph, manifest merger, R8 and native-library alignment in the release gate rather than guessing an override.

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

Measured from the final 2026-09-09 release matrix, the unsigned APKs are 120,668,446–120,688,926 bytes and the AABs are 58,381,695–58,402,357 bytes. Jitsi's React/Hermes/WebRTC graph is the dominant added artifact weight. Re-measure after any dependency update:

```bash
find android/app/build/outputs/apk -path '*release*.apk' -printf '%p %s bytes\n' | sort
find android/app/build/outputs/bundle -name '*.aab' -printf '%p %s bytes\n' | sort
```

To make a release artifact, obtain the RuStore keystore through the owner-controlled secret store, keep it outside this repository, and pass its path/passwords as Gradle properties or environment variables in the signing environment. Never add a private key, `local.properties`, service configuration, token, or SDK path to Git. The repository has no release credentials and cannot produce a store-signed artifact.

## Remote-content risk

Capacitor documents that `server.url` is intended for live reload and is not intended for production. The owner explicitly selected it here for existing same-origin Next.js cookies, CSRF, SSR/RSC, and browser cache semantics. Consequently, deployment of either privileged web origin is a native-app security boundary: an unreviewed or compromised web deployment can execute with this shell's bridge. This shell therefore pins each build to one exact HTTPS origin, rejects navigation to all other origins, and exposes only the documented compiled native capability plugins. It does not override Capacitor HTTP/cookies and it adds no offline clinical-data or video cache.
