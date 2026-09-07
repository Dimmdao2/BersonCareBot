# C3M auditor-live — one support group and terminology UI

Read the `AGENTS.md` heading map before every action, then §4/§4a, §5, §9, §10/§10a/§10b, §12, §15–§18,
§21, §22 and §24 in full. Read `README.md`, current roadmap C3M in full, the terminology inventory/design, all
accepted prerequisites and the candidate diff.

Taskdb workstream: `#1098`. Binding authority/checklist:
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M owner decisions, C3M-11 and C3M.8.

Источник оракула: roadmap C3M-11 — one existing `onSupport` group shown as star/filter under the selected name;
central Clients/Patients and Favorites/On support terminology across inventoried surfaces; existing support panel
with tri-state channel/portal overrides and explicit reset-to-default; no second mechanic or booking policy.

## Тест или взгляд

- Organization-scoped membership/override persistence, policy source/effective result and reset-to-default are blind
  behavior tests.
- Visible terminology, grammar, star/filter affordance, panel usability and desktop/mobile consistency are live
  inventory checks. Never create string/DOM/count/snapshot/source-scan tests.
- Absence of a second group/dictionary and booking coupling is diff/architecture inspection.

Before existing tests, define faults for: favorite separate from `onSupport`; group rename mutating data; incomplete
organization isolation; client override losing true inherit/reset; explicit allow/deny not winning; inherited
on-support not following membership; parent OFF overwriting stored choice; portal becoming support-group default;
booking/prepayment/schedule consulting membership; and hardcoded visible terminology remaining in an inventoried
active surface.

Add only missing stable policy tests and inject each behavioral class once. Check terminology and controls live on
doctor/patient desktop/mobile using an isolated port. Run targeted tests, typecheck, scoped ESLint, architecture
checks and diff-check; no full CI. Commit only tests and one artifact, never product fixes. Findings need reachable
impact and authority. Explicit paths only, `#1098`, candidate SHA/evidence; never `git add -A` or push.

If an existing in-scope test encountered during the audit checks source/SQL wording, formatting, element/string
counts, DOM shape or another implementation form instead of durable behavior, remove it; do not adapt or preserve it.
