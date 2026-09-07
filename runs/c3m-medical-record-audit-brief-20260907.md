# C3M auditor-live — medical record independence

Read the `AGENTS.md` heading map before every action, then §4/§4a, §5, §9, §10/§10a/§10b, §12, §16, §17,
§21, §22 and §24 in full. Read `README.md`, current roadmap C3M in full, accepted C3M-01/03/04/06 code, the
medical-record module docs and the candidate diff.

Taskdb workstream: `#1098`.

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M-07a — medical record
OFF independently hides/denies longitudinal symptoms, diagnoses, anamnesis and problem history while preserving
clients, basic Overview notes, tasks, appointments, encounters, files/account and all stored history.

## Тест или взгляд

- Direct page/action/API denial, conditional data bootstrap and four module-combination behavior are stable and may
  receive blind behavior tests.
- Card/tab/widget/CTA absence and responsive layout are live visual checks; no text/DOM/count/source/snapshot tests.
- Data preservation and absence of a second guard formula are service/repository/diff inspection, not source scans.

Before reading existing tests, define faults for: medical data still loading or mutating while OFF; encounters being
disabled with medical record; medical record being disabled with encounters; always-on notes/tasks/appointments or
files/account disappearing; direct API bypass; OFF→ON losing stored data; tenant/capability guard regression; and a
parallel feature formula bypassing the accepted resolver. Verify all four `medical_record × encounters` states.

Add only missing durable behavior tests and fault-inject each independent class once. Perform live desktop/mobile
acceptance on an isolated port. Run targeted tests, typecheck, scoped ESLint, architecture checks and diff-check; no
full CI. Commit only acceptance tests and one audit artifact, never product fixes. Findings need a reachable impact
and violated owner requirement/repo rule. Explicit paths only, `#1098`, candidate SHA/evidence; never `git add -A`
or push.
