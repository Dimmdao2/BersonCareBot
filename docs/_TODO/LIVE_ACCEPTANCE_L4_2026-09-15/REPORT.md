# Л4 — живая приёмка уведомления клиники, DEV, 15.09.2026

Authority: `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md` §8.8 и очередь п. 4.

## Вердикт

**FAIL — сквозной путь не достиг создания заявки и `relayOutbound`.** На обязательном общем DEV
`http://127.0.0.1:5200` публичная форма и CAPTCHA доступны, первый submit штатно требует подтверждения
email, но дверь `POST /api/leads/public/email-otp/start` отвечает `503 auth_channel_disabled` до создания
пользователя, OTP и заявки.

Достижимое последствие: посторонний человек на общей DEV-поверхности не может подтвердить email и оставить
заявку; поэтому клиника не получает уведомление. По границе приёмки дефект не исправлялся.

## 1. Среда и исходное состояние

Host identity проверен до живых команд:

```bash
/home/dev/brain/host-orch/run-tests.sh "hostname -f; ip -4 -o addr show scope global"
```

```text
localhost
2: ens1    inet 151.241.228.122/24 ...
[2026-09-15T13:00:19+03:00] ... RELEASED test lock (rc=0, 0s)
```

Общий Next был единственным webapp; integrator до проверки не работал:

```bash
/home/dev/brain/host-orch/run-tests.sh "ss -ltnp '( sport = :5200 or sport = :4200 )'; curl -sS -D - -o /tmp/l4-health-body.$$ http://127.0.0.1:5200/api/me; sed -n '1,40p' /tmp/l4-health-body.$$; unlink /tmp/l4-health-body.$$"
```

```text
LISTEN 0 511 127.0.0.1:5200 ... users:(("next-server (v1",pid=2254475,fd=22))
HTTP/1.1 401 Unauthorized
content-type: application/json

{"ok":false,"error":"unauthorized"}
```

Процесс `2254475` запущен из `/home/dev/dev-projects/BersonCareBot/apps/webapp`; общий runtime и этот клон
стояли на одном SHA `f2b466e9a89499c3de8919109e979e649136080d`.

В DEV одна организация с публичным slug и одним активным `owner`/`admin`:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -A -F '|' -c \"BEGIN READ ONLY; SELECT o.id::text,o.title,c.slug,(SELECT count(*) FROM public.be_organization_members m WHERE m.organization_id=o.id AND m.status='active' AND m.role IN ('owner','admin')) AS active_owner_admins,(SELECT count(*) FROM public.be_organization_members m JOIN public.user_channel_bindings b ON b.user_id=m.platform_user_id AND b.bot_blocked_at IS NULL WHERE m.organization_id=o.id AND m.status='active' AND m.role IN ('owner','admin')) AS active_messenger_bindings,(SELECT count(*) FROM public.be_organization_members m JOIN public.user_web_push_subscriptions s ON s.user_id=m.platform_user_id WHERE m.organization_id=o.id AND m.status='active' AND m.role IN ('owner','admin')) AS push_subscriptions FROM public.be_organizations o JOIN public.organization_slug_claims c ON c.organization_id=o.id WHERE o.is_active ORDER BY o.title,c.slug; ROLLBACK;\""
```

```text
id|title|slug|active_owner_admins|active_messenger_bindings|push_subscriptions
a0000000-0000-4000-8000-000000000001|Точка Здоровья|tochka-zdorovya|1|2|1
(1 row)
```

До каждого захода контрольный exact-email запрос возвращал:

```text
leads|otp_queue|contacts
0|0|0
```

Тестовый адрес: `l4.accept.20260915.1302@example.com`. В `dimmdao@gmail.com` вход не выполнялся.

## 2. Публичная дверь

Для relay-пути внутри одного foreground host-lock временно поднимался только штатный integrator из общего
DEV-дерева; второй Next не запускался. Внешняя доставка DEV оставалась подавленной финальным environment-gate.
Entrypoint всего прохода:

```bash
/home/dev/brain/host-orch/run-tests.sh "bash /home/dev/dev-projects/bcb-wt-leads-reject/.tmp-live-acceptance-l4.sh"
```

Скрипт был временным инструментом приёмки, после прохода удалён; его trap останавливал process group integrator,
ждал завершения, очищал exact-ID данные и проверял остаток.

### 2.1 Чистая публичная сессия

```bash
curl -c /tmp/bcb-l4-live.lWfzwG/cookies.txt -b /tmp/bcb-l4-live.lWfzwG/cookies.txt http://127.0.0.1:5200/api/auth/dev-public
```

```text
HTTP/1.1 303 See Other
location: http://127.0.0.1:5200/app
set-cookie: bersoncare_webapp_session=; Path=/; Max-Age=0; HttpOnly; SameSite=lax
```

### 2.2 Форма клиники

```bash
curl -H 'X-Real-IP: 192.0.2.44' -H 'Accept: application/json' -c /tmp/bcb-l4-live.lWfzwG/cookies.txt -b /tmp/bcb-l4-live.lWfzwG/cookies.txt 'http://127.0.0.1:5200/api/leads/public/form-fields?orgSlug=tochka-zdorovya'
```

```text
HTTP/1.1 200 OK
content-type: application/json

{"ok":true,"fields":[{"id":"system:last_name","organizationId":"a0000000-0000-4000-8000-000000000001","formSurface":"leads","fieldKey":"last_name","fieldType":"last_name","label":"Фамилия","placeholder":null,"isRequired":false,"sortOrder":10,"isActive":true,"archivedAt":null},{"id":"system:first_name","organizationId":"a0000000-0000-4000-8000-000000000001","formSurface":"leads","fieldKey":"first_name","fieldType":"first_name","label":"Имя","placeholder":null,"isRequired":false,"sortOrder":20,"isActive":true,"archivedAt":null},{"id":"system:patronymic","organizationId":"a0000000-0000-4000-8000-000000000001","formSurface":"leads","fieldKey":"patronymic","fieldType":"free_text","label":"Отчество","placeholder":null,"isRequired":false,"sortOrder":30,"isActive":true,"archivedAt":null},{"id":"system:email","organizationId":"a0000000-0000-4000-8000-000000000001","formSurface":"leads","fieldKey":"email","fieldType":"email","label":"Email","placeholder":null,"isRequired":true,"sortOrder":40,"isActive":true,"archivedAt":null},{"id":"system:phone","organizationId":"a0000000-0000-4000-8000-000000000001","formSurface":"leads","fieldKey":"phone","fieldType":"phone","label":"Телефон","placeholder":null,"isRequired":false,"sortOrder":50,"isActive":true,"archivedAt":null},{"id":"system:preferred_contact","organizationId":"a0000000-0000-4000-8000-000000000001","formSurface":"leads","fieldKey":"preferred_contact","fieldType":"free_text","label":"Как связаться","placeholder":null,"isRequired":false,"sortOrder":60,"isActive":true,"archivedAt":null},{"id":"system:message","organizationId":"a0000000-0000-4000-8000-000000000001","formSurface":"leads","fieldKey":"message","fieldType":"problem_description","label":"Чем можем помочь","placeholder":null,"isRequired":true,"sortOrder":70,"isActive":true,"archivedAt":null}]}
```

### 2.3 Первый submit, как из формы

Тело содержало `orgSlug=tochka-zdorovya`, ФИО на кириллице, тестовый телефон, указанный email, сообщение,
`sourceSurface=public_page` и `personalDataConsent=true`.

```bash
curl -X POST -H 'Content-Type: application/json' -H 'Origin: http://127.0.0.1:5200' -H 'X-Real-IP: 192.0.2.44' -c /tmp/bcb-l4-live.lWfzwG/cookies.txt -b /tmp/bcb-l4-live.lWfzwG/cookies.txt --data-binary @/tmp/bcb-l4-live.lWfzwG/lead-body.json http://127.0.0.1:5200/api/leads/public/submit
```

```text
HTTP/1.1 403 Forbidden
content-type: application/json
x-bc-correlation-id: f06ce74c-1249-4f0a-a155-9c0a44bf817e

{"ok":false,"error":"lead_email_verification_required"}
```

Это ожидаемый переход формы к подтверждению email.

### 2.4 Блокирующий ответ OTP-двери

```bash
curl -X POST -H 'Content-Type: application/json' -H 'Origin: http://127.0.0.1:5200' -H 'X-Real-IP: 192.0.2.44' -c /tmp/bcb-l4-live.lWfzwG/cookies.txt -b /tmp/bcb-l4-live.lWfzwG/cookies.txt --data-binary @/tmp/bcb-l4-live.lWfzwG/otp-start.json http://127.0.0.1:5200/api/leads/public/email-otp/start
```

Полный ответ с требуемыми заголовками:

```text
HTTP/1.1 503 Service Unavailable
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
x-bc-correlation-id: 6faf26f7-18d0-44c6-9808-6115efabc79c
vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch
content-type: application/json
Date: Tue, 15 Sep 2026 10:06:01 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked

{"ok":false,"error":"auth_channel_disabled"}
```

Первый предварительный вызов без браузерного `Origin` был отдельно отвергнут CSRF-гейтом:

```text
HTTP/1.1 403 Forbidden
x-bc-correlation-id: 013c45fb-1db8-46ed-b4f7-57b097ca4e2c
{"ok":false,"error":"csrf_origin_forbidden"}
```

После добавления точного `Origin` получен уже продуктовый отказ выше; предварительный заход ничего не создал,
его восемь контрольных счётчиков также были нулевыми.

### 2.5 Код в базе не родился

Штатный read-only запрос, которым код должен был быть получен на DEV:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -q -A -t -c "BEGIN READ ONLY; SELECT payload_json #>> '{intent,payload,authCode}' FROM public.outgoing_delivery_queue WHERE kind='auth_email_otp' AND payload_json #>> '{intent,payload,recipient,email}'='l4.accept.20260915.1302@example.com' ORDER BY created_at DESC LIMIT 1; ROLLBACK;"
```

```text
<пусто>
```

Причина подтверждена фактическими настройками:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -A -F '|' -c \"BEGIN READ ONLY; SELECT key,scope,organization_id::text,value_json FROM public.system_settings WHERE key IN ('auth_surface_patient_email_enabled','auth_email_enabled') OR key LIKE 'auth_surface%email%enabled' ORDER BY key,organization_id NULLS FIRST; ROLLBACK;\""
```

```text
key|scope|organization_id|value_json
auth_email_enabled|admin||{"value": true}
auth_surface_patient_email_enabled|admin||{"value": true}
auth_surface_platform_admin_email_enabled|admin||{"value": true}
auth_surface_staff_email_enabled|admin||{"value": false}
(4 rows)
```

`apps/webapp/.env.dev` содержит `APP_BASE_URL=http://127.0.0.1:5200` и не содержит
`PATIENT_APP_ORIGIN`; `config/env.ts` подставляет в этом случае `PATIENT_APP_ORIGIN=APP_BASE_URL`.
`requestSurface.ts` для deliberate shared Host выбирает `staff` раньше `patient_default`, а OTP-route передаёт
этот surface в `isAuthChannelEnabled`. Поэтому публичная заявка на предписанном DEV Host попадает под выключенную
staff email-policy, несмотря на включённую patient email-policy.

## 3. CAPTCHA

ALTCHA проверена отдельно тем же адресом и правильными браузерными заголовками:

```bash
/home/dev/brain/host-orch/run-tests.sh "curl -sS -i -X POST -H 'Content-Type: application/json' -H 'Origin: http://127.0.0.1:5200' -H 'X-Real-IP: 192.0.2.44' --data '{\"email\":\"l4.accept.20260915.1302@example.com\"}' http://127.0.0.1:5200/api/leads/public/captcha"
```

```text
HTTP/1.1 200 OK
content-type: application/json
x-bc-correlation-id: 8eed99f7-48a0-4e45-bd3d-aaeafd583bd7

{"ok":true,"provider":"altcha","challenge":{"parameters":{"algorithm":"PBKDF2/SHA-256","cost":5000,"data":{"challengeId":"6d320860-fccc-418c-8c50-959e81991f41","identifierKey":"lead-email:v1:7cca4c3da766c182594c0faa37ee2c78046784f57baea6e866c3686da94b5b14","purpose":"public_lead"},"expiresAt":1789467243,"keyLength":32,"keyPrefix":"fff4ff6950be6af1313dd849887e99ad","nonce":"f4458c5dc3d57d1b6406c2e2355d17e8","salt":"5cae0a6280fd7eb9ea58f0194bbe352f"},"signature":"119b97ff5260dc607727bb57ae91b1bf837bdd72c56551d0de19765df4d0ed20"},"expiresAt":"2026-09-15T10:14:03.275Z"}
```

Первая попытка очистки использовала неверно заранее вычисленный identifier hash и честно вернула `DELETE 0`;
после чтения фактического `challengeId` строка удалена точным составным условием:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -c \"DELETE FROM public.password_altcha_challenges WHERE challenge_id='6d320860-fccc-418c-8c50-959e81991f41'::uuid AND identifier_key='lead-email:v1:7cca4c3da766c182594c0faa37ee2c78046784f57baea6e866c3686da94b5b14';\" -A -t -c \"SELECT count(*) FROM public.password_altcha_challenges WHERE challenge_id='6d320860-fccc-418c-8c50-959e81991f41'::uuid OR identifier_key='lead-email:v1:7cca4c3da766c182594c0faa37ee2c78046784f57baea6e866c3686da94b5b14';\""
```

```text
DELETE 1
0
```

## 4. Положительный след уведомления

**Положительного следа нет, и это причина FAIL, а не пропущенное доказательство.** OTP не родился; сессия не
создана; final submit не был достижим; строка `public.leads` и ключи `integrator.idempotency_keys` с
`lead.created:<leadId>` не появились. Поэтому утверждать, что событие дошло до `relayOutbound`, кому оно было
адресовано и что integrator принял его, нельзя.

## 5. Стена арендатора

В фактическом DEV есть только одна постоянная организация, поэтому проверка «чужого администратора» выполнена
существующим живым DB proof. Он временно заводит вторую организацию и её активного owner, вызывает
`app.read_clinic_lead_notification_profiles(uuid,text)` под organization principal исходной клиники и проверяет:
свой активный admin входит вместе со способом доставки; врач, disabled/merged admin и active owner чужой клиники
не входят; прямой запрос чужой организации отвечает `lead_notification_organization_mismatch`. В `afterAll`
фикстура удаляется и residue assertion требует ноль.

```bash
/home/dev/brain/host-orch/run-tests.sh "bash -lc 'set -a; source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev; set +a; cd /home/dev/dev-projects/bcb-wt-leads-reject/apps/webapp; USE_REAL_DATABASE=1 RUN_LEAD_CLINIC_AUDIENCE_DB=1 pnpm exec vitest run --project fast src/infra/repos/leadClinicNotificationProfiles.devDbProof.test.ts'"
```

```text
RUN  v5.0.0 /home/dev/dev-projects/bcb-wt-leads-reject/apps/webapp
Test Files  1 passed (1)
Tests       2 passed (2)
Duration    1.89s (tests 97%, transform 1%, setup 1%)
[2026-09-15T13:09:21+03:00] ... RELEASED test lock (rc=0, 3s)
```

Это положительное доказательство живой DB-стены и профиля аудитории, но не подмена отсутствующего сквозного
notification trace: фактическая заявка остановилась раньше.

## 6. Уборка

Финальный контроль выполнен read-only запросом, тем же host-lock; рядом проверено, что временный integrator
остановлен, а единственный Next на `:5200` остался работать:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -A -F '|' -c \"BEGIN READ ONLY; SELECT (SELECT count(*) FROM public.leads WHERE submitted_email='l4.accept.20260915.1302@example.com') AS leads,(SELECT count(*) FROM public.outgoing_delivery_queue WHERE payload_json #>> '{intent,payload,recipient,email}'='l4.accept.20260915.1302@example.com') AS otp_queue,(SELECT count(*) FROM public.email_challenges WHERE email='l4.accept.20260915.1302@example.com') AS challenges,(SELECT count(*) FROM public.email_send_cooldowns WHERE email_normalized='l4.accept.20260915.1302@example.com') AS cooldowns,(SELECT count(*) FROM public.password_altcha_challenges WHERE identifier_key='lead-email:v1:7cca4c3da766c182594c0faa37ee2c78046784f57baea6e866c3686da94b5b14') AS captcha_rows,(SELECT count(*) FROM public.user_contacts WHERE contact_kind='email' AND value_normalized='l4.accept.20260915.1302@example.com') AS contacts,(SELECT count(*) FROM public.platform_users WHERE display_name='l4.accept.20260915.1302@example.com') AS users; SELECT (SELECT count(*) FROM public.be_organizations WHERE id='a4000000-0000-4000-8000-00000000f0b0'::uuid)+(SELECT count(*) FROM public.platform_users WHERE display_name LIKE 'AUDITL4 %')+(SELECT count(*) FROM public.user_channel_bindings WHERE external_id='AUDITL4-tg-own-admin') AS auditl4_fixture_rows; ROLLBACK;\"; ss -ltnp '( sport = :5200 or sport = :4200 )'"
```

```text
leads|otp_queue|challenges|cooldowns|captcha_rows|contacts|users
0|0|0|0|0|0|0
auditl4_fixture_rows
0
LISTEN 0 511 127.0.0.1:5200 ... users:(("next-server (v1",pid=2254475,fd=22))
[2026-09-15T13:09:49+03:00] ... RELEASED test lock (rc=0, 0s)
```

## НЕ СДЕЛАНО

- Код подтверждения не получен: OTP-route отказал до enqueue.
- Email не подтверждён, пользовательская сессия не создана.
- Форма не отправлена финально, заявка не создана.
- Положительный `relayOutbound` trace, topic `doctor_leads`, фактические получатели события и integrator response
  не получены: событие не родилось.
- Дефект не исправлялся; миграции и привилегии не менялись.
- Полный CI, автоматические UI-тесты, TEST и оба PROD не запускались и не трогались.

## Строка вердикта для ведущего

`Л4 LIVE ACCEPTANCE — FAIL: на общем DEV 127.0.0.1 shared-Host резолвится как staff, staff email-policy выключена; /api/leads/public/email-otp/start отвечает 503 auth_channel_disabled, поэтому OTP, заявка и relayOutbound-событие не рождаются. ALTCHA 200, живая DB-стена аудитории 2/2 PASS, уборка 0.`
