# D18: RETIRED — DO NOT EXECUTE this brief's former whole-bucket conversion

**Статус 21.08 (позднее): этот бриф отозван.** Прежний whole-stage scope ниже (полная переклассификация и
конвертация «complete value-bearing ordinary CRUD/lookup bucket in one coherent pass») — НЕ выполнять. Он
описывал широкую конвертацию, которая была реализована как `f7ef75996` (независимый аудит `56b7077dc`) и
отклонена: write/transaction-поведение и rollback не были доказаны. Клон
`/home/dev/dev-projects/bcb-wt-d18-current-builder-20260821` сохранён только для read-only инспекции, не
landing candidate.

**Текущий источник scope и статуса D18** — `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`
(D18/D18a/D18b/D18c) и `docs/_TODO/TEXT_SQL_TO_BUILDER_PLAN_2026-08-19.md` («Текущая инструкция»): D18 закрыт
как единый DB-port/Drizzle execution boundary с production bypass debt: 0; остаток текстового SQL внутри уже
легального моста — рациональная maintenance-работа (D18b) по мере того, как файл и так трогается по
продуктовой причине, или при найденном конкретном дефекте поведения/безопасности/schema-drift — не сплошной
конвертацией по счётчику. Не заводить новый whole-bucket проход как Track D работу.

Единственный принятый пример из отклонённой попытки — `pgUserProjection.ts`, приземлён отдельно `c5e77210a`.

---

## Исторический текст брифа (не исполнять)

Role: complex worker. Read `AGENTS.md` headings first, then §5, §10, §24, current Track D `WORK_ORDER.md` D18 and `docs/_TODO/TEXT_SQL_TO_BUILDER_PLAN_2026-08-19.md` in full.

Источник оракула: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — «по ходу плана надо вычистить весь остаток сырого sql — то что не миграции и не корректно идёт в дриззл обёртку».

Additional current authority (историческая, на момент составления брифа 21.08):

- `WORK_ORDER.md` owner decision 21.08 removes every active Track D «не сейчас» defer.
- `docs/_TODO/TEXT_SQL_TO_BUILDER_PLAN_2026-08-19.md` records the owner's rationality boundary: «Надо быть рациональным.»
- Census on integration at brief authoring time: 75 (stale; see current plan for the current number).

### Former whole-stage scope (RETIRED, do not execute)

1. Re-run the exact current census from this isolated clean branch and classify every candidate as one of:
   - bridge/low-level DB adapter with no domain query to convert;
   - SECURITY DEFINER/RPC or complex SQL where builder gives no safety/readability gain;
   - value-bearing ordinary table CRUD/lookup that should move to existing Drizzle schema/query builder;
   - actual production bypass outside the allowed port boundary (must be fixed, not documented as allowed).
2. Do not confuse D18's already-green `production debt: 0` boundary with this separate text-to-builder quality pass.
3. Convert the complete current **value-bearing ordinary CRUD/lookup bucket in one coherent pass**, not a tiny arbitrary slice.
4. Do not convert pure RPC calls, migrations/deploy SQL, low-level bridge implementations or genuinely complex SQL merely to reduce a count.
5. Replace stale active counts/classification in `TEXT_SQL_TO_BUILDER_PLAN_2026-08-19.md` with the current result.
6. Preserve behavior. Add/update focused tests, run typechecks, `node scripts/check-no-new-raw-sql.mjs`, `git diff --check`.
7. Add a concise result artifact, stage only explicit paths, commit before finishing.

This whole-bucket scope produced the rejected `f7ef75996`/`56b7077dc` attempt above and is retired.
