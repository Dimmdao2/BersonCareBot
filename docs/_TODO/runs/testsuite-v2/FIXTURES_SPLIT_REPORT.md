# TEST-фикстуры вынесены из общего оверлея телеметрии изоляции — ОТЧЁТ

**Бриф:** [`FIXTURES_SPLIT_BRIEF.md`](FIXTURES_SPLIT_BRIEF.md). **Ветка:** `wt/fixtures-split`.
**Прод не трогался, не читался.** Диff целиком в `deploy/postgres/*.sql` и `deploy/host/deploy-test-saas.sh`;
ни `deploy-prod.sh`, ни хост `135.106.162.170` не открывались.

## Итог одной строкой

`deploy/postgres/saas-isolation-telemetry.sql` (440 строк) разрезан на боевой файл (360 строк, только API,
нужный везде) и новый `deploy/postgres/test-saas-isolation-telemetry-fixtures.sql` (120 строк, TEST-сценарные
фикстуры), подключённый только в `deploy-test-saas.sh` тем же способом, каким подключён боевой оверлей.
Полная эквивалентность объединения двух файлов исходному подтверждена не только текстовым сравнением, но и
**прогоном обоих вариантов на одноразовой Postgres-БД в Docker**: итоговое состояние каталога (владельцы
функций/таблиц, ACL, членство ролей, констрейнт) побайтово совпало между «один файл» и «два файла».
Находка про `bcb_webapp_dev` (п.5 брифа) не починена умышленно — см. §3.

## 1. Что сделано

### 1.1. Разрез файла

Граница разреза — ровно та, что зафиксировал лид в брифе: строки 113–297 (боевой API: запись события, покрытие,
три read-функции) остались в `saas-isolation-telemetry.sql`; строки 299–397 (`app.set_saas_isolation_test_scenario`,
`app.read_saas_isolation_test_scenario_fixture_counts`, их `ALTER FUNCTION ... OWNER`, `REVOKE`/`GRANT`, часть
итоговой проверки `telemetry_least_privilege_verified`) уехали в новый файл.

Часть работы — не просто перемещение блоков текста: пять `REVOKE`/`GRANT`-операторов и один verification-блок
в исходном файле перечисляли боевые и TEST-функции **в одном списке через запятую** (например, `REVOKE ALL ON
FUNCTION app.read_saas_isolation_events(), ..., app.set_saas_isolation_test_scenario(text), ... FROM %I`). Такой
оператор разрезан на два — по одному на файл, с тем же перечнем ролей/адресатов, что и раньше. Семантически это
не переписывание: `REVOKE ALL ON FUNCTION A, B FROM X` эквивалентно `REVOKE ALL ON FUNCTION A FROM X; REVOKE ALL
ON FUNCTION B FROM X` — набор итоговых ACL от порядка/группировки не зависит. Ни один текст функции не менялся;
предохранитель `current_database() <> 'bersoncarebot_test'` внутри обеих TEST-функций тронут не был.

Новый файл получил собственный `\if :{?var}` guard-блок (та же идиома, что в основном файле и в других
TEST-only оверлеях, например `test-patient-identity-capability-gate.sql`) на все три переменные
(`telemetry_webapp_runtime_role`, `telemetry_api_runtime_role`, `telemetry_operator_runtime_role`) — они нужны
ему для той же пары `REVOKE`/verification, что раньше делал общий файл для TEST-функций.

Шапка боевого файла получила одну строку, объясняющую, где искать TEST-фикстуры и почему они отдельно; шапка
нового файла — почему он существует и что применяется только `deploy-test-saas.sh`.

### 1.2. Подключение только к TEST

`deploy/host/deploy-test-saas.sh`, тем же способом, каким подключён существующий оверлей:

- новая переменная `SAAS_ISOLATION_TELEMETRY_TEST_FIXTURES=deploy/postgres/test-saas-isolation-telemetry-fixtures.sql`
  рядом с `SAAS_ISOLATION_TELEMETRY` (строка 73);
- новая функция `install_saas_isolation_telemetry_test_fixtures_overlay()` — копия структуры
  `install_saas_isolation_telemetry_overlay()` (discover ролей, `validate_pg_identifier`, `psql -f` с теми же
  тремя `-v`), вызывается сразу после боевой в `run_strict_post_migration_closure()`, с комментарием, что порядок
  обязателен (новый файл использует роли/таблицы, которые создаёт/переоформляет боевой);
- добавлена в оба места проверки наличия файла, которые перечислил бриф: `assert_strict_closure_deploy_checkout_ready`
  (было `SAAS_ISOLATION_TELEMETRY` в списке `sudo -u deploy test -r`) и отдельный `[ -r "$SRC_REPO/..." ]` в
  preflight-блоке ближе к концу скрипта.

`grep -c` по `deploy-prod.sh` на `saas-isolation-telemetry|SAAS_ISOLATION_TELEMETRY` — **0** до и после (не менялся).

### 1.3. Прод ничего не потерял — доказано и текстом, и живой БД

Способ 1 — программный set-diff (`python3`, regex по обоим файлам): по отдельности сравнены множества
`CREATE OR REPLACE FUNCTION`, `ALTER FUNCTION ... OWNER TO`, пары `(функция, роль)` во всех `REVOKE ALL ...
FROM`, во всех `SELECT format('REVOKE ALL ON FUNCTION ... FROM %I', :'var')`, во всех литеральных `GRANT
EXECUTE ... TO`, и все клозы `has_function_privilege(...)` в verification-блоках — между исходным файлом и
объединением (боевой + новый). Все пять множеств совпали **точно** (0 диффов).

Способ 2 — прогон на одноразовой Postgres 16 в Docker (контейнер поднят и удалён в рамках этой сессии,
`bcb-fixtures-split-verify`, без публикации портов на хост):

1. Минимальный bootstrap (схема `app`, три таблицы `saas_isolation_events`/`_event_hourly`/`_coverage_runs` —
   взяты дословно из `apps/webapp/db/drizzle-migrations/0185_saas_isolation_diagnostics.sql`, реальный источник
   этих таблиц; committed a0-greenfield `schema.sql` не подошёл — устарел и не содержит `_event_hourly`, что
   само по себе согласуется с находкой лида «тест 1 (`drizzle_historical_hash_drift`) красный» из
   `B2B_ETALON_GENERATOR_REPORT.md`) + четыре роли `app_owner/app_staff/app_patient/app_worker` + три login-роли
   под `telemetry_*_runtime_role`.
2. Две БД: `split_test` (применены оба новых файла по очереди, теми же `-v`, что передаёт
   `deploy-test-saas.sh`) и `orig_test` (применён исходный файл из `git show HEAD:...` одним проходом).
3. Оба пути завершились `EXIT 0`; обе verification-проверки в каждом пути (`telemetry_least_privilege_verified`,
   `telemetry_operator_sole_effective_member_verified` в боевом; `test_fixture_telemetry_least_privilege_verified`
   в новом) вернули `1`.
4. Снят снимок каталога после каждого пути: владельцы и ACL всех функций схемы `app`, владельцы и ACL всех
   `saas_isolation_*`-таблиц, членство `saas_telemetry_operator`, свойства ролей
   `saas_telemetry_owner`/`saas_telemetry_operator`, определение констрейнта `..._source_operation_check`.
   `diff` между снимками `split_test` и `orig_test` — **пустой**.

Итог: разрез не потерял и не добавил ни одного объекта, гранта или owner-а боевой половины; проверено и
статически, и исполнением на реальном Postgres.

## 2. Границы

- Прод не трогался: `deploy-prod.sh` не менялся и не открывался; хост не трогался.
- Схема миграциями не менялась; тексты обеих TEST-функций не переписывались (только координаты — какой файл их
  содержит).
- Сам деплой (`deploy-test-full-reset.sh`/`deploy-test-saas.sh` целиком) не запускался — только разбор скриптов
  плюс изолированный прогон обоих SQL-файлов на одноразовой Docker-БД (см. §1.3), поднятой и снесённой в рамках
  этой сессии, без публикации портов и без касания других контейнеров хоста.
- Push/merge не делал, галочки плана `TEST_SUITE_AUDIT_2026-07-29.md` не ставил.

## 3. Находка п.5 — объекты в `bcb_webapp_dev` (не чинится, только называется)

Бриф просит выяснить, как `app.set_saas_isolation_test_scenario`/`app.read_saas_isolation_test_scenario_fixture_counts`
оказались в живой `bcb_webapp_dev`, хотя `deploy/host/migrate-dev.sh` этот оверлей не применяет.

**Подтверждено разбором кода:**

- `deploy/host/migrate-dev.sh:6-9` — прямым текстом: «This entrypoint never restores, drops, recreates or copies
  a database. The only role change it may make is a fail-closed temporary `bcb_webapp_dev_user -> app_owner`
  membership plus temporary BYPASSRLS around `pnpm migrate`» — про runtime-overlay ни слова, `SAAS_ISOLATION_TELEMETRY`
  в файле не упоминается вообще.
- Единственный автоматический вызывающий `saas-isolation-telemetry.sql` в репозитории — `deploy-test-saas.sh`
  (`install_saas_isolation_telemetry_overlay`), и он всегда целится в `$DB=bersoncarebot_test`, никогда в
  `bcb_webapp_dev`.
- В `deploy/host/` нет ни одного скрипта общего назначения («применить произвольный `deploy/postgres/*.sql`
  файл к произвольной БД»), которым эту команду можно было бы направить на DEV по ошибке автоматики.

**Это уже находили независимо в этом же репозитории раньше** (не моя догадка, а два предыдущих документа):

- `docs/_TODO/runs/testsuite-v2/B2B_ETALON_GENERATOR_REPORT.md`, §2б — воркер другой ветки (`wt/testsuite-b2`)
  нашёл прямым `SELECT` по `pg_proc.prosrc` живой `bcb_webapp_dev` (непривилегированная роль,
  только чтение), что тела ровно этих двух функций содержат буквальный `current_database() <> 'bersoncarebot_test'`,
  и что обе созданы `deploy/postgres/saas-isolation-telemetry.sql:301-379`, коммит `16a910970b` «feat(saas):
  prepare owner-ready strict TEST environment», 2026-07-16 (`ALTER FUNCTION ... OWNER TO saas_telemetry_owner`).
- `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md:627` — лид лично проверил эту находку в живой БД
  («Проверено лидом в живой БД») и подтвердил её независимо, отметив, что путь **легитимный, не обход
  миграций** («это TEST-фикстуры из деплой-оверлея ..., накатываемого только `deploy-test-saas.sh` ..., то есть
  путь законный»), и что именно поэтому нужен этот бриф — разнести боевую и TEST-половину по разным файлам.

**Что я добавил к этой находке в этой сессии:** подтвердил текстом кода (см. выше), что нет автоматического
пути `migrate-dev.sh -> saas-isolation-telemetry.sql`, то есть объекты в `bcb_webapp_dev` **не могли появиться
через обычный `pnpm migrate`/`deploy/host/migrate-dev.sh --execute`** — только через прямой запуск этого файла
(или его актуальной на тот момент версии) суперпользователем против `bcb_webapp_dev` в обход
`deploy/host/*dev*.sh`.

**Точный оператор/дата/команда — не установлены, честно.** В этом воркере (клон `bcb-wt-docs3`) нет:
доступа к живой `bcb_webapp_dev` (нет `apps/webapp/.env.dev`, `sudo -u postgres` недоступен — `NoNewPrivs=1`,
то же ограничение, что и в `B2B_ETALON_GENERATOR_REPORT.md`), истории shell-команд хоста, `pg_stat_statements`/
`pg_stat_activity`-следов. Поиск по `git log --all` не находит ни одного коммита/скрипта, вызывающего
`saas-isolation-telemetry.sql` против DEV — значит, если это был ручной запуск, он не оставил следа в
репозитории. Вывод по фактам, которые реально удалось проверить: объекты **легитимного происхождения** (тот же
файл, что и на TEST, не подделка), но применены к DEV **вручную, вне `migrate-dev.sh` и вне любого
repo-tracked скрипта** — согласуется с ранее задокументированным паттерном `AGENTS.md` §10a, что
`deploy/postgres/*.sql` — provisioning-скрипты, которые иногда накатывают на живую БД руками, а не только через
migration ledger. Решение, что с этим делать (не применять впредь / переприменить без литерала БД в теле /
исключить `saas_telemetry_owner`-объекты из a0-greenfield) — уже перечислено развилками в
`B2B_ETALON_GENERATOR_REPORT.md` §2б и остаётся за владельцем; в этом брифе оно не решалось, удалять из DEV не
пытался.

## Изменённые файлы

- `deploy/postgres/saas-isolation-telemetry.sql` — TEST-функции и всё, что их касалось, убраны; пять
  `REVOKE`/`GRANT`-операторов и verification-блок сужены до боевого набора; шапка +3 строки.
- `deploy/postgres/test-saas-isolation-telemetry-fixtures.sql` — новый файл, 120 строк.
- `deploy/host/deploy-test-saas.sh` — новая переменная, новая функция
  `install_saas_isolation_telemetry_test_fixtures_overlay`, вызов после боевой в `run_strict_post_migration_closure`,
  файл добавлен в обе проверки наличия (`assert_strict_closure_deploy_checkout_ready`, preflight-блок).

## НЕ СДЕЛАНО

- **Находка п.5 не починена умышленно** — бриф прямо просит только назвать, решение по DEV не моё
  (см. §3, развилки уже перечислены в `B2B_ETALON_GENERATOR_REPORT.md`).
- **Точная атрибуция «кто/когда» ручного применения к `bcb_webapp_dev` не установлена** — в этом воркере нет
  доступа к живой DEV-БД, `sudo`, истории команд хоста или `pg_stat`-следов (см. §3). Проверено то, что можно
  было проверить без этого доступа: разбор кода (`migrate-dev.sh`, все `deploy/host/*.sh`) и `git log --all`.
- **Сам деплой `deploy-test-saas.sh`/`deploy-test-full-reset.sh` не запускался** — граница брифа. Вместо этого
  оба SQL-файла реально применены и сверены на одноразовой Docker-БД (см. §1.3) — это ближе к «применение на
  одноразовой базе», чем к «только разбор», но это не полный прогон деплой-скрипта (нет реальных ролей логинов
  сервисов, нет остального closure-конвейера вокруг).
- Push/merge не делал, галочки плана `TEST_SUITE_AUDIT_2026-07-29.md` не ставил — по границам брифа.
