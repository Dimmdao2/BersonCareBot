# Auditor-live brief — browser/PWA Jitsi explicit-end recheck (#915)

## Тест или взгляд

This is live UI behavior, therefore it is accepted only by a visible browser pass. Automated UI/component/DOM tests are forbidden by `AGENTS.md` §10a; no persistent test is appropriate or allowed. Product-code correctness is already a lead-inspected localized correction under the retained audit surface; this pass only proves the final observable consequence on the shared runtime.

## Authority and exact candidate

- Read `AGENTS.md` heading map, then §§1a, 10, 10a, 10b and 24 in full before acting.
- Integrated candidate: `70a51854a203f88576d29ab7a7ca38ca7788cb3e`; localized product correction: `5d677d378f697896e45d9f5b0852aa9dd196abf7`.
- This is the required post-landing live recheck of the reached defect recorded in `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` as `Browser/PWA explicit Jitsi end #915`.

### Источник оракула

`.lead/briefs/mobile-browser-jitsi-explicit-end-correction-worker-20260910.md` requires: «The terminal handler must report the existing `end` diagnostic and invoke the existing provider-neutral `onHangup` exactly once even if Jitsi emits both signals.»

## One bounded live pass

Use only the single already-running shared Turbopack at `http://127.0.0.1:5200`; do not start, stop, restart or clear it. Use the ordinary published DEV doctor login from `AGENTS.md` and the existing normal patient/live-call UI. Do not use a direct API/SDK callback, React access, iframe injection, DB write, fixture or authenticated bypass.

At one mobile viewport and one desktop viewport, through visible controls only:

1. Start the existing doctor call normally and wait for exactly one self-hosted TEST Jitsi iframe/conference UI.
2. Use the visible Jitsi leave/end control inside the real cross-origin conference UI.
3. Prove the outer active call actually ends: the iframe is removed, the active-call return indicator is absent, and the normal start-call control becomes available again without reload.
4. Observe that the terminal transition happens once; a later `readyToClose` must not recreate/duplicate end behavior or leave a stuck coordinator.

If one viewport proves the same shared renderer but the second cannot reach the normal flow for an unrelated current UI defect, report that exact blocker without inventing a substitute. Bound the whole pass to 12 minutes.

## Hard boundaries

- Do not add, edit, delete or run automated UI/component/DOM tests. Do not add any permanent test.
- Do not change product code, routes, native shell, DB/schema/migrations, plan/checklist/taskdb, deploy config or credentials.
- Never print or persist the Jitsi iframe URL, JWT/access token, cookies, passwords or mailbox/provider secrets.
- No full CI, package install, build, migration, provider send, push, TEST/PROD action or second Next.
- Write only `.lead/runs/mobile-browser-jitsi-explicit-end-live-recheck-20260910/90-final-audit-report.md`, with a concise PASS/FAIL/BLOCKED row for each viewport and exact visible evidence. Commit that report before ending. Do not finish while a browser or call you started remains active; explicitly end/close it.
