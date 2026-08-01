# Single-entry пункт 1 — актуальный census SQL как legacy text в webapp

## Роль и authority

Ты bounded research worker; production code не меняешь. До действий прочитай `AGENTS.md` (§5, §7, §9, §24),
`docs/ORCHESTRATION_BINDINGS.md`, пункт 1 single-entry, действующие Track D D18/D10 решения и существующие
`docs/INTEGRATOR_DRIZZLE_MIGRATION/**` только как исторический контекст, не как текущий oracle.

Источник оракула: `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md`, пункт 1 — «Порт исполняет
`runWebappPgText`, то есть легаси-текст `$1..$n`, а не построитель запросов. “Запросы мимо порта” закрыты,
“сырой SQL” как текст — нет».

Scope — production `apps/webapp/src/**` на выданном свежем `feat`; integrator ведёт сосед, media-worker имеет
отдельную уже проверенную port-ветку, tests/scripts/migrations/deploy/packages сюда не включать. DB/server/DEV/
TEST/PROD/deploy/push запрещены.

## Зачем

Нельзя механически переводить 155 вызовов, не увидев, какие человеческие пути они держат и какой код будет
удалён Track D. Работа называется последствием: живой путь остаётся на строковом `$1..$n` SQL без typed fragment/
schema boundary; мёртвый projection transport не переводится, а удаляется в своём каноническом этапе.

## Обязательный результат

Сначала лично получи baseline точными командами (ожидаемый стартовый замер оркестратора — 44 production files,
155 `runWebappPgText(` calls; не копируй числа). Для каждого файла и каждой операции зафиксируй:

- human/domain path и read/write/transaction/lock semantics;
- таблицы, сложные SQL-конструкции и существующие tests;
- есть ли уже Drizzle schema/query-builder/`sql` fragment pattern, который можно переиспользовать;
- Track D / уже согласованное удаление / соседний тарифный overlap;
- вердикт: `TRANSLATE_LIVE`, `DELETE_BY_OWNER_STAGE`, `WAIT_OVERLAP`, либо доказанное `LOW_LEVEL_EXEMPT`;
- минимальный независимый execution slice и acceptance, который ловит перестановку параметров/потерю transaction,
  lock, RLS principal, return shape или idempotency.

Не называй весь файл одним site, если в нём несколько разных операций. Но execution slices группируй по одному
доменному контракту, а не «по 10 файлов». Сначала удаление, затем перевод оставшегося; не создавать новый SQL
parser, второй DB port или параллельную schema-копию.

## Доказательство пустых/спорных результатов

Для связи с Track D: точный поиск идентификаторов, `code-search`, обратные ссылки в WORK_ORDER/manifest/report.
Для «нет schema/test/caller» перечисли exact поиски. Сверь, что текущий `check-no-new-raw-sql` защищает только
`.query` door и не выдавай его за gate строкового SQL.

Отчёт: `docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS.md`. В конце: command-backed totals, таблица slices в
порядке исполнения, суммарная сверка каждого site ровно в одной категории, `НЕ ПРОВЕРЕНО`, и готовый bounded
brief первого безопасного live-slice. Один docs-only commit с `#1082`, чистое дерево; plan checkbox не менять.
