# Independent audit: patient appointment branch timezone

## Role and authority

You are the independent auditor of candidate `b233af1d6` in branch `wt/patient-appointment-timezone-warning-20260906`. Read the full `AGENTS.md` heading map and §1 migrations/privileges, §5, §10a, §10b, §15, §17 and §24 before acting. The owner acceptance authority is `PATIENT-OVERVIEW-08/09/10` in `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` plus `.lead/briefs/patient-appointment-timezone-warning-20260906.md`.

Do not change product code. You may add/commit only genuinely missing behavioral acceptance tests and a concise audit artifact if the port requires it. Revert every fault injection. Do not push, land, deploy, use PROD, or run full CI.

## Classify before checking

- Repeated behavior: timezone conversion, offset comparison, visibility of warning, IDOR-safe data path, every patient/public appointment surface. Use behavioral tests and a kill-set prepared before reading existing tests.
- One-time state: migration contents, generated privilege reconciliation, relation-surface declaration, migration ordering and rollback-only/preflight applicability. Inspect files and run the documented check/preflight; do not write tests on SQL/source strings.
- Visual styling: no screenshot or taste-based audit. Verify only the objective DOM contract (compact warning exists/does not exist and semantic red classes/accessible text where required). The owner performs visual acceptance on TEST.

## Exact kill-set / requirements

1. Every appointment time shown to a patient is formatted in the appointment branch IANA timezone, not the business timezone or browser timezone; doctor surfaces are unchanged.
2. DST is calculated for the appointment instant, not current offset. Fractional offsets are preserved.
3. If branch and device offsets at that instant are equal, render time only: no `UTC`, no exclamation mark, no warning placeholder/flash during hydration.
4. If offsets differ, render the branch-local time plus compact red `!` and red `UTC±N` (including fractional offset notation when needed).
5. Inventory all patient and public self-booking surfaces that display a time: upcoming/history/cabinet, slot selection, confirmation, success/done. A reachable surface that still uses browser/business timezone or suppresses the required warning is a finding, not an accepted exception merely because the worker reported it.
6. Branch timezone must arrive through the existing trusted server-side booking/catalog path. Do not trust a query parameter or add a client fetch. Cross-organization/IDOR protection must remain intact.
7. Forward migration only; no generated snapshot edit; no GRANT/REVOKE inside migration. Privilege declaration must name every newly-read relation/column, especially `be_branches.timezone`, and generated DEV/TEST artifacts must reconcile exactly.
8. Invalid/missing timezone data must not fabricate a misleading offset or leak raw errors.

## Required result

Return binary PASS or FAIL. Each FAIL must give a reachable scenario, impact, exact violated item and evidence. Recommendations/style are not findings. Report exact commands and counts. If tests are added, commit them and name the SHA; otherwise leave the worktree clean.

