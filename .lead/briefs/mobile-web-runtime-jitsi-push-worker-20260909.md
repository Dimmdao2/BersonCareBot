# Worker brief — #915 one web NativeRuntime with native Jitsi and push

Deliver M1-07, M3-01…M3-03, M4-01/M4-04/M4-05 and the authenticated web-client half of M6-03/M6-09 as one
coherent product stage after the accepted PWA identities, Android native-capability candidate and push-backend
candidate are present in this branch. Do not write, edit, rename or delete tests; the independent auditor owns the
behavioral oracle. Do not touch Android/Kotlin/Gradle, schema/migrations, integrator/provider delivery, media upload
or media picker code, unrelated patient/doctor UI, DEV/TEST data, services or PROD.

## Mandatory reading and authority

Run `grep -n "^## \|^### " AGENTS.md`; read the global decision method, §1/§1b, §2–§5, §7, §9–§12,
§15–§17, §21–§22 and §24 completely. Read `README.md`, `docs/README.md`, server/local-dev conventions,
`docs/ORCHESTRATION_BINDINGS.md`, the complete active
`docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M1/M3/M4/M6/M7, `apps/mobile-shell/README.md`, accepted
native audit evidence, accepted push-backend audit evidence, existing platform/PWA/web-push/video module docs and
every touched implementation before changing code. Use code-search before exact `rg`.

Источник оракула — `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`: «Есть один строго типизированный
`NativeRuntime` boundary с browser fallback и Capacitor adapter; product pages не читают `window.Capacitor` и не
импортируют Kotlin/plugin details напрямую». The same boundary must select browser/native behavior without copying
pages, role/org logic, push business rules or the video session contract.

## One runtime boundary, not a second platform detector

Extend the existing `shared/lib/platform.ts` + `PlatformProvider`/hook tree. Do not add a parallel global provider
or let callers inspect `window.Capacitor`, `window.android`, user agent, application id, hostname or native plugin
objects. Before adding a helper, ask whether the existing platform provider/service-worker door/video stage can be
parameterized instead. Keep `PlatformMode` (`bot|mobile|desktop`) and messenger-host detection orthogonal.

The stable public runtime snapshot is strictly typed and initially browser-safe:

- `kind: 'browser' | 'therapygo_android' | 'therapysto_android'`;
- `version: string | null`;
- `capabilities: { jitsi: boolean; media: boolean; push: boolean }`;
- typed adapters for lifecycle, native Jitsi and Universal Push, each a no-op/unavailable browser implementation.

Only the adapter may register/call `ShellRuntime`, `NativeJitsi`, `UniversalPush` or Capacitor lifecycle APIs. It
validates the native JSON at runtime, maps shell `brand` to the closed runtime kind and fails back to browser without
a white screen when a plugin is absent, rejects, returns a malformed shape or runs on an untrusted/browser page.
Runtime facts are presentation/capability facts only and never authorize a role, organization, surface or API.

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

## Native Jitsi at the existing provider-neutral stage

Parameterize `VideoMeetingStage`; do not modify the server `VideoMeetingRenderSession.renderer` union or any of its
three product callers. For `embedded_conference`, browser/PWA keeps `JitsiMeetingRenderer`. A runtime with Jitsi
capability calls the accepted `NativeJitsi` adapter with the same `endpoint`, `roomReference`, `accessToken` only
after the existing user-initiated join has produced the session. It renders a small neutral connecting/error/retry
state in the existing stage while the full-screen Activity owns the conference.

Map native `joined/terminated/error` into the existing `onDiagnostic` and `onHangup` contract exactly once per
terminal conference. Retry uses the plugin retry contract and never fetches/logs/copies a token. Unmount/session
replacement removes listeners and hangs up only the owned active native conference. Browser renderer and return to
the unchanged specialist notes/encounter screen must remain intact. Do not add a native video page or Jitsi logic
to product pages.

## Universal Push client lifecycle

Build one typed native-push client bootstrap over the accepted routes:

- Therapy Go uses `/api/patient/native-push`; Therapysto uses `/api/account/native-push`; runtime kind fixes the
  route/app surface and caller cannot select it;
- GET supplies the non-secret project id/status; only a present valid project id is passed to `configure`;
- persist one opaque installation id per installed app using the existing safest client storage convention (never
  a user id, role or org id); POST registers/rotates `{installationId, token, provider:'rustore'}`;
- token events, already-present granted permission and app resume reconcile idempotently with the authenticated
  route; no repeated POST storm and no registration after auth is gone;
- notification permission is requested only from an existing explicit Push enable action, never on mount. Existing
  patient/staff Push controls keep their public contract but select the native transport instead of PushManager;
- logout through the existing single logout/sign-out door performs best-effort authenticated DELETE before session
  destruction, then plugin `revoke`; offboarding remains server-owned. Do not create a second logout component;
- tap events accept only the already validated native `{pushSurface,notificationKind,route}` shape and route through Next navigation
  inside the matching app surface. A mismatch, external URL, protocol-relative URL, admin/account cross-surface
  route or malformed event is ignored fail-closed.

No raw token/project id/Jitsi token enters logs, analytics, errors or persisted app state. Browser Web Push remains
the same logical `web_push` channel and native Push does not add a new user-facing channel/provider toggle.

## Allowed production scope

Existing platform provider/lib/hook, one co-located native adapter/runtime module, PWA/service-worker/install
chokepoints named above, current patient/staff web-push contexts/actions as minimally needed to preserve their public
UI contract, the existing single logout/sign-out door, `shared/ui/video/VideoMeetingStage.tsx` plus at most one
co-located native renderer, and directly affected module docs. No page copies or broad UI redesign.

## Validation and delivery

No tests. Run existing non-test checks only: webapp typecheck, scoped ESLint, PWA/surface gates, web-push
architecture gates, `rg 'window\.Capacitor' apps/webapp/src` inspection, `git diff --check` and targeted production
build/type checks that do not claim live device behavior. Do not run full root CI, write databases, launch a shared
dev server or alter services. Commit all and only allowed paths explicitly, never `git add -A`; do not push. Commit
message references `#915`, exact M-IDs, evidence and remaining DeviceMedia/device/RuStore/live gates. Report SHA,
public TS contracts, commands/results and factual blockers. Do not finish while a foreground check is running.
