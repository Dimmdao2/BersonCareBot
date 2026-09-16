# TEST full reset — FINAL run, BLOCKED, 2026-08-20

## Итог

Штатный полный сброс TEST запущен ровно требуемым entrypoint без branch-аргумента и завершился с
`full_reset_rc=1`, измеренным отдельной строкой после команды без пайпа. Путь дошёл до schema B и
остановился на новом fail-closed блокере privilege reconcile:

```text
ERROR: relation birth wall rejected undeclared table app_ext.port_context_capabilities
SQLSTATE: 42501
```

Причина непосредственно видна в канонической функции
`deploy/postgres/port-context/contract.sql`: `app_control.enforce_relation_birth_wall()` выдаёт
`ERRCODE = '42501'`, когда создаваемой таблицы нет в `app_control.relation_wall_registry`. В текущем
порядке reconcile уже установил event trigger, а затем повторный `CREATE TABLE IF NOT EXISTS
app_ext.port_context_capabilities` был отвергнут стеной. Гейт, данные и права не исправлялись и не
ослаблялись; роли не создавались, права вручную не выдавались, `BYPASSRLS` не выдавался, ledger вручную
не менялся. PROD-контакт был только штатным read-only `pg_dump`; обезличивание не запускалось.

До блокера schema B и data-stage завершились: ledger `58`, tagless/foreign ledger rows `0`,
`be_appointments=485`, из legacy `123`, provenance-дублей `0`, specialist-orphans `0`. FIO apply ровно
совпал с owner oracle. Privilege reconcile и последующий `--check` не зелёные: reconcile упал, check и
service-start не достигнуты. TEST оставлен fail-closed с `datconnlimit=0`; пять служб не активны.

## Шаг | команда | код возврата | числа | вывод

| шаг | команда | код возврата | числа | вывод |
|---|---|---:|---|---|
| Текущая база ветки | `git merge-base --is-ancestor c7dde2853 HEAD`; `git merge-base --is-ancestor 9f4b98c25 HEAD` | `0`; `0` | обе закрывающие правки — ancestors | Оба известных блокера присутствуют в checkout. |
| Целевой ledger artifact | `awk '/^INSERT INTO drizzle\.__drizzle_migrations / { count += 1 } END { print "target_ledger_rows=" count + 0 }' deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql` | `0` | `target_ledger_rows=58` | Ожидаемое число schema-B ledger получено из артефакта, не из отчёта. |
| Полный reset | точная команда ниже; stdout/stderr → `/tmp/bcb-test-full-reset-reset2-20260820.log`; затем отдельные `reset_rc=$?` и `printf` | `1` | log `5341` строк (`wc -l`) | Restore, data-fix, FIO, carry, cutover/schema B и test settings прошли; stop на privilege reconcile. |
| FIO apply | `rg -n '"command":"apply"' /tmp/bcb-test-full-reset-reset2-20260820.log` | `0` | `total=170 eligibleUpdates=161 alreadyMatched=3 expectedMissing=1 preservedCurrent=5 unexpectedMissing=0 unexpectedDrift=0` | Полное совпадение с owner oracle; rollback artifact создан до mutation. |
| Data/cutover gate | `rg -n 'pre_cutover_data_stage|prod_to_target_cutover|drizzle migrations' /tmp/bcb-test-full-reset-reset2-20260820.log` | `0` | pre-cutover `canonicalAppointments=478 liveLegacyUnresolved=0 rawRubitimeUnmapped=0`; cutover `appointments=485`; ledger `58/58` | Путь A→B дошёл до schema B. |
| Живая schema B | aggregate-only read-only SQL ниже через `sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test -v ON_ERROR_STOP=1` | `0` | ledger `58`; foreign/tagless `0`; public tables `207`; specialist-orphans `0` | Миграция применена; база осталась в B после позднего privilege blocker. |
| История appointments | тот же aggregate-only read-only SQL | `0` | total `485`; legacy `123`; distinct legacy source IDs `123`; provenance duplicate groups `0`; deterministic ID mismatches `0` | Все 123 legacy rows перенесены один-к-одному, дублей нет. |
| Privilege reconcile | штатный reconcile внутри reset; точная ошибка из `tail -n 220`/`rg -n 'ERROR:'` по логу | reset `1`; внутренний `psql failed (3)` | blocker table `app_ext.port_context_capabilities`; SQLSTATE `42501` из `contract.sql` | Reconcile **не зелёный**, `--check` не достигнут. Ничего вручную не исправлялось. |
| Runtime-role snapshot | read-only `pg_auth_members` query ниже | `0` | 4 login; у всех `super=false createdb=false createrole=false bypassrls=false`; наборы ниже | Membership-наборы сняты, но полная декларация прав не заявляется: reconcile transaction откатилась. |
| Данные без обезличивания | тот же aggregate-only read-only SQL | `0` | active `Точка Здоровья=1`; anonymization markers `0` | Данные сохранены, обезличивание не выполнялось. |
| DB fail-closed state | read-only `SELECT current_database(), pg_get_userbyid(datdba), datconnlimit FROM pg_database` | `0` | `bersoncarebot_test`; owner `postgres`; `datconnlimit=0` | Поздний blocker оставил TEST закрытым для runtime. |
| Пять служб | цикл `systemctl is-active/is-failed` ниже | команды измерены по каждой службе | api/worker/scheduler/media-worker `inactive`; webapp `failed` | Service-start не достигнут; ни одна из пяти служб не active. |
| Webapp HTTP | `curl ... http://127.0.0.1:6200/api/health`; отдельно `$?`; затем `curl -k ... https://test.bersoncare.ru/api/health`; отдельно `$?` | loopback `7`; public `0` | loopback HTTP `000`; public HTTP `200`; maintenance marker `1` | Application webapp не отвечает; public `200` — maintenance page «Сервер обновляется», не health приложения. |

## Точная команда full reset

```bash
bash deploy/host/deploy-test-full-reset.sh --confirm-full-reset \
  --fio-manifest=/tmp/bcb-cutover-inputs/fio-owner-reviewed-test-20260820-merge-preserve.manifest.json \
  --fio-manifest-file-sha256=0842f3d942d31bfaf228694512874b73d5809f2060824e6af314509fe4790d51 \
  --fio-manifest-sha256=436e8fe7c75f8a771e520a043803c548b5724492ed35d97edf43ad631ec719da \
  --fio-review-source-sha256=56fa7fc7dbdd6caacdb6bb1350a4d891fdff6fc7b7e679803396181983c99700 \
  > /tmp/bcb-test-full-reset-reset2-20260820.log 2>&1
reset_rc=$?
printf 'full_reset_rc=%s\n' "$reset_rc"
```

Получено: `full_reset_rc=1`.

## Точный blocker и SQLSTATE

Лог:

```text
Error: psql failed (3):
ERROR:  relation birth wall rejected undeclared table app_ext.port_context_capabilities
CONTEXT:  PL/pgSQL function enforce_relation_birth_wall() line 29 at RAISE
```

Код канонической функции:

```sql
IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE = '42501',
    MESSAGE = format('relation birth wall rejected undeclared table %I.%I',
      relation.nspname, relation.relname);
END IF;
```

Следовательно точный SQLSTATE блокера — `42501` (`insufficient_privilege`). Это не нехватка права,
которую можно обходить GRANT: это намеренный отказ relation-birth wall из-за отсутствующей registry row.

## Aggregate-only read-only состояние TEST

Команда выполнялась внутри `BEGIN READ ONLY … ROLLBACK` через локальный admin socket. Основной JSON:

```json
{"drizzleLedgerRows":58,"foreignLedgerRows":0,"appointmentsTotal":485,"legacyCarried":123,"legacySourceIds":123,"provenanceDuplicateGroups":0,"deterministicIdMismatches":0,"specialistOrphans":0,"tochkaZdorovya":1,"anonymizationMarkers":0,"publicTables":207}
```

Критерии:

- legacy row: `be_appointments.attribution_json ->> 'sourceTable' = 'appointment_records'`;
- provenance duplicate: более одной строки на `legacyAppointmentRecordId`;
- deterministic mismatch: `id` не совпадает с UUID, построенным из
  `md5('legacy-appointment-record:' || legacyAppointmentRecordId)`;
- specialist orphan: live appointment с `specialist_id IS NULL` либо неактивным специалистом;
- anonymization marker: case-insensitive `anonym|redact|обезлич|удал` в aggregate
  `display_name/first_name/last_name/patronymic/email`; значения людей не печатались.

## Runtime-role snapshot после stop

Read-only query по `pg_auth_members` дал прямые membership-наборы:

```text
bcb_test_integrator=app_integrator_request,app_integrator_resolver,app_operational_delivery_worker,app_operational_scheduler,app_service,app_tenant_service
bcb_test_webapp_global_admin=app_platform_admin,app_platform_settings
bcb_test_webapp_patient=app_patient,app_pre_session
bcb_test_webapp_staff=app_clinic_billing,app_operational_maintenance,app_operational_media_worker,app_pre_session,app_staff,app_tenant_service,app_worker,saas_telemetry_operator
```

У всех четырёх `rolsuper=false`, `rolcreatedb=false`, `rolcreaterole=false`, `rolbypassrls=false`.
Эти наблюдаемые membership-наборы не заменяют полный privilege gate: reconcile transaction упала и
откатилась, `--check` не запускался, поэтому требование «права наложились» честно остаётся **BLOCKED**.

## Службы и HTTP после stop

```text
api active=inactive active_rc=3
worker active=inactive active_rc=3
scheduler active=inactive active_rc=3
webapp active=failed active_rc=3
media-worker active=inactive active_rc=3
loopback_http_code=000 loopback_curl_rc=7
public_http_code=200 public_curl_rc=0 maintenance_marker_count=1
```

## Не выполнено из-за блокера

- privilege reconcile не завершился и `--check` не достигнут;
- пять TEST-служб не запущены;
- application webapp health не отвечает;
- полный reset не завершён, несмотря на успешно достигнутую schema B и целые данные.

Ни одна запрещённая коррекция не предпринималась. Новый blocker требует отдельного исправления порядка/
declaration relation-wall registry в коде, затем повторного полного штатного reset.
