# D18: fresh current census and one coherent value-bearing builder conversion

Role: complex worker. Read `AGENTS.md` headings first, then §5, §10, §24, current Track D `WORK_ORDER.md` D18 and `docs/_TODO/TEXT_SQL_TO_BUILDER_PLAN_2026-08-19.md` in full.

Источник оракула: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — «по ходу плана надо вычистить весь остаток сырого sql — то что не миграции и не корректно идёт в дриззл обёртку».

Additional current authority:

- `WORK_ORDER.md` owner decision 21.08 removes every active Track D «не сейчас» defer.
- `docs/_TODO/TEXT_SQL_TO_BUILDER_PLAN_2026-08-19.md` records the owner's rationality boundary: «Надо быть рациональным.»
- Current broad exact census on integration:
  `rg -l "runWebappPgText\s*[<(]|webappSqlFromPgText\s*[<(]|runPgPoolPgText\s*[<(]" apps/webapp/src apps/integrator/src packages --glob "*.ts" --glob "!*.test.ts" --glob "!*.spec.ts" | wc -l`
  returned `75`; this is a candidate set, not 75 defects. The old plan's 57/24/26/7 totals are stale and must not remain as a second active oracle.

## Whole-stage scope

1. Re-run the exact current census from this isolated clean branch and classify every candidate as one of:
   - bridge/low-level DB adapter with no domain query to convert;
   - SECURITY DEFINER/RPC or complex SQL where builder gives no safety/readability gain;
   - value-bearing ordinary table CRUD/lookup that should move to existing Drizzle schema/query builder;
   - actual production bypass outside the allowed port boundary (must be fixed, not documented as allowed).
2. Do not confuse D18's already-green `production debt: 0` boundary with this separate text-to-builder quality pass. A call can be correctly inside the DB port and still be worth converting; a legal RPC wrapper can remain text without becoming debt.
3. Convert the complete current **value-bearing ordinary CRUD/lookup bucket in one coherent pass**, not a tiny arbitrary slice. Use existing schema exports and existing DB-port execution paths. Do not create a second bridge, second channel/query list or broad helper when the existing point can be parameterized.
4. Do not convert pure RPC calls, migrations/deploy SQL, low-level bridge implementations or genuinely complex SQL merely to reduce a count. For each retained production file, state the concrete reason.
5. Replace stale active counts/classification in `TEXT_SQL_TO_BUILDER_PLAN_2026-08-19.md` with the current result; preserve historical commands/evidence only when clearly historical, never old-then-new as two active instructions. Update the D18 checklist only to the state actually proven by code and gates.
6. Preserve behavior. Add/update focused tests for changed repositories and run their suites, webapp/integrator/platform-merge typechecks as applicable, `node scripts/check-no-new-raw-sql.mjs`, and `git diff --check`.
7. Add a concise result artifact next to this brief, stage only explicit paths, and commit before finishing.

## Excluded concurrent files

Do not modify:

- `apps/webapp/src/modules/reminders/materializePatientReminderDeliveries.ts` or the post-D31 CI-fix report/brief;
- `deploy/postgres/privileges/**`, generated privileges, D15 migrations or the D15 TEST reconcile repair report/brief;
- any DB, TEST/DEV/PROD, fixture/account/data, deployment or migration state.

No disposable database, no fixtures, no direct SQL against a live database, no deploy, no push and no full CI. If the complete ordinary-CRUD bucket is too large for one safe pass, stop with exact dependency/file groups and a named blocker; do not silently deliver a micro-slice as the stage.

Done means: the candidate set is freshly and completely classified, all current value-bearing ordinary CRUD/lookup conversions are implemented or an exact blocker is named, retained text SQL has concrete rational reasons, targeted gates are green, active plan/checklist has one current formulation, tree is clean and commit SHA is reported.
