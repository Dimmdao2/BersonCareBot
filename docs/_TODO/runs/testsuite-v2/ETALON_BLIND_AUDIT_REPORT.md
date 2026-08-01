# Слепой аудит: вынос TEST-фикстур и обновление эталона `a0-greenfield`

run: `audit-etalon-split` · роль `auditor-live` · клон `bcb-wt-docs3` · ветка `wt/fixtures-split`
Базовая линия (не перемерялась): вердикты Б2, Б2а, Б2б уже в очереди.

---

## 1. Свой список поломок и проверок (составлен до чтения отчётов и диффов)

**Отметка времени: 2026-08-01T04:21:09+03:00.**
Прочитано до этого момента: план (блок Б), `deploy/postgres/test-saas-isolation-telemetry-fixtures.sql`,
инвентарь объектов `deploy/postgres/saas-isolation-telemetry.sql`, точки подключения в
`deploy/host/deploy-test-saas.sh` (grep), `scripts/a0-greenfield-baseline-lib.mjs`,
`scripts/check-a0-greenfield-baseline.mjs`, `package.json`.
НЕ открывались: `FIXTURES_SPLIT_REPORT.md`, `B2B_ETALON_GENERATOR_REPORT.md`, `FIXTURES_SPLIT_BRIEF.md`,
`B2B_ETALON_GENERATOR_BRIEF.md`, никакие диффы.

| # | Поломка / проверка | Что обязано произойти |
|---|---|---|
| П1 | Сверить множество объектов «до разреза» (объект из истории git) и «после» = основной + фикстурный файл: функции, сигнатуры, `OWNER TO`, `GRANT`, `REVOKE`, `SECURITY DEFINER`, `SET search_path`, проверочные `SELECT 1/(...)`. | Множества совпадают по существу; ни один `GRANT`/`REVOKE`/владелец не потерян и не переехал на другую роль. |
| П2 | Убрать `ALTER FUNCTION ... OWNER TO saas_telemetry_owner` из фикстурного файла и применить. | Разрез обязан быть таким, чтобы владелец задавался явно; отсутствие строки должно менять владельца на суперпользователя — проверяю, что строки на месте и обе функции покрыты. |
| П3 | Порядок применения: фикстурный файл должен применяться СТРОГО после основного (зависит от ролей `saas_telemetry_owner`/`saas_telemetry_operator`, таблиц `saas_isolation_*` и `GRANT USAGE ON SCHEMA app`). Переставить вызов выше основного. | Прогон обязан упасть (роль/таблица/USAGE не существуют), а не молча пройти. |
| П4 | Пропущенная переменная psql: применить фикстурный файл без `-v telemetry_operator_runtime_role=...`. | `FATAL: missing telemetry_operator_runtime_role` + падение (`SELECT 1/0`), а не тихий пропуск. |
| П5 | Поиск утечки фикстур за пределы TEST: `deploy-prod.sh`, `deploy.sh`, `deploy-webapp-prod.sh`, `migrate.sh`, `migrate-dev.sh`, `deploy-test.sh`, `deploy-test-full-reset.sh`, `stream-canonical-sql.mjs`, cron.d, systemd, любые `*.mjs`/`*.ts`/`*.sh`, а также перечни файлов внутри самих скриптов. | Ровно одна точка объявления и одна точка применения — в `deploy-test-saas.sh`; в прод/dev-путях — ноль вхождений. Список мест, где искал, обязателен. |
| П6 | Предохранитель `current_database() <> 'bersoncarebot_test'` в теле ОБЕИХ функций. Удалить его в копии и убедиться, что это ловится проверкой; вернуть. | Предохранитель цел в обеих функциях после разреза (визуально подтверждено, стр. 36 и 84) — но проверить, существует ли механическая проверка, которая уронит сборку при его удалении. Ожидаемая находка: такой проверки нет. |
| П7 | Эталон `schema.sql`: не должно быть ни `set_saas_isolation_test_scenario`, ни `read_saas_isolation_test_scenario_fixture_counts`. | Ноль вхождений обоих имён. |
| П8 | Эталон `schema.sql`: идентификаторы среды (`bersoncarebot_dev/test/prod`, `bcb_webapp_*`), e-mail, телефоны, креденшелы. | Ноль вхождений; `scanSchemaArtifact` обязан краснеть на каждом из них — проверяю арбитражом, а не доверяю зелёному прогону. |
| П9 | Манифест: `sourceCommit` — реальный коммит-предок HEAD, а не выдумка; хэши `schema.sql`/`seed.sql` совпадают; `census` совпадает с фактическим содержимым дампа. | `git cat-file -e`, `merge-base --is-ancestor` проходят; sha256 совпадают. |
| П10 | **Ключевое**: внести дрейф — поправить одну миграцию НА МЕСТЕ (в рабочем дереве) — и прогнать `check:saas-a0-greenfield-baseline`. | Гейт обязан покраснеть. **Подозрение из кода:** `validatePackage()` сверяет миграции через `git ls-tree`/`git show` от `HEAD`, то есть читает КОММИТ, а не рабочее дерево; `assertCleanRefreshSource()` в пути `check` не вызывается. Прогнозирую: правка на месте пройдёт незамеченной — критическая находка. |
| П11 | Дрейф второго рода: закоммитить правку миграции. | Гейт обязан покраснеть (`*_historical_hash_drift`). |
| П12 | Дрейф третьего рода: добавить новую миграцию (хвост). | Не должен краснеть (это `pending`), но обязан быть виден числом в `pendingCurrentMigrations`. |
| П13 | Дрейф самого `schema.sql` (правка одного символа). | `schema_hash_drift`. |
| П14 | Строгость телефонной проверки не ослаблена: подставить в `schema.sql` другой телефонный литерал (не `+70000000000`). | `phone_literal_forbidden`. Плюс проверить границы: литерал без кавычек, литерал с другим форматом (`8-800-...`), литерал в `seed.sql`. |
| П15 | Не ослаблены соседние проверки, которые проще всего было «расширить заодно»: `unexpected_policy_role`, `owner_or_acl_forbidden`, `data_section_forbidden`, `unexpected_schemas`, `unexpected_extensions`, `environment_identifier_forbidden`. | Каждая обязана краснеть на подставленной поломке. |
| П16 | Четыре добавленные роли в `allowedPolicyRoles` — реальны: каждая создаётся названной миграцией/оверлеем, коммит существует. | Роль присутствует в коде, коммит из комментария разрешается. |
| П17 | Удаление функций из DEV: кто их звал — `apps/webapp/scripts/run-saas-isolation-test-scenarios.ts` и соседи. | Все вызывающие рассчитаны на TEST (проверяют имя БД / берут TEST-URL), ни один прогон тестов/скрипт из DEV-пути их не трогает. |
| П18 | Ни один автотест/линтер/`check:*` не ссылается на удалённые из DEV функции и не падает от их отсутствия. | Прогон соответствующих гейтов зелёный по причине «не зависит», а не «пропущено молча». |
| П19 | Дерево клона после аудита чистое (`git status --porcelain` пуст), прод не тронут. | Пусто. |

---

## 2. Матрица «поломка → результат → дословный вывод»

Все прогоны — на клоне `bcb-wt-docs3`, ветка `wt/fixtures-split`, HEAD `2f29133c9`. Каждая поломка вносилась
и откатывалась; финальная проверка чистоты дерева — в §5.

### 2.1. Дрейф эталона (пункт 4г брифа — «самое важное»)

| # | Поломка | Результат | Дословный вывод |
|---|---|---|---|
| A | `apps/webapp/db/drizzle-migrations/0100_booking_slots_read_source.sql` изменена **в рабочем дереве** (`printf '\n-- audit drift probe\n' >>`), НЕ закоммичена. `node scripts/check-a0-greenfield-baseline.mjs` | 🔴 **ПРОШЛА НЕЗАМЕЧЕННОЙ** | `{ "status": "PASS", "schemaSha256": "4ef35022cc…", "census": {…}, "manifestEntries": {"integrator":68,"drizzle":288}, "pendingCurrentMigrations": {"integrator":0,"drizzle":0} }` · `GATE EXIT=0` |
| A′ | Та же поломка, полный заявленный гейт `pnpm check:saas-a0-greenfield-baseline` (checker + 8 самотестов) | 🔴 **ПРОШЛА НЕЗАМЕЧЕННОЙ** | `FULL GATE EXIT=0` · `ok 1 … ok 8` · `# pass 8` · `# fail 0` |
| B | Та же правка, **закоммичена** | ✅ поймана | `check-a0-greenfield-baseline: drizzle_historical_hash_drift:0100_booking_slots_read_source` · `GATE EXIT(committed drift)=1` |
| C | Новая миграция в хвост (`9999_audit_probe.sql` + запись в `_journal.json`), закоммичена | ✅ корректно: зелено и видно числом | `"pendingCurrentMigrations": {"integrator":0,"drizzle":1}` · `GATE EXIT(tail migration)=0` |
| D | Правка самого `schema.sql` эталона | ✅ поймана (покрыта самотестом 6, `package checker rejects schema and historical ledger hash drift`) | `ok 6 - package checker rejects schema and historical ledger hash drift` |

**Причина A/A′ (из кода, не из догадки).** `validatePackage()`
(`scripts/a0-greenfield-baseline-lib.mjs:509-525`) сверяет реестр миграций против
`discoverIntegratorMigrationsAtCommit(headCommit)` / `discoverDrizzleMigrationsAtCommit(headCommit)`, а те
читают файлы через `git show <commit>:<path>` (`readGitFile`, стр. 84-86). То есть гейт сверяет **коммит**, а
не рабочее дерево. Функция `assertCleanRefreshSource()` (стр. 95-102), которая как раз ловит грязное дерево по
`REFRESH_SOURCE_PATHS` (включая обе директории миграций), в пути `check` **не вызывается** —
`scripts/check-a0-greenfield-baseline.mjs` целиком состоит из `validatePackage()`.

### 2.2. Строгость генератора — арбитраж (пункт 5 брифа)

Метод: импорт `scanSchemaArtifact`/`scanSeedArtifact` и подстановка поломок в текст эталона в памяти
(сам файл не трогался). Базовая линия: `BASELINE schema failures: []`, `BASELINE seed failures: []`.

| Подставлено | Результат | Код отказа |
|---|---|---|
| `'+79161234567'` вместо `'+70000000000'` | ✅ RED | `phone_literal_forbidden` |
| `'+79990001122'` рядом с разрешённым | ✅ RED | `phone_literal_forbidden` |
| `'+14155550123'` (US) | ✅ RED | `phone_literal_forbidden` |
| `"+79161234567"` (двойные кавычки) | ✅ RED | `phone_literal_forbidden` |
| `+79161234567` **без кавычек** | ⚪ GREEN | (нет отказа) — предсуществующая граница `quotedPhonePattern` |
| `'8-800-555-3535'` (не-E.164) | ⚪ GREEN | (нет отказа) — предсуществующая граница `quotedPhonePattern` |
| `bersoncarebot_test` / `bersoncarebot_prod` | ✅ RED | `environment_identifier_forbidden` |
| `bcb_webapp_dev` | ✅ RED | `runtime_identifier_forbidden` |
| `ops@clinic.example.com` | ✅ RED | `email_literal_forbidden` |
| `GRANT SELECT ON public.x TO app_staff;` | ✅ RED | `owner_or_acl_forbidden` |
| `ALTER TABLE public.x OWNER TO postgres;` | ✅ RED | `owner_or_acl_forbidden` |
| `-- Data for Name: x; Type: TABLE DATA` | ✅ RED | `data_section_forbidden` |
| `COPY public.x (a) FROM stdin;` | ✅ RED | `data_section_forbidden` |
| `CREATE SCHEMA sneaky;` | ✅ RED | `unexpected_schemas:app,app_ext,drizzle,integrator,public,sneaky` |
| `CREATE EXTENSION … hstore …` | ✅ RED | `unexpected_extensions:btree_gist,hstore,pgcrypto` |
| `CREATE POLICY … TO bcb_webapp_prod_user` | ✅ RED | `runtime_identifier_forbidden,unexpected_policy_role:bcb_webapp_prod_user` |
| `postgresql://u:p@h/db` | ✅ RED | `credential_shape_forbidden` |
| срез `-- PostgreSQL database dump complete` | ✅ RED | `incomplete_pg_dump_schema` |
| seed: `'+79161234567'` | ✅ RED | `seed_phone_forbidden` |
| seed: `real@clinic.ru` | ✅ RED | `seed_non_test_email_forbidden` |
| seed: `INSERT INTO public.secret_table` | ✅ RED | `seed_table_forbidden:secret_table` |

**Вывод по строгости: не ослаблена.** Сравнение с состоянием до сужения (`git show c402f29a8^:…`):
`quotedPhonePattern = /['"]\+[1-9][0-9]{9,14}['"]/u` **не менялся** — добавлен только allow-list
`SCHEMA_PLACEHOLDER_PHONE_LITERALS = new Set(['+70000000000'])` и только для `scanSchemaArtifact`
(через `findSchemaPhoneLiteral`); `scanSeedArtifact` продолжает использовать голый паттерн без исключений.
Две «зелёные» строки выше — предсуществующие границы регулярного выражения (были и до этой работы), не
регрессия этой задачи.

### 2.3. Механическая проверка разреза (пункт 1/3 брифа + `AGENTS.md` §5)

| # | Поломка | Результат | Дословный вывод |
|---|---|---|---|
| F | В `deploy/host/deploy-prod.sh` дописано `SAAS_ISOLATION_TELEMETRY_TEST_FIXTURES=deploy/postgres/test-saas-isolation-telemetry-fixtures.sql` + `psql -f "$SAAS_ISOLATION_TELEMETRY_TEST_FIXTURES"` — то есть TEST-фикстуры подключены в **прод-путь** | 🔴 **ПРОШЛА НЕЗАМЕЧЕННОЙ** | `check:saas-db-regression GREEN` · `check:saas-e1-webapp-runtime-config GREEN` · `check:saas-test-strict-finalizer GREEN` · `check:saas-a0-greenfield-baseline GREEN` · `scripts/check-db-chokepoint.mjs GREEN` · `scripts/check-no-new-raw-sql.mjs GREEN` |
| G | `CREATE OR REPLACE FUNCTION app.set_saas_isolation_test_scenario(...)` дописана обратно в **прод-оверлей** `deploy/postgres/saas-isolation-telemetry.sql` | 🔴 **ПРОШЛА НЕЗАМЕЧЕННОЙ** | те же шесть гейтов, все `GREEN (probe missed)` |
| H | Предохранитель `IF current_database() <> 'bersoncarebot_test' THEN RAISE EXCEPTION …` удалён из **обеих** фикстурных функций (`fuses removed: 2`) | 🔴 **ПРОШЛА НЕЗАМЕЧЕННОЙ** | `check:saas-db-regression GREEN` · `check:saas-e1-webapp-runtime-config GREEN` · `check:saas-test-strict-finalizer GREEN` · `eslint . GREEN` |

Корень: в репозитории **нет ни одного теста, который вообще упоминает** эти файлы или эти функции —
`grep -rln "isolation-telemetry\|isolation_test_scenario" --include="*.test.*" --include="*.spec.*"` даёт
пустой вывод. `bash -n deploy/host/deploy-test-saas.sh` (внутри `check:saas-e1-webapp-runtime-config` и
`check:saas-test-strict-finalizer`) проверяет только синтаксис shell.

### 2.4. Разрез не потерял ничего боевого (пункт 1)

Метод: `git show 730442aea^:deploy/postgres/saas-isolation-telemetry.sql` → построчный diff против
пост-разрезного основного файла с вычетом комментариев/пустых строк; затем сверка каждого выпавшего
объекта против фикстурного файла.

Из основного файла ушло 85 непустых строк, пришло 6. Пришедшие 6 — это те же самые общие
`REVOKE`/`GRANT`, из которых **вычеркнуты только два фикстурных имени**; всё остальное в них посимвольно
совпадает. Ушедшие 85 — два тела функций, их `OWNER TO`, вхождения фикстурных имён в общих `REVOKE`/`GRANT`
и 4 строки `has_function_privilege`.

Сверка «каждое ушедшее восстановлено в фикстурном файле»:

| Объект / привилегия (было в `730442aea^`) | Где теперь | Совпало |
|---|---|---|
| `CREATE OR REPLACE FUNCTION app.set_saas_isolation_test_scenario(text)` + тело | фикстуры, стр. 28-77 | ✅ посимвольно |
| `CREATE OR REPLACE FUNCTION app.read_saas_isolation_test_scenario_fixture_counts()` + тело | фикстуры, стр. 79-101 | ✅ посимвольно |
| `LANGUAGE plpgsql [STABLE] SECURITY DEFINER SET search_path = pg_catalog` (обе) | фикстуры, стр. 30 / 81 | ✅ |
| `ALTER FUNCTION … OWNER TO saas_telemetry_owner` (обе) | фикстуры, стр. 103-104 | ✅ обе, владелец тот же |
| `REVOKE ALL … FROM PUBLIC` (обе) | фикстуры, стр. 105 | ✅ |
| `REVOKE ALL … FROM app_owner, app_staff, app_patient, app_worker` (обе) | фикстуры, стр. 106 | ✅ тот же список ролей |
| `REVOKE ALL … FROM :telemetry_webapp_runtime_role` | фикстуры, стр. 107 | ✅ |
| `REVOKE ALL … FROM :telemetry_api_runtime_role` | фикстуры, стр. 108 | ✅ |
| `REVOKE ALL … FROM :telemetry_operator_runtime_role` | фикстуры, стр. 109 | ✅ |
| `GRANT EXECUTE … TO saas_telemetry_operator` | фикстуры, стр. 113 | ✅ |
| 4 строки `has_function_privilege(...)` в финальном `SELECT 1/(…)::int` | фикстуры, стр. 115-120 | ✅ все четыре, тот же смысл |
| `GRANT USAGE ON SCHEMA app TO saas_telemetry_operator` | остался в основном (стр. 323), применяется раньше | ✅ |

Порядок REVOKE→GRANT внутри фикстурного файла сохранён относительно исходного. Явных `BEGIN;`/`COMMIT;`
не было ни до, ни после разреза (`grep` пуст в обоих файлах) — семантика частичного отказа не изменилась;
`\set ON_ERROR_STOP on` присутствует в обоих файлах. Guard-блоки `\if :{?…}` + `SELECT 1 / 0` для трёх
psql-переменных скопированы из основного оверлея дословно (сверено с `saas-isolation-telemetry.sql:11-25`).

**Потерь гранта, смены владельца, потери `SECURITY DEFINER`/`search_path` не обнаружено.**

### 2.5. Фикстуры не попадают никуда, кроме TEST (пункт 2) — где искал

| Где искал | Вхождений |
|---|---|
| `deploy/host/deploy-prod.sh` | 0 |
| `deploy/host/deploy.sh` | 0 |
| `deploy/host/deploy-webapp-prod.sh` | 0 |
| `deploy/host/migrate.sh` | 0 |
| `deploy/host/migrate-dev.sh` | 0 |
| `deploy/host/deploy-test.sh` | 0 |
| `deploy/host/deploy-test-full-reset.sh` | 0 |
| `deploy/host/stream-canonical-sql.mjs` | 0 |
| `deploy/host/bootstrap-systemd-prod.sh` / `bootstrap-systemd-webapp-prod.sh` | 0 |
| Весь репозиторий, любой тип файла (`grep -rIl`, минус `.git`/`node_modules`) | `deploy/host/deploy-test-saas.sh`, `deploy/postgres/saas-isolation-telemetry.sql` (только комментарий-указатель), 3 файла в `docs/` |
| `--include=*.sh,*.mjs,*.ts,*.mts,*.js,*.json,*.sql,*.yml,*.yaml,*.service,*.timer` по всему дереву на 4 паттерна (имя файла, имя переменной, оба имени функций) | только `deploy-test-saas.sh`, сами два SQL-файла, 2 TS-скрипта вебаппа, 1 `.mjs` в `docs/_TODO` |

Три точки в `deploy-test-saas.sh` — все на месте:
объявление `deploy-test-saas.sh:73`, применение `install_saas_isolation_telemetry_test_fixtures_overlay()`
(стр. 714-729, вызов на стр. 2162 **сразу после** `install_saas_isolation_telemetry_overlay`),
проверка №1 `[ -r "$SRC_REPO/…" ]` на стр. 2460, проверка №2 — в списке `required_path` на стр. 2288.
Обе проверки наличия файла присутствуют. Обёртка передаёт все три `-v` переменные, идентично основному
оверлею (стр. 722-728).

### 2.6. Эталон честный (пункт 4а-в)

| Проверка | Результат |
|---|---|
| `set_saas_isolation_test_scenario` в `schema.sql` эталона | **0** вхождений |
| `read_saas_isolation_test_scenario_fixture_counts` | **0** |
| `bersoncarebot` (любая среда) | **0** |
| `bcb_webapp` (любая среда) | **0** |
| `saas_telemetry` (роли) | **0** |
| `test-fixture` (фингерпринты фикстур) | **0** |
| e-mail-литералы | **0** |
| Кавыченные телефонные литералы | ровно 1: `'+70000000000'` (тот самый плейсхолдер из allow-list) |
| `sourceCommit` = `730442aea6bd4428e5cb69fe098f2513eb674fea` | реальный: `git cat-file -t` → `commit`; `chore(deploy): TEST-фикстуры телеметрии вынесены в отдельный файл (салваж) #1081`, 2026-08-01 04:02:25; `git merge-base --is-ancestor … HEAD` → предок HEAD |
| `schemaSha256`/`seedSha256` против файлов | совпадают (иначе `schema_hash_drift`/`seed_hash_drift`; гейт зелёный) |
| `census` (241 таблица / 196 функций / 244 политики) против фактического дампа | совпадает (иначе `schema_census_drift`) |
| Объекты трёх последних миграций (`0285`, `0286`, `0287`) присутствуют в дампе | да |

**Дополнительная проверка честности, которой не было в брифе.** Я выписал из эталона все 196 функций и 241
таблицу и проверил, что каждый объект объясним источником в репозитории:

- 152 объекта прослеживаются в цепочку миграций (`drizzle-migrations`, `integrator/.../core`, `integrations/*`);
- 40 — в оверлеи `deploy/postgres/*.sql` (`app.read_saas_isolation_events`, `app.reset_principal_context`,
  `app.get_web_push_vapid_public_key`, `app.provision_specialist_owner` и т. д.). Это ожидаемо и согласуется
  с формулировкой Б1 «цепочка не самодостаточна»;
- `drizzle.__drizzle_migrations` и `public.webapp_schema_migrations` — создаются самими раннерами миграций;
- `public.media_folders_enforce_depth` и `public.media_folders_prevent_cycle` — из
  **`apps/webapp/migrations/067_media_folders_and_multipart.sql`**, то есть из ЛЕГАСИ-набора
  (`apps/webapp/scripts/run-migrations.mjs`: «LEGACY: runs SQL files from `apps/webapp/migrations/*.sql`»),
  91 файл, последняя правка 2026-06-12.

**Ноль объектов, не объяснимых ничем.** Ни одного DEV-only артефакта в эталоне не найдено — в частности,
удалённые из DEV фикстурные функции в дамп действительно не попали.

Отдельно: `refresh-a0-greenfield-baseline.mjs` берёт схему как
`pg_dump --dbname=bcb_webapp_dev --schema-only --no-owner --no-privileges --no-comments` с предварительной
сверкой `SELECT current_database()` → `source_database_mismatch`. Строк не выгружает — запрет Б1 на дамп
ЖИВОЙ базы соблюдён в той трактовке, которую сам план и разрешает («эталон схемы разрешён»). Побочное
следствие, которое стоит держать в голове для Б1: из-за `--no-privileges --no-owner` эталон несёт функции
оверлеев, но **не несёт их гранты и владельцев** — харнесс обязан накатывать оверлеи отдельно, иначе
привилегии в шаблоне будут не те, что на TEST.

### 2.7. Четыре роли генератора реальны (пункт 5, смежное)

| Роль | `CREATE ROLE` найден в | Коммит из комментария |
|---|---|---|
| `app_platform_settings` | `deploy/postgres/u9a-platform-settings-role.sql` | `7c9d94bea feat(platform): add global settings principal spine` — существует, совпадает |
| `app_operational_web_push_reminder` | `deploy/postgres/c4-web-push-reminder-runtime.sql` | `7ebda0418 fix(saas): close owner-ready notification runtime gaps` — существует, совпадает |
| `app_web_push_reminder_discovery_definer` | `deploy/postgres/c4-web-push-reminder-runtime.sql` | тот же — существует, совпадает |
| `app_clinic_billing` | `deploy/postgres/c5a-platform-operations-runtime.sql` | `8efd15698 fix(saas): close C5A quota trial and platform gates` — существует, совпадает |

Провенанс в комментариях `allowedPolicyRoles` не выдуман: все четыре роли, файлы и коммиты сходятся.

### 2.8. Удаление функций из DEV ничего живого не сломало (пункт 6)

| Вызывающий | Рассчитан на TEST? | Ломается ли от отсутствия функций в DEV |
|---|---|---|
| `apps/webapp/scripts/run-saas-isolation-test-scenarios.ts` | **Да, жёстко**: `const REQUIRED_DATABASE = 'bersoncarebot_test'`, `assertExactTestOperator()` сверяет `current_database()`, `rolsuper=false`, `rolbypassrls=false`, членство в `saas_telemetry_operator` и НЕ-членство в `app_*` — и делает это **до** первого вызова фикстурной функции | Нет: в DEV падает на преflight-е `saas_isolation_test_scenario_operator_preflight_failed`, до обращения к удалённым функциям |
| `apps/webapp/scripts/report-saas-isolation-diagnostics.ts` (подкоманда `scenario`, стр. 171) | Собственной проверки имени БД **нет** — опирается только на предохранитель внутри самой SQL-функции | Нет автоматических прогонов: запускается вручную через `npm run diagnostics:saas-isolation`. В DEV теперь упадёт с `undefined_function` вместо явного `saas_isolation_scenario_test_database_required` — диагностика хуже, но безопасность не пострадала |
| `docs/_TODO/SAAS_FOUNDATION/scripts/rehearse-saas-isolation-diagnostics.mjs` | репетиционный скрипт в `docs/_TODO`, не в прогоне | Нет |
| `deploy/host/deploy-test-saas.sh:772-781` `run_saas_isolation_test_scenario_proof()` | TEST, вызов на стр. 2168 — **после** установки фикстурного оверлея (стр. 2162) | Нет |

Ни один `*.test.ts`/`*.spec.ts` не импортирует `saasIsolationTestScenarioRunner` /
`saasIsolationTestScenarioCliArgs` и не упоминает обе функции — `grep` по `apps/webapp` пуст. Ни один
`check:*`/`lint`/`test*` скрипт из `package.json` их не вызывает; в `package.json` есть только две ручные
точки входа (`diagnostics:saas-isolation`, `diagnostics:saas-isolation:test-scenarios`).
**Ни один прогон тестов и ни один скрипт от отсутствия функций в DEV не ломается.**

Оговорка: фактическое состояние DEV-базы я подтвердить не могу — `sudo` недоступен
(`sudo: The "no new privileges" flag is set`), а `psql` к `bcb_webapp_dev` требует пароля
(`fe_sendauth: no password supplied`). Проверено следствие в коде, а не состояние базы.

### 2.9. Что проверить не удалось

| Пункт моего списка | Почему |
|---|---|
| П3 (перестановка порядка применения), П4 (отсутствующая psql-переменная) | требуют живого кластера и суперпользователя; недоступно (`NoNewPrivs=1`). Проверено чтением: guard-блоки `\if :{?…}` + `SELECT 1/0` при `ON_ERROR_STOP on` присутствуют для всех трёх переменных; при неверном порядке `ALTER FUNCTION … OWNER TO saas_telemetry_owner` упадёт на несуществующей роли. Замечание: в отличие от основного оверлея, фикстурный файл **не** содержит предварительного `SELECT 1 / (EXISTS … pg_roles …)` — отказ произойдёт позже, уже после `CREATE FUNCTION` |
| Фактическое отсутствие функций в DEV | нет доступа к базе (см. §2.8) |

---

## 3. Сколько поломок прошло незамеченными

Внесено и проверено делом **28 поломок**. Не поймано — **6**:

**Критические (4) — механической проверки нет вообще:**

1. **A/A′ — дрейф миграции в рабочем дереве не ловится.** Прямо тот сценарий, который бриф назвал
   «самое важное» («попробуй внести дрейф… поправить одну миграцию на месте»). Полный заявленный гейт
   `check:saas-a0-greenfield-baseline` даёт `EXIT=0`, `pass 8 / fail 0`. Ловится только закоммиченный дрейф.
2. **F — TEST-фикстуры, подключённые в `deploy-prod.sh`, не ловятся ничем.** Ровно тот инвариант, ради
   которого делался разрез.
3. **G — фикстурная функция, возвращённая в прод-оверлей `saas-isolation-telemetry.sql`, не ловится ничем.**
4. **H — удаление предохранителя `current_database() <> 'bersoncarebot_test'` из обеих функций не ловится
   ничем**, включая `eslint .`.

**Предсуществующие границы, не регрессия этой работы (2):**

5. Телефонный литерал без кавычек — вне `quotedPhonePattern`.
6. Телефон в не-E.164 формате (`8-800-555-3535`) — вне `quotedPhonePattern`.

Пункты 5-6 существовали до сужения проверки (сверено с `c402f29a8^`) и находкой против этой задачи не
являются; фиксирую как известную границу.

---

## 4. Вердикт построчно

| Пункт брифа | Вердикт | Основание |
|---|---|---|
| **1.** Разрез не потерял ничего боевого | ✅ **ПРИНЯТО** | §2.4: сверены по существу все 12 классов объектов/привилегий; ни один `GRANT`/`REVOKE`/владелец/`SECURITY DEFINER`/`search_path` не потерян и не изменён. Порядок применения сохранён |
| **2.** Фикстуры не попадают никуда, кроме TEST | ✅ **ПРИНЯТО** (с оговоркой к п. 1 ниже) | §2.5: список из 10 явно проверенных скриптов + два сплошных поиска по всему дереву. Ровно одна точка объявления и одна применения, обе проверки наличия файла на месте, все три `-v` переданы, порядок вызова верный. **Оговорка:** сегодня это состояние, а не инвариант — см. находку 2 |
| **3.** Предохранитель в теле функций цел | ✅ **ПРИНЯТО** (факт) / ⚠️ **не защищён** | Предохранитель на месте в обеих функциях (стр. 36-38 и 84-86), разрез его не тронул. Но его удаление не роняет ни один гейт — находка 4 |
| **4а.** В `schema.sql` нет фикстурных функций | ✅ **ПРИНЯТО** | §2.6: 0 вхождений обоих имён |
| **4б.** Нет идентификаторов среды и телефонов | ✅ **ПРИНЯТО** | §2.6: 0 вхождений `bersoncarebot*`/`bcb_webapp*`/`saas_telemetry`/`test-fixture`/e-mail; единственный телефон — разрешённый плейсхолдер |
| **4в.** Манифест ссылается на реальный `sourceCommit` | ✅ **ПРИНЯТО** | §2.6: `730442aea…` — существующий коммит, предок HEAD, ровно коммит разреза |
| **4г.** Гейт ловит дрейф | 🔴 **ОТКЛОНЕНО — КРИТИЧЕСКАЯ НАХОДКА** | §2.1: правка миграции **в рабочем дереве** проходит полный гейт с `EXIT=0`, `pass 8 / fail 0`. Закоммиченный дрейф ловится. Причина в коде названа: `validatePackage()` читает `git show HEAD:…`, а `assertCleanRefreshSource()` в пути `check` не вызывается |
| **5.** Строгость генератора не ослаблена | ✅ **ПРИНЯТО** | §2.2: 19 из 21 подставленных поломок краснеют, включая 4 разных телефонных литерала; `quotedPhonePattern` не менялся, allow-list из одного элемента и только для `scanSchemaArtifact`; `scanSeedArtifact` не тронут. Роли и коммиты в `allowedPolicyRoles` реальны (§2.7) |
| **6.** Удаление функций из DEV не сломало ничего живого | ✅ **ПРИНЯТО** | §2.8: главный вызывающий жёстко упирается в `bersoncarebot_test` до первого обращения к функциям; ни один тест/`check:*`/CI их не зовёт; TEST-доказательство в `deploy-test-saas.sh` идёт после установки оверлея. Состояние самой DEV-базы не проверял — нет доступа |

### Находки (по убыванию тяжести)

1. **КРИТИЧЕСКАЯ. `check:saas-a0-greenfield-baseline` не ловит дрейф миграции в рабочем дереве.**
   `scripts/a0-greenfield-baseline-lib.mjs:509-525` сверяет реестр против `HEAD` через `git show`;
   `scripts/check-a0-greenfield-baseline.mjs` не вызывает `assertCleanRefreshSource()`, хотя та уже написана
   (стр. 95-102) и уже покрывает обе директории миграций через `REFRESH_SOURCE_PATHS`. Правка одной строки —
   вызвать `assertCleanRefreshSource()` в начале `validatePackage()` (или в `check-…mjs`) — закрывает дыру
   имеющимся кодом. Это ровно тот сценарий, который бриф назвал критическим.

2. **ВЫСОКАЯ. Разрез не защищён механической проверкой — нарушение `AGENTS.md` §5.**
   Единая точка создана, но «механической проверки, роняющей сборку на обходе», нет: возврат фикстур в
   прод-оверлей (проба G) и подключение фикстурного файла в `deploy-prod.sh` (проба F) проходят все шесть
   релевантных гейтов зелёными. В репозитории ноль тестов, упоминающих эти файлы. Формально Б2 в части
   разреза «выполненным» по §5 считаться не может.

3. **ВЫСОКАЯ. Удаление предохранителя `current_database() <> 'bersoncarebot_test'` не роняет ничего**
   (проба H, `fuses removed: 2`, все гейты зелёные, включая `eslint .`). Сейчас этот предохранитель —
   единственная защита пути `report-saas-isolation-diagnostics.ts scenario`, у которого своей проверки имени
   БД нет.

4. **СРЕДНЯЯ. Легаси-набор `apps/webapp/migrations/*.sql` (91 файл) запечён в эталон, но не покрыт
   манифестом.** Из него в `schema.sql` приходят `media_folders_enforce_depth` / `media_folders_prevent_cycle`,
   а `REFRESH_SOURCE_PATHS` и `ledgers` его не отслеживают. Набор заморожен с 2026-06-12, так что практического
   расхождения сейчас нет, но контракт «эталон + миграции поверх» для него не проверяется вовсе.

5. **НИЗКАЯ. `report-saas-isolation-diagnostics.ts` (подкоманда `scenario`) не имеет собственной проверки
   имени БД**, в отличие от `run-saas-isolation-test-scenarios.ts`. После удаления функций из DEV она падает
   с `undefined_function` вместо осмысленного `saas_isolation_scenario_test_database_required`.

6. **НИЗКАЯ. Фикстурный файл не проверяет существование трёх runtime-ролей заранее**, в отличие от основного
   оверлея (`saas-isolation-telemetry.sql:27-31`). При неверном порядке применения отказ произойдёт позже,
   уже после `CREATE FUNCTION`.

7. **ИНФОРМАЦИОННО. Эталон несёт функции оверлеев без их грантов и владельцев** (`--no-owner --no-privileges`).
   Для харнесса Б1 это значит: шаблон обязан догоняться оверлеями, иначе привилегии в нём не те, что на TEST.

---

## 5. Границы соблюдены

- Ничего не чинил. Все 28 поломок откачены; побайтовая сверка восстановленного файла миграции —
  `cmp -s` → `YES`. Два технических коммита-пробы (`aa34a65ed`, хвостовая миграция) сняты
  `git reset --hard`, HEAD вернулся на `2f29133c9`.
- Прод не трогал; функции в DEV не возвращал; DEV/TEST/прод-базы не изменял (и не мог — `NoNewPrivs=1`).
- Дерево клона после аудита: `git status --porcelain` → только этот отчёт
  (`?? docs/_TODO/runs/testsuite-v2/ETALON_BLIND_AUDIT_REPORT.md`), `git stash list` пуст,
  `HEAD=2f29133c9`. Отметка окончания: **2026-08-01T04:28:57+03:00**.
