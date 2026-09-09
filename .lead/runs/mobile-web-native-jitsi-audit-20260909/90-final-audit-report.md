# Final audit report — #915 native Jitsi web seam

**Verdict: MUST FIX.** Candidate audited: `0616d6d2ad228d691d8c2549caf8c1e7e6829883`
(`feat(mobile): select native Jitsi stage #915`), against its exact parent
`f14dc3ad8`. Authority: mobile plan M3/M4/M7 and the landed `#1100` video
contract/evidence in `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` and
`docs/audit/video-live-ui-final-verification-2026-09-08.md`.

## MUST FIX

1. **M4-04/M4-05 — a terminal event from the previous native room can end the
   replacement room.** `NativeJitsiPlugin` emits a `{state}` payload with no
   room/session identity. After `VideoMeetingStage` replaces room A with room B,
   Activity A's late `terminated` broadcast is delivered to B's active listener;
   it invokes B's existing `onHangup` path. The retained failing acceptance test
   is `VideoMeetingStage.ui.test.tsx:160`: it replaces `room-one` with
   `room-two`, emits the late terminal event through B's listener, and receives
   one `onHangup` call instead of zero. Impact: a specialist can be returned to
   the existing notes/encounter hangup path while already in a different,
   authorized conference. This directly violates kill-set item 4 and M4's
   ownership requirement. No product fix was made.

2. **M4-01 — candidate fails its scoped ESLint gate.**
   `apps/webapp/src/shared/ui/video/VideoMeetingStage.tsx:36-37` assigns
   callback refs during render. Scoped ESLint reports two
   `react-hooks/refs` errors ("Cannot access refs during render"). Impact:
   the candidate cannot pass the mandated webapp lint validation.

## Acceptance tests and kill-set

Added `apps/webapp/src/shared/ui/video/VideoMeetingStage.ui.test.tsx` (five
behavioral UI-stage tests; five green, one intentionally retained red finding):

| Kill-set class | Result |
| --- | --- |
| Browser/PWA renderer selected when capability is absent | PASS; mutation `useNativeJitsi = true` made the browser oracle red. Existing `nativeShellRuntime.unit.test.ts` retains malformed/absent/rejecting runtime fallback. |
| Native open receives the authorized endpoint, room reference and token | PASS at the public stage boundary. |
| Native open unavailable preserves browser renderer | PASS; temporarily changing its fallback branch to error made this oracle red. |
| Duplicate native terminal/error events map once to existing callbacks | PASS; removing terminal dedup made the one-hangup assertion red. |
| Late event after session replacement | **FAIL / MUST FIX 1**; acceptance test retained red on untouched product. |
| Specialist return path | Stage forwards the existing `onHangup`; the late-event failure proves it is incorrectly invoked for an unowned old conference. |

Kill tally: **4 passed, 2 MUST FIX (one behavioral, one lint gate), 0 unclassified.**

## Diff and architecture inspection

`git diff --name-status HEAD^ HEAD` showed exactly two candidate product paths:

- `apps/webapp/src/shared/lib/nativeShellRuntime.ts`
- `apps/webapp/src/shared/ui/video/VideoMeetingStage.tsx`

`git diff HEAD^ HEAD -- apps/webapp/src/modules/video-meetings/ports.ts` and the
three product-callers was empty: the server renderer union and product pages were
not changed. `rg -n '<VideoMeetingStage' apps/webapp/src --glob '!**/*test*'
--glob '!**/*.test.*'` found the expected three entries (doctor, patient, guest),
all using the same stage. The targeted foreign-endpoint scan over the native
adapter and video UI had no `meet.jit.si`, JaaS, or 8x8 result; its only
`external_api.js` occurrence builds the session endpoint URL. `git diff --check`
passed. No second video page, secret, server-union, backend, Android, PWA/push,
media, or provider mutation was found in the candidate diff.

## Commands and validation

- `pnpm --dir apps/webapp exec vitest run src/shared/ui/video/JitsiMeetingRenderer.ui.test.tsx src/shared/ui/video/VideoMeetingStage.ui.test.tsx` — **FAIL as intended**: 13 passed, 1 failing (late old-room terminal event).
- `pnpm --dir apps/webapp exec eslint src/shared/ui/video/VideoMeetingStage.ui.test.tsx` — PASS.
- `pnpm --dir apps/webapp exec eslint src/shared/lib/nativeShellRuntime.ts src/shared/ui/video/VideoMeetingStage.tsx src/shared/ui/video/VideoMeetingStage.ui.test.tsx` — FAIL: the two candidate `react-hooks/refs` errors above.
- `pnpm --dir apps/webapp typecheck` — FAIL independently before/after this audit because workspace declarations such as `@bersoncare/db-principal`, `@bersoncare/platform-merge`, and `@bersoncare/operator-db-schema` are unresolved in this checkout. The initial run also exposed this audit test's narrow `version: null` inference error; it was corrected, and the rerun contains no `VideoMeetingStage.ui.test.tsx` diagnostic. This broad baseline blocker is outside the permitted scope.
- `git diff --check` — PASS.

## Live blockers

No dev server, live call, database, external endpoint, APK, or PROD access was used by brief. Device/native-Activity behavior remains a later Android/TEST acceptance gate. Product code was restored after each fault injection; the only persistent paths are this report, the blind kill-set, and the acceptance test.
