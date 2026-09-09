# Blind kill-set — #915 native capability correction confirmation

Written before reading `bfe25db0b`'s diff in detail or its retained/added tests. Derived only from the launcher
brief's five mandatory proof points and the prior audit report's four MUST FIX descriptions
(`.lead/runs/mobile-native-capabilities-audit-20260909/90-final-audit-report.md`). Role: `auditor-live`,
independent second pass. Candidate under confirmation: `bfe25db0b` on top of rejected `657a8b7d7`/`fafa7dcf0`.

## A. Four original MUST FIX closures (must hold without weakening retained oracles)

1. `UniversalPushPlugin.validSurface` — must compare against **this compiled process's** brand
   (`BuildConfig.SHELL_BRAND` or `ShellVariant` equivalent), never a static two-literal membership test. A data
   push declaring the sibling brand's surface must be rejected by the Therapy Go build and by the Therapysto build
   symmetrically.
2. `UniversalPushPlugin.validRoute` — must reject any route containing a literal `..` path segment even when the
   whole string still textually `startsWith` the allowed prefix (e.g. `/app/patient/../../app/doctor/x`). Must
   still accept ordinary in-prefix routes and still reject foreign-prefix, protocol-relative, absolute-URL,
   no-leading-slash, oversized, null routes (regression check against the 7 previously-green tests).
3. `DeviceMediaPlugin.prepare()` — for `requestedKind == "document"`, must re-validate the picked URI's actual
   `ContentResolver` MIME against the same narrow allowlist `documentMimeTypes()` enforces on the request side, not
   accept any non-null MIME. Must still accept the 6 documented MIME types and still accept `image/*`/`video/*` for
   camera/gallery kinds (regression).
4. `CameraCaptureActivity.complete()` — must call `Intent#setDataAndType(uri, mime)` (or otherwise preserve both
   URI and MIME simultaneously), not separate `setData`+`setType` calls that clear each other per the documented
   `Intent` contract. A successful photo/video capture's result `Intent` must carry a non-null `getData()` AND a
   non-null `getType()` reaching `DeviceMediaPlugin.onCaptureResult`/`resolveHandle` as a `{outcome:'selected'}`
   descriptor, not `{outcome:'cancelled'}`.

## B. Cold-process RuStore Push (new mandatory surface, M6-04/M6-10 lead gaps)

5. Manifest `<application android:name>` points at exactly one Application subclass; that subclass is the single
   place a shared push runtime is bootstrapped — no second init path exists in `UniversalPushPlugin` or elsewhere.
6. A persisted **non-secret** project id (not a token, not a credential) bootstraps the RuStore SDK on process
   start, before any trusted WebView/JS call reaches the plugin — i.e., token/message callbacks are live even if
   the process was cold-started by the OS to deliver a push with no `MainActivity`/WebView ever created.
7. Token/new-token and message callbacks are registered exactly once regardless of whether the process is cold
   (Application.onCreate only) or warm (plugin already `load()`ed) — no duplicate listener registration, no missed
   registration window.
8. A data-only message is validated for brand/route (the corrected `validSurface`/`validRoute`) **before** any
   notification is shown — the cold-process runtime must reuse the same two corrected validators, not a
   second/duplicated/looser copy of them.
9. Notification title is read from the compiled app's own label resource (`R.string.app_name`), never a hardcoded
   literal like `"Therapy Go"` baked into a shared code path both brands compile.
10. No secret, token, payload body, or project id is ever passed to `Log.*`/`System.out`/`System.err`/
    `printStackTrace` — including whatever logger the RuStore SDK itself is configured with (a default SDK logger
    that logs to logcat by default is itself a finding if not overridden/suppressed).
11. A fresh install that never received a trusted `configure()` call must cold-start safely (no crash, no
    fabricated project id, no call into the SDK with garbage/empty configuration).

## C. Jitsi single-terminal-event + idempotent hangup + retry permission recheck

12. Two SDK broadcasts that both represent "the call ended" (e.g. `CONFERENCE_TERMINATED` and
    `READY_TO_CLOSE`, or two `CONFERENCE_TERMINATED` deliveries for one launch) must produce **exactly one**
    terminal JS event per launch — not zero, not two.
13. If both an error and a terminated/close signal arrive for the same launch, exactly one terminal event still
    fires (error takes priority, per the correction commit message — confirm this, don't just assume it).
14. `hangup()` must be a safe no-op (not throw, not emit a second terminal event, not call the SDK) when this
    plugin instance does not currently own an active conference.
15. `retry()` must re-check **both** camera and microphone runtime permission immediately before relaunching, not
    reuse a permission result cached from the original launch attempt; a denial at retry-time must not launch.
16. `retry()` must require a prior terminal state (cannot be called to launch a fresh, unrelated conference from
    an idle/never-launched plugin instance) — regression check against the pre-existing
    `retryRejectsWithoutAnyPriorTerminalSession` oracle named in the prior report.

## D. Upload 2xx + non-empty ETag contract, concurrency safety

17. `outcome:'uploaded'` is returned only when the HTTP response status is in `[200,299]` **and** the response
    carries a non-empty ETag header usable by a later finalize call — a 2xx response with a missing/blank ETag
    must resolve a typed failure outcome, not `'uploaded'`.
18. A followed redirect (3xx, whether or not `HttpURLConnection` auto-follows it) must not be reported as
    `'uploaded'` even if the final hop is 2xx-with-ETag — confirm whether redirects are followed at all, and if
    so, whether the redirected response's own status/ETag (not the original request's) gates the outcome; if
    redirects are disabled by design, confirm the resulting non-2xx is still a typed failure, not a thrown
    unchecked exception that skips cleanup.
19. 4xx/5xx statuses resolve a typed `{outcome:'upload_failed', status}` (or equivalent), never `'uploaded'`,
    never a raw unhandled exception that leaks past `finally` cleanup.
20. Two concurrent `upload()`/`streamRange()` calls on the same plugin instance cannot both claim the same shared
    "active upload" handle — one must be serialized/rejected/queued such that `cancelUpload()` or the first call's
    own `finally` cleanup cannot close/null out the *second* call's live connection out from under it (no
    use-after-close, no leaked open connection, no double-close exception surfacing to JS as a spurious failure).
21. Cancellation mid-upload must close/release the network resource and not leave `activeUpload` pointing at a
    stale/closed connection that a later, unrelated call could mistake for its own.

## E. Retained-oracle non-weakening (regression gate on the whole B/C/D surface, plus A)

22. None of the 7 previously-green `validRoute` tests, 3 previously-green `validSurface` tests, 4 previously-green
    `documentMimeTypes*` tests, or any previously-green `NativeJitsiPluginTest`/`DeviceMediaPluginTest` origin-gate,
    Jitsi-endpoint-exact-match, or upload-host-allowlist test have been weakened, deleted, or had their assertions
    loosened to make the four MUST FIX fixes pass. `git diff` of the *test* files between `657a8b7d7` and current
    HEAD is the primary evidence source for this line (worker was barred from touching tests).

## F. Build/manifest/secret hygiene (one-time inspection, not behavioral tests)

23. Merged manifest for all 4 brand×environment release variants: correct `applicationId`/label, `debuggable=false`,
    `usesCleartextTraffic=false`, no new unexpectedly-exported component introduced by `ShellApplication`/
    `PushRuntime` (Application classes are never independently exported/intent-filtered — confirm no manifest
    entry was added for them beyond `android:name` on `<application>`).
24. No RuStore/GMS/Jitsi service-account JSON, keystore, or literal token/secret string committed anywhere under
    `apps/mobile-shell` in the diff between `657a8b7d7` and HEAD.
25. Full 4-variant unit test matrix green (`assembleDebug`/`testDebugUnitTest` per flavor×environment); proportionate
    typecheck/lint clean.

---
Proof-cost note (`AGENTS.md` §10a): items 6, 7, 11 (cold-process Application bootstrap) are inspection-only unless
a Robolectric `ApplicationProvider`-based test can cheaply exercise `ShellApplication.onCreate()` without a full
RuStore SDK double — will decide per §10a cost ladder once the actual class is read. Items 12–16 (Jitsi terminal
dedup) are the kind of pure-state-machine logic that is normally cheap to unit test directly on the plugin's
broadcast-receiver callback without any real SDK — expect behavioral tests here. Items 17–21 (upload 2xx+ETag) are
directly testable against a fake `HttpURLConnection`/local server exactly as the retained `allowedUploadUrl*`
tests already do; expect behavioral tests, not inspection-only claims.
