ГОТОВО

# Выкладка `bb91018ec` на именованный TEST — 15.09.2026

## Итог

- Обычная выкладка `feat/doctor-ui-rebuild` завершилась `exit 0`; в TEST установлен точный SHA
  `bb91018eccefce272dd7159eed60586f6d69dc92`.
- Существующая база `bersoncarebot_test` сохранена. Штатный B0-forward мигратор применил 9 pending-миграций;
  `reapplied=0`, `unapplied=0`. Флаги `--reapply` и `--recover-stopped-access` не использовались и скриптом не
  запрашивались.
- Перезапущены `api`, `scheduler`, `webapp`, `media-worker`; все четыре TEST-юнита `active (running)` и ни один
  из них не находится в `failed`.
- Живой `/api/health`: `{"ok":true,"db":"up"}`. Integrator в системном health также `ok`, его DB `up`.
- Manifest содержит 12 TEST-заданий. `--verify-installed --env test` вернул `OK`: отсутствующих или
  отличающихся расписаний — 0.
- Очередь доставки: due/dead/processing = `0/0/0`; очередь напоминаний = `0/0/0`; очередь транскода
  pending/processing = `0/0`, failed за час и 24 часа = `0/0`; `probeOutbound.consecutiveFailRuns=0`;
  открытых operator incidents = 0.
- Штатный стартовый сброс media-worker действительно выполнен: из `blocked`/`failed` выпущены 33 preview-строки.
  Однако их исходники отсутствуют в TEST S3: до фиксированного cut-off `09:23:00 MSK` записано 99 попыток с
  `The specified key does not exist.` (три попытки на каждую из 33 строк). Поэтому preview-health остаётся
  `degraded`, одна HEIC-строка была stale pending на снимке `09:26:35 MSK`. Дополнительный ручной сброс не делался:
  штатный путь уже сработал, а повтор без исходных объектов только снова запустил бы те же ошибки.
- На хосте есть 2 посторонних failed-юнита: `certbot.service` и `snap.certbot.renew.service`. Это не TEST-воркеры;
  они не трогались. В журналах четырёх TEST-сервисов с systemd priority `err` записей нет.
- Transcript: `/var/log/bersoncarebot/deploy-test/deploy-test.20260915T061130Z.Dv1Qxz.log`.

## Деплой — дословный финал

Команда:

```bash
bash /home/dev/dev-projects/BersonCareBot/deploy/host/deploy-test.sh
```

Финал transcript дословно:

```text
deploy-test: доказательство стены арендатора на bersoncarebot_test (после сверки прав)
TAP version 13
# доказано на транзакционной строке public.be_branches; клиника a0000000-0000-4000-8000-000000000001, актор 07be5dff-7761-ccfc-d4bf-8fe7d508259b, база bersoncarebot_test; ROLLBACK не оставляет фикстуру
# Subtest: клиника видит только свои строки
ok 1 - клиника видит только свои строки
  ---
  duration_ms: 483.479877
  type: 'test'
  ...
# Subtest: контекст на чужую клинику получить нельзя
ok 2 - контекст на чужую клинику получить нельзя
  ---
  duration_ms: 94.585177
  type: 'test'
  ...
# Subtest: без контекста чтение отказывает, а не отвечает нулём строк
ok 3 - без контекста чтение отказывает, а не отвечает нулём строк
  ---
  duration_ms: 49.94598
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
# duration_ms 953.183881
deploy-test: retiring legacy bersoncarebot-worker-test.service before the merged scheduler can start
background-jobs-cli --check: OK (30 artifacts из apps/webapp/src/modules/operator-health/backgroundJobManifest.ts)
background-jobs-cli --apply-installed (test): расписание уже совпадает с manifest
curl: (7) Failed to connect to 127.0.0.1 port 6300 after 0 ms: Couldn't connect to server
◇ injected env (0) from .env // tip: ⌘ override existing { override: true }
(node:2444574) [DEP0123] DeprecationWarning: Setting the TLS ServerName to an IP address is not permitted by RFC 6066. This will be ignored in a future version.
(Use `node --trace-deprecation ...` to show where the warning was created)
saas_isolation_post_runtime_gate_ok status=okay coverage=complete active_unexplained=0 active_explained=0
   E1 post-runtime coverage/read gate: OK
эталон: bcb_webapp_dev (277 обещаний) · цель: bersoncarebot_test (277)
журнал цели не врёт: всё, что сбылось на эталоне, сбылось и здесь
deploy-test: PASS branch=feat/doctor-ui-rebuild head=bb91018eccef B0/post-B0 only
```

Единственная строка, найденная точным поиском ошибок в deploy transcript, — ожидаемая первая попытка health во
время рестарта; последующие попытки прошли, иначе скрипт не дошёл бы до `PASS`:

```bash
rg -n '^FATAL:|^ERROR:|^curl: \([1-9]|^TEST writers remain stopped' /var/log/bersoncarebot/deploy-test/deploy-test.20260915T061130Z.Dv1Qxz.log
```

```text
1545:curl: (7) Failed to connect to 127.0.0.1 port 6300 after 0 ms: Couldn't connect to server
```

## Установленный SHA

```bash
sudo -n -u deploy git -C /opt/projects/bersoncarebot-test rev-parse HEAD
```

```text
bb91018eccefce272dd7159eed60586f6d69dc92
```

## TEST-юниты — дословный `systemctl status`

```bash
sudo systemctl status bersoncarebot-api-test.service bersoncarebot-scheduler-test.service bersoncarebot-webapp-test.service bersoncarebot-media-worker-test.service --no-pager --full
```

```text
● bersoncarebot-api-test.service - BersonCareBot API (Test)
     Loaded: loaded (/etc/systemd/system/bersoncarebot-api-test.service; enabled; preset: enabled)
     Active: active (running) since Tue 2026-09-15 09:16:35 MSK; 1min 23s ago
   Main PID: 2444375 (node)
      Tasks: 11 (limit: 38364)
     Memory: 54.2M (peak: 111.6M)
        CPU: 1.538s
     CGroup: /system.slice/bersoncarebot-api-test.service
             └─2444375 /usr/bin/node dist/main.js

Sep 15 09:16:35 localhost systemd[1]: Started bersoncarebot-api-test.service - BersonCareBot API (Test).
Sep 15 09:16:35 localhost node[2444375]: ◇ injected env (0) from .env // tip: ⌘ enable debugging { debug: true }
Sep 15 09:16:36 localhost node[2444375]: (node:2444375) [DEP0123] DeprecationWarning: Setting the TLS ServerName to an IP address is not permitted by RFC 6066. This will be ignored in a future version.
Sep 15 09:16:36 localhost node[2444375]: (Use `node --trace-deprecation ...` to show where the warning was created)
Sep 15 09:16:36 localhost node[2444375]: {"level":30,"time":1789452996797,"pid":2444375,"dbPrincipalContextMode":"port-context","migrationLedger":"integrator.schema_migrations","msg":"Integrator port-context startup verified migration ledger without a DDL pool"}
Sep 15 09:16:36 localhost node[2444375]: {"level":30,"time":1789452996917,"pid":2444375,"integrations":[{"id":"telegram","kind":"messenger","incoming":true,"outgoing":true},{"id":"smsc","kind":"provider","incoming":false,"outgoing":true},{"id":"vk","kind":"messenger","incoming":true,"outgoing":true},{"id":"max","kind":"messenger","incoming":true,"outgoing":true},{"id":"email","kind":"provider","incoming":false,"outgoing":true}],"msg":"integration registry loaded"}
Sep 15 09:16:36 localhost node[2444375]: {"level":30,"time":1789452996942,"pid":2444375,"msg":"Server listening at http://127.0.0.1:3300"}
Sep 15 09:16:36 localhost node[2444375]: {"level":30,"time":1789452996943,"pid":2444375,"msg":"Server listening on http://127.0.0.1:3300"}
Sep 15 09:16:39 localhost node[2444375]: {"level":30,"time":1789452999580,"pid":2444375,"correlationId":"83c94011-c8d1-4533-bdfa-d881d5d67a39","scope":"health_probe","state":"ok","previous":null,"reason":"first","msg":"health probe"}

● bersoncarebot-scheduler-test.service - BersonCareBot Scheduler (Test)
     Loaded: loaded (/etc/systemd/system/bersoncarebot-scheduler-test.service; enabled; preset: enabled)
     Active: active (running) since Tue 2026-09-15 09:16:35 MSK; 1min 23s ago
   Main PID: 2444383 (node)
      Tasks: 11 (limit: 38364)
     Memory: 65.5M (peak: 142.3M)
        CPU: 1.991s
     CGroup: /system.slice/bersoncarebot-scheduler-test.service
             └─2444383 /usr/bin/node dist/infra/runtime/scheduler/main.js

Sep 15 09:16:35 localhost systemd[1]: Started bersoncarebot-scheduler-test.service - BersonCareBot Scheduler (Test).
Sep 15 09:16:36 localhost node[2444383]: ◇ injected env (0) from .env // tip: ◈ secrets for agents [www.dotenvx.com]
Sep 15 09:16:36 localhost node[2444383]: (node:2444383) [DEP0123] DeprecationWarning: Setting the TLS ServerName to an IP address is not permitted by RFC 6066. This will be ignored in a future version.
Sep 15 09:16:36 localhost node[2444383]: (Use `node --trace-deprecation ...` to show where the warning was created)
Sep 15 09:16:36 localhost node[2444383]: {"level":30,"time":1789452996863,"pid":2444383,"msg":"Scheduler lock acquired, starting resident scheduler+worker loop"}
Sep 15 09:16:44 localhost node[2444383]: {"level":30,"time":1789453004687,"pid":2444383,"max":"skipped_not_configured","telegram":"skipped_not_configured","google_calendar":"skipped_not_configured","email":"skipped_not_configured","details":{"max":"skipped_not_configured","telegram":"skipped_not_configured","google_calendar":"skipped_not_configured","consecutiveFailRuns":"0"},"msg":"operator_health_probes_done"}

● bersoncarebot-webapp-test.service - BersonCare Webapp (Test)
     Loaded: loaded (/etc/systemd/system/bersoncarebot-webapp-test.service; enabled; preset: enabled)
     Active: active (running) since Tue 2026-09-15 09:16:35 MSK; 1min 23s ago
    Process: 2444392 ExecStartPre=/bin/sh -c rm -rf ".next/cache"; ln -sfn /var/cache/bersoncarebot-webapp-test ".next/cache" (code=exited, status=0/SUCCESS)
   Main PID: 2444397 (next-server (v1)
      Tasks: 11 (limit: 38364)
     Memory: 312.8M (peak: 343.5M)
        CPU: 6.277s
     CGroup: /system.slice/bersoncarebot-webapp-test.service
             └─2444397 "next-server (v16.3.3)"

Sep 15 09:16:40 localhost node[2444397]: {"level":50,"time":1789453000660,"service":"bersoncare-webapp","pid":2444397,"mediaId":"f66213f8-8f0e-42b1-b6d9-c9908cfd2ca6","error":{"type":"UnknownError"},"msg":"[mediaPreviewControl] preview failed"}
Sep 15 09:16:40 localhost node[2444397]: {"level":50,"time":1789453000684,"service":"bersoncare-webapp","pid":2444397,"mediaId":"d1227890-a2bb-4e00-9f33-477828d4e1d8","error":{"type":"UnknownError"},"msg":"[mediaPreviewControl] preview failed"}
Sep 15 09:16:40 localhost node[2444397]: {"level":50,"time":1789453000707,"service":"bersoncare-webapp","pid":2444397,"mediaId":"9c2b93a1-bf10-4e35-9cba-660ea3b72fba","error":{"type":"UnknownError"},"msg":"[mediaPreviewControl] preview failed"}
Sep 15 09:16:40 localhost node[2444397]: {"level":50,"time":1789453000731,"service":"bersoncare-webapp","pid":2444397,"mediaId":"c60da26f-d2f8-43b6-b6dc-34ff3483f1bb","error":{"type":"UnknownError"},"msg":"[mediaPreviewControl] preview failed"}
Sep 15 09:16:40 localhost node[2444397]: {"level":50,"time":1789453000755,"service":"bersoncare-webapp","pid":2444397,"mediaId":"1ef434ef-0781-4f62-afcb-59bc260842cc","error":{"type":"UnknownError"},"msg":"[mediaPreviewControl] preview failed"}
Sep 15 09:16:40 localhost node[2444397]: {"level":50,"time":1789453000780,"service":"bersoncare-webapp","pid":2444397,"mediaId":"015dcea9-8793-46a1-8c90-a78b2f3707d7","error":{"type":"UnknownError"},"msg":"[mediaPreviewControl] preview failed"}
Sep 15 09:16:40 localhost node[2444397]: {"level":50,"time":1789453000804,"service":"bersoncare-webapp","pid":2444397,"mediaId":"02080664-88fd-4430-a94f-0b533b0fea36","error":{"type":"UnknownError"},"msg":"[mediaPreviewControl] preview failed"}
Sep 15 09:16:40 localhost node[2444397]: {"level":50,"time":1789453000828,"service":"bersoncare-webapp","pid":2444397,"mediaId":"e5109ace-3f7f-44b2-90e0-aa449ca37ceb","error":{"type":"UnknownError"},"msg":"[mediaPreviewControl] preview failed"}
Sep 15 09:16:40 localhost node[2444397]: {"level":50,"time":1789453000854,"service":"bersoncare-webapp","pid":2444397,"mediaId":"28cbde0f-c3c0-4ad6-9697-61314661ba4a","error":{"type":"UnknownError"},"msg":"[mediaPreviewControl] preview failed"}
Sep 15 09:16:40 localhost node[2444397]: {"level":50,"time":1789453000877,"service":"bersoncare-webapp","pid":2444397,"mediaId":"2b58e7f5-ce4b-48ab-9d64-fa00e7092a1c","error":{"type":"UnknownError"},"msg":"[mediaPreviewControl] preview failed"}

● bersoncarebot-media-worker-test.service - BersonCareBot HLS media-worker (Test)
     Loaded: loaded (/etc/systemd/system/bersoncarebot-media-worker-test.service; enabled; preset: enabled)
     Active: active (running) since Tue 2026-09-15 09:16:39 MSK; 1min 19s ago
   Main PID: 2444505 (node)
      Tasks: 11 (limit: 38364)
     Memory: 51.5M (peak: 65.0M)
        CPU: 1.040s
     CGroup: /system.slice/bersoncarebot-media-worker-test.service
             └─2444505 /usr/bin/node dist/main.js

Sep 15 09:16:40 localhost node[2444505]: {"level":30,"time":1789453000767,"pid":2444505,"hostname":"localhost","correlationId":"015dcea9-8793-46a1-8c90-a78b2f3707d7","mediaId":"015dcea9-8793-46a1-8c90-a78b2f3707d7","plan":"image","attempts":0,"msg":"processing preview order"}
Sep 15 09:16:40 localhost node[2444505]: {"level":40,"time":1789453000782,"pid":2444505,"hostname":"localhost","correlationId":"015dcea9-8793-46a1-8c90-a78b2f3707d7","mediaId":"015dcea9-8793-46a1-8c90-a78b2f3707d7","plan":"image","attempts":0,"errorCode":"The specified key does not exist.","msg":"preview_order_failed"}
Sep 15 09:16:40 localhost node[2444505]: {"level":30,"time":1789453000793,"pid":2444505,"hostname":"localhost","correlationId":"02080664-88fd-4430-a94f-0b533b0fea36","mediaId":"02080664-88fd-4430-a94f-0b533b0fea36","plan":"image","attempts":0,"msg":"processing preview order"}
Sep 15 09:16:40 localhost node[2444505]: {"level":40,"time":1789453000806,"pid":2444505,"hostname":"localhost","correlationId":"02080664-88fd-4430-a94f-0b533b0fea36","mediaId":"02080664-88fd-4430-a94f-0b533b0fea36","plan":"image","attempts":0,"errorCode":"The specified key does not exist.","msg":"preview_order_failed"}
Sep 15 09:16:40 localhost node[2444505]: {"level":30,"time":1789453000816,"pid":2444505,"hostname":"localhost","correlationId":"e5109ace-3f7f-44b2-90e0-aa449ca37ceb","mediaId":"e5109ace-3f7f-44b2-90e0-aa449ca37ceb","plan":"image","attempts":0,"msg":"processing preview order"}
Sep 15 09:16:40 localhost node[2444505]: {"level":40,"time":1789453000830,"pid":2444505,"hostname":"localhost","correlationId":"e5109ace-3f7f-44b2-90e0-aa449ca37ceb","mediaId":"e5109ace-3f7f-44b2-90e0-aa449ca37ceb","plan":"image","attempts":0,"errorCode":"The specified key does not exist.","msg":"preview_order_failed"}
Sep 15 09:16:40 localhost node[2444505]: {"level":30,"time":1789453000839,"pid":2444505,"hostname":"localhost","correlationId":"28cbde0f-c3c0-4ad6-9697-61314661ba4a","mediaId":"28cbde0f-c3c0-4ad6-9697-61314661ba4a","plan":"image","attempts":0,"msg":"processing preview order"}
Sep 15 09:16:40 localhost node[2444505]: {"level":40,"time":1789453000856,"pid":2444505,"hostname":"localhost","correlationId":"28cbde0f-c3c0-4ad6-9697-61314661ba4a","mediaId":"28cbde0f-c3c0-4ad6-9697-61314661ba4a","plan":"image","attempts":0,"errorCode":"The specified key does not exist.","msg":"preview_order_failed"}
Sep 15 09:16:40 localhost node[2444505]: {"level":30,"time":1789453000866,"pid":2444505,"hostname":"localhost","correlationId":"2b58e7f5-ce4c-ab9d30d8d60d","mediaId":"2b58e7f5-ce4c-ab9d30d8d60d","plan":"image","attempts":0,"msg":"processing preview order"}
Sep 15 09:16:40 localhost node[2444505]: {"level":40,"time":1789453000879,"pid":2444505,"hostname":"localhost","correlationId":"2b58e7f5-ce4c-ab9d30d8d60d","mediaId":"2b58e7f5-ce4c-ab9d30d8d60d","plan":"image","attempts":0,"errorCode":"The specified key does not exist.","msg":"preview_order_failed"}
```

Команда отдельной проверки `failed` именно для четырёх TEST-юнитов (код `1` у `systemctl is-failed` означает
«не failed»):

```bash
for unit in bersoncarebot-api-test.service bersoncarebot-scheduler-test.service bersoncarebot-webapp-test.service bersoncarebot-media-worker-test.service; do printf '%s ' "$unit"; sudo systemctl is-failed "$unit"; done
```

```text
bersoncarebot-api-test.service active
bersoncarebot-scheduler-test.service active
bersoncarebot-webapp-test.service active
bersoncarebot-media-worker-test.service active
```

Legacy worker штатно выведен после слияния worker+scheduler:

```bash
sudo systemctl status bersoncarebot-worker-test.service --no-pager --full
```

```text
Unit bersoncarebot-worker-test.service could not be found.
```

## Живое здоровье и установленное расписание

Обе runtime-проверки выполнены через обязательный общий замок хоста:

```bash
/home/dev/brain/host-orch/run-tests.sh "curl -fsS --max-time 10 -H 'Host: test.therapysto.ru' http://127.0.0.1:6300/api/health; printf '\n'; node deploy/host/background-jobs-cli.mjs --verify-installed --env test"
```

```text
[2026-09-15T09:18:26+03:00] pid=2446544 WAITING for test lock :: curl -fsS --max-time 10 -H 'Host: test.therapysto.ru' http://127.0.0.1:6300/api/health; printf '\n'; node deploy/host/background-jobs-cli.mjs --verify-installed --env test
[2026-09-15T09:18:26+03:00] pid=2446544 ACQUIRED test lock :: curl -fsS --max-time 10 -H 'Host: test.therapysto.ru' http://127.0.0.1:6300/api/health; printf '\n'; node deploy/host/background-jobs-cli.mjs --verify-installed --env test
{"ok":true,"db":"up"}
background-jobs-cli --verify-installed (test): OK
[2026-09-15T09:18:26+03:00] pid=2446544 RELEASED test lock (rc=0, 0s)
```

Количество и перечень TEST-заданий измерены этой командой:

```bash
/home/dev/brain/host-orch/run-tests.sh "jobs=\$(node deploy/host/background-jobs-cli.mjs --list --env test); printf '%s\n' \"\$jobs\"; printf 'manifest_test_jobs='; printf '%s\n' \"\$jobs\" | awk 'NF {count++} END {print count+0}'"
```

```text
test	media_purge	обязательное	*/5 * * * *	bersoncarebot-test-media-purge
test	media_multipart	обязательное	*/10 * * * *	bersoncarebot-test-media-multipart
test	media_transcode_reconcile	опциональное	*/10 * * * *	bersoncarebot-test-media-transcode-reconcile
test	operator_health_critical	обязательное	*/5 * * * *	bersoncarebot-test-operator-health-critical
test	domain_health	обязательное	50 3 * * *	bersoncarebot-test-domain-health
test	media_delivery_bytes_flush	обязательное	*/5 * * * *	bersoncarebot-test-media-delivery-bytes-flush
test	playback_retention	обязательное	15 4 * * 1	bersoncarebot-test-media-playback-stats-retention
test	hls_proxy_retention	обязательное	20 4 * * 1	bersoncarebot-test-media-hls-proxy-errors-retention
test	product_analytics_retention	обязательное	30 4 * * 1	bersoncarebot-test-product-analytics-retention
test	db_journal_retention	обязательное	0 * * * *	bersoncarebot-test-db-journal-retention
test	saas_billing_renewal_tick	обязательное	0 * * * *	bersoncarebot-test-saas-billing-renewal
test	booking_prepayment_expiry	обязательное	* * * * *	bersoncarebot-test-booking-prepayment-expiry
manifest_test_jobs=12
```

## Очереди и error-blockers

Снимок получен штатным входом существующего TEST global-admin и публичным
`GET https://admin.test.therapysto.ru/api/admin/system-health`; временный cookie jar удалён trap-ом. Команда шла
через общий host-lock. Ни cookie, ни session payload не печатались и не сохранялись в репозитории. Точный вызов
содержал только опубликованный в `AGENTS.md` §1a пароль именованной TEST-учётки:

```bash
/home/dev/brain/host-orch/run-tests.sh "set -euo pipefail; probe_dir=\$(mktemp -d /tmp/bcb-test-system-health.XXXXXX); trap 'rm -rf -- \"\$probe_dir\"' EXIT; login_json=\$(curl -fsS --max-time 30 -c \"\$probe_dir/cookies.txt\" -H 'Content-Type: application/json' -H 'Origin: https://admin.test.therapysto.ru' -H 'Sec-Fetch-Site: same-origin' --data '{\"email\":\"dimmdao@gmail.com\",\"password\":\"123456testTEST\"}' https://admin.test.therapysto.ru/api/auth/email-password/login); printf '%s\n' \"\$login_json\" | jq '{ok, role, factorRequired, error}'; curl -fsS --max-time 30 -b \"\$probe_dir/cookies.txt\" https://admin.test.therapysto.ru/api/admin/system-health | jq '{fetchedAt, webappDb, integratorApi, mediaPreview, videoTranscode, outgoingDelivery, remindersPipeline: .remindersPipeline.outgoingReminderDispatch, operatorIncidents, cronJobs: {status: .cronJobs.status, jobRows: (.cronJobs.jobs | length), nonOk: [.cronJobs.jobs[] | select(.status != \"ok\") | {id, status, reason}]}, probeOutbound, probeStatuses: (.meta.probes | map_values(.status))}'"
```

Body обеих HTTP-ответов дословно:

```text
{
  "ok": true,
  "role": "admin",
  "factorRequired": null,
  "error": null
}
{
  "fetchedAt": "2026-09-15T06:26:35.660Z",
  "webappDb": "up",
  "integratorApi": {
    "status": "ok",
    "db": "up"
  },
  "mediaPreview": {
    "status": "degraded",
    "stalePendingCount": 1,
    "byMimeAndStatus": {
      "video/quicktime": {
        "pending": 0,
        "ready": 121,
        "failed": 0,
        "skipped": 0
      },
      "image/heic": {
        "pending": 1,
        "ready": 0,
        "failed": 0,
        "skipped": 0
      },
      "image/heif": {
        "pending": 0,
        "ready": 0,
        "failed": 0,
        "skipped": 0
      }
    }
  },
  "videoTranscode": {
    "status": "ok",
    "pipelineEnabled": true,
    "reconcileEnabled": true,
    "pendingCount": 0,
    "processingCount": 0,
    "doneLastHour": 0,
    "failedLastHour": 0,
    "doneLast24h": 0,
    "failedLast24h": 0,
    "doneLifetime": 152,
    "failedLifetime": 0,
    "avgProcessingMsDoneLastHour": null,
    "oldestPendingAgeSeconds": null,
    "legacyReconcileCandidateCountWithinSizeCap": 0,
    "readableVideoReadyWithHlsCount": 151,
    "lastReconcileTick": {
      "jobKey": "media_transcode.reconcile",
      "jobFamily": "media",
      "lastStatus": "success",
      "lastFinishedAt": "2026-09-15T09:20:01.723+03:00",
      "lastSuccessAt": "2026-09-15T09:20:01.723+03:00",
      "lastFailureAt": null,
      "lastDurationMs": 26,
      "lastError": null,
      "metaJson": {}
    }
  },
  "outgoingDelivery": {
    "dueBacklog": 0,
    "deadTotal": 0,
    "blockedRecipientTotal": 182,
    "oldestDueAgeSeconds": null,
    "dueByChannel": {
      "max": 0,
      "sms": 0,
      "email": 0,
      "telegram": 0,
      "web_push": 0,
      "bot_message": 0
    },
    "dueByKind": {
      "reminder_dispatch": 0
    },
    "deadByKind": {
      "reminder_dispatch": 0
    },
    "processingCount": 0,
    "lastSentAt": "2026-09-15T09:00:08.004168+03:00",
    "lastQueueActivityAt": "2026-09-15T09:00:08.004168+03:00"
  },
  "remindersPipeline": {
    "due": 0,
    "dead": 0,
    "processing": 0
  },
  "operatorIncidents": {
    "openCount": 0,
    "occurrenceCount": 0,
    "lastSeenAt": null,
    "outboundProviderOpenCount": 0,
    "outboundProviderAcknowledgedCount": 0
  },
  "cronJobs": {
    "status": "ok",
    "jobRows": 15,
    "nonOk": []
  },
  "probeOutbound": {
    "consecutiveFailRuns": 0
  },
  "probeStatuses": {
    "webappDb": "up",
    "integratorApi": "ok",
    "mediaPreview": "degraded",
    "videoPlayback": "ok",
    "videoPlaybackClient": "ok",
    "videoHlsProxy": "ok",
    "videoTranscode": "ok",
    "operatorIncidents": "ok",
    "operatorBackupJobs": "ok",
    "outgoingDelivery": "ok",
    "remindersPipeline": "ok",
    "webPush": "ok",
    "notificationDelivery": "ok",
    "cronJobs": "ok",
    "saasIsolation": "okay"
  }
}
```

`blockedRecipientTotal=182` — terminal recipient-blocked rows, которые по канону
`docs/ARCHITECTURE/OUTGOING_DELIVERY_QUEUE.md` не входят в operator `deadTotal` и не являются остановленной
очередью. Фактические признаки остановки здесь нулевые: `dueBacklog=0`, `deadTotal=0`, `processingCount=0`.

Штатный сброс preview-blocker дословно:

```bash
sudo journalctl -u bersoncarebot-webapp-test.service --since '2026-09-15 09:16:30' --no-pager --output=cat | rg 'stuck rows are queued again'
```

```text
{"level":30,"time":1789452999923,"service":"bersoncare-webapp","pid":2444397,"released":33,"tools":["heic_decoder"],"statuses":["blocked","failed"],"msg":"[mediaPreviewControl] the worker is up, stuck rows are queued again"}
```

Число повторных ошибок за фиксированное окно:

```bash
sudo journalctl -u bersoncarebot-media-worker-test.service --since '2026-09-15 09:16:30' --until '2026-09-15 09:23:00' --no-pager --output=cat | awk '/"msg":"preview_order_failed"/ {failed++} /"errorCode":"The specified key does not exist\."/ {missing++} END {printf "preview_order_failed=%d\nmissing_source_key=%d\n", failed+0, missing+0}'
```

```text
preview_order_failed=99
missing_source_key=99
```

Количество level 40/50 за то же фиксированное окно:

```bash
for unit in api scheduler webapp media-worker; do count=$(sudo journalctl -u "bersoncarebot-$unit-test.service" --since '2026-09-15 09:16:30' --until '2026-09-15 09:23:00' --no-pager --output=cat | awk '/"level":(40|50)/ {n++} END {print n+0}'); printf '%s=%s\n' "$unit" "$count"; done
```

```text
api=0
scheduler=0
webapp=99
media-worker=99
```

## Failed-юниты и systemd error journal

```bash
sudo systemctl --failed --no-legend --plain
```

```text
certbot.service            loaded failed failed Certbot
snap.certbot.renew.service loaded failed failed Service for snap application certbot.renew
```

Количество получено отдельной командой, а не подсчитано по памяти:

```bash
sudo systemctl --failed --no-legend --plain | awk 'NF {count++} END {print count+0}'
```

```text
2
```

```bash
sudo journalctl -u bersoncarebot-api-test.service -u bersoncarebot-scheduler-test.service -u bersoncarebot-webapp-test.service -u bersoncarebot-media-worker-test.service --since '2026-09-15 09:11:30' -p err --no-pager --output=short-iso
```

```text
-- No entries --
```

## НЕ СДЕЛАНО

- Прод (старый и новый) не читался и не изменялся.
- Полный CI не запускался: использован уже зелёный результат ведущего на этом SHA.
- Код, миграции, привилегии и данные TEST вручную не изменялись; база не очищалась, дамп не загружался, новая база
  не создавалась.
- `--reapply` и `--recover-stopped-access` не использовались.
- Ручных сбросов очередей/ошибок не выполнялось. Единственный сброс — штатный `releaseStuckMediaPreviews` на старте
  перезапущенного media-worker; он зафиксирован строкой `released=33` выше.
- Отсутствующие TEST S3 source keys для 33 preview-строк не восстанавливались и строки не удалялись. Это остаточная
  деградация TEST preview, а не причина остановки unit или delivery/transcode queue.
- Два посторонних failed Certbot unit не сбрасывались и не ремонтировались: это вне scope TEST-кода и не штатный
  worker recovery-path.
- Живая ручная UI-приёмка пользовательских сценариев не выполнялась; данный этап — только выкладка и runtime/queue
  verification.
- Строка независимого вердикта в `feat` не добавлялась: её должен записать ведущий.
