# Worker brief — #915 native Jitsi at the existing video seam

Deliver M4-01/M4-04/M4-05 as one coherent web integration after both the audited NativeRuntime stage and task
`#1100` are landed in `feat/doctor-ui-rebuild`. Consume the already accepted Android `NativeJitsi` capability;
do not duplicate or rewrite it. Do not write, edit, rename or delete tests; the independent auditor owns the
behavioral oracle. Do not touch Android/Kotlin/Gradle, PWA/install/push/media, schema/migrations, backend/provider
delivery, product page copies, data/services or PROD.

## Mandatory reading and authority

Run `grep -n "^## \|^### " AGENTS.md`; read the global decision method, §1/§1b, §5, §7, §9–§12, §15–§17,
§21 and §24 completely. Read `README.md`, `docs/README.md`, server/local-dev conventions,
`docs/ORCHESTRATION_BINDINGS.md`, the complete active mobile plan
`docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M3/M4/M7, the current taskdb `#1100` plan and
final landed evidence, `apps/mobile-shell/README.md`, accepted native/runtime audits, video module docs and every
touched implementation before changing code. Use code-search before exact `rg`.

Authority boundary: `#1100` owns the browser video session and product pages. M4 adds one client renderer choice
inside the existing provider-neutral `VideoMeetingStage`; it cannot reopen `#1100`, change server authorization or
extend `VideoMeetingRenderSession.renderer`.

## One native renderer at the existing stage

Parameterize `VideoMeetingStage`; do not modify its three product callers. For `embedded_conference`, browser/PWA
keeps the landed `JitsiMeetingRenderer`. A trusted runtime with Jitsi capability calls the accepted `NativeJitsi`
adapter with the exact same `endpoint`, `roomReference` and `accessToken`, only after the existing explicit user
join has produced an authorized render session. No native video page, parallel session fetch or Jitsi logic is
added to product routes/pages.

Render only the smallest neutral connecting/error/retry state inside the existing stage while the full-screen
Activity owns the conference. Map native `joined`, `terminated` and `error` into the existing `onDiagnostic` and
`onHangup` contract exactly once per terminal conference. Retry uses the accepted plugin retry contract and never
fetches, logs or copies a token. Unmount/session replacement removes listeners and hangs up only the owned active
conference; a late event from an old session cannot affect a new room.

Therapy Go and Therapysto both use the same self-hosted endpoint supplied by the authorized render session. Do not
introduce `meet.jit.si`, JaaS, external telemetry or bundled issuer/secret/config. Runtime capability selects only
the client renderer and never authorizes a role, room, org or endpoint.

Specialists return from native hangup to the unchanged encounter/notes surface. Preserve the provider-neutral seam
for future `peer_connection`: do not make product pages or the server union know about `NativeJitsi`.

## Allowed production scope

`apps/webapp/src/shared/ui/video/VideoMeetingStage.tsx`, at most one co-located native renderer/controller,
the already accepted NativeRuntime public adapter surface only if a narrowly required type/export is missing, and
directly affected video module docs. No edits to the three product page callers unless the landed public contract
cannot be consumed without them; if that happens, stop with the exact incompatibility rather than expanding scope.

## Validation and delivery

No tests. Run existing non-test checks only: webapp typecheck, scoped ESLint, exact product-caller and external-Jitsi
endpoint inspections, video architecture checks and `git diff --check`. Do not run full root CI, databases, shared
dev services or live calls. Commit all and only allowed paths explicitly, never `git add -A`; do not push. Commit
message references `#915`, M4-01/M4-04/M4-05 and `#1100`. Report SHA, public contract, commands/results and factual
device/live blockers. Do not finish while a foreground check is running.
