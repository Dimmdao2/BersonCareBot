# Final audit report — #915 Capacitor shell foundation

**Candidate:** `533bb29b1` "#915 build shared Capacitor 8 Android shell foundation" (base `feat/doctor-ui-rebuild`
via `wt/mobile-plan-opus-20260909` → `229a243e7`). **Role:** `auditor-live`, first independent audit of this
surface. **Authority:** `AGENTS.md` §10a/§10b/§24.4-§24.5, `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`
M2-01…M2-08 (M7-01/03/04 partially exercisable now). Blind kill-set:
`.lead/runs/mobile-shell-foundation-audit-20260909/00-blind-killset.md`, written before any test was opened.

## Overall verdict: **MUST FIX** (one finding), everything else **PASS**

## Findings

### MUST FIX-1 — `onReceivedError`/`onReceivedHttpError` are not scoped to the main frame (M2-04)

**File:** `apps/mobile-shell/android/app/src/main/java/ru/therapygo/app/MainActivity.java:102-110`
(`ShellWebViewListener.onReceivedError` / `onReceivedHttpError` → `showUnavailable()`).

**Scenario:** any sub-resource request inside the trusted first-party page that returns a network error or a
non-2xx HTTP status — a missing `favicon.ico`, a blocked third-party analytics script, a `<img>` 404, or any
`fetch`/XHR call the SPA itself makes that legitimately returns 401/404/5xx as part of normal operation —
flips the whole shell into the "Server unavailable. Your clinical data is not available offline." full-screen
overlay, even though the main page loaded and is fully functional.

**Root cause, proven by reading the already-built framework source, not by injecting a fault into product
code (§10a — a Robolectric harness that fabricates a `WebResourceRequest`/`WebResourceError` pair and drives
it through the real `BridgeWebViewClient` would cost more machinery than the one-time read):**
`node_modules/@capacitor/android/.../com/getcapacitor/BridgeWebViewClient.java:44-59,74-89` — Capacitor calls
`listener.onReceivedError(view)` / `listener.onReceivedHttpError(view)` unconditionally for **every** resource
load, main frame or not; only the framework's own internal error-page redirect is gated by
`request.isForMainFrame()`. The `WebViewListener` callback surface Capacitor exposes only carries `WebView`
(`node_modules/@capacitor/android/.../com/getcapacitor/WebViewListener.java:25,34`) — `MainActivity`'s override
has no `request`/`isForMainFrame()` to check even if it wanted to. This is a shape of the third-party API, not
a missed branch in the candidate.

**Impact:** violates M2-04 ("Shell показывает startup/loading/offline/server-unavailable state"; the state must
reflect main-frame reachability, not incidental sub-resource noise) and the shell's own contract in
`apps/mobile-shell/README.md` ("Server unavailable" is meant for actual reachability loss). In production this
overlay can appear during completely normal use and blocks the whole app behind a full-screen dead end with
only "Retry" (which reloads the compile-time start URL, discarding in-page state).

**Fix direction (for the assigned §24.1 executor, not prescribed here):** `MainActivity` needs to know
`isForMainFrame()` to gate `showUnavailable()`, which requires subclassing/wrapping `BridgeWebViewClient`
(overriding `onReceivedError(WebView, WebResourceRequest, WebResourceError)` /
`onReceivedHttpError(WebView, WebResourceRequest, WebResourceResponse)` directly) instead of relying solely on
`WebViewListener`, or filtering by comparing the failing URL's origin against `ShellVariant.origin()` combined
with an explicit "was this the top document" signal Capacitor does not currently hand the listener.

No permanent test added for this: it is a one-time structural fact about a third-party API shape (§10a/§24.4
"качество разового действия"), demonstrated once by exact `file:line` framework evidence above; a test that
recreates a real Chromium main/sub-frame error round-trip inside Robolectric is exactly the kind of expensive
scaffolding §10a says to skip in favor of reading and reporting.

## Kill-set scoreboard (against `.../00-blind-killset.md`)

All items below are killed either by a **red** acceptance test under injected fault (reverted before commit,
confirmed via `git diff --stat -- apps/mobile-shell/android/app/src/main/java` = empty after every revert), or
by **structural inspection** where §10a/§24.4 classifies the item as a one-time fact rather than repeatable
behavior.

| # | Kill-set item | Method | Result |
|---|---|---|---|
| 1a | accept suffix/subdomain host as trusted | fault injection (`equalsIgnoreCase` → `endsWith`) | **killed** — `TrustedOriginGateTest.rejectsSubdomainAndSuffixTricks` reddened |
| 1b | ignore non-default port | fault injection (dropped port clause) | **killed** — `rejectsNonDefaultPortOnTrustedHost` reddened |
| 1c | classify untrusted HTTPS as internal (any other domain, not just a lookalike) | fault injection (`isTrusted` short-circuits `true` for any `https`) | **killed** — 5 tests across `TrustedOriginGateTest`/`NavigationPolicyPluginTest` reddened (suffix, sibling-brand, cross-environment, non-default-port, untrusted-https-dispatch) |
| 1d | sibling-brand origin trusted | covered by same fault injection above via `rejectsSiblingBrandOrigin` | **killed** |
| 1e | TEST↔production cross trusted | fault injection (`ShellVariant.origin()` stopped honoring `SHELL_ENVIRONMENT`) | **killed** — `ShellVariantTest.resolvesExactOriginAndStartUrlForThisVariant` reddened, and same fault also reddened `TrustedOriginGateTest.rejectsCrossEnvironmentOrigin` in the combined run above |
| 1f | `https://trusted@evil` userinfo trick | passing test against unmutated code (`rejectsUserInfoTrick` in both Gate and Plugin tests); code path (`getUserInfo() != null`) is a single guarded line, mutating it degenerates to the same class as 1c | **PASS**, killed transitively by 1c injection path coverage |
| 2 | `javascript`/`intent`/`file`/`content`/`data`/malformed/null neither load nor dispatch; only `mailto`/`tel`/nontrusted `http(s)` dispatch | fault injection (added `javascript` to the dispatch allowlist) | **killed** — `javascriptSchemeIsRejectedWithNeitherLoadNorIntent` reddened; remaining 8 scheme cases pass green against real code, each asserting both the return value and the captured (or absent) `ACTION_VIEW` intent via `ShadowActivity` |
| 3 | one policy chokepoint; internal continues, external emits exactly one intent, rejected emits neither | inspection (`Bridge.launchIntent` loop: first non-null `shouldOverrideLoad` wins, `NavigationPolicyPlugin` is the only plugin overriding it) + all `NavigationPolicyPluginTest` cases assert exact intent count via `shadowActivity.getNextStartedActivity()` called twice | **PASS** |
| 4 | `TrustedOriginGate`/runtime-info reject on untrusted/`about:blank`/null current URL | fault injection (`ShellRuntimePlugin` gate short-circuited via `false &&`) | **killed** — 3 of 4 `ShellRuntimePluginTest` cases reddened |
| 5 | correct kind/brand/origin/path per variant, Jitsi/media/push stay false | fault injection (`capabilities.put("jitsi", true)`) | **killed** — `resolvesTrustedOriginWithFalseCapabilitiesAndVariantBrand` reddened. Note: `kind` is intentionally the constant `"capacitor-android"`, not a brand-encoded value like M3-02's future `therapygo_android`/`therapysto_android` — that naming belongs to the not-yet-built `NativeRuntime` (M3), a different workstream; not a finding against this M2 candidate, whose own TS contract (`src/runtime-info.ts`) and Java payload agree with each other. |
| 6a | WebView Back returns to prior page, root Back exits/backgrounds | inspection (`MainActivity.getOnBackPressedDispatcher()` callback: `canGoBack()` → `goBack()`, else `finish()`) — a Robolectric harness for a real `BridgeActivity`+live `WebView` history stack is disproportionate machinery for a 5-line callback (§10a cost rule) | **PASS** |
| 6b | main-frame-only failure → recoverable overlay, retry reloads compile-time start URL, no offline-data claim | inspection | **MUST FIX-1** (see above) — retry-reloads-start-URL and no-offline-data-claim parts of this item are themselves correct (`retryStartPage()` reloads `startUrl`; README/overlay text make no offline-data claim) |
| 7 | no canary/query/fragment secret in logs; no cookie/Jitsi/push/presign/signing material in release artifacts | inspection: zero `Log`/`Logger`/`println` calls anywhere in `apps/mobile-shell/android/app/src/main/java` (`grep` returned nothing); `SHELL_DEBUG`/`webContentsDebuggingEnabled`/Capacitor `loggingEnabled` all gated off for `release` build type; M4/M5/M6 (Jitsi/media/push) code does not exist yet in this candidate; no `local.properties`/`*.keystore`/`*.jks` in the tree | **PASS** |
| 8 (found during authority reading, not in the given list) | static `assets/capacitor.config.json` bundled identically (`therapygo`/production/`/app/patient`) into **every** flavor's APK | inspection: `CapConfig.Builder(Context)` (used by `MainActivity`) never calls `loadConfigFromAssets`; `Bridge.getServerUrl()`/`allowedOriginRules` read only from the injected `CapConfig`, confirmed by reading `CapConfig.java:559-599` and `Bridge.java:241,549`, and independently by `applicationId`/label already differing correctly per built APK (`aapt dump badging`) | **not a finding** — provably inert given `Bridge.Builder.setConfig()`; recorded for awareness only |

**Kill tally:** 6 independent fault-injection classes run, all 6 reddened the expected test(s) and were fully
reverted; 1 structural MUST FIX found by source inspection; all other kill-set items PASS by test or inspection.
0 named classes unkilled.

## Build/artifact evidence

All commands run from repo root unless noted; `source /home/dev/.local/share/bcb-android/env.sh` first in every
shell.

- `pnpm install --frozen-lockfile` — clean, `Lockfile is up to date`.
- `pnpm --dir apps/mobile-shell run sync` (derive:icons + `cap sync android`) — clean.
- `pnpm --dir apps/mobile-shell run typecheck` / `run lint` (`eslint . --max-warnings=0`) — both clean, exit 0.
- `pnpm run typecheck` (root, builds `operator-db-schema`/`db-principal`/`shared-contracts`/`platform-merge`/
  `error-tracking` first, per actual root `package.json` script — not a raw `pnpm -r --parallel run typecheck`,
  which false-positives on `platform-merge` before `shared-contracts` is built) — clean, includes
  `apps/mobile-shell typecheck: Done`.
- `npx eslint .` (root, the exact command `pnpm run lint` calls first) — clean, zero output.
- `git status --porcelain` before and after `sync` — clean both times (only this audit's own new files); confirms
  M2-02's "Gradle/Android artifacts and local SDK paths не попадают в git" claim.
- `pnpm --dir apps/mobile-shell run assemble:debug` — `BUILD SUCCESSFUL`, all 4 variants
  (`assembleTherapygoEnvironmentTestDebug`, `assembleTherapygoProductionDebug`,
  `assembleTherapystoEnvironmentTestDebug`, `assembleTherapystoProductionDebug`).
- `pnpm --dir apps/mobile-shell run assemble:release` — `BUILD SUCCESSFUL`, all 4 unsigned release APKs.
- `pnpm --dir apps/mobile-shell run bundle:release` — `BUILD SUCCESSFUL`, all 4 AABs.
- `bash scripts/gradle.sh lintTherapygoEnvironmentTestDebug lintTherapygoProductionDebug
  lintTherapystoEnvironmentTestDebug lintTherapystoProductionDebug` — `BUILD SUCCESSFUL`, 0 lint errors on each
  of the 4 variants (35 warnings each, all cosmetic: `HardcodedText` on the status-overlay strings,
  `MonochromeLauncherIcon`/`IconLauncherShape`/`IconDipSize`/`IconDuplicates`/`UnusedResources`/`ObsoleteSdkInt`/
  `SetTextI18n`/`ManifestOrder` — no security/correctness category present; not findings per
  `AGENTS.md` "Аудит/ревью ищет только реальные нарушения").
- `aapt dump badging` on all 4 debug APKs: `applicationId`/label pairs exactly match
  `apps/mobile-shell/README.md`'s flavor matrix
  (`ru.therapygo.app.test`/`ru.therapygo.app`/`ru.therapysto.app.test`/`ru.therapysto.app`, labels "Therapy Go"/
  "Therapysto"); all 4 show `application-debuggable` (correct — these are debug builds).
- `aapt dump badging` on all 4 release APKs: `applicationId`/label correct, **no** `application-debuggable` line
  (correct — release build type has `SHELL_DEBUG=false`).
- `apksigner verify --print-certs` on all 4 release APKs: `DOES NOT VERIFY` / `Missing META-INF/MANIFEST.MF` on
  every one — genuinely unsigned, matches README's explicit claim.
- `aapt dump xmltree AndroidManifest.xml` on release APK: `android:usesCleartextTraffic=false`,
  `android:networkSecurityConfig` present and points at `cleartextTrafficPermitted="false"`; FileProvider and
  androidx-startup providers both `exported=false`; only launcher activity `exported=true` (required for
  `LAUNCHER`/`MAIN`).
- `git diff --check` — clean, no whitespace errors.
- Secret/keystore scan: `grep -rniE 'BEGIN (RSA|EC|PRIVATE) KEY|keystore|password\s*=|api[_-]?key\s*='` over the
  audit's own new/changed files — no hits; `find` for `local.properties`/`*.keystore`/`*.jks` under
  `apps/mobile-shell` — none present.
- Launcher/adaptive/splash icon resources for both brands — inspected visually
  (`Read` tool on the derived PNGs): distinct marks per brand (Therapy Go with the sphere, Therapysto without),
  consistent with `apps/mobile-shell/README.md`'s described derivation.

## Unit test evidence (added by this audit)

New files, `testImplementation`-only, no product code touched by the final commit:

- `apps/mobile-shell/android/app/src/test/java/ru/therapygo/app/TrustedOriginGateTest.java` — 10 cases.
- `apps/mobile-shell/android/app/src/test/java/ru/therapygo/app/NavigationPolicyPluginTest.java` — 13 cases.
- `apps/mobile-shell/android/app/src/test/java/ru/therapygo/app/ShellRuntimePluginTest.java` — 4 cases.
- `apps/mobile-shell/android/app/src/test/java/ru/therapygo/app/ShellVariantTest.java` — 1 case (independent
  literal oracle from the README flavor matrix, not derived from the class under test — makes the other three
  suites' use of `ShellVariant.origin()` as their own oracle non-circular).
- `apps/mobile-shell/android/app/build.gradle` / `apps/mobile-shell/android/variables.gradle` — added
  `testImplementation` for `robolectric:4.16.1`, `androidx.test:core:1.7.0`, `mockito-core:5.23.0` (JVM unit-test
  scope only; no `androidTestImplementation`/runtime dependency changed) plus `testOptions.unitTests`.

28 tests × 4 flavor×environment build variants = 112 test executions, all green on the unmutated candidate:

```
bash apps/mobile-shell/scripts/gradle.sh \
  testTherapygoEnvironmentTestDebugUnitTest testTherapygoProductionDebugUnitTest \
  testTherapystoEnvironmentTestDebugUnitTest testTherapystoProductionDebugUnitTest
# BUILD SUCCESSFUL
```

Fault-injection log (mutation → command → exact reddened assertion → reverted):

1. `TrustedOriginGate.java`: host match `equalsIgnoreCase` → `endsWith` → `testTherapygoEnvironmentTestDebugUnitTest --tests TrustedOriginGateTest` → `rejectsSubdomainAndSuffixTricks FAILED` → reverted.
2. `TrustedOriginGate.java`: dropped `normalizedPort(...) == normalizedPort(...)` clause → same target → `rejectsNonDefaultPortOnTrustedHost FAILED` → reverted.
3. `NavigationPolicyPlugin.java`: added `"javascript".equals(scheme)` to the dispatch allowlist → `--tests NavigationPolicyPluginTest` → `javascriptSchemeIsRejectedWithNeitherLoadNorIntent FAILED` → reverted.
4. `ShellRuntimePlugin.java`: gate short-circuited (`if (false && !TrustedOriginGate.isTrusted(...))`) → `--tests ShellRuntimePluginTest` → `rejectsForAboutBlank`, `rejectsForNullCurrentUrl`, `rejectsWhenCurrentWebViewUrlIsUntrusted` all FAILED → reverted.
5. `ShellRuntimePlugin.java`: `capabilities.put("jitsi", false)` → `true` → same target → `resolvesTrustedOriginWithFalseCapabilitiesAndVariantBrand FAILED` → reverted.
6. `ShellVariant.java`: `origin()` stopped branching on `SHELL_ENVIRONMENT` (always returns production origin) → `--tests ShellVariantTest` → `resolvesExactOriginAndStartUrlForThisVariant FAILED` → reverted.
7. `TrustedOriginGate.java`: `isTrusted` short-circuits `true` for any `https` scheme regardless of host/port → `--tests TrustedOriginGateTest --tests NavigationPolicyPluginTest` → 5 tests FAILED (`rejectsSubdomainAndSuffixTricks`, `rejectsSiblingBrandOrigin`, `rejectsNonDefaultPortOnTrustedHost`, `rejectsCrossEnvironmentOrigin`, `untrustedHttpsDispatchesExactlyOneSystemViewIntentAndBlocksWebView`) → reverted.

Final state confirmed identical to candidate: `git diff --stat -- apps/mobile-shell/android/app/src/main/java`
empty after every revert, and once more after the full injection sequence completed. Final full green re-run
across all 4 variants confirmed above.

## External/host blocker (§6a `G-1`/`G-1a`, not a source/build/test finding)

`M2-00a` (emulator + `kvm` group membership) remains open: `id` shows user `dev` in groups
`dev sudo users docker`, not `kvm`; `/dev/kvm` exists (`crw-rw---- root kvm`) but is not group-accessible to this
session. Per the plan, this is a privileged host action for a port-agent, not something this audit changes. `M7-04`
(Android emulator acceptance) is therefore **not exercised** by this audit and is not downgraded to a source/
build/test finding — it is an external blocker on that one line only, matching `MASTER_PLAN.md` M2-00a/§6a.

## Scope notes

- Full repo-wide `pnpm run ci` was **not** run: this is a per-workstream audit, not the M7-06 final-integration
  checkpoint, and `AGENTS.md` §9 requires naming a specific uncovered repo-level risk before paying for it. Root
  `typecheck` and root `eslint .` (both repo-level, both actually exercise `apps/mobile-shell`'s wiring into the
  workspace) were run instead and are clean; no other app's test suite is touched by this diff.
- No product code in the final committed state was modified by this audit; all fault injections were reverted
  before this report was written, confirmed by `git diff --stat` against `apps/mobile-shell/android/app/src/main`.
