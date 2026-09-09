# Worker brief — #915 mobile active-call navigation fix

Источник оракула — `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`: «и нативный Android, и browser/PWA
звонок продолжаются при переходе со страницы звонка в карточку пациента, программу или другой раздел
приложения».

## Authority and rules

Implement the complete product correction for the reachable finding in
`.lead/runs/mobile-browser-jitsi-closure-20260909/90-final-audit-report.md` against the exact current
`feat/doctor-ui-rebuild` base supplied by the port. The owner requirement is
`docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M4-01/M4-04/M4-05/M4-06: an authenticated mobile
browser/PWA call survives internal Next navigation as the same iframe/session; global navigation remains usable;
off-route presentation becomes compact with a return indicator; only explicit Jitsi terminal/end clears the call;
a second ordinary call cannot start; desktop is unchanged.

Before every action obey the heading-map gate in `AGENTS.md`. Read `README.md`, `AGENTS.md` §5, §10a,
§10b, §15, §16, §17 and §24, both patient/doctor UI style guides, the exact M4 rows, the audit report,
and the current implementation under `apps/webapp/src/shared/ui/video/**` plus both authenticated shells. Use
code-search before blind grep.

Workers do not write tests. Do not add, edit, delete, rename, weaken or regenerate any test or audit artifact.
Run existing tests unchanged. Do not run root full CI. Do not touch TEST/PROD, DB, dependencies, lockfile,
`apps/mobile-shell`, plan/taskdb, `.lead/runs`, or unrelated UI.

## Product scope and required result

- Fix the actual layering/placement contract rather than disabling pointer events on the live conference.
- On the exact active-call route, the same persistent `VideoMeetingStage` must remain the main call surface while
  patient and doctor mobile global navigation stays clickable. The global chrome must not hide Jitsi's own
  explicit end control; account for the real per-zone header/bottom-nav geometry instead of adding guessed shared
  pixels when the existing shell already exposes a suitable seam/measurement.
- After a real internal navigation click, the same mounted browser iframe/render session must become the compact
  off-route surface and the existing zone-specific indicator must return to the exact call URL. Do not create a
  second renderer, iframe, coordinator, page or call-state store.
- Preserve native Jitsi/PiP ownership and terminal-only cleanup, retry behavior, the existing second-start gates,
  guest standalone behavior, responsive patient/doctor UI isolation and unchanged desktop layout.
- Extend existing seams rather than adding parallel layout logic. If a small typed prop/slot on
  `ActiveCallCoordinator` is required to supply zone geometry, keep it provider-neutral and make each shell own
  its own classes/tokens.

## Validation and completion

Run the unchanged targeted active-call/Jitsi/live tests and webapp typecheck plus scoped ESLint for changed files.
Perform a focused live mobile browser check on an isolated port if the sanctioned DEV environment permits it:
real internal navigation after iframe mount must be clickable and preserve the same iframe; return indicator and
explicit terminal cleanup must remain observable. If live instrumentation is not possible, report that honestly;
do not fake it with direct coordinator callbacks.

Inspect the final diff for one coordinator/renderer, no route-unmount dispose/hangup, no obscured terminal control,
no duplicate start path and no test changes. Stage only explicit production paths, never `git add -A`; commit all
product changes before ending and do not push. Commit message must include `#915`, why, exact checks/evidence,
M4-01/M4-04/M4-05/M4-06, and the remaining independent live recheck. Report SHA, changed files and exact results.
