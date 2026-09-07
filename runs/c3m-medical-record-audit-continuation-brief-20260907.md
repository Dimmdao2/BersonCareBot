# C3M auditor-live continuation — medical record independence

Read the `AGENTS.md` heading map before every action, then §9, §10/§10a/§10b and §24 in full. Read
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` C3M-07a, candidate commits `366f65f63` and
`c8974edac`, the original brief `runs/c3m-medical-record-audit-brief-20260907.md`, and the prior run record
`/home/dev/brain/runs/agent-port/c3m-medical-record-audit-20260907.json` before acting.

Taskdb workstream: `#1098`.

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M-07a — medical record OFF
independently hides and denies longitudinal symptoms, diagnoses, anamnesis and problem history while preserving
encounters, clients, basic Overview notes, tasks, appointments, files/account and stored history.

## Тест или взгляд

This is continuation of the already performed first blind audit, not a second blind pass. The interrupted audit
completed the desktop/mobile 2×2 live matrix, OFF→ON preservation check and production fault-injection work, then
restored the live organization to ON/ON and reverted all temporary production edits. Reuse that evidence; do not
repeat live work or the blind kill-set without a new surface.

Continue only the unfinished tail:

1. Inspect the two committed acceptance-test changes and confirm there are no temporary production modifications.
2. Correct the test-local GET request helper defect that currently creates a body for GET/HEAD. This is audit-test
   repair, not a product fix.
3. Run the same route/bootstrap oracle to green, then only missing scoped typecheck/ESLint/architecture/diff gates.
4. Classify any product failure as a reachable finding; do not fix production code. Do not add UI text/DOM/count,
   source-text, SQL-text, snapshot or formatting tests.
5. Write one audit artifact under `runs/` containing the original blind faults, fault-injection outcomes recovered
   from the prior record, live 2×2 evidence, exact commands/results, candidate SHA and a binary C3M-07a verdict.
6. Commit only the test correction and audit artifact with explicit paths and `#1098`. Do not push. Do not finish
   before the commit exists.

