# Worker correction — browser Jitsi explicit end closes the active call (#915 M7-03)

## Authority and reproduced defect

- Work only in `/home/dev/dev-projects/bcb-wt-mobile-browser-jitsi-explicit-end-20260910` on `wt/mobile-browser-jitsi-explicit-end-20260910`, starting from the current integrated `feat/doctor-ui-rebuild` head.
- Before every action follow the `AGENTS.md` heading-map gate. Read in full the global decision method, §5, §9–§10b, §16–§17 and §24; read `docs/ORCHESTRATION_BINDINGS.md`, `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` owner decisions 8–10 and M4/M7-03, `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`, `apps/webapp/src/shared/ui/video/JitsiMeetingRenderer.tsx`, `VideoMeetingStage.tsx`, `ActiveCallCoordinator.tsx`, and the directly affected existing tests before changing production code.
- Source oracle: `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` states «explicit end очищает coordinator ровно один раз» and «Worker продуктового этапа тесты не пишет».
- Lead live reproduction on the one shared DEV Turbopack `:5200`, ordinary `Дмитрий Берсон` doctor session, mobile 390×844, self-hosted `meet.test.therapysto.ru`: start creates one iframe; clicking the visible Jitsi role-button `aria-label="Leave the meeting"` removes conference content inside the iframe, but after 30 seconds the iframe and active-call coordinator remain. Only destroying the browser later causes a server PATCH. Internal navigation itself already passed: the exact same iframe node persists on `/app/doctor/patients`, one `Вернуться к звонку` control appears, and it returns to the exact live URL.
- The pinned live `external_api.js` contains all three event names: `videoConferenceJoined`, `videoConferenceLeft`, and `readyToClose`. The current browser adapter listens only to `readyToClose` for terminal behavior.

## Exact correction

Close this one reached defect coherently at the existing Jitsi browser adapter; do not add a product toolbar, second coordinator, timer, iframe DOM inspection, route workaround, or native-plugin change.

1. Reuse one local terminal handler for the browser renderer and subscribe it to both supported terminal signals needed for real Jitsi behavior: the explicit leave signal and the existing ready-to-close signal.
2. The terminal handler must report the existing `end` diagnostic and invoke the existing provider-neutral `onHangup` exactly once even if Jitsi emits both signals.
3. Cleanup/unmount/dispose must remain non-terminal: set the lifecycle guard before `api.dispose()` so a leave-like event caused by disposal, route teardown, or app teardown cannot synthesize explicit user termination. Internal mobile navigation must continue preserving the same coordinator-owned iframe/session.
4. Preserve all existing join/error/transport diagnostics, retry behavior, toolbar/provider configuration, browser/PWA fallback and native Jitsi behavior. Parameterize the existing terminal path; no parallel function/adapter or event vocabulary.

## Scope, tests and delivery

- Product scope is only `apps/webapp/src/shared/ui/video/JitsiMeetingRenderer.tsx` unless a directly required adjacent type change is proven. Do not edit native shell, routes, DB/schema/migrations, deploy/Jitsi config, plans, taskdb, audit queue, docs or unrelated UI.
- Do not add, edit or delete tests. The independent audits already established the useful existing behavior oracles; the lead will repeat the real visible Jitsi leave flow after landing. Run only the directly affected existing Jitsi/active-call behavioral tests, webapp typecheck, scoped ESLint and `git diff --check` through the documented host lock where required. No full CI, no Next server, no DEV/TEST mutation, no provider send, no deploy and no push.
- Commit only explicit allowed production paths with a `fix(#915)` message and leave the worktree clean. Report exact SHA, changed paths and exact validation results.

