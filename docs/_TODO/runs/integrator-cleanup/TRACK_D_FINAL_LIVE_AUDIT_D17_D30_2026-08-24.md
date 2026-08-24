# Track D final live audit — D17 + D30

Дата/окно: 2026-08-24, 14:03–14:38 MSK. Среда: только именованный TEST на
`151.241.228.122`; PROD не затрагивался. Проверен exact deployed source
`3745ae24c9de62afc85f6aaf602bfecb3ada5f69`.

## Итог гейтов

| Гейт | Вердикт | Факт |
|---|---|---|
| TEST topology / retired cron | **PASS** | Все четыре текущих сервиса active; legacy worker отсутствует; один resident scheduler; Track-D cron-совпадений нет. |
| D17 booking journey | **FAIL** | `/app` и `/app/doctor/login` отвечают 500: обязательная runtime-setting отсутствует. Реальную запись через authenticated application/API boundary создать нельзя; confirmation, provider delivery, calendar и replay/no-duplicate не достигнуты. Узкий exact-org DB-root отдельно подтверждён. |
| D30 Ш1 durable delivery | **BLOCKED** | Resident scheduler после старта отправил одну ранее существовавшую строку, но новую контрольную строку через нормальный boundary создать и наблюдать по всем состояниям нельзя из-за того же login outage. Очередь и health-counter согласованы в текущем снимке. |
| D30 Ш3 specialist task | **BLOCKED** | Authenticated create/update/complete/delete недоступен; новых task/queue rows не создано. Активных orphan specialist rows нет. |
| D30 Ш4 reminder provider | **BLOCKED** | Новую запись/occurrence безопасно создать нельзя; поэтому `planned/dueClaimed/sent` для одной контрольной записи не измерены. Resident queue при этом не имеет due/processing reminder backlog. |
| D30 Ш5 digest + guard | **BLOCKED** | Resident digest wake и guard после deploy успешны, host cron отсутствует. Но требуемая recipient delivery и перенос следующего запуска через admin `digestTime` не доказаны: admin login недоступен. `digestTime` не менялся и остался `09:00`. |
| D30 Ш6 provider probes | **BLOCKED** | Host cron отсутствует, но все три runtime-пробы сохранены как disabled; нет включённой пробы, чей `lastRunAt` можно законно наблюдать. Настройки не менялись. |
| Cleanup | **PASS** | Не осталось созданных booking/task/calendar-map/queue/capability rows; rollback-пробы откатились; созданная вкладка браузера закрыта; конфигурация не менялась. |

## 1. TEST topology и cron

Команда:

```bash
git -C /opt/projects/bersoncarebot-test rev-parse HEAD
for unit in bersoncarebot-{api,scheduler,webapp,media-worker}-test.service; do
  systemctl is-active "$unit"
  systemctl show "$unit" -p ActiveEnterTimestamp --value
done
systemctl is-active bersoncarebot-worker-test.service
systemctl show bersoncarebot-worker-test.service -p LoadState --value
pgrep -af 'dist/infra/runtime/scheduler/main.js' | awk '!/pgrep -af/ {n++} END{print n+0}'
pgrep -af 'dist/infra/runtime/worker/main.js' | awk '!/pgrep -af/ {n++} END{print n+0}'
node /home/dev/brain/tools/cronport.mjs list |
  awk 'BEGIN{IGNORECASE=1} /specialist-task|operator-health-digest|system-health-guard|operator-health-probe|web-push-only|patient-reminder/{n++} END{print n+0}'
```

Измерение:

- SHA: `3745ae24c9de62afc85f6aaf602bfecb3ada5f69`.
- api/scheduler/webapp/media-worker: `active`, каждый с `ActiveEnterTimestamp=2026-08-24 14:03:24 MSK`.
- legacy worker: `inactive`, `LoadState=not-found`.
- resident scheduler processes: `1`; legacy worker processes: `0`.
- retired Track-D host-trigger matches: `0`.
- scheduler `ExecStart` содержит `dist/infra/runtime/scheduler/main.js`.

Safe redirect проверен без печати значений:

```bash
sudo awk -F= '$1=="DEV_DELIVERY_REDIRECT" || $1=="DEV_REDIRECT_EMAIL" ||
  $1=="DEV_REDIRECT_TELEGRAM_CHAT_ID" || $1=="DEV_REDIRECT_WEB_PUSH_USER_ID" {
  print $1 "|" ($2!="" ? "configured" : "missing")
}' /opt/env/bersoncarebot/api.test
```

Результат: redirect enabled; email, Telegram и web-push safe targets configured. Ни одно значение не выводилось.

## 2. Реальный блокер D17 и authenticated D30 journeys

Команда:

```bash
base='https://test.bersoncare.ru'
for path in /health /api/health /app /app/doctor/login; do
  curl -sS -o /dev/null -w "$path|%{http_code}\n" "$base$path"
done
curl -sS -o /dev/null -w 'doctor_tasks_no_session|%{http_code}\n' \
  "$base/api/doctor/tasks"
curl -sS -o /dev/null -w 'admin_system_health_no_session|%{http_code}\n' \
  "$base/api/admin/system-health"
```

Результат: `/health=200`, `/api/health=200`, `/app=500`, `/app/doctor/login=500`,
doctor tasks без сессии `401`, admin system-health без сессии `401`.

Причина воспроизводима и не является выводом из кода:

```bash
sudo journalctl -u bersoncarebot-webapp-test.service \
  --since '2026-08-24 14:03:24' --no-pager |
  rg -c 'runtime_setting_unavailable:auth_surface_staff_oauth_yandex_enabled'

sudo -u postgres psql -d bersoncarebot_test -X -Atq -c \
  "SELECT count(*) FROM system_settings WHERE key='auth_surface_staff_oauth_yandex_enabled'"
```

Результат: `7` runtime errors после рестарта; строк settings: `0`.

Это достижимый runtime defect: здоровые health endpoints соседствуют с 500 на обеих страницах входа.
Он блокирует owner TEST login и тем самым обязательные D17 booking и D30 Ш3 task journeys. Исправления
продукта, прямой подмены settings или synthetic user в рамках аудита не выполнялись.

### D17 narrow-role subproof

Каноническая DB-proof команда на TEST была запущена точно так:

```bash
RUN_D17_INTEGRATOR_ROOTS_DB=1 \
D17_INTEGRATOR_ROOTS_PROOF_DB=bersoncarebot_test \
node --test deploy/postgres/privileges/integrator-narrow-delivery-roots.devDbProof.test.mjs
```

Она штатно остановилась на guard: DEV-generated privilege artifact нельзя применять к
`bersoncarebot_test`; транзакция прервалась без persistent writes.

После этого выполнена rollback-only проверка уже установленной TEST schema: helper
`pg_temp.accept_context` взят из того же proof, transaction вошла в
`app_integrator_tenant_service`, вызвала только exact-current-org credential/calendar roots,
проверила foreign-org/broad-role denial и завершилась `ROLLBACK`.

Ключевой count получен запросом:

```sql
SELECT count(*)
FROM unnest(ARRAY[
  'clinic_smtp_outbound', 'clinic_smsc_api_key', 'clinic_telegram_bot_token',
  'clinic_max_bot_api_key', 'clinic_vk_community_access_token',
  'clinic_transactional_mail_template'
]) AS credential_key
WHERE app.read_integrator_clinic_delivery_credential(
  credential_key, fixture.organization_id) ->> 'auditMarker' = credential_key;
```

Результаты без credential values: function owner `app_seam_settings_integrator_owner`; narrow EXECUTE
`true`; broad EXECUTE `false`; exact-org credential roots read `6`; foreign-org call `42501`;
same-org calendar root `ALLOWED`; broad-role call `42501`. Это доказывает DB boundary, но не заменяет
заблокированные booking/provider/calendar/replay шаги.

## 3. D30 Ш1/Ш3/Ш4 — queue measurements

Снимок после resident scheduler start:

```sql
-- sudo -u postgres psql -d bersoncarebot_test -X -Atq
WITH boundary AS (SELECT timestamptz '2026-08-24 14:03:24+03' AS started_at)
SELECT count(*) FROM outgoing_delivery_queue, boundary WHERE created_at >= started_at;
SELECT count(*) FROM outgoing_delivery_queue, boundary
 WHERE status='sent' AND sent_at >= started_at;
SELECT count(*) FROM patient_bookings, boundary WHERE created_at >= started_at;
SELECT count(*) FROM be_appointments, boundary WHERE created_at >= started_at;
SELECT count(*) FROM booking_calendar_map, boundary WHERE created_at >= started_at;
SELECT count(*) FROM specialist_tasks, boundary WHERE created_at >= started_at;
SELECT count(*) FROM notification_delivery_attempts, boundary WHERE created_at >= started_at;
```

Результат соответственно: new queue `0`; sent after restart `1`; bookings `0`; appointments `0`;
calendar maps `0`; specialist tasks `0`; delivery attempts `0`. Sent row была создана до deploy, поэтому
она подтверждает resident delivery progress, но не требуемый наблюдаемый переход новой audit row.

Curated system-health снимок прочитан через attested `saas_telemetry_operator` context и
`app.read_curated_system_health()`; transaction завершилась `ROLLBACK`:

```sql
SELECT app.read_curated_system_health();
```

Санитизированные агрегаты: due backlog `0`, operator dead `17`, processing `0`, reminder due `0`,
reminder dead `12`, reminder processing `0`, reminder delivery sent за 24h `31`,
`lastSentAt=2026-08-24 14:21:21+03`.

Прямое сопоставление теми же предикатами health-функции:

```sql
SELECT count(*) FROM outgoing_delivery_queue
 WHERE status IN ('pending','failed_retryable') AND next_retry_at <= now();
SELECT count(*) FROM outgoing_delivery_queue
 WHERE status='dead'
   AND (failure_class IS NULL OR failure_class NOT IN
        ('recipient_blocked_bot','reminder_not_dispatched'));
SELECT count(*) FROM outgoing_delivery_queue WHERE status='processing';
SELECT count(*) FROM outgoing_delivery_queue
 WHERE kind='reminder_dispatch' AND status='dead'
   AND (failure_class IS NULL OR failure_class NOT IN
        ('recipient_blocked_bot','reminder_not_dispatched'));
SELECT count(*) FROM outgoing_delivery_queue
 WHERE kind='reminder_dispatch' AND status='sent'
   AND sent_at >= now() - interval '24 hours';
```

Результат: `0 / 17 / 0 / 12 / 31`, то есть current queue и System Health counters сходятся.

Orphan-проверка Ш3:

```sql
SELECT count(*)
FROM outgoing_delivery_queue q
WHERE q.kind='specialist_task_reminder'
  AND q.status IN ('pending','failed_retryable','processing','dispatching')
  AND NOT EXISTS (
    SELECT 1 FROM specialist_tasks t
    WHERE t.id::text = q.payload_json #>> '{successOutcome,taskId}'
      AND t.completed_at IS NULL
  );
```

Результат: active specialist-task orphan rows `0`.

## 4. D30 Ш5/Ш6 — resident job history

Команда:

```sql
SELECT job_key, last_status, last_started_at, last_finished_at,
       last_success_at, last_duration_ms
FROM operator_job_status
WHERE job_key IN (
  'health.operator_health_digest.tick',
  'health.system_health_guard.tick',
  'health.outbound_probe.run'
)
ORDER BY job_key;
```

Снимок 14:38 MSK:

- digest: `success`, start `14:03:28.326`, finish/success `14:03:28.434`, duration `107 ms`;
- guard: `success`, start `14:30:02.213`, finish/success `14:30:02.224`, duration `11 ms`;
- outbound probe: сохранённый `last_started_at=2026-06-10 01:00:02+03`, последний safe
  finish/success `2026-08-23 03:58:59.321+03`.

Конфигурация измерена запросом только boolean/time полей:

```sql
SELECT value_json #>> '{value,digestTime}',
       value_json #>> '{value,topics,digest_enabled}'
FROM system_settings WHERE key='operator_health_alert_config';
SELECT value_json #>> '{value,google_calendar,enabled}',
       value_json #>> '{value,max,enabled}',
       value_json #>> '{value,telegram,enabled}'
FROM system_settings WHERE key='operator_health_probe_config';
```

Результат: `digestTime=09:00`, digest enabled `true`; google-calendar/max/telegram probes —
`false/false/false`. Существующая timestamped history уже подтверждает resident digest/guard progress,
поэтому 20-минутное ожидание не добавлялось. Ш5 остаётся BLOCKED на recipient/digestTime-shift proof;
Ш6 — на отсутствии любой enabled probe. Broad audience не перенаправлялась, настройки не менялись.

## 5. Cleanup evidence

Команда после всех проб:

```sql
SELECT count(*) FROM outgoing_delivery_queue WHERE event_id LIKE 'd17-materialization:%';
SELECT count(*) FROM app_ext.port_context_capabilities
 WHERE capability_id IN (
   '00000000-0000-4000-8000-0000000000d7'::uuid,
   '00000000-0000-4000-8000-0000000000d8'::uuid
 );
SELECT count(*) FROM patient_bookings
 WHERE created_at >= timestamptz '2026-08-24 14:03:24+03';
SELECT count(*) FROM specialist_tasks
 WHERE created_at >= timestamptz '2026-08-24 14:03:24+03';
SELECT count(*) FROM booking_calendar_map
 WHERE created_at >= timestamptz '2026-08-24 14:03:24+03';
```

Результат: `0 / 0 / 0 / 0 / 0`. Вкладка TEST, созданная для проверки существующей browser session,
закрыта через CDP. Ни booking, ни task, ни calendar map, ни queue row, ни config mutation аудит не оставил.

## Finding

**MUST FIX / D17 FAIL:** на exact TEST SHA публичный application/login path возвращает 500, потому что
`auth_surface_staff_oauth_yandex_enabled` отсутствует в `system_settings`, а runtime требует этот ключ.
Достижимое последствие: владелец не может войти и создать bounded TEST booking/task; обязательные D17 и
D30 Ш1/Ш3/Ш4/Ш5 live proofs недоступны через нормальные application boundaries.
