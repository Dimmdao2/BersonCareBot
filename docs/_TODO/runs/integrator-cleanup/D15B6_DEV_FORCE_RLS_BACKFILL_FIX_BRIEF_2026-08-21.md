# D15b/6 — named-DEV backfill под `FORCE ROW LEVEL SECURITY`

Роль: worker. Это продолжение уже принятого D15b/6 после второго canonical named-DEV rollback-only preflight;
нового product scope и нового слепого аудита нет.

Перед действием прочитать карту `AGENTS.md`, затем §1 migration rules, §5, §7, §9–§10b и §24. Повторить поиск
более поздних owner-решений в `docs/OWNER_DECISIONS.md`, `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` и актуальном
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`. Несовместимое более позднее решение — `OWNER QUESTION`,
не мягкая трактовка.

## Источник оракула

`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` D15b/6 требует: «fail-closed canonical-preservation/
parity/dependency gates снимает пять legacy contact columns» и закрывается только через «fail-closed migration
parity/drop + live login/bind/delivery proof».

После landing ordering-fix `a963cf97e` lead снова выполнил из интеграционного дерева точную команду
`bash deploy/host/migrate-dev.sh --preflight`. Preflight откатил транзакцию и завершился exit 3 на добавлении
нового `user_contacts_source_origin_check`.

Точные named-DEV read-only факты:

- `public.platform_users`: RLS enabled + forced, owner `app_object_owner`;
- `public.user_contacts`: RLS enabled + forced, owner `app_object_owner`;
- `SELECT source_origin,count(*) ...` под admin socket: `platform_users|328`;
- миграция под `app_object_owner` дошла до canonical DML, но явный origin UPDATE вернул `UPDATE 0`;
- ledger row `20260821T040000_cut_over_canonical_contacts` отсутствует; миграция не применена.

Следствие: текущий migration owner из-за `FORCE RLS` не видит строки обеих таблиц. Поэтому не только origin UPDATE,
но и preservation/parity DML в начале файла фактически no-op; при успешном обходе одного CHECK последующий drop
legacy columns мог бы потерять данные. Это блокер применения, а не отдельная архитектурная инициатива.

## Scope

Исправить только `apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql`, используя
существующую PostgreSQL/репозиторную механику владельца таблиц:

1. На время preservation/parity/backfill DML в той же транзакции снять `FORCE ROW LEVEL SECURITY` с
   `public.platform_users` и `public.user_contacts` как их `app_object_owner`.
2. До любого commit-visible состояния обязательно вернуть `FORCE ROW LEVEL SECURITY` обеим таблицам. Разместить
   возврат сразу после последнего реально исполняемого DML/parity шага; определения функций ниже не требуют
   открытой таблицы.
3. Сохранить fail-closed транзакционность: любая ошибка должна откатывать и временное снятие FORCE, и DML.
4. Не вводить BYPASSRLS/superuser runtime-role, policy-исключение, новый helper/обёртку, второй DML-root или новую
   миграцию. Не менять mapping, TypeScript, grants, declaration или live data.

Сначала проверить существующие паттерны `NO FORCE ROW LEVEL SECURITY`/`FORCE ROW LEVEL SECURITY`; не изобретать
параллельный механизм. Постоянный тест на наличие строк SQL не писать: one-off correctness доказывается точными
migration/parser/privilege gates и повторным named-DEV preflight у lead.

Проверить существующими командами:

- migration layout/order и migrator self-test;
- migration privilege/body/parser gates, включая запрет privilege DDL в migration;
- targeted D15b/6 migration tests, которые уже использовались в acceptance;
- `git diff --check`.

Никаких обращений к DEV/TEST/PROD, миграций, fixtures, disposable DB, deploy, push или full CI. Коммитить только
migration-файл явным путём, без `git add -A`.

Итог: SHA, точный diff, команды/exit codes и `NOT DONE: lead named-DEV preflight/execute/live gate`.
