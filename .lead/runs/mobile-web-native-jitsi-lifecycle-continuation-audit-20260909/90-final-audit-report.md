# #915 NativeJitsi lifecycle continuation — final audit

**Verdict: MUST FIX.** Candidate: `770b5e750` (`fix(mobile): close native Jitsi launch ownership #915`), after original product `0616d6d2a`, independent audit/tests `4735b7009`, and rejected first correction `3b86797a9`. The product paths at the current audit head are byte-identical to `770b5e750` (`git diff --quiet 770b5e750..HEAD -- <NativeJitsiPlugin/nativeShellRuntime/VideoMeetingStage>` returned `0`).

This continuation reuses, rather than expands, the blind kill-set at `.lead/runs/mobile-web-native-jitsi-audit-20260909/00-blind-killset.md`. Authority read: `MASTER_PLAN.md` M3/M4/M7; `AGENTS.md` §§5, 9–10b, 12, 16–17, 24.

## MUST FIX — reachable lifecycle ownership loss

**M4-04/M4-05, retained kill-set item 4.** A late `CONFERENCE_TERMINATED` or `READY_TO_CLOSE` from destroyed Activity A can be emitted with B's current `conferenceId` and terminate B.

`NativeJitsiPlugin` serializes the replacement until `onActivityDestroyed(A)`, then `launchPendingAfterClose()` resets `terminalEmitted`, assigns B's id, and starts B. The LocalBroadcast receiver accepts the SDK broadcast with no per-Activity/conference identity and calls `emit(..., conferenceId)`, so an A broadcast delivered after that handoff is labelled B. The web stage correctly trusts that echoed B id and runs its existing one-time hangup path. Impact: a user already in a replacement authorized room can be returned to the specialist's existing notes/encounter hangup route by an old Activity.

The retained red oracle is `NativeJitsiPluginTest.latePriorConferenceTerminationCannotBeEmittedAsTheReplacementLaunch`. It puts B's current opaque id in the real plugin and delivers the exact terminal SDK broadcast shape that an old Activity can emit; candidate output resolves the listener instead of producing no B event. This is not a source-text assertion: it observes the public `conference` event delivered across the bridge.

## Retained kill-set result

| Original class / continuation focus | Evidence | Result |
| --- | --- | --- |
| 1. Browser/PWA and unavailable/malformed/rejecting native bridge preserve iframe; trusted capable runtime selects native | `nativeShellRuntime.unit.test.ts`, `VideoMeetingStage.ui.test.tsx`, and `JitsiMeetingRenderer.ui.test.tsx` | PASS |
| 2. Three-caller, provider-neutral authorized seam passes endpoint, room, token once | Retained stage oracle asserts exact `startNativeJitsi` payload; accumulated candidate diff has no product caller or renderer-union change | PASS |
| 3. Joined/error/terminated diagnostics and one terminal callback | Retained Java terminal-dedup tests and stage duplicate/error tests | PASS |
| 4. Retry/replacement/unmount own only their conference; late A cannot affect B | New red Java acceptance oracle above; the no-identity native broadcast is relabelled with B | **FAIL / MUST FIX** |
| 5. Specialist return, trusted-origin/validation gates, browser behavior | Retained `NativeJitsiPluginTest` trusted-origin, endpoint/room/token validation and stage iframe tests | PASS |
| Inspection kill-set | No server renderer union, second video page, Jitsi/JaaS external endpoint, secret, role/organization forge, or unrelated product mutation in `0616d6d2a..770b5e750` | PASS |

The continuation-specific forms are therefore resolved as follows:

1. Same-room retry/ordinary replacement: **FAIL** — the red oracle is the exact A→B stale-terminal fault injection.
2. Unmount/replacement while start or permission is pending: **PASS by candidate inspection** — `hangup(conferenceId)` removes only a matching `PendingPermission`/`PendingLaunch`; a callback must match its retained call before it can launch, so a cancelled callback does not start an Activity or act on the later id.
3. Unavailable retry/old shell compatibility: **PASS** — `nativeJitsiOutcome` requires an echoed id; id-less/malformed outcomes become `unavailable`, remove the listener/ownership, issue best-effort id cleanup, and render the retained iframe.

## Fault-injection record and tally

| Independent class | Injection | Assertion / result |
| --- | --- | --- |
| Native replacement lifecycle | Deliver `CONFERENCE_TERMINATED` after assigning the replacement id, exactly as the receiver sees an indistinguishable late A broadcast | `verify(listener, never()).resolve(...)` turns red on all four variants (`NeverWantedButInvoked`, `NativeJitsiPluginTest.java:297`) |
| Retained browser/native selection | Original audit mutation: force native selection in browser branch | Retained iframe construction oracle turns red (original audit report) |
| Retained unavailable fallback | Original audit mutation: turn unavailable fallback into error | Retained iframe construction oracle turns red (original audit report) |
| Retained terminal dedup | Original audit mutation: remove terminal guard | One-hangup assertion turns red (original audit report) |

**Убито 4 / непойманных 1.** The sole uncaught class is the reachable M4 lifecycle defect above; the candidate cannot receive PASS.

## Commands and validation

- `/home/dev/brain/host-orch/run-tests.sh "bash apps/mobile-shell/scripts/gradle.sh :app:testTherapygoEnvironmentTestDebugUnitTest :app:testTherapygoProductionDebugUnitTest :app:testTherapystoEnvironmentTestDebugUnitTest :app:testTherapystoProductionDebugUnitTest --continue"` — expected **FAIL**: each variant ran `NativeJitsiPluginTest` `19` tests, `1` failure, the retained red lifecycle oracle.
- `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/shared/lib/nativeShellRuntime.unit.test.ts src/shared/ui/video/JitsiMeetingRenderer.ui.test.tsx src/shared/ui/video/VideoMeetingStage.ui.test.tsx"` — **PASS**, 3 files / 39 tests.
- `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec eslint src/shared/lib/nativeShellRuntime.ts src/shared/ui/video/VideoMeetingStage.tsx src/shared/ui/video/VideoMeetingStage.ui.test.tsx && pnpm --dir apps/webapp typecheck"` — **PASS**.
- `git diff --check` — **PASS**.
- `git diff --quiet 4735b7009..HEAD -- apps/webapp/src/shared/ui/video/VideoMeetingStage.ui.test.tsx` — exit `0`: the original web acceptance oracle was not weakened.

The first direct Gradle invocation without `apps/mobile-shell/scripts/gradle.sh` is intentionally not counted: it selected the system JRE without `javac`. The documented wrapper sourced `/home/dev/.local/share/bcb-android/env.sh` and ran all required variants with the DEV JDK.

## Scope and cleanliness

Only this run directory and the one justified Java acceptance test are auditor-owned changes. No product file was mutated; the candidate product paths are clean against `770b5e750` after every audit mutation. No DB, deploy, live call, APK delivery, PROD access, or push was performed.
