# Самоотчёт prod-to-target cutover — 2026-08-20

## Итог

`deploy/postgres/prod-to-target-cutover.sql` теперь ведёт один именованный протокол всей A → B
миграции: 7 фаз, 6 шагов подготовки, 24 шага переноса данных и 5 шагов завершения. Перед каждым
шагом печатается заметный banner, после каждого — одна именованная строка
`SELECT json_build_object(...) AS <step_name>`. В конце, после успешного `COMMIT` либо `ROLLBACK`,
печатается один `prod_to_target_cutover_closing_summary` со всеми результатами и итоговым состоянием.

`cutover_mode` принимает только `commit` и `dryrun`; отсутствие переменной означает `commit`. Любое другое
значение останавливается до начала cutover с именем `CUTOVER MODE VALIDATION` и SQLSTATE `22023`.

Главный практический результат dry run: в день переезда можно выполнить весь cutover на реальной production-БД,
получить полный протокол и итоговое состояние, а затем откатить единственную транзакцию, ничего из неё не сохранив.
Включённый `prod-to-target-carry-legacy-appointments.sql` теперь не делает внутренний `COMMIT`, когда вызван через
основной entrypoint; его самостоятельный режим по-прежнему сам открывает и закрывает транзакцию. Без этого
изменения dry run не был бы свободным.

## Что теперь говорит каждый шаг

### Фазы entrypoint

| Фаза | Имя | Что сообщает |
| --- | --- | --- |
| P01 | prepare source data and transactional schema swap | число сохранённых source-схем и созданных target-схем |
| P02 | install target pre-data schema | число target-таблиц и sequences |
| P03 | migrate source data into target schema | успешное завершение всех 24 data-шагов |
| P04 | install migration ledgers and baseline rows | строки drizzle/integrator ledger и тарифов |
| P05 | install generated runtime settings registry | все и глобальные runtime settings |
| P06 | install target post-data schema | число FK и RLS policies |
| P07 | finalize, verify, and close transaction | успешное завершение всех 5 finish-шагов |

### Start — 6 шагов

| Шаг | Имя | Что сообщает |
| --- | --- | --- |
| S01 | carry unresolved legacy appointment history | реально записанные appointments, candidates, canonical rows и обе native-связи |
| S02 | validate cutover target and source shape | совпадение БД, наличие 3 обязательных source relations, отсутствие старых cutover-схем |
| S03 | complete patient-projection appointment transfer | реально записанные rows, canonical appointments, mappings, unmapped=0 и history events |
| S04 | preserve messenger identities and channel bindings | legacy identities, canonical bindings, unmapped=0 и blocked bindings |
| S05 | normalize provenance and validate prepared data | unmapped bookings/identities, старые source values и unsupported retry jobs; все обязательные нули |
| S06 | swap source schemas and create target schema shell | 3 сохранённые source-схемы, 6 target-схем и наличие tenant-колонки settings |

### Data — 24 шага

| Шаг | Имя | Что сообщает |
| --- | --- | --- |
| D01 | copy common-column data | точные `rowsWritten` через `ROW_COUNT`, число обработанных relations и organization-injected relations |
| D02 | source-only relation disposition | reviewed/transform/intentionally-retired relations, unreviewed=0, stale=0 |
| D03 | known-missing discussion media | 2 ожидаемые media rows в unavailable-состоянии и reference drift=0 |
| D04 | canonical platform-user graph | source users, canonical map rows, merged aliases, cycles/dangling=0 |
| D05 | specialist-reference baseline | число FK-классов, всех и canonical reference rows |
| D06 | uniqueness-sensitive identity classes | channel preferences и first-resolve rows после merge, duplicates=0 |
| D07 | reviewed live identity references | число классов и точные rewritten rows через `ROW_COUNT` |
| D08 | required tenant-scoped rows | categories/items/rules и обязательные NULL organization counts |
| D09 | reminder history attribution | source/target/attributed rows, честно неатрибутируемые rows и mismatches=0 |
| D10 | canonical reminder occurrences | source rows, copied rows и skipped without canonical rule |
| D11 | actionable legacy web-push | actionable rows, rows in canonical occurrences и terminal rows, пропущенные намеренно |
| D12 | reminder delivery logs | source/copied rows и skipped without occurrence |
| D13 | calendar mappings | source rows, canonical mappings и stale unmapped rows, пропущенные намеренно |
| D14 | clinical visit links | source visits, canonical links и unresolved=0 |
| D15 | legacy organization scope | точные rows/relations через `ROW_COUNT`, canonical organization id и список глобальных исключений |
| D16 | actionable message drafts | source/preserved drafts, holder conversations и content mismatches=0 |
| D17 | canonical identity profiles | canonical users, profiles и users without profile=0 |
| D18 | normalized contacts | только counts phone/email/primary; сами phone/email не выводятся |
| D19 | channel display/block facts | только counts handles/blocked; сами handles не выводятся |
| D20 | appointment reminders | pending source rows, все carried rows, отдельно future carried rows, `purpose`, distinct-purpose count, earliest/latest `next_retry_at`, invalid payload/channel skips и terminal skips |
| D21 | membership and visibility | expected clients/references, active enrollments, specialist links и owner memberships |
| D22 | sequence reseed | число реально найденных owned sequences и правило next value для пустых таблиц |
| D23 | identity-reference closure | reviewed classes, aliases remaining=0 и итоговые preference/first-resolve counts |
| D24 | copy completeness | violations=0 и итоговые occurrences, delivery logs, calendar mappings, playback rows |

### Finish — 5 шагов

| Шаг | Имя | Что сообщает |
| --- | --- | --- |
| F01 | canonical runtime setting values | registered runtime settings, source settings, unregistered secrets copied=0 |
| F02 | remove source schemas | removed=3, remaining=0 |
| F03 | retire phone fallback | fallback rows remaining=0 в обеих settings surfaces |
| F04 | required global admin settings | required=6, present=6 и runtime projection present |
| F05 | final target shape | все финальные классы violations=0 |

## Dry run и реальный запуск через штатный wrapper

Dry run TEST-rehearsal:

```bash
bash deploy/host/deploy-test-full-reset.sh \
  --confirm-full-reset \
  --fio-manifest=/secure/fio-manifest.json \
  --fio-manifest-file-sha256=<sha256> \
  --fio-manifest-sha256=<sha256> \
  --fio-review-source-sha256=<sha256> \
  --cutover-dry-run
```

Реальный commit-run TEST-rehearsal:

```bash
bash deploy/host/deploy-test-full-reset.sh \
  --confirm-full-reset \
  --fio-manifest=/secure/fio-manifest.json \
  --fio-manifest-file-sha256=<sha256> \
  --fio-manifest-sha256=<sha256> \
  --fio-review-source-sha256=<sha256>
```

Wrapper передаёт соответственно `-v cutover_mode=dryrun` или `-v cutover_mode=commit` в существующий вызов
`psql`. После dry run wrapper завершается сразу после подтверждённого `ROLLBACK`, не пытаясь проверять
неперсистентную target-схему. Сам full-reset wrapper остаётся destructive TEST-rehearsal: его предшествующие
restore/data-preparation стадии не являются частью откатываемой cutover-транзакции. Гарантия «ничего не
сохранилось» относится к полному `prod-to-target-cutover.sql`, включая встроенный appointment carry.

Для production operator path используется тот же параметр существующего вызова `psql`: `-v cutover_mode=dryrun`
для репетиции и `-v cutover_mode=commit` для переезда. PROD-команда и разрешение на PROD в этой задаче не
запускались.

## Ошибка: было и стало

Раньше место падения приходилось восстанавливать по номеру строки SQL среди анонимных `INSERT 0 N`.

Теперь перед выполнением есть banner вида:

```text
=== CUTOVER STEP D20/24: carry pending appointment reminders into delivery queue ===
```

`VERBOSITY verbose` оставляет стандартную ошибку PostgreSQL не проглоченной и добавляет SQLSTATE. Форма лога:

```text
ERROR:  23514: <сообщение PostgreSQL>
```

Последний именованный banner определяет failing step; `ON_ERROR_STOP` остаётся включён, выполнение не
продолжается, транзакция abort-ится. Ошибка неизвестного режима отдельно называется
`CUTOVER MODE VALIDATION` и имеет SQLSTATE `22023`.

## Единый closing summary

Перед закрытием транзакции результаты собираются в psql-переменную, затем выполняется ровно один из двух путей:

- `ROLLBACK` + `CUTOVER TRANSACTION OUTCOME: DRY RUN ROLLED BACK; NOTHING PERSISTED`;
- `COMMIT` + `CUTOVER TRANSACTION OUTCOME: COMMITTED`.

Только после успешного закрытия печатается `prod_to_target_cutover_closing_summary`. В нём есть `mode`,
`transactionOutcome`, все P/S/D/F results и end-state counts. Поэтому архивированный блок сам говорит, dry run
это был или committed run.

## Конфиденциальность

Новые отчёты выводят только counts, UUID системных объектов, timestamps, status/purpose values и булевы
инварианты. Names, phones, emails, handles, message bodies и contact values не выводятся.

## Проверка

Миграция не выполнялась ни на одной БД согласно brief.

Команда:

```bash
node --test deploy/host/prod-to-target-cutover-path-resolvable.test.mjs
```

Результат:

```text
1..2
# tests 2
# pass 2
# fail 0
node-test exit=0
```

Shell parse и достижимость флага:

```bash
bash -n deploy/host/deploy-test-saas.sh deploy/host/deploy-test-full-reset.sh
bash deploy/host/deploy-test-full-reset.sh --help
```

Результат: `bash-n exit=0`, `wrapper-help exit=0`; usage содержит `[--cutover-dry-run]`.

Whitespace/error gate:

```bash
git diff --check
```

Результат: вывода нет, `exit=0`.

Статическая проверка psql-блоков и SQL-скобок для пяти edited SQL-файлов дала:

```text
deploy/postgres/prod-to-target-cutover.sql: psql-if=1/1, sql-parentheses=0, STRUCTURE_OK
deploy/postgres/prod-to-target-cutover-start.sql: psql-if=0/0, sql-parentheses=0, STRUCTURE_OK
deploy/postgres/prod-to-target-cutover-data.sql: psql-if=0/0, sql-parentheses=0, STRUCTURE_OK
deploy/postgres/prod-to-target-cutover-finish.sql: psql-if=1/1, sql-parentheses=0, STRUCTURE_OK
deploy/postgres/prod-to-target-carry-legacy-appointments.sql: psql-if=2/2, sql-parentheses=0, STRUCTURE_OK
static-structure exit=0
```

Полноценного offline SQL parser path в репозитории нет. Проверено командой
`command -v pgsanity pg_sanity pg_format sqlfluff` и `require.resolve` для `pgsql-parser`, `libpg-query`,
`pg-query-parser`, `node-sql-parser`: все `NOT_FOUND`. Поэтому SQL-файлы не выдаются за parser-validated и БД
ради этого не создавалась. Existing `check:prod-to-target-cutover` сравнивает generated artifacts с
`bcb_webapp_dev`, но handwritten SQL не парсит, поэтому он не использован как ложное доказательство parse.

Проверка запрета data-change:

```bash
git diff --unified=0 -- deploy/postgres | \
  rg '^[+-](INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE)'
```

Результат: вывода нет; `rg-exit=1`, то есть ни одна строка mutating SQL не добавлена и не удалена.
Все diff hunks просмотрены: они являются reporting либо mode switch. Единственные неаддитивные изменения —
перенос `BEGIN` перед встроенным carry и условный standalone `BEGIN`/`COMMIT` carry (необходимая транзакционная
граница dry run), замена финального безусловного `COMMIT` на `COMMIT`/`ROLLBACK`, а также перенос прежнего
финального JSON в расширенный closing summary. Predicates, порядок DML, column lists и сами
`INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` не менялись. GRANT/REVOKE/role/policy DDL не добавлялись.

`git diff --stat` после добавления этого отчёта:

```text
 deploy/host/deploy-test-saas.sh                    |  11 +
 .../prod-to-target-carry-legacy-appointments.sql   |  26 +-
 deploy/postgres/prod-to-target-cutover-data.sql    | 483 ++++++++++++++++++++-
 deploy/postgres/prod-to-target-cutover-finish.sql  | 205 +++++++--
 deploy/postgres/prod-to-target-cutover-start.sql   | 146 ++++++-
 deploy/postgres/prod-to-target-cutover.sql         | 106 +++++
 6 files changed, 939 insertions(+), 38 deletions(-)
```

Новый untracked report сам в вывод `git diff --stat` не входит; он включён в итоговый commit отдельным явно
названным path.

Полный CI не запускался: brief требует точечный path-resolvable test, а непокрытого repo-level product risk для
`pnpm run ci` нет (`AGENTS.md` §9–§10).

## НЕ СДЕЛАНО

- Молчаливых логических шагов не осталось: список пуст. Все 6 start-, 24 data-, 5 finish-шагов и 7 generated/
  orchestration-фаз имеют before-banner и after-summary.
- Отдельные SQL statements внутри generated pg_dump artifacts не объявлены как самостоятельные шаги: они не
  являются отдельными logical steps; их владеющая P02/P04/P05/P06 phase объявляется и подводит итог целиком.
- Миграция не исполнялась и runtime-числа не выдумывались — это прямо запрещено brief; их напечатает сама
  миграция на dry/real run.
- Offline parser-validation SQL не выполнена: существующего parser path нет, а временная/A0/greenfield БД не
  создавалась.
