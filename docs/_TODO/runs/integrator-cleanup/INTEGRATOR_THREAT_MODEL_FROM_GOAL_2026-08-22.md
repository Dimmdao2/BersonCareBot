# Интегратор от цели: достижимость, необходимые права и реальная модель угроз

Дата проверки: 2026-08-22. Основание: `WORK_ORDER.md`, D17; постановка владельца от 22.08.

Это исследование фактического состояния. Код, конфигурация, БД и сервисы не изменялись; PROD не опрашивался.

## Итог

Да, текущую DB-схему доступа к интегратору переусложнили относительно обнаруженных угроз.

Сам интегратор на DEV и TEST слушает loopback, но живой TEST **не является полностью внутренним**: nginx сейчас
принимает интернет-трафик без IP allowlist и проксирует в интегратор `/health`, `/internal*`,
`/api/bersoncare*` и `/api/telegram*`. Входящие webhook-маршруты `/webhook/*` этим vhost не опубликованы.
Состояние TEST отличается от ожидаемого repo-managed шаблона с VPN allowlist.

На TEST Telegram работает через `getUpdates` (long polling): входящий HTTP-маршрут ему не нужен. MAX выключен:
API key и webhook secret есть, но обязательного `max_api_base_url` нет; polling-реализации MAX в коде нет.
Следовательно, для действующей конфигурации TEST публичный маршрут интегратора не нужен вообще.

Рекомендуемая граница проще:

1. интегратор остаётся на loopback;
2. M2M-маршруты webapp → integrator доступны только локально (или через отдельный внутренний listener/socket);
3. наружу публикуются только точные webhook-пути реально включённых провайдеров; для Telegram long polling — ни
   одного, для MAX — один путь после включения webhook;
4. провайдерские подписи/секреты, HMAC M2M, дедупликация и лимиты остаются обязательны;
5. в БД остаются отдельный login, `FORCE RLS`, минимальные column/table grants и узкая роль delivery worker;
6. `SECURITY DEFINER`-roots нужны для действительно привилегированных или атомарных операций, но не как
   обязательная оболочка каждого обычного tenant-read.

Цена упрощения: при компрометации процесса или его DB credentials злоумышленник сможет выполнять произвольный
SQL в пределах прямых grants и выбранного tenant-контекста, а не только заранее перечисленные функции. Это надо
компенсировать узкими grants, невозможностью `BYPASSRLS`/ownership, `FORCE RLS`, проверяемым tenant-контекстом и
разделением API и worker-прав. Нынешняя схема всё равно не устраняет takeover процесса: он обладает signer/runtime
контекстом и может последовательно открыть сколько угодно транзакций с разрешёнными roots.

## 1. Достижимость

### Фактическая матрица

| Среда | Прямая привязка процесса | Путь из интернета | Вывод |
|---|---|---|---|
| DEV на `151.241.228.122` | `127.0.0.1:4200` | В живом TEST-vhost маршрута на 4200 нет; порт снаружи не слушается | До DEV integrator напрямую из интернета не дотянуться. Доступ имеют процессы/пользователи хоста |
| TEST на `151.241.228.122` | `127.0.0.1:3300` | nginx слушает `0.0.0.0:80/443`, TEST-vhost сейчас содержит `allow all` и проксирует regex `^/(health\|internal\|api/bersoncare\|api/telegram)` на 3300 | Из интернета достижимы эти четыре префикса; сам 3300 не достижим напрямую |
| PROD `135.106.162.170` | По канону `127.0.0.1:3200` | По канону firewall оставляет снаружи 22/80/443, а nginx-домен `tgcarebot.bersonservices.ru` проксирует integrator | Прямой 3200 закрыт, HTTP integrator документирован публичным через nginx. Живое состояние и точный набор путей 22.08 не проверялись |

Для PROD использованы только `docs/ARCHITECTURE/SERVER CONVENTIONS.md` и
`deploy/HOST_DEPLOY_README.md`. PROD не трогался. Неизвестно: актуальный nginx-vhost, активный runtime mode
Telegram/MAX и фактические listeners/firewall на 2026-08-22.

### Что именно опубликовано на TEST

Живой `/etc/nginx/sites-available/test.bersoncare.ru` публикует интегратор только по regex выше. Это означает:

- `/health` проходит без application auth;
- `/api/bersoncare/*` проходит до route handlers, но state-changing handlers требуют HMAC и timestamp;
- `/webhook/telegram`, `/webhook/max`, `/webhook/vk` попадают не в интегратор, а в fallback webapp;
- прямое соединение с `151.241.228.122:3300` невозможно, потому что процесс слушает только loopback;
- host firewall не является дополнительной границей: `iptables INPUT` имеет policy `ACCEPT`, правил нет, UFW не
  установлен. Границу создают bind address и nginx.

В репозитории ожидаемая TEST-конфигурация nginx содержит VPN allowlist и `deny all`, но живая конфигурация временно
содержит `allow all` по owner-инструкции 22.08. Для оценки достижимости использовано живое состояние, не шаблон.

### Текущий режим каналов TEST

- Telegram: `long_polling`. В `system_settings` нет `telegram_mode`, а runtime default — `long_polling`.
  Journal фиксирует `Telegram: starting long-polling runner (getUpdates)`. Route `/webhook/telegram` в этом режиме
  интегратор вообще не регистрирует.
- MAX: выключен. Настроены `max_bot_api_key` и `max_webhook_secret`, но нет `max_api_base_url`, без которого
  `integrationRuntimeConfig` выставляет `enabled=false`. В коде MAX умеет только webhook, polling нет.

## 2. Что интегратор реально делает

| Функция | Вход / необходимые данные | Читает | Пишет / внешний эффект |
|---|---|---|---|
| Приём Telegram/MAX/VK events | Provider update, channel secret/token, provider user/chat/message IDs | Credential/binding, user identity, org, сценарий/контент, booking/reminder state | User/channel binding и телефон при подтверждённом flow; события и retry; ответы провайдеру |
| Исходящая доставка | org, recipient/channel, payload/template, idempotency/event ID | Channel credentials/bindings, recipient, queue item | Отправка Telegram/MAX/VK/email/SMS/web-push; attempt/status/retry; blocked marker |
| SMS/email/OTP по M2M | Подписанный webapp request, org/recipient/payload | Runtime provider config; нужные recipient/template данные | Внешняя отправка, audit/idempotency/delivery result |
| Contact request и relay | Подписанный request, org, destination, payload | Канал/получатель/credential | Сообщение оператору/пользователю, durable idempotency |
| Напоминания | Rule/occurrence/owner, due time, booking/patient context | Reminder rules/occurrences, recipient binding, часть booking/user данных | Materialization wake, queue item, occurrence status, delivery event |
| Booking lifecycle | Подписанное событие webapp | Booking/external ID и связанный recipient | Idempotent notification/event scheduling |
| Привязка канала и идентичности | Provider actor, org/channel context, start/contact flow | User/phone/binding/existing identity | `user.upsert`, binding, `user.phone.link` в разрешённых сценариях |
| Контент и сценарии бота | Actor/org, command/button/message | Content/scenario/menu, role/identity, access state | Content access grant, event/retry, ответ пользователю |
| Scheduler/worker | Clock/wake, queue state | Due reminders, outgoing queue, credentials | Claim/retry/finalize queue; delivery attempts; reminder delivery events |
| Операционная проверка | Scheduler tick и provider config | Config/health state | Probe/alert delivery и операционные логи |

Основные port-типы находятся в `apps/integrator/src/kernel/contracts/ports.ts`; DB operations — в
`apps/integrator/src/infra/db/readPort.ts` и `writePort.ts`; HTTP routes — в
`apps/integrator/src/app/routes.ts`; scheduler и worker — в `apps/integrator/src/infra/runtime/`.

Интегратор не является произвольным внешним CRUD API для медицинской карты. Но его текущая runtime DB-role
технически шире фактического кода: роль `app_tenant_service` имеет grants и на PII/medical/payment-related
отношения, которые перечислены в D17 Step 3 report. Именно эта разница между используемым и доступным создаёт
реальный impact при компрометации процесса.

## 3. Что опасно

### Сценарии по последствию

| Последствие | Реальный путь | Достижимо снаружи сейчас | Что нужно атакующему | Что он получает |
|---|---|---|---|---|
| Утечка PII/medical data | Компрометация процесса/OS-account либо DB credential и runtime tenant-context/signing capability | Не через найденный анонимный HTTP route. Да после compromise/secret theft | RCE/доступ к `bcb-api-test`, env/DB credentials или эквивалент | Широкие reads в пределах `app_tenant_service`; queue/payload/recipient data через worker role. Cross-tenant зависит от способности выпускать валидный context |
| Запись/подмена чужих данных | Поддельный provider event или подписанный M2M request; либо DB compromise | Анонимно — нет. С украденным provider secret или общим M2M secret — да на опубликованном пути | Соответствующий webhook secret/token или HMAC secret; для DB — credentials/context | Выполнение штатных write-flow: binding/phone/identity state, reminder/lifecycle/delivery state, внешняя отправка |
| Пересечение клиник | Подмена org в подписанном request либо компрометация DB context mechanism | Анонимно — нет | M2M signer или DB runtime signer/credential; ошибка RLS/root predicate | Чтение/запись данных другой организации в пределах доступных операций/grants |
| Массовая рассылка, spam, стоимость | Повторные/разные валидно подписанные send/relay/OTP requests; takeover worker/process | Да только после кражи M2M/provider credential или process compromise | Global M2M HMAC secret, provider credential либо runtime compromise | Массовые сообщения, блокировка bot account, SMS/email cost, репутационный ущерб |
| Availability/probing | Публичный `/health`, provider/M2M routes до auth | Да | Ничего | Сигнал живости/DB health; нагрузка на nginx/process/health query. PII не выдаётся |

### Разбор границ

1. **Анонимный интернет на TEST.** Из опубликованных routes без секрета полезен только `/health`. Обнаруженного
   анонимного пути прочитать PII или записать доменные данные нет. HMAC проверяется до M2M effect; webhook-пути
   вообще не проксируются.
2. **Украденный M2M secret.** Это реальная и более сильная угроза, чем произвольный SQL через named root:
   атакующий вызывает легитимные send/lifecycle/rule operations с выбранными аргументами. RLS не исправляет
   подлинный, но злонамеренный signed request.
3. **Украденный provider secret/token.** Позволяет подделывать входящие события или управлять ботом. Impact
   ограничивается реализованными bot-flow, но включает связывание actor/channel, сообщения и некоторые identity
   writes. Dedicated credential fingerprint сам по себе не секрет достаточной силы и должен применяться только
   вместе с проверкой provider secret/signature.
4. **Takeover процесса.** Здесь broad `app_tenant_service` — реальная опасность. One accepted context per
   transaction и function allowlist замедляют/структурируют злоупотребление, но не останавливают процесс, который
   может подписывать новый context и создавать новые транзакции.
5. **Delivery worker.** Даже узкая роль видит адресатов и payload очереди и может отправлять/переотправлять
   сообщения. Это достаточный blast radius для PII и массовой рассылки; ей не нужны grants на медицинские таблицы.

## 4. Минимально необходимые права

### HTTP/network

- API integrator: loopback listener; локальные M2M routes; наружу — только exact webhook route включённого
  провайдера.
- Scheduler/worker: входящий network listener не нужен; только исходящие provider API и DB.
- `/health`: локальный/monitor-only либо внешний, но дешёвый и без подробностей; rate/body limits на nginx.
- Разные secrets для provider webhook, M2M и каждого окружения; ротация без общего универсального credential.

### БД

Минимум следует делить по workload, а не выдавать всё `app_tenant_service`:

- request/API role: credential/binding/identity reads, строго необходимые booking/reminder/content reads;
  только перечисленные identity/binding/reminder/event writes;
- scheduler role: due rules/occurrences и materialization state, без произвольных user/medical reads;
- delivery worker role: queue claim/update, delivery attempts/events, минимальный recipient/channel lookup;
- отдельные elevated functions только для атомарной identity link/merge или иной операции, которой сознательно
  нужны права поверх RLS;
- все tenant relations — `FORCE RLS`; runtime roles не owner и без `BYPASSRLS`/superuser; tenant context задаётся
  transaction-locally и валидируется;
- никакого прямого grant всему `public.*`; grants — relation/column/action level.

На живом TEST base login `bcb_test_integrator` не имеет прямых relation grants в `public`; он `NOINHERIT` и может
`SET ROLE` в несколько workload roles. Это хорошая основа. Проблема — не наличие отдельного login, а сохранённый
доступ к широкой webapp-роли `app_tenant_service`.

### Что действует против реальных угроз

| Ограничение | Реальная польза | Предел |
|---|---|---|
| Loopback bind + точный nginx routing | Убирает весь не предназначенный для интернета attack surface | Живой TEST сейчас публикует лишние M2M prefixes; network location не заменяет auth |
| Provider secret/signature и M2M HMAC+timestamp | Останавливает анонимную подделку команд/events | Один украденный общий secret открывает все разрешённые операции своего класса |
| Idempotency/dedup | Сдерживает replay и повторную доставку | Не мешает множеству разных валидных requests |
| Отдельные OS users и DB login | Не даёт webapp/worker автоматически наследовать всё друг друга | Оба API/scheduler TEST units сейчас работают одним OS user и env-файлом |
| Narrow delivery role | Реально ограничивает worker до очереди/attempts/events | Queue payload и адресаты сами чувствительны; массовая отправка остаётся возможной |
| `FORCE RLS`, no owner/BYPASSRLS | Останавливает случайный/злонамеренный cross-tenant SQL | Бесполезно, если attacker может выпустить валидный context другой организации |
| Named roots + accepted context/argument hash | Ограничивает разрешённые DB operations и ловит misuse в коде | Не предотвращает takeover приложения с signer; создаёт root на каждый query и режет транзакции |
| Широкий `app_tenant_service` | Позволяет существующим readers работать | Не security control; расширяет blast radius до данных, которые интегратор не использует |

## 5. Переусложнение: прямой ответ

**Да.** D17 правильно обнаружил слишком широкую роль, но выбранное общее решение — превращать relation readers в
`SECURITY DEFINER` named roots под правилом «один accepted context на транзакцию» — дороже необходимого для
стандартного bot/dispatcher service.

Конкретная угроза, которую roots предотвращают: злоумышленник с DB credentials, но **без** способности создать
другой валидный accepted context, не может выполнить произвольный SELECT по granted columns и ограничен
function signatures. Это реальная защита при узкой модели кражи одного DB credential.

Но она не является главной фактической внешней угрозой:

- анонимный пользователь не получает DB credential через опубликованный route;
- signed M2M/provider request уже обходит эту модель на уровне легитимной операции;
- takeover процесса обычно даёт и credential, и runtime signer/context path;
- широкий `app_tenant_service` всё ещё остаётся доступен runtime login и сохраняет большой blast radius;
- oracle D17 подтверждает архитектурную цену: root нельзя вызвать внутри уже открытой relation transaction из-за
  правила одного accepted context; это порождает дополнительные функции, разрывает естественные транзакции,
  дублирует tenant predicates в definer body и усложняет grants/migrations/tests.

Практичный целевой вариант: direct, column-scoped grants + RLS для обычных tenant reads; narrow writer roles;
definer functions для небольшого числа атомарных/elevated операций. Это сохраняет главную изоляцию без функции на
каждый запрос.

Отдельно от DB-дизайна надо закрыть фактическую сеть: в long-polling конфигурации TEST интегратору не нужен ни один
публичный route; при MAX webhook наружу нужен только точный MAX endpoint. Это сильнее снижает вероятность атаки,
чем дальнейшее дробление уже аутентифицированных DB reads.

## 6. Как делают системы этого класса

Практика состоит из нескольких независимых границ, а не из одной «идеальной» DB-функции:

1. **Выбор одного ingress mode.** Telegram допускает либо `getUpdates`, либо webhook; методы взаимоисключающие.
   Webhook поддерживает отдельный `secret_token` в header. Поэтому polling-сервис держат без публичного ingress,
   webhook-сервис публикует один endpoint и валидирует secret.
   [Telegram Bot API — Getting updates](https://core.telegram.org/bots/api#getting-updates).
2. **Webhook authenticity до обработки.** Подпись проверяют по сырому body и shared secret, затем применяют
   replay protection/dedup. Это стандартная модель webhook providers.
   [GitHub — Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries).
3. **Service account с least privilege.** Отдельный runtime principal получает только свои таблицы/операции;
   worker и synchronous API разделяют, если их blast radius различается.
4. **RLS как row boundary.** PostgreSQL RLS применяет policies к каждому row; при отсутствии applicable policy
   действует default deny. Owners и `BYPASSRLS` обычно обходят RLS, поэтому service role не должна владеть
   таблицами и должна использовать `FORCE ROW LEVEL SECURITY` там, где owner-access возможен.
   [PostgreSQL — Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).
5. **Network isolation не считается единственной авторизацией.** Loopback/private network уменьшает
   достижимость, но запрос всё равно аутентифицируется: NIST zero trust прямо не даёт implicit trust только из-за
   network location.
   [NIST SP 800-207 — Zero Trust Architecture](https://csrc.nist.gov/pubs/sp/800/207/final).
6. **Outbox/queue + idempotency.** Асинхронный sender забирает ограниченную очередь, фиксирует attempts и retries,
   а не получает полный доступ к доменной БД. Текущая `app_operational_delivery_worker` уже близка к этой модели.

Необычным является не отдельный service account и не RLS — они стандартны. Необычна обязательная трансляция
каждого reader в definer-root с одноразовым transaction context, хотя runtime всё ещё способен выбрать широкую
tenant-role. Эта дополнительная сложность оправдана только если owner выбирает узкую threat model «DB credential
украден отдельно от signer/process» и принимает эксплуатационную цену.

## 7. Доказательства и команды

### Host, units, listeners и nginx TEST

Фактические выводы выше получены командами:

```bash
hostname && hostname -I
systemctl list-unit-files 'bersoncarebot-*-test.service' --no-legend
systemctl list-units 'bersoncarebot-*-test.service' --all --no-legend
for unit in bersoncarebot-api-test.service bersoncarebot-scheduler-test.service \
  bersoncarebot-webapp-test.service bersoncarebot-media-worker-test.service; do
  systemctl show "$unit" -p User -p Group -p WorkingDirectory -p EnvironmentFiles -p ExecStart
  systemctl cat "$unit"
done
sudo -n ss -lntup | awk 'NR==1 || /:3300 |:6300 |:4200 |:5200 |:3200 |:6200 |:80 |:443 /'
sudo -n nginx -T
sudo -n sed -n '1,220p' /etc/nginx/sites-available/test.bersoncare.ru
sudo -n ufw status
sudo -n iptables -L INPUT -n -v
```

Selected observed values: host `151.241.228.122`; integrator TEST `127.0.0.1:3300`; integrator DEV
`127.0.0.1:4200`; webapp TEST `127.0.0.1:6300`; nginx `0.0.0.0:80/443`; INPUT policy `ACCEPT` with no rules.

### Runtime mode without printing secrets

```bash
sudo -n -u postgres psql -X -v ON_ERROR_STOP=1 -d bersoncarebot_test <<'SQL'
BEGIN READ ONLY;
SELECT key,
       CASE WHEN value IS NULL OR value = '' THEN 'empty' ELSE 'configured' END AS state
FROM public.system_settings
WHERE key IN (
  'telegram_bot_token', 'telegram_mode', 'telegram_webhook_secret',
  'max_bot_api_key', 'max_webhook_secret', 'max_api_base_url'
)
ORDER BY key;
ROLLBACK;
SQL
sudo journalctl -u bersoncarebot-api-test.service --since '2026-08-22 00:00:00' --no-pager
```

Result rows existed for `telegram_bot_token`, `max_bot_api_key`, `max_webhook_secret`; mode, Telegram webhook
secret and MAX base URL rows were absent. Secret values were neither selected nor printed.

### TEST DB grants

The following read-only query produced the cited privilege counts:

```sql
BEGIN READ ONLY;
SELECT granted.rolname AS granted_role, m.inherit_option, m.set_option
FROM pg_auth_members m
JOIN pg_roles member ON member.oid = m.member
JOIN pg_roles granted ON granted.oid = m.roleid
WHERE member.rolname = 'bcb_test_integrator'
ORDER BY granted.rolname;

WITH roles(role_name) AS (VALUES
  ('app_integrator_request'), ('app_integrator_resolver'),
  ('app_operational_delivery_worker'), ('app_operational_scheduler'),
  ('app_service'), ('app_tenant_service')
), relation_surface AS (
  SELECT grantee, table_schema, table_name
  FROM information_schema.role_table_grants
  UNION
  SELECT grantee, table_schema, table_name
  FROM information_schema.column_privileges
)
SELECT role_name,
       (SELECT count(*) FROM relation_surface s
         WHERE s.grantee = role_name) AS relations,
       (SELECT count(*) FROM information_schema.column_privileges c
         WHERE c.grantee = role_name) AS column_privileges,
       (SELECT count(*) FROM information_schema.routine_privileges p
         WHERE p.grantee = role_name AND p.routine_schema = 'app'
           AND p.privilege_type = 'EXECUTE') AS app_function_executes
FROM roles;

SELECT table_schema, table_name,
       string_agg(privilege_type, ',' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE grantee = 'app_operational_delivery_worker'
GROUP BY table_schema, table_name
ORDER BY table_schema, table_name;

SELECT count(DISTINCT (table_schema, table_name)) AS direct_public_relations
FROM information_schema.role_table_grants
WHERE grantee = 'bcb_test_integrator' AND table_schema = 'public';
ROLLBACK;
```

Observed memberships: `app_integrator_request`, `app_integrator_resolver`,
`app_operational_delivery_worker`, `app_operational_scheduler`, `app_service`, `app_tenant_service`.
`app_operational_delivery_worker` had 4 relations, 100 column privileges and 25 `app` function EXECUTEs; its
relations were `integrator.direct_public_write_retries`, `public.content_access_grants_webapp`,
`public.outgoing_delivery_queue`, `public.reminder_delivery_events`. `app_tenant_service` had 62 relations,
565 column privileges and 32 `app` function EXECUTEs. Direct `public` relation grants to the base login: 0.

### Code/config references

- bind default: `apps/integrator/src/config/env.ts:11`;
- route composition and polling branch: `apps/integrator/src/app/routes.ts`;
- provider enablement/default mode: `apps/integrator/src/infra/adapters/integrationRuntimeConfig.ts`;
- DB contracts: `apps/integrator/src/kernel/contracts/ports.ts`;
- deployed nginx template: `deploy/nginx/bersoncarebot-webapp.vhost.template.conf`;
- PROD/host facts: `docs/ARCHITECTURE/SERVER CONVENTIONS.md`;
- accepted context constraint and relation-reader evidence:
  `docs/_TODO/runs/integrator-cleanup/D17_RELATION_READERS_2026-08-22.md`;
- existing role/grant measurement:
  `docs/_TODO/runs/integrator-cleanup/D17_STEP3_NARROW_ROLE_2026-08-22.md`.

## 8. Решение, которое требуется от владельца

Выбрать threat model:

- **рекомендация:** считать process takeover главным DB-сценарием; убрать broad `app_tenant_service`, оставить
  узкие direct grants + `FORCE RLS`, а named roots — только для elevated/atomic writes;
- **дорогой вариант:** отдельно защищаться от кражи DB credential без signer/process и продолжать function-only
  доступ с accepted-context roots для каждого reader.

В обоих вариантах network решение одинаково: M2M оставить внутренним; публиковать только точные webhook endpoints
реально включённых провайдеров. Это решение отчётом не применялось.
