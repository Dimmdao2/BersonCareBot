# C3M auditor-live — client portal and symptom tracking

Read the `AGENTS.md` heading map before every action, then migration/privilege rules, §4/§4a, §5, §9,
§10/§10a/§10b, §12, §15–§19, §21, §22 and §24 in full. Read `README.md`, current roadmap C3M in full,
accepted prerequisites, patient-invite/symptom-diary docs and the candidate diff.

Taskdb workstream: `#1098`. Binding authority/checklist:
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M owner decisions, C3M-10 and C3M.8.

Источник оракула: roadmap C3M-10 — portal policy gates invite issue and linked organization-private surfaces;
`patient_tracking_enabled` independently gates patient symptom visibility/entry with compatibility true and a
create-time-only default snapshot.

## Тест или взгляд

- Portal authorization, symptom list/read/write denial, default snapshot and OFF→ON preservation are blind behavior
  tests.
- Invite/symptom controls and patient/doctor responsive surfaces are live checks; no text/DOM/count/source tests.
- Migration/backfill/index/privileges and absence of a parallel symptom policy are inspection plus owner-aware
  preflight facts.

Before existing tests, define faults for: portal OFF only hiding buttons; identity/enrollment/data deletion; other-org
portal damage; public booking gated by portal/support; `is_active` reused for patient visibility; disabled tracking
still listed/read/writable by crafted request; specialist losing the tracking/history; existing tracking backfill not
true; `off/all/on_support` create result wrong; later default or support change rewriting existing tracking; and a
per-client symptom inheritance/override being introduced.

Add only missing durable behavior tests and inject each class once. Live-check doctor/patient desktop/mobile on an
isolated port. Run targeted tests, typecheck, scoped ESLint, architecture/migration/privilege checks and diff-check;
no full CI. Commit only tests and one artifact, never product fixes. Findings require reachable impact and authority.
Explicit paths only, `#1098`, candidate SHA/evidence; never `git add -A` or push.

If an existing in-scope test encountered during the audit checks source/SQL wording, formatting, element/string
counts, DOM shape or another implementation form instead of durable behavior, remove it; do not adapt or preserve it.
