# C3M auditor-live — rehabilitation module closure

Read the `AGENTS.md` heading map before every action, then §4/§4a, §5, §9, §10/§10a/§10b, §12, §15–§20,
§21, §22 and §24 in full. Read `README.md`, current roadmap C3M in full, accepted prerequisite slices,
treatment-program/rehabilitation/comment/media module docs and the full candidate diff.

Taskdb workstream: `#1098`.

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M-08 — rehabilitation OFF
hides and denies the patient-card LFK/program surfaces, the complete specialist LFK catalog cluster and dependent
program comment/media surfaces without deleting data.

## Тест или взгляд

- Direct routes/actions/APIs, dependency enforcement, hidden bootstrap/jobs/notifications and OFF→ON restoration are
  stable behavior for blind tests.
- Navigation/card/catalog absence and responsive layout are live checks; no text/DOM/count/source/snapshot tests.
- Data preservation and one-resolver architecture are diff/service inspection.

Before existing tests, define faults for: only the LFK tab disappearing while catalog/program routes remain;
comment/media children remaining effective; direct doctor/patient API bypass; hidden comment/media feeds, badge jobs
or notifications continuing; rehabilitation OFF damaging notes/tasks/appointments/medical record/encounters;
OFF→ON losing program/session/comment/media data; and preference overwriting stored child choices. Include two-org
authorization and unavailable-capability non-expansion.

Add only missing stable behavior tests and fault-inject each class once. Live-check doctor and patient desktop/mobile
on an isolated port. Run targeted tests, typecheck, scoped ESLint, architecture checks and diff-check; no full CI.
Commit only tests and one audit artifact, never product fixes. Findings require reachable impact and authority.
Explicit paths only, `#1098`, candidate SHA/evidence; never `git add -A` or push.

If an existing in-scope test encountered during the audit checks source/SQL wording, formatting, element/string
counts, DOM shape or another implementation form instead of durable behavior, remove it; do not adapt or preserve it.
