# Повторный аудит исправленного raw-SQL census (#1082)

Тест или взгляд: **разовая измерительная проверка** — независимо повторить AST census, арифметику таблицы и caller/category выборку; permanent source-text test не создавать.

## Authority

- `AGENTS.md` §5, §10a, §24.
- `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md`, пункт 1 «сырой SQL как текст».
- Первичный FAIL `4366ff239`/`5521f607f` и report `docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS_AUDIT_REPORT.md`.
- Fix candidate `763b899cc` и `RAW_SQL_TEXT_CENSUS_FIX_REPORT.md`.

Источник оракула: первичный audit потребовал единый semantic denominator `557 invocations / 87 production files`, включение 43 пропущенных файлов, исправление трёх row-counts и безопасный первый slice без overlap.

## Gate

1. Не использовать числа fix-report как вход: независимо повторить TypeScript AST walk по production `runWebappPgText` CallExpression, включая generic calls.
2. Проверить 87 per-file rows, отсутствие omitted/duplicate paths и точную сумму 557.
3. Проверить partition `TL + WO + DO + EX = 557`, отдельно mixed `pgSupportCommunication` и три исправленных row-counts.
4. Выборочно восстановить callers/categories для всех 43 ранее пропущенных файлов и всех mixed rows; `WAIT_OVERLAP` обязан называть живой owner-stage.
5. Проверить, что первый slice `pgPlaybackResolutionEvents.ts` — один reachable call, не пересекается с В9б/Track D/тарифами и имеет существующий Drizzle boundary и настоящий behavior oracle.

## Ограничения и verdict

- Product code, conversion, migration, DB/DEV/TEST/PROD/deploy, plan-checkbox и push запрещены.
- Аудитор может добавить только `RAW_SQL_TEXT_CENSUS_REAUDIT_REPORT.md`; product/doc fix не делает.
- PASS только если все пять gates воспроизводятся; иначе named FAIL и один bounded fix-round.

