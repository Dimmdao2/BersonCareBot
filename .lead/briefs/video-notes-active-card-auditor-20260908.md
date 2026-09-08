# Independent audit brief — #1100 active patient-card daily notes integration

## Тест или взгляд — обязательная первая секция аудита

Before reading any existing test, read `AGENTS.md` heading map and §10a, §10b, §11, §24.4–24.7 in full, then
read the owner checklist `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` NOTE-01..08 and UI-01/UI-07. Classify each
requirement first: observable repeated behavior uses the cheapest useful UI test only when the failure is costly
and silent; one-time integration shape, removal of the old manual form, component reuse and scope containment use
direct inspection. Write your blind kill-set before opening current tests. Do not begin by running a broad suite.

## Candidate and known pre-fix gap

Audit the exact committed candidate in the supplied clone against its merge base with
`feat/doctor-ui-rebuild`. Before the candidate, live TEST inspection showed that canonical route
`/app/doctor/patients/[userId]` rendered `PatientTabOverview.tsx` with an old append-only «Новая заметка» modal
and manual Save action, while the accepted daily autosave `DoctorNotesPanel` was mounted only on the live meeting
page and a legacy overview component.

## Required product behavior

- The actual active patient-card overview exposes its existing notes stat/modal interaction, but that modal uses
  the same `DoctorNotesPanel` and `/api/doctor/clients/[userId]/notes` daily contract as the live meeting sidebar.
- Clicking either the notes stat or its note action opens the one daily history/editor. There is no separate Add or
  Save action in this active notes surface.
- Today is the first expanded borderless textarea; earlier dates are newest-first, collapsed by default to at most
  three visual lines, expand to separate editable textareas, and preserve their date.
- Autosave remains per-date serialized/versioned and no `router.refresh`/parent reload or unstable keys are added.
  Closing/reopening the patient-card modal and switching live tabs must not create a second domain/path or lose a
  successfully autosaved daily note. Network failure must retain the local draft and retry while the editor remains
  mounted; do not invent broader persistence requirements outside NOTE-07.
- The correction changes no unrelated patient-card UI/behavior and introduces no duplicate note component,
  endpoint, service, or repository path.

## Audit permissions and deliverable

Inspect product diff, active route wiring, imports/states/handlers and scope. Existing tests must be read only after
the blind kill-set. The current `PatientTabOverview.ui.test.tsx` may encode the superseded manual-save behavior;
apply the owner rule that tests follow intentional behavior, not vice versa. You may update that existing test file
or add the minimum justified acceptance test only if §10a's costly+silent filter passes. Do not test source strings,
component names, imports, CSS class spellings, button counts or implementation calls. If a behavior test is retained,
perform one relevant fault injection and record exactly which assertion becomes red, then revert all temporary
production changes.

Do not fix product code. Findings must be reachable violations with impact and exact authority. Write one compact
audit artifact under `docs/audit/` containing the per-ID PASS/FAIL evidence, kill-set, fault-injection evidence,
commands and final verdict. Ensure only intentional test/audit artifacts remain, run only scoped checks, and commit
them with explicit staging and a `test(...)` or `docs(...)` message containing `#1100`. Do not push. Do not finish
with a foreground process running. Report exact candidate SHA, audit commit SHA, changed paths and verdict.
