# TEST deploy `9b0a0d898` — 15.09.2026

## ИТОГ

- Code-only выкладка `feat/doctor-ui-rebuild` на существующий TEST завершилась штатным
  `deploy-test: PASS`; установлен точный SHA `9b0a0d8989c446ce6adf4a4540eed0e75a61afaa`.
- База `bersoncarebot_test` не пересоздавалась и не восстанавливалась. Канонический runner сообщил
  `pending=0`; privilege reconcile и обе проверки tenant wall прошли.
- `bersoncarebot-scheduler-test.service` и `bersoncarebot-media-worker-test.service` перезапущены и
  `active/running`. `cron.service` не перезапускался и остался `active/running`; 12 TEST-заданий
  совпадают с manifest, финальный `cronJobs.status=ok`.
- Штатный старт media-worker атомарно выпустил 33 строки из `blocked|failed`. После запуска точный
  read-only счёт `preview_status IN ('blocked','failed')` равен 0; все 33 строки находятся в `pending`.
- Три требуемые двери существуют. Для `transfer_staff_approved_platform_user_merge_data` установлены
  две сигнатуры, поэтому запрос вернул четыре строки для трёх имён.
- Шесть выбранных HTML-маршрутов кабинета врача и read-only API конфликтов отвечают `200`.
  `/api/doctor/leads` отвечает `403`, а не `500`: механика заявок на TEST выключена.
- Полноценная публичная заявка до `201` не проверена: единственный TEST-slug `berson` имеет
  `card_is_published=false` и не имеет `leads` override; form-fields отвечает `404`. Безопасный POST,
  не создающий данные, принимает корректное тело и отвечает ожидаемой первой дверью
  `403 lead_email_verification_required`. Это named blocker, а не успешная live-приёмка создания заявки.
- Transcript: `/var/log/bersoncarebot/deploy-test/deploy-test.20260915T194540Z.HeT7Gp.log`.

## Источник и установленный SHA

Команды:

```bash
git -C /home/dev/dev-projects/BersonCareBot status --short --branch
git -C /home/dev/dev-projects/BersonCareBot rev-parse feat/doctor-ui-rebuild
git -C /home/dev/dev-projects/BersonCareBot rev-parse 9b0a0d898
sudo -n -u deploy git -C /opt/projects/bersoncarebot-test rev-parse HEAD
```

Вывод до deploy:

```text
## feat/doctor-ui-rebuild...origin/feat/doctor-ui-rebuild
9b0a0d8989c446ce6adf4a4540eed0e75a61afaa
9b0a0d8989c446ce6adf4a4540eed0e75a61afaa
8ce3d6e6b10ac7ba9b980aa0d66784ed6942897a
```

Вывод после deploy:

```text
9b0a0d8989c446ce6adf4a4540eed0e75a61afaa
```

## Code-only deploy

Точная команда:

```bash
test "$(git -C /home/dev/dev-projects/BersonCareBot rev-parse feat/doctor-ui-rebuild)" = "9b0a0d8989c446ce6adf4a4540eed0e75a61afaa"
bash /home/dev/dev-projects/BersonCareBot/deploy/host/deploy-test.sh feat/doctor-ui-rebuild
```

Значимый вывод:

```text
deploy-test transcript: /var/log/bersoncarebot/deploy-test/deploy-test.20260915T194540Z.HeT7Gp.log
deploy-test: pre-flight — доказательство стены арендатора на bersoncarebot_test ДО остановки служб/миграций/сверки
# tests 3
# pass 3
# fail 0
Drizzle owner-ordered migration already current for "bersoncarebot_test": pending=0 total=227 verified-objects=398 foreign-ledger-rows=4
integrator owner-ordered migrations current for "bersoncarebot_test": pending=0 eligible=1 total=1
access reconcile committed: env=test database=bersoncarebot_test; local admin socket=/run/postgresql
port-context TEST env bootstrap: OK (secrets redacted)
deploy-test: доказательство стены арендатора на bersoncarebot_test (после сверки прав)
# tests 3
# pass 3
# fail 0
background-jobs-cli --check: OK (31 artifacts из apps/webapp/src/modules/operator-health/backgroundJobManifest.ts)
background-jobs-cli --apply-installed (test): расписание уже совпадает с manifest
saas_isolation_post_runtime_gate_ok status=okay coverage=complete active_unexplained=0 active_explained=0
E1 post-runtime coverage/read gate: OK
эталон: bcb_webapp_dev (278 обещаний) · цель: bersoncarebot_test (278)
область сверки: миграции коммита 9b0a0d8989c446ce6adf4a4540eed0e75a61afaa (227)
журнал цели не врёт: всё, что сбылось на эталоне, сбылось и здесь
deploy-test: PASS branch=feat/doctor-ui-rebuild head=9b0a0d8989 B0/post-B0 only
```

Проверка transcript:

```bash
rg -n '^FATAL:|^ERROR:|^curl: \([1-9]|^TEST writers remain stopped' /var/log/bersoncarebot/deploy-test/deploy-test.20260915T194540Z.HeT7Gp.log
```

```text
1139:curl: (7) Failed to connect to 127.0.0.1 port 6300 after 0 ms: Couldn't connect to server
```

Это ожидаемая первая health-попытка во время рестарта; скрипт продолжил retry и завершился `PASS`.
`FATAL`, `ERROR` и строки `TEST writers remain stopped` отсутствуют.

## Юниты и cron: до → после

Оба снимка сняты одной и той же внутренней командой через обязательный host-lock:

```bash
/home/dev/brain/host-orch/run-tests.sh "set -euo pipefail; date --iso-8601=seconds; for unit in bersoncarebot-scheduler-test.service bersoncarebot-media-worker-test.service cron.service; do echo UNIT=\$unit; sudo systemctl show \"\$unit\" --property=Id,LoadState,ActiveState,SubState,ActiveEnterTimestamp,ExecMainStartTimestamp,MainPID --no-pager; done; node deploy/host/background-jobs-cli.mjs --verify-installed --env test; jobs=\$(node deploy/host/background-jobs-cli.mjs --list --env test); printf 'manifest_test_jobs='; printf '%s\n' \"\$jobs\" | awk 'NF {count++} END {print count+0}'"
```

| Юнит | Состояние до | Время старта до | Состояние после | Время старта после |
|---|---|---|---|---|
| `bersoncarebot-scheduler-test.service` | `active/running`, PID 3761434 | `Tue 2026-09-15 22:03:54 MSK` | `active/running`, PID 3811910 | `Tue 2026-09-15 22:48:15 MSK` |
| `bersoncarebot-media-worker-test.service` | `active/running`, PID 3761560 | `Tue 2026-09-15 22:03:59 MSK` | `active/running`, PID 3812051 | `Tue 2026-09-15 22:48:19 MSK` |
| `cron.service` | `active/running`, PID 1039 | `Sat 2026-09-12 09:31:11 MSK` | `active/running`, PID 1039 | `Sat 2026-09-12 09:31:11 MSK` |

До deploy:

```text
2026-09-15T22:45:22+03:00
background-jobs-cli --verify-installed (test): OK
manifest_test_jobs=12
```

После deploy:

```text
2026-09-15T22:50:00+03:00
background-jobs-cli --verify-installed (test): OK
manifest_test_jobs=12
```

Финальная команда активности и health расписаний:

```bash
/home/dev/brain/host-orch/run-tests.sh "set -euo pipefail; for unit in bersoncarebot-scheduler-test.service bersoncarebot-media-worker-test.service cron.service; do printf '%s|' \"\$unit\"; sudo systemctl is-active \"\$unit\"; done; node deploy/host/background-jobs-cli.mjs --verify-installed --env test; probe_dir=\$(mktemp -d /tmp/bcb-test-final-health.XXXXXX); trap 'rm -rf -- \"\$probe_dir\"' EXIT; curl -fsS --max-time 30 --resolve admin.test.therapysto.ru:443:127.0.0.1 -c \"\$probe_dir/cookies.txt\" -H 'Content-Type: application/json' -H 'Origin: https://admin.test.therapysto.ru' -H 'Sec-Fetch-Site: same-origin' --data '{\"email\":\"dimmdao@gmail.com\",\"password\":\"123456testTEST\"}' https://admin.test.therapysto.ru/api/auth/email-password/login >/dev/null; curl -fsS --max-time 30 --resolve admin.test.therapysto.ru:443:127.0.0.1 -b \"\$probe_dir/cookies.txt\" https://admin.test.therapysto.ru/api/admin/system-health | jq -c '{fetchedAt,mediaPreview,cronJobs:{status:.cronJobs.status,nonOk:[.cronJobs.jobs[]|select(.status != \"ok\")|{id,status,reason,lastStatus,lastError}]}}'"
```

```text
bersoncarebot-scheduler-test.service|active
bersoncarebot-media-worker-test.service|active
cron.service|active
background-jobs-cli --verify-installed (test): OK
{"fetchedAt":"2026-09-15T19:50:55.402Z","mediaPreview":{"status":"degraded","stalePendingCount":1,"byMimeAndStatus":{"video/quicktime":{"pending":0,"ready":121,"failed":0,"skipped":0},"image/heic":{"pending":1,"ready":0,"failed":0,"skipped":0},"image/heif":{"pending":0,"ready":0,"failed":0,"skipped":0}}},"cronJobs":{"status":"ok","nonOk":[]}}
```

`cron.service` не должен рестартовать для перечитывания `/etc/cron.d`; штатный deploy сверяет и применяет
manifest-файлы. Его неизменившийся PID/timestamp показан явно, а фактическое расписание проверено CLI и health.

Проверка ошибок после deploy:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo journalctl -u bersoncarebot-api-test.service -u bersoncarebot-scheduler-test.service -u bersoncarebot-webapp-test.service -u bersoncarebot-media-worker-test.service --since '2026-09-15 22:45:40' -p err --no-pager --output=short-iso; printf 'failed_test_units='; for unit in bersoncarebot-api-test.service bersoncarebot-scheduler-test.service bersoncarebot-webapp-test.service bersoncarebot-media-worker-test.service; do sudo systemctl is-failed --quiet \"\$unit\" && printf '%s ' \"\$unit\" || true; done; printf '\n'"
```

```text
-- No entries --
failed_test_units=
```

## Error-blockers: хранилище, счёт и сброс

Поиск хранилища:

```bash
node /home/dev/brain/tools/code-search.mjs "preview blocker reset failure count media worker control" --repo bcb -k 30
```

Значимый результат:

```text
apps/webapp/src/infra/repos/pgMediaPreviewControl.ts
```

`releaseStuckMediaPreviews()` хранит состояние в `public.media_files.preview_status` и на старте worker
выполняет один `UPDATE ... WHERE preview_status = ANY(['blocked','failed']) RETURNING id`, одновременно
обнуляя `preview_attempts` и `preview_next_attempt_at`. Поэтому `released` — точный атомарный счёт строк
непосредственно перед сбросом, без гонки между отдельным SELECT и UPDATE.

Точная проверка выполненного сброса:

```bash
sudo journalctl -u bersoncarebot-webapp-test.service --since '2026-09-15 22:45:40' --no-pager --output=cat | rg 'stuck rows are queued again|worker is up'
```

```text
{"level":30,"time":1789501700335,"service":"bersoncare-webapp","pid":3811927,"released":33,"tools":["heic_decoder"],"statuses":["blocked","failed"],"msg":"[mediaPreviewControl] the worker is up, stuck rows are queued again"}
```

Контрольный счёт после:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test -v ON_ERROR_STOP=1 -P pager=off -A -F '|' -c \"BEGIN READ ONLY; SELECT 'error_blockers_after' AS metric,count(*) AS value FROM public.media_files WHERE preview_status IN ('blocked','failed'); SELECT preview_status,count(*) FROM public.media_files WHERE preview_status IN ('pending','blocked','failed') GROUP BY preview_status ORDER BY preview_status; ROLLBACK;\""
```

```text
BEGIN
metric|value
error_blockers_after|0
(1 row)
preview_status|count
pending|33
(1 row)
ROLLBACK
```

| Момент | `blocked|failed` |
|---|---:|
| Непосредственно перед атомарным reset | 33 (`released=33`) |
| После deploy | 0 (`SELECT count(*)`) |

За запуск media-worker успел получить отсутствующие TEST S3 keys. Команда:

```bash
sudo journalctl -u bersoncarebot-media-worker-test.service --since '2026-09-15 22:45:40' --no-pager --output=cat | awk '/"msg":"preview_order_failed"/ {failed++} /"errorCode":"The specified key does not exist\."/ {missing++} END {printf "preview_order_failed=%d\nmissing_source_key=%d\n", failed+0, missing+0}'
```

```text
preview_order_failed=33
missing_source_key=33
```

Строки остались повторно поставленными в `pending`, а не вернулись в error-blocker. Поэтому сброс выполнен,
но общий media-preview health остаётся `degraded`: исходные объекты в TEST S3 этим deploy не восстанавливались.

## Три двери решения врача

Read-only команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test -v ON_ERROR_STOP=1 -P pager=off -A -F '|' -c \"BEGIN READ ONLY; SELECT n.nspname AS schema_name,p.proname,pg_get_function_identity_arguments(p.oid) AS args,pg_get_userbyid(p.proowner) AS owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname IN ('transfer_staff_approved_platform_user_merge_data','refuse_staff_patient_medical_merge_conflict','read_staff_patient_medical_merge_refusal') ORDER BY p.proname,p.oid; ROLLBACK;\""
```

```text
schema_name|proname|args|owner
app|read_staff_patient_medical_merge_refusal|p_conflict_id uuid|app_seam_identity_lookup_owner
app|refuse_staff_patient_medical_merge_conflict|p_conflict_id uuid, p_actor_id uuid, p_doctor_comment text, p_support_requested boolean|app_seam_identity_lookup_owner
app|transfer_staff_approved_platform_user_merge_data|p_conflict_id uuid, p_target_user_id uuid, p_duplicate_user_id uuid, p_actor_id uuid|app_seam_identity_lookup_owner
app|transfer_staff_approved_platform_user_merge_data|p_conflict_id uuid, p_target_user_id uuid, p_duplicate_user_id uuid, p_actor_id uuid, p_doctor_comment text|app_seam_identity_lookup_owner
(4 rows)
```

Ни одна из функций не вызывалась.

## Живые маршруты кабинета врача

Вход выполнен штатной TEST owner-учёткой. Cookie jar создан в `mktemp` и удалён `trap`; cookie и payload
сессии не печатались. Точная команда маршрутов внутри host-lock:

```bash
probe_dir=$(mktemp -d /tmp/bcb-test-postdeploy.XXXXXX)
trap 'rm -rf -- "$probe_dir"' EXIT
doctor_login=$(curl -fsS --max-time 30 --resolve test.therapysto.ru:443:127.0.0.1 -c "$probe_dir/doctor-cookies.txt" -H 'Content-Type: application/json' -H 'Origin: https://test.therapysto.ru' -H 'Sec-Fetch-Site: same-origin' --data '{"email":"dimmdao@yandex.ru","password":"123456testTEST"}' https://test.therapysto.ru/api/auth/email-password/login)
printf 'doctor_login='; printf '%s\n' "$doctor_login" | jq -c '{ok,role,factorRequired,error}'
for path in /app/doctor /app/doctor/communications /app/doctor/broadcasts /app/doctor/patients /app/doctor/schedule /app/doctor/clinic/settings /api/doctor/account-merge-conflicts /api/doctor/leads; do
  code=$(curl -sS --max-time 30 --resolve test.therapysto.ru:443:127.0.0.1 -b "$probe_dir/doctor-cookies.txt" -o "$probe_dir/response" -w '%{http_code}' "https://test.therapysto.ru$path")
  bytes=$(wc -c < "$probe_dir/response")
  printf 'doctor_route|%s|%s|bytes=%s\n' "$path" "$code" "$bytes"
  test "$code" != 500
done
```

```text
doctor_login={"ok":true,"role":"doctor","factorRequired":null,"error":null}
doctor_route|/app/doctor|200|bytes=136212
doctor_route|/app/doctor/communications|200|bytes=83827
doctor_route|/app/doctor/broadcasts|200|bytes=113302
doctor_route|/app/doctor/patients|200|bytes=777859
doctor_route|/app/doctor/schedule|200|bytes=104619
doctor_route|/app/doctor/clinic/settings|200|bytes=77036
doctor_route|/api/doctor/account-merge-conflicts|200|bytes=79
doctor_route|/api/doctor/leads|403|bytes=194
```

`403` у `/api/doctor/leads` согласован с выключенной механикой и не является `500`. Решения врача,
POST/PATCH/DELETE и ссылки конкретных конфликтов не вызывались.

## Публичная заявка

Фактическая конфигурация TEST измерена read-only запросом:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test -v ON_ERROR_STOP=1 -P pager=off -A -F '|' -c \"BEGIN READ ONLY; SELECT d.slug,d.is_published,d.card_is_published,COALESCE(o.enabled::text,'no_override') AS leads_override FROM public.clinic_public_directory_entries d LEFT JOIN public.saas_org_entitlement_overrides o ON o.organization_id=d.organization_id AND o.mechanic='leads' ORDER BY d.slug; ROLLBACK;\""
```

```text
slug|is_published|card_is_published|leads_override
berson|t|f|no_override
(1 row)
```

Безопасные HTTP-пробы, не создающие пользователя, OTP или заявку:

```bash
fields_code=$(curl -sS --max-time 30 --resolve test.therapygo.ru:443:127.0.0.1 -H 'Accept: application/json' -H 'X-Real-IP: 192.0.2.91' -o "$probe_dir/fields.json" -w '%{http_code}' 'https://test.therapygo.ru/api/leads/public/form-fields?orgSlug=berson')
printf 'public_lead_fields|status=%s|body=' "$fields_code"; jq -c '{ok,error,fieldCount:(.fields|length?)}' "$probe_dir/fields.json"
submit_code=$(curl -sS --max-time 30 --resolve test.therapygo.ru:443:127.0.0.1 -X POST -H 'Content-Type: application/json' -H 'Origin: https://test.therapygo.ru' -H 'X-Real-IP: 192.0.2.91' --data '{"orgSlug":"berson","firstName":"Deploy","lastName":"Probe","email":"deploy-probe-20260915@example.com","phone":"","preferredContact":"email","messageText":"Проверка маршрута после выкладки","sourceSurface":"public_page","personalDataConsent":true}' -o "$probe_dir/submit.json" -w '%{http_code}' https://test.therapygo.ru/api/leads/public/submit)
printf 'public_lead_submit|status=%s|body=' "$submit_code"; jq -c . "$probe_dir/submit.json"
```

```text
public_lead_fields|status=404|body={"ok":false,"error":"not_found","fieldCount":0}
public_lead_submit|status=403|body={"ok":false,"error":"lead_email_verification_required"}
```

POST доказывает, что новый route установлен, разбирает корректный payload и доходит до обязательной двери
email verification без `500`. Он не доказывает создание заявки: при текущем entitlement/card state форма
публично недоступна, а дальнейший OTP/CAPTCHA/`201` создал бы данные.

## НЕ СДЕЛАНО

- Старый и новый PROD не читались, не проверялись и не изменялись.
- Полный CI и отдельные тестовые suites не запускались: использован уже принятый зелёный CI для точного SHA.
- TEST-БД не пересоздавалась, не очищалась и не восстанавливалась; dump/full-reset не запускались.
- Миграции из клонов, `--reapply` и `--recover-stopped-access` не использовались; штатный runner обнаружил
  `pending=0`.
- TEST mode не снимался, env и права вручную не менялись; привилегии приехали только штатным reconcile.
- Merge/refusal doors не вызывались, врачебные решения не нажимались.
- Пользователь, OTP и заявка не создавались. `card_is_published` и entitlement `leads` не менялись.
- Отсутствующие TEST S3 source keys не восстанавливались; 33 preview-строки не удалялись и не переводились
  вручную в другой статус.
- `cron.service` вручную не перезапускался: manifest уже совпадал, daemon был и остался активен.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

1. Разрешить ли отдельным действием включить на TEST для `berson` публичную карточку и механику `leads`,
   чтобы пройти весь безопасно-убираемый путь OTP → CAPTCHA → `201` → удалить созданные TEST-следы? Сейчас
   конфигурация даёт `404`, поэтому требование «публичная заявка принимается» доказано только до обязательной
   двери email verification, но не до создания заявки.
2. Нужно ли отдельно восстанавливать отсутствующие объекты в TEST S3 для 33 preview-строк? Error-blockers
   сброшены до нуля, cron health восстановился до `ok`, но media preview остаётся `degraded` и одна HEIC-строка
   отмечена как stale pending. Это отдельная data/storage работа, не code-only deploy.
