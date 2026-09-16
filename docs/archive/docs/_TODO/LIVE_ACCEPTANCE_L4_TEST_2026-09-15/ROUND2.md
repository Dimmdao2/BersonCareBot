# Л4 — живая приёмка уведомления клиники на TEST, заход 2, 15.09.2026

## Итог

**FAIL ДО CAPTCHA/OTP/ЗАЯВКИ.** Разрешение владельца на доставку учётке
`dimmdao@yandex.ru` принято: повторный census фактической аудитории нашёл ровно её и никого
другого. Однако пройти форму как человек на TEST невозможно:

- `https://test.therapygo.ru/berson` отвечает `200`, но не содержит формы, потому что у каталожной
  записи `is_published=true`, `card_is_published=false`;
- штатный URL формы/виджета из `publicBookPaths.leadsForSlug`,
  `https://test.therapygo.ru/berson/lead`, отвечает `404`;
- общая API-дверь этой формы
  `/api/leads/public/form-fields?orgSlug=berson` тоже отвечает `404 not_found`: у TEST-организации
  отсутствует override `leads`, а в её тарифе ключ `mechanics.leads` отсутствует, то есть механика
  выключена штатным тарифным гейтом.

По границам брифа каталог, тариф, override и настройки TEST не менялись. Поэтому CAPTCHA и OTP не
запрашивались, заявка не создавалась, `relayOutbound` не вызывался. Положительного следа доставки и
невакуозной проверки стены арендатора нет; это незакрытые критерии приёмки, а не PASS.

Authority: `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md`, «Очередь до цели», п. 4 —
«Л4 — уведомление клиники о новой заявке через `relayOutbound` (§8.8)».

Тестовый адрес, зарезервированный для прохода: `l4-round2-20260915@example.com`.

## 1. Состояние TEST и safety-gate получателя

Дословная команда (через обязательный общий замок):

```bash
/home/dev/brain/host-orch/run-tests.sh "hostname -I; for u in api scheduler webapp media-worker; do systemctl is-active \"bersoncarebot-\$u-test.service\"; done; sudo -n -u deploy git -C /opt/projects/bersoncarebot-test rev-parse HEAD; curl -fsS --max-time 5 -H 'Host: test.therapysto.ru' http://127.0.0.1:6300/api/health; sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test -v ON_ERROR_STOP=1 -P pager=off -A -F '|' -c \"SELECT d.slug,d.is_published,d.card_is_published,o.id AS organization_id,m.role,m.status,u.id AS user_id,u.role AS platform_role,u.is_blocked,u.is_archived,COALESCE(e.value_normalized,'') AS email,COALESCE(tg.external_id,'') AS telegram_id,COALESCE(mx.external_id,'') AS max_id,EXISTS (SELECT 1 FROM public.user_web_push_subscriptions s WHERE s.user_id=u.id) AS has_web_push FROM public.clinic_public_directory_entries d JOIN public.be_organizations o ON o.id=d.organization_id JOIN public.be_organization_members m ON m.organization_id=o.id AND m.status='active' AND m.role IN ('owner','admin') JOIN public.platform_users u ON u.id=m.platform_user_id AND u.role IN ('doctor','admin') AND u.merged_into_id IS NULL LEFT JOIN LATERAL (SELECT c.value_normalized FROM public.user_contacts c WHERE c.platform_user_id=u.id AND c.contact_kind='email' AND c.is_primary=true LIMIT 1) e ON true LEFT JOIN LATERAL (SELECT b.external_id FROM public.user_channel_bindings b WHERE b.user_id=u.id AND b.channel_code='telegram' ORDER BY b.created_at DESC,b.external_id DESC LIMIT 1) tg ON true LEFT JOIN LATERAL (SELECT b.external_id FROM public.user_channel_bindings b WHERE b.user_id=u.id AND b.channel_code='max' ORDER BY b.created_at DESC,b.external_id DESC LIMIT 1) mx ON true WHERE d.slug='berson' ORDER BY m.role,u.id; SELECT (SELECT count(*) FROM public.leads WHERE submitted_email='l4-round2-20260915@example.com') AS leads,(SELECT count(*) FROM public.user_contacts WHERE contact_kind='email' AND value_normalized='l4-round2-20260915@example.com') AS contacts,(SELECT count(*) FROM public.email_challenges WHERE email='l4-round2-20260915@example.com') AS challenges,(SELECT count(*) FROM public.email_send_cooldowns WHERE email_normalized='l4-round2-20260915@example.com') AS cooldowns;\"; curl -sS --resolve test.therapysto.ru:443:127.0.0.1 -o /dev/null -w 'root=%{http_code} lead=%{redirect_url}\\n' https://test.therapysto.ru/berson; curl -sS --resolve test.therapysto.ru:443:127.0.0.1 -o /dev/null -w 'lead=%{http_code}\\n' https://test.therapysto.ru/berson/lead"
```

Ответ:

```text
151.241.228.122 172.31.9.1 10.9.0.1 172.17.0.1 172.19.0.1 172.30.110.1 172.18.0.1
active
active
active
active
bb91018eccefce272dd7159eed60586f6d69dc92
{"ok":true,"db":"up"}
slug|is_published|card_is_published|organization_id|role|status|user_id|platform_role|is_blocked|is_archived|email|telegram_id|max_id|has_web_push
berson|t|f|a0000000-0000-4000-8000-000000000001|owner|active|b0021a38-fb86-45e9-9aec-d85014e932d4|doctor|f|f|dimmdao@yandex.ru|364943522|89002800|t
(1 row)
leads|contacts|challenges|cooldowns
0|0|0|0
(1 row)
root=404 lead=
lead=404
```

Последние две строки относятся к staff-host `test.therapysto.ru`. Это не публичная patient-поверхность,
поэтому ниже проверен целевой `test.therapygo.ru`.

Safety-gate пройден: фактический предикат аудитории Л4 вернул ровно один адресат — разрешённую владельцем
учётку `b0021a38-fb86-45e9-9aec-d85014e932d4` / `dimmdao@yandex.ru`. Другого получателя нет.

## 2. Публичная форма и штатный путь виджета

Дословная команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "set -e; email='l4-round2-20260915@example.com'; root_body=\$(mktemp); trap 'unlink \"\$root_body\"' EXIT; root_status=\$(curl -sS --resolve test.therapygo.ru:443:127.0.0.1 -o \"\$root_body\" -w '%{http_code}' https://test.therapygo.ru/berson); printf 'root_status=%s root_lead_form_markers=%s\\n' \"\$root_status\" \"\$(grep -o 'id=\"lead-form\"' \"\$root_body\" | wc -l)\"; printf 'canonical_widget_path_status='; curl -sS --resolve test.therapygo.ru:443:127.0.0.1 -o /dev/null -w '%{http_code}\\n' https://test.therapygo.ru/berson/lead; printf 'form_fields_status='; curl -sS --resolve test.therapygo.ru:443:127.0.0.1 -o /tmp/l4-r2-fields -w '%{http_code}\\n' 'https://test.therapygo.ru/api/leads/public/form-fields?orgSlug=berson'; tr -d '\\n' </tmp/l4-r2-fields; printf '\\n'; unlink /tmp/l4-r2-fields"
```

Ответ:

```text
root_status=200 root_lead_form_markers=0
canonical_widget_path_status=404
form_fields_status=404
{"ok":false,"error":"not_found"}
```

`root_lead_form_markers=0` — одноразовая проверка фактического HTML, не автоматический UI-тест.

Штатный путь найден по существующему генератору виджета:

```bash
sed -n '1,80p' apps/webapp/src/shared/publicBook/adminWidgetUrls.ts
sed -n '1,40p' apps/webapp/src/shared/publicBook/paths.ts
```

Значимые строки ответа:

```text
selection.surface === 'leads'
  ? publicBookPaths.leadsForSlug(selection.orgSlug)
leadsForSlug: (slug: string) => `/${encodeURIComponent(slug)}/lead`,
```

То есть предусмотренный продуктом URL — именно `/berson/lead`; обходного штатного URL формы нет.

## 3. Почему штатный путь недостижим

### 3.1. Patient surface не допускает `/{slug}/lead`

Проверен exact deployed checkout `bb91018eccefce272dd7159eed60586f6d69dc92`, а не только текущий клон.

Дословная команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u deploy rg -n \"/book|specialist|booking|/lead|pathname.startsWith\\('/api/'\\)\" /opt/projects/bersoncarebot-test/apps/webapp/src/config/surfaceRoutes.ts"
```

Ответ:

```text
76:    match: { kind: 'prefix', path: '/book' },
131:    match: { kind: 'pattern', pattern: /^\/[^/]+\/specialist\/[^/]+$/ },
136:    match: { kind: 'pattern', pattern: /^\/[^/]+(?:\/booking)?$/ },
188:  if (pathname === '/sw.js' || pathname.startsWith('/api/')) return true;
189:  if (pathname === '/book/embed.js') {
219:  if (path === '/booking') return publicBookPaths.forSlug(resolved.clinicSlug);
```

Правила для `/{slug}/lead` нет. Поэтому proxy возвращает `404` до страницы
`app/[clinicSlug]/lead/page.tsx`.

### 3.2. API формы закрыта выключенной механикой `leads`

Сначала был вызван runtime-root без требуемого attested context. Он честно отказал и доказательством
состояния механики не использован:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test -v ON_ERROR_STOP=1 -P pager=off -A -F '|' -c \"BEGIN READ ONLY; SELECT * FROM app.resolve_organization_mechanic_access('a0000000-0000-4000-8000-000000000001'::uuid,'leads'); ROLLBACK;\""
```

Ответ:

```text
ERROR:  accepted port context required
CONTEXT:  PL/pgSQL function require_attested_context_for_roles(name,name[]) line 31 at RAISE
SQL statement "SELECT app.require_attested_context_for_roles('app_seam_org_commerce_owner'::name, ARRAY['app_integrator_tenant_service'::name, 'app_patient'::name, 'app_staff'::name, 'app_tenant_service'::name]::name[])"
PL/pgSQL function app.resolve_organization_mechanic_access(uuid,text) line 6 at PERFORM
BEGIN
```

После этого состояние проверено read-only по источникам данных, без имитации runtime principal.

Дословная команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test -v ON_ERROR_STOP=1 -P pager=off -A -F '|' -c \"BEGIN READ ONLY; SELECT organization_id,mechanic,enabled,expires_at FROM public.saas_org_entitlement_overrides WHERE organization_id='a0000000-0000-4000-8000-000000000001'::uuid AND mechanic='leads'; SELECT o.id,o.tariff_id,t.name,t.mechanics->'leads' AS tariff_leads FROM public.be_organizations o LEFT JOIN public.saas_tariffs t ON t.id=o.tariff_id WHERE o.id='a0000000-0000-4000-8000-000000000001'::uuid; SELECT key,scope,organization_id,value_json FROM public.system_settings WHERE key='doctor_workspace_composition' AND (organization_id IS NULL OR organization_id='a0000000-0000-4000-8000-000000000001'::uuid) ORDER BY organization_id NULLS FIRST; ROLLBACK;\""
```

Ответ:

```text
BEGIN
organization_id|mechanic|enabled|expires_at
(0 rows)
id|tariff_id|name|tariff_leads
a0000000-0000-4000-8000-000000000001|d1156dc6-e71e-4225-ad94-93c9d423c9e1|ПОЛНЫЙ ДОСТУП - РАЗРАБОТЧИК|
(1 row)
key|scope|organization_id|value_json
(0 rows)
ROLLBACK
```

В deployed `withPublicLeadsAccess.ts` один общий гейт требует одновременно доступную тарифную механику
`leads` и включённую workspace composition. Отсутствующая composition совместимо означает `true`, но
отсутствующий `mechanics.leads` без override означает, что возможность в тарифе выключена. Это совпадает с
живым ответом API `404 not_found`.

## 4. CAPTCHA → код на почту → отправка

Не запускались. Это не пропуск: UI не выдаёт форму, canonical widget URL отвечает `404`, а общая API-дверь
полей отвечает `404`. Вызвать CAPTCHA/OTP напрямую после этого означало бы обойти тарифную и surface-границы,
то есть уже не пройти путь как человек.

## 5. Положительный след уведомления

**Положительного следа нет.** Заявка не родилась, поэтому не появились
`doctor_staff_notify.channels`, `lead.created:*`, `relay-outbound: dispatched` или provider response.

Финальная проверка journal и Mailpit выполнена вместе с cleanup-query в §7. `journalctl | grep` не вернул
ни одной строки, Mailpit дал `marker_messages=0`. «Ошибок не было» не выдано за доказательство отправки:
критерий положительного trace остаётся FAIL.

## 6. Стена арендатора

Фактической отправки не было ни разрешённому владельцу, ни кому-либо ещё. Дополнительный census
выполнен отдельным read-only запросом через общий замок.

Дословная команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test -v ON_ERROR_STOP=1 -P pager=off -A -F '|' -c \"BEGIN READ ONLY; SELECT count(*) AS other_org_active_owner_admins FROM public.be_organization_members m JOIN public.platform_users u ON u.id=m.platform_user_id WHERE m.organization_id<>'a0000000-0000-4000-8000-000000000001'::uuid AND m.status='active' AND m.role IN ('owner','admin') AND u.role IN ('doctor','admin') AND u.merged_into_id IS NULL; ROLLBACK;\""
```

Ответ:

```text
BEGIN
other_org_active_owner_admins
0
(1 row)
ROLLBACK
```

Это объясняет текущую аудиторию TEST, но **не заменяет** требуемую положительную проверку tenant wall после
реального события: на стенде нет администратора другой организации, а событие не создано. Критерий стены
арендатора в этом проходе не доказан.

## 7. Уборка и контрольный ноль

Hash exact CAPTCHA identifier:

```bash
printf %s 'l4-round2-20260915@example.com' | sha256sum
```

Ответ:

```text
f654754c29d72eb4fe566d9ae3ecd9f36d0bbfa2b44004a6847e441ef164ef2e  -
```

Дословная финальная команда через общий замок:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test -v ON_ERROR_STOP=1 -P pager=off -A -F '|' -c \"BEGIN READ ONLY; WITH marker(email) AS (VALUES ('l4-round2-20260915@example.com'::text)), marker_users AS (SELECT platform_user_id FROM public.user_contacts c,marker m WHERE c.contact_kind='email' AND c.value_normalized=m.email) SELECT (SELECT count(*) FROM public.leads l,marker m WHERE l.submitted_email=m.email) AS leads,(SELECT count(*) FROM public.user_contacts c,marker m WHERE c.contact_kind='email' AND c.value_normalized=m.email) AS contacts,(SELECT count(*) FROM public.platform_users u WHERE u.id IN (SELECT platform_user_id FROM marker_users)) AS users,(SELECT count(*) FROM public.email_challenges c,marker m WHERE c.email=m.email) AS email_challenges,(SELECT count(*) FROM public.email_send_cooldowns c,marker m WHERE c.email_normalized=m.email) AS email_cooldowns,(SELECT count(*) FROM public.outgoing_delivery_queue q,marker m WHERE q.payload_json::text LIKE '%'||m.email||'%') AS queued_deliveries,(SELECT count(*) FROM public.password_altcha_challenges a WHERE a.identifier_key='lead-email:v1:f654754c29d72eb4fe566d9ae3ecd9f36d0bbfa2b44004a6847e441ef164ef2e') AS captcha_challenges; ROLLBACK;\"; curl -sS 'http://127.0.0.1:8025/api/v1/messages?limit=200' | jq --arg email 'l4-round2-20260915@example.com' '{mailpit_total:.total,marker_messages:([.messages[]? | select((.|tostring)|contains(\$email))]|length)}'; journalctl -u bersoncarebot-webapp-test.service -u bersoncarebot-api-test.service --since '2026-09-15 13:49:00' --no-pager -o cat | grep -E 'l4-round2-20260915|lead.created|doctor_staff_notify.channels|relay-outbound: dispatched' || true"
```

Ответ:

```text
BEGIN
leads|contacts|users|email_challenges|email_cooldowns|queued_deliveries|captcha_challenges
0|0|0|0|0|0|0
(1 row)
ROLLBACK
{
  "mailpit_total": 35,
  "marker_messages": 0
}
```

После JSON строк журнала нет. Ничего удалять не пришлось: ни одна сущность сценария не была создана;
контрольный запрос администраторской ролью, без RLS-ложного нуля, доказал остаток `0` по exact адресу и
exact CAPTCHA identifier.

## НЕ СДЕЛАНО

- Не пройдены CAPTCHA и email OTP: форма и её API-дверь недостижимы на TEST.
- Не создана заявка и не вызван `relayOutbound`.
- Не получен положительный trace `doctor_leads` / `lead.created` / `relay-outbound: dispatched` / provider.
- Не доказана tenant wall фактическим событием; census других организаций сам по себе не заменяет событие.
- Не менялись каталог, тариф, entitlement override, workspace composition, состав организации или TEST env.
- Не исправлялись найденные дефекты: это приёмка.
- Не применялись миграции; не поднимался второй Next-сервер.
- Не запускались автоматические UI-тесты и полный CI.
- PROD не читался и не трогался.
- Строка вердикта в `feat` не записывалась.

## Строка вердикта для ведущего

```text
FAIL Л4 live TEST bb91018eccef: разрешённая аудитория подтверждена — ровно owner b0021a38-fb86-45e9-9aec-d85014e932d4 (dimmdao@yandex.ru), других получателей нет. Но человеческий путь до CAPTCHA не существует: test.therapygo.ru/berson = 200 без lead-form при card_is_published=false; штатный widget URL /berson/lead = 404 (в deployed surfaceRoutes нет правила /{slug}/lead); API form-fields = 404, потому что у организации berson нет override leads и assigned tariff не содержит mechanics.leads. Данные TEST по брифу не менялись; заявка/relayOutbound/provider trace не родились; exact cleanup — leads=0, contacts=0, users=0, email_challenges=0, email_cooldowns=0, queued_deliveries=0, captcha_challenges=0, Mailpit marker_messages=0. Tenant wall реальным событием не доказана.
```
