FAIL

# Аудит `545ae4ea2`: relation birth wall behaviour proof

Поведенческие пункты 1–5 тест прошёл: штатный прогон зелёный, обе внешние fault injection
покрасили набор, а ошибка подключения не была скрыта skip-ом. Итоговый FAIL вызван отдельным
достижимым нарушением обязательного repo-rule: новый retained-тест на каждом opt-in запуске
создаёт три disposable PostgreSQL из `template0`. Это прямо запрещено `AGENTS.md` §1b/§10b уже
на проверяемом SHA: DB-поведение проверяется только на именованных DEV/TEST, временную БД не
создавать. Impact: тест нельзя принять как действующий merge/acceptance gate в его нынешней
форме, хотя его oracle и fault sensitivity работают.

Проверяемые три файла в текущем checkout идентичны `545ae4ea2`:

```text
$ git diff --exit-code 545ae4ea2..HEAD -- deploy/postgres/privileges/relation-birth-wall.behaviour.devDbProof.test.mjs deploy/postgres/port-context/port-context-catalog.test.mjs deploy/postgres/port-context/contract.sql
[пустой вывод]
exit 0
```

## 1. Чистый штатный прогон — PASS

Перед запуском `git status --short --branch` вывел только `## wt/walltest-20260820`, то есть
рабочее дерево было чистым.

Команда (без pipe):

```bash
RUN_RELATION_BIRTH_WALL_DB=1 node --test deploy/postgres/privileges/relation-birth-wall.behaviour.devDbProof.test.mjs
```

Код возврата: `0`.

Вывод:

```text
TAP version 13
# Subtest: contract crosses empty-registry snapshot B and restores the relation birth wall
ok 1 - contract crosses empty-registry snapshot B and restores the relation birth wall
  ---
  duration_ms: 3940.916533
  type: 'test'
  ...
# Subtest: self-check: removing the contract disarm makes the same empty-registry run fail with 42501
ok 2 - self-check: removing the contract disarm makes the same empty-registry run fail with 42501
  ---
  duration_ms: 3496.124411
  type: 'test'
  ...
# Subtest: self-check: the normal rejection assertion turns red when the restored trigger is disabled
ok 3 - self-check: the normal rejection assertion turns red when the restored trigger is disabled
  ---
  duration_ms: 3767.885909
  type: 'test'
  ...
1..3
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 11291.64505
```

## 2. Инъекция A: убрать первый disarm — PASS

В `deploy/postgres/port-context/contract.sql` временно удалена первая строка
`DROP EVENT TRIGGER IF EXISTS bcb_relation_birth_wall;` (вторая перед пересозданием trigger не
трогалась).

Команда (без pipe):

```bash
RUN_RELATION_BIRTH_WALL_DB=1 node --test deploy/postgres/privileges/relation-birth-wall.behaviour.devDbProof.test.mjs
```

Код возврата: `1` — требуемый красный результат.

Вывод:

```text
TAP version 13
# Subtest: contract crosses empty-registry snapshot B and restores the relation birth wall
not ok 1 - contract crosses empty-registry snapshot B and restores the relation birth wall
  ---
  duration_ms: 3447.889662
  type: 'test'
  failureType: 'testCodeFailure'
  error: |-
    apply current contract with snapshot trigger and empty registry must succeed (exit=3, SQLSTATE=42501, stderr=psql:<stdin>:120: ERROR:  42501: relation birth wall rejected undeclared table app_ext.port_context_capabilities
    CONTEXT:  PL/pgSQL function enforce_relation_birth_wall() line 29 at RAISE)

    3 !== 0
  code: 'ERR_ASSERTION'
  expected: 0
  actual: 3
  operator: 'strictEqual'
  ...
# Subtest: self-check: removing the contract disarm makes the same empty-registry run fail with 42501
ok 2 - self-check: removing the contract disarm makes the same empty-registry run fail with 42501
  ---
  duration_ms: 3238.232642
  type: 'test'
  ...
# Subtest: self-check: the normal rejection assertion turns red when the restored trigger is disabled
not ok 3 - self-check: the normal rejection assertion turns red when the restored trigger is disabled
  ---
  duration_ms: 3304.916107
  type: 'test'
  failureType: 'testCodeFailure'
  error: |-
    apply current contract before disabling the wall must succeed (exit=3, SQLSTATE=42501, stderr=psql:<stdin>:120: ERROR:  42501: relation birth wall rejected undeclared table app_ext.port_context_capabilities
    CONTEXT:  PL/pgSQL function enforce_relation_birth_wall() line 29 at RAISE)

    3 !== 0
  code: 'ERR_ASSERTION'
  expected: 0
  actual: 3
  operator: 'strictEqual'
  ...
1..3
# tests 3
# suites 0
# pass 1
# fail 2
# cancelled 0
# skipped 0
# todo 0
# duration_ms 10078.522972
```

После прогона выполнено:

```bash
git checkout -- deploy/postgres/port-context/contract.sql
```

Затем `git diff --exit-code -- deploy/postgres/port-context/contract.sql` вернул `0`, вывод пустой.

## 3. Инъекция B: незаявленная таблица реально создаётся — PASS

Временно заменена ветка живой trigger-функции `IF NOT FOUND THEN RAISE ... 42501` на
`IF NOT FOUND THEN CONTINUE`; trigger остался навешан и enabled, но незаявленную relation пропустил.

Команда (без pipe):

```bash
RUN_RELATION_BIRTH_WALL_DB=1 node --test deploy/postgres/privileges/relation-birth-wall.behaviour.devDbProof.test.mjs
```

Код возврата: `1` — требуемый красный результат.

Вывод:

```text
TAP version 13
# Subtest: contract crosses empty-registry snapshot B and restores the relation birth wall
not ok 1 - contract crosses empty-registry snapshot B and restores the relation birth wall
  ---
  duration_ms: 3284.234107
  type: 'test'
  failureType: 'testCodeFailure'
  error: |-
    create undeclared table after contract must stop psql with exit 3 (exit=0, SQLSTATE=none, stderr=)

    0 !== 3
  code: 'ERR_ASSERTION'
  expected: 3
  actual: 0
  operator: 'strictEqual'
  ...
# Subtest: self-check: removing the contract disarm makes the same empty-registry run fail with 42501
ok 2 - self-check: removing the contract disarm makes the same empty-registry run fail with 42501
  ---
  duration_ms: 3268.790735
  type: 'test'
  ...
# Subtest: self-check: the normal rejection assertion turns red when the restored trigger is disabled
ok 3 - self-check: the normal rejection assertion turns red when the restored trigger is disabled
  ---
  duration_ms: 3328.141617
  type: 'test'
  ...
1..3
# tests 3
# suites 0
# pass 2
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 9992.110414
```

Ключевое runtime-доказательство находится в ошибке самого теста: `CREATE TABLE` вернул `exit=0`,
после чего normal oracle ожидал `3` и покраснел.

После прогона выполнено:

```bash
git checkout -- deploy/postgres/port-context/contract.sql
```

Затем `git diff --exit-code -- deploy/postgres/port-context/contract.sql` вернул `0`, вывод пустой.

## 4. PostgreSQL недоступен — PASS

Для fail-closed пробы в тестовом файле временно заменён порт `5432` на неслушающий `65432`.

Команда (без pipe):

```bash
RUN_RELATION_BIRTH_WALL_DB=1 node --test deploy/postgres/privileges/relation-birth-wall.behaviour.devDbProof.test.mjs
```

Код возврата: `1`. Не было ни skip, ни зелёного результата: все три subtest громко упали на
ошибке соединения.

Вывод:

```text
TAP version 13
# Subtest: contract crosses empty-registry snapshot B and restores the relation birth wall
not ok 1 - contract crosses empty-registry snapshot B and restores the relation birth wall
  ---
  duration_ms: 45.985479
  type: 'test'
  failureType: 'testCodeFailure'
  error: |-
    create disposable current database must succeed (exit=2, SQLSTATE=none, stderr=psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.65432" failed: No such file or directory
    Is the server running locally and accepting connections on that socket?)

    2 !== 0
  code: 'ERR_ASSERTION'
  expected: 0
  actual: 2
  operator: 'strictEqual'
  ...
# Subtest: self-check: removing the contract disarm makes the same empty-registry run fail with 42501
not ok 2 - self-check: removing the contract disarm makes the same empty-registry run fail with 42501
  ---
  duration_ms: 42.519634
  type: 'test'
  failureType: 'testCodeFailure'
  error: |-
    create disposable no_disarm database must succeed (exit=2, SQLSTATE=none, stderr=psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.65432" failed: No such file or directory
    Is the server running locally and accepting connections on that socket?)

    2 !== 0
  code: 'ERR_ASSERTION'
  expected: 0
  actual: 2
  operator: 'strictEqual'
  ...
# Subtest: self-check: the normal rejection assertion turns red when the restored trigger is disabled
not ok 3 - self-check: the normal rejection assertion turns red when the restored trigger is disabled
  ---
  duration_ms: 39.080499
  type: 'test'
  failureType: 'testCodeFailure'
  error: |-
    create disposable disabled database must succeed (exit=2, SQLSTATE=none, stderr=psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.65432" failed: No such file or directory
    Is the server running locally and accepting connections on that socket?)

    2 !== 0
  code: 'ERR_ASSERTION'
  expected: 0
  actual: 2
  operator: 'strictEqual'
  ...
1..3
# tests 3
# suites 0
# pass 0
# fail 3
# cancelled 0
# skipped 0
# todo 0
# duration_ms 214.856091
```

После прогона выполнено:

```bash
git checkout -- deploy/postgres/privileges/relation-birth-wall.behaviour.devDbProof.test.mjs
```

Итоговая проверка обоих временно изменявшихся файлов:

```text
$ git diff --exit-code -- deploy/postgres/port-context/contract.sql deploy/postgres/privileges/relation-birth-wall.behaviour.devDbProof.test.mjs
[пустой вывод]
EXIT_CODE=0
```

## 5. Покрытие удалённых 26 строк — PASS по поведению

Удалённая статическая проверка защищала два наблюдаемых последствия: контракт должен пройти
snapshot B при уже активной стене, а после контракта стена должна снова отвергать незаявленную
relation. Отдельная проверка количества/позиций SQL-строк не является поведением и запрещена
`AGENTS.md` §10a.

Поведенческая замена не потеряла эти два класса:

1. Команда пункта 2 после удаления первого disarm вернула `1`; PostgreSQL остановил контракт с
   SQLSTATE `42501` на `app_ext.port_context_capabilities`.
2. Команда пункта 3 после разрешения незаявленной relation вернула `1`; реальный `CREATE TABLE`
   вернул `0`, а тест упал на `0 !== 3`.
3. Штатная команда пункта 1 вернула `0`, поэтому красный цвет обеих инъекций не является
   постоянной ошибкой фикстуры.

Это именно прогоны живого объекта, а не чтение текста `contract.sql`.

## Очистка

Команда (без pipe):

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d postgres -v ON_ERROR_STOP=1 -A -t -c "SELECT count(*) FROM pg_database WHERE datname LIKE 'bcb_birth_wall_%';"
```

Код возврата: `0`.

Вывод:

```text
0
```

То есть после всех прогонов не осталось ни одной базы с префиксом proof-а. Это число получено
ровно приведённой выше командой.

## Исправление находки: named DEV + transaction rollback

`relation-birth-wall.behaviour.devDbProof.test.mjs` больше не создаёт PostgreSQL из `template0` и
не исполняет schema snapshot. Проба ходит только в именованную `bcb_webapp_dev`: каждый вызов psql
начинает транзакцию и завершает её `ROLLBACK`. Внутри отката очищается реестр стены, исполняется
настоящий `contract.sql`, а пробные relation/реестр/event trigger остаются только в этой
транзакции. Так проверяется существенное состояние snapshot B — включённая стена при пустом
реестре — без новой базы.

### Штатный прогон — PASS

```bash
RUN_RELATION_BIRTH_WALL_DB=1 node --test deploy/postgres/privileges/relation-birth-wall.behaviour.devDbProof.test.mjs
```

`FINAL_RELATION_BIRTH_WALL_TEST_EXIT=0`; все пять subtest зелёные. В частности, настоящий
`contract.sql` проходит свой `ALTER TABLE app_ext.port_context_capabilities` при пустом реестре,
незаявленная таблица получает `42501`, а заявленная создаётся с `ENABLE` и `FORCE RLS`.

### Инъекция A: убрать initial disarm — PASS

Временно удалена первая строка `DROP EVENT TRIGGER IF EXISTS bcb_relation_birth_wall;` из
`deploy/postgres/port-context/contract.sql`, затем выполнена та же команда без pipe.

`INJECTION_A_TEST_EXIT=1`. Первый контрактный subtest упал с SQLSTATE `42501` на
`app_ext.port_context_capabilities`; значит, проверка ловит отсутствие disarm перед собственным
DDL. После прогона строка возвращена; `git diff --exit-code --
deploy/postgres/port-context/contract.sql` вернул код `0`.

### Инъекция B: не навешивать стену — PASS

Временно убран `CREATE EVENT TRIGGER bcb_relation_birth_wall …` из `contract.sql`, затем выполнена
та же команда без pipe.

`INJECTION_B_TEST_EXIT=1`: незаявленная таблица создалась с exit `0`, после чего normal assertion
покраснел; заявленная таблица получила `false|false` вместо `true|true`. Trigger возвращён;
`git diff --exit-code -- deploy/postgres/port-context/contract.sql` снова вернул код `0`.

### Базы и откат — PASS

До и после штатного прогона выполнена команда (без pipe):

```bash
sudo -n -u postgres psql -X -A -t -q -h /var/run/postgresql -p 5432 -d postgres -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY; SELECT count(*) FROM pg_database; ROLLBACK;"
```

Вывод до: `8` (`PG_DATABASE_COUNT_BEFORE_EXIT=0`); после: `8`
(`PG_DATABASE_COUNT_AFTER_EXIT=0`). Пробные таблицы после прогона отсутствуют; команда:

```bash
sudo -n -u postgres psql -X -A -t -q -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY; SELECT to_regclass('app_ext.bcb_birth_wall_undeclared_proof') IS NULL AND to_regclass('app_ext.bcb_birth_wall_declared_proof') IS NULL; ROLLBACK;"
```

вывела `t` (`PROBE_TABLE_ABSENCE_EXIT=0`).
