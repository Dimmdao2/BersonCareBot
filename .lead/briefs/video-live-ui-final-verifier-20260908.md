# Тест или взгляд — классификация

This pass is **LOOK / live runtime inspection**, not a test-writing pass. The remaining requirements are
one-time visual/runtime facts: responsive stage height, toolbar placement, actual pinned-Jitsi control
availability, branding/subject visibility, duplicate self-view, shell responsiveness and network behavior.
Per AGENTS.md §10a/§24.4 these must be accepted by a live browser view and request capture, not by tests that
freeze DOM, copy, CSS, button counts or config-array text. Existing repeatable business/error behavior already
has its independent 27-test oracle and is not being audited again.

# Independent candidate live verification — video meeting owner correction #1100

You are the independent `auditor-live` for the exact committed candidate
`e08326702c25c43aa514723ab7460b29618a6fe4` on branch/worktree
`wt/video-live-ui-correction-20260908` / `/home/dev/dev-projects/bcb-wt-video-live-ui-correction-20260908`.

Read the heading map in `AGENTS.md`, then the full relevant sections: §1a, §10a, §10b, §16, §17 and §24.
Authority is `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`, specifically VM-06, VM-10, VM-11, VM-12,
UI-08, UI-09 and UI-10, plus the owner's screenshots/requirements already transcribed there. Read the two
candidate artifacts `docs/audit/video-live-ui-owner-correction-2026-09-08.md` and
`docs/audit/video-live-ui-postfix-2026-09-08.md`. This is the one missing pre-landing live/visual gate, not a
second blind test audit.

## Scope and role

- Do not change production code, configuration, existing tests, plan, taskdb or audit queue.
- Do not write tests: layout, button placement, labels and Jitsi's rendered controls are one-time live/visual
  acceptance under §10a. Existing 27 tests already passed on this SHA.
- You may create exactly one evidence artifact:
  `docs/audit/video-live-ui-final-verification-2026-09-08.md`, and commit only that file before ending.
- A finding exists only for a reachable broken owner requirement/runtime integration. No style findings,
  speculative hardening or alternative architecture.
- Treat the postfix auditor's proposed toolbar id `hide-self-view` as disputed, not authority. Inspect the
  pinned Jitsi source/runtime behavior. Do not demand a string in an allowlist. The supported built-in route may
  be Settings > More with `disableSelfViewSettings=false`; report the actual reachable UI.

## Candidate runtime

Perform the live check before landing, on an isolated port in 5210-5219 (prefer 5214 if free). Never invoke
`pnpm dev`, `pnpm dev:turbo`, `pnpm webapp:dev` or anything that kills shared ports. Follow
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md` §3b. Start the exact candidate directly from
`apps/webapp` with `npx next dev -H 127.0.0.1 -p 5214` (run the documented candidate migration command first
only if required by the canonical flow), keep the process in the foreground of a managed shell/session, and
stop only your own process at the end.

Use the existing registered DEV owner doctor account through the normal email/password flow from AGENTS §1a.
Do not create fixture users/data, do not use auth bypass, do not print/read env secrets. Use the existing
patient relationship visible to this account. Browser automation may use a temporary profile under `/tmp` and
synthetic/fake media; do not commit cookies, screenshots or runtime exports. If existing browser tooling is
available, use it; do not add a framework to the repository.

## Required live proof

1. Open the doctor live page and prove before Play:
   - canonical patient-card desktop/mobile navigation is visible and usable;
   - video stage has a usable non-zero height on desktop and mobile, with the Play action visibly centered;
   - no iframe / `external_api.js` request / camera or microphone acquisition occurs before Play;
   - shell navigation remains clickable.
2. Click Play once with synthetic media and prove:
   - exactly one Jitsi iframe/adapter mounts; the page itself stays responsive;
   - the toolbar is rendered at the lower edge of the stage, not at the top;
   - technical room name and Jitsi branding are absent;
   - primary mic/camera/hangup and the applicable allowed VM-06 controls are reachable: desktop share,
     mobile camera flip where the browser exposes it, fullscreen, devices, hide/show self-view, layout/main
     participant, video quality, virtual background;
   - VM-11 forbidden surfaces are not reachable: chat, participants pane, Jitsi invite, raise hand, subtitles,
     stats UI, recording, livestream, whiteboard, shared video, computer-audio sharing;
   - before a second participant joins, determine from actual rendered behavior whether local video is shown
     once or duplicated. Do not infer this from source strings.
3. Force the `external_api.js` request to fail, verify an immediate understandable failure with a working
   `Повторить` action and that the rest of the app remains clickable. Then allow retry and verify the script/
   iframe can mount without a page reload. If interception cannot be done with the installed tooling, name the
   exact blocker and still perform the rest.
4. Inspect browser console/network only for this run: record any runtime exception, foreign endpoint request,
   or failed app/Jitsi request. Do not claim foreign traffic absent without a captured request list.
5. Inspect the candidate source only as needed to explain observed behavior. In particular evaluate the new
   full-height flex/grid chain at both breakpoints; a mobile stage collapsed to zero/near-zero is a MUST FIX.

## Deliverable

Write exact commands and observed facts to the one artifact, with a binary verdict:

- `PASS` only if every applicable item above is observed working on the exact SHA;
- `MUST FIX` with concrete reproduction + impact for reachable failures;
- `BLOCKED` only for items the environment genuinely cannot exercise, with exact attempted command/output.

Separate owner/device-only residuals (real iPhone/macOS camera/PiP acceptance) from candidate defects. Do not
declare the whole candidate PASS from HTTP 200 or source inspection. Commit the artifact with an explicit path
and report its commit SHA. Do not push. Do not end while a foreground command is still running; stop the isolated
server/browser you started.
