# Сырой SQL-текст — fix-round карты реализации (#1082)

## Authority

- `AGENTS.md` §5, §10a, §24.
- `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md`, пункт 1.
- Target `RAW_SQL_TEXT_CENSUS.md` (`064d768d3`) и независимый FAIL-аудит `RAW_SQL_TEXT_CENSUS_AUDIT_REPORT.md` (`4366ff239` + whitespace fix `5521f607f`).

Источник оракула: `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` пункт 1 — «порт исполняет legacy `$1..$n` SQL-текст; целевое — typed Drizzle builders/schema (`select/insert/update/delete`, `sql` только для PostgreSQL-примитивов)».

## Человеческий разрыв

Неполная карта позволяет объявить уборку законченной, хотя живые auth, booking, support и entitlement пути продолжают исполнять legacy SQL text. Неверный порядок также заставит переписать код, который Track D/V9б вскоре удалит или изменит.

## Задача

Исправить только `RAW_SQL_TEXT_CENSUS.md` по готовому независимому аудиту:

1. Denominator считать AST-вызовами `runWebappPgText`, включая generic form: baseline target SHA — **557 invocation / 87 production-файлов**.
2. Добавить 43 пропущенных файла; во всех 87 строках использовать один semantic-call измеритель. Сумма строк должна быть ровно 557; исправить как минимум 3/22/52 у трёх названных аудитом строк.
3. Пересчитать TL/WAIT/DELETE partition по operation/caller reachability. Итоги категорий обязаны суммироваться в 557. Не выдавать zero producer за deletion authority.
4. Сохранить ownership overlaps D10/D15, В9б, Ч4/Ч4б, Ч7 и тарифов. Не назначать отдельный conversion slice файлу, который скоро удаляется/меняет capability boundary.
5. Первым bounded live-slice назначить `infra/repos/pgPlaybackResolutionEvents.ts` (1 semantic invocation) с существующим `runWebappSql<T>(SQL)`/Drizzle `sql` boundary и конкретным opt-in DEV-DB behavior oracle из аудита.
6. Встроить exact commands и reconciliation прямо в отчёт. Постоянный source-text test/script не создавать.

## Запрещено

- Product code, SQL conversion, schema/migrations, DB/DEV/TEST/PROD, deploy.
- Копировать старые 155/44, 117/38 или выбирать slice `pgPlatformUserCalendarTimezone`.
- Расширять Track D/V9б scope либо придумывать owner-gate.

## Acceptance

- Повторяемая AST-команда печатает 557/87 на target; parser таблицы даёт 87 rows и sum 557; category totals дают 557.
- Все 43 пропущенных файла представлены; support partition учитывает 21 projection call.
- `git diff --check` green; worker коммитит report correction и `RAW_SQL_TEXT_CENSUS_FIX_REPORT.md`.
