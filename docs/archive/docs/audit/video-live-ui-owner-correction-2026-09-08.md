# Live UI owner-correction acceptance — #1100 — auditor-live

Base commit audited: `40320989d15b60c76cced005dc02b90cb4ce09e7` (`wt/video-live-ui-correction-20260908`).
Authority: `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` — VM-06, VM-10..VM-12, ACC-07..ACC-08, UI-08..UI-10, NOTE-08.
Brief: `.lead/briefs/video-live-ui-acceptance-auditor-20260908.md`.

## Verdict: **MUST FIX** — owner-correction is not implemented in production yet

None of VM-06, VM-10, VM-11 (compact menu — not built), VM-12, ACC-07, ACC-08, UI-08, UI-09, UI-10 are
implemented in `apps/webapp/src` as of the audited commit; all are still unchecked `- [ ]` in the plan. This
audit did **not** change production code (per brief scope). It wrote/repaired the acceptance tests that name
the required behavior, proved each one is a real oracle by fault injection (temporary, reverted), and leaves
the currently-red ones as the fixed handoff for the implementer, per `AGENTS.md` §24.4/§24.5.

Production/config diff after this audit: **none** (`git status` shows only test files + this artifact).

## Kill-set — authority-derived, composed before reading existing tests

| # | Class (from brief) | Oracle line | Verdict |
|---|---|---|---|
| 1 | Play gates the adapter mount; double-click guard; prepare-error is retryable, no bg loop | UI-08 | **RED** (2 new tests) / green safety-net (1 new test) |
| 2 | `external_api.js` error → immediate retryable failure with a working Повторить action; slow load ≠ hard failure | VM-10 | **RED** (2 new tests) |
| 3 | Play after >10min pause uses fresh join-material, not a stale prepare JWT | UI-08 | not testable yet — no Play/second-route wiring exists to point the test at (see Findings) |
| 4a | `createOrResume`: resume never rotates invite, `guestUrl=null` on resume | ACC-08 | **RED** (existing-behavior fault caught) |
| 4b | Explicit `rotateInvite` follows the same ACC-07 notification contract | ACC-08 | **RED** |
| 4c | Full notification dedup must not report `queued` | ACC-07 | **RED** (real, independent bug — see Findings) |
| 4d | Doctor route surfaces the safe `notification` status | ACC-07 | **RED** (route drops `notification` entirely) |
| 5 | NOTE-08 regression guard (autosave/tab-switch doesn't dispose the conference) | NOTE-08 | already accepted, unmodified, still **GREEN** — not re-audited (§24.5, no new surface) |
| 6 | Diagnostic ingest: doctor-only, closed vocabulary | VM-12 | **no route/module exists** — named blocker, not testable without inventing an API shape (see Findings, OWNER QUESTION) |
| 7 | Source/visual only: patient card tabs, iframe/panel height, self-view, hidden subject, mobile camera-flip | UI-06/UI-09/UI-10 | see Findings — **not tested**, inspected only |
| 8 | Implementation reuses existing seams, no second navigation, no Jitsi API leak | UI-08/09/VM-07 | inspected — no leak found; UI-09 reuse is **absent** (Finding) |

## Fault injection (proves the green/new tests are real oracles, all reverted)

1. **Background retry loop** (`DoctorLiveMeetingClient.tsx` prepare effect): added a 50ms `setInterval` re-POST.
   `gives a retryable state without a background retry loop…` went from 1/1 pass to `expected 1, got 7` calls.
   Reverted via `git checkout`; `git status` confirms clean.
2. **Skip invite issuance on create** (`service.ts` `createOrResume`): stubbed `rotateInvite`'s store call to a
   no-op. `still rotates the invite exactly once when a new meeting is created` went from pass to
   `expected 1, got 0` calls. Reverted via `git checkout`; `git status` confirms clean.
3. The remaining new tests (VM-10 retry button, VM-10 arbitrary deadline, ACC-08 resume/rotate, ACC-07 dedup,
   ACC-07 route surfacing) are red on the **unmodified** current implementation — a failing acceptance test on
   the real implementation is its own fault-injection proof (§24.5); no additional injection performed for
   these per canon (no double proof needed).

No production/config file differs from `40320989d` after the injections above — confirmed by `git status`.

## Capability census — pinned `stable-11146-2` `external_api.js`

Measured against the live `meet.test.bersoncare.ru` bundle (direct HTTPS from this box reached it; no
`--resolve` fallback was needed):

```
curl -s -o /tmp/external_api.js -w 'http_code=%{http_code} size=%{size_download}\n' \
  --max-time 10 https://meet.test.bersoncare.ru/external_api.js
# http_code=200 size=98477
```

Relevant command ids extracted from the minified bundle (`commands:` map, `events:` map):

- **Camera-flip (mobile front/back, VM-06):** `toggleCamera` → wire id **`toggle-camera`**. This is distinct
  from `toggleVideo`/`toggle-video` (mute/unmute) — confirmed the two are separate commands in the same map.
- **Screen share (desktop, VM-06):** `toggleShareScreen` → wire id **`toggle-share-screen`**; the toolbar
  button id accepted by `TOOLBAR_BUTTONS`/`config.toolbarButtons` for the same feature is **`desktop`**.
- **Forbidden-surface commands present in the bundle (VM-11 — must stay off the allow-list):** `toggle-chat`,
  `toggle-participants-pane`, `toggle-raise-hand`, `toggle-subtitles`, `start-recording`/`stop-recording`,
  `toggle-whiteboard`, `start-share-video`/`stop-share-video` (shared video), `toggle-tile-view`,
  `toggle-virtual-background` (allowed as a compact-menu item per VM-06, not the main panel).
- **Events used by the current adapter:** `video-ready-to-close` → `readyToClose` (already wired). Available
  but unused: `video-conference-joined` → `videoConferenceJoined`, `error-occurred` → `errorOccurred`,
  `video-quality-changed` → `videoQualityChanged`. `errorOccurred` is a **JitsiMeetExternalAPI** event distinct
  from the DOM `<script>` element's own `error` event that `JitsiMeetingRenderer.tsx` currently listens to for
  bundle-load failure — the two are different failure surfaces (script-load vs. in-conference).
- **Device capability probe:** `isDeviceChangeAvailable(deviceType)` exists on the API surface for the
  VM-06 "insufficient browser support hides the control" requirement.

No iOS/mobile-specific gating strings (e.g. a dedicated `isMobileBrowser` export) were found in the bundle
itself — `toggle-camera`'s own availability gating is internal to Jitsi's UI and was not independently
exercised on a live mobile browser in this pass.

## Findings (source/visual inspection, class 7/8 — no tests written for these; §10a)

1. **UI-09 not implemented at all.** `DoctorLiveMeetingClient.tsx` renders a local, two-tab
   `Tabs`/`TabsList`/`TabsTrigger` (`Заметка`/`Приём`) that has nothing to do with the canonical
   `PatientCardDesktopTabs`/`PatientCardMobileTabs`/`PatientCardRouteTabs` in
   `apps/webapp/src/app/app/doctor/patients/[userId]/PatientCardSectionTabs.tsx`. The live page is not wired
   into `patientCardTabRegistry`/`patientCardHref` at all, so it has no shared navigation with the rest of the
   patient card. This needs a real implementation decision (does `live` become a tab entry, or does the tab
   strip render alongside it?) before a test can be written — flagged as **MUST FIX** for the implementer, not
   testable without inventing the wiring myself.
2. **VM-06 base allow-list is narrower than the toolbar contract at the deploy-config layer, not just the
   client.** `deploy/jitsi/config/web/custom-config.js:9` (`config.toolbarButtons = ['microphone', 'camera',
   'hangup']`) and `custom-interface_config.js:17` are the **base** allow/deny set VM-06 says
   `configOverwrite` may only narrow, not extend. Screen share (`desktop`) and mobile camera-flip
   (`toggle-camera`) cannot be added from `JitsiMeetingRenderer.tsx`'s `configOverwrite` alone — the deploy
   config also needs both ids added to its base list first. Deploy config is out of this audit's allowed scope
   (tests/docs only); flagged as **MUST FIX**, sequenced before the client-side change.
3. **VM-10 arbitrary hard deadline confirmed as a real defect**, not just a naming nuance:
   `JITSI_SCRIPT_LOAD_TIMEOUT_MS = 15_000` in `JitsiMeetingRenderer.tsx` fires the exact same `failed()` path as
   a genuine `<script>` `error` event — it removes the still-loading script tag and flips to the hard
   `unavailable` state even though the script never actually errored and might still have loaded. Test added
   (red).
4. **VM-10 has no retry action in the DOM at all.** The `unavailable` state renders only the text "Не удалось
   подключиться к звонку"; the only way the existing test suite recovered before this audit was by unmounting
   and remounting the whole component from an external test — not an in-product control. Test added (red).
5. **Notification idempotency is meeting-scoped, not invite-scoped (ACC-07/ACC-08 structural gap).**
   `VideoMeetingInvitationNotification.enqueue` (`ports.ts`) only ever receives `meetingId`, never an invite
   id, and `videoMeetingInvitationNotification.ts:169` keys the durable queue row as
   `` `${meetingId}:${channel}` ``. Once ACC-08's "explicit rotate also notifies" gap (finding 4b above) is
   fixed, a second rotation's notification would be silently deduplicated against the *first* invite's queue
   row unless the port signature grows an invite id. This is a production API-shape change I did not invent a
   test for (no field to assert against yet) — flagged as **MUST FIX**, sequenced with finding 4b.
6. **VM-12 diagnostic ingest does not exist.** No route, module, or wiring accepts browser-side call facts
   anywhere in `apps/webapp/src`; only the existing structured server logger fires today. Writing an acceptance
   test would require inventing the endpoint/action shape myself, which §10b forbids (independent oracle
   required, not the tested reality's own invention). **OWNER QUESTION**, not a task: which existing route
   action should carry this, and what exact closed field set.
7. **iframe/stage real height not confirmed live.** `JitsiMeetingRenderer.tsx`'s target `<div>` is
   `min-h-[320px] w-full` (a floor, not `h-full`); its wrapping `<div className="relative min-h-[320px]
   bg-black">` is the same. The outer `<section>` in `DoctorLiveMeetingClient.tsx` has no explicit height and
   relies on CSS-grid `stretch` from the `min-h-[calc(100vh-4rem)]` `<main>` row. Whether the Jitsi-injected
   iframe (which Jitsi itself sizes to its immediate parent) actually fills the available stage height, or
   just the 320px floor, was not confirmed on a live render — needs a live TEST screenshot, not a test.
8. **Single self-view / hidden subject before a client joins (VM-06/UI-10)** rely entirely on Jitsi's own
   default conference UI behavior (no custom filmstrip/subject code exists in `JitsiMeetingRenderer.tsx`). Not
   independently verified against a live two-participant call in this pass.
9. **No second navigation, no Jitsi API leak (class 8, PASS).** `JitsiApi` in `JitsiMeetingRenderer.tsx` only
   types `dispose`/`addEventListener`; `VideoMeetingStage` never re-exports the constructed API instance, and
   `DoctorLiveMeetingClient` only imports the provider-neutral `VideoMeetingRenderSession` type. The existing
   seams (`DoctorLiveMeetingClient`, `JitsiMeetingRenderer`, `VideoMeetingStage`) are structurally reusable for
   the Play-gate/UI-08 fix without a second provider path.
10. **Old "exactly three buttons" test removed as a false oracle.** `JitsiMeetingRenderer.ui.test.tsx` pinned
    `TOOLBAR_BUTTONS` to `toEqual(['microphone', 'camera', 'hangup'])`, encoding the superseded owner decision.
    Replaced with a required/forbidden command-set contract test (kept the prejoin assertion as its own test).

## Test commands (via the host test-lock wrapper)

```bash
# Scoped, per project — matches what actually ran for this audit:
/home/dev/brain/host-orch/run-tests.sh \
  "pnpm --dir apps/webapp exec vitest run --project ui JitsiMeetingRenderer.ui.test"
/home/dev/brain/host-orch/run-tests.sh \
  "pnpm --dir apps/webapp exec vitest run --project ui DoctorLiveMeetingClient.ui.test"
/home/dev/brain/host-orch/run-tests.sh \
  "pnpm --dir apps/webapp exec vitest run --project fast video-meetings/service.test"
/home/dev/brain/host-orch/run-tests.sh \
  "pnpm --dir apps/webapp exec vitest run --project route video-meetings/route.route.test"
/home/dev/brain/host-orch/run-tests.sh \
  "pnpm --dir apps/webapp exec vitest run --project unit videoMeetingInvitationNotification.unit.test"
```

⚠️ Do not pass multiple `--project` flags together with bracketed file paths (e.g.
`[userId]`) as positional filters in one invocation — in this vitest/pnpm setup that combination silently fell
back to running the **entire** webapp suite (583 files) instead of erroring. Run one project + one plain
substring filter per invocation, as above.

Consolidated result across all touched files, single run:

```
Test Files  5 failed (5)
     Tests  9 failed | 16 passed (25)
```

The 16 green: all pre-existing accepted tests (unchanged, no regression) plus 3 new tests that already hold on
current production (create-path invite issuance, prepare-error retryability without a poll loop, prejoin/
endpoint/NOTE-08 regressions) — each proven by fault injection above where newly added.

The 9 red are the handoff: VM-10 retry button, VM-10 arbitrary-deadline, VM-06 required-command-set, UI-08
Play-gate (×2), ACC-08 resume-no-rotate, ACC-08 explicit-rotate-notifies, ACC-07 full-dedup-not-queued, ACC-07
route-surfaces-notification.

## Scope discipline

Only test files and this artifact were touched:

```
 M apps/webapp/src/app/api/doctor/clients/[userId]/video-meetings/route.route.test.ts
 M apps/webapp/src/modules/video-meetings/service.test.ts
 M apps/webapp/src/shared/ui/video/JitsiMeetingRenderer.ui.test.tsx
 M apps/webapp/src/modules/patient-notifications/videoMeetingInvitationNotification.unit.test.ts
?? apps/webapp/src/app/app/doctor/patients/[userId]/live/DoctorLiveMeetingClient.ui.test.tsx
?? docs/audit/video-live-ui-owner-correction-2026-09-08.md
```

No plan/taskdb/server/deploy file was edited. `pnpm --dir apps/webapp exec eslint` on all 5 touched test files:
clean. `tsc --noEmit` was run repo-wide; all reported errors are pre-existing, unrelated `@bersoncare/*`
workspace-package resolution failures (present before this audit, not in any touched file) — none reference a
file this audit changed.

## NOT DONE (explicit, per canon)

- Production code for VM-06, VM-10 (retry action, arbitrary-deadline removal), VM-11 (compact menu), VM-12,
  ACC-07 (route+dedup fix), ACC-08 (resume/rotate fix, notification port signature), UI-08 (Play gate), UI-09
  (patient card tab reuse), UI-10 was **not implemented** — out of this audit's allowed scope by brief.
- `deploy/jitsi/config/web/custom-*.js` base allow-list was **not changed** — production config, out of scope.
- VM-12 diagnostic ingest has no test because no route/shape exists yet — OWNER QUESTION, not guessed.
- Class 3 (Play after >10min pause uses fresh join-material) has no test yet — there is no second/"Play" route
  call in production to point it at until UI-08 lands; add together with the UI-08 fix.
- Findings 7 and 8 (iframe/stage real height, single self-view before a client joins) were not confirmed on a
  live render — need a live TEST screenshot, not a test, per §10a.
