# Live fixture retirement — Pass 5 exact correction (2026-08-21)

Role: same-branch documentation worker on `wt/live-fixtures-retirement-20260821`.

Источник оракула: `docs/OWNER_DECISIONS.md` §«Что A→B имеет право нести в целевую базу» — «отдельное
fixture-наполнение для проверок на live DEV/TEST запрещено».

Read the `AGENTS.md` heading map, then §0, §12 and §24. Before editing, repeat code-search and exact search for a
later owner ruling; a later ruling replaces this brief.

## Saved acceptance gap

The Pass-5 brief required removing the struck retired operator-packet gates from the active A1/product-smoke plan.
Commit `27ee94f9f556490998a8202d1456d5ed39f83cd1` left these two active-file blocks at
`docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md:474-489`:

- `Confirm an owner/operator-managed product smoke fixture file path is supplied`;
- `Run every read scenario in saas-product-smoke-contract.json`.

Their replacement/current route is already stated immediately above and in the Phase A1 retirement note. Keeping
the struck blocks in the current plan is the exact old-then-new ambiguity the brief forbids.

## Exact scope

1. Delete only those two complete struck fixture-gate blocks from
   `docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md`. Do not edit the surrounding real open D3 requirements.
2. Correct the Pass-5 section of
   `docs/_TODO/runs/integrator-cleanup/LIVE_DEV_TEST_FIXTURES_RETIREMENT_2026-08-21.md`: remove the claim that these
   rows were already closed by Pass 3/4, record this exact correction, and refresh the exact remaining-match census.
3. Append the result to that existing result file; do not create another result file.

No code, migration, DB, DEV/TEST/PROD, fixture, account, login, deploy, CI, push or landing. No new test or audit
cycle: this is the one mechanical correction to the already identified failed acceptance item. Do not touch
historical audit/evidence/log records or ordinary unit-test fixtures.

Run exact scoped `rg`, branch-wide `git diff --check feat/doctor-ui-rebuild...HEAD`, stage only the two changed
files plus this brief, commit before ending, and leave the tree clean. Report SHA and exact commands.
