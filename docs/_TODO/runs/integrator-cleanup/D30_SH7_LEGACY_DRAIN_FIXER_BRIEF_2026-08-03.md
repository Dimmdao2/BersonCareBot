# Fixer D30 Ш7 — убрать единственный raw-SQL finding аудита

Прочитать `AGENTS.md` §5 и §24, product `a521ca4d2`, saved audit/tests `87a4b3f5c` и
`docs/_TODO/runs/integrator-cleanup/D30_SH7_LEGACY_DRAIN_INDEPENDENT_AUDIT_2026-08-03.md`.

## Выполнить

Исправить единственный finding аудита, а не пересказать его:

1. В `reclaimStaleMessageRetryJobProcessing` сохранить тот же атомарный параметризованный CTE, lease boundary,
   `FOR UPDATE SKIP LOCKED`, update и return count.
2. Убрать reachable `runIntegratorSql` → `DbPort.query` path. Выполнить Drizzle `sql` fragment через существующую
   repository Drizzle session/adapter по канону §5. Не добавлять новый raw SQL helper/allowlist.
3. Не менять table/consumer/payload/next_try_at/attempts/cadence/config, не добавлять migration и не трогать среды.
4. Повторить saved audit concurrency test, legacy consumer tests, no-producer/raw-SQL/queue/import gates,
   integrator typecheck/lint и `git diff --check`.
5. Один fixer commit в существующей `wt/trackd-d30-sh7-drain`, дерево clean. Новых тестов и нового blind audit нет.

Источник оракула: saved audit — «keep the atomic CTE semantics, but execute the Drizzle `sql` fragment through
the existing Drizzle repository session rather than `runIntegratorSql` / `DbPort.query`».

Не трогать DEV/TEST/PROD, deploy, D27, тарифы/CMS, общий `feat` и migration board.
