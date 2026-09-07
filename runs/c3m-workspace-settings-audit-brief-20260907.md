# C3M auditor-live — workspace settings UI

Read the `AGENTS.md` heading map before every action, then §4/§4a, §5, §9, §10/§10a/§10b, §12, §16, §17,
§21, §22 and §24 in full. Read `README.md`, the whole C3M section of
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, accepted C3M-01/03 code, this branch's complete
product diff and the settings UI guides before testing.

Taskdb workstream: `#1098`.

Источник оракула: roadmap C3M-04 — one canonical «Рабочее пространство» section, module switches, channel
defaults, symptom create-time default, the two terminology choices, dependency states and removal of duplicate
Account write UI; presets remain owner-gated.

Audit the existing product candidate only. Do not implement fixes, tariff logic, presets or later module wiring.

## Тест или взгляд

- Parser/versioning, compatibility defaults, organization scoping, canonical validation and atomic multi-setting
  save/reload are repeatable behavior: blind service/route tests are appropriate.
- Wording, control layout, Select labels, unavailable/disabled presentation, responsive behavior and absence of a
  duplicate visible editor are live visual checks. Do not write tests for strings, DOM shape, source files, counts,
  CSS or function formatting.
- Absence of preset/tariff/profession logic and a second settings owner is a one-time diff/architecture inspection;
  do not pin it with source-text tests.

## Blind kill-set

Write the named faults before reading existing tests. At minimum cover:

1. Missing structured settings show the accepted compatibility values: all available modules visible, direct chat
   `all`, symptom `all`, legacy comments/media true→`all`, false/absent→`on_support`.
2. Malformed persisted composition/defaults do not silently broaden behavior; canonical parse/write boundaries
   reject or fail by the accepted foundation contract.
3. One save cannot partially persist modules/defaults/terms; a mid-batch repository failure leaves the prior set
   intact, and a successful save/reload returns the same organization-scoped values.
4. Organization A never reads or overwrites organization B settings, and organization context is mandatory.
5. Workspace preference cannot offer/effectively enable unavailable functionality; parent OFF makes rehabilitation
   children ineffective without overwriting their stored choices.
6. The canonical settings hub owns all four groups of data; Account no longer offers the old duplicate defaults
   editor/write path.
7. No preset content, tariff/add-on/domain, role/profession or solo/clinic behavior was introduced.

Inspect the complete diff after writing the kill-set, then existing tests. Add only missing stable behavior tests.
Each named behavioral fault must be caught by a test under a production-code fault injection, or be handed off as a
failing acceptance test. Reuse a single route/service oracle where possible. Visual requirements are accepted live
on an isolated port with ordinary DEV login; do not occupy the shared dev server.

Run targeted tests, webapp typecheck, scoped ESLint and `git diff --check`; no full CI. Findings require a reachable
scenario, impact and violated owner requirement/repo rule. Commit only auditor-created tests and one audit artifact,
never product fixes. Use explicit paths, `#1098`, candidate SHA and exact evidence; never `git add -A`, never push.
