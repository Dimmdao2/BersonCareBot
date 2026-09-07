# C3M-08 auditor-live continuation after system interruption

Continue the independent C3M-08 audit in the existing dirty worktree. The previous auditor was stopped by the
host at exactly 10:30 UTC; do not restart the audit and do not discard its work. Read the AGENTS.md heading map
before every action, then §10a, §10b and §24 in full. Authority and scope remain exactly
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M-08, and
`runs/c3m-rehabilitation-audit-brief-20260907.md`.

## Тест или взгляд

- Direct route/action/API denial, parent-child resolution, hidden work and restoration are durable behavior checked
  by the already-recorded blind kill-set and targeted tests/fault injection.
- Navigation/card/catalog absence and responsive doctor/patient presentation are checked live, without UI-shape tests.
- Data preservation, temporary-mutation cleanup and one-resolver architecture are inspected directly.

First restore the interrupted work with `git stash pop stash@{0}` and verify that the stash message is
`c3m-rehabilitation-audit-system-interruption-20260907`. Then inspect the restored kill-set/tests/live script and
candidate diff. Preserve only durable behavior tests justified by the already-fixed blind kill-set. Delete any encountered in-scope test that checks source/SQL
wording, formatting, element/string counts, DOM shape, or another implementation form instead of behavior. Do not
write product fixes. Complete the remaining fault injections and isolated doctor/patient desktop/mobile live
acceptance. Remove temporary production mutations and `runs/c3m-rehabilitation-live.tmp.mjs` before committing.

Run only missing targeted validation; reuse fresh evidence and do not rerun unchanged checks. Commit explicit test
paths plus one final audit artifact with `#1098`, candidate SHA, named fault results and PASS/FAIL. Never `git add -A`,
never push, and do not end before the audit commit exists unless a concrete product defect is left as a failing
acceptance test.
