# Л4 — живая приёмка уведомления клиники на TEST, заход 3 — 15.09.2026

Authority: `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md`, «Очередь до цели», п. 4 —
«Л4 — уведомление клиники о новой заявке через `relayOutbound` (§8.8)».

Тестовый адрес заявки: `l4-round3-20260915@example.com`.

## Итог

**FAIL, при этом положительный след `relayOutbound` получен.** На TEST `bb91018eccefce272dd7159eed60586f6d69dc92`
путь без телефона дошёл до `201`, создал заявку `6ee81a38-77df-431a-8ce1-6817ec61b79b`, выбрал для единственного
owner тему `doctor_leads` и три канала, а Web Push-вызов оставил `relay-outbound: dispatched`, HTTP `200` и
точную berson-scoped idempotency-запись. Но при заполнении показываемого формой необязательного телефона тот же
финальный submit отвечает `500 lead_submit_failed`: lookup подтверждённого телефона идёт без объявленной
`tenant_service` relation-capability. Это достижимый дефект человеческого пути, поэтому зелёного вердикта нет.

Дополнительно уведомление не подтверждено как доставленное человеку: Telegram и MAX исчерпали по четыре попытки
с `502 dispatch failed`; Web Push provider сообщил `delivered=0, errors=0`, хотя relay ответил `200 dispatched`.
Код не исправлялся: граница работы — приёмка.

## Команды отката, записанные до настройки TEST

Исходное состояние из захода 2: exact override `berson/leads` отсутствует, у каталожной записи
`card_is_published=false`. Поэтому откат обеих разрешённых настроек:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test -v ON_ERROR_STOP=1 -c \"DELETE FROM public.saas_org_entitlement_overrides WHERE organization_id='a0000000-0000-4000-8000-000000000001'::uuid AND mechanic='leads'; UPDATE public.clinic_public_directory_entries SET card_is_published=false,updated_at=now() WHERE organization_id='a0000000-0000-4000-8000-000000000001'::uuid AND slug='berson';\""
```

## Настройка стенда

Все живые команды шли через обязательный общий замок. Исходный health и состояние перед первым изменением:

```bash
/home/dev/brain/host-orch/run-tests.sh "set -e; curl -fsS -H 'Host: test.therapysto.ru' http://127.0.0.1:6300/api/health; sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test -v ON_ERROR_STOP=1 -P pager=off -A -F '|' -c \"BEGIN; SELECT d.organization_id,d.slug,d.is_published,d.card_is_published,(SELECT count(*) FROM public.saas_org_entitlement_overrides ov WHERE ov.organization_id=d.organization_id AND ov.mechanic='leads') AS leads_override_count FROM public.clinic_public_directory_entries d WHERE d.organization_id='a0000000-0000-4000-8000-000000000001'::uuid AND d.slug='berson' FOR UPDATE; INSERT INTO public.saas_org_entitlement_overrides (organization_id,mechanic,enabled,quota,expires_at) VALUES ('a0000000-0000-4000-8000-000000000001'::uuid,'leads',true,NULL,NULL); UPDATE public.clinic_public_directory_entries SET card_is_published=true,updated_at=now() WHERE organization_id='a0000000-0000-4000-8000-000000000001'::uuid AND slug='berson'; COMMIT; SELECT d.organization_id,d.slug,d.is_published,d.card_is_published,ov.enabled,ov.quota,ov.expires_at FROM public.clinic_public_directory_entries d LEFT JOIN public.saas_org_entitlement_overrides ov ON ov.organization_id=d.organization_id AND ov.mechanic='leads' WHERE d.organization_id='a0000000-0000-4000-8000-000000000001'::uuid AND d.slug='berson';\""
```

Ответ:

```text
{"ok":true,"db":"up"}
organization_id|slug|is_published|card_is_published|leads_override_count
a0000000-0000-4000-8000-000000000001|berson|t|f|0
INSERT 0 1
UPDATE 1
organization_id|slug|is_published|card_is_published|enabled|quota|expires_at
a0000000-0000-4000-8000-000000000001|berson|t|t|t||
```

Единственный активный получатель перепроверен тем же запросом к `be_organization_members`,
`platform_users`, `user_contacts`: `owner|active|b0021a38-fb86-45e9-9aec-d85014e932d4|doctor|f|f|dimmdao@yandex.ru`.
Другие настройки, тариф, состав организации и TEST mode не менялись.

## Путь человека: визитка → форма → код → CAPTCHA → отправка

Одноразовый shell/Node-driver повторял HTTP-запросы `PublicLeadForm`; автоматическим UI-тестом не сохранялся.
Фактический порядок формы — сначала подтверждение почты, затем CAPTCHA, затем окончательная отправка.
Entrypoint обоих проходов:

```bash
/home/dev/brain/host-orch/run-tests.sh "bash /home/dev/dev-projects/bcb-wt-leads-reject/.tmp-live-l4-round3.sh"
```

### 1. Визитка и форма

```bash
curl -fsS --resolve test.therapygo.ru:443:127.0.0.1 -c "$cookie_jar" -b "$cookie_jar" -o "$tmp_dir/root.html" -w '%{http_code}' https://test.therapygo.ru/berson
curl -fsS --resolve test.therapygo.ru:443:127.0.0.1 -H 'Accept: application/json' -H 'X-Real-IP: 192.0.2.53' -c "$cookie_jar" -b "$cookie_jar" -o "$tmp_dir/fields.json" -w '%{http_code}' 'https://test.therapygo.ru/api/leads/public/form-fields?orgSlug=berson'
```

Ответ: `clinic_card_status=200`, `form_fields_status=200`. API вернул семь активных полей:
`last_name`, `first_name`, `patronymic`, `email` (required), `phone` (optional), `preferred_contact`,
`message` (required).

Первый submit тела формы (`orgSlug=berson`, кириллическое ФИО, email-marker, согласие ПДн,
`sourceSurface=public_page`) дословно:

```bash
curl -sS --resolve test.therapygo.ru:443:127.0.0.1 -X POST -H 'Content-Type: application/json' -H 'Origin: https://test.therapygo.ru' -H 'X-Real-IP: 192.0.2.53' -c "$cookie_jar" -b "$cookie_jar" --data-binary @"$tmp_dir/lead-body.json" -o "$tmp_dir/initial.json" -w '%{http_code}' https://test.therapygo.ru/api/leads/public/submit
```

Ответ: `403 {"ok":false,"error":"lead_email_verification_required"}` — ожидаемый переход к коду.

### 2. Код почты — штатно из TEST-БД read-only

Старт кода:

```bash
curl -sS --resolve test.therapygo.ru:443:127.0.0.1 -X POST -H 'Content-Type: application/json' -H 'Origin: https://test.therapygo.ru' -H 'X-Real-IP: 192.0.2.53' -c "$cookie_jar" -b "$cookie_jar" --data-binary @"$tmp_dir/otp-start.json" -o "$tmp_dir/otp-start-response.json" -w '%{http_code}' https://test.therapygo.ru/api/leads/public/email-otp/start
```

Ответ: `200`, `ok=true`, `retryAfterSeconds=60`. Код взят не из письма и не из логов, а этим точным
read-only запросом (значение кода в отчёт не сохранено):

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test -qAt -c "BEGIN READ ONLY; SELECT payload_json #>> '{intent,payload,authCode}' FROM public.outgoing_delivery_queue WHERE kind='auth_email_otp' AND payload_json #>> '{intent,payload,recipient,email}'='l4-round3-20260915@example.com' ORDER BY created_at DESC LIMIT 1; ROLLBACK;"
```

Ответ проверки формы результата: `otp_rows=1 otp_code_length=6`.

Подтверждение:

```bash
curl -sS --resolve test.therapygo.ru:443:127.0.0.1 -X POST -H 'Content-Type: application/json' -H 'Origin: https://test.therapygo.ru' -H 'X-Real-IP: 192.0.2.53' -c "$cookie_jar" -b "$cookie_jar" --data-binary @"$tmp_dir/otp-confirm.json" -o "$tmp_dir/otp-confirm-response.json" -w '%{http_code}' https://test.therapygo.ru/api/auth/email-otp/confirm
```

Ответ: `200 {"ok":true,"redirectTo":"/app/patient","role":"client"}`.

### 3. CAPTCHA

```bash
curl -fsS --resolve test.therapygo.ru:443:127.0.0.1 -X POST -H 'Content-Type: application/json' -H 'Origin: https://test.therapygo.ru' -H 'X-Real-IP: 192.0.2.53' -c "$cookie_jar" -b "$cookie_jar" --data '{"email":"l4-round3-20260915@example.com"}' https://test.therapygo.ru/api/leads/public/captcha
```

Ответ: `ok=true`, provider `altcha`, algorithm `PBKDF2/SHA-256`, cost `5000`, purpose `public_lead`,
identifier `lead-email:v1:9e83222e23c9883bb15b9b9b31e8f6577a48190d45c9c7ab8cd8957a4e62a42e`.
Одноразовый helper выполнил ровно клиентский `solveChallenge({challenge, deriveKey})` и передал base64 payload;
получилось `captcha_payload_bytes=836`.

### 4. Первый финальный submit — найден дефект телефона

Первое тело содержало показываемый формой необязательный `phone=+79990000315`. Та же команда финального submit:

```bash
curl -sS --resolve test.therapygo.ru:443:127.0.0.1 -X POST -H 'Content-Type: application/json' -H 'Origin: https://test.therapygo.ru' -H 'X-Real-IP: 192.0.2.53' -c "$cookie_jar" -b "$cookie_jar" --data-binary @"$tmp_dir/final-body.json" -o "$tmp_dir/final-response.json" -w '%{http_code}' https://test.therapygo.ru/api/leads/public/submit
```

Ответ:

```text
500 {"ok":false,"error":"lead_submit_failed","correlationId":"a4ae3eb0-1b1c-4c3e-bf79-877b526b32bb"}
```

Причина снята после cleanup точным journal-запросом:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n journalctl -u bersoncarebot-webapp-test.service -u bersoncarebot-api-test.service --since '2026-09-15 14:13:50' --until '2026-09-15 14:15:00' --no-pager -o cat | grep -F 'a4ae3eb0-1b1c-4c3e-bf79-877b526b32bb'"
```

Главная строка: `public_lead_submit_failed`; запрос ищет подтверждённый `phone,+79990000315` в
`user_contacts`, cause — `Missing declared webapp port capability: tenant_service`. Заявка не создалась.

### 5. Второй финальный submit — законный путь без необязательного телефона

После доказанной уборки путь повторён с тем же полем `phone`, оставленным пустым. Ответ той же команды:

```text
201 {"ok":true,"leadId":"6ee81a38-77df-431a-8ce1-6817ec61b79b"}
```

Read-only DB-проверка до удаления дала:

```text
id|organization_id|platform_user_id|submitted_email|status|source_surface
6ee81a38-77df-431a-8ce1-6817ec61b79b|a0000000-0000-4000-8000-000000000001|8712fd1c-9f61-4e50-80f6-573ac3020b8e|l4-round3-20260915@example.com|new|public_page
```

## Положительный след уведомления `doctor_leads`

Поскольку `LeadsService` запускает уведомление fire-and-forget, после HTTP `201` foreground-монитор ждал
полный штатный retry: `0s → 10s → 60s → 300s` для Telegram, затем столько же для MAX, затем Web Push.
Точный сбор всего события:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n journalctl -u bersoncarebot-webapp-test.service -u bersoncarebot-api-test.service --since '2026-09-15 14:16:30' --no-pager -o cat | grep -F 'bef2d131-d643-4c23-a33d-355f016d4aba'"
```

Положительные строки:

```text
event=doctor_staff_notify.channels orgId=a0000000-0000-4000-8000-000000000001 userId=b0021a38-fb86-45e9-9aec-d85014e932d4 topicCode=doctor_leads messageId=lead.created:6ee81a38-77df-431a-8ce1-6817ec61b79b selectedChannels=[web_push,telegram,max]
PRE_FORK_TEST_DELIVERY_ALLOWED intendedChannel=web_push orgId=a0000000-0000-4000-8000-000000000001
web_push_sent pushUserId=b0021a38-fb86-45e9-9aec-d85014e932d4 delivered=0 errors=0 deactivated=0
relay-outbound: dispatched channel=web_push messageId=lead.created:6ee81a38-77df-431a-8ce1-6817ec61b79b:push:b0021a38-fb86-45e9-9aec-d85014e932d4 recipient=b0021a…
request completed statusCode=200
```

До удаления DB также содержала положительный exact trace:

```text
key|status|response_body|scoped_to_berson
a0000000-0000-4000-8000-000000000001:a0000000-0000-4000-8000-000000000001:lead.created:6ee81a38-77df-431a-8ce1-6817ec61b79b:push:b0021a38-fb86-45e9-9aec-d85014e932d4:web_push:b0021a38-fb86-45e9-9aec-d85014e932d4|200|{}|t
```

Неуспешный остаток того же trace: Telegram — четыре `502 dispatch failed`, MAX — четыре
`502 dispatch failed`. Email среди выбранных каналов уведомления не было; Mailpit поэтому не заменяет trace.
OTP-письмо не успело дойти до ловушки до удаления очереди, но код был взят из DB штатным read-only запросом выше.

## Стена арендатора

Проверено не одной переписью стенда, а фактическим событием. Команда агрегации exact journal:

```bash
sudo -n journalctl -u bersoncarebot-webapp-test.service -u bersoncarebot-api-test.service --since '2026-09-15 14:16:30' --no-pager -o cat | grep -F '6ee81a38-77df-431a-8ce1-6817ec61b79b' | jq -Rsc 'split("\n") | map(select(length>0) | fromjson?) | {audience_events:[.[]|select(.event=="doctor_staff_notify.channels")|{orgId,userId,topicCode,selectedChannels}],relay_message_ids:[.[]|select(.messageId!=null)|.messageId]|unique,dispatched:[.[]|select(.msg=="relay-outbound: dispatched")|{channel,messageId,recipient}]}'
```

Результат содержит ровно один `audience_event`: `orgId=a000…0001`,
`userId=b0021a38-fb86-45e9-9aec-d85014e932d4`; все три channel message-id содержат того же owner,
а `dispatched` существует только для его Web Push. DB idempotency-key начинается с exact berson org id,
`scoped_to_berson=t`; запрос `event_keys_outside_org` до cleanup вернул `0`.

Дополнительный census фактического TEST:

```sql
SELECT count(*) AS other_org_active_owner_admins
FROM public.be_organization_members m
JOIN public.platform_users u ON u.id=m.platform_user_id
WHERE m.organization_id<>'a0000000-0000-4000-8000-000000000001'::uuid
  AND m.status='active' AND m.role IN ('owner','admin')
  AND u.role IN ('doctor','admin') AND u.merged_into_id IS NULL;
```

Ответ: `other_org_active_owner_admins=0`. То есть на текущих данных TEST чужой администратор отсутствует,
но доказательство не ограничено этим вакуозным числом: actual audience/relay trace выше содержит только owner
организации `berson`.

## Уборка и контрольный ноль

У каждого прохода был `trap`; он удалял exact Mailpit message по `To[].Address`, event traces, очередь,
заявку, CAPTCHA, созданного пользователя с каскадными OTP/contact/login rows и обе временные настройки.
После завершения fire-and-forget sender поздняя Web Push idempotency-строка была отдельно прочитана выше и удалена:

```sql
BEGIN;
DELETE FROM public.notification_delivery_attempts
WHERE event_id LIKE 'lead.created:6ee81a38-77df-431a-8ce1-6817ec61b79b%';
DELETE FROM integrator.idempotency_keys
WHERE key LIKE '%lead.created:6ee81a38-77df-431a-8ce1-6817ec61b79b%';
COMMIT;
```

Финальный read-only запрос:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test -v ON_ERROR_STOP=1 -P pager=off -A -F '|' -c \"BEGIN READ ONLY; WITH marker_users AS (SELECT platform_user_id FROM public.user_contacts WHERE contact_kind='email' AND value_normalized='l4-round3-20260915@example.com') SELECT (SELECT count(*) FROM public.leads WHERE submitted_email='l4-round3-20260915@example.com') AS leads,(SELECT count(*) FROM public.user_contacts WHERE contact_kind='email' AND value_normalized='l4-round3-20260915@example.com') AS contacts,(SELECT count(*) FROM public.platform_users WHERE id IN (SELECT platform_user_id FROM marker_users)) AS users,(SELECT count(*) FROM public.email_challenges WHERE email='l4-round3-20260915@example.com') AS email_challenges,(SELECT count(*) FROM public.email_send_cooldowns WHERE email_normalized='l4-round3-20260915@example.com') AS email_cooldowns,(SELECT count(*) FROM public.outgoing_delivery_queue WHERE payload_json::text LIKE '%l4-round3-20260915@example.com%') AS queued_deliveries,(SELECT count(*) FROM public.password_altcha_challenges WHERE identifier_key='lead-email:v1:9e83222e23c9883bb15b9b9b31e8f6577a48190d45c9c7ab8cd8957a4e62a42e') AS captcha_challenges,(SELECT count(*) FROM public.notification_delivery_attempts WHERE event_id LIKE 'lead.created:6ee81a38-77df-431a-8ce1-6817ec61b79b%') AS notification_attempts,(SELECT count(*) FROM integrator.idempotency_keys WHERE key LIKE '%lead.created:6ee81a38-77df-431a-8ce1-6817ec61b79b%') AS relay_idempotency; ROLLBACK;\""
```

Ответ:

```text
leads|contacts|users|email_challenges|email_cooldowns|queued_deliveries|captcha_challenges|notification_attempts|relay_idempotency
0|0|0|0|0|0|0|0|0
```

Контроль Mailpit командой
`curl -fsS 'http://127.0.0.1:8025/api/v1/messages?limit=200' | jq --arg email 'l4-round3-20260915@example.com' '{marker_messages:([.messages[]? | select(any(.To[]?; .Address==$email))]|length)}'`
дал `marker_messages=0`. Финальный health: `{"ok":true,"db":"up"}`.

## Что оставлено включённым

Ничего. Обе настройки возвращены в исходное состояние. Точный контроль тем же admin DB connection:

```text
card_is_published|leads_override_count
f|0
```

Команда снятия остаётся записанной в начале отчёта и идемпотентна для этого исходного состояния.

## НЕ СДЕЛАНО

- Не исправлен дефект lookup телефона / отсутствующей `tenant_service` capability: это приёмка.
- Не получено подтверждение доставки человеку: Telegram/MAX вернули `502`, Web Push provider — `delivered=0`.
- Не менялись тариф, workspace composition, состав организации, TEST mode, env или привилегии.
- Не применялись миграции; не поднимался второй Next-сервер.
- Не запускались автоматические UI-тесты и полный CI. Чужой CI, занявший host-lock во время ожидания journal,
  не запускался и не управлялся этим исполнителем.
- PROD не читался и не трогался.
- Строка вердикта в `feat` не записывалась.

## Строка вердикта для ведущего

```text
FAIL Л4 live TEST bb91018eccef: стенд был настроен только двумя разрешёнными обратимыми значениями и полностью восстановлен. Путь без телефона прошёл card=200 → fields=200 → OTP start/read-only DB code/confirm=200 → ALTCHA → submit=201, заявка 6ee81a38-77df-431a-8ce1-6817ec61b79b. Actual audience — ровно berson owner b0021a38-fb86-45e9-9aec-d85014e932d4, topic doctor_leads; Web Push оставил PRE_FORK_TEST_DELIVERY_ALLOWED, relay-outbound: dispatched, HTTP/idempotency status=200 и berson-scoped key, чужих recipient/event keys=0. Но заполнение показываемого необязательного телефона +79990000315 роняет финальный submit 500: phone lookup в user_contacts → Missing declared webapp port capability: tenant_service (correlation a4ae3eb0-1b1c-4c3e-bf79-877b526b32bb). Доставка человеку также не подтверждена: Telegram/MAX по 4×502, Web Push provider delivered=0/errors=0. Cleanup: leads=contacts=users=email_challenges=email_cooldowns=queued_deliveries=captcha_challenges=notification_attempts=relay_idempotency=0, Mailpit marker=0; card_is_published=false, leads override=0; health ok.
```
