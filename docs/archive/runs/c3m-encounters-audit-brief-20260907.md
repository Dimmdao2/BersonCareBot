# C3M auditor-live — encounters independence

Read the `AGENTS.md` heading map before every action, then §4/§4a, §5, §9, §10/§10a/§10b, §12, §16, §17,
§21, §22 and §24 in full. Read `README.md`, current roadmap C3M in full, accepted C3M-01/03/04/06/07a code,
encounter/clinical module docs and the candidate diff.

Taskdb workstream: `#1098`.

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M-07b — encounters OFF
independently hides/denies start/history and visit-bound examination, interventions and prescriptions while
appointments, medical record and stored encounter history remain.

## Тест или взгляд

- Direct page/action/API denial, conditional encounter bootstrap and four medical-record/encounter combinations are
  stable behavior suitable for blind tests.
- CTA/history/tab visibility and responsive layout are live checks; no text/DOM/count/source/snapshot tests.
- Data preservation and one-resolver architecture are service/repository/diff inspection.

Before existing tests, define faults for: start/history or visit-bound mutations usable while OFF; medical record
being removed with encounters; encounters being removed with medical record; booking/appointments disappearing;
direct API bypass; hidden encounter preload; OFF→ON history loss; and duplicated guard formulas. Recheck all four
`medical_record × encounters` states against the accepted C3M-07a candidate.

Add only missing durable behavior tests and fault-inject each class once. Perform live desktop/mobile acceptance on
an isolated port. Run targeted tests, typecheck, scoped ESLint, architecture checks and diff-check; no full CI.
Commit only tests and one audit artifact, never product fixes. Findings need reachable impact plus authority. Explicit
paths only, `#1098`, candidate SHA/evidence; never `git add -A` or push.

If an existing in-scope test encountered during the audit checks source/SQL wording, formatting, element/string
counts, DOM shape or another implementation form instead of durable behavior, remove it; do not adapt or preserve it.
