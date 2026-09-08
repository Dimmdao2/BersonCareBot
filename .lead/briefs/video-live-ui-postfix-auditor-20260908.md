# Тест или взгляд — #1100 post-fix live UI, Jitsi surface and diagnostics

Сначала классифицируй новый scope до чтения тестов: устойчивые дорогие и молчаливые нарушения diagnostics/auth/
single-start проверяй самым дешёвым поведенческим тестом; Jitsi capability/config, наличие встроенных входов,
раскладку, высоту, положение панели и навигацию — одноразовым source/capability/live-взглядом без тестов строк,
классов, массивов toolbar или визуальной формы.

You are the independent `auditor-live` for the exact committed candidate `81bf92e22` in
`/home/dev/dev-projects/bcb-wt-video-live-ui-correction-20260908` (`wt/video-live-ui-correction-20260908`).
Its integration base is `ef03db665`; the earlier acceptance handoff is `846656756` plus correction
`f3feade78`. Audit only the new or materially changed surface introduced by `81bf92e22`; do not repeat the
already completed blind kill-set for invite resume/rotation, notification feedback, Play gating, or bundle retry.

## Mandatory authority and rules

1. Read the heading map and then the full applicable sections in `AGENTS.md`: §5, §10, §10a, §10b, §11,
   §16, §17, §24. In particular, classify every requirement as test or look before checking it.
2. Read `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`: VM-06, VM-10..VM-12, ACC-07..ACC-08,
   UI-08..UI-10 and the final acceptance sequence in §6.
3. Read the exact candidate diff `ef03db665..81bf92e22`, the prior audit artifact at
   `docs/audit/video-live-ui-owner-correction-2026-09-08.md`, and the pinned Jitsi package docs/config.
4. This is an audit gate, not authority for broader product work. A finding needs a reachable failing scenario,
   user/operational/security impact and the exact violated owner/repo requirement.

## New-surface acceptance scope

- **VM-12 diagnostics:** verify the existing doctor lifecycle route is authenticated/tenant- and specialist-bound;
  input has a closed vocabulary; the server logger receives only the allowed closed fields (meeting/org ID, role,
  event, optional duration, `p2p|relay`, error class) and cannot receive patient/specialist/actor IDs, raw invite,
  JWT, TURN credentials or arbitrary browser data. Verify actual pinned Jitsi event names are wired, and that
  observable join, error, end/duration and P2P/fallback status can really reach the route. No new DB/table/admin UI,
  product analytics event, guest ingest or external telemetry.
- **VM-06/VM-11 Jitsi controls:** use the actual pinned `stable-11146-2` source/bundle and documented config seams,
  not guessed command names. Verify the deployed base allowlist and iframe narrowing produce the owner-approved
  built-in controls: mic, camera, hangup, desktop screen share, direct mobile front/back camera control, plus the
  approved compact-menu capabilities where the browser supports them. Verify forbidden chat/participants/Jitsi
  invite/raise hand/subtitles/stats UI/recording/livestream/whiteboard/shared video/separate computer-audio entries
  are not reachable through toolbar, overflow, hotkeys or context-menu entry points. No product toolbar, iframe DOM
  access or second `getUserMedia`. Technical room subject and branding remain hidden. If a requested function is not
  actually available in the pinned build or requires remount, report a precise owner question; do not imitate it.
- **UI-09/UI-10 and visual/source behavior:** verify the live route genuinely reuses the canonical patient-card
  shell and desktop/mobile route tabs without a second navigation set. Inspect or run an isolated candidate render
  sufficient to establish that pre-start is a Play state rather than a misleading active connection, the video
  stage has usable desktop/mobile height, Jitsi's own toolbar sits at the stage bottom, and the one-person state does
  not deliberately create a second self-view/empty second tile. Visual layout is accepted by source/live inspection,
  not CSS/class-string assertions.
- **New integration edges only:** review the new store/DI/route boundaries for §5 compliance and strict typing;
  verify fast repeated Play cannot create two POSTs/Jitsi instances, a failed start remains meaningfully retryable,
  and diagnostic reporting cannot block or remount the call. Reuse the already-green 24-test acceptance set as
  evidence; do not recreate it.

## Test policy and allowed writes

- Before reading existing tests, write the new-surface kill-set in your notes/artifact.
- Add a permanent test only for an expensive **and** silent stable-behavior regression that is not already protected,
  using the cheapest public layer and an independent oracle. Do not test toolbar arrays, source strings, Tailwind
  classes, DOM layout, exact button order/count or implementation calls. Source/config/capability and visual facts
  are one-time inspection/live evidence.
- If you add a behavior test, prove its independent class once by fault injection, revert every production mutation,
  and commit only the test plus audit artifact. Do not fix product code.
- Run only targeted tests via `/home/dev/brain/host-orch/run-tests.sh`; no full CI.

## Deliverable

Commit `docs/audit/video-live-ui-postfix-2026-09-08.md` and any justified acceptance-test additions on this same
branch. Report one line per in-scope requirement as PASS/FAIL/BLOCKED with exact command/evidence. State the exact
candidate and final audit commit, changed paths, test commands/results, fault injection (if any), and any named
remaining live-only owner checks. Finish all foreground work and commit before ending your single turn.
