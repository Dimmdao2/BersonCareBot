# Л4 — живая приёмка уведомления клиники на TEST, 15.09.2026

## Итог

**BLOCKED ДО СОЗДАНИЯ ЗАЯВКИ: safety-gate брифа сработал.** У единственной организации с публичным slug
`berson` единственный активный получатель роли `owner`/`admin` — живая учётная запись Дмитрия Берсона:
`b0021a38-fb86-45e9-9aec-d85014e932d4`, `dimmdao@yandex.ru`, Telegram `364943522`, MAX `89002800`, есть
Web Push. Все три идентификатора разрешены TEST allowlist, то есть уведомление не было бы подавлено стендом и
реально дошло бы этому человеку. Бриф требует: «Нашёл живого — останавливайся и пиши это в отчёт».

Заявка, OTP, CAPTCHA и `relayOutbound` не создавались и не вызывались. PROD, настройки TEST и миграции не
затрагивались.

## 1. Источник и состояние TEST

Источники операционных фактов: `docs/ARCHITECTURE/SERVER CONVENTIONS.md` § «Тест-окружение Therapysto /
TherapyGo», `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`, `deploy/HOST_DEPLOY_README.md` §
«Тест-деплой на 151.x», `deploy/host/deploy-test.sh`. Authority результата —
`docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md`, очередь, п. 4 и §8.8.

Дословная команда (живая read-only проба через общий замок):

```bash
/home/dev/brain/host-orch/run-tests.sh "hostname -I; printf '%s\n' '--- services ---'; for u in api scheduler webapp media-worker; do printf '%s=' \"$u\"; sudo systemctl is-active \"bersoncarebot-$u-test.service\"; done; printf '%s\n' '--- deployed head ---'; sudo -n -u deploy git -C /opt/projects/bersoncarebot-test rev-parse --short HEAD; printf '%s\n' '--- health ---'; curl -fsS --max-time 5 -H 'Host: test.therapysto.ru' http://127.0.0.1:6300/api/health; printf '\n%s\n' '--- published org recipients ---'; sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test -v ON_ERROR_STOP=1 -P pager=off -F ' | ' -A -c \"SELECT d.slug, o.id AS organization_id, o.title, m.role AS member_role, m.status AS member_status, u.id AS user_id, u.display_name, u.role AS platform_role, u.is_blocked, u.is_archived, COALESCE(e.value_normalized,'') AS primary_email, (e.confirmed_at IS NOT NULL) AS email_confirmed, COALESCE(tg.external_id,'') AS telegram_id, COALESCE(mx.external_id,'') AS max_id, EXISTS (SELECT 1 FROM public.user_web_push_subscriptions s WHERE s.user_id=u.id) AS has_web_push, COALESCE((SELECT jsonb_agg(jsonb_build_object('channel',p.channel_code,'enabled_notifications',p.is_enabled_for_notifications) ORDER BY p.channel_code) FROM public.user_channel_preferences p WHERE p.platform_user_id=u.id OR (p.platform_user_id IS NULL AND p.user_id=u.id::text)),'[]'::jsonb) AS channel_prefs, COALESCE((SELECT jsonb_agg(jsonb_build_object('channel',tp.channel_code,'enabled',tp.is_enabled) ORDER BY tp.channel_code) FROM public.user_notification_topic_channels tp WHERE tp.user_id=u.id AND tp.topic_code='doctor_leads'),'[]'::jsonb) AS doctor_leads_prefs FROM public.clinic_public_directory_entries d JOIN public.be_organizations o ON o.id=d.organization_id JOIN public.be_organization_members m ON m.organization_id=o.id AND m.status='active' AND m.role IN ('owner','admin') JOIN public.platform_users u ON u.id=m.platform_user_id AND u.role IN ('doctor','admin') AND u.merged_into_id IS NULL LEFT JOIN LATERAL (SELECT c.value_normalized,c.confirmed_at FROM public.user_contacts c WHERE c.platform_user_id=u.id AND c.contact_kind='email' AND c.is_primary=true LIMIT 1) e ON true LEFT JOIN LATERAL (SELECT b.external_id FROM public.user_channel_bindings b WHERE b.user_id=u.id AND b.channel_code='telegram' ORDER BY b.created_at DESC,b.external_id DESC LIMIT 1) tg ON true LEFT JOIN LATERAL (SELECT b.external_id FROM public.user_channel_bindings b WHERE b.user_id=u.id AND b.channel_code='max' ORDER BY b.created_at DESC,b.external_id DESC LIMIT 1) mx ON true WHERE d.is_published=true AND d.card_is_published=true AND o.is_active=true ORDER BY d.slug,m.role,u.id;\""
```

Ответ:

```text
151.241.228.122 172.31.9.1 10.9.0.1 172.17.0.1 172.19.0.1 172.30.110.1 172.18.0.1
--- services ---
api=active
scheduler=active
webapp=active
media-worker=active
--- deployed head ---
bb91018eccef
--- health ---
{"ok":true,"db":"up"}
--- published org recipients ---
(0 rows)
[2026-09-15T13:33:55+03:00] pid=2815732 RELEASED test lock (rc=0, 0s)
```

Первый запрос намеренно требовал одновременно `is_published=true` и `card_is_published=true`: строк нет. Чтобы
не объявлять получателей отсутствующими из-за слишком узкого фильтра, выполнен второй read-only запрос по всем
строкам публичного каталога.

## 2. Кто реально получил бы уведомление

Дословная команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test -v ON_ERROR_STOP=1 -P pager=off -F ' | ' -A -c \"SELECT d.slug,d.is_published,d.card_is_published,o.id AS organization_id,o.title,o.is_active,m.role AS member_role,m.status AS member_status,u.id AS user_id,u.display_name,u.role AS platform_role,u.is_blocked,u.is_archived,COALESCE(e.value_normalized,'') AS primary_email,(e.confirmed_at IS NOT NULL) AS email_confirmed,COALESCE(tg.external_id,'') AS telegram_id,COALESCE(mx.external_id,'') AS max_id,EXISTS (SELECT 1 FROM public.user_web_push_subscriptions s WHERE s.user_id=u.id) AS has_web_push,COALESCE((SELECT jsonb_agg(jsonb_build_object('channel',p.channel_code,'enabled_notifications',p.is_enabled_for_notifications) ORDER BY p.channel_code) FROM public.user_channel_preferences p WHERE p.platform_user_id=u.id OR (p.platform_user_id IS NULL AND p.user_id=u.id::text)),'[]'::jsonb) AS channel_prefs,COALESCE((SELECT jsonb_agg(jsonb_build_object('channel',tp.channel_code,'enabled',tp.is_enabled) ORDER BY tp.channel_code) FROM public.user_notification_topic_channels tp WHERE tp.user_id=u.id AND tp.topic_code='doctor_leads'),'[]'::jsonb) AS doctor_leads_prefs FROM public.clinic_public_directory_entries d JOIN public.be_organizations o ON o.id=d.organization_id LEFT JOIN public.be_organization_members m ON m.organization_id=o.id AND m.status='active' AND m.role IN ('owner','admin') LEFT JOIN public.platform_users u ON u.id=m.platform_user_id AND u.role IN ('doctor','admin') AND u.merged_into_id IS NULL LEFT JOIN LATERAL (SELECT c.value_normalized,c.confirmed_at FROM public.user_contacts c WHERE c.platform_user_id=u.id AND c.contact_kind='email' AND c.is_primary=true LIMIT 1) e ON true LEFT JOIN LATERAL (SELECT b.external_id FROM public.user_channel_bindings b WHERE b.user_id=u.id AND b.channel_code='telegram' ORDER BY b.created_at DESC,b.external_id DESC LIMIT 1) tg ON true LEFT JOIN LATERAL (SELECT b.external_id FROM public.user_channel_bindings b WHERE b.user_id=u.id AND b.channel_code='max' ORDER BY b.created_at DESC,b.external_id DESC LIMIT 1) mx ON true ORDER BY d.slug,m.role,u.id;\""
```

Ответ:

```text
slug | is_published | card_is_published | organization_id | title | is_active | member_role | member_status | user_id | display_name | platform_role | is_blocked | is_archived | primary_email | email_confirmed | telegram_id | max_id | has_web_push | channel_prefs | doctor_leads_prefs
berson | t | f | a0000000-0000-4000-8000-000000000001 | Точка Здоровья | t | owner | active | b0021a38-fb86-45e9-9aec-d85014e932d4 | Дмитрий Берсон | doctor | f | f | dimmdao@yandex.ru | t | 364943522 | 89002800 | t | [{"channel": "web_push", "enabled_notifications": true}] | []
(1 row)
[2026-09-15T13:34:13+03:00] pid=2816094 RELEASED test lock (rc=0, 0s)
```

Это ровно аудитория функции `app.read_clinic_lead_notification_profiles(uuid,text)`: `member.status='active'`,
`member.role IN ('owner','admin')`, staff-роль `doctor/admin`, не merge-tombstone. Других строк каталога и других
подходящих получателей запрос не вернул. Пустой `doctor_leads_prefs` включает fallback темы из
`doctorTopicChannelDefaults.ts`: Web Push, Telegram и MAX; все три канала доступны у этой учётной записи.

Дополнительно проверено, подавит ли TEST эти exact адресаты. Значения env не печатались; выведены только булевы
сравнения.

Дословная команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u deploy bash -lc 'set -a; . /opt/env/bersoncarebot/api.test; set +a; node -e \"const csv=(v)=>new Set((v??\\\"\\\").split(\\\",\\\").map((x)=>x.trim()).filter(Boolean)); console.log(JSON.stringify({test:/^(1|true|yes)\$/i.test((process.env.TEST??\\\"\\\").trim()),telegramAllowed:csv(process.env.TEST_ACCOUNT_TELEGRAM_IDS).has(\\\"364943522\\\"),maxAllowed:csv(process.env.TEST_ACCOUNT_MAX_IDS).has(\\\"89002800\\\"),webPushAllowed:csv(process.env.TEST_ACCOUNT_WEB_PUSH_USER_IDS).has(\\\"b0021a38-fb86-45e9-9aec-d85014e932d4\\\")}));\"'"
```

Ответ:

```text
{"test":true,"telegramAllowed":true,"maxAllowed":true,"webPushAllowed":true}
[2026-09-15T13:35:02+03:00] pid=2817433 RELEASED test lock (rc=0, 0s)
```

Следствие: это не безопасная служебная учётка стенда, а живой человек, и TEST действительно пропустил бы все три
найденных адресата к провайдерам. Создавать заявку запрещено самим брифом.

Отдельный факт среды: `card_is_published=false`, поэтому корень `/{clinicSlug}` сейчас отдаёт вырожденную страницу
без формы заявки (`apps/webapp/src/app/[clinicSlug]/page.tsx` возвращается до `PublicLeadForm`). Widget-route
`/{clinicSlug}/lead` после safety-stop не запрашивался; этот факт не меняет главный блокер доставки.

## 3. Положительный след и стена арендатора

Положительный след `doctor_staff_notify.channels` → `relay-outbound: dispatched` и запись
`integrator.idempotency_keys` не создавался: safety-gate остановил сценарий до side effect. Поэтому утверждать,
что Л4 прошёл живую приёмку, нельзя.

Стена арендатора через фактическую отправку также не проверялась. Read-only census показал только одну
организацию публичного каталога, но это не заменяет требуемую проверку отсутствия чужой отправки после реального
события.

## 4. Уборка и контрольный ноль

Для сценария был зарезервирован адрес `l4-live-acceptance-20260915@example.com`, но ни одному endpoint он не
передавался. Первый контрольный запрос попытался вычислить SHA-256 через `digest()` в PostgreSQL и честно
отказал, потому что extension-функции в TEST нет:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test -v ON_ERROR_STOP=1 -P pager=off -F ' | ' -A -c \"WITH marker AS (SELECT 'l4-live-acceptance-20260915@example.com'::text AS email), marker_users AS (SELECT c.platform_user_id FROM public.user_contacts c, marker m WHERE c.contact_kind='email' AND c.value_normalized=m.email) SELECT (SELECT count(*) FROM public.leads l, marker m WHERE l.submitted_email=m.email) AS leads, (SELECT count(*) FROM public.user_contacts c, marker m WHERE c.contact_kind='email' AND c.value_normalized=m.email) AS contacts, (SELECT count(*) FROM public.platform_users u WHERE u.id IN (SELECT platform_user_id FROM marker_users)) AS users, (SELECT count(*) FROM public.email_challenges c, marker m WHERE c.email=m.email) AS email_challenges, (SELECT count(*) FROM public.email_send_cooldowns c, marker m WHERE c.email_normalized=m.email) AS email_cooldowns, (SELECT count(*) FROM public.outgoing_delivery_queue q, marker m WHERE q.payload_json::text LIKE '%' || m.email || '%') AS queued_deliveries, (SELECT count(*) FROM public.password_altcha_challenges a, marker m WHERE a.identifier_key='lead-email:v1:' || encode(digest(m.email,'sha256'),'hex')) AS captcha_challenges, (SELECT count(*) FROM integrator.idempotency_keys k JOIN public.leads l ON k.key LIKE '%lead.created:' || l.id::text || '%' JOIN marker m ON l.submitted_email=m.email) AS relay_idempotency;\""
```

Ответ:

```text
ERROR:  function digest(text, unknown) does not exist
[2026-09-15T13:35:17+03:00] pid=2817899 RELEASED test lock (rc=1, 0s)
```

Hash для exact CAPTCHA identifier получен без базы:

```bash
printf %s 'l4-live-acceptance-20260915@example.com' | sha256sum
```

Ответ:

```text
4ad42d576d0341bfe987dd72336a0ba7df730c51ea13065030914a6ba5ffc68a  -
```

Исправленная контрольная команда через замок:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test -v ON_ERROR_STOP=1 -P pager=off -F ' | ' -A -c \"WITH marker AS (SELECT 'l4-live-acceptance-20260915@example.com'::text AS email), marker_users AS (SELECT c.platform_user_id FROM public.user_contacts c, marker m WHERE c.contact_kind='email' AND c.value_normalized=m.email) SELECT (SELECT count(*) FROM public.leads l, marker m WHERE l.submitted_email=m.email) AS leads, (SELECT count(*) FROM public.user_contacts c, marker m WHERE c.contact_kind='email' AND c.value_normalized=m.email) AS contacts, (SELECT count(*) FROM public.platform_users u WHERE u.id IN (SELECT platform_user_id FROM marker_users)) AS users, (SELECT count(*) FROM public.email_challenges c, marker m WHERE c.email=m.email) AS email_challenges, (SELECT count(*) FROM public.email_send_cooldowns c, marker m WHERE c.email_normalized=m.email) AS email_cooldowns, (SELECT count(*) FROM public.outgoing_delivery_queue q, marker m WHERE q.payload_json::text LIKE '%' || m.email || '%') AS queued_deliveries, (SELECT count(*) FROM public.password_altcha_challenges a WHERE a.identifier_key='lead-email:v1:4ad42d576d0341bfe987dd72336a0ba7df730c51ea13065030914a6ba5ffc68a') AS captcha_challenges, (SELECT count(*) FROM integrator.idempotency_keys k JOIN public.leads l ON k.key LIKE '%lead.created:' || l.id::text || '%' JOIN marker m ON l.submitted_email=m.email) AS relay_idempotency;\""
```

Ответ:

```text
leads | contacts | users | email_challenges | email_cooldowns | queued_deliveries | captcha_challenges | relay_idempotency
0 | 0 | 0 | 0 | 0 | 0 | 0 | 0
(1 row)
[2026-09-15T13:35:34+03:00] pid=2818288 RELEASED test lock (rc=0, 0s)
```

Удалять было нечего; контрольный запрос доказывает ноль следов по зарезервированному exact адресу во всех
таблицах, которые создали бы OTP, сессию личности заявки, саму заявку, CAPTCHA, очередь и relay-idempotency.

## НЕ СДЕЛАНО

- Не создана заявка и не запущены CAPTCHA/OTP: обязательный safety-gate нашёл живого получателя.
- Не получен положительный след `relayOutbound`: side effect намеренно не инициирован.
- Не доказана стена арендатора фактическим событием: без события нечего сопоставлять с другой организацией.
- Не менялись код, миграции, права, TEST env/settings, данные существующих аккаунтов и публикация карточки.
- Не применялись миграции ни на DEV, ни на TEST; не поднимался второй Next-сервер.
- Полный CI и автоматические UI-тесты не запускались этим исполнителем.
- PROD не читался и не трогался.
- Строка вердикта в `feat` не записывалась.

## Строка вердикта для ведущего

```text
BLOCKED Л4 live TEST bb91018eccef: safety-gate до заявки нашёл единственного active owner/admin организации berson — живую учётку Дмитрия Берсона (dimmdao@yandex.ru); её Telegram, MAX и Web Push входят в TEST allowlist, поэтому уведомление ушло бы наружу по-настоящему. Заявка/OTP/CAPTCHA/relayOutbound не создавались; контрольный exact-запрос по l4-live-acceptance-20260915@example.com дал leads=0, contacts=0, users=0, email_challenges=0, email_cooldowns=0, queued_deliveries=0, captcha_challenges=0, relay_idempotency=0. Дополнительно card_is_published=false, поэтому публичный корень berson сейчас не несёт форму. Нужна безопасная служебная owner/admin учётка с достижимым TEST-каналом либо отдельное явное разрешение отправить Дмитрию; до этого положительный relayOutbound-след и tenant-wall не проверены.
```
