# Тест или взгляд

Повторяемые plugin security, lifecycle, picker, byte-range upload и notification contracts проверяй
поведенческими тестами через публичные Kotlin seams. Dependency graph, manifest, resources, APK/AAB, permissions,
16-KiB alignment и отсутствие секретов проверяй build/artifact inspection; тесты на текст исходника не пиши.

# Auditor-live brief — #915 Android native capability plugins

Independently audit the exact committed Android native-capabilities candidate. Product code is read-only. You may
add/commit only stable behavioral acceptance tests and audit artifacts. Never fix product code, change webapp/
integrator/plan, use real provider credentials, send real push, deploy, sign a release or expose secrets.

Authority/checklist: `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`, stages M4, M5, M6 and M7. Audit the
candidate against every checkbox in those stages that belongs to `apps/mobile-shell/**`; do not close plan items or
expand into the web integration, backend, PWA, signing, store publication or physical-device stages owned by later
passes.

## Mandatory reading and blind order

1. Run `grep -n "^## \|^### " AGENTS.md`; read the global decision method, §1/§1b, §5, §9–§12 and §24 fully.
   Read §10a/§10b before any test. Read the accepted shell README, exact foundation audit, complete M4/M5/M6/M7
   authority, #1100 provider contract, server convention endpoint/storage facts and official pinned SDK docs.
2. Before reading tests, persist the kill-set below in
   `.lead/runs/mobile-native-capabilities-audit-20260909/00-blind-killset.md`. Inspect the exact committed diff only
   after the kill-set exists.
3. Classify repeatable contract behavior versus one-time Gradle/manifest/resource/artifact inspection. Do not turn
   source strings, dependency declarations, file names, UI copy/counts or manifest XML text into tests.

## Blind behavioral kill-set

1. Every plugin call from missing/about/error/untrusted/cross-brand/TEST↔production WebView URL is denied with no
   Activity, picker, file read, provider init/token or network call. Runtime/brand/surface supplied by JS cannot
   weaken the compile-time identity.
2. Jitsi accepts only exact HTTPS `meet.therapysto.ru` in production and `meet.test.therapysto.ru` in TEST; suffix,
   port, userinfo, path-as-host, cleartext, `meet.jit.si`, JaaS and arbitrary endpoint fail before SDK launch.
3. Explicit start plus granted camera/mic launches one full-screen conference with the exact opaque room/JWT;
   denied/cancelled permissions do not launch. SDK joined/terminated/error/ready-to-close become the documented
   typed events once, hangup reaches the SDK once, cleanup prevents stale duplicate events, and retry works.
4. Returning from Jitsi preserves the same WebView/notes state; no native notes/page or hidden auto-start path exists.
   Secrets/room/full endpoint never appear in application logs or saved state.
5. Camera Photo mode binds Preview+ImageCapture; Video mode rebinds Preview+VideoCapture rather than assuming three
   simultaneous use cases. Front/back, recording stop, audio permission and cancellation produce truthful typed
   outcomes; no broad storage permission is needed.
6. Gallery accepts image/video through the system picker; documents use OpenDocument with narrow MIME validation.
   Spoofed extension/MIME, cancelled or unreadable URI fails safely; descriptor contains metadata/opaque handle only,
   never bytes/base64.
7. Multipart upload with `(offset,length)` sends exactly that byte range and returns status/ETag. Retry reopens/seeks;
   non-seekable/unknown-size source copies once to native temp storage; cancellation/failure/completion closes and
   removes resources. A 2-part upload never sends the whole file twice.
8. Upload rejects cleartext, redirects, userinfo and non-allowlisted storage hosts; only exact signed headers pass,
   cookies/auth and presigned URL never enter logs. Arbitrary JS URI cannot replace the opaque selected handle.
9. Universal Push initializes idempotently with runtime project id only from a trusted call; auth token/send endpoint
   never enter the app. Availability, permission, token rotation/deletion/message/error events are typed and raw
   token/payload never logs.
10. Data-only push with valid current surface/kind/internal route creates exactly one stable Android channel
    notification; denied permission is non-secret typed state. Cross-surface/external/userinfo/protocol-relative/
    traversal routes do not notify or navigate.
11. Tap on warm/cold app routes once to exact trusted origin plus allowlisted path after bridge readiness. Android
    user channel settings override bundled defaults; message/reminder/call keep distinct stable IDs/sounds and a
    default sound change cannot mutate an already-created channel silently.
12. All four brand×environment variants expose correct capability/runtime identity and never package cross-brand
    icons/project values, signing keys, provider tokens or service JSON. Release stays non-debuggable/no-cleartext.

## Permanent tests and fault injection

Use public Kotlin policy/service/plugin boundaries. Prefer parameterized pure tests for endpoint/storage/deep-link
validation and event/state machines; Robolectric for actual Capacitor WebView gate, Activity/picker contracts,
notification channels/tap intents; a local in-process HTTP server plus fake seekable/non-seekable ContentResolver for
byte-range/cancel/redirect behavior. Mock only external SDK edges, asserting observable result/no-side-effect rather
than private calls. Do not duplicate the full URI matrix at every layer.

Temporarily inject and restore at least these faults, recording exact failed assertions:

- bypass `TrustedOriginGate` in one capability;
- accept Jitsi suffix/non-default port or launch before permission;
- leak/replay a Jitsi lifecycle event after cleanup;
- bind photo+video use cases together or turn picker cancellation into error;
- return bytes/base64 instead of metadata/handle;
- upload the whole source for each multipart part or follow a redirect;
- accept arbitrary URI/storage host/signed header;
- configure push from untrusted origin or log/expose raw token;
- accept external/cross-surface push route or double-deliver a cold-start tap;
- collapse channel ids/sounds or package a future capability as false/true incorrectly.

Every fault must be killed by a retained green test or represented by a failing acceptance test on the untouched
candidate. Restore all production mutations. Findings are only reachable M4/M5/M6/repo-rule violations.

## One-time build/artifact and live inspection

Source `/home/dev/.local/share/bcb-android/env.sh`. Run package typecheck/lint/cap sync, Gradle dependencyInsight,
targeted tests, lint/compile/assemble for all four brand×environment debug combinations and unsigned release APK/AAB
tasks. Inspect merged manifests/permissions, generated resources, provider initializers, release R8 output,
transitive React/Hermes/WebRTC conflicts, 16-KiB native-library alignment, debuggable/cleartext/signing state,
artifact sizes/licenses and secret/project/service-file scans. Visually inspect launcher/splash/camera/channel assets.

If `/dev/kvm` is usable by `dev`, start the installed `bcb-api36` emulator and perform the exact M7 scenarios with
fake/local SDK edges where real store distribution is unavailable: origin rejection/external links, Jitsi Activity
lifecycle, camera photo/video/front-back/cancel, gallery/document, multipart multi-part exact bytes/cancel, push
permission/channel/tap cold+warm. If KVM remains unavailable, record the exact owner/group/user probes and leave
M2-00a/M7-04 open; do not downgrade source/build/test verdict or falsely claim live acceptance.

Run `git diff --check`, clean-status and sensitive-log/artifact scans. Do not run full root CI; lead owns integrated
CI after all workstreams land.

## Delivery

Commit only justified tests and
`.lead/runs/mobile-native-capabilities-audit-20260909/{00-blind-killset.md,90-final-audit-report.md}` with explicit
paths, never `git add -A`; do not push. Report binary PASS/MUST FIX, kill tally, fault→failed assertion, exact
commands/SHA, artifact/live evidence and external RuStore/signing/physical-device/KVM gates. Do not finish while a
foreground build/emulator command is running; use bounded waits and stop only emulator/processes you started.
