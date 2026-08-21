# D15b/6 — app_object_owner DO-block language-usage marker fix

Роль: same-branch mechanical migration-metadata worker в `wt/d15b6-audit-20260821`. Это исправление exact
FAIL из `D15B6_CANDIDATE_NAMED_DEV_PREFLIGHT_RETRY3_RESULT_2026-08-21.md`, не новый этап и не новый аудит.

До действия прочитать карту `AGENTS.md`, §«Как решать, что делать», §1 migration rules, §7, §10 и §24;
повторить `code-search` и точный поиск более поздних owner-решений. Текущий oracle — live retry-3 commit
`fb52b0acf`: named DEV rollback-only preflight прошёл все 34 `app.*` function statements и упал на следующем
statement с `permission denied for language plpgsql`. Более позднее owner-решение, если найдётся, заменяет brief.

## Exact defect and scope

Файл:
`apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql`.

Exact block после `app.read_current_patient_identity_contacts()`:

```sql
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
DO $d15b6_dependencies$
```

В owner-aware migrator marker относится к одному statement block. У этого PL/pgSQL `DO` block есть owner,
но нет `-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql`, поэтому временный USAGE не выдаётся. Exact census показал:
это единственный `DO` после явного `BCB-MIGRATION-OWNER` без language marker в остатке файла.

Разрешены только:

- добавить одну строку `-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql` непосредственно после указанного owner marker;
- новый result
  `docs/_TODO/runs/integrator-cleanup/D15B6_LANGUAGE_USAGE_MARKER_FIX_RESULT_2026-08-21.md`.

Не менять SQL/DO body, statement order, owners, schema-create markers, function bodies, другие миграции, код,
tests/gates, docs/canon, DB/env/DEV/TEST/PROD или ветки.

## Gates

- `git diff --check`.
- Exact diff migration = одна добавленная metadata line, executable SQL byte-identical after stripping
  `BCB-MIGRATION-*` comment lines.
- Запустить существующие focused migration parser/order/privilege tests, которые покрывают marker handling;
  не писать новый тест на текст SQL и не запускать full CI.
- В result записать exact commands/results and `NOT DONE: named-DEV preflight retry 4 / landing / execute /
  D31 combined preflight / TEST / deploy / push / full CI`.
- Явно stage только migration + result, без `git add -A`; commit до конца хода.

Запрещено: `migrate-dev.sh`, direct `psql`, ручной SQL, DB access, `--execute`, `--reapply`, fixture,
disposable DB, landing, deploy, push, full CI.
