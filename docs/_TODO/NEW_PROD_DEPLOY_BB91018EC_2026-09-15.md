ОТКАЗ

# Выкладка `bb91018ec` на новый PROD — 15.09.2026

Коммит `bb91018eccefce272dd7159eed60586f6d69dc92` выложен штатным blue/green-конвейером на новый PROD
`135.106.187.95`: активным стал `blue`, образ `therapysto-app:bb91018ec`, webapp/api healthy, scheduler и
media-worker работают на новом цвете. Однако единственный разрешённый deploy-вход завершился с кодом `1` на
финальном обязательном гейте журнала миграций. Причина в дословном выводе — deploy-пользователь не смог заменить
оставшийся root-owned `/tmp/bcb-journal-truth.sql`; поэтому достоверное сравнение журнала PROD с DEV не состоялось.
По правилу brief никакой ручной починки или повторения частей конвейера не выполнялось.

## Команда выкладки и её итог

Запущено из `/home/dev/dev-projects/BersonCareBot`:

```text
bash tools/deploy-prod-from-dev.sh bb91018eccefce272dd7159eed60586f6d69dc92
```

Значимый дословный вывод миграционного и deploy-этапов:

```text
==> снимаю срез базы перед миграциями
postgres-backup: writing /opt/backups/postgres/pre-migrations/unified_therapysto_prod_20260915_065137.dump.age
postgres-backup: done (pre-migrations)
==> applying migrations and reconciling privileges for bb91018ec
==> база therapysto_prod, окружение prod, мигратор therapysto_prod_migrator
==> 1/5 кластерные роли
NOTICE:  BCB_LEGACY_ROLE_QUARANTINE_RECONCILED
NOTICE:  BCB_SHARED_ROLE_BASELINE_RECONCILED
NOTICE:  BCB_SHARED_ROLE_BASELINE_VERIFIED
==> 2/5 реестр стены рождения отношений
==> 3/5 миграции вебаппа
COMMIT
Drizzle owner-ordered migration committed for "therapysto_prod": pending=11 total=226 reapplied=0 foreign-ledger-rows=4 relabeled=0 dropped-foreign=0 dropped-foreign-by-hash=0 unapplied=0
==> 4/5 миграции интегратора
integrator owner-ordered migrations current for "therapysto_prod": pending=0 eligible=1 total=1
==> 5/5 сверка прав
access reconcile committed: env=prod database=therapysto_prod; local admin socket=/run/postgresql
==> готово — схема и права соответствуют выложенному коммиту
==> bringing host cron in line with the background job manifest
background-jobs-cli --check: OK (30 artifacts из apps/webapp/src/modules/operator-health/backgroundJobManifest.ts)
background-jobs-cli --apply-installed (prod): расписание уже совпадает с manifest
==> starting blue on therapysto-app:bb91018ec (webapp + api)
==> waiting for blue to report healthy
    webapp and api are healthy
==> nginx now serves blue
==> stopping background processes on green
==> starting background processes on blue
 Container therapysto-blue-scheduler-1 Started
 Container therapysto-blue-webapp-1 Healthy
 Container therapysto-blue-media-worker-1 Started
==> retiring green
    removed old image therapysto-app:bdc9d5947
==> done — bb91018ec is live on blue
    if it misbehaves: rollback-prod
==> проверяю, что журнал миграций прода не врёт
scp: dest open "/tmp/bcb-journal-truth.sql": Permission denied
scp: failed to upload file /tmp/tmp.XhwMhbEyd4/journal-truth.sql to /tmp/bcb-journal-truth.sql
ОТКАЗ ГЕЙТА: выкатка прошла, но в базе прода нет того, что миграции обещали (список выше)
```

Exit code: `1`.

Read-only проверка причины отказа:

```text
$ ssh ... root@135.106.187.95 "ls -ld /tmp /tmp/bcb-journal-truth.sql"
drwxrwxrwt 14 root root  4096 Sep 15 06:55 /tmp
-rw-r--r--  1 root root 98905 Sep 15 00:57 /tmp/bcb-journal-truth.sql
```

Вердикт текста `ОТКАЗ ГЕЙТА` не переинтерпретирован как успех. При этом сообщение гейта про отсутствующие в базе
объекты не доказано: перед ним нет обещанного списка расхождений, а непосредственная ошибка — отказ `scp` до
запуска сравнения.

## Цвет, образ и синглтоны

До выкладки:

```text
$ ssh ... deploy@135.106.187.95 sudo -n /opt/therapysto/pipeline/therapysto-status
active colour : green
idle colour   : blue
live image    : therapysto-app:116334132
                THERAPYSTO_GIT_COMMIT=116334132
                THERAPYSTO_BUILD_TIME=2026-09-14T22:04:28Z
nginx sends to: 127.0.0.1:6202 127.0.0.1:3202

containers:
therapysto-green-scheduler-1  Up 8 hours  therapysto-app:116334132
therapysto-green-media-worker-1  Up 8 hours  therapysto-app:116334132
therapysto-green-webapp-1  Up 8 hours (healthy)  therapysto-app:116334132
therapysto-green-api-1  Up 8 hours (healthy)  therapysto-app:116334132
therapysto-jitsi-prod-web-1  Up 4 days  ghcr.io/jitsi/web:stable-11146-2
therapysto-jitsi-prod-jvb-1  Up 4 days  ghcr.io/jitsi/jvb:stable-11146-2
therapysto-jitsi-prod-jicofo-1  Up 4 days  ghcr.io/jitsi/jicofo:stable-11146-2
therapysto-jitsi-prod-prosody-1  Up 4 days  ghcr.io/jitsi/prosody:stable-11146-2
therapysto-jitsi-prod-coturn  Up 19 hours (healthy)  coturn/coturn:4.17.2-r0-debian
```

После выкладки:

```text
$ ssh ... deploy@135.106.187.95 sudo -n /opt/therapysto/pipeline/therapysto-status
active colour : blue
idle colour   : green
live image    : therapysto-app:bb91018ec
                THERAPYSTO_GIT_COMMIT=bb91018ec
                THERAPYSTO_BUILD_TIME=2026-09-15T06:37:14Z
nginx sends to: 127.0.0.1:6201 127.0.0.1:3201

containers:
therapysto-blue-scheduler-1  Up 54 seconds  therapysto-app:bb91018ec
therapysto-blue-media-worker-1  Up 54 seconds  therapysto-app:bb91018ec
therapysto-blue-webapp-1  Up About a minute (healthy)  therapysto-app:bb91018ec
therapysto-blue-api-1  Up About a minute (healthy)  therapysto-app:bb91018ec
therapysto-jitsi-prod-web-1  Up 4 days  ghcr.io/jitsi/web:stable-11146-2
therapysto-jitsi-prod-jvb-1  Up 4 days  ghcr.io/jitsi/jvb:stable-11146-2
therapysto-jitsi-prod-jicofo-1  Up 4 days  ghcr.io/jitsi/jicofo:stable-11146-2
therapysto-jitsi-prod-prosody-1  Up 4 days  ghcr.io/jitsi/prosody:stable-11146-2
therapysto-jitsi-prod-coturn  Up 20 hours (healthy)  coturn/coturn:4.17.2-r0-debian
```

Контейнеры и restart counters:

```text
$ ssh ... root@135.106.187.95 "docker inspect ..."
/therapysto-blue-api-1|status=running|restarts=0|health=healthy|image=therapysto-app:bb91018ec
/therapysto-blue-media-worker-1|status=running|restarts=0|health=n/a|image=therapysto-app:bb91018ec
/therapysto-blue-scheduler-1|status=running|restarts=0|health=n/a|image=therapysto-app:bb91018ec
/therapysto-blue-webapp-1|status=running|restarts=0|health=healthy|image=therapysto-app:bb91018ec
/therapysto-jitsi-prod-coturn|status=running|restarts=0|health=healthy|image=coturn/coturn:4.17.2-r0-debian@sha256:aa68aab64a3b929d57fc2924c98ea447bf996cf8dade2508e7b71eaf23f1f14e
/therapysto-jitsi-prod-jicofo-1|status=running|restarts=0|health=n/a|image=ghcr.io/jitsi/jicofo:stable-11146-2@sha256:a8d64e46eaa340751a2b5530a4abd4175adf05bff07e9775fc48daae6364cfe9
/therapysto-jitsi-prod-jvb-1|status=running|restarts=0|health=n/a|image=ghcr.io/jitsi/jvb:stable-11146-2@sha256:d7dc646d21af07530ae6acf1ace23ea4782445d0362004621a32a5a632a964e9
/therapysto-jitsi-prod-prosody-1|status=running|restarts=0|health=n/a|image=ghcr.io/jitsi/prosody:stable-11146-2@sha256:9e341b10134d947e49ca338b9efe8d70ac9d6e8d89d621da2246dfa79fe50363
/therapysto-jitsi-prod-web-1|status=running|restarts=0|health=n/a|image=ghcr.io/jitsi/web:stable-11146-2@sha256:4231d5ff7318ff71d12ffd41afc36adae3c319b40cf79cde39b009b0c68295dc
```

Итого: старый цвет `green` выведен, оба синглтона работают только на новом `blue`; restart-loop и упавших
контейнеров нет.

## Health и публичные хосты

```text
$ curl -sS --max-time 15 -w "\nHTTP %{http_code} remote=%{remote_ip}\n" https://therapysto.ru/api/health
{"ok":true,"db":"up"}
HTTP 200 remote=135.106.187.95
$ curl -sS --max-time 15 -w "\nHTTP %{http_code} remote=%{remote_ip}\n" https://www.therapysto.ru/api/health

HTTP 301 remote=135.106.187.95
$ curl -sS --max-time 15 -w "\nHTTP %{http_code} remote=%{remote_ip}\n" https://admin.therapysto.ru/api/health
{"ok":true,"db":"up"}
HTTP 200 remote=135.106.187.95
$ curl -sS --max-time 15 -w "\nHTTP %{http_code} remote=%{remote_ip}\n" https://therapygo.ru/api/health
{"ok":true,"db":"up"}
HTTP 200 remote=135.106.187.95
$ curl -sS --max-time 15 -w "\nHTTP %{http_code} remote=%{remote_ip}\n" https://www.therapygo.ru/api/health

HTTP 301 remote=135.106.187.95
$ curl -sS --max-time 15 -w "\nHTTP %{http_code} remote=%{remote_ip}\n" https://app.bersoncare.ru/api/health
{"ok":true,"db":"up"}
HTTP 200 remote=135.106.187.95
```

Проверка конечной точки двух штатных redirect-хостов:

```text
$ curl -sS -L --max-time 15 -w "\nHTTP %{http_code} effective=%{url_effective} remote=%{remote_ip}\n" https://www.therapysto.ru/api/health
{"ok":true,"db":"up"}
HTTP 200 effective=https://therapysto.ru/api/health remote=135.106.187.95
$ curl -sS -L --max-time 15 -w "\nHTTP %{http_code} effective=%{url_effective} remote=%{remote_ip}\n" https://www.therapygo.ru/api/health
{"ok":true,"db":"up"}
HTTP 200 effective=https://therapygo.ru/api/health remote=135.106.187.95
```

## Расписание

```text
$ ssh ... root@135.106.187.95 "cd /opt/therapysto/src && node deploy/host/background-jobs-cli.mjs --verify-installed --env prod"
background-jobs-cli --verify-installed (prod): OK
```

## Ошибки журналов нового цвета

Количество Pino-записей уровня error/fatal (`50`/`60`) считалось отдельно по полным логам каждого нового
контейнера с момента его запуска:

```text
therapysto-blue-webapp-1|pino_level_50_or_60=0
therapysto-blue-api-1|pino_level_50_or_60=0
therapysto-blue-scheduler-1|pino_level_50_or_60=0
therapysto-blue-media-worker-1|pino_level_50_or_60=0
```

Стартовые строки синглтонов и штатного reset preview:

```text
{"level":30,"time":1789455247899,"service":"bersoncare-webapp","pid":6,"released":1,"tools":["heic_decoder"],"statuses":["blocked","failed"],"msg":"[mediaPreviewControl] the worker is up, stuck rows are queued again"}
{"level":30,"time":1789455248186,"pid":7,"msg":"Scheduler lock acquired, starting resident scheduler+worker loop"}
{"level":30,"time":1789455247904,"pid":7,"hostname":"69bd85328305","tools":["heic_decoder"],"msg":"preview tools reported"}
```

В media-worker также были две Pino warning-записи уровня `40` о неуспехе первого ffmpeg HEIC decoder
(`moov atom not found`) и переходе на штатный ImageMagick fallback. Итоговая строка — `preview_order_done`, а
последующий DB-срез показывает `preview_ready=181`, failed/blocked `0`; это не error/fatal и не падение воркера.

## Блокеры по ошибкам — до

Команда (read-only, `psql -X -A -F '|'`, база `therapysto_prod`) выполнила перечисленные ниже `SELECT` над
`operator_job_status`, `outgoing_delivery_queue`, `media_files`, `media_transcode_jobs`.

```text
?column?|count
operator_jobs_last_failure|0
(1 row)
?column?|coalesce
operator_jobs_consecutive_cron_failures|0
(1 row)
?column?|coalesce
operator_jobs_consecutive_fail_runs|0
(1 row)
?column?|count
delivery_dead|186
delivery_pending|22
delivery_sent|1241
(3 rows)
?column?|count
delivery_due_backlog|0
(1 row)
?column?|count
delivery_operator_dead|4
(1 row)
?column?|count
delivery_blocked_recipient|182
(1 row)
?column?|count
delivery_stuck_processing_15m|0
(1 row)
?column?|count
preview_failed|1
preview_ready|180
(2 rows)
?column?|count
preview_stopped_failed_or_blocked|1
(1 row)
?column?|count
preview_stale_processing_15m|0
(1 row)
?column?|count
transcode_done|151
(1 row)
```

## Блокеры по ошибкам — после

Та же команда и те же `SELECT`:

```text
?column?|count
operator_jobs_last_failure|0
(1 row)
?column?|coalesce
operator_jobs_consecutive_cron_failures|0
(1 row)
?column?|coalesce
operator_jobs_consecutive_fail_runs|0
(1 row)
?column?|count
delivery_dead|186
delivery_pending|22
delivery_sent|1241
(3 rows)
?column?|count
delivery_due_backlog|0
(1 row)
?column?|count
delivery_operator_dead|4
(1 row)
?column?|count
delivery_blocked_recipient|182
(1 row)
?column?|count
delivery_stuck_processing_15m|0
(1 row)
?column?|count
preview_ready|181
(1 row)
?column?|count
preview_stopped_failed_or_blocked|0
(1 row)
?column?|count
preview_stale_processing_15m|0
(1 row)
?column?|count
transcode_done|151
(1 row)
```

Отдельная классификация четырёх `delivery_operator_dead`:

```text
failure_class|count
<null>|4
(1 row)
```

Их возраст и число попыток:

```text
rows|oldest_created_at|newest_created_at|min_attempts|max_attempts
4|2026-09-15 00:12:56.882591+00|2026-09-15 00:21:49.71587+00|1|6
(1 row)
```

Итог измерения:

- остановленные накопленными ошибками scheduled jobs: `0 → 0`;
- due backlog доставки: `0 → 0`;
- зависшие processing/dispatching доставки старше 15 минут: `0 → 0`;
- preview failed/blocked: `1 → 0`, сброшен и доведён до `ready` штатным startup-путём media-worker;
- stale preview processing старше 15 минут: `0 → 0`;
- restart-loop/failed containers: `0`;
- 182 `recipient_blocked_bot` — канонический terminal outcome получателя, не operator-dead и не застрявшая очередь;
- четыре historical `dead` без `failure_class` остались неизменными; очередь ими не заблокирована (`due=0`,
  `stuck=0`). Штатного автоматического пути повторной отправки для terminal `dead` в deploy/startup нет.

### Выполненные сбросы

```text
preview failed/blocked: штатный startup media-worker автоматически вернул 1 строку в очередь; строка успешно стала ready.
delivery queue: ручной сброс не выполнялся — due backlog=0 и stuck processing/dispatching=0.
scheduled jobs: ручной сброс не выполнялся — оба accumulated-failure счётчика=0 и last_failure=0.
```

## НЕ СДЕЛАНО

- Финальный migration-journal truth gate не пройден: сравнение PROD с честно мигрированной DEV не запустилось из-за
  root-owned `/tmp/bcb-journal-truth.sql`.
- Никакая ручная починка `/tmp`, повторный deploy, отдельный вызов частей конвейера или обход гейта не выполнялись.
- Rollback не выполнялся: выложенный PROD остался здоровым, а brief разрешает rollback только при нездоровом PROD.
- TEST-режим нового PROD не снимался и его настройки не менялись.
- Старый PROD, TEST и их базы не трогались; дампы между средами не переносились.
- Полный CI и автоматические UI-тесты не запускались согласно прямому запрету brief.
- Строка вердикта в очередь `feat` не записывалась.
