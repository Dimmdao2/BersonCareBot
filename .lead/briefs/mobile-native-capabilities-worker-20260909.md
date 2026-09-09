# Worker brief — #915 Android native Jitsi, DeviceMedia and Universal Push capabilities

Deliver the native half of M4/M5/M6 as one coherent extension of the accepted shared Capacitor shell. This is
product code through the repo port. Do not write, modify, rename, or delete tests; an independent `auditor-live`
owns behavioral tests. Do not touch webapp/integrator/schema/migrations, `VideoMeetingStage` or any #1100 live page,
PWA/install code, TEST/PROD runtime, provider accounts, real credentials or release signing material.

## Mandatory reading and measured dependencies

1. Run `grep -n "^## \|^### " AGENTS.md`; read the global decision method, §1/§1b, §5, §7, §9–§12 and §24
   completely. Read `README.md`, `docs/README.md`, `docs/ARCHITECTURE/SERVER CONVENTIONS.md`,
   `docs/ORCHESTRATION_BINDINGS.md`, `/home/dev/brain/docs/MODEL_TIERS.md`, the accepted
   `apps/mobile-shell/README.md`, Gradle/flavor/runtime/navigation/origin code and every local module doc.
2. Read the complete active `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`, especially M4-02/03,
   M5-02/03/04 and M6-04/10 plus all M2 origin/security requirements. Read #1100 only for its provider-neutral
   Jitsi session contract and canonical TEST endpoint; do not change its files.
3. Re-run and record primary-source version commands before pinning. The read-only research on 2026-09-09 measured:
   Capacitor `8.5.1`; Jitsi Maven stable `org.jitsi.react:jitsi-meet-sdk:13.1.1`; RuStore Universal Push stable
   `7.4.1`; CameraX stable `1.6.2`. If current stable differs, assess compatibility with Capacitor 8/JDK21/SDK36
   and record the exact command instead of silently floating a version.

Источник оракула — `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`: «Browser использует существующий
iframe renderer; доверенный Android runtime открывает Jitsi Android SDK на том же `endpoint`, `roomReference` и
`accessToken`.» Native code is an adapter for the existing remote page, never a second meeting/media/notification
product.

## One bridge security boundary

Extend the foundation's existing Capacitor plugin registration, compile-time flavor configuration,
`NavigationPolicy` and `TrustedOriginGate`; do not add a second origin check or custom raw WebView. Every method and
event must fail closed unless the current main-frame URL is the exact trusted platform HTTPS origin for that build.
Never trust runtime/brand/surface values supplied by JavaScript. Reject calls from error/about/local/untrusted pages.
Never log full URLs, query/fragments, Jitsi endpoint/room/JWT, raw push payload/token/project id, content URI,
filename or presigned URL.

Define one stable typed JSON contract consumed by the later web `NativeRuntime`/`DeviceMedia` adapters. Use
Capacitor 8 public plugin APIs (`@CapacitorPlugin`, `@PluginMethod`, permission/activity callbacks,
`notifyListeners`), register plugins before `super.onCreate`, and preserve `appRestoredResult` behavior after an
OS-killed picker/camera Activity. Do not marshal `byte[]`, base64 or whole files over the bridge. Update runtime-info
capability flags only when each compiled plugin path is actually present.

## Native Jitsi — M4-02/M4-03

Pin Jitsi SDK from its official Maven repository and use the full-screen `JitsiMeetActivity`. Validate the endpoint
against an exact compile-time allowlist: production `https://meet.therapysto.ru`, TEST
`https://meet.test.therapysto.ru`; reject all other scheme/host/port/userinfo/path tricks. Treat `roomReference` as
an opaque validated room id, never a URL. Build options only from `{endpoint,roomReference,accessToken}` and disable
welcome page plus external analytics/recording/livestream/invite/calendar/third-party integrations. Neither
`meet.jit.si` nor JaaS is allowed.

Request CAMERA/RECORD_AUDIO only on explicit user call start. Translate Jitsi's current LocalBroadcastManager
conference lifecycle (`CONFERENCE_JOINED`, `CONFERENCE_TERMINATED`, `READY_TO_CLOSE` and actual error data) into
typed joined/terminated/error events. Hangup uses the SDK broadcast helper; cleanup/unregister is deterministic;
retry starts the same caller-supplied session after a terminal event. Returning from the Activity restores the
existing WebView/notes page without reload or a native notes screen. Jitsi launch has no Activity result—do not fake
one. Verify the transitive React/Hermes/WebRTC graph, manifest merger, release R8 and 16-KiB native-library page
alignment rather than forcing an arbitrary latest OkHttp version.

## DeviceMedia and streaming upload — M5-02/M5-03/M5-04

Pin one CameraX BOM/version family and implement a simple native camera Activity with Preview plus one use-case at
a time. Photo mode binds Preview+ImageCapture; Video mode rebinds Preview+VideoCapture/Recorder. Provide in-camera
Photo/Video toggle, front/back selector, start/stop, explicit audio permission for video and cancellation as a
typed cancelled outcome—not an error. Store only app-private temporary files/content URIs; request no broad storage
permission.

Gallery uses Android Photo Picker `PickVisualMedia(ImageAndVideo)` with system fallback; documents use
`OpenDocument`/CATEGORY_OPENABLE and exact MIME allowlists supplied from the closed web contract. Validate MIME from
ContentResolver, return display name, exact size and optional extracted video duration as metadata only, and use
persistable URI permission only when restart survival requires it. Server multipart init needs exact size before the
first part URL: if the provider reports unknown size or is non-seekable, materialize it once into app-private
seekable storage during handle preparation, then return the measured size. For video, `durationSeconds` comes from
`MediaMetadataRetriever`; a destination that requires duration gets a typed metadata failure instead of a guess.
Return one descriptor `{handle,mimeType,displayName,sizeBytes,durationSeconds?,source,kind}`; do not expose the
content URI to JavaScript. The opaque handle, not arbitrary JavaScript URI, authorizes subsequent upload.
Release/cancel removes temporary files and handle state.

Implement native streaming of one exact multipart range to a server-authorized presigned HTTPS URL. Each call takes
an opaque selected handle plus `{offset,length,presignedUrl,headers}` and returns bounded HTTP status/ETag. Reopen and
seek for every retry; write exactly `length`, never the whole source for every part. Use ParcelFileDescriptor/
FileChannel when seekable; any non-seekable/unknown-size source has already been copied once during handle
preparation, never lazily after server init. Delete app-private material on release or terminal completion/cancel/
failure. Cancellation closes the stream/network call.

The upload transport accepts only exact HTTPS object-storage hosts used by the product: configure separate
compile-time allowlists for TEST/production from the documented Selectel/Yandex/TEST endpoints, reject userinfo,
cleartext, redirects and any host outside the list, send no cookies/auth headers, and forward only the exact
server-signed upload headers needed by S3 multipart. Never log the URL/signature. This plugin does not presign,
choose bucket/policy, confirm media metadata or call a new backend: the web adapter remains responsible for the
existing authorized begin/part-url/complete/failure flow.

## RuStore Universal Push native adapter — M6-04/M6-10

Integrate `ru.rustore.sdk:universalpush` plus `universalrustore` directly; do not add a temporary direct-RuStore
implementation and do not add FCM/HMS artifacts now. Keep the typed provider contract extensible without changing
method/event shapes later. Project id is obtained at runtime from the authenticated same-origin backend and passed
to a gated `configure` call; it is not a Gradle/env/app-bundle constant. Auth token and server send endpoint never
enter the app. Initialization is idempotent; expose typed availability, permission, current/new token, deleted-
message/message/error state without logging raw values. Logout/revoke deletes the provider token when available and
always emits a non-secret local state.

For data-only incoming payloads, validate fixed surface, bounded kind and same-surface allowlisted relative cabinet
route before showing a local notification. Create stable Android 8+ channels for message, reminder and call;
Android 13+ permission is requested in context and denied is a typed result. Android channel/user settings always
win. Bundle three deterministic, restrained, copyright-free generated tones (source/generator committed) and assign
one per stable channel; because sound is immutable after channel creation, document that a future default change
requires a new versioned channel id. Notification tap starts/reuses MainActivity with typed extras and reaches only
the exact trusted origin plus validated route; cold-start taps are delivered once after bridge readiness.

## Dependency/license/build requirements

Record primary official sources and licenses: Capacitor MIT, Jitsi Apache-2.0/self-hosted (not JaaS), AndroidX,
RuStore SDK agreement. Do not claim RuStore SDK is open source. Keep repositories pinned and scoped. Do not package
credential/service JSON, keystore or project token. Update README with setup, known distributor/console/signature
requirements, method/event DTOs, artifact size impact and external gates.

## Validation and delivery

No tests. Source `/home/dev/.local/share/bcb-android/env.sh`; run package typecheck/lint/cap sync and Gradle
dependencyInsight, compile/lint/assemble for all four brand×environment debug combinations plus unsigned release
APK/AAB tasks, in the foreground. Inspect merged manifests, runtime permissions, duplicate native libraries, release
cleartext/debuggable state, 16-KiB alignment, APK/AAB dependency/license contents and secret/URL/resource scans.
Emulator/device acceptance belongs to the independent auditor; do not claim it while KVM/physical-device gates are
unavailable. Run `git diff --check` and leave no build/local SDK artifacts tracked.

Commit all and only `apps/mobile-shell/**` plus strictly necessary root lockfile/workspace dependency changes with
explicit paths, never `git add -A`; do not push. Reference `#915`, name exact M items and state web adapter/live
device/store gates still open. Report commit SHA, exact commands/results, dependency versions, artifact paths/sizes,
contract methods/events and any factual blocker. Do not finish while a foreground build is running.
