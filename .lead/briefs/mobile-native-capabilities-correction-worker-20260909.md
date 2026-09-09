# Worker brief — #915 one native-capability correction after independent audit

Fix the complete rejected `apps/mobile-shell/**` native-capabilities candidate in one coherent product pass. Start
from independent audit commit `657a8b7d7`; read and close all four MUST FIX findings in
`.lead/runs/mobile-native-capabilities-audit-20260909/90-final-audit-report.md` plus the lead acceptance gaps below.
Do not write, edit, rename or delete tests; the retained auditor tests are the oracle. Do not touch webapp,
integrator, PWA, schema/migrations, data/services, TEST/PROD or release signing.

## Mandatory reading and authority

Run `grep -n "^## \\|^### " AGENTS.md`; read the global decision method, §1/§1b, §5, §7, §9–§12 and §24
fully. Read `README.md`, `docs/README.md`, server/local-dev conventions, `docs/ORCHESTRATION_BINDINGS.md`, the
complete `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M4/M5/M6/M7, `apps/mobile-shell/README.md`, the
exact foundation/native product diffs and the full audit report/tests before changing code. Read the official
RuStore Universal Push SDK initialization/receive contract and pinned-version history:

- `https://www.rustore.ru/help/sdk/general-push-notifications/kotlin/7-0-0`
- `https://www.rustore.ru/help/sdk/general-push-notifications/kotlin/history`

Источник оракула — `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`: «Android notification permission и
стабильные каналы реализованы». A data-only message must therefore be handled when Android starts the
application for delivery, not only after a WebView loads and calls a Capacitor plugin.

Apply §5 «Один общий проход»: parameterize the existing plugin/runtime rather than create a parallel Push
implementation, second notification renderer, second camera, second Jitsi page or second uploader.

## Independent audit findings — all mandatory

1. `validSurface` accepts only `BuildConfig.SHELL_BRAND`, never the sibling brand.
2. `validRoute` rejects literal dot segments and uses exact-root-or-root-slash semantics, so
   `/app/patientized`, `/app/doctorized`, raw/encoded/backslash traversal, protocol-relative and external routes
   fail before notification/tap; keep the compiled brand as the only surface input.
3. The selected document's actual `ContentResolver` MIME is checked against the same closed allowlist used to
   request `ACTION_OPEN_DOCUMENT`; an arbitrary non-null document MIME is not enough.
4. `CameraCaptureActivity.complete()` returns URI and MIME together with `setDataAndType`, so a successful photo or
   video is not converted into a cancellation.

## Lead acceptance gaps — same native surface, close in this pass

### Universal Push cold process and branding

The official SDK contract initializes from `Application.onCreate()` and installs receive/token/error callbacks
after initialization. The current plugin does both only after trusted JS calls `configure`, so after the process is
killed a data-only Push cannot be rendered and token/error events are lost until the WebView opens.

Keep one shared native Push runtime/service used by both the `Application` and Capacitor plugin:

- on first authenticated `configure({projectId})`, validate, persist only the non-secret project id in private app
  preferences, initialize idempotently and install callbacks/channels;
- a custom `Application` declared in the manifest reads that persisted project id on every process start and
  initializes/install callbacks before data delivery; no service token/send endpoint enters the bundle;
- the runtime validates payload, renders a generic correctly branded notification while no plugin listener exists,
  retains only one safe validated tap/event for later bridge delivery and never persists a raw push token;
- the plugin delegates configure/state/permission/revoke/listener delivery to that same runtime; no second SDK
  init/listener/notification code remains beside it;
- cold/warm message and tap are delivered once, sibling brand and malformed route never notify, and notification
  title/identity comes from the current flavor/app label (Therapysto must not display `Therapy Go`);
- `DefaultLogger` or any SDK logger must not expose token/payload/project details to logcat; use a no-secret/no-op
  logger if the SDK requires one.

Project id is non-secret and may be persisted; auth/service token is server-only. Logout `revoke` deletes provider
tokens but does not erase the project id needed for future process bootstrap. If no project id has ever been
configured, Application startup is a safe no-op; first install cannot have a registered token yet.

### Jitsi lifecycle

- Treat `CONFERENCE_TERMINATED` and `READY_TO_CLOSE` as two possible signals for one terminal conference. Emit one
  terminal event total; if the first terminal broadcast carries an error, emit one `error` event instead of an
  immediate second `terminated` that would close the web stage.
- Reset the guard only on a new launch. Remove stale broadcasts/listeners on destroy. Make hangup idempotent for the
  owned active conference.
- `retry()` rechecks camera/microphone permission after Android settings changes and uses a retry-specific
  permission callback before launch; it never launches after denial or without a terminal session.

### Native range upload outcome

- `DeviceMedia.upload` sends exactly the requested range as today, but resolves `outcome:'uploaded'` only for HTTP
  2xx. Redirect/401/403/404/409/429/5xx and missing required multipart ETag resolve a typed `upload_failed` outcome
  with non-secret status; they must never be passed as a successful part to complete/finalize.
- Cancellation cannot disconnect another completed request or be overwritten by a late request. Keep the present
  one-at-a-time contract if the JS adapter serializes parts; otherwise key active connections by an opaque upload
  id. Do not expose presigned URL/headers in events, errors or logs.

## Validation and delivery

Do not modify auditor tests. Make their existing four red failures green, and run all four brand×environment native
unit-test variants. Add no test just to satisfy a missing assertion: report any uncovered runtime requirement so the
independent confirmation can add it. Source `/home/dev/.local/share/bcb-android/env.sh`; run mobile-shell sync,
typecheck, lint, targeted Gradle tests and compile/assemble for all four debug variants. Run release compile/R8 only
if changed Application/plugin reachability creates a release-only risk; do not repeat the already-green full
release APK/AAB matrix without that risk. Inspect merged manifest/Application/exported state, dependency version,
secret/log scan, `git diff --check` and clean status. No full root CI, emulator claim, real Push or credentials.

Commit all and only allowed production/README/manifest files with explicit paths, never `git add -A`; do not push.
Commit message references `#915`, M4-02/M5-02/M5-03/M5-04/M6-04/M6-09/M6-10, retained audit evidence and the open
KVM/RuStore/signing/device gates. Report SHA, changed public contract, exact commands/results and factual blockers.
Do not finish while a foreground command is running.
