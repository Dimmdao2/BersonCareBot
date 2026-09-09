# Worker brief — #915 native Jitsi seam correction

## Authority and operating rules

- Work only in `/home/dev/dev-projects/bcb-wt-mobile-web-native-jitsi-20260909` on the existing branch `wt/mobile-web-native-jitsi-20260909`.
- Before every action run the heading-map command required by `AGENTS.md`; fully read the relevant §5, §9–§10b, §12, §16–§17 and §24 sections plus `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M3/M4/M7.
- Read the exact independent finding in `.lead/runs/mobile-web-native-jitsi-audit-20260909/90-final-audit-report.md` and the retained oracle `apps/webapp/src/shared/ui/video/VideoMeetingStage.ui.test.tsx` before changing product code.
- This is a same-branch product correction. Do not alter, weaken or delete the auditor-owned test, blind kill-set or report. Do not write new tests. Do not touch taskdb, plan checkboxes, audit queue, integration branch, PROD, DB, deploy, push or unrelated code.

## Outcome

Correct the complete native-conference ownership lifecycle in one coherent pass:

1. A terminal/error event belonging to a replaced native conference must not terminate or diagnose the replacement conference. The retained red oracle must become green without modification. Do not rely on timing as the ownership boundary; if the existing Android event payload/state machine must carry or serialize conference ownership to make the behavior real, update the narrow NativeJitsi bridge/plugin contract rather than adding a second video path.
2. The candidate production paths must pass scoped ESLint; eliminate the two `react-hooks/refs` violations without reintroducing callback-identity restarts.
3. Preserve all already accepted behavior: one provider-neutral `VideoMeetingStage` across three callers, browser/PWA iframe fallback, exact endpoint/room/token pass-through, one terminal callback, retry/hangup behavior, trusted-origin checks, no secret logging, no new server renderer value and no copied mobile video/notes page.
4. Keep strict TypeScript and the existing Java/Capacitor architecture. Reuse current lifecycle fields and adapters where possible; no speculative refactor.

## Validation and delivery

- Run the retained Jitsi stage/renderer suite unchanged and make all tests green.
- Run scoped ESLint for every changed TS/TSX path plus the retained test.
- Run webapp typecheck after building only the existing unresolved workspace declaration packages if needed; report the exact commands/results.
- If Android product code changes, run the smallest relevant existing NativeJitsi Java test/build gate through `/home/dev/brain/host-orch/run-tests.sh`; do not add tests.
- Run `git diff --check`, inspect the exact final diff against `0616d6d2a`, and ensure no product path outside this coherent correction changed.
- Commit all product corrections explicitly on the existing branch with `#915`, including why/evidence/plan/not-done in the commit message. Do not push. End with the commit SHA, paths changed, validation results and any genuine blocker.
