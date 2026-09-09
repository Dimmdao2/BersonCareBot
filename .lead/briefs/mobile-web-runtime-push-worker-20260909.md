# Worker brief — #915 one web NativeRuntime and native-push lifecycle

Deliver M1-07, M3-01…M3-03 and the authenticated web-client half of M6-03/M6-09 as one coherent product stage
after the accepted Android native-capability and native-push backend candidates are present in this branch. This
stage intentionally excludes M4/Jitsi because `#1100` still owns `apps/webapp/src/shared/ui/video/**`; do not wait
for or touch that workstream. Do not write, edit, rename or delete tests; the independent auditor owns the
behavioral oracle. Do not touch Android/Kotlin/Gradle, schema/migrations, integrator/provider delivery, video/media
code, unrelated patient/doctor UI, DEV/TEST data, services or PROD.

## Mandatory reading and authority

Run `grep -n "^## \|^### " AGENTS.md`; read the global decision method, §1/§1b, §2–§5, §7, §9–§12,
§15–§17, §21–§22 and §24 completely. Read `README.md`, `docs/README.md`, server/local-dev conventions,
`docs/ORCHESTRATION_BINDINGS.md`, the complete active
`docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M1/M3/M6/M7, `apps/mobile-shell/README.md`, accepted
native/push audit evidence, existing platform/PWA/web-push module docs and every touched implementation before
changing code. Use code-search before exact `rg`.

Источник оракула — M3: one strictly typed `NativeRuntime` boundary with browser fallback; product pages never
inspect Capacitor/plugin details. Runtime facts are presentation/capability facts only and never authorize role,
organization, surface or API access.

## One runtime boundary, not a second detector

Extend the existing `shared/lib/platform.ts` plus `PlatformProvider`/hook tree. Do not add a parallel global
provider or let callers inspect `window.Capacitor`, `window.android`, user agent, application id, hostname or
native plugin objects. Before adding a helper, ask whether the existing platform provider, service-worker door or
web-push bootstrap can be parameterized. Keep `PlatformMode` (`bot|mobile|desktop`) and messenger-host detection
orthogonal.

The stable public runtime snapshot is strictly typed and browser-safe:

- `kind: 'browser' | 'therapygo_android' | 'therapysto_android'`;
- `version: string | null`;
- `capabilities: { jitsi: boolean; media: boolean; push: boolean }`;
- typed lifecycle and Universal Push adapters, each with a no-op/unavailable browser implementation. Preserve an
  extension seam for the accepted native Jitsi/DeviceMedia adapters without integrating their product UI here.

Only the adapter may register/call `ShellRuntime`, `UniversalPush` or Capacitor lifecycle APIs. It validates native
JSON at runtime, maps shell `brand` to the closed runtime kind and fails back to browser without a white screen when
a plugin is absent, rejects, returns a malformed shape or runs on an untrusted/browser page.

## PWA and service-worker integration

Route every existing PWA bypass through this boundary: `LandingPwaClientBootstrap`, `StaffPwaBootstrap`,
`registerPatientServiceWorker`, patient/staff web-push bootstraps, `PwaInstallSection`, `StaffPwaInstallSection` and
the compatible doctor-install redirect/account install surface. In native runtime:

- do not register `/sw.js`, subscribe to `beforeinstallprompt`, mark a browser PWA install or show install UI;
- do not probe/create browser PushManager/VAPID subscriptions;
- platform-admin remains excluded exactly as accepted in M1;
- browser/PWA and messenger behavior remains unchanged.

Use one service-worker registration door rather than repeating native checks. Do not delete browser file/PWA/push
fallbacks and do not turn native detection into viewport detection.

## Universal Push client lifecycle

Build one typed native-push client bootstrap over the accepted routes:

- Therapy Go uses `/api/patient/native-push`; Therapysto uses `/api/account/native-push`; validated runtime kind
  fixes route/app surface and the caller cannot select it;
- GET supplies non-secret availability/project id; only a present valid project id is passed to `configure`;
- persist one opaque installation id per installed app using the existing safest client storage convention (never
  a user id, role or org id); POST registers/rotates `{installationId, token, provider:'rustore'}`;
- token events, already-present granted permission and app resume reconcile idempotently; unchanged events do not
  storm POST and registration stops when auth is gone;
- permission is requested only by an existing explicit Push-enable action, never on mount. Existing patient/staff
  Push controls keep their public contract but select native transport instead of PushManager;
- logout through the existing single logout/sign-out door performs best-effort authenticated DELETE before session
  destruction, then plugin `revoke`; offboarding remains server-owned. Do not create a second logout component;
- tap events accept only validated `{pushSurface,notificationKind,route}` and route through Next navigation inside
  the matching app. Mismatch, external/protocol-relative/admin/cross-surface routes and malformed events are ignored.

No raw token/project id enters logs, analytics, errors or persisted app state. Browser Web Push remains the same
logical `web_push` channel and native Push adds no user-facing channel/provider toggle.

## Allowed production scope

Existing platform provider/lib/hook, one co-located native adapter/runtime module, PWA/service-worker/install
chokepoints named above, current patient/staff web-push contexts/actions as minimally needed to preserve public UI,
the existing single logout/sign-out door and directly affected module docs. No product-page copies or broad UI
redesign. No files under `shared/ui/video/**` or any live route owned by `#1100`.

## Validation and delivery

No tests. Run existing non-test checks only: webapp typecheck, scoped ESLint, PWA/surface gates, web-push
architecture gates, exact `rg 'window\.Capacitor' apps/webapp/src` inspection, `git diff --check` and targeted
production build/type checks that do not claim live device behavior. Do not run full root CI, write databases,
launch a shared dev server or alter services. Commit all and only allowed paths explicitly, never `git add -A`; do
not push. Commit message references `#915`, exact M-IDs, evidence and remaining Jitsi/DeviceMedia/device/RuStore/live
gates. Report SHA, public TS contracts, commands/results and factual blockers. Do not finish while a foreground
check is running.
