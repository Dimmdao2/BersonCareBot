FAIL

# Аудит `2397addd2` — карантин `app_owner`

Аудирован коммит `2397addd2` (`fix(db): quarantine retired app_owner role`). Три целевых файла не
изменились между `2397addd2` и текущим `HEAD` (`git diff --quiet 2397addd2 HEAD --
deploy/postgres/privileges/declaration.ts deploy/postgres/privileges/generate-cli.mjs
deploy/postgres/privileges/generate.mjs`, код `0`). Хост доказан как DEV/TEST:
`hostname -I`, код `0`, вывод начинается с `151.241.228.122`; PROD `135.106.162.170` не затрагивался.

## 1. Верификатор окружения DEV — PASS

Команда выполнена без pipe: генератор записал SQL в отдельный файл, затем `psql` прочитал его через `-f`.

```bash
verifier_sql=$(mktemp /tmp/bcb-appowner-env-verify.XXXXXX.sql)
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs \
  --env dev --db bcb_webapp_dev --env-verify > "$verifier_sql"
generator_rc=$?
chmod 0644 "$verifier_sql"
printf 'generator_exit=%s\n' "$generator_rc"
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 \
  -d bcb_webapp_dev -v ON_ERROR_STOP=1 -f "$verifier_sql"
verifier_rc=$?
printf 'verifier_exit=%s\n' "$verifier_rc"
rm -f "$verifier_sql"
exit "$verifier_rc"
```

Код возврата всей команды: `0`.

```text
generator_exit=0
NOTICE:  BCB_ENVIRONMENT_VERIFIED env=dev database=bcb_webapp_dev logins=4
DO
verifier_exit=0
```

Первый технический запуск до этой команды не дошёл до SQL: файл `mktemp` имел режим `0600`, поэтому
`psql` вернул `Permission denied` и код `1`. После явного `chmod 0644` фактический верификатор выше
выполнен и вернул `0`; база в неудавшейся попытке не открывалась.

## 2. Владение объектами в DEV и TEST — PASS

Команда:

```bash
ownership_query="BEGIN READ ONLY; SELECT current_database() AS database_name, fact, n FROM (SELECT 'all_db_local_owned_objects_pg_shdepend'::text AS fact,count(*)::bigint AS n FROM pg_catalog.pg_shdepend d JOIN pg_catalog.pg_roles r ON d.refclassid='pg_catalog.pg_authid'::regclass AND d.refobjid=r.oid WHERE r.rolname='app_owner' AND d.deptype='o' AND d.dbid=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database()) UNION ALL SELECT 'functions_owned',count(*) FROM pg_catalog.pg_proc WHERE proowner='app_owner'::regrole UNION ALL SELECT 'relations_owned',count(*) FROM pg_catalog.pg_class WHERE relowner='app_owner'::regrole UNION ALL SELECT 'schemas_owned',count(*) FROM pg_catalog.pg_namespace WHERE nspowner='app_owner'::regrole UNION ALL SELECT 'types_owned',count(*) FROM pg_catalog.pg_type WHERE typowner='app_owner'::regrole) measured ORDER BY fact; ROLLBACK;"
for audited_db in bcb_webapp_dev bersoncarebot_test; do
  sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 \
    -d "$audited_db" -v ON_ERROR_STOP=1 -P pager=off -c "$ownership_query"
  printf 'psql_exit[%s]=%s\n' "$audited_db" "$?"
done
```

Коды возврата: `psql_exit[bcb_webapp_dev]=0`, `psql_exit[bersoncarebot_test]=0`.

```text
bcb_webapp_dev     | all_db_local_owned_objects_pg_shdepend | 0
bcb_webapp_dev     | functions_owned                        | 0
bcb_webapp_dev     | relations_owned                        | 0
bcb_webapp_dev     | schemas_owned                          | 0
bcb_webapp_dev     | types_owned                            | 0
bersoncarebot_test | all_db_local_owned_objects_pg_shdepend | 0
bersoncarebot_test | functions_owned                        | 0
bersoncarebot_test | relations_owned                        | 0
bersoncarebot_test | schemas_owned                          | 0
bersoncarebot_test | types_owned                            | 0
```

`pg_shdepend` с `deptype='o'` подтверждает отсутствие любых DB-local ownership dependencies, а
отдельные owner-каталоги подтверждают ноль по основным классам объектов. Карантин не отбирает доступ
у живого объекта в этих двух базах.

## 3. Запрещённое расширение прав в диффе — PASS

Команда:

```bash
audit_diff=$(mktemp /tmp/bcb-appowner-commit.XXXXXX.diff)
added_lines=$(mktemp /tmp/bcb-appowner-added.XXXXXX.diff)
git diff --unified=0 2397addd2^ 2397addd2 -- \
  deploy/postgres/privileges/declaration.ts \
  deploy/postgres/privileges/generate-cli.mjs \
  deploy/postgres/privileges/generate.mjs > "$audit_diff"
sed -n '/^+[^+]/p' "$audit_diff" > "$added_lines"
rg -n -i '^\+[[:space:]]*(GRANT|REVOKE|CREATE[[:space:]]+ROLE|ALTER[[:space:]]+ROLE[^;]*[[:space:]]BYPASSRLS)([[:space:];]|$)' "$added_lines"
forbidden_rc=$?
rg -n '^\+.*ALTER ROLE' "$added_lines"
alter_rc=$?
printf 'forbidden_statement_exit=%s; alter_role_evidence_exit=%s\n' "$forbidden_rc" "$alter_rc"
rm -f "$audit_diff" "$added_lines"
```

Коды: поиск запрещённых добавленных statements — `1` (совпадений нет); поиск добавленных
`ALTER ROLE` — `0`.

```text
+      `    ALTER ROLE ${q(roleName)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;`,
+      `    ALTER ROLE ${q(roleName)} RESET ALL;`,
forbidden_statement_exit=1; alter_role_evidence_exit=0
```

Добавленных `GRANT`, `REVOKE`, `CREATE ROLE` или выдачи `BYPASSRLS` нет. Два совпадения более
широкого текстового поиска были только комментариями `no CREATE/GRANT` и `no CREATE ROLE`.

## 4. Декларация и `deploy-test-saas.sh` — FAIL

Классификация исполняемой декларации проверена командой:

```bash
node --experimental-strip-types --input-type=module -e \
  "import { declaration } from './deploy/postgres/privileges/declaration.ts'; console.log(JSON.stringify({managed:Object.hasOwn(declaration.cluster.roles,'app_owner'),legacy:declaration.zeroState.legacyRoles.includes('app_owner')}));"
```

Код `0`, вывод:

```text
{"managed":false,"legacy":true}
```

Точный статический ассерт просмотрен командой (код `0`):

```bash
nl -ba deploy/postgres/privileges/declaration.ts | sed -n '7567,7588p'
nl -ba deploy/postgres/privileges/generate.mjs | sed -n '1210,1244p'
nl -ba deploy/host/deploy-test-saas.sh | sed -n '143,154p;982,1005p;1119,1128p;1731,1741p;2894,2900p'
nl -ba deploy/postgres/pre-migration-legacy-role-bridge.sql | sed -n '13,44p'
```

Существенный вывод:

```text
declaration.ts:7579  roles: REV10_ROLES
declaration.ts:7581  zeroState: { legacyRoles: [
declaration.ts:7586    'app_owner',
generate.mjs:1237    ALTER ROLE ... NOLOGIN ... NOBYPASSRLS NOINHERIT;
deploy-test-saas.sh:148  --shared-role-baseline | psql
deploy-test-saas.sh:153  -f pre-migration-legacy-role-bridge.sql
pre-migration-legacy-role-bridge.sql:27  ALTER ROLE app_owner ... BYPASSRLS INHERIT;
deploy-test-saas.sh:996  ... NOT rolcanlogin AND rolbypassrls
deploy-test-saas.sh:1120 app_owner is NOLOGIN+BYPASSRLS
deploy-test-saas.sh:1731 local expected_secdef_count=182
deploy-test-saas.sh:1737 FATAL when the actual app_owner SECURITY DEFINER count differs
deploy-test-saas.sh:2899 the fatal grant/count assertion is invoked by run_closure_gate
```

Это прямое противоречие. Декларация требует surviving legacy-role в
`NOLOGIN NOBYPASSRLS NOINHERIT`, но TEST deploy сразу после нового baseline снова выдаёт ей
`BYPASSRLS INHERIT`, затем требует старые object grants и ровно `182` SECURITY DEFINER-функции.
Пункт 2 измерил фактическое число принадлежащих `app_owner` функций как `0`, поэтому декларация и
TEST gate не могут одновременно быть истинны. Gate действительно вызывается и при расхождении
делает deploy красным (`CLOSURE_GATE_RED_EXIT=3`), даже если TEST-сервисы оставляются работающими.

## 5. Остаточный TEST `CONNECT` — FAIL

Read-only команда:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d postgres \
  -v ON_ERROR_STOP=1 -P pager=off -c \
  "SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit FROM pg_catalog.pg_roles WHERE rolname='app_owner'; SELECT datname,has_database_privilege('app_owner',datname,'CONNECT') AS app_owner_connect FROM pg_catalog.pg_database WHERE datname IN ('bcb_webapp_dev','bersoncarebot_test') ORDER BY datname;"
```

Код `0`, вывод:

```text
app_owner | f | f | f | f | f | f | f
bcb_webapp_dev     | f
bersoncarebot_test | t
```

TEST env-verifier также запущен без pipe через временный SQL-файл:

```bash
test_verifier_sql=$(mktemp /tmp/bcb-appowner-test-env-verify.XXXXXX.sql)
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs \
  --env test --db bersoncarebot_test --env-verify > "$test_verifier_sql"
test_generator_rc=$?
chmod 0644 "$test_verifier_sql"
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 \
  -d bersoncarebot_test -v ON_ERROR_STOP=1 -f "$test_verifier_sql"
test_verifier_rc=$?
printf 'test_generator_exit=%s; test_verifier_exit=%s\n' \
  "$test_generator_rc" "$test_verifier_rc"
rm -f "$test_verifier_sql"
```

Коды: generator `0`, verifier `3`.

```text
ERROR:  retained legacy role can CONNECT target: app_owner
CONTEXT:  PL/pgSQL function inline_code_block line 17 at RAISE
test_generator_exit=0; test_verifier_exit=3
```

Правка меняет только cluster-role attributes и `RESET ALL`; она не меняет database ACL. Поэтому
остаточный `CONNECT` на `bersoncarebot_test` переживает правку. Состояние TEST после прерванной
раскатки остаётся не полностью карантинным и штатный environment verifier продолжает падать.

## Итог

Пункты 1–3 проходят. Коммит не принимается: пункт 4 оставляет два взаимоисключающих role-контракта
в одном исполняемом TEST deploy path, а пункт 5 не закрывает остаточный `CONNECT`, из-за которого
TEST environment verifier возвращает `3`.

## 6. Исправление closure-контракта — 2026-08-20

`deploy/host/deploy-test-saas.sh` больше не запускает legacy bridge и runtime handoff, которые
возвращали `app_owner` права bypass. P2-B передаёт три таблицы `app.context_signing_secrets`,
`app.principal_context`, `app.context_nonce_ledger` роли `app_object_owner`. Closure-gate теперь
требует для `app_owner`: существование, `NOLOGIN`, отсутствие bypass и inherit, ноль членов и ноль
DB-local объектов; отдельно он требует владельца `app_object_owner` у P2-B таблиц и
`app_seam_*_owner` у specialist/login SECURITY DEFINER функций. Whole-class gate требует ровно
46 distinct `app_seam_*_owner` для всех `app` SECURITY DEFINER функций и называет signature/owner
при расхождении.

Инъекция была выполнена временной заменой условия на `rolbypassrls` и затем отменена. Команда без
pipe:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test \
  -v ON_ERROR_STOP=1 -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner' AND NOT rolcanlogin AND rolbypassrls AND NOT rolinherit) THEN RAISE EXCEPTION 'retired app_owner / specialist-owner seam contract diverged'; END IF; END \$\$;"
```

Она завершилась кодом `1` и назвала расхождение:

```text
ERROR:  retired app_owner / specialist-owner seam contract diverged
injection_exit=1
```

Инъекция отменена; рабочий контракт снова использует `NOT rolbypassrls`.

Проверка после отката без pipe вернула `retired_app_owner_contract = t` и код `0`:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test \
  -v ON_ERROR_STOP=1 -c "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner' AND NOT rolcanlogin AND NOT rolbypassrls AND NOT rolinherit) AS retired_app_owner_contract;"
```

`/home/dev/brain/host-orch/run-tests.sh "node --test deploy/host/*.test.mjs"` завершился кодом `0`:
21 tests passed, 0 failed. Известный worktree-артефакт `converge-saas-smoke-login-passwords` в этом
прогоне не возник.

Пункт 5 не является кодовой правкой: у `app_owner` нет явного `CONNECT` grant. На TEST `datacl`
равен `NULL`, поэтому `CONNECT` приходит от `PUBLIC` по default ACL; на DEV заполненный `datacl`
его закрывает. Это остаток прерванного третьего прогона. Свежий полный TEST reset пересоздаёт базу
и штатно закрывает ACL; запуск reset в этой работе намеренно не выполнялся.

## 7. F-1: retired handoff removed from runtime-overlay closure — 2026-08-20

`runtime-overlay-rehydrate-lib.sh` no longer puts
`deploy/postgres/runtime-overlay-app-owner-handoff.sql` in `protected_overlays`, therefore
`deploy-test-saas.sh` no longer executes it after sourcing the library. The SQL artifacts remain in
the tree for historical plan/report links, with a one-line header that says why each is retired:
the handoff would restore the retired `app_owner` contract, and the legacy bridge would recreate it
with elevated access attributes.

The required executable-code search after the removal is:

```bash
grep -rn "runtime-overlay-app-owner-handoff\|pre-migration-legacy-role-bridge" \
  --include='*.sh' --include='*.mjs' .
```

It returns no matches.

### Remaining closure blockers — not fixed in this scoped change

The full `runtime-overlay-rehydrate-lib.sh` chain still contains overlays that require or assign the
retired `app_owner`; with its required retired-role state, the first reachable one is
`deploy/postgres/organization-member-invites-rls.sql` (its preflight requires the former legacy
contract). Other direct dependents are `patient-invites-rls.sql`,
`specialist-signup-public-bootstrap-rls.sql`, `specialist-owner-provisioning-rls.sql`,
`c5a-platform-operations-runtime.sql`, `patient-web-push-vapid-public-key-accessor.sql`,
`public-booking-bootstrap-resolver.sql`, `public-clinic-slug-bootstrap-resolver.sql`, and the final
`e1-webapp-runtime-config.sql`. `reference-catalog-rls.sql` is also an indirect dependent: it takes
its `provisioning_owner` from the specialist provisioning seam, which is currently assigned to
`app_owner`. These are F-1 closure blockers; no role, ACL, ownership, migration, or SQL behavior
was changed here to hide them.

Fault injection was performed by temporarily restoring the removed handoff path and running the
existing `node --test deploy/host/*.test.mjs` suite. No current test names or catches this entry;
the suite remains green, so this regression has no automated detector. No text-presence test was
added: removal from a one-time deploy list is verified by the exact search above.
