# D15b/6 — исправить реальный порядок source_origin constraint после candidate DEV FAIL

Роль: same-branch worker/fixer в `wt/d15b6-audit-20260821`. Authority — D15b/6 в актуальном `WORK_ORDER.md`,
сохранённый audit kill-set и live FAIL artifact
`D15B6_CANDIDATE_NAMED_DEV_PREFLIGHT_RESULT_2026-08-21.md` (`d962a1173`). Новый scope, новая миграция,
blind audit и DB-действия воркеру запрещены.

Перед действием прочитать карту `AGENTS.md`, затем §1 migration rules, §5, §7, §9–§10 и §24; снова проверить
более поздние owner-решения в `docs/OWNER_DECISIONS.md`, `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` и актуальном
`WORK_ORDER.md`.

Источник оракула: `AGENTS.md` §1 требует owner-marked atomic forward migration и candidate rollback-only DEV
preflight до landing; D15b/6 требует fail-closed preservation/parity до удаления legacy columns. Точный live
oracle: candidate preflight exit `3` на старом `user_contacts_source_origin_check` до apply/ledger.

## Два точных дефекта одного порядка

1. Текущий migration сначала делает два INSERT с `source_origin='direct'`, а старый DEV constraint в generated
   schema ещё разрешает только `platform_users`/`oauth_binding`/`phone_history`. DROP стоит лишь после всех
   preservation/parity statements, поэтому первый INSERT закономерно падает.
2. Коммит `5e39a82ce`, удаляя запрещённые RLS-state statements, вместе с ними удалил необходимый
   `--> statement-breakpoint` между BACKFILL normalization UPDATE и owner-marked ADD CONSTRAINT. В итоге ADD
   попал в один block с BACKFILL statement.

## Scope

Изменить только `apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql`:

- перенести существующий owner-marked
  `ALTER TABLE public.user_contacts DROP CONSTRAINT user_contacts_source_origin_check` из текущего места сразу
  после read-only ownership-conflict DO и **до первого INSERT**, сохранив отдельные statement breakpoints;
- вернуть ровно один `--> statement-breakpoint` после normalization UPDATE и перед owner-marker нового
  `ADD CONSTRAINT`;
- старый constraint остаётся активен во время ownership-conflict read; вся последующая preservation,
  normalization и установка нового direct/oauth constraint остаются в одной транзакции wrapper и rollback при
  любой ошибке.

Не менять SQL mapping, data values, RLS state, BACKFILL markers, functions, TypeScript, schema declaration,
grants/policies, migrator или wrapper. Не добавлять `IF EXISTS`, новую миграцию, helper или test на строки.

Проверить существующими migration layout/order, migrator self-test, privilege/body/parser gates, targeted D15b/6
migration tests и `git diff --check`; дополнительно вручную показать порядок блоков вокруг ownership→DROP→INSERT и
UPDATE→breakpoint→ADD. Не обращаться к DEV/TEST/PROD, не выполнять preflight/migration/deploy, не создавать
fixture/disposable DB, не запускать full CI и не push. Lead после статического PASS повторяет exact candidate
rollback-only named-DEV preflight **до landing**.

Коммитить только migration-файл явным путём без `git add -A`. В отчёте: SHA, exact diff, команды/exit codes и
`NOT DONE: lead candidate named-DEV rollback-only preflight / landing / execute / live gate`.
