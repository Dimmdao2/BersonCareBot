# Аудит порядка стены рождения отношений — 2026-08-20

Аудируемый коммит: `632b582ec7ce44fffe3626785e7730f26bf3e461`.

## Вердикт: FAIL

Сама продуктовая правка подтверждена живым прогоном: причина верна, три таблицы внутри снятого окна объявлены и
попадают в seed, после контракта стена активна, незаявленная таблица получает `42501`, заявленная создаётся.

Гейт коммита не принимается из-за теста: он читает текст SQL, считает совпадения и сравнивает позиции. Это прямо
запрещено `AGENTS.md` §10a. Fault injection `ALTER EVENT TRIGGER ... DISABLE` оставил тест зелёным, хотя живая
незаявленная таблица успешно родилась в `app_ext`. Следовательно, тест не доказывает обязательное поведение стены.

Все PostgreSQL-проверки выполнялись только через локальный socket `/var/run/postgresql:5432` на отдельных БД
`bcb_wall_audit_20260820_632b582ec` и `bcb_wall_audit_20260820_disabled`. Обе удалены; PROD, `bersoncarebot_test`
и `bcb_webapp_dev` не изменялись.

## Ответы и evidence

| вопрос | команда | код возврата | что увидел | вывод |
|---|---|---:|---|---|
| 1. Есть ли trigger в snapshot и строки реестра? | `rg -n "bcb_relation_birth_wall\|relation_wall_registry" deploy/postgres/generated/prod-to-target/schema-post.sql` | `0` | `CREATE EVENT TRIGGER bcb_relation_birth_wall` есть в `schema-post.sql`. | Стена приезжает из snapshot. |
| 1. Несёт ли snapshot строки реестра? | `rg --files deploy/postgres/generated/prod-to-target`; затем `rg -n "(?:COPY\|INSERT INTO) app_control\.relation_wall_registry" deploy/postgres/generated/prod-to-target` | `0`; затем `1` | Проверены все четыре snapshot-артефакта: `schema-pre.sql`, `schema-post.sql`, `runtime-settings.sql`, `ledgers-and-baseline.sql`; ни `COPY`, ни `INSERT` для реестра нет. | Реестр после schema-only snapshot пуст. |
| 1. Каков фактический порядок reconcile? | `rg -n "relation-wall-registry\|contract\.sql\|generate-cli" deploy/postgres/privileges/reconcile-access.mjs` | `0` | `contract.sql` — строка 103, `--relation-wall-registry` — строка 104. | Контракт действительно идёт раньше seed. |
| 1. Воспроизводится ли заявленная причина? | После установки стены и `TRUNCATE app_control.relation_wall_registry` (`exit 0`): `(printf 'BEGIN;\n'; git show 632b582ec^:deploy/postgres/port-context/contract.sql; printf '\nCOMMIT;\n') \| sudo -n -u postgres psql -q -X -h /var/run/postgresql -p 5432 -d "$AUDIT_DB" -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -v app_staff_login=postgres -v app_patient_login=postgres -v app_global_admin_login=postgres -v integrator_login=postgres` | stream `0`, psql `3` | `ERROR: 42501: relation birth wall rejected undeclared table app_ext.port_context_capabilities`. | Причина подтверждена независимо. |
| 1. Исправляет ли новая строка этот конкретный отказ? | `sudo -n -u postgres psql -q -X -h /var/run/postgresql -p 5432 -d "$AUDIT_DB" -v ON_ERROR_STOP=1 -v app_staff_login=postgres -v app_patient_login=postgres -v app_global_admin_login=postgres -v integrator_login=postgres -c 'BEGIN;' -f deploy/postgres/port-context/contract.sql -c 'COMMIT;'` при том же пустом реестре | `0` | Контракт завершился и вернул trigger. | Да. |
| 2. Какие охраняемые таблицы рождаются в снятом окне? | `rg -n "CREATE TABLE( IF NOT EXISTS)? (app\|app_ext\|public\|integrator)\." deploy/postgres/port-context/contract.sql` | `0` | Ровно три: `app_ext.port_context_capabilities`, `app_ext.accepted_port_contexts`, `app_ext.variant_a_identity_refs`. | Других таблиц охраняемых схем внутри окна нет. |
| 2. Объявлены ли все три и попадут ли в seed? | `rg -n -C 4 "app_ext\.(port_context_capabilities\|accepted_port_contexts\|variant_a_identity_refs)" deploy/postgres/privileges/declaration.ts`; затем `node deploy/postgres/privileges/generate-cli.mjs --db bersoncarebot_test --relation-wall-registry \| rg -n "port_context_capabilities\|accepted_port_contexts\|variant_a_identity_refs"` | `0`; `0` | Все три находятся в `REV10_CONTEXT.privateRelations`. Generator выдаёт три registry-строки и три `ALTER TABLE ... OWNER`: первые две с owner `app_seam_context_owner`, третья — `app_seam_identity_lookup_owner`. | Проскочившей незаявленной таблицы нет; продуктовая правка окно не ослабила для уже имеющегося DDL. |
| 3. Отказывает ли стена незаявленной таблице после контракта? | `sudo -n -u postgres psql -q -X -h /var/run/postgresql -p 5432 -d "$AUDIT_DB" -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -c 'CREATE TABLE app_ext.audit_birth_wall_undeclared(id integer);'` | `1` | `ERROR: 42501: relation birth wall rejected undeclared table app_ext.audit_birth_wall_undeclared`. | Да, обязательный отказ получен. |
| 3. Пропускает ли стена заявленную таблицу? | `sudo -n -u postgres psql -q -X -h /var/run/postgresql -p 5432 -d "$AUDIT_DB" -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -c 'SET ROLE app_object_owner; CREATE TABLE app.context_nonce_ledger(id bigint); RESET ROLE;'` | `0` | Таблица создана с owner `app_object_owner`; catalog показал `rls=true`, `force=true`. | Да, заявленная таблица проходит и получает обе RLS-стены. |
| 3. Активна ли стена снаружи контракта? | `sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d "$AUDIT_DB" -v ON_ERROR_STOP=1 -Atc "SELECT evtname \|\| '|' \|\| evtenabled::text FROM pg_event_trigger WHERE evtname='bcb_relation_birth_wall';"` | `0` | `bcb_relation_birth_wall\|O`. | В исправленном состоянии trigger включён (`O`). |
| 4. Можно ли штатно посеять реестр до контракта на свежей БД? | `node deploy/postgres/privileges/generate-cli.mjs --db bersoncarebot_test --relation-wall-registry \| sudo -n -u postgres psql -q -X -h /var/run/postgresql -p 5432 -d "$AUDIT_DB" -v ON_ERROR_STOP=1 -v VERBOSITY=verbose` сразу после `createdb` | generator `0`, psql `3` | `ERROR: 42P01: relation "app_control.relation_wall_registry" does not exist`. | Нет. Перестановка текущего seed перед `contract.sql` на свежей БД не работает и не является лучшей готовой правкой. |
| 5. Краснеет ли тест при удалении первого disarm? | Временная замена первого `DROP EVENT TRIGGER IF EXISTS bcb_relation_birth_wall;` на комментарий; затем `node --test deploy/postgres/privileges/port-context-catalog.test.mjs` | `1` | `not ok 16`, `1 !== 2`, сообщение «стена снимается дважды». После возврата строки тот же прогон: `0`, 16/16. | Тест ловит точное удаление строки. |
| 5. Ловит ли тест поломку поведения? | Временная вставка `ALTER EVENT TRIGGER bcb_relation_birth_wall DISABLE;` после `CREATE EVENT TRIGGER`; затем `node --test deploy/postgres/privileges/port-context-catalog.test.mjs`; после применения изменённого контракта: `psql ... -c 'CREATE TABLE app_ext.audit_birth_wall_undeclared(id integer);'` | test `0`; CREATE `0`; catalog `0` | Все 16 тестов зелёные; catalog: `bcb_relation_birth_wall\|D`; незаявленная таблица реально существует. Мутация удалена после прогона. | Нет. Добавленный тест — ложная защита формы, а не поведенческий гейт. |
| Очистка | `sudo -n -u postgres dropdb -h /var/run/postgresql -p 5432 --if-exists "$AUDIT_DB"`; затем `sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname='bcb_wall_audit_20260820_632b582ec';"` | `0`; `0` | Запрос вернул `0`. Для fault-БД `bcb_wall_audit_20260820_disabled` `dropdb` также вернул `0`. | Одноразовые БД удалены. |

## Находки

### MUST FIX — добавленный тест не проверяет поведение стены

Достижимый сценарий: после корректной строки `CREATE EVENT TRIGGER` trigger отключается или иначе остаётся
неактивным. Добавленный тест остаётся зелёным, потому что видит ожидаемое число строк и их порядок. В живой БД
незаявленная `app_ext.audit_birth_wall_undeclared` тогда создаётся с `exit 0`; security boundary рождения
отношений отсутствует.

Нарушены:

- требование брифа: поведение стены при пустом реестре должно проверяться прогоном;
- `AGENTS.md` §10a, запреты 1, 2, 3 и 5: не читать текст SQL, не сравнивать позиции, не считать вхождения и не
  выдавать сверку SQL за проверку живой БД;
- критерий вопроса 3: стена обязана оставаться активной для всего вне `contract.sql`.

Продуктовый SQL в текущем SHA живой runtime-проход выдержал; FAIL относится к обязательному regression-gate в
этом же коммите. Продуктовых исправлений аудитор не вносил.
