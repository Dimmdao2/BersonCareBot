# Final confirmation audit report — #915 Android native capability correction

**Candidate under confirmation:** `bfe25db0b` "fix(mobile): close native capability correction #915", on top of the
rejected `657a8b7d7`/`fafa7dcf0`, both already merged into `HEAD` = `977d911a1` (branch
`wt/mobile-native-capabilities-audit-20260909`). **Role:** `auditor-live`, independent second (confirmation) pass
over `apps/mobile-shell/**`. **Authority:** `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M4/M5/M6/M7;
original candidate `fafa7dcf0`; audit binding `9ede81483`; independent audit/tests `657a8b7d7`; correction
authority `04a478d90`; product correction `bfe25db0b`. Blind kill-set:
`.lead/runs/mobile-native-capabilities-confirmation-audit-20260909/00-blind-killset.md`, written before reading
`bfe25db0b`'s diff or any test file in detail.

## Overall verdict

**PASS on the four original MUST FIX closures and the cold-process/terminal-event/hangup/retry contracts.**
**One new MEDIUM finding** in the upload contract (empty, non-null ETag on a 2xx response is misreported as
`uploaded`) — found by inspection during this confirmation pass, not present in the four items `bfe25db0b` was
scoped to fix, and not fixed here (this run does not modify product code). No retained oracle was weakened.

## A. The four original MUST FIX findings — confirmed closed

| # | Finding (`657a8b7d7`) | Current state (`bfe25db0b`) | Regression check |
|---|---|---|---|
| 1 | `validSurface` accepted the sibling compiled brand | `UniversalPushPlugin.java:141-143`: `BuildConfig.SHELL_BRAND.equals(surface)` — compares against *this process's own* compiled identity, not a static two-literal set | `acceptsOwnCompiledBrandAsSurface`/`rejectsUnknownSurface` still green; fault injection (restored the old two-literal check) reddened `rejectsTheSiblingBrandAsSurface` |
| 2 | `validRoute` admitted `..` traversal inside the allowed prefix | `UniversalPushPlugin.java:156-163`: splits on `/` and rejects any literal `.`/`..` segment, then requires an exact-prefix or `prefix + "/"` boundary match (closing the `/app/patientized`-style prefix-sharing gap too) | All 7 previously-green route tests still green; fault injection (reverted to plain `startsWith`) reddened `rejectsPathTraversalOutOfTheAllowedPrefix` |
| 3 | `DeviceMediaPlugin.prepare()` never re-validated a picked document's actual MIME | `DeviceMediaPlugin.java:246-251`: `allowedDocument = "document".equals(requestedKind) && isAllowedDocumentMime(mime)`, sharing the same narrow allowlist the request side already enforces | `documentMimeTypes*` tests still green; fault injection (dropped the `isAllowedDocumentMime` call) reddened `prepareRejectsADocumentMimeOutsideTheNarrowAllowlistEvenWhenTheProviderReportsOne` |
| 4 | `CameraCaptureActivity.complete()` used `setData`+`setType`, discarding the Uri | `CameraCaptureActivity.java:192`: `data.setDataAndType(uri, mime)` | See §E below — the retained oracle only proves the *platform contract*, not the fixed call site itself; fault injection into `complete()` was **not** caught by the existing two tests (a real, pre-existing coverage gap, not a regression introduced by this pass) |

All four fault injections were applied one at a time directly to `apps/mobile-shell/android/app/src/main` (not to a
copy), confirmed red against the exact named test, then reverted; `git diff --stat -- apps/mobile-shell` was empty
after each revert and once more at the end of this run.

## B. Cold-process RuStore Push (new surface: `ShellApplication`, `PushRuntime`, `NoopPushLogger`)

Verified by **inspection**, per the proportionality note in §F below (no behavioral test was added for this
surface; see the reasoning there before treating this as untested-and-accepted).

- **One shared runtime, one init.** `ShellApplication.onCreate()` → `PushRuntime.instance().bootstrap(this)`;
  `UniversalPushPlugin.configure()` → `PushRuntime.instance().configure(...)`. Both funnel into
  `initializeLocked()`, which unconditionally checks `if (initializedProjectId != null) return;` before doing the
  one `RuStoreUniversalPushClient.INSTANCE.init(...)` call, one `installListeners()` call and one
  `createChannels()` call — cold (`bootstrap`) and warm (`configure`) paths cannot double-initialize, and both
  paths are `synchronized` on the same singleton instance, so they cannot race each other either.
- **Non-secret project id, before any WebView call.** `bootstrap()` reads `persistedProjectId(context)` from a
  private `SharedPreferences` file and only proceeds if non-null; the persisted value is exactly the project id the
  first trusted `configure()` call validated (`[A-Za-z0-9._-]{1,128}`), never a token or credential. A fresh install
  that never called `configure()` finds no persisted id and returns from `bootstrap()` without touching the SDK —
  confirmed safe by reading the guard, not by a live test (see §F).
- **Token/message callbacks installed once, cold or warm.** `installListeners()` runs exactly once, inside the same
  `initializeLocked()` guarded block, registering `setOnNewTokenListener`/`setOnDeletedMessagesListener`/
  `setOnPushClientErrorListener`/`setOnMessageReceiveListener` — there is no second listener-registration path
  anywhere in the plugin.
- **Validation reuses the corrected validators, not a copy.** `PushRuntime.handleMessage()` calls
  `UniversalPushPlugin.validSurface(surface)`, `.validKind(kind)` and `.validRoute(surface, route)` — the exact
  package-private static methods audited in §A — before `showNotification(...)` runs. No second/looser copy of
  either validator exists in `PushRuntime`.
- **Notification title from the compiled label.** `showNotification()`:
  `.setContentTitle(context.getString(R.string.app_name))` — reads the current flavor's own string resource, not a
  literal.
- **No secret/token/payload logging.** `grep -rn "Log\.\|System\.out\|System\.err\|printStackTrace"` over
  `PushRuntime.java`, `ShellApplication.java`, `NoopPushLogger.java` and the three touched plugin/activity files —
  no hits. `NoopPushLogger` is passed to `RuStorePushProvider`'s constructor in place of the SDK's own
  `DefaultLogger` (which the class comment documents as writing every message straight to `Log`), and all seven of
  its methods are no-ops.
- **`revoke()` keeps the persisted project id.** Only `deleteTokens(tokens)` is called; `persistProjectId` is never
  cleared, matching the commit message's "logout deletes provider tokens only" claim, verified by reading —
  `persistProjectId`/`persistedProjectId` are the only two call sites that touch the `project_id` preference key,
  and neither is reachable from `revoke()`.

## C. Jitsi single-terminal-event / idempotent hangup / retry permission recheck — confirmed with new tests

Six new behavioral tests added to `NativeJitsiPluginTest.java` (none existed before this pass — the retained
suite only covered origin-gate and session-validator behavior, per its own doc comment):

| Test | Proves |
|---|---|
| `bothTerminationBroadcastsForOneConferenceEmitExactlyOneTerminalEvent` | `CONFERENCE_TERMINATED` + `READY_TO_CLOSE` for one launch → exactly one `resolve()` on the registered `conference` listener |
| `duplicateConferenceTerminatedEmitsExactlyOneTerminalEvent` | A redelivered `CONFERENCE_TERMINATED` does not re-fire |
| `errorTerminalEventIsNotFollowedByASecondTerminatedEvent` | error takes priority; a duplicate close signal after it is a no-op, not a second event |
| `conferenceJoinedStillEmitsNormally` | the terminal-only dedup guard does not suppress `joined` |
| `hangupIsANoopWithoutAnActiveConference` | `hangup()` does not broadcast (verified against a real `LocalBroadcastManager` receiver registered on the SDK's own hang-up action, idled via `ShadowLooper`) when this plugin owns no active conference, and still resolves the call |
| `hangupBroadcastsExactlyOnceWhileAConferenceIsActive` | regression guard: a real active conference still gets exactly one real hang-up broadcast |

Fault injections against the untouched candidate: (a) removing the `terminalEmitted` early-return reddened all
three terminal-dedup tests with `TooManyActualInvocations`; (b) removing the `conferenceActive` guard in `hangup()`
reddened `hangupIsANoopWithoutAnActiveConference`. Both fully reverted; `git diff --stat` empty afterward.

`retry()`'s permission recheck (brief item 3, "rechecks both camera and microphone permission before relaunch") is
confirmed by **inspection, not a new test**: `retry()` and `onRetryPermissions()` each call `getPermissionState(...)`
fresh — there is no field anywhere in `NativeJitsiPlugin` that caches a permission decision from the original
`start()` call for later reuse by `retry()`. Building a granted-permission simulation would need a real
`Activity`+`ActivityCompat` permission-grant harness; the prior `mobile-native-capabilities-audit-20260909` pass
already declined this exact machinery for the same class's permission gate (kill-set #3, "disproportionate
machinery for a 3-line, easily-read gate") — this pass applies the same standard rather than re-litigating it.
`retryRejectsWithoutAnyPriorTerminalSession` (pre-existing, unmodified) still passes, confirming the prerequisite
gate is intact.

## D. Upload 2xx+ETag / redirect / non-2xx / concurrency

**Concurrency guard — confirmed with a new test.** `uploadRejectsASecondCallWhileOneIsAlreadyInProgress`
(`DeviceMediaPluginTest.java`) sets the private `uploading` `AtomicBoolean` to simulate an in-flight upload, then
calls the public `upload()` and asserts `call.reject("An upload is already in progress")`. Fault injection
(replacing `uploading.compareAndSet(false, true)` with an unconditional `uploading.set(true)`) reddened this test
with `WantedButNotInvoked`; reverted, `git diff --stat` empty.

**2xx+ETag/redirect/non-2xx classification — confirmed by inspection, not a live test.** See §F for why: this
sandbox's JVM cannot complete a real local TLS handshake (two independent, unrelated provider bugs), and building
a fake `HttpsURLConnection`/custom `URLStreamHandlerFactory` double was judged disproportionate and unsafely
global for the value it would add over careful reading of six linear lines
(`DeviceMediaPlugin.java:210-222`):

```java
int status = connection.getResponseCode();
String etag = connection.getHeaderField("ETag");
if (status < 200 || status >= 300 || etag == null || etag.length() > 256) {
    call.resolve(uploadFailed(status));
} else {
    JSObject result = outcome("uploaded");
    result.put("status", status);
    result.put("etag", etag);
    call.resolve(result);
}
```

- 4xx/5xx: `status >= 300` (or `< 200`) → `upload_failed(status)`. **Confirmed by inspection.**
- Redirect (3xx): `connection.setInstanceFollowRedirects(false)` (line 195) means `getResponseCode()` returns the
  3xx itself, not a followed hop's status — falls into the same `status >= 300` branch → `upload_failed`. No
  redirect is ever silently followed. **Confirmed by inspection.**
- Missing (`null`) ETag on a 2xx: `etag == null` → `upload_failed`. **Confirmed by inspection.**
- **MEDIUM finding, new in this pass:** an **empty but non-null** ETag (`""`) on a 2xx response is **not** caught
  by this condition — `etag == null` is `false` and `etag.length() > 256` is `false` for an empty string, so
  execution falls into the `else` branch and resolves `{outcome:'uploaded', status, etag:''}`. The brief's mandate
  is explicit: "reports `uploaded` only for HTTP 2xx plus a **non-empty** multipart ETag". An empty ETag header
  value is a valid (if unusual) HTTP response shape — a misconfigured proxy/CDN in front of the presigned storage
  URL, or a storage backend edge case, could return `ETag: ` with an empty value on a 2xx `PUT`; the caller would
  then believe the part uploaded successfully and hold an ETag string that cannot complete a later multipart
  finalize call. **Fix direction (not applied — this run does not modify product code):** change the guard to
  `etag == null || etag.isEmpty() || etag.length() > 256`.
  - This was not one of the four `657a8b7d7` MUST FIX findings and is not claimed as a regression introduced by
    `bfe25db0b` (the whole ETag/status block is new code added by this correction, not a modification of prior
    logic) — it is a residual gap in the property this confirmation run was specifically asked to prove (brief
    item 4). Reported here rather than fixed, per this run's scope.

Cancellation/cleanup (`cancelUpload()` disconnects `activeUpload`; `streamRange()`'s `finally` unconditionally
disconnects, nulls `activeUpload` and resets `uploading`) is confirmed by inspection — a `finally` block cannot be
skipped short of a JVM crash, the same class of platform-contract evidence the original audit relied on for
MUST FIX-4.

## E. A real, pre-existing test-coverage gap found while confirming MUST FIX-4

While verifying MUST FIX-4's regression protection, this pass attempted to inject the original defect
(`data.setData(uri); data.setType(mime);` in place of `setDataAndType`) directly into `CameraCaptureActivity.java`
and run `CameraCaptureActivityTest`. **The existing two tests stayed green** — they only demonstrate the general
`Intent#setData`/`#setType` platform contract in isolation; neither one calls `CameraCaptureActivity.complete()`
itself. This means a future regression of MUST FIX-4 would **not** be caught by the retained oracle, only by a
human re-reading the two files together (as both audits have now done).

This pass attempted to close that gap directly: `complete(File, String)` calls no CameraX API (confirmed by the
existing test class's own doc comment), so a `Robolectric.buildActivity(CameraCaptureActivity.class).get()`
instance (attached, but `onCreate()` never invoked — so `ProcessCameraProvider.getInstance()` is never reached)
should be able to invoke `complete()` via reflection and inspect the real result `Intent`. This failed with
`IllegalArgumentException: Couldn't find meta-data for provider with authority
org.robolectric.default.fileprovider` — `FileProvider.getUriForFile()` resolves the provider's `<meta-data>`
declaration through the app's merged manifest/resources, and this module's `build.gradle` sets
`testOptions.unitTests.includeAndroidResources = false`, so `Context.getPackageName()`/provider metadata under
Robolectric never see this app's real merged manifest. Closing this gap would require a `build.gradle` test-options
change, outside this run's writable scope (`apps/mobile-shell/android/app/src/test/**` only) and outside this
audit's own mandate. **This is reported as a residual gap, not fixed**, and the attempted test was reverted
(`git diff --stat` on the test file is empty after the attempt, confirmed above).

## F. Proof-cost accounting (`AGENTS.md` §10a)

Two classes of behavior in this confirmation surface were judged inspection-only rather than test-covered, each
after a concrete, documented attempt — not a default:

1. **Cold-process bootstrap (§B).** `PushRuntime` is a hard singleton (`private static final PushRuntime
   INSTANCE`) wrapping a real third-party SDK client (`RuStoreUniversalPushClient.INSTANCE`, itself also a
   singleton). Any test that reaches `initializeLocked()` calls the real SDK's `init()`. A behavioral test would
   need either a full SDK test double (this project pins no such artifact) or mutable global JVM state
   (`Security.removeProvider`/reflection into the singleton) that would leak across the rest of the test run. The
   one branch that's genuinely free of the SDK — `bootstrap()`'s "no persisted id → no-op" early return — was
   still not tested because the singleton's state persists across test methods/classes sharing a JVM, making a
   reliable "definitely fresh" assertion unsafe without a JVM-wide reset mechanism this project doesn't have.
2. **Upload 2xx/ETag/redirect classification (§D).** A concrete attempt was made to stand up a real local HTTPS
   server (first via `com.sun.net.httpserver`, unavailable under this module's `--release` javac compile; then via
   a hand-rolled `SSLServerSocket`, which hit two independent environment-specific TLS failures — Robolectric's
   Conscrypt provider throws `InaccessibleObjectException` reflecting into `java.net.InetAddress` internals closed
   by the JPMS module system on this plain JVM, and forcing `SunJSSE` explicitly instead routes
   `sun.security.ssl.NamedGroup`'s static EC-group initializer back into the same broken Conscrypt EC engine via
   provider-priority lookup). Working around either would mean mutating `java.security.Security`'s provider list
   or installing a JVM-wide `URLStreamHandlerFactory` for the rest of this test run — global, one-shot,
   hard-to-safely-restore state, for three lines of linear boolean logic that read unambiguously. This matches the
   same proportionality call the shell-foundation and native-capabilities audits already made for CameraX/Jitsi
   permission-grant simulation (kill-set item 3, `NativeJitsiPluginTest`'s own doc comment) — applying it here
   rather than re-deriving it live, but the attempt itself (not just an assumption) is what grounds the finding in
   §D rather than a blind skip.

Both attempts and their exact failure signatures are preserved in this section so a future pass doesn't have to
re-discover them from scratch.

## Kill-set scoreboard

Full text: `.lead/runs/mobile-native-capabilities-confirmation-audit-20260909/00-blind-killset.md`.

| Item(s) | Result |
|---|---|
| A.1–A.4 (four original MUST FIX closures) | **PASS** (A.1–A.3 test-proven + fault-injected; A.4 code-confirmed, oracle gap documented in §E) |
| B.5–B.11 (cold-process push) | **PASS by inspection** (§B, §F) |
| C.12–C.16 (Jitsi terminal dedup / hangup / retry) | **PASS**, C.12–C.14 test-proven + fault-injected, C.15–C.16 by inspection (§C, §F) |
| D.17–D.21 (upload 2xx/ETag/redirect/concurrency) | D.20 test-proven + fault-injected; D.17 (empty-ETag) **MEDIUM finding** (§D); D.18/D.19/D.21 PASS by inspection |
| E.22 (retained-oracle non-weakening) | **PASS** — `git diff` of test files between `657a8b7d7` and this run's HEAD shows only additions to `DeviceMediaPluginTest.java`/`NativeJitsiPluginTest.java`; no existing assertion was loosened, deleted or altered |
| F.23–F.25 (manifest/artifact/secret hygiene, build matrix) | **PASS** (below) |

## Build/artifact evidence

All commands from repo root, `source /home/dev/.local/share/bcb-android/env.sh` first in every shell.

- `pnpm --dir apps/mobile-shell run typecheck` — clean, exit 0.
- `pnpm --dir apps/mobile-shell run lint` (`eslint . --max-warnings=0`) — clean, exit 0.
- `pnpm --dir apps/mobile-shell run sync` — clean.
- `bash apps/mobile-shell/scripts/gradle.sh testTherapygoEnvironmentTestDebugUnitTest
  testTherapygoProductionDebugUnitTest testTherapystoEnvironmentTestDebugUnitTest
  testTherapystoProductionDebugUnitTest` — **83 tests × 4 variants, 0 failures** (was 76×4 with 3 failures each on
  the untouched `657a8b7d7` candidate per the prior audit; +7 tests added this pass, all green on all 4 variants).
- `pnpm --dir apps/mobile-shell run assemble:debug` — `BUILD SUCCESSFUL`, all 4 debug variants.
- `pnpm --dir apps/mobile-shell run assemble:release` — `BUILD SUCCESSFUL`, all 4 unsigned release APKs
  (R8/minify enabled); sizes 120,668,466–120,688,946 bytes, matching the prior audit's re-measured range.
- `pnpm --dir apps/mobile-shell run bundle:release` — `BUILD SUCCESSFUL`, all 4 unsigned AABs; sizes
  58,381,695–58,402,357 bytes.
- `bash apps/mobile-shell/scripts/gradle.sh --continue lintTherapygoEnvironmentTestDebug
  lintTherapygoProductionDebug lintTherapystoEnvironmentTestDebug lintTherapystoProductionDebug` —
  `BUILD SUCCESSFUL`, 0 lint errors on all 4 variants.
- `aapt dump badging` on all 4 release APKs: `applicationId`/label pairs match the flavor matrix exactly
  (`ru.therapygo.app.test`/`ru.therapygo.app`/`ru.therapysto.app.test`/`ru.therapysto.app`,
  labels `Therapy Go`/`Therapysto`); none show `application-debuggable`.
- `aapt dump xmltree AndroidManifest.xml` on the therapygo-production release APK: `usesCleartextTraffic=false`,
  `networkSecurityConfig` present; `<application android:name>` = `ru.therapygo.app.ShellApplication`;
  `CameraCaptureActivity`/`FileProvider` `exported=false`; the only `exported=true` components are the launcher
  `MainActivity` and third-party-SDK-declared components (Jitsi `ConnectionService`, RuStore push
  service/receiver, Google Sign-In revocation service, VK device-id provider, WorkManager/profileinstaller
  receivers/services) — none introduced by this candidate's own manifest edits, matching the prior audit's
  finding on the same transitively-merged set.
- `apksigner verify --print-certs` on the therapygo-production release APK: `DOES NOT VERIFY` / `Missing
  META-INF/MANIFEST.MF` — genuinely unsigned.
- Secret/log scan: `grep -rniE 'BEGIN (RSA|EC|PRIVATE) KEY|keystore|password\s*=|api[_-]?key\s*='` over
  `apps/mobile-shell/android/app/src/main` and `.../src/test` — no hits; no `.keystore`/`.jks`/
  `google-services.json`/service-account JSON anywhere under `apps/mobile-shell`; `grep` for
  `Log\.`/`System.out`/`System.err`/`printStackTrace` across the 7 touched/new plugin/activity/runtime source
  files — no hits.
- `git status --porcelain apps/mobile-shell` / `git diff --stat` — clean except this audit's own additions to
  `DeviceMediaPluginTest.java` and `NativeJitsiPluginTest.java`; no production file was left modified after any
  fault injection.

## External/host blockers (§6a, not source/build/test findings)

`M2-00a`/`M7-04` (Android emulator + `kvm` group membership) remain externally blocked, unchanged from both prior
audits: `id` still shows user `dev` without group `kvm`. `M7-05` (real Universal Push delivery on TEST) requires
the external RuStore infrastructure gate. Neither is exercised by this confirmation pass; neither is downgraded to
a repository defect.

## Scope notes

- Product code was not modified by this audit. All fault injections (four regressions of the original MUST FIX
  fixes, one terminal-dedup removal, one hangup-guard removal, one concurrency-guard removal — 7 total) were
  reverted before this report was written; `git diff --stat -- apps/mobile-shell/android/app/src/main` is empty.
- Writable scope used: `apps/mobile-shell/android/app/src/test/java/ru/therapygo/app/DeviceMediaPluginTest.java`
  and `NativeJitsiPluginTest.java` (new tests only, no existing test weakened or removed), plus this run's own
  `.lead/runs/mobile-native-capabilities-confirmation-audit-20260909/**` artifacts.
- Full repo-wide `pnpm run ci` was not run: this is a per-workstream confirmation, not the M7-06 final-integration
  checkpoint; this candidate touches no root-level TypeScript outside `apps/mobile-shell`.
- No RuStore credentials, live device, or PROD access were used or required.
