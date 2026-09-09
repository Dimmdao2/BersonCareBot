# Worker brief — #915 close the NativeJitsi ownership lifecycle

## Authority and scope

- Continue only in `/home/dev/dev-projects/bcb-wt-mobile-web-native-jitsi-20260909` on `wt/mobile-web-native-jitsi-20260909`; this is the closing same-branch product pass for the existing independent finding.
- Before every action follow the heading-map gate and read the relevant `AGENTS.md` §5, §9–§10b, §12 and §24 plus mobile plan M3/M4/M7, the original audit report, retained `VideoMeetingStage.ui.test.tsx`, and first correction `3b86797a9`.
- Product code/contract documentation only. Do not edit or add tests, audit artifacts, plans, taskdb, queue, DB, deploy, unrelated UI or product callers. Do not push.

## Exact remaining failure class

The first correction is not accepted yet. Close all three reachable forms of the same native-conference ownership lifecycle, without timing assumptions:

1. **Same-room retry/replacement:** URL equality is not a per-launch identity. If launch A and launch B use the same endpoint/room, a late A terminal/`READY_TO_CLOSE` must never be tagged as or delivered to B. Use a real lifecycle boundary (for example serialize replacement/retry until the previous Activity has actually closed, while preserving a per-launch opaque id); do not claim URL alone uniquely identifies an Activity.
2. **Unmount while start is pending:** after `startNativeJitsi` has been requested, leaving/replacing the stage before its promise callback runs must not leave a launched Activity alive. Cleanup must target/cancel the launch it initiated and must not hang up a later replacement conference.
3. **Retry degrades to browser:** when retry returns unavailable, remove/deactivate the native listener and ownership before rendering the iframe, so a late native event cannot drive browser-stage callbacks.

Preserve exact endpoint/room/token validation, trusted-origin gate, one neutral web stage and three unchanged callers, browser/PWA iframe behavior, duplicate-terminal protection, error/diagnostic mapping, no secret logging, and no new server renderer value. Old installed shells lacking the strengthened event contract must fail safely to browser behavior rather than retain ambiguous native ownership.

## Validation and delivery

- Keep the retained auditor test unmodified and green.
- Run the existing NativeJitsi Java tests for the affected flavor(s) under `/home/dev/brain/host-orch/run-tests.sh`; because this pass changes the lifecycle state machine, exercise the full existing `NativeJitsiPluginTest` matrix that is already present, without authoring tests.
- Run the retained Jitsi web suites, scoped ESLint, webapp typecheck (building only existing workspace declarations if needed), and `git diff --check`.
- Inspect the full accumulated product diff from `0616d6d2a^` and explicitly explain why same-room retry, pending-start cleanup and retry fallback are now bounded by ownership rather than timing.
- Commit all product changes explicitly with `#915`, why/evidence/M4/not-done. End with SHA and exact validation results.
