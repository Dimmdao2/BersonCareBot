# TEST full reset — FINAL attempt, 2026-08-20

## Итог

Полный сброс TEST **не завершён**. Штатный entrypoint дошёл через свежий read-only PROD dump,
doctor/admin data-fix, owner-reviewed FIO, перенос legacy appointments и атомарный переход в схему B.
Он остановился с `RESET_EXIT_CODE=1` на live privilege reconcile до открытия базы и запуска служб.

Новый блокер точный:

```text
ERROR: retained legacy role is not quarantined NOLOGIN: app_owner
CONTEXT: PL/pgSQL function inline_code_block line 13 at RAISE
SQLSTATE: P0001
psql exit: 3
full-reset exit: 1
```

Точный упавший statement, сгенерированный `generateEnvironmentVerifierSql()`:

```sql
IF bad IS NOT NULL THEN
  RAISE EXCEPTION 'retained legacy role is not quarantined NOLOGIN: %', bad;
END IF;
```

Его непосредственно предшествующий predicate:

```sql
SELECT rolname INTO bad
FROM pg_catalog.pg_roles
WHERE rolname = ANY(<declaration.zeroState.legacyRoles>)
  AND (
    rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR
    rolreplication OR rolbypassrls OR rolinherit
  )
LIMIT 1;

IF bad IS NOT NULL THEN
  RAISE EXCEPTION 'retained legacy role is not quarantined NOLOGIN: %', bad;
END IF;
```

Полный generated predicate с дословным массивом из 28 legacy roles воспроизводится без обращения к БД:

```bash
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs \
  --env test --db bersoncarebot_test --env-verify | sed -n '1,24p'
```

`app_owner` входит в `declaration.zeroState.legacyRoles`. Фактические атрибуты после остановки:
`LOGIN=false`, `SUPERUSER=false`, `CREATEDB=false`, `CREATEROLE=false`, `REPLICATION=false`,
`BYPASSRLS=true`, `INHERIT=true`, memberships `[]`. Поэтому роль уже NOLOGIN, но не проходит объявленный
карантин из-за `BYPASSRLS` и `INHERIT`. Неуказанный `RAISE EXCEPTION` в PL/pgSQL имеет SQLSTATE `P0001`;
`reconcile-access.mjs` зафиксировал отдельный `psql failed (3)`.

Роль и права вручную не менялись. Гейт не ослаблялся, данные не подгонялись, обезличивание не запускалось.
EXIT guard оставил `bersoncarebot_test` fail-closed с `CONNECTION LIMIT 0`; пять TEST-служб не запущены.
Единственный контакт с PROD был штатным read-only `pg_dump` внутри wrapper.

Полный transcript: `/tmp/bcb-test-full-reset-20260820-reset4.log` (`13820` строк). В TEST был доставлен
commit `632b582ec7ce44fffe3626785e7730f26bf3e461`.

## Шаг | команда | код возврата | числа | вывод

| шаг | команда | код возврата | числа | вывод |
|---|---|---:|---|---|
| Host/commit preflight | `hostname; ip -4 -brief address show scope global; git rev-parse feat/doctor-ui-rebuild; git merge-base --is-ancestor <fix> HEAD` для `c7dde2853`, `9f4b98c25`, `632b582ec` | `0` | host `151.241.228.122`; HEAD `632b582ec7ce…`; три ancestor rc `0` | Разрешённый DEV/TEST host; все три заданных фикса присутствуют. |
| Ledger oracle | `awk '/^INSERT INTO drizzle\.__drizzle_migrations / { count += 1 } END { print count + 0 }' deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql` | `0` | `58` | Ожидаемая схема B содержит 58 webapp-ledger rows. |
| Полный штатный reset | команда из блока **R1** ниже; stdout/stderr перенаправлены в transcript, затем отдельная строка `RESET_EXIT_CODE` | `1` | FIO `170/161/3/1/5/0/0`; carry `123`; schema-B appointments `485`; ledger `58` | До схемы B дошёл; остановился на live privilege verifier для `app_owner`. |
| FIO apply | `rg -n '"command":"apply".*"target":"TEST"' /tmp/bcb-test-full-reset-20260820-reset4.log` | `0` | `total=170 eligibleUpdates=161 alreadyMatched=3 expectedMissing=1 preservedCurrent=5 unexpectedMissing=0 unexpectedDrift=0` | Полное совпадение с owner oracle. |
| Legacy carry | `sed -n '886,950p;1218,1242p' /tmp/bcb-test-full-reset-20260820-reset4.log` | `0` | первый проход: candidates/inserted/directLinks/canonicalRows `123/123/123/123`, booking links `1`; повтор: inserted `0` | История перенесена детерминированно и повтор идемпотентен. |
| Schema-B и целостность | read-only PostgreSQL probe **Q1** ниже | `0` | ledger `58`; public tables `207`; appointments `485`; legacy `123`; distinct legacy ids `123`; duplicate groups `0`; deterministic mismatches `0`; orphans `0` | Схема B и данные на месте; `appointment_records` удалена ожидаемо. |
| FIO/data preservation | тот же read-only probe **Q1** | `0` | `Точка Здоровья`: rows `1`, active `1`; anonymization markers `0`; structured-name rows `224` | Данные не обезличены; каноническая клиника сохранена активной. |
| Privilege artifacts | две команды **P1** ниже | `0`, `0` | privilege/allowlist и port-context artifacts byte-for-byte | Оба offline `--check` зелёные; live reconcile не зелёный. |
| Runtime roles | read-only PostgreSQL probe **Q2** ниже | `0` | четыре LOGIN без super/createdb/createrole/replication/bypassrls/inherit; наборы membership перечислены ниже | Фактические наборы сняты, но exact end-state verifier не PASS: он остановился раньше на `app_owner`. |
| Пять служб | `systemctl is-active bersoncarebot-api-test.service bersoncarebot-worker-test.service bersoncarebot-scheduler-test.service bersoncarebot-webapp-test.service bersoncarebot-media-worker-test.service` | `3` | `inactive, inactive, inactive, failed, inactive` | Службы штатно не выпускались после blocker. |
| HTTP | команды **H1** ниже | external `0`; loopback `7` | external `200`; loopback `000` | External `200` — maintenance HTML «Сервер обновляется», не application health; webapp `:6200` не слушает. |

## R1 — точная reset-команда

Код возврата измерен после команды отдельной строкой, без pipeline:

```bash
set +e
bash deploy/host/deploy-test-full-reset.sh --confirm-full-reset \
  --fio-manifest=/tmp/bcb-cutover-inputs/fio-owner-reviewed-test-20260820-merge-preserve.manifest.json \
  --fio-manifest-file-sha256=0842f3d942d31bfaf228694512874b73d5809f2060824e6af314509fe4790d51 \
  --fio-manifest-sha256=436e8fe7c75f8a771e520a043803c548b5724492ed35d97edf43ad631ec719da \
  --fio-review-source-sha256=56fa7fc7dbdd6caacdb6bb1350a4d891fdff6fc7b7e679803396181983c99700 \
  > /tmp/bcb-test-full-reset-20260820-reset4.log 2>&1
reset_rc=$?
printf 'RESET_EXIT_CODE=%s\n' "$reset_rc"
exit "$reset_rc"
```

Вывод отдельной строки:

```text
RESET_EXIT_CODE=1
```

## Q1 — read-only состояние базы после blocker

Команда выполнялась через локальный административный socket, без runtime env и без DML:

```bash
sudo -u postgres psql -X -h /var/run/postgresql -p 5432 \
  -d bersoncarebot_test -v ON_ERROR_STOP=1 -At -c "BEGIN READ ONLY;
SELECT json_build_object(
  'database', current_database(),
  'databaseOwner', pg_get_userbyid(d.datdba),
  'connectionLimit', d.datconnlimit,
  'publicTables', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                   WHERE n.nspname='public' AND c.relkind IN ('r','p')),
  'drizzleLedgerRows', (SELECT count(*) FROM drizzle.__drizzle_migrations),
  'integratorLedgerRows', (SELECT count(*) FROM integrator.schema_migrations),
  'appointmentRecordsExists', to_regclass('public.appointment_records') IS NOT NULL,
  'beAppointmentsTotal', (SELECT count(*) FROM public.be_appointments),
  'legacyCarried', (SELECT count(*) FROM public.be_appointments
                    WHERE attribution_json->>'sourceTable'='appointment_records'),
  'legacySourceIds', (SELECT count(DISTINCT attribution_json->>'legacyAppointmentRecordId')
                      FROM public.be_appointments
                      WHERE attribution_json->>'sourceTable'='appointment_records'),
  'legacyDuplicateGroups', (SELECT count(*) FROM (
    SELECT attribution_json->>'legacyAppointmentRecordId'
    FROM public.be_appointments
    WHERE attribution_json->>'sourceTable'='appointment_records'
    GROUP BY 1 HAVING count(*)>1
  ) dups),
  'deterministicIdMismatches', (SELECT count(*) FROM public.be_appointments
    WHERE attribution_json->>'sourceTable'='appointment_records'
      AND id <> (
        substr(md5('legacy-appointment-record:'||(attribution_json->>'legacyAppointmentRecordId')),1,8)||'-'||
        substr(md5('legacy-appointment-record:'||(attribution_json->>'legacyAppointmentRecordId')),9,4)||'-'||
        substr(md5('legacy-appointment-record:'||(attribution_json->>'legacyAppointmentRecordId')),13,4)||'-'||
        substr(md5('legacy-appointment-record:'||(attribution_json->>'legacyAppointmentRecordId')),17,4)||'-'||
        substr(md5('legacy-appointment-record:'||(attribution_json->>'legacyAppointmentRecordId')),21,12)
      )::uuid),
  'orphans', (SELECT count(*) FROM public.be_appointments a
    WHERE a.deleted_at IS NULL AND (
      a.specialist_id IS NULL OR
      a.specialist_id IN (SELECT id FROM public.be_specialists WHERE is_active=false)
    )),
  'tochkaZdorovyaRows', (SELECT count(*) FROM public.be_organizations
    WHERE id='a0000000-0000-4000-8000-000000000001'::uuid AND title='Точка Здоровья'),
  'tochkaZdorovyaActiveRows', (SELECT count(*) FROM public.be_organizations
    WHERE id='a0000000-0000-4000-8000-000000000001'::uuid
      AND title='Точка Здоровья' AND is_active),
  'anonymizationMarkers', (SELECT count(*) FROM public.platform_users p
    WHERE concat_ws(' ',p.email,p.first_name,p.last_name,p.patronymic,p.display_name)
      ~* '(anonymi|redacted|обезлич|example[.]invalid)'),
  'nonemptyStructuredNames', (SELECT count(*) FROM public.platform_users p
    WHERE nullif(concat_ws('',p.first_name,p.last_name,p.patronymic),'') IS NOT NULL)
) FROM pg_database d WHERE d.datname=current_database();
COMMIT;"
```

Результат:

```json
{"database":"bersoncarebot_test","databaseOwner":"postgres","connectionLimit":0,
 "publicTables":207,"drizzleLedgerRows":58,"integratorLedgerRows":1,
 "appointmentRecordsExists":false,"beAppointmentsTotal":485,"legacyCarried":123,
 "legacySourceIds":123,"legacyDuplicateGroups":0,"deterministicIdMismatches":0,"orphans":0,
 "tochkaZdorovyaRows":1,"tochkaZdorovyaActiveRows":1,"anonymizationMarkers":0,
 "nonemptyStructuredNames":224}
```

## Q2 — фактические четыре runtime-role sets

Команда:

```bash
sudo -u postgres psql -X -h /var/run/postgresql -p 5432 \
  -d bersoncarebot_test -v ON_ERROR_STOP=1 -At -c "BEGIN READ ONLY;
SELECT json_build_object(
  'role',r.rolname,'login',r.rolcanlogin,'super',r.rolsuper,'createdb',r.rolcreatedb,
  'createrole',r.rolcreaterole,'replication',r.rolreplication,'bypassrls',r.rolbypassrls,
  'inherit',r.rolinherit,'memberships',COALESCE((
    SELECT json_agg(role.rolname ORDER BY role.rolname)
    FROM pg_auth_members am JOIN pg_roles role ON role.oid=am.roleid
    WHERE am.member=r.oid
  ),'[]'::json))
FROM pg_roles r
WHERE r.rolname IN (
  'app_owner','bcb_test_webapp_staff','bcb_test_webapp_patient',
  'bcb_test_webapp_global_admin','bcb_test_integrator'
)
ORDER BY r.rolname;
COMMIT;"
```

Фактические membership sets:

- `bcb_test_integrator` → `app_integrator_request`, `app_integrator_resolver`,
  `app_operational_delivery_worker`, `app_operational_scheduler`, `app_service`, `app_tenant_service`.
- `bcb_test_webapp_global_admin` → `app_platform_admin`, `app_platform_settings`.
- `bcb_test_webapp_patient` → `app_patient`, `app_pre_session`.
- `bcb_test_webapp_staff` → `app_clinic_billing`, `app_operational_maintenance`,
  `app_operational_media_worker`, `app_pre_session`, `app_staff`, `app_tenant_service`, `app_worker`,
  `saas_telemetry_operator`.

Все четыре login-роли имеют `LOGIN=true`, а `SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS/INHERIT=false`.
Это read-only снимок факта, не PASS полного exact-set gate: транзакция reconcile упала на `app_owner` раньше
следующих environment membership assertions и не закоммитилась.

## P1 — privilege artifact checks

```bash
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs \
  --db bersoncarebot_test --check
# PRIVILEGE_ARTIFACT_CHECK_RC=0

node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs \
  --db bersoncarebot_test --check --port-context-only
# PORT_CONTEXT_ARTIFACT_CHECK_RC=0
```

Оба артефактных `--check` зелёные. Live `reconcile-access.mjs` не зелёный: его generated SQL дошёл до
`BCB_SHARED_ROLE_BASELINE_VERIFIED`, `BCB_RUNTIME_DEFINER_GATES_VERIFIED database=bersoncarebot_test functions=373`
и затем упал на карантине `app_owner`.

## H1 — HTTP и службы после fail-closed stop

```bash
systemctl is-active \
  bersoncarebot-api-test.service \
  bersoncarebot-worker-test.service \
  bersoncarebot-scheduler-test.service \
  bersoncarebot-webapp-test.service \
  bersoncarebot-media-worker-test.service
# inactive / inactive / inactive / failed / inactive
# SYSTEMCTL_IS_ACTIVE_RC=3

curl -k -sS -o /tmp/bcb-test-reset4-external-health-body.txt \
  -w 'external_http_code=%{http_code}\n' --max-time 15 \
  https://test.bersoncare.ru/api/health
# external_http_code=200; external_curl_rc=0
# body: maintenance HTML, title "BersonCare — обновление", h1 "Сервер обновляется"

curl -sS -o /tmp/bcb-test-reset4-loopback-health-body.txt \
  -w 'loopback_http_code=%{http_code}\n' --max-time 15 \
  http://127.0.0.1:6200/api/health
# loopback_http_code=000; loopback_curl_rc=7
```

## Вердикт

**BLOCKED.** Данные и схема B прошли требуемые числовые гейты, но runtime privilege end-state и запуск пяти
служб не достигнуты. Именованный blocker: декларативный environment verifier требует полностью quarantined
legacy-role `app_owner`, тогда как фактическая роль сохраняет `BYPASSRLS=true` и `INHERIT=true`. По brief
исправление прав/ролей в этом проходе не выполнялось.
