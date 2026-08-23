Тест или взгляд: взгляд — это разовая приёмка сгенерированного артефакта; новые тесты не писать, использовать существующий generator check и узкие тесты как дополнительное evidence.

# Audit: D25 generated port-context artifacts

## Authority and oracle

- Read `AGENTS.md` route, §10a, §10b and §24 before acting.
- Candidate: `40c4a2dfc` on `wt/d25-port-context-artifact-20260823`, base `34d681969e033cdf434af57a71bef7ee3bb7656f`.
- TEST deploy evidence: `reconcile-access.mjs` rejected the base because the committed TEST port-context artifact differed from current declaration output.
- Источник оракула: `deploy/postgres/privileges/reconcile-access.mjs` — «generator('--db', dbName, '--check', '--port-context-only');».

## Audit task

This is a one-time generated-artifact action, not new behavior and not a reason to write a new test. Independently:

1. Inspect the complete candidate diff and verify it contains only generator-derived additions required by the current declaration for both existing named DEV/TEST variants.
2. Run the existing generator's all-target port-context check and the narrow existing generation/port-context tests needed to establish determinism and catalog consistency.
3. Confirm no hand-edited mismatch, missing sibling variant, declaration/product/migration change, unexpected deletion, or change outside the two generated SQL artifacts.
4. Return binary `PASS` or `FAIL`. A failure must name a reachable consequence and exact violated authority. Do not invent further scope.

## Forbidden

- No product fix, declaration, migration, DB, TEST deploy, service, taskdb, docs, branch merge/push/delete, or worktree cleanup.
- Do not touch, inspect, merge, delete, stage, or commit any Therapysto/night/reaudit/surface-map/flashcall branch, worktree, or content.
- Do not modify or commit candidate files. Temporary inspection artifacts must stay outside Git and be removed before finishing.

## Done

- Binary verdict with exact commands and results.
- Candidate worktree remains clean at `40c4a2dfc`.
