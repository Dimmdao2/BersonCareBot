# Поведенческая проверка стены рождения отношений — 2026-08-20

Проверен `632b582ec`: продуктовый `contract.sql` не менялся. Текстовая проверка позиций SQL удалена;
её заменяет opt-in proof
`deploy/postgres/privileges/relation-birth-wall.behaviour.devDbProof.test.mjs`.

Запуск создаёт по одной базе из `template0` для штатного прогона и каждой инъекции. В каждой базе
исполняются `schema-pre.sql` и `schema-post.sql`, поэтому до контракта фактически получаются
включённый `bcb_relation_birth_wall` и пустой `app_control.relation_wall_registry`. `finally`
удаляет базу и проверяет её отсутствие. `bersoncarebot_test`, `bcb_webapp_dev` и PROD не
использовались. Роли не создавались, а права не выдавались/не отзывались самостоятельной логикой
proof: database-local ACL исполнял только проверяемый контракт внутри удаляемой БД.

| Проверка | Команда | Код возврата | Что увидел | Вывод |
| --- | --- | ---: | --- | --- |
| Обычный opt-in прогон | `RUN_RELATION_BIRTH_WALL_DB=1 node --test deploy/postgres/privileges/relation-birth-wall.behaviour.devDbProof.test.mjs` | `0` | 3/3 сценария зелёные; каждая фикстура до контракта проверила `registry=0` и `trigger=O`. | Proof воспроизводит состояние schema-only snapshot B. |
| Видимость штатному раннеру | `pnpm test:db-privileges` | `0` | 150 зелёных, 23 opt-in DB proofs пропущены; новый файл выбран glob `deploy/postgres/privileges/*.test.mjs`. | Обычный набор видит новый proof, но без opt-in не создаёт БД. |
| Порядок контракта | Внутри первого сценария: `psql ... -f -` с текущим `contract.sql` на snapshot B | `0` | Контракт применился при пустом реестре; после него `registry=0`, `trigger=O`. | Собственный DDL контракта проходит через снятую на время стену, затем стена возвращается. |
| Незаявленная relation снаружи контракта | Внутри первого сценария: `CREATE TABLE app_ext.bcb_birth_wall_undeclared_proof (id integer);` | `3` / SQLSTATE `42501` | `relation birth wall rejected undeclared table`. | Активная стена не пропускает незаявленную таблицу. |
| Заявленная relation снаружи контракта | После одной строки в `app_control.relation_wall_registry`: `CREATE TABLE app_ext.bcb_birth_wall_declared_proof (id integer);` | `0` | Таблица создана; её `relrowsecurity|relforcerowsecurity` = `true|true`. | Объявленная таблица проходит и получает RLS-стену. |
| Инъекция: убрать начальное снятие стены | Тот же snapshot-run с временной копией `contract.sql` без первого `DROP EVENT TRIGGER ...` | `3` / SQLSTATE `42501` | Контракт остановлен на охраняемом DDL: `relation birth wall rejected undeclared table app_ext.port_context_capabilities`. | Самопроверка ловит точную регрессию порядка. |
| Инъекция: отключить trigger после контракта | `ALTER EVENT TRIGGER bcb_relation_birth_wall DISABLE;` затем `CREATE TABLE app_ext.bcb_birth_wall_undeclared_proof (id integer);` | `0`; затем `0` | Незаявленная таблица реально существует. Вызов штатного `assertRejectedByBirthWall` на этом результате выбрасывает ошибку (`exit 0`, а не ожидаемый `3`/`42501`). | Самопроверка доказывает, что внешняя проверка краснеет при выключенной стене; прежний текстовый тест эту поломку пропускал. |
| Очистка | `DROP DATABASE IF EXISTS <одноразовая-база> WITH (FORCE);` и запрос отсутствия в `pg_database` в `finally` каждого сценария | `0` | Три проверки отсутствия вернули `0`. | Одноразовые базы удалены, именованные DEV/TEST не затронуты. |

Дополнительная обычная проверка: `node --test deploy/postgres/privileges/port-context-catalog.test.mjs deploy/postgres/privileges/relation-birth-wall.behaviour.devDbProof.test.mjs` вернула `0`: 15 тестов зелёные, 3 opt-in сценария корректно пропущены без переменной окружения.
