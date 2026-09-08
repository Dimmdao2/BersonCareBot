# Live UI post-fix acceptance — #1100 — auditor-live

Candidate audited: `81bf92e2218392c0fd45b2a1316d4e8d75aa5d72` (`fix(video): correct doctor live invite and
player #1100`), integration base `ef03db665` (merge of `feat/doctor-ui-rebuild`), on
`wt/video-live-ui-correction-20260908`. Prior acceptance: `846656756` (kill-set) + `f3feade78` (oracle
correction); prior artifact `docs/audit/video-live-ui-owner-correction-2026-09-08.md`. Final audit commit is
this artifact's own commit on the same branch.

Authority: `AGENTS.md` §5, §10, §10a, §10b, §11, §16, §17, §24; `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`
VM-06, VM-10..VM-12, ACC-07..ACC-08, UI-08..UI-10, §6 final acceptance sequence.

Scope: only the new/materially changed surface introduced by `81bf92e22` (13 files, +246/-64). Did **not**
re-run the already-completed blind kill-set for invite resume/rotation UI copy, notification feedback text,
Play-button existence, or bundle-load retry mechanics beyond what `81bf92e22` itself touches — those were
accepted by the prior pass and are green, unmodified (see consolidated test run below).

## Verdict: **MUST FIX** — three reachable, silent defects in the new surface

`81bf92e22` correctly implements most of the owner-correction (Play gating, invite/notification once-only on
create, ACC-07 dedup status fix, invite-scoped idempotency, canonical tab reuse, VM-10 retry/timeout removal).
Three new defects were found by source/capability inspection and proven with cheap, permanent, currently-red
acceptance tests (added on this branch, no production code changed):

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| 1 | **VM-12** — logger receives only the closed field set, never patient/specialist/actor IDs | **FAIL** | `service.test.ts` new test, red on real code — logger payload contains `patientUserId`, `specialistId`, `actorPlatformUserId` |
| 2 | **VM-12** — pinned event names actually wired for join/error/end | **FAIL** (error only) | `JitsiMeetingRenderer.ui.test.tsx` new test, red — code listens for `conferenceError`, which does not exist in the pinned `stable-11146-2` bundle; `errorOccurred` does |
| 3 | **UI-08** — fast Play cannot create two POSTs/app-sessions | **FAIL** (new race) | `DoctorLiveMeetingClient.ui.test.tsx` new test, red — Play click during the in-flight mount auto-prepare fires a second concurrent POST |
| 4 | **VM-06** — compact menu offers hide/show self-view | **FAIL** | live bundle census below: `hide-self-view` is a real toolbar id, absent from both `deploy/jitsi/config/web/custom-*.js` and the iframe `configOverwrite` |

All other in-scope requirements: **PASS** (table below). No production/config file was changed by this audit;
`git status` after adding the three tests shows only test files.

## Findings (detail)

### Finding 1 — VM-12: diagnostic route leaks patient/specialist/actor identity into structured logs

`apps/webapp/src/app/api/doctor/clients/[userId]/video-meetings/[meetingId]/route.ts` builds one
`lifecycleInput` object per request — `{ meetingId, organizationId, patientUserId, specialistId,
actorPlatformUserId }` — reused by `rotate_invite`/`revoke_invite`/`end`. The new diagnostic branch calls:

```ts
deps.videoMeetings!.recordDiagnostic({ ...lifecycleInput, ...body.data.diagnostic })
```

`service.ts`'s `recordDiagnostic` declares a narrower parameter type (`meetingId, organizationId,
specialistId, event, durationMs?, transport?, errorClass?`), but that type only gates the *literal* passed at
the call site — object-literal excess-property checking never applies to a spread, so the route's spread
carries `patientUserId` and `actorPlatformUserId` through at runtime regardless of the declared type. Inside
the service:

```ts
deps.logDiagnostic?.({ ...input, role: 'specialist' });
```

spreads the *whole runtime object* — including the two extraneous keys plus `specialistId`, which VM-12 also
explicitly forbids reaching the logger — into the payload `buildAppDeps.ts` wires straight to
`logger.info(payload, 'video_meeting_diagnostic')`. The root pino logger's `redact` list
(`apps/webapp/src/infra/logging/logger.ts`) only covers `headers.authorization/cookie`, `*.token/secret/apikey/
password/phone` — none of `patientUserId`/`specialistId`/`actorPlatformUserId` are redacted. Every join/error/
end diagnostic PATCH therefore writes patient and specialist identifiers into structured server logs, silently
(compiles clean, no lint/test previously caught it) — exactly VM-12's "cannot receive patient/specialist/actor
IDs" violated on every call.

Proof (permanent test, `apps/webapp/src/modules/video-meetings/service.test.ts`, red on unmodified `81bf92e22`):

```
AssertionError: expected [ Array(7) ] to deeply equal [ 'event', 'meetingId', …(2) ]
+   "actorPlatformUserId", "patientUserId", "specialistId"   (present, must not be)
```

### Finding 2 — VM-12: error diagnostic listens for a non-existent event name

`JitsiMeetingRenderer.tsx` registers `api.addEventListener('conferenceError', ...)`. Re-fetched the live
pinned bundle for this audit (`https://meet.test.bersoncare.ru/external_api.js`, 200, 98477 bytes — same
`stable-11146-2` build the prior audit censused) and grepped its `events:` name map:

```
"error-occurred":"errorOccurred"   (present)
"video-conference-joined":"videoConferenceJoined"   (present — used correctly for `join`)
"video-ready-to-close":"readyToClose"   (present — used correctly for `end`)
"conferenceError"   → zero matches anywhere in the bundle
```

`conferenceError` is not a `JitsiMeetExternalAPI` event in this pinned build; the real name is `errorOccurred`.
The listener is permanently dead — in-conference provider/connection errors never produce a diagnostic event,
silently (no crash, nothing else exercises this path). `join` and `end` wiring are correct.

Proof (permanent test, `apps/webapp/src/shared/ui/video/JitsiMeetingRenderer.ui.test.tsx`, red on unmodified
`81bf92e22`): a fake `JitsiMeetExternalAPI` records registered listeners; firing the real `errorOccurred`
handler never happens because the code registered `conferenceError` instead — `onDiagnostic` is never called.

### Finding 3 — UI-08: Play click during the in-flight mount auto-prepare fires a second POST

The mount effect and `start()` (Play) are guarded by two independent, non-overlapping flags: `startedRef`
(effect-only, prevents the effect from double-firing) and `starting`/`session` (prevents a second *Play*
click). Neither guards against a Play click landing while the mount effect's own `prepare(false)` call is
still awaiting its `fetch`. Since an async function body runs synchronously up to its first `await`, `start()`
→ `prepare(true)` issues its `fetch()` call synchronously inside the click handler, regardless of whether the
first `prepare(false)` call has resolved. This reaches a real race: two concurrent `createOrResume` POSTs for
the same appointment can both observe "no active meeting yet" and each independently mint a meeting/invite/
notification (duplicate patient notification), or race into two sessions — the exact "Повторные быстрые
нажатия не создают несколько ... app-sessions" guarantee UI-08 states, from the mount-vs-Play angle the
existing double-click test doesn't reach (that test explicitly waits for the first POST to resolve before ever
clicking Play).

Proof (permanent test, `DoctorLiveMeetingClient.ui.test.tsx`, red on unmodified `81bf92e22`): first `fetch` is
held pending; clicking Play immediately after confirming the first call fired still produces
`fetchMock` called 2 times, not 1.

### Finding 4 — VM-06: compact menu is missing hide/show self-view

Plan text: "компактное меню даёт fullscreen, поддерживаемый браузером выбор устройств, hide/show self-view,
раскладку/главного участника, качество видео и виртуальный фон." Fetched the live main app bundle
(`libs/app.bundle.min.js`, 200, 3,579,605 bytes) — the real source of `TOOLBAR_BUTTONS`/`interfaceConfig`
button ids (`external_api.js` only carries the postMessage command/event maps, not the toolbar button
registry) — and confirmed `"hide-self-view"` is a real, present toolbar button id in this pinned build. Both
`deploy/jitsi/config/web/custom-config.js`'s `config.toolbarButtons` and
`custom-interface_config.js`'s `interfaceConfig.TOOLBAR_BUTTONS` (this commit's new base allowlist) are:

```
['microphone', 'camera', 'hangup', 'desktop', 'toggle-camera', 'fullscreen', 'settings', 'filmstrip', 'tileview', 'videoquality', 'select-background']
```

`hide-self-view` is absent from both, and `JitsiMeetingRenderer.tsx`'s iframe `configOverwrite.TOOLBAR_BUTTONS`
mirrors the same list (correctly not wider than the base, per VM-06's "only narrows" rule) — so the missing
capability cannot be added at the iframe layer alone; it is a deploy-config gap. The specialist can never hide
their own self-view thumbnail through any reachable control. Source/capability fact — not tested (§10a: a
config-array content check is a form-of-source assertion, not a behavior test); logged here as a one-time
capability census, matching the prior audit's own method.

## Requirement-by-requirement (PASS/FAIL/BLOCKED)

| Requirement | Verdict | Evidence |
|---|---|---|
| VM-12 auth/tenant/specialist-bound route | **PASS** | diagnostic branch runs after the same `requireDoctorWorkspaceApiContext` + `requireEntitlementForMutation('video_meetings')` + `requireDoctorWorkspaceModuleForApi` gates as the other actions; `recordDiagnostic` looks the meeting up via `findSpecialistMeeting(meetingId, organizationId, specialistId)` (`pgVideoMeetings.ts`) before ever logging, under `withDoctorWorkspacePrincipal` |
| VM-12 closed input vocabulary | **PASS** | `bodySchema` `diagnostic` branch is a `.strict()` zod object: `event` enum, `durationMs` bounded int, `transport`/`errorClass` enums only |
| VM-12 logger receives only closed field set | **FAIL** | Finding 1 |
| VM-12 join/error/end events actually wired to the pinned bundle | **PARTIAL FAIL** | join/end correct (Finding 2); error dead |
| VM-12 no new DB/table/admin UI/analytics event/guest ingest | **PASS** | `git show --name-only` on `81bf92e22`: no migration/schema/analytics file touched |
| VM-06 main panel: mic/camera/hangup/desktop-share/mobile-flip | **PASS** | deploy allowlist + iframe overwrite both include `microphone, camera, hangup, desktop` (screen share id, confirmed by prior census) and `toggle-camera` (mobile flip id, confirmed by prior census) |
| VM-06 compact menu: fullscreen/devices/self-view/layout/quality/virtual-bg | **FAIL** | Finding 4 (self-view missing; the rest — `fullscreen, settings, filmstrip, tileview, videoquality, select-background` — present) |
| VM-06 base allow-list owned by deploy config; iframe only narrows | **PASS** | `custom-config.js`/`custom-interface_config.js` list == `JitsiMeetingRenderer.tsx`'s `interfaceConfigOverwrite.TOOLBAR_BUTTONS`, not wider |
| VM-11 forbidden surfaces absent | **PASS** | none of chat/participants-pane/invite/raisehand/subtitles/stats/recording/livestreaming/whiteboard/sharedvideo/shareaudio present in either allowlist |
| No product toolbar / iframe DOM access / second `getUserMedia` | **PASS** | unchanged from prior audit finding 9 (`JitsiApi` type still only exposes `dispose`/`addEventListener`; no new DOM/API surface added by this diff) |
| Technical subject/branding hidden | **PASS** | `config.disableConferenceSubject = true` added this commit; `SHOW_*_WATERMARK`/`SHOW_POWERED_BY` unchanged |
| UI-09 canonical tab reuse, no second nav | **PASS** | `page.tsx` now wraps `DoctorLiveMeetingClient` in `PatientEncounterPageShell`, which renders `PatientCardRouteTabs` (desktop+mobile) exactly like `visits/new` and `visits/[visitId]` — same shared component instance, no local `Tabs` for navigation |
| UI-08 open prepares once, doesn't mount adapter/request media | **PASS** | mount effect calls `prepare(false)`; `session` (and therefore `VideoMeetingStage`/Jitsi mount) stays `null` until Play; test `DoctorLiveMeetingClient.ui.test.tsx` "prepares once on open..." green |
| UI-08 Play re-issues create-or-resume for fresh join-material, mounts exactly one adapter | **PASS** | `start()` → `prepare(true)`; test green |
| UI-08 double-click guard (post-settle) | **PASS** | existing green test, unmodified |
| UI-08 fast Play vs. in-flight auto-prepare cannot double-POST | **FAIL** | Finding 3 |
| UI-08 failed start remains retryable, no background poll loop | **PASS** | existing green test, unmodified |
| UI-08 diagnostic reporting cannot block/remount the call | **PASS** | `reportDiagnostic` is fire-and-forget (`void fetch(...)`), never touches `session`/adapter state |
| ACC-07 doctor route surfaces safe notification status only | **PASS** | both routes now return `{status, selectedChannels, queuedChannels, deduplicatedChannels}` — channel *types*, never recipient addresses; route test green |
| ACC-07 full dedup reports `skipped`, not `queued` | **PASS** | `videoMeetingInvitationNotification.ts` status logic fixed; unit test green (was the prior audit's finding 4c) |
| ACC-07/08 idempotency is invite-scoped, not meeting-scoped | **PASS** | `idempotencyKey` now `${inviteId ?? meetingId}:${channel}` (was prior audit's finding 5) |
| ACC-08 resume never rotates/renotifies, `guestUrl=null` | **PASS** | existing green test, unmodified |
| ACC-08 explicit rotate follows the ACC-07 contract | **PASS** | existing green test, unmodified |
| §5 new port/DI edges (`findSpecialistMeeting`, `logDiagnostic`, `inviteId`) respect module/infra layering | **PASS** | port types added to `modules/video-meetings/ports.ts`; infra implementation in `infra/repos/pgVideoMeetings.ts`; `logDiagnostic` injected via `buildAppDeps.ts`, no direct infra import in the module |

## Capability census (this audit, re-verified against the live bundle)

```
curl -s -o /tmp/external_api.js -w 'http_code=%{http_code} size=%{size_download}\n' \
  --max-time 10 https://meet.test.bersoncare.ru/external_api.js
# http_code=200 size=98477

curl -s -o /tmp/app.bundle.min.js -w 'http_code=%{http_code} size=%{size_download}\n' \
  --max-time 30 https://meet.test.bersoncare.ru/libs/app.bundle.min.js
# http_code=200 size=3579605
```

- `external_api.js` events map: `"error-occurred":"errorOccurred"`, `"video-conference-joined":
  "videoConferenceJoined"`, `"video-ready-to-close":"readyToClose"` present; `conferenceError` absent
  anywhere in the bundle (Finding 2).
- `app.bundle.min.js` (the actual toolbar-button-id registry): `"hide-self-view"`, `"fullscreen"`, `"settings"`,
  `"filmstrip"`, `"tileview"`, `"videoquality"`, `"select-background"`, `"desktop"`, `"toggle-camera"` all
  present as real ids; also confirms every VM-11-forbidden id (`chat`, `participants-pane`, `invite`,
  `raisehand`, `subtitles`/`closedcaptions`, `recording`, `livestreaming`, `whiteboard`, `sharedvideo`,
  `shareaudio`) exists in the *bundle* (so Jitsi supports them) but none are in either configured allowlist —
  consistent with VM-11.

## Test commands and results (host test-lock wrapper)

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project ui JitsiMeetingRenderer.ui.test"
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project ui DoctorLiveMeetingClient.ui.test"
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project fast video-meetings/service.test"
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project route video-meetings/route.route.test"
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project unit videoMeetingInvitationNotification.unit.test"
```

Consolidated (5 runs, matches the prior audit's per-file breakdown before the 3 new tests were added — 8+4+9+3+3):

```
Test Files  3 failed | 2 passed (5)
     Tests  3 failed | 24 passed (27)
```

The 24 green are the full prior-audit acceptance set (unchanged, no regression from this candidate). The 3 red
are this audit's new findings (Findings 1–3 above), each failing on the **unmodified** `81bf92e22` — a failing
acceptance test on the real implementation is its own fault-injection proof (§24.5); no additional injection
was needed or performed for these. Finding 4 (VM-06 self-view) has no test per §10a (config-content is a
one-time capability fact, not behavior).

`eslint` on all 3 touched files: clean (`pnpm --dir apps/webapp exec eslint <files>`, exit 0, no output).
`tsc --noEmit` repo-wide: 284 pre-existing `@bersoncare/*` workspace-package-resolution errors, none in any
file this audit touched (same class the prior audit already recorded as pre-existing/unrelated).

## Scope discipline

```
 M apps/webapp/src/app/app/doctor/patients/[userId]/live/DoctorLiveMeetingClient.ui.test.tsx
 M apps/webapp/src/modules/video-meetings/service.test.ts
 M apps/webapp/src/shared/ui/video/JitsiMeetingRenderer.ui.test.tsx
?? docs/audit/video-live-ui-postfix-2026-09-08.md
```

No production/deploy/config file was changed by this audit. No fault injection into production code was
required (all three new tests are red on the unmodified candidate); nothing needed reverting.

## Remaining live-only owner checks (not confirmed by this pass)

- **UI-10 stage height on a live render.** `DoctorLiveMeetingClient.tsx`'s outer `<main>` no longer carries its
  own `min-h-[calc(100vh-4rem)]` (removed this commit); the page is now wrapped in `PatientEncounterPageShell`
  → `DoctorAppShell` with the **default** (not `full-height`) layout, whose container class does carry
  `min-h-full`. This is the same shell already used by `visits/new` and `visits/[visitId]`, so it is
  plausible the ancestor flex chain gives the stage a full-viewport-derived height the same way it does for
  those pages — but that chain was not exercised on a live render in this pass. Owner/live check: confirm the
  video stage is not visually collapsed to its `min-h-[320px]` floor on desktop and mobile.
- **UI-10 single self-view / no empty second tile before a client joins**, and the toolbar's actual on-screen
  bottom position — both are Jitsi's own default conference UI (no custom filmstrip/toolbar-position code in
  this diff), not independently exercised against a live two-participant call in this pass (same open item as
  the prior audit's findings 7–8).
- Per plan §6 item 10, these are exactly the categories the owner's final iPhone/desktop pass is meant to
  catch; nothing above blocks landing the fixes for Findings 1–3, which do not depend on live rendering.

## NOT DONE (explicit)

- Findings 1–4 are **not fixed** — per `AGENTS.md` §24.6, the auditor does not accept its own product fix;
  this is the handoff to the §24.1-selected implementer. Findings 1–3 have a red permanent test each;
  Finding 4 is a one-line addition to the two deploy-config allowlists (`hide-self-view`), sequenced the same
  way the prior audit's finding 2 required deploy-layer changes before a client-side one.
- Deploy-config change for Finding 4 was not made — out of this audit's scope (tests/docs only, matching the
  prior audit's own scope discipline).
- Live TEST rendering (stage height, self-view, toolbar position) was not performed this pass — named above.
