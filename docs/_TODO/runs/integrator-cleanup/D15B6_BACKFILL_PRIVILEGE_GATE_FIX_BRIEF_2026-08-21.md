# D15b/6 — вернуть canonical BACKFILL path и зелёный privilege gate

Роль: worker/fixer в той же ветке `wt/d15b6-audit-20260821`. Это продолжение D15b/6 после не принятого коммита
`b6bf89f2d`: новый product scope, новый blind audit и новая миграция запрещены.

Перед действием прочитать карту `AGENTS.md`, затем §1 migration rules, §5, §7, §9–§10b и §24; снова проверить
более поздние owner-решения в `docs/OWNER_DECISIONS.md`, `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` и актуальном
`WORK_ORDER.md`.

Источник оракула: `AGENTS.md` §1 — data-only migration statement использует
`-- BCB-MIGRATION-BACKFILL`, а RLS/privilege state принадлежит declaration/reconcile; D15b/6 в `WORK_ORDER.md`
требует fail-closed preservation/parity перед удалением legacy contact columns.

## Точный дефект

Коммит `ae0749576` уже перевёл preservation/parity/normalization DML на существующий
`BCB-MIGRATION-BACKFILL` executor и прошёл migration layout/order, parser/migrator и privilege gates. Следующий
коммит `b6bf89f2d` добавил два `NO FORCE ROW LEVEL SECURITY` и два `FORCE ROW LEVEL SECURITY`. Это нарушает
канонический `check-migration-privileges.mjs`: RLS state не меняется migration-файлом.

## Scope

Изменить только `apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql`:

1. Удалить ровно четыре RLS-flag statements и относящийся к ним комментарий/лишние breakpoints из `b6bf89f2d`.
2. Сохранить `BCB-MIGRATION-BACKFILL` на всех data-only preservation/parity/normalization statements из
   `ae0749576`; не возвращать их к `app_object_owner`, который под FORCE RLS видит ноль строк.
3. Не менять SQL mapping, проверки паритета, constraint ordering, функции, TypeScript, declaration, grants,
   policies или мигратор. Не добавлять BYPASSRLS, helper, вторую миграцию или второй DML-root.

Проверить существующими командами: migration layout/order, migrator self-test, privilege/body/parser gates,
сохранённые targeted D15b/6 migration tests и `git diff --check`. `node scripts/check-migration-privileges.mjs`
обязан завершиться exit 0. Постоянный source-string test не писать.

Не обращаться к DEV/TEST/PROD, не выполнять migration/preflight/deploy, не создавать fixture/disposable DB, не
запускать full CI и не push. Lead после зелёного кандидата отдельно выполнит owner-aware rollback-only preflight
из exact candidate checkout на named DEV **до landing**.

Коммитить только migration-файл явным путём без `git add -A`. В отчёте: SHA, точный diff, команды/exit codes и
`NOT DONE: lead candidate named-DEV rollback-only preflight / landing / execute / live gate`.
