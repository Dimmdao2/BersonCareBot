# D15b/6 — исправить порядок смены `source_origin` constraint

Роль: worker. Это продолжение уже принятого D15b/6 после первого canonical named-DEV preflight; нового аудита
или нового product scope нет.

Перед действием прочитать карту `AGENTS.md`, затем §1 migration rules, §5, §7, §9–§10b и §24. Повторить поиск
более поздних owner-решений в `docs/OWNER_DECISIONS.md`, `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` и актуальном
`WORK_ORDER.md`. Несовместимое более позднее решение — `OWNER QUESTION`, не мягкая трактовка.

## Источник оракула

`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` требует fail-closed migration parity/drop для D15b/6.
Lead запустил из интеграционного SHA `bcb680e00` точную каноническую команду
`bash deploy/host/migrate-dev.sh --preflight`; rollback-only preflight остановился:
`ERROR: check constraint "user_contacts_source_origin_check" of relation "user_contacts" is violated by some row`.

Живое read-only evidence named DEV:

```text
constraint = CHECK (source_origin = ANY (ARRAY['platform_users','oauth_binding','phone_history']))
source_origin population = platform_users|328
migration ledger row for 20260821T040000_cut_over_canonical_contacts = absent
```

## Scope

В `apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql` исправить только порядок
смены constraint: старый check должен быть снят до UPDATE, переводящего historical origins в `direct`/`oauth`,
а новый check добавлен после UPDATE. Сохранить одну транзакцию и fail-closed семантику; не менять mapping,
контакты, права, функции или любой TypeScript.

Проверить существующими командами:

- migration layout/order и migrator self-test;
- migration privilege/body/parser gates;
- `git diff --check`.

Новый постоянный тест на строки SQL не писать: это one-off migration ordering, lead повторит тот же живой
rollback-only preflight. Никаких обращений к DEV/TEST/PROD, миграций, fixtures, disposable DB, deploy, push или
full CI. Коммитить только migration-файл явным путём, без `git add -A`.

Итог: SHA, точный diff, команды/exit codes и `NOT DONE: lead named-DEV preflight/execute/live gate`.
