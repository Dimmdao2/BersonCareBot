# Worker brief — #915 persistent mobile call across app routes

Источник оракула — `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`: «и нативный Android, и browser/PWA звонок продолжаются при переходе со страницы звонка в карточку пациента, программу или другой раздел приложения».

## Role and rules

You are the product worker for the webapp half of taskdb #915. Finish this coherent stage in one turn in the supplied clean worktree. Before every action obey the heading-map gate in `AGENTS.md`; read `README.md`, `AGENTS.md` §5, §10, §15, §16, §17 and §24, both patient/doctor UI style guides, the exact plan M4-01/M4-04/M4-05/M4-06, and the current #1100 video plan where these files intersect. Use code-search before blind grep.

Workers do not write tests. Do not add, edit, rename, delete, weaken, or regenerate any test or audit artifact. Existing tests may be run unchanged. Do not run root full CI; the owner explicitly deferred it because package updates are happening in parallel.

## Exact file scope

- `apps/webapp/src/shared/ui/video/**` production files.
- The three existing production call entrypoints only as needed: doctor live, patient live, guest `/live` (guest must remain standalone and need not become globally persistent).
- Existing persistent authenticated patient/doctor shell/provider boundaries and the minimum existing doctor start-call surfaces discovered by code-search.
- New nonvisual shared call state may live under the existing video/shared-lib boundary. Visual call indicators must be physically separate patient and doctor components under their own `shared/ui/patient/**` and `shared/ui/doctor/**` trees and reuse zonal primitives/tokens.
- No `apps/mobile-shell/**`, backend/API/domain changes, dependencies/lockfile, docs, `.lead`, or test-file edits.
- Stage explicit paths only; never `git add -A`; do not push.

## Required behavior

1. Extend the existing `VideoMeetingStage`/Jitsi renderer path; do not create a second meeting page, second browser renderer, or a provider-specific product path. One persistent authenticated active-call coordinator above Next route boundaries owns the current `VideoMeetingRenderSession`, exact return URL, terminal callback, and rendered conference.
2. On mobile browser/PWA and trusted Capacitor runtime, internal Next navigation must not unmount/dispose/hang up the active conference. Native Android hands visibility to its system Jitsi Activity/PiP. Browser/PWA keeps the same iframe instance alive; where an actual browser/Jitsi PiP is unavailable, show the same live call in a compact in-app floating video surface. Never silently start a second iframe/session.
3. On the exact active call route, render the current call in its existing full call-page slot. On other mobile patient/doctor routes, render a compact zonal active-call indicator at bottom-right above global bottom navigation with a camera icon and a softly pulsing dot. Tapping it routes to the exact active call URL. Keep it accessible and safe-area aware.
4. Disable every ordinary doctor start-call entry while any call is active. At minimum inspect and handle `PatientCardClient`, `PatientEncounterStartModal`, `DoctorTodayNextAppointment`, and the doctor live page start control. Where the target is the current call, expose return-to-call behavior instead of starting another session. Direct navigation to another live route must not replace the active call implicitly.
5. Only the actual Jitsi terminal/end event clears the active call and runs the existing hangup/encounter callback once. Route unmount/navigation removes only page attachment/listeners; it never calls native hangup or browser `dispose`. Keep callback/session ownership safe if the originating page component has unmounted.
6. Preserve all three provider-neutral production entrypoints and the future renderer seam. Keep the guest page operational as its current standalone full-screen path. Do not redesign desktop layout and do not add the new floating indicator on desktop.
7. Respect patient/doctor physical UI isolation. Reuse existing shell slots/primitives and styles; do not cross-import patient and doctor UI or create duplicated call-state logic.

## Validation and completion

- Run the unchanged targeted video/live UI tests and webapp typecheck/scoped lint appropriate to changed files. A pre-existing red audit oracle may stay red only if it covers the separate Android-only ownership defect; report it exactly rather than editing it.
- Inspect final diff for one coordinator, one renderer, no route-unmount hangup/dispose, all actual start surfaces gated, UI-zone isolation, and no secret/token persistence outside in-memory React state.
- Commit all product changes before ending. Commit message must include `#915`, why, exact checks/evidence, M4-01/M4-04/M4-05/M4-06, and what remains unverified (independent audit, real mobile browser/device). Do not update plan checkboxes or taskdb.
- Report commit SHA, files changed, exact commands/results, and any real blocker.
