# Final audit report — #915 Android native capability plugins (Jitsi/media/push)

**Candidate:** `fafa7dcf0` "feat(mobile): add native Jitsi media and push #915", on top of the accepted shell
foundation (`533bb29b1` + the `mobile-shell-foundation-audit-20260909` audit fix `a0dfd6576`, merged via
`d7f99340c`). **Role:** `auditor-live`, first independent audit of this surface (M4/M5/M6/M7, scoped to
`apps/mobile-shell/**`). **Authority:** `AGENTS.md` §10a/§10b/§24.4–§24.6, `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/
MASTER_PLAN.md` stages M4, M5, M6, M7. Blind kill-set:
`.lead/runs/mobile-native-capabilities-audit-20260909/00-blind-killset.md`.

## Overall verdict: **MUST FIX** (4 findings), everything else in scope **PASS**

Three findings are security-relevant (cross-brand push acceptance, path-traversal push route, spoofed document
MIME bypass); the fourth is a plain functional defect that breaks the entire camera-capture feature. None require
new architecture; each is a one-method, few-line fix.

## Findings

### MUST FIX-1 — `UniversalPushPlugin.validSurface` accepts the sibling compiled brand (M6-09, kill-set #10)

**File:** `apps/mobile-shell/android/app/src/main/java/ru/therapygo/app/UniversalPushPlugin.java:247-249`

```java
private static boolean validSurface(String surface) {
    return "therapygo".equals(surface) || "therapysto".equals(surface);
}
```

**Scenario:** the Therapy Go (patient) app build receives a data-only push message whose payload declares
`surface=therapysto` (the Therapysto/doctor brand). `validSurface` only checks membership in the two known brand
literals — it never compares against **this process's own** `BuildConfig.SHELL_BRAND` (already available and used
identically in `ShellRuntimePlugin`/`ShellVariant`). The message is accepted, shown as a local notification, and
on tap `deliverPendingTap()` routes the WebView to the sibling surface's route prefix (`/app/doctor/...`) inside
the Therapy Go app's own WebView (bound to `therapygo.ru`).

**Impact:** violates kill-set #10 ("Cross-surface... routes do not notify or navigate") and the whole shell's
brand-isolation architecture (`TrustedOriginGate`, `ShellVariant` — every other native surface refuses to act on
anything but its own compiled identity; this is the one place that doesn't).

**Proof:** `UniversalPushPluginTest.rejectsTheSiblingBrandAsSurface` fails on the untouched candidate
(`assertFalse` on `invokeValidSurface(otherBrand)` receives `true`). `acceptsOwnCompiledBrandAsSurface` and
`rejectsUnknownSurface` stay green, so the oracle isn't trivially always-red.

**Fix direction (not prescribed further — for the assigned §24.1 executor):**
`BuildConfig.SHELL_BRAND.equals(surface)`.

### MUST FIX-2 — `UniversalPushPlugin.validRoute` admits `..` traversal inside the allowed prefix (M6-09, kill-set #10)

**File:** `apps/mobile-shell/android/app/src/main/java/ru/therapygo/app/UniversalPushPlugin.java:255-258`

```java
private static boolean validRoute(String surface, String route) {
    if (route == null || route.length() > 256 || !route.matches("/[A-Za-z0-9/_?=&.-]*")) return false;
    return "therapygo".equals(surface) ? route.startsWith("/app/patient") : route.startsWith("/app/doctor");
}
```

**Scenario:** a route such as `/app/patient/../../app/doctor/secret` matches the character-class regex (`.` and
`/` are both allowed) and literally, textually, `startsWith("/app/patient")` — so it validates for the `therapygo`
surface. The check is purely textual, never path-normalized. If the JS side (or a WebView `history`/`location`
API) resolves this route as a URL path against the app's own origin, `..` segments normalize it outside the
`/app/patient` prefix the native validator believes it enforced.

**Impact:** this is verbatim the "traversal" fault named in kill-set #10 and the mandatory fault-injection list
("accept external/cross-surface push route"). Combined with MUST FIX-1 this is two independent ways the same
native tap-routing gate fails to enforce the one boundary it exists for.

**Proof:** `UniversalPushPluginTest.rejectsPathTraversalOutOfTheAllowedPrefix` fails on the untouched candidate.
`acceptsExactOwnPrefixRoute`, `rejectsForeignSurfacePrefixRoute`, `rejectsProtocolRelativeRoute`,
`rejectsAbsoluteUrlRoute`, `rejectsRouteWithoutLeadingSlash`, `rejectsOversizedRoute`, `rejectsNullRoute` all stay
green, so the surrounding protection is real and this is a narrow gap, not a broken gate.

**Fix direction:** reject any route containing a `..` path segment (e.g. split on `/` and check for a literal
`".."` component, or resolve via a same-origin-constrained `URI`/path normalizer before the `startsWith` check).

### MUST FIX-3 — `DeviceMediaPlugin.prepare()` doesn't re-validate a picked document's MIME (M5-03, kill-set #6)

**File:** `apps/mobile-shell/android/app/src/main/java/ru/therapygo/app/DeviceMediaPlugin.java:229-233`

```java
private MediaHandle prepare(Uri uri, String source, String requestedKind, boolean requiresDuration) throws IOException {
    String mime = getContext().getContentResolver().getType(uri);
    if (mime == null || !(mime.startsWith("image/") || mime.startsWith("video/") || "document".equals(requestedKind))) {
        throw new IOException("Unsupported selected type");
    }
```

**Scenario:** `documentMimeTypes()` correctly narrows the *request* sent to `ACTION_OPEN_DOCUMENT` to six literal
MIME types (PDF/Word/Excel/plain text). But Android does not guarantee the picked document's actual
`ContentResolver.getType(uri)` matches that request filter — any registered `DocumentsProvider` (a rogue file
manager app, or one that simply mislabels files) can hand back an arbitrary URI with an arbitrary reported MIME.
Because `requestedKind` is hardcoded to `"document"` for every document pick (`onDocumentPicked` →
`resolveHandle(call, uri, "document", "document", false)`), the disjunction is true for **any** non-null MIME —
including e.g. `application/vnd.android.package-archive` — and the file is packaged into a `{outcome:'selected', …}`
descriptor instead of being rejected.

**Impact:** violates kill-set #6 ("documents use OpenDocument with narrow MIME validation... spoofed
extension/MIME... fails safely") and M5-03's "narrow MIME filters" — the filter only narrows the *request*, not
the *result*, so it provides no actual enforcement against a provider that doesn't honor it.

**Proof:** `DeviceMediaPluginTest.prepareRejectsADocumentMimeOutsideTheNarrowAllowlistEvenWhenTheProviderReportsOne`
fails on the untouched candidate: a mocked `ContentResolver` reports
`application/vnd.android.package-archive` for the picked URI, and `prepare()` returns a handle instead of
throwing. `documentMimeTypesAcceptsTheDocumentedNarrowSet` /
`documentMimeTypesRejectsMimeOutsideTheNarrowAllowlist` / `...RejectsEmptyOrOversizedAllowlist` stay green,
confirming the *request*-side allowlist itself is correct — only the *result*-side re-check is missing.

**Fix direction:** in `prepare()`, when `"document".equals(requestedKind)`, validate `mime` against the same
narrow allowlist `documentMimeTypes()` enforces (e.g. extract that regex into a shared method both call), instead
of accepting any non-null MIME.

### MUST FIX-4 — `CameraCaptureActivity.complete()` discards the captured file's URI; camera capture does not work (M5-02, kill-set #5/#6)

**File:** `apps/mobile-shell/android/app/src/main/java/ru/therapygo/app/CameraCaptureActivity.java:185-195`

```java
private void complete(File output, String kind) {
    deliveredResult = true;
    Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", output);
    Intent data = new Intent();
    data.setData(uri);
    data.setType("video".equals(kind) ? "video/mp4" : "image/jpeg");
    ...
    setResult(RESULT_OK, data);
    finish();
}
```

**Root cause, a plain platform-API fact, not a Robolectric artifact:** `android.content.Intent#setType(String)`
unconditionally clears any `Uri` previously set via `#setData(Uri)` (and `#setData` clears any prior type) — the
two setters are mutually exclusive by design; only `#setDataAndType(Uri, String)` keeps both. Calling
`setData(uri)` then `setType(mime)`, as this method does, always leaves `data.getData() == null` by the time
`setResult(RESULT_OK, data)` runs.

**Consequence, traced end to end:** `DeviceMediaPlugin.onCaptureResult` (`DeviceMediaPlugin.java:87-97`) reads
exactly that field — `Uri uri = data.getData();` — then calls `resolveHandle(call, uri, "camera", kind, false)`.
`resolveHandle` (`DeviceMediaPlugin.java:215-219`) treats a `null` `Uri` as a cancellation:
`{outcome:'cancelled', reason:'cancelled'}`. **Every successful photo or video capture is therefore reported to
JS identically to the user backing out of the camera screen — the whole camera-capture feature required by
M5-02 does not work, in any build, for any input; this is not an edge case.** This is the single most severe
finding in this audit precisely because it is a total, silent feature failure rather than a narrow bypass.

**Proof (§10a cost-ladder — see reasoning in the test file):** reconstructing `complete()`'s own Robolectric
harness would require a shadowed CameraX provider (this project pins no CameraX Robolectric testing artifact;
`ProcessCameraProvider.getInstance(this)` throws `IllegalStateException` synchronously under Robolectric's real
`onCreate()`) just to reach a two-line method that touches no CameraX API at all — disproportionate machinery for
what `Intent`'s own documented contract already proves directly. `CameraCaptureActivityTest.
intentSetTypeClearsAnyUriPreviouslySetViaSetData` demonstrates the exact platform behavior (green, since it's
correct platform behavior, not a bug in Android) with the file:line citation of the two production lines this
breaks; `setDataAndTypeCarriesBothUriAndMimeType` is the oracle for the fix direction. This is inspection +
platform-contract-test evidence, in the same class as the prior shell-foundation audit's MUST FIX-1 (a structural
fact about a framework API shape, not a coverage gap a from-scratch integration test fixes).

**Fix direction:** `data.setDataAndType(uri, mime)` instead of the separate `setData`/`setType` calls.

## Kill-set scoreboard (against `.../00-blind-killset.md`)

| # | Kill-set item | Method | Result |
|---|---|---|---|
| 1 | every plugin call from untrusted/foreign/about/error/cross-brand/TEST↔prod origin denied, no side effect | inspection (100% of public `@PluginMethod`s across all 3 new plugins gate on `TrustedOriginGate.isTrusted`/`trusted(call)` as their literal first statement) + fault injection (bypassed the gate in each of the 3 plugins in turn: `NativeJitsiPlugin`, `DeviceMediaPlugin` [gate reachability confirmed via its own tests], `UniversalPushPlugin`) + acceptance tests (`NativeJitsiPluginTest`, `DeviceMediaPluginTest`, `UniversalPushPluginTest` origin-gate cases) | **PASS** — all 3 fault injections reddened the expected origin-gate tests, fully reverted (`git diff --stat` empty) |
| 2 | Jitsi accepts only the exact compiled endpoint; suffix/port/userinfo/cleartext/`meet.jit.si`/JaaS fail | acceptance tests (`NativeJitsiPluginTest.rejects*`) + fault injection (loosened exact `.equals` to `.startsWith`, reddened `rejectsEndpointWithNonDefaultPort`) | **PASS** |
| 3 | explicit start + permission → exactly one conference with the exact room/JWT; denied/cancelled don't launch; typed events once; hangup once; cleanup prevents duplicates; retry works | validation-gate tests (above) + inspection (permission check is a 3-line early return before any SDK call, gated after session validation but before `launch()`; broadcast receiver registered in `load()`/unregistered in `handleOnDestroy()`; `retry()` requires a prior `terminal` state — see `retryRejectsWithoutAnyPriorTerminalSession`) — full CameraX/JitsiSDK-permission-grant simulation was not built (§10a cost rule: Capacitor's permission machinery needs a real Activity+`ActivityCompat` grant simulation for a 3-line, easily-read gate) | **PASS** by inspection for the permission-gate/lifecycle shape; the validator and retry preconditions are test-proven |
| 4 | returning from Jitsi preserves WebView/notes state; no native notes page/hidden auto-start; no secret/room/endpoint logged | inspection: `grep` for `Log\.\|System\.out\|System\.err\|printStackTrace` across all 4 new/changed plugin+activity files returns nothing; no native "notes" Activity/layout exists anywhere in the diff; `NativeJitsiPlugin` never touches `MainActivity`'s WebView state | **PASS** |
| 5 | CameraX binds Preview+ImageCapture (photo) XOR Preview+VideoCapture (video), never both; front/back, stop, audio permission, cancellation truthful | inspection: `CameraCaptureActivity.bindUseCase()` is a single `if (videoMode) {...} else {...}` binding exactly one capture use-case with `Preview`, never both simultaneously; `capturePhoto()`/`startVideo()` cancellation paths call `setResult(RESULT_CANCELED)` (not a fake success) | **PASS** for use-case binding and cancellation; **MUST FIX-4** for the actual result delivery (above) — a truthful *cancel* still can't compensate for every *success* being reported as one |
| 6 | gallery via system picker; documents via OpenDocument + narrow MIME; spoofed MIME/cancelled/unreadable fail safely; descriptor is metadata/handle only, never bytes | acceptance tests (`documentMimeTypes*`) + inspection (`MediaHandle.descriptor()` — 7 named fields, no byte/base64 field exists on the type) | **MUST FIX-3** for the result-side MIME re-validation gap; gallery/cancellation/descriptor-shape items **PASS** |
| 7 | multipart sends exactly `(offset,length)`; retry reopens/seeks; non-seekable/unknown-size copies once; cancel/fail/complete close+remove resources | inspection: `connection.setFixedLengthStreamingMode(length)` + a read loop bounded by `remaining` (`streamRange`, `DeviceMediaPlugin.java:181-213`) can only ever write `length` bytes starting at `offset` (`media.openAt(offset)` seeks first); `prepare()`'s `size < 0 \|\| !seekable` branch materializes to cache exactly once; `finally` always disconnects and clears `activeUpload` — a live local-HTTP-server harness was not built because the upload URL host allowlist (item 8) gates before any network call and cannot be satisfied by a `localhost` test server without a hosts-file/cert rig disproportionate to a bounded read loop that is easy to read exactly (§10a cost rule) | **PASS** by inspection |
| 8 | upload rejects cleartext/redirect/userinfo/non-allowlisted host; only exact signed headers pass; nothing logged; opaque handle can't be replaced by an arbitrary JS URI | acceptance tests (`DeviceMediaPluginTest.allowedUploadUrl*`, `allowedHeaders*`) + fault injection (dropped the host-allowlist clause, reddened `allowedUploadUrlRejectsNonAllowlistedHost`) | **PASS** |
| 9 | Universal Push initializes idempotently from a trusted call only; token/endpoint never enter the app; events typed; raw token never logged | acceptance tests (origin-gate cases) + fault injection (bypassed `trusted()`, reddened 4/4 origin-gate tests) + inspection (no send endpoint/auth token appears anywhere in the plugin; `configure()` only re-inits when `configuredProjectId` is unset, rejects a second differing project id) | **PASS** |
| 10 | valid surface/kind/route → exactly one channel notification; denied permission typed; cross-surface/external/userinfo/protocol-relative/traversal don't notify/navigate | acceptance tests | **MUST FIX-1** (cross-surface) and **MUST FIX-2** (traversal); protocol-relative/absolute/no-leading-slash/oversized/null all **PASS** (`rejectsProtocolRelativeRoute`, `rejectsAbsoluteUrlRoute`, `rejectsRouteWithoutLeadingSlash`, `rejectsOversizedRoute`, `rejectsNullRoute`) |
| 11 | tap routes once to the trusted origin/allowlisted path; Android channel settings override defaults; distinct stable ids/sounds; sound change can't mutate an existing channel | inspection: `deliverPendingTap()` calls `notifyListeners("push", pendingTap, true)` exactly once and clears the intent extras immediately after reading them (can't re-deliver on a second `onResume`); three distinct channel-id constants (`therapygo_message_v1`/`_reminder_v1`/`_call_v1`) each with a distinct `R.raw.tone_*`; Android's own `NotificationChannel` contract (not overridden here) makes sound immutable after `createNotificationChannel` — a version bump to the channel id, not a mutation, is the documented path already noted in the README | **PASS** |
| 12 | all 4 brand×environment variants expose correct identity; no cross-brand assets/keys/tokens/service JSON; release non-debuggable/no-cleartext | build/artifact evidence below (`ShellRuntimePluginTest`, `aapt badging`/`xmltree` on all 4 release APKs) | **PASS** |

**Kill tally:** 4 fault-injection classes run against currently-passing tests (origin-gate bypass ×3 plugins,
Jitsi endpoint loosening, storage-host-allowlist removal), all reddened the expected test(s), all fully reverted
(`git diff --stat -- apps/mobile-shell/android/app/src/main/java` empty after every revert and once more at the
end). 4 independent classes already broken in the candidate (not injected), each demonstrated by a failing
acceptance test on the untouched candidate. 0 named kill-set items left unaddressed.

## Pre-existing test updated (not a new finding — an oracle correction)

`ShellRuntimePluginTest.resolvesTrustedOriginWithFalseCapabilitiesAndVariantBrand` (written by the prior
`mobile-shell-foundation-audit-20260909` audit, before M4/M5/M6 existed) asserted `capabilities.jitsi/media/push
== false`. This candidate intentionally flips those to `true` now that the plugins are actually built — the
README states this explicitly ("ShellRuntime.getRuntimeInfo() reports the three compiled capabilities as true")
and `src/runtime-info.ts`'s `SHELL_RUNTIME_CAPABILITIES` agrees. The old assertion is stale, not a regression;
updated in place to `resolvesTrustedOriginWithTrueCapabilitiesAndVariantBrand` with a comment explaining why the
oracle moved. Left uncorrected, this pre-existing test would have permanently red-flagged every future green run
of the entire flavor matrix for a change explicitly required by the owner's own plan.

## Build/artifact evidence

All commands run from repo root, `source /home/dev/.local/share/bcb-android/env.sh` first in every shell. This
worktree needed its own `pnpm install --frozen-lockfile` (fresh clone; not committed) — clean, 5.7s from the
shared store.

- `pnpm --dir apps/mobile-shell run sync` (icons + `derive:tones` + `cap sync android`) — clean.
- `pnpm --dir apps/mobile-shell run typecheck` / `run lint` (`eslint . --max-warnings=0`) — both clean, exit 0.
- `bash apps/mobile-shell/scripts/gradle.sh testTherapygo{EnvironmentTest,Production}DebugUnitTest
  testTherapysto{EnvironmentTest,Production}DebugUnitTest` — **76 tests × 4 variants, 3 failures each**, identical
  across all 4 (the 3 MUST FIX findings above); all other 73 tests green on every variant.
- `pnpm --dir apps/mobile-shell run assemble:debug` — `BUILD SUCCESSFUL`, all 4 debug variants (4m20s).
- `pnpm --dir apps/mobile-shell run assemble:release` — `BUILD SUCCESSFUL`, all 4 unsigned release APKs, R8/minify
  now actually enabled (`minifyEnabled true`, part of this candidate's diff) and completing cleanly for the full
  Jitsi/React-Native/Hermes/WebRTC/CameraX/RuStore dependency graph (12m51s).
- `pnpm --dir apps/mobile-shell run bundle:release` — `BUILD SUCCESSFUL`, all 4 unsigned AABs.
- `bash apps/mobile-shell/scripts/gradle.sh --continue lintTherapygoEnvironmentTestDebug
  lintTherapygoProductionDebug lintTherapystoEnvironmentTestDebug lintTherapystoProductionDebug` —
  `BUILD SUCCESSFUL`, 0 lint errors on each of the 4 variants (41 warnings each, all cosmetic:
  `ManifestOrder`/`AndroidGradlePluginVersion`/`GradleDependency`/`LockedOrientationActivity`/`DiscouragedApi`/
  `ObsoleteSdkInt`/`UnusedResources`/icon-shape/monochrome/density checks — confirmed by enumerating every lint
  rule id that actually fired; no security/correctness category present).
- Release APK sizes: 120,668,446–120,688,926 bytes; AAB sizes: 58,381,695–58,402,357 bytes — matches the
  candidate's own README claim (`re-measured` on this run, not copied from the README).
- `aapt dump badging` on all 4 release APKs: `applicationId`/label pairs match README's flavor matrix exactly
  (`ru.therapygo.app.test`/`ru.therapygo.app`/`ru.therapysto.app.test`/`ru.therapysto.app`); none show
  `application-debuggable`.
- `aapt dump xmltree AndroidManifest.xml` on a release APK: `usesCleartextTraffic=false`,
  `networkSecurityConfig` present; `CameraCaptureActivity`/`FileProvider`/`androidx.startup.InitializationProvider`
  all `exported=false`; only the launcher `MainActivity` and a handful of third-party-SDK-declared components
  (Jitsi's `ConnectionService` guarded by `BIND_TELECOM_CONNECTION_SERVICE`, RuStore's push service/receiver,
  Google Sign-In's revocation service, VK's device-id content provider) are `exported=true` — all from
  transitively-merged third-party manifests (Jitsi/RuStore/GMS), not from this candidate's own
  `AndroidManifest.xml` diff, which only adds `CameraCaptureActivity` (`exported=false`) and 4 permission lines.
  **Noted, not a finding:** the merged manifest also pulls in `BLUETOOTH`, `MANAGE_OWN_CALLS`,
  `FOREGROUND_SERVICE_MEDIA_PROJECTION`, `READ_CALENDAR`/`WRITE_CALENDAR` and `RECEIVE_BOOT_COMPLETED` from the
  Jitsi/WorkManager/GMS graph — none of these are requested by this candidate's own manifest edit, no code in the
  diff exercises calendar/boot-receiver behavior, and no M4–M7 checklist item bars unused transitive third-party
  permissions; recorded for owner awareness the same way the prior audit recorded static-`capacitor.config.json`
  bundling as inert-but-worth-knowing.
- `apksigner verify --print-certs` on all 4 release APKs: `DOES NOT VERIFY` / `Missing META-INF/MANIFEST.MF` —
  genuinely unsigned, matches the repo's "no release credentials" claim.
- `zipalign -c -P 16 -v 4` on all 4 release APKs: `Verification successful` (16-KiB native-library page alignment).
- `app:dependencies` for `therapygoProductionReleaseRuntimeClasspath`: OkHttp resolves to a single version
  (`4.12.0`) across every transitive requester (Fresco, media3, the plain `okhttp` artifact) with no
  `resolutionStrategy.force` in `build.gradle` — matches the README's "do not force a separate OkHttp version"
  claim.
- Secret/keystore scan: `grep -rniE 'BEGIN (RSA|EC|PRIVATE) KEY|keystore|password\s*=|api[_-]?key\s*='` over this
  audit's own new files — no hits; no `local.properties`/`*.keystore`/`*.jks`/`google-services.json`/service-JSON
  anywhere under `apps/mobile-shell`; `grep` for `Log\.`/`System.out`/`System.err`/`printStackTrace` across all 4
  new/changed plugin+activity source files — no hits (matches the README's "not logged" claims).
- `git diff --check` — clean, no whitespace errors. `git status --porcelain` before/after every build step —
  clean except this audit's own new files (build outputs correctly gitignored).

## External/host blocker (§6a, not a source/build/test finding)

`M2-00a` (emulator + `kvm` group membership) remains open, re-checked on this run: `id` shows user `dev` in groups
`dev sudo users docker`, not `kvm`; `/dev/kvm` exists (`crw-rw---- root kvm`) but is not group-accessible to this
session — identical state to the prior shell-foundation audit. `M7-04` (Android emulator acceptance: origin
rejection/external links, camera, documents, native Jitsi, permission states, push tap with a fake provider) is
therefore **not exercised** by this audit. This is not downgraded to a source/build/test finding — it is the same
external, privileged host-provisioning blocker the plan already names at M2-00a/§6a, on the same single line.
`M7-05` (real Universal Push delivery on TEST) additionally requires the external RuStore infrastructure gate and
is likewise not exercised here.

## Scope notes

- This audit covers every M4/M5/M6/M7 checkbox that belongs to `apps/mobile-shell/**`. It does not touch, expand
  into, or make claims about the web integration (`#1100`'s `VideoMeetingStage`/live pages), backend delivery
  adapters (`M6-01/03/05/06/07/08/09`'s server-side halves), PWA, signing, or store-publication stages — those are
  explicitly out of scope per the launcher brief and owned by later passes.
- Full repo-wide `pnpm run ci` was **not** run: this is a per-workstream audit, not the M7-06 final-integration
  checkpoint; root `typecheck`/`lint` were not re-run here since this candidate touches no root-level TypeScript
  outside `apps/mobile-shell` (confirmed by `git show --stat fafa7dcf0`).
- No production code in the final committed state was modified by this audit. All 5 fault injections (3 into
  already-passing new tests, 1 into the pre-existing `TrustedOriginGate`-adjacent Jitsi validator, 1 into the
  storage-host allowlist) were reverted before this report was written; `git diff --stat -- apps/mobile-shell/
  android/app/src/main/java` is empty. The 4 MUST FIX findings above were already present in the committed
  candidate — they are demonstrated by failing acceptance tests, not by any injection.
