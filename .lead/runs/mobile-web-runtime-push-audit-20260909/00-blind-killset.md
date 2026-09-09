# Blind kill-set — #915 web NativeRuntime + Universal Push client (M1-07/M3/M6-client)

Written BEFORE reading any test file. Candidate: `d54b34775` on `wt/mobile-web-runtime-push-20260909`
(base `feat/doctor-ui-rebuild` @ `36db05106`). Authority: `MASTER_PLAN.md` M1-07, M3-01…M3-03, M6-03/M6-09
(web-client half), `AGENTS.md` §10a/§10b/§24.4/§24.5, `apps/mobile-shell/README.md` (ShellRuntime/UniversalPush wire).

Oracle: browser/PWA keeps the unchanged web fallback; trusted Android calls the same public contract through
the native bridge; no parallel push business path, platform detector or authorization source is introduced.

## K1 — Safe fallback to browser behavior (M3-01/M3-02, no white screen)
Browser, PWA, messenger, and native-shell-but-missing/malformed/rejecting plugin all resolve to
`BROWSER_NATIVE_RUNTIME` (`kind:'browser'`). No native fact ever authorizes role/org/surface, crashes
hydration, or leaves a white/loading screen.
- Malformed `getRuntimeInfo()` shapes to kill: `kind !== 'capacitor-android'`, unknown `brand`, missing/empty
  `version`, non-boolean `capabilities` fields, plugin absent, `getRuntimeInfo` rejects/throws.
- `isNativeShellActive()` must not throw when `window` is undefined or `window.Capacitor` is absent.

## K2 — Closed brand→kind mapping, single detector (M3-01/M3-02)
Only `brand==='therapygo'` → `therapygo_android`, `brand==='therapysto'` → `therapysto_android`. Any other
brand string (unknown, empty, cross-brand, numeric/object) → null → falls back to browser.
`rg 'window\.Capacitor' apps/webapp/src` must match only `nativeShellRuntime.ts` (+ its doc). Product pages
consume `NativeRuntimeSnapshot` only via `useNativeRuntime()`/`PlatformProvider`, never a second detector.

## K3 — Zero PWA/SW/install side effects in native shell (M1-07)
When `isNativeShellActive()` is true: `registerPatientServiceWorker` performs zero `/sw.js` registration;
`pushCapability.ts` (`probePushSupported`/`getServiceWorkerRegistration`/`getExistingPushSubscription`)
no-ops; `LandingPwaClientBootstrap`, `StaffPwaBootstrap`, `PwaInstallSection`, `StaffPwaInstallSection` do not
subscribe to `beforeinstallprompt`, do not mark browser-install, do not show install UI. Browser/PWA keeps
each behavior unchanged (regression check on the non-native path). Platform-admin exclusion (M1-05, already
accepted) is not reopened by this change.

## K4 — Runtime kind alone fixes native-push route selection (M6-03/M6-09 web-client half)
Therapy Go (`therapygo_android`) always calls `/api/patient/native-push`; Therapysto
(`therapysto_android`) always calls `/api/account/native-push`; browser calls neither. Caller cannot select
route via any param. Missing/invalid project id, denied permission, missing plugin, unauthenticated
(401/403) response, and malformed token event each fail typed/no-op — no throw, no POST loop/retry storm.

## K5 — Permission gated on explicit action; idempotent install/token lifecycle (M3-03)
`requestUniversalPushPermission`/`configureUniversalPush` are invoked only from the existing explicit
Push-enable actions (`WebPushOptInControls`, `DoctorWebPushControls`) — never automatically on mount or on
`App` resume. Token register/rotate/resume events register **one** opaque installation id
(`nativePushInstallation.ts`) with `provider:'rustore'`; the id is never a user/role/org id. Duplicate/
unchanged token events (same hash) do not re-POST (hash-based dedupe) — no storm on repeated resume/mount/
token events.

## K6 — Logout: best-effort revoke before session destruction, browser unchanged (M3-03)
`LogoutForm` attempts authenticated DELETE against the native-push endpoint, then native `revoke()`, before
the existing session-destroying POST/form submit; a failure at either step is swallowed (best-effort) and
never blocks logout, never logs the token/id. Browser logout remains a plain form POST — no JS required,
byte-for-byte behavior unchanged (kill: reversed ordering, i.e. session destroyed before revoke attempted,
would strand an authenticated revoke call with no session).

## K7 — Tap route: same-surface only, single in-app navigation (nativePushTapRoute.ts)
A valid same-surface route (matching this runtime's compiled brand, e.g. `/app/patient...` for Therapy Go,
`/app/doctor...`/`/app/settings...`/`/app/account...` for Therapysto) navigates in-app exactly once.
Rejected/ignored, no navigation call: external absolute URL (`https://...`), protocol-relative (`//evil.tld`),
`/app/admin/**`, cross-brand route (Therapysto route delivered to Therapygo runtime or vice versa),
`/app/account` route reaching patient runtime, malformed route (`.`/`..` path segments, non-`/app` prefix,
empty string). No raw token, project id, or route reaches `console.*`/analytics/persisted state on any path.

## Kill tally target
7 named classes above; each must be either caught by a retained/added green behavioral test under fault
injection, or left as a failing acceptance test on the untouched candidate (handoff). One-time file-placement/
absence-of-page-copy/single-detector-architecture facts (K2's `rg` check, no second product page) are
inspected against the exact diff, not turned into a permanent source-text test.
