# В9б: где должна стоять стена для чувствительных таблиц без RLS

> Независимое исследование, модель `gpt-5.6-sol`, 2026-08-01. Только чтение: код и БД не изменялись, миграции не
> писались, PROD не затрагивался. Оракул —
> [`TEST_SUITE_AUDIT_2026-07-29.md`, В9б](../../TEST_SUITE_AUDIT_2026-07-29.md#в9б-стена-стоит-у-данных-а-не-на-маршруте-решение-владельца-0108--канон-nextjs).

## Короткий ответ владельцу

**Да, `public.patient_bookings` должен быть под `ENABLE + FORCE ROW LEVEL SECURITY`.** Это живая таблица
истории/совместимости с ФИО, телефоном, e-mail, временем и фактом медицинской записи. Сегодня она не имеет ни
`organization_id`, ни RLS; роль `app_staff` без принципала видит всю таблицу. Безопасный пациентский список уже
сделан через узкую `SECURITY DEFINER` capability, но это защищает один read-path, а не таблицу и не все
чтения/записи.

Целевой грейд для `patient_bookings` и других tenant/user-owned PII/PHI-таблиц — **defense in depth**:

- ранняя проверка сессии/подписи в приложении;
- один DB-порт, устанавливающий неподделываемый принципал;
- непривилегированные runtime-роли;
- `FORCE RLS` с default-deny при пустом принципале;
- узкие `SECURITY DEFINER` capabilities только для тех bootstrap/integrator/platform-operations операций,
  которые по природе выполняются до пользовательского или tenant-контекста.

Не всякая таблица из списка `RLS OFF` должна получить tenant-policy. Пароли, OTP, passkeys, одноразовые токены,
очереди и cross-tenant worker state лучше защищать **отсутствием прямых grants + точной DB-capability или отдельной
технической ролью**. Но это всё равно должна быть стена у данных, а не надежда на конкретный route handler.

## 1. Канон проекта и критерий решения

В9б требует: «данные недостижимы без принципала», запрет живёт в БД, а проверка в route handler остаётся ранним
UX-отказом, не security boundary (`TEST_SUITE_AUDIT_2026-07-29.md:267-297`). Канон стен говорит то же:

- БД держит две стены: staff — ORG, patient — OWN (`TENANT_WALLS_AND_ACCESS_MODEL.md:8-17`);
- персонал видит всю свою организацию, но не чужую — вариант A (`:21-33`);
- пациент — глобальный человек и видит только собственные строки, в том числе свои строки разных клиник
  (`:37-64`);
- итоговый predicate: staff `organization_id = current_org`, patient `row owned by current_patient`, а
  `WITH CHECK` совпадает с read predicate (`:68-83`);
- принципал устанавливается централизованно одним auth-gate и одним DB-портом; публичные, integrator и worker
  входы получают явный технический принципал (`:98-120`).

Следовательно, «таблица глобальной identity» не означает «её PII глобально читается». Это означает, что обычный
patient/staff доступ должен быть self/org-related, а login/merge/bootstrap получает отдельную точную capability.

## 2. Перепроверка dev-БД

### 2.1 Инвентарь RLS

Точная команда замера:

```bash
sudo -u postgres psql -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c "SELECT n.nspname, count(*) FILTER (WHERE c.relrowsecurity AND c.relforcerowsecurity) AS force_rls, count(*) FILTER (WHERE NOT c.relrowsecurity) AS rls_off, count(*) FILTER (WHERE c.relrowsecurity AND NOT c.relforcerowsecurity) AS enabled_not_forced, count(*) AS total FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('public','integrator') GROUP BY n.nspname ORDER BY n.nspname;"
```

Результат:

```text
  nspname   | force_rls | rls_off | enabled_not_forced | total
------------+-----------+---------+--------------------+------
 integrator |        10 |      10 |                  0 |    20
 public     |       166 |      53 |                  0 |   219
```

Таким образом, замер лида `166 / 53` точен именно для схемы `public`; вместе с `integrator` картина иная, поэтому
числа нельзя складывать с формулировкой «вся БД» без оговорки схемы.

### 2.2 Достижимая беспринципальная видимость

Проверка выполнена под непривилегированной runtime-ролью, а не под `postgres` как читателем данных:

```bash
sudo -u postgres psql -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN; SET LOCAL ROLE app_staff; SELECT current_user, current_setting('app.principal_kind', true) AS principal_kind, app.current_org_id() AS org_id, app.current_patient_user_id() AS patient_id, (SELECT count(*) FROM public.patient_bookings) AS patient_bookings, (SELECT count(*) FROM public.appointment_records) AS appointment_records, (SELECT count(*) FROM public.platform_users) AS platform_users, (SELECT count(*) FROM public.be_organization_members) AS organization_members, (SELECT count(*) FROM public.branches) AS branches, (SELECT count(*) FROM public.booking_specialists) AS booking_specialists; ROLLBACK;"
```

```text
 current_user | principal_kind | org_id | patient_id | patient_bookings | appointment_records | platform_users | organization_members | branches | booking_specialists
--------------+----------------+--------+------------+------------------+---------------------+----------------+----------------------+----------+--------------------
 app_staff    |                |        |            |              263 |                 410 |            284 |                    4 |        2 |                  2
```

Это бинарный ответ по В9б: **без принципала `patient_bookings` возвращает не пусто, а все доступные роли строки**.
То же верно для соседней PII-проекции и глобального профиля.

Отдельная проверка patient-роли:

```bash
sudo -u postgres psql -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN; SET LOCAL ROLE app_patient; SELECT current_user, current_setting('app.principal_kind', true) AS principal_kind, app.current_org_id() AS org_id, app.current_patient_user_id() AS patient_id, (SELECT count(*) FROM public.platform_users) AS platform_users, (SELECT count(*) FROM public.user_channel_bindings) AS channel_bindings, (SELECT count(*) FROM public.user_channel_preferences) AS channel_preferences, (SELECT count(*) FROM public.user_notification_topics) AS notification_topics, (SELECT count(*) FROM public.user_notification_topic_channels) AS notification_topic_channels, (SELECT count(*) FROM public.user_pins) AS user_pins, (SELECT count(*) FROM public.user_web_push_subscriptions) AS web_push_subscriptions; ROLLBACK;"
```

```text
 current_user | principal_kind | org_id | patient_id | platform_users | channel_bindings | channel_preferences | notification_topics | notification_topic_channels | user_pins | web_push_subscriptions
--------------+----------------+--------+------------+----------------+------------------+---------------------+---------------------+-----------------------------+-----------+-----------------------
 app_patient  |                |        |            |            284 |              135 |                 120 |                 349 |                         279 |         2 |                     33
```

Здесь утечка класса ещё прямее: `app_patient` без patient principal может читать все профили и все строки
нескольких пользовательских таблиц. Это не доказывает внешний HTTP exploit, но доказывает отсутствие требуемой
стены в самой БД.

Положительный контрпример уже существует:

```bash
sudo -u postgres psql -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN; SET LOCAL ROLE app_patient; SELECT count(*) FROM app.read_current_patient_booking_rows('history', now()); ROLLBACK;"
```

```text
 count
-------
     0
```

`app.read_current_patient_booking_rows` возвращает пусто без подписанных org+patient context. Именно такую
семантику следует распространить с одного capability-path на весь класс доступа.

## 3. Почему эти таблицы оказались без RLS

Это смесь намеренных исключений и устаревшей классификации, а не одно решение.

1. Историческая taxonomy делила таблицы на `SCOPED`, `BOOTSTRAP`, `INFRA`, `TELEMETRY`, `LEGACY`.
   RLS-генератор и финальный cutover охватили scoped inventory; bootstrap/infra/telemetry/legacy в него
   механически не вошли. `tiers-218.tsv` до сих пор называет `appointment_records` и `patient_bookings`
   `LEGACY`, а `platform_users` и `be_organization_members` — `BOOTSTRAP`.
2. `R1_TABLE_TAXONOMY.md:24-44` намеренно признал `be_organization_members` pre-org resolver, а
   `staff_security_profiles` — глобальным security vault с запретом прямых grants и self-scoped
   `SECURITY DEFINER`. Это полезное различие, но `BOOTSTRAP` само по себе не является разрешением читать всю
   таблицу обычной runtime-ролью.
3. Миграции `0160-0176` строили dormant RLS только для descriptor targets. `0177_phase4_no_force_rls_compat.sql:1-5`
   отдельно объясняет временный откат `FORCE` для уже охваченных таблиц; `phase4-force-rls-cutover.sql:88+`
   затем включает FORCE по явному списку. Исследуемые таблицы в этот список не добавлены.
4. P0.5b сознательно выдал `app_staff` единый широкий DML surface сразу на `SCOPED + BOOTSTRAP + INFRA +
LEGACY + TELEMETRY` (`deploy/postgres/p0-5b-grants.sql:1-22`, `P0_5B_GRANTS.md:54-79`), потому что тогда одна
   роль обслуживала staff/system/worker. На FORCE-таблицах RLS сдерживает этот grant; на RLS-off таблицах — нет.
5. Позднее Rubitime retirement изменило факты. `patient_bookings` оставлена как живая canonical-history/runtime
   projection, `appointment_records` всё ещё имеет runtime reads/writes, а старый admin CRUD для
   `booking_*` удалён коммитом `f9365e51b`. Поэтому старая метка `LEGACY` уже не даёт правильного security
   решения для первых двух таблиц и не оправдывает broad DML для удалённого каталога.

Точный поиск истории:

```bash
rg -n 'patient_bookings|appointment_records|platform_users|be_organization_members|booking_(branch_services|branches|services|specialists)|staff_security_profiles|user_(channel|notification|oauth|passkey|password|pins|web_push)' deploy/postgres/phase4-force-rls-cutover.sql apps/webapp/db/drizzle-migrations/016*.sql apps/webapp/db/drizzle-migrations/017*.sql
rg -n 'patient_bookings|appointment_records|platform_users|be_organization_members' docs/_TODO/SAAS_FOUNDATION/scope-derivation/tiers-218.tsv docs/_TODO/SAAS_FOUNDATION/scripts/p0-9-enforce-descriptors.mjs docs/_TODO/SAAS_FOUNDATION/R1_TABLE_TAXONOMY.md
```

Первый поиск нашёл только комментарии/FK/back-references, но не `ENABLE/FORCE` для названных таблиц; второй
нашёл явные taxonomy-решения. Дополнительно проверены явный cutover inventory, generator descriptors,
`R1_TABLE_TAXONOMY.md`, `P0_5B_GRANTS.md` и обратные ссылки из Rubitime disposition. Это не случайно
пропущенная строка одной миграции; это устаревшая граница scope, которую новый В9б теперь обязан пересмотреть.

## 4. По-табличный вердикт для всех `public` RLS-off таблиц

Легенда:

- **RLS-включить** — обычный staff/patient доступ только через `FORCE RLS`; technical exception — отдельная
  capability, не permissive policy для всех.
- **Стена capability/ACL** — tenant RLS не подходит по природе операции; прямые grants runtime-пользователям
  убираются, доступ только exact-key `SECURITY DEFINER` или отдельной узкой DB-ролью.
- **Оставить** — реально глобальный каталог, миграционный ledger или обезличенный aggregate; RLS не нужен,
  хотя grants всё равно должны быть минимальными.

| Таблица                                | Вердикт                                           | Причина / требуемая стена                                                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `appointment_records`                  | **RLS-включить**                                  | Живая PII/booking projection: телефон, payload, user. Добавить/вывести org ownership; orphan legacy rows fail-closed. Signed integrator reads — отдельная exact capability.                        |
| `auth_rate_limit_events`               | **Стена capability/ACL**                          | Глобальная auth-defense до principal; доступ только auth service по точному rate-limit key. Текущий broad `app_staff` DML убрать.                                                                  |
| `be_organization_members`              | **RLS-включить**                                  | Membership graph сам является tenant-sensitive. Staff — своя org; bootstrap self-lookup по authenticated user — отдельная capability.                                                              |
| `booking_branch_services`              | **RLS-включить, default-deny до удаления**        | Устаревший tenant catalog без org key; текущих runtime SQL-paths не найдено. Не объявлять глобальным: обычным ролям ноль строк, maintenance — отдельно.                                            |
| `booking_branches`                     | **RLS-включить, default-deny до удаления**        | Адрес/часовой пояс бывшего tenant catalog; текущий admin CRUD удалён. Без доказанного потребителя safest disposition — deny, не global.                                                            |
| `booking_calendar_map`                 | **Стена capability/ACL**                          | Provider-neutral техническое соответствие `appointment_key ↔ gcal_event_id`; уже нет grants `app_staff/app_patient`. Только calendar worker по точному ключу.                                      |
| `booking_cities`                       | **Оставить: глобальный каталог**                  | Город/код — публичная справочная сущность без patient/org ownership. Write только catalog-maintainer.                                                                                              |
| `booking_services`                     | **RLS-включить, default-deny до удаления**        | Цена/описание бывшего tenant catalog; после cutover не должно быть глобально доступно staff.                                                                                                       |
| `booking_specialists`                  | **RLS-включить, default-deny до удаления**        | ФИО специалиста и branch relation — tenant data, не глобальный справочник.                                                                                                                         |
| `branches`                             | **RLS-включить, default-deny + capability**       | Активная legacy projection с `meta_json`, но без org key; `pgBranches` читает по exact integrator id. Обычным ролям deny, projection capability — точечный доступ; либо добавить org и org-policy. |
| `channel_link_secrets`                 | **Стена capability/ACL**                          | Одноразовый token hash для глобального identity-link; только lock/consume functions. Broad staff table access недопустим.                                                                          |
| `clinical_test_measure_kinds`          | **Оставить: глобальный каталог**                  | Справочник видов измерений, не строка пациента. Изменение — только catalog-maintainer.                                                                                                             |
| `email_challenges`                     | **Стена capability/ACL**                          | Pre-auth exact challenge lifecycle; таблицу напрямую не читать ни staff, ни patient.                                                                                                               |
| `email_otp_locks`                      | **Стена capability/ACL**                          | Глобальная auth-coordination по exact user/challenge.                                                                                                                                              |
| `email_send_cooldowns`                 | **Стена capability/ACL**                          | Pre-auth anti-abuse state по exact e-mail/user.                                                                                                                                                    |
| `idempotency_keys`                     | **Стена capability/ACL**                          | Cross-request exact-key state; `response_body` может содержать PII. Отдельный handler/worker role, не broad staff DML.                                                                             |
| `integration_webhook_error_events`     | **Стена capability/ACL**                          | Cross-tenant operational log; отдельная integrator/ops роль. Payload/error class нельзя отдавать clinic staff глобально.                                                                           |
| `integration_webhook_last_status`      | **Стена capability/ACL**                          | Глобальный health state интеграции; ops capability, не tenant user surface.                                                                                                                        |
| `integrator_push_outbox`               | **Стена capability/ACL**                          | Cross-tenant queue с payload/error; producer/worker grants и audit, без patient/staff direct access.                                                                                               |
| `login_tokens`                         | **Стена capability/ACL**                          | Точный одноразовый token hash; issue/consume functions, no table grants.                                                                                                                           |
| `media_playback_stats_hourly`          | **Оставить: обезличенный aggregate**              | Нет user/org key; глобальная агрегированная телеметрия. Только telemetry writer/reader.                                                                                                            |
| `operator_health_alert_sent`           | **Стена capability/ACL**                          | Глобальный ops dedup state; отдельная ops role.                                                                                                                                                    |
| `operator_incidents`                   | **Стена capability/ACL**                          | `error_detail` может нести чувствительный контекст; отдельная ops role и redaction, не clinic staff.                                                                                               |
| `outgoing_delivery_queue`              | **Стена capability/ACL**                          | Cross-tenant queue с payload; worker должен видеть несколько org, поэтому tenant RLS не основной механизм. Нужна отдельная delivery role/capability.                                               |
| `password_altcha_challenges`           | **Стена capability/ACL**                          | Pre-auth exact challenge, до user principal.                                                                                                                                                       |
| `password_login_identifier_protection` | **Стена capability/ACL**                          | Login-defense и lease token; exact accessor only.                                                                                                                                                  |
| `patient_bookings`                     | **RLS-включить**                                  | PHI/PII booking row. Staff — own org; patient — own `platform_user_id`; no principal — empty. Главный реальный пробел.                                                                             |
| `phone_challenges`                     | **Стена capability/ACL**                          | Pre-auth phone OTP/challenge по exact handle.                                                                                                                                                      |
| `phone_messenger_bind_secrets`         | **Стена capability/ACL**                          | Token hash + phone + user; signed integrator consume capability.                                                                                                                                   |
| `phone_otp_locks`                      | **Стена capability/ACL**                          | Глобальный auth lock по exact phone.                                                                                                                                                               |
| `platform_users`                       | **RLS-включить + bootstrap capabilities**         | Глобальная identity, но PII не глобально readable: patient self; staff — self/люди, связанные с own org; login/merge lookup — exact capability.                                                    |
| `product_analytics_hourly`             | **RLS-включить**                                  | Имеет `organization_id`; clinic analytics — own org, platform ops — отдельная роль.                                                                                                                |
| `reference_catalog_baselines`          | **Оставить: глобальный каталог**                  | Versioned global reference baseline без user/org ownership.                                                                                                                                        |
| `reference_catalog_snapshot_receipts`  | **Стена capability/ACL**                          | Org-tagged технический receipt, уже без app grants; seeder/ops access, либо простая org-RLS если появится staff UI.                                                                                |
| `saas_isolation_coverage_runs`         | **Оставить: глобальная telemetry**                | Технический результат security-run без tenant data surface; dedicated telemetry role.                                                                                                              |
| `saas_isolation_event_hourly`          | **Оставить: обезличенный aggregate**              | Глобальный hourly security aggregate.                                                                                                                                                              |
| `saas_isolation_events`                | **Стена capability/ACL**                          | Security telemetry может раскрывать внутренний контекст; dedicated telemetry writer/ops reader, не app roles.                                                                                      |
| `schema_migrations`                    | **Оставить: ledger**                              | Только migrator; RLS не нужен.                                                                                                                                                                     |
| `specialist_signup_intents`            | **Стена capability/ACL**                          | Pre-org signup PII до principal; exact challenge/intent functions.                                                                                                                                 |
| `staff_security_profiles`              | **Стена capability/ACL — текущий паттерн верный** | MFA ciphertext/recovery/challenge. Канон уже запрещает прямые app grants и даёт self-scoped `SECURITY DEFINER`; FORCE tenant RLS здесь не лучше vault capability.                                  |
| `user_channel_bindings`                | **RLS-включить + bootstrap capability**           | Patient-owned external identities: patient self; staff только при доказанной org-нужде; signed channel lookup/claim — exact capability.                                                            |
| `user_channel_preferences`             | **RLS-включить**                                  | Пользовательские настройки; patient self, staff не должен глобально читать/писать.                                                                                                                 |
| `user_email_setup_tokens`              | **Стена capability/ACL**                          | Token hash и e-mail; exact issue/consume only.                                                                                                                                                     |
| `user_notification_topic_channels`     | **RLS-включить**                                  | Patient-owned preferences; current no-principal patient visibility — реальный пробел.                                                                                                              |
| `user_notification_topics`             | **RLS-включить**                                  | Patient-owned preferences; current no-principal patient visibility — реальный пробел.                                                                                                              |
| `user_oauth_bindings`                  | **Стена capability/ACL**                          | Provider identity + e-mail нужны до auth; exact provider lookup/link/unlink functions. Self-view при необходимости — отдельный safe DTO accessor.                                                  |
| `user_passkey_accounts`                | **Стена capability/ACL**                          | WebAuthn account material; exact credential/user functions, no direct table access.                                                                                                                |
| `user_passkey_challenges`              | **Стена capability/ACL**                          | Одноразовый WebAuthn challenge; issue/consume only.                                                                                                                                                |
| `user_passkey_credentials`             | **Стена capability/ACL**                          | Credential id/public-key metadata; exact WebAuthn functions, no generic self SELECT.                                                                                                               |
| `user_password_credentials`            | **Стена capability/ACL**                          | Password hash/lock/lease; no direct runtime table access.                                                                                                                                          |
| `user_pins`                            | **Стена capability/ACL**                          | PIN hash и lock counters; current direct patient SELECT/INSERT надо заменить verify/set capability.                                                                                                |
| `user_web_push_subscriptions`          | **RLS-включить**                                  | User-owned endpoint/key material; patient CRUD only own rows, worker delivery through exact technical capability.                                                                                  |
| `webapp_schema_migrations`             | **Оставить: ledger**                              | Только migrator; RLS не нужен.                                                                                                                                                                     |

### Что в классификации является настоящим пробелом

Настоящий tenant/user wall gap — строки, которые обычная роль должна видеть выборочно, но сейчас получает
целиком: `patient_bookings`, `appointment_records`, `be_organization_members`, `platform_users`,
`product_analytics_hourly`, `user_channel_bindings`, `user_channel_preferences`,
`user_notification_topic_channels`, `user_notification_topics`, `user_web_push_subscriptions`; также бывшие
tenant catalogs нельзя оставлять как глобальный broad-DML surface только из-за метки `LEGACY`.

У challenge/credential/queue классов ошибка иная: отсутствие RLS допустимо, **но широкий `app_staff` grant не
допустим**. Их целевой barrier — DB ACL/capability/отдельный role, а не `WHERE organization_id`.

## 5. Где стена `patient_bookings` сегодня

### 5.1 `pgPatientBookings.ts`

У таблицы нет `organization_id`; тип строки содержит `platform_user_id` и contact PII
(`pgPatientBookings.ts:15-45`). Реальные SQL-paths:

- `listUpcomingByUser` / `listHistoryByUser` намеренно игнорируют аргумент `userId` и вызывают
  `app.read_current_patient_booking_rows` (`:83-115`, `:330-337`). Это **хорошая DB-capability стена**.
- Capability берёт подписанные org+patient helpers, при пустом контексте немедленно возвращает пусто, проверяет
  enrollment, `platform_user_id`, canonical appointment org и patient
  (`0199_current_patient_booking_rows.sql:1-38`). Прямой `SELECT patient_bookings` у `app_patient` после E1
  отозван; `EXECUTE` функции выдан точно patient-роли (`e1-webapp-runtime-config.sql:215-226,279-285`).
- `getByIdForUser` фильтрует `id + platform_user_id` (`pgPatientBookings.ts:304-310`) — app predicate есть, org
  predicate нет.
- `getById` и `getByCanonicalAppointmentId` фильтруют только opaque id (`:313-327`) — ownership целиком на
  caller.
- status/update/delete methods фильтруют только booking/canonical id (`:208-301`). На таблице без RLS это
  object-level authorization by caller, не стена данных.
- `createPending` делает глобальные cleanup-update для старых `cancelling`/`cancel_failed`, а первый cleanup
  содержит глобальную ветку `created_at < ...` (`:118-151`). При org-RLS эти ветки увидят только текущую org;
  глобальную уборку надо вынести в partitioned scheduler/capability.

Итог: **один patient list-path защищён правильно; класс таблицы — нет**.

### 5.2 `pgAppointmentProjection.ts`

`appointment_records` и `patient_bookings` прямо описаны как projections без `organization_id`
(`pgAppointmentProjection.ts:12-24`). Reads идут по `integrator_record_id` или телефону без org predicate
(`:247-320`). Staff soft-delete сначала глобально выбирает projection row; org mismatch проверяется только если
удалось разрешить canonical `be_appointments` target (`:323-357`). Orphan/old projection не получает
положительного org proof, но и не отклоняется только из-за его отсутствия.

Integrator GET routes подписаны HMAC, однако `assertIntegratorGetRequest` ставит `bootstrap`, а не org/integrator
principal (`assertIntegratorGetRequest.ts:9-23`); затем routes читают запись по external id или список по телефону
(`api/integrator/appointments/record/route.ts:5-32`, `active-by-user/route.ts:15-39`). При RLS им нужен exact
signed-integrator capability либо принципал с доказанной org.

### 5.3 `pgChannelLinkClaim.ts`

Это намеренно platform-global identity operation. Под подписанным integrator request оно:

- читает exact `platform_users` stub (`pgChannelLinkClaim.ts:28-48`);
- считает exact user bindings и `patient_bookings` (`:50-91`);
- блокирует две exact identity rows и binding/secret, затем переносит ownership (`:195-275`);
- при конфликте вызывает platform merge (`:138-170`).

Org filter здесь был бы ложной моделью: операция связывает/сливает глобальные identity до tenant routing. Но
bootstrap не должен получать прямой SELECT всей таблицы. Нужна специальная `channel_link_claim` capability,
принимающая уже проверенные token/user ids и возвращающая минимальный результат.

### 5.4 `platformUserMergePreview.ts` и merge engine

Preview читает полные PII-профили, channel/OAuth bindings, counts и overlap по двум exact user ids
(`platformUserMergePreview.ts:554-607,609-738`). Route доступен только platform operations admin
(`api/doctor/clients/[userId]/merge-candidates/route.ts:9-25`). Merge engine затем массово меняет
`patient_bookings.platform_user_id` и `appointment_records.platform_user_id`
(`packages/platform-merge/src/pgPlatformUserMerge.ts:355-362`) и выполняет cross-user guards (`:884-961`).

Это законный cross-tenant use case, но не причина ослаблять patient/staff policy. Он требует отдельного
`platform_ops` principal и аудируемой owner/capability transaction. Обычный `app_staff` не должен быть
эквивалентен platform operations.

### 5.5 Есть ли сейчас внешний unauthenticated leak

По статическому чтению **не найден route, который прямо возвращает чужую booking row без проверки**:

- patient routes имеют patient gate;
- public create идёт только после session phone proof или одноразового кода и затем ставит explicit org principal
  (`public/create/route.ts:130-180`, `public/create/confirm/route.ts:87-125`);
- public payment status сначала беспринципально резолвит org по booking id, затем сверяет contact phone внутри org
  (`public/payment-status/route.ts:6-35`, `patient-booking/service.ts:266-292`);
- integrator projection reads требуют HMAC;
- merge preview требует platform-operations gate.

Но это **не PASS В9б**. Public payment-status уже делает unbounded lookup по id до phone proof; direct repo methods
доверяют caller; живой DB-query под `app_staff` без principal возвращает все rows. Новый handler или забытый caller
получит данные без необходимости обходить БД. На HTTP я не выполнял активный exploit и не утверждаю, что сегодня
есть подтверждённая выдача полного чужого DTO наружу.

## 6. Целевой дизайн стены `patient_bookings`

### 6.1 Данные и policy

1. У строки должен быть прямой immutable `organization_id NOT NULL` с индексом. Выводить org только через
   `canonical_appointment_id` недостаточно: pending rows создаются **до** canonical appointment
   (`canonicalCreate.ts:262-289`), а код прямо говорит, что `patient_bookings` сохраняется как historical
   projection (`:115-144`).
2. Backfill linked rows — от `be_appointments.organization_id`; unlinked/ambiguous legacy rows — карантин или
   deny-only, но не «видны всем». Конкретную судьбу неоднозначных rows должен определить отдельный measured
   transition plan.
3. `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`; runtime owner/BYPASSRLS в pool запрещён.
4. Policies:

```sql
-- концепт, не готовая миграция
USING (
  (app.is_staff() AND organization_id = app.current_org_id())
  OR platform_user_id = app.current_patient_user_id()
)
WITH CHECK (
  (app.is_staff() AND organization_id = app.current_org_id())
  OR platform_user_id = app.current_patient_user_id()
)
```

При пустом принципале helpers дают `NULL`, predicate не `TRUE`, следовательно `SELECT` возвращает пусто, а write
не проходит. Для пациента org в текущем UI может оставаться app-filter: БД-стена — OWN, как требует канон.

5. Cross-table consistency: если `canonical_appointment_id` задан, его `organization_id` и
   `platform_user_id` должны совпадать с projection row. Иначе RLS защищает строку по неверно записанному tenant
   key.

### 6.2 App-layer остаётся второй стеной

- Route/session/HMAC checks сохраняются: они дают понятный 401/403, не запускают лишний SQL и проверяют бизнес-
  право (например, control of phone).
- `getById` может остаться id-only **только если** каждый DB access гарантированно идёт под корректным principal и
  FORCE RLS. Для public bootstrap lookup лучше отдельная capability, а не permissive bootstrap policy на таблицу.
- DTO должен по-прежнему выдавать минимум полей; RLS ограничивает rows, не columns.

### 6.3 Почему не только app-layer

App-only дешевле на первом изменении, но уже провален конструкцией: часть методов фильтрует user, часть только id,
часть полагается на caller. Любой новый call site повторяет проверку. FORCE RLS централизует row predicate и
закрывает прямой SQL через разрешённую runtime-роль. App-only можно принять для exact-key auth/worker tables,
где tenant predicate не существует, но тогда DB ACL/capability обязателен; «route знает секрет» недостаточно.

### 6.4 Цена перехода

Основная цена — не сам `ALTER TABLE`, а data ownership и principal coverage:

- добавить/backfill org на две живые legacy projections;
- разобрать ambiguous/orphan rows;
- разделить `app_staff` от worker/integrator/platform_ops;
- заменить bootstrap/global reads точными capabilities;
- перепривязать все id-only mutations к org/patient principal;
- дать maintenance jobs явный partition/role;
- прогнать negative matrix: no principal, patient A/B, staff org A/B, integrator exact key, worker/platform ops.

## 7. Что сломается при немедленном FORCE RLS на `patient_bookings`

Если просто включить FORCE с целевой policy, не добавив org key и capabilities, сломаются следующие пути.

| Путь                                            | Почему сломается                                                                                                                                                                                          | Что ему нужно                                                                                                                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patient upcoming/history                        | Текущая capability уже fail-closed и владелец функции читает таблицу; при корректном owner/ACL может не сломаться. Но она сейчас требует org+patient и enrollment.                                        | Сохранить exact capability либо читать через patient OWN policy; проверить multi-clinic семантику канона.                                                                       |
| Authenticated patient create                    | Route заменяет patient context на explicit organization principal, а pending row не содержит org и ещё не имеет canonical appointment. INSERT не сможет доказать ни OWN, ни ORG.                          | Передавать `organization_id` в pending row; либо combined patient/org context, либо узкая create-booking capability, связывающая trusted user+org.                              |
| Public verified create                          | После OTP/session proof создаёт/резолвит user под organization principal; та же проблема pending INSERT.                                                                                                  | Public-booking capability после phone proof или явный patient principal после identity resolution + org-stamped row.                                                            |
| Public payment-status                           | `resolveBookingOrganizationId` сначала вызывает id-only `getById` под bootstrap; row станет невидим.                                                                                                      | Exact bootstrap capability по booking id, возвращающая только org/minimal proof, затем org principal + phone check; лучше signed opaque receipt, чтобы не делать global lookup. |
| Cancel/reschedule/payment lifecycle             | `mark*`, `getByCanonicalAppointmentId`, `getById` — id-only. Часть callers имеет org/patient principal, часть рассчитывает на id.                                                                         | Установить correct org/patient principal до repo call; RLS станет окончательной проверкой.                                                                                      |
| Глобальный stale cleanup внутри `createPending` | Под org policy обновит только текущую org; беспринципально — ничего.                                                                                                                                      | Перенести global sweep в scheduler, исполнять per-org или под отдельной narrow maintenance capability.                                                                          |
| `pgAppointmentProjection` staff delete/sync     | DELETE/UPDATE projection по canonical id не сможет пройти без доказанного org; orphan rows не имеют derivation.                                                                                           | Org principal + direct org column; orphan maintenance capability, не staff fallback.                                                                                            |
| Signed integrator appointment reads             | Сейчас HMAC route ставит bootstrap и читает соседнюю `appointment_records` по id/phone; аналогичный RLS на projection закроет path.                                                                       | Integrator principal с org либо exact HMAC-bound capability.                                                                                                                    |
| Channel-link claim                              | Bootstrap identity flow считает bookings exact stub user и merge может менять owner; ordinary patient/org policy это запретит.                                                                            | `channel_link_claim`/`platform_merge` capability с exact ids, транзакцией и audit.                                                                                              |
| Platform merge preview/apply                    | Нужны cross-user counts, overlap и массовый перенос ownership; staff/patient RLS вернёт неполные данные или запретит update.                                                                              | Отдельный `platform_ops` principal + audited owner function/transaction, не broad `app_staff`.                                                                                  |
| Integrator Google Calendar sync                 | `bookingCalendarMap.ts` обновляет `public.patient_bookings` по canonical appointment id; lifecycle payload уже несёт `organizationId`, но wrapper вокруг этого DB access не установлен в показанном path. | Валидированный org principal из signed lifecycle event либо exact calendar-sync capability; row org должен совпасть.                                                            |
| Ops scripts: purge/backfill/phone-admin/audit   | Обычный app role перестанет видеть/менять весь набор. Это ожидаемая поломка.                                                                                                                              | Явная maintenance role, database-name gate, audit и ограниченный runbook; никогда не выдавать BYPASS обычному runtime.                                                          |

Полный текущий source-search прямых упоминаний (без tests/migrations) выполнен командой:

```bash
rg -n --glob '!**/*.test.ts' --glob '!**/*.test.tsx' --glob '!**/*.spec.ts' --glob '!**/migrations/**' --glob '!**/db/drizzle-migrations/**' 'patient_bookings' apps packages scripts deploy
```

Он нашёл runtime SQL только в `pgPatientBookings`, `pgAppointmentProjection`, `pgChannelLinkClaim`,
`platformUserMergePreview`, `platform-merge`, integrator `bookingCalendarMap`, full-purge и ops scripts; иных
беспринципальных background readers по этому поиску не обнаружено.

## 8. Мировая практика для health SaaS

### PostgreSQL

[Официальная документация PostgreSQL по Row Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
фиксирует важные для этого дизайна свойства:

- после `ENABLE RLS` доступ обычной роли должен быть разрешён policy; если policy нет, действует default deny;
- policy применяется к SELECT и DML rows;
- superuser и `BYPASSRLS` всегда обходят RLS;
- owner обычно обходит RLS, поэтому для owner-sensitive случая нужен `FORCE ROW LEVEL SECURITY`;
- referential-integrity checks могут обходить row security, поэтому RLS не заменяет проверку корректности tenant
  FK/denormalized key.

То есть `ENABLE` без `FORCE` и runtime connection как owner — не требуемая стена.

### Pooled SaaS

[AWS Prescriptive Guidance: Row-level security recommendations](https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/rls.html)
называет PostgreSQL RLS требуемым способом tenant isolation для pooled model и подчёркивает его плюс: enforcement
централизован в БД и не перекладывается на каждого разработчика. Это напрямую соответствует архитектуре проекта.

[Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication) рекомендует выполнять основные
security checks максимально близко к источнику данных, централизовать их в DAL и не считать Proxy единственной
линией защиты. Для этого проекта DB RLS сильнее одного JS DAL, но app gate/DAL всё равно нужен как дополнительный
слой и как источник principal.

[OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
требует least privilege, deny by default и permission validation на каждом request. Это поддерживает обе линии:
app-level business authorization + data-level default deny.

### HIPAA/GDPR-класс

[HHS Summary of the HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html)
требует технических policies/procedures, допускающих доступ к ePHI только авторизованным лицам, а также audit
controls и authentication. HHS не предписывает PostgreSQL или RLS как конкретную технологию: правило
технологически нейтрально.

[GDPR, Regulation (EU) 2016/679, Articles 25 and 32](https://eur-lex.europa.eu/eli/reg/2016/679/art_32/oj/eng)
требует data protection by design/default и risk-appropriate technical and organisational measures; он также не
называет RLS. [NIST SP 800-207](https://doi.org/10.6028/NIST.SP.800-207) добавляет общую инженерную норму:
least-privilege access decisions должны быть granular и per-request, без implicit trust zone.

**Вывод из источников, а не их дословное требование:** для pooled medical SaaS с уже имеющимся PostgreSQL RLS
наиболее доказуемый грейд — defense in depth. Регуляторы требуют результат (авторизованный минимальный доступ,
audit, risk controls), AWS/PostgreSQL дают подходящий DB enforcement mechanism, Next/OWASP требуют не оставлять
authorization в одном случайном route. Утверждать «HIPAA требует FORCE RLS» было бы выдумкой; утверждать «для
этой архитектуры app-only равен FORCE RLS» — тоже.

## 9. Рекомендация

### Для `patient_bookings`

**Рекомендация: FORCE RLS + app-layer, то есть defense in depth.** Добавить прямой org ownership, patient OWN и
staff ORG policies, fail-closed no-principal behavior, сохранить route gates, а public/integrator/platform merge
оформить отдельными auditable capabilities. Не делать permissive bootstrap policy, которая возвращает строку по
произвольному id/phone: она восстановит тот же обход под другим именем.

### Для класса чувствительных RLS-off таблиц

- Tenant/user rows с естественным owner key — FORCE RLS.
- Глобальная identity с PII — FORCE RLS для обычного доступа + exact bootstrap/platform capabilities.
- Credential/challenge/secret — no direct grants, exact `SECURITY DEFINER` capability; RLS не обязателен.
- Cross-tenant queues/ops — отдельная worker/ops DB-role с минимальными grants и audit; не `app_staff`.
- Реально глобальные catalogs/aggregates/ledgers — оставить без RLS, но не раздавать write всем runtime ролям.
- Retired tenant catalogs — deny-by-default до физического удаления; `LEGACY` не означает `global`.

Главный архитектурный долг — историческая роль `app_staff`, которая одновременно представляет clinic staff,
system, integrator и worker. Пока она имеет broad DML на RLS-off sensitive tables, ни приложение, ни подпись
principal context не образуют полной стены у данных.

## 10. ЧЕГО НЕ ЗНАЮ / не проверил

- Не трогал PROD и не сравнивал его catalog/grants/data с dev. Все live-утверждения выше относятся только к
  `bcb_webapp_dev` и точным командам в отчёте.
- Не запускал HTTP exploit и не проверял ответы живого dev-приложения. Статически не найден route, отдающий полный
  чужой booking DTO без auth/proof; доказан более фундаментальный DB-level fail В9б.
- Не измерял, сколько `patient_bookings` можно однозначно backfill-ить в org и сколько останется orphan/ambiguous.
  Без такого замера нельзя назвать безопасный migration order или цену ручного разбора.
- Не проверял фактический `DB_PRINCIPAL_CONTEXT_MODE` каждого запущенного dev unit и конкретный login каждого pool.
  Catalog-проверки выполнены через `SET LOCAL ROLE app_staff/app_patient`; они доказывают policy/grant semantics,
  но не утверждают, какой unit прямо сейчас подключён этой ролью.
- Не проверял производительность будущих policies/joins и не строил `EXPLAIN`. Для решения о прямом
  `organization_id` достаточно порядка создания pending row; индексы и план запросов потребуют отдельного design
  proof.
- Не доказал, что в `operator_*`, webhook/outbox payload никогда не попадает PII. Поэтому классифицировал их
  консервативно как narrow ops capability, а не публичную global table.
- Не вычитал национальные требования РФ/152-ФЗ и не даю юридическое заключение по HIPAA/GDPR применимости.
  Использованы официальные источники только для инженерного класса safeguards.
- Для старых `booking_*` поиск текущего runtime проведён так: lexical `code-search` по всем четырём именам, exact
  `rg` в `apps/packages/deploy/scripts`, обратные ссылки в SaaS taxonomy и Rubitime disposition, затем `git log`.
  Current source SQL не найден; удаление `pgBookingCatalog` и admin routes видно в `f9365e51b`. Я не проверял
  внешние ad-hoc consumers вне репозитория, поэтому рекомендую default-deny/maintenance capability до drop, а не
  немедленное физическое удаление.
