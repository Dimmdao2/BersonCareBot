# Same-branch correction brief — #1100 post-fix audit findings and lead acceptance

Work in the existing clean clone `/home/dev/dev-projects/bcb-wt-video-live-ui-correction-20260908`, branch
`wt/video-live-ui-correction-20260908`, current audit commit `4b431a39e`; product candidate under correction is
`81bf92e22`. Read `AGENTS.md` heading map and full applicable §5, §10/10a/10b, §16, §17, §24; read
`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` VM-06, VM-10..12, ACC-07..08, UI-08..10 and
`docs/audit/video-live-ui-postfix-2026-09-08.md`.

This is one coherent correction pass. Do not write, delete or weaken tests. The three red auditor tests are fixed
handoff oracles; make them green by correcting production. Do not edit plan/taskdb/audit artifacts and do not push.

## Required product corrections

1. **VM-12 closed logging:** `recordDiagnostic` must construct the logger payload field-by-field from the allowed
   vocabulary only. Runtime excess properties from route spreads must never pass through. Keep meeting ownership
   authorization fail-closed. Prefer passing an explicit diagnostic object from the route rather than the shared
   rotate/end lifecycle object.
2. **VM-12 actual pinned events:** replace the dead `conferenceError` listener with the real pinned
   `errorOccurred`; safely map its payload to the closed error class without logging raw details. Wire actual
   `p2pStatusChanged { isP2p }` to the allowed provider-neutral `p2p|relay` status, and supported camera/mic failure
   events to `media` if this can be done through the same existing diagnostic callback. Keep reporting fire-and-
   forget and stable across note/aside re-renders; no new endpoint/store/analytics path.
3. **UI-08 serialization:** Play during the in-flight initial prepare must not start a concurrent POST. Serialize the
   single existing create-or-resume path: after an in-flight prepare settles, Play still obtains fresh join-material
   by a subsequent call and mounts exactly one adapter. Guard repeated Play synchronously; failures remain retryable
   and there is no background loop.
4. **VM-06/VM-11 pinned config correctness:** inspect the actual `stable-11146-2` app bundle/config source before
   editing. `hide-self-view` is a participant/settings action string, not proven to be a valid `toolbarButtons` id;
   do **not** blindly add it to toolbar allowlists. Fix the real config contract instead:
   - use the actual subject-hiding key (`hideConferenceSubject` in the pinned config), not an invented key;
   - make supported device selection and hide/show-self-view reachable through Jitsi's built-in settings/participant
     UI (for the pinned build this includes the applicable `SETTINGS_SECTIONS` and self-view-settings flags);
   - make the allowed virtual-background action genuinely enabled rather than simultaneously disabled by legacy
     interface config;
   - disable keyboard shortcuts and feature/config entry points for VM-11-forbidden chat, participants/invite,
     raise-hand/reactions/subtitles/stats UI, recording/livestream, whiteboard/Etherpad, shared video and separate
     computer-audio where the pinned supported config exposes such switches. Keep screen share allowed.
   Keep one built-in Jitsi toolbar, no iframe DOM, no second `getUserMedia`, no custom product toolbar.
5. **UI-10 usable stage:** the canonical patient shell/tabs must stay. Reuse its existing full-height/layout
   primitives so desktop and mobile stage/iframe have real usable height instead of collapsing to a 320px floor;
   avoid guessed viewport arithmetic. Preserve access to the notes/encounter panel and shell navigation.
6. **UI-10 one local image:** establish from pinned Jitsi source whether stock config can both start with a single
   local rendering before the patient arrives and retain a built-in hide/show-self-view action. Implement only a
   supported config seam. If the pinned build cannot satisfy both simultaneously without product toolbar, iframe DOM
   access, bundle fork or remount, do not fake it; report the exact incompatible config selectors/behavior as the
   remaining owner question so the lead can choose the documented priority.

## Acceptance

- Run the same 5-file 27-test set through `/home/dev/brain/host-orch/run-tests.sh`; all three red handoff tests and
  the prior 24 must be green.
- Run changed-file ESLint, syntax-parse both Jitsi config fragments, and `git diff --check`.
- Inspect the actual pinned bundle for every event/button/config name used; record exact commands/results in your
  final report, not in a new permanent test.
- No full CI. No server apply/restart. Do not finish while a foreground command is running.
- Explicitly stage only production/config files, commit with `#1100`, report SHA, changed paths, commands/results,
  and any precisely proven stock-Jitsi limitation. Working tree must be clean.
