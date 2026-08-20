# Перенос legacy appointments в штатный cutover — 2026-08-20

## Итог

Перенос истории реализован и проверен на свежем PROD dump в `bersoncarebot_test`: все 123 ранее
неразрешённые записи получили канонические `be_appointments`, неизменённый pre-cutover gate увидел
`liveLegacyUnresolved=0`, повторный прогон вставил 0 строк. Обезличивания не было.

Полный reset **не завершён**. После успешного переноса, pre-cutover gate и data-copy он остановился на новом,
не относящемся к appointment-переносу блокере generated schema-post: FK
`app_runtime_settings_organization_id_fkey` не принимает `organization_id =
d0000000-0000-4000-8000-000000000004`, которого нет в `be_organizations`. По stop-условию брифа этот новый
разрыв не исправлялся без owner-решения/отдельного scope.

TEST после rollback остаётся на schema A: live ledger содержит 136 строк, пять application services не
подняты, nginx отвечает maintenance page с HTTP 200. Поэтому schema B с 58 строками ledger, ACL
`reconcile`/`--check`, пять активных служб и живой webapp **не заявляются выполненными**.

## Что изменено

- Добавлен `deploy/postgres/prod-to-target-carry-legacy-appointments.sql`; он исполняется штатным
  `deploy-test-saas.sh` после owner-reviewed FIO и до неизменённого
  `pre-cutover-data-stage-assertions.sql`, а также подключён в `prod-to-target-cutover-start.sql` для
  идемпотентного повторного входа.
- Явный dedupe key: `md5('legacy-appointment-record:' || appointment_records.id)`, представленный как UUID.
  Один source `appointment_records.id` всегда даёт один и тот же PK `be_appointments.id`; insert использует
  `ON CONFLICT (id) DO NOTHING`.
- Организация и специалист берутся из `bcb.cutover.canonical_organization_id` и
  `bcb.cutover.canonical_specialist_id`; `start_at = record_at`; `platform_user_id` и `phone_normalized`
  переносятся без изменения; `created -> confirmed`, `canceled -> cancelled_by_patient` по существующей
  семантике статусов.
- Duration читается только из legacy payload и fail-closed при отсутствии; branch/service резолвятся только
  из source bridge schema A. Неизвестные branch/service остаются NULL.
- После переноса source row получает нативную ссылку `be:<uuid>`. Совпавший по точному legacy id
  `patient_bookings` получает `canonical_appointment_id` на ту же запись, поэтому второй projection не
  создаёт дубль.
- `be_external_entity_mappings` не создаётся в schema B. Три поздних data-copy чтения исправлены с
  отсутствующей target-таблицы на read-only source snapshot
  `cutover_source_public.be_external_entity_mappings`; disposition registry фиксирует уже принятые удаления
  bridge (migration 0042) и historical `webapp_schema_migrations` ledger (B0).

## Доказательства

| шаг | команда | числа | вывод |
|---|---|---:|---|
| Статический cutover snapshot | `pnpm run check:prod-to-target-cutover; check_rc=$?; printf 'check_prod_to_target_cutover_rc=%s\n' "$check_rc"` | rc=0 | Generated schema совпадает с DEV schema B. |
| Синтаксис deploy wrappers | `bash -n deploy/host/deploy-test-saas.sh deploy/host/deploy-test-full-reset.sh; syntax_rc=$?; printf 'deploy_script_syntax_rc=%s\n' "$syntax_rc"` | rc=0 | Shell syntax зелёный. |
| Целевой ledger artifact | `awk '/^INSERT INTO drizzle\.__drizzle_migrations / { count += 1 } END { print count + 0 }' deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql` | 58 | Ожидаемый schema-B ledger содержит 58 строк. |
| Первый штатный carry на свежем dump | строка полного reset ниже; в `/tmp/bcb-test-full-reset-legacyappt-20260820-r5.log` блок `carry unresolved legacy appointment history` | candidates=123; inserted=123; directLinks=123; canonicalRows=123; patientBookingDirectLinks=1 | Все неразрешённые legacy rows перенесены до gate. |
| Неизменённый gate | та же строка полного reset; `rg -n "liveLegacyUnresolved|rawRubitimeUnmapped" /tmp/bcb-test-full-reset-legacyappt-20260820-r5.log` | canonicalAppointments=478; liveLegacyUnresolved=0; rawRubitimeUnmapped=0; activeSpecialists=1 | Gate не менялся и пропустил реально перенесённые данные. |
| Идемпотентный повтор | повторный вызов carry из `prod-to-target-cutover-start.sql` в том же reset; `sed -n '1212,1242p' /tmp/bcb-test-full-reset-legacyappt-20260820-r5.log` | candidates=123; inserted=0; canonicalRows=123; patientBookingDirectLinks=1 | Повтор не создаёт `be_appointments`. |
| Поведенческая fault injection | команда F1 ниже; код возврата снят отдельной строкой | deleted=1; gate rc=3; сообщение `pre-cutover data assertion: 1 live legacy appointments remain unresolved`; post-rollback unresolved=0 | Реальная поломка переноса красит неизменённый gate и называет число; инъекция откатилась. |
| История после rollback неуспешного A→B | команда H1 ниже | beAppointmentsTotal=484; legacyCarried=123; legacyPatients=70; legacySourceIds=123; диапазон `2026-01-16 17:00:00+03`…`2026-06-13 11:00:02+03`; provenanceDuplicateGroups=0; deterministicIdMismatches=0 | История сохранена в schema A; 123 источника представлены ровно 123 детерминированными rows. Итог 484 включает ещё шесть уже штатно созданных booking projections после раннего gate. |
| Полный reset с owner-reviewed manifest | команда R1 ниже; `reset_rc=$?` и `printf` выполнены после команды, не после pipe | rc=3 | Carry, gate и data-copy прошли; новый blocker в `schema-post.sql:6203`: отсутствующая organization для `app_runtime_settings`. |
| Live ledger после rollback | H1 | 136 | Это ledger восстановленного свежего schema-A dump, не целевые 58. |
| Пять TEST services | `for unit in api worker scheduler webapp media-worker; do printf '%s active=%s failed=%s\n' "$unit" "$(systemctl is-active "bersoncarebot-$unit-test" || true)" "$(systemctl is-failed "bersoncarebot-$unit-test" || true)"; done` | api/worker/scheduler/media-worker inactive; webapp failed | Не запускались на незавершённой schema A. |
| HTTP | `curl -k -sS -o /tmp/bcb-test-webapp-health-legacyappt.txt -w 'webapp_http_code=%{http_code}\n' --max-time 15 https://test.bersoncare.ru/api/health; curl_rc=$?; printf 'webapp_curl_rc=%s\n' "$curl_rc"` | HTTP=200; curl rc=0 | Ответ — maintenance HTML «Сервер обновляется», не application health. |
| ACL reconcile/check | штатный R1 | не запускались | Reset остановился до ACL stage; зелёный результат не заявляется. |

### F1 — поведенческая инъекция

Инъекция выполнялась в одной транзакции. `ON_ERROR_STOP` завершил session на ожидаемой ошибке gate, поэтому
PostgreSQL автоматически откатил незавершённую транзакцию; строка `ROLLBACK` оставлена для зелёного варианта:

```bash
sudo -u postgres psql -X -v ON_ERROR_STOP=1 \
  -v expected_database=bersoncarebot_test \
  -v canonical_organization_id=a0000000-0000-4000-8000-000000000001 \
  -v canonical_specialist_id=c9515025-7224-4d9b-86b6-9cb7d26ea503 \
  -d bersoncarebot_test <<'SQL'
BEGIN;
WITH victim AS (
  SELECT id
  FROM public.be_appointments
  WHERE attribution_json ->> 'sourceTable' = 'appointment_records'
  ORDER BY id
  LIMIT 1
)
DELETE FROM public.be_appointments appointment
USING victim
WHERE appointment.id = victim.id;
\ir deploy/postgres/pre-cutover-data-stage-assertions.sql
ROLLBACK;
SQL
fault_rc=$?
printf 'fault_injection_gate_rc=%s\n' "$fault_rc"
```

После автоматического session rollback проверено отдельным aggregate-only запросом: unresolved=0, rc=0.

### H1 — aggregate-only доказательство истории и дублей

```bash
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d bersoncarebot_test -P pager=off -Atc \
"WITH carried AS (
   SELECT * FROM public.be_appointments
   WHERE attribution_json ->> 'sourceTable' = 'appointment_records'
 ), provenance_duplicates AS (
   SELECT attribution_json ->> 'legacyAppointmentRecordId' AS source_id
   FROM carried GROUP BY 1 HAVING count(*) > 1
 ), deterministic_mismatches AS (
   SELECT 1 FROM carried
   WHERE id <> (
     substr(md5('legacy-appointment-record:' || (attribution_json ->> 'legacyAppointmentRecordId')),1,8)||'-'||
     substr(md5('legacy-appointment-record:' || (attribution_json ->> 'legacyAppointmentRecordId')),9,4)||'-'||
     substr(md5('legacy-appointment-record:' || (attribution_json ->> 'legacyAppointmentRecordId')),13,4)||'-'||
     substr(md5('legacy-appointment-record:' || (attribution_json ->> 'legacyAppointmentRecordId')),17,4)||'-'||
     substr(md5('legacy-appointment-record:' || (attribution_json ->> 'legacyAppointmentRecordId')),21,12)
   )::uuid
 )
 SELECT json_build_object(
   'beAppointmentsTotal',(SELECT count(*) FROM public.be_appointments),
   'legacyCarried',(SELECT count(*) FROM carried),
   'legacyPatients',(SELECT count(DISTINCT platform_user_id) FROM carried),
   'legacyDateMin',(SELECT min(start_at) FROM carried),
   'legacyDateMax',(SELECT max(start_at) FROM carried),
   'legacySourceIds',(SELECT count(DISTINCT attribution_json ->> 'legacyAppointmentRecordId') FROM carried),
   'provenanceDuplicateGroups',(SELECT count(*) FROM provenance_duplicates),
   'deterministicIdMismatches',(SELECT count(*) FROM deterministic_mismatches),
   'drizzleLedgerRows',(SELECT count(*) FROM drizzle.__drizzle_migrations)
 );"
history_probe_rc=$?
printf 'history_probe_rc=%s\n' "$history_probe_rc"
```

### R1 — финальный штатный full reset

```bash
bash deploy/host/deploy-test-full-reset.sh --confirm-full-reset \
  --fio-manifest=/tmp/bcb-cutover-inputs/fio-owner-reviewed-test-20260820-merge-preserve.manifest.json \
  --fio-manifest-file-sha256=0842f3d942d31bfaf228694512874b73d5809f2060824e6af314509fe4790d51 \
  --fio-manifest-sha256=436e8fe7c75f8a771e520a043803c548b5724492ed35d97edf43ad631ec719da \
  --fio-review-source-sha256=56fa7fc7dbdd6caacdb6bb1350a4d891fdff6fc7b7e679803396181983c99700 \
  wt/legacyappt-20260820 \
  > /tmp/bcb-test-full-reset-legacyappt-20260820-r5.log 2>&1
reset_rc=$?
printf 'full_reset_r5_rc=%s\n' "$reset_rc"
```

Получено: `full_reset_r5_rc=3` и
`Key (organization_id)=(d0000000-0000-4000-8000-000000000004) is not present in table
"be_organizations"` на `generated/prod-to-target/schema-post.sql:6203`.

## Коммиты реализации

- `c7dde2853` — `fix(cutover): carry legacy appointment history`
- `425f5c3e5` — `fix(cutover): deduplicate legacy booking projections`
- `0d1f07c2a` — `fix(cutover): classify retired source tables`
- `0e5c924b7` — `fix(cutover): read retired bridge from source snapshot`

Итоговый report commit добавляется последним коммитом этого worker-хода.
