# TEST full reset — BLOCKED, 2026-08-20

## Итог

Полный сброс TEST **не завершён**. Новый owner-approved FIO manifest успешно запечатан, проверен и применён:
read-only preview и live apply дали `unexpectedMissing=0`, `unexpectedDrift=0`, `preservedCurrent=5`.
Штатный full-reset затем остановился с кодом `3` на следующем fail-closed гейте:
`pre-cutover data assertion: 123 live legacy appointments remain unresolved`.

По brief при новом blocker работа остановлена без подгонки данных или гейта. Схема B, target ledger,
privilege reconcile/check, restart пяти TEST-служб и webapp health не достигнуты. PROD-контакт выполнялся только
штатным read-only `pg_dump`; обезличивание не запускалось. Роли, права, `BYPASSRLS`, миграции и
`drizzle.__drizzle_migrations` вручную не менялись.

## Шаг | команда | числа | вывод

| Шаг                                   | Команда                                                                                                                                                                                                                                                                                                                                                    | Числа                                                                                                                                                      | Вывод                                                                                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| База ветки                            | `git rev-parse 59e8ded0a`; `git merge-base --is-ancestor 59e8ded0a HEAD`                                                                                                                                                                                                                                                                                   | base `59e8ded0a7339e7f3956019f229e076b7761fac5`; rc `0`                                                                                                    | Worker-ветка основана на указанной голове feat.                                                                                                                                |
| Контракт standalone `preserveCurrent` | `pnpm --dir apps/webapp run fio:owner-reviewed-test:test`                                                                                                                                                                                                                                                                                                  | tests `1/1`; rc `0`                                                                                                                                        | Перенесённая из `rows` строка читается, сверяется и считается preserved. Код: `f54389eb3c1b0bdb05cc7d226dce7491599720d5`.                                                      |
| Типы                                  | `pnpm --dir packages/operator-db-schema run build && pnpm --dir packages/db-principal run build && pnpm --dir packages/platform-merge run build && pnpm --dir packages/error-tracking run build && pnpm --dir apps/webapp run typecheck`                                                                                                                   | rc `0`                                                                                                                                                     | Strict TypeScript зелёный после штатной сборки shared packages.                                                                                                                |
| Payload diff                          | Точные `cmp`/`jq` команды в следующем разделе                                                                                                                                                                                                                                                                                                              | `rows 170→169`; `preserveCurrent 4→5`; все четыре cmp rc `0`                                                                                               | Единственное содержательное изменение: одна строка удалена из `rows` и добавлена пятым `preserveCurrent`; остальные 169 строк и обе прежние секции идентичны в canonical JSON. |
| Seal                                  | `pnpm --dir apps/webapp run fio:owner-reviewed-test:seal -- --manifest /tmp/bcb-cutover-inputs/fio-owner-reviewed-test-20260820-merge-preserve.payload.json --output /tmp/bcb-cutover-inputs/fio-owner-reviewed-test-20260820-merge-preserve.manifest.json`                                                                                                | payload SHA `436e8fe7c75f8a771e520a043803c548b5724492ed35d97edf43ad631ec719da`; source SHA не изменён                                                      | rc `0`; новый regular non-symlink manifest создан рядом со старым, `deploy:deploy 0600`.                                                                                       |
| File SHA                              | `sudo -u deploy sha256sum /tmp/bcb-cutover-inputs/fio-owner-reviewed-test-20260820-merge-preserve.manifest.json`                                                                                                                                                                                                                                           | file SHA `0842f3d942d31bfaf228694512874b73d5809f2060824e6af314509fe4790d51`                                                                                | Старый manifest не перезаписан; его прежний file SHA остался `ff312656a44fd46e0acc561ca342233001f5eaa87603a5c7326f672c81321109`.                                               |
| Verify без БД                         | `pnpm --dir apps/webapp run fio:owner-reviewed-test:verify -- --manifest /tmp/bcb-cutover-inputs/fio-owner-reviewed-test-20260820-merge-preserve.manifest.json --confirm-manifest-sha256 436e8fe7c75f8a771e520a043803c548b5724492ed35d97edf43ad631ec719da --confirm-review-source-sha256 56fa7fc7dbdd6caacdb6bb1350a4d891fdff6fc7b7e679803396181983c99700` | `rows=169`; rc `0`                                                                                                                                         | `verified=true`.                                                                                                                                                               |
| Preview read-only                     | Точная staging-команда в следующем разделе                                                                                                                                                                                                                                                                                                                 | `total=170`, `eligibleUpdates=161`, `alreadyMatched=3`, `expectedMissing=1`, `preservedCurrent=5`, `unexpectedMissing=0`, `unexpectedDrift=0`; rc `0`      | Разрешённый FIO drift полностью закрыт; staging-копия manifest удалена после preview.                                                                                          |
| Target ledger artifact                | `awk '/^INSERT INTO drizzle\.__drizzle_migrations / { count += 1 } END { print count + 0 }' deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql`                                                                                                                                                                                             | `58`; rc `0`                                                                                                                                               | Это ожидаемое число строк ledger схемы B для текущего checkout.                                                                                                                |
| Полный reset                          | Команда в следующем разделе; `wc -l /tmp/bcb-test-full-reset-fio-reseal-20260820.log`                                                                                                                                                                                                                                                                      | rc `3`; log lines `900`; `wc` rc `0`                                                                                                                       | Restore, owner consolidation, doctor/admin data-fix и FIO apply прошли; pre-cutover data assertion остановил прогон до миграции.                                               |
| FIO live apply внутри reset           | `grep -F '{"command":"apply"' /tmp/bcb-test-full-reset-fio-reseal-20260820.log`                                                                                                                                                                                                                                                                            | `total=170`, `eligibleUpdates=161`, `alreadyMatched=3`, `expectedMissing=1`, `preservedCurrent=5`, `unexpectedMissing=0`, `unexpectedDrift=0`; grep rc `0` | Rollback artifact создан до мутации; FIO gate зелёный.                                                                                                                         |
| Новый blocker                         | Точный read-only SQL из следующего раздела                                                                                                                                                                                                                                                                                                                 | `legacy_unresolved=123`; psql rc `0`                                                                                                                       | Гейт ожидает `0`, получил `123`; исправление/удаление гейта или данных не предпринималось.                                                                                     |
| Ledger после stop                     | `sudo -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test -Atc 'BEGIN READ ONLY; SELECT count(*) FROM drizzle.__drizzle_migrations; ROLLBACK;'`                                                                                                                                                                                       | live `136`, target `58`; rc `0`                                                                                                                            | TEST остался на восстановленной schema A; migration A→B не запускалась.                                                                                                        |
| Права после stop                      | Read-only catalog query из следующего раздела                                                                                                                                                                                                                                                                                                              | `retired_test_role_count=0`; `app_object_owner_can_create=false`; все пять role flags `false`; rc `0`                                                      | Новых ролей/прав и `BYPASSRLS` нет. Reconcile/`--check` не достигнуты и зелёными не заявляются.                                                                                |
| Пять служб                            | `for unit in api worker scheduler webapp media-worker; do systemctl is-active "bersoncarebot-$unit-test"; echo rc=$?; done`                                                                                                                                                                                                                                | api/worker/scheduler/media-worker: `inactive rc=3`; webapp: `failed rc=3`                                                                                  | Службы не подняты после fail-closed stop.                                                                                                                                      |
| Webapp                                | `curl -sS -o TMP -w 'webapp_http_code=%{http_code}\n' http://127.0.0.1:6200/api/health; echo rc=$?`                                                                                                                                                                                                                                                        | HTTP `000`; curl rc `7`                                                                                                                                    | Webapp не отвечает, поэтому полный reset не завершён.                                                                                                                          |

## Точные команды payload diff

```bash
old=/tmp/bcb-cutover-inputs/fio-owner-reviewed-test.manifest.json
payload=/tmp/bcb-cutover-inputs/fio-owner-reviewed-test-20260820-merge-preserve.payload.json

cmp -s \
  <(sudo -u deploy jq -cS 'del(.manifestSha256,.rows,.exceptions)' "$old") \
  <(sudo -u deploy jq -cS 'del(.rows,.exceptions)' "$payload")
printf 'top_level_compare_rc=%s\n' "$?"

cmp -s \
  <(sudo -u deploy jq -cS '[.rows[] | select(.id != "4ff57819-06ff-4938-b0d7-7470b6cf073c")]' "$old") \
  <(sudo -u deploy jq -cS '.rows' "$payload")
printf 'remaining_rows_compare_rc=%s\n' "$?"

cmp -s \
  <(sudo -u deploy jq -cS '.exceptions.expectedMissing' "$old") \
  <(sudo -u deploy jq -cS '.exceptions.expectedMissing' "$payload")
printf 'expected_missing_compare_rc=%s\n' "$?"

cmp -s \
  <(sudo -u deploy jq -cS '.exceptions.preserveCurrent' "$old") \
  <(sudo -u deploy jq -cS '.exceptions.preserveCurrent[0:4]' "$payload")
printf 'prior_preserve_compare_rc=%s\n' "$?"
```

Results: all four rc `0`. The exact count/hash contract was separately checked by:

```bash
sudo -u deploy jq -e '
  (.rows | length == 169)
  and (.exceptions.expectedMissing | length == 1)
  and (.exceptions.preserveCurrent | length == 5)
  and (.reviewSourceSha256 == "56fa7fc7dbdd6caacdb6bb1350a4d891fdff6fc7b7e679803396181983c99700")
' "$payload" >/dev/null
printf 'payload_contract_rc=%s\n' "$?"
```

Result: `payload_contract_rc=0`.

## Точная preview-команда

OS user `postgres` cannot traverse `/home/dev`, so the read-only command used a disposable archive of `HEAD`
with the two current FIO modules overlaid and TEST checkout dependencies linked. The manifest staging copy was
`postgres:postgres 0600` and the generated directory was removed after the command.

```bash
runtime=$(mktemp -d /tmp/bcb-fio-preview-runtime.XXXXXX)
chmod 755 "$runtime"
git archive HEAD | tar -x -C "$runtime"
install -m 644 apps/webapp/scripts/fio-backfill/owner-reviewed-fio-contract.ts \
  "$runtime/apps/webapp/scripts/fio-backfill/owner-reviewed-fio-contract.ts"
install -m 644 apps/webapp/scripts/fio-backfill/owner-reviewed-fio-operation.ts \
  "$runtime/apps/webapp/scripts/fio-backfill/owner-reviewed-fio-operation.ts"
ln -s /opt/projects/bersoncarebot-test/node_modules "$runtime/node_modules"
ln -s /opt/projects/bersoncarebot-test/apps/webapp/node_modules "$runtime/apps/webapp/node_modules"
sudo install -o postgres -g postgres -m 600 \
  /tmp/bcb-cutover-inputs/fio-owner-reviewed-test-20260820-merge-preserve.manifest.json \
  "$runtime/manifest.json"
sudo -u postgres env \
  DATABASE_URL='postgresql:///bersoncarebot_test?host=/var/run/postgresql' \
  DB_PRINCIPAL_CONTEXT_MODE=legacy-guc NODE_ENV=test USE_REAL_DATABASE=1 \
  bash -c "cd '$runtime/apps/webapp' && \
    /opt/projects/bersoncarebot-test/apps/webapp/node_modules/.bin/tsx \
    scripts/fio-backfill/apply-owner-reviewed-fio-test.ts preview -- \
    --test --manifest '$runtime/manifest.json'"
preview_rc=$?
printf 'preview_rc=%s\n' "$preview_rc"
sudo rm -rf -- "$runtime"
```

Result: `total=170`, `eligibleUpdates=161`, `alreadyMatched=3`, `expectedMissing=1`, `preservedCurrent=5`,
`unexpectedMissing=0`, `unexpectedDrift=0`, `preview_rc=0`.

## Точная команда full reset

```bash
bash deploy/host/deploy-test-full-reset.sh --confirm-full-reset \
  --fio-manifest=/tmp/bcb-cutover-inputs/fio-owner-reviewed-test-20260820-merge-preserve.manifest.json \
  --fio-manifest-file-sha256=0842f3d942d31bfaf228694512874b73d5809f2060824e6af314509fe4790d51 \
  --fio-manifest-sha256=436e8fe7c75f8a771e520a043803c548b5724492ed35d97edf43ad631ec719da \
  --fio-review-source-sha256=56fa7fc7dbdd6caacdb6bb1350a4d891fdff6fc7b7e679803396181983c99700 \
  wt/fio-reseal-20260820 \
  >/tmp/bcb-test-full-reset-fio-reseal-20260820.log 2>&1
reset_rc=$?
printf 'full_reset_rc=%s\n' "$reset_rc"
```

Result: `full_reset_rc=3`.

## Точный read-only запрос blocker

```sql
SELECT count(*) AS legacy_unresolved
FROM public.appointment_records legacy
LEFT JOIN public.be_external_entity_mappings mapping
  ON mapping.external_system = 'rubitime'
 AND mapping.entity_type = 'appointment'
 AND mapping.external_id = legacy.integrator_record_id
LEFT JOIN public.be_appointments direct
  ON direct.id = CASE
    WHEN legacy.integrator_record_id ~ '^be:[0-9a-fA-F-]{36}$'
    THEN substring(legacy.integrator_record_id FROM 4)::uuid
  END
WHERE legacy.deleted_at IS NULL
  AND legacy.record_at IS NOT NULL
  AND mapping.canonical_id IS NULL
  AND direct.id IS NULL;
```

Executed inside `BEGIN READ ONLY … ROLLBACK` via:

```bash
sudo -u postgres psql -X -h /var/run/postgresql -p 5432 \
  -d bersoncarebot_test -v ON_ERROR_STOP=1
```

Result: `legacy_unresolved=123`, `post_stop_read_only_psql_rc=0`.

## Read-only privilege snapshot after stop

Exact query group, executed inside `BEGIN READ ONLY … ROLLBACK`:

```sql
SELECT pg_get_userbyid(datdba), datconnlimit
FROM pg_database WHERE datname = 'bersoncarebot_test';
SELECT rolsuper, rolcreatedb, rolcreaterole, rolcanlogin, rolbypassrls
FROM pg_roles WHERE rolname = 'app_object_owner';
SELECT count(*) FROM pg_roles WHERE rolname = 'bersoncarebot_test';
SELECT has_database_privilege('app_object_owner','bersoncarebot_test','CREATE');
```

Result: database owner `postgres`, connection limit `-1`; `app_object_owner` flags
`false/false/false/false/false`; retired TEST role count `0`; database `CREATE=false`; psql rc `0`.

## Named blocker

`deploy/postgres/pre-cutover-data-stage-assertions.sql` still requires every live row from
`public.appointment_records` to resolve through a Rubitime external mapping or direct canonical appointment.
The fresh dump contains `123` rows that violate that assertion. The current reset path no longer runs a legacy
appointment transfer before this gate. Deciding whether these rows must be migrated, deleted, or excluded would
change owner-approved cutover semantics, so this worker did not infer a fix.
