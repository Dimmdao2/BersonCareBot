# SCHEME round 2 — целевой слой прав БД BersonCareBot

Authority: [`OWNER_DECISIONS.md`](../../OWNER_DECISIONS.md), раздел «Права БД, роли и стены», затем
[`PLAN.md`](PLAN.md). Round 2 закрывает findings двух ревью
([`28`](evidence/28-scheme-gaps.md), [`29`](evidence/29-scheme-excess-and-traceability.md)) и принимает полный
census [`30`](evidence/30-definer-seams-full-census.md). Это проект целевого состояния; ни текущий каталог, ни
наблюдаемая работоспособность не являются основанием выдать право.

## 1. Как выглядит система без SQL

У приложения две и только две двери к данным: порт **webapp** и порт **integrator**. Пароль DB-login открывает
сетевое соединение, но не данные. Перед любой работой порт доказывает базе своей асимметричной подписью: «этот
вызов пришёл через меня». Это **port attestation**.

Личность человека — другое доказательство. После входа webapp отдельно подписывает: кто действует, в какой
организации и в каком классе (`staff`, `patient`, `platform`). До входа личности нет, но attestation webapp-порта
есть; база разрешает только точную предсессионную функцию с подписанными назначением и аргументами. Поэтому
украденный пароль login не позволяет ни искать user id по email, ни узнавать организацию по delivery id, ни
разрешать payment webhook.

Integrator и фоновые работы предъявляют port attestation с точной служебной ролью и назначением. Они не выдают
себе человеческую личность. Ни port attestation, ни principal context не заменяют друг друга: путь, которому
нужна личность, обязан проверить оба; pre-session/service-путь проверяет порт и получает только свой узкий
результат.

Строки затем ограничивает PostgreSQL: точный grant, обязательная restrictive policy проверки attestation и
policy области данных. Прямой login, неверная роль, другая транзакция, другой backend, подменённый аргумент,
отсутствующий или неверный контекст приводят к `42501`; запрос не возвращает строки, ошибка попадает в server log.

Ни login, ни runtime-role, ни владелец definer-шва не имеет `BYPASSRLS`. Вне контролируемой миграционной
транзакции полномочие обхода остаётся только у поимённого суперпользователя `postgres`.

### Явное расхождение с прежней фразой про неизвестного

Буквальная строка PLAN Ф3б «неизвестный не получает соединения» **смягчена осознанно**: неизвестный человек не
получает DB credentials или соединение напрямую, но webapp-порт открывает за него короткую транзакцию для входа,
регистрации и публичного lookup. В ней есть port attestation и нет principal context; доступны только точные
pre-session seams. Полный запрет такой транзакции сделал бы DB-backed вход невозможным, а голое соединение без
ключа вернуло бы дыру. Это расхождение, а не скрытое толкование прежней строки.

## 2. Два независимых доказательства

### 2.1 Port attestation: «это порт»

- У webapp и integrator свои private signing keys. Private keys живут только в env соответствующего порта, не
  передаются клиенту и не попадают в PostgreSQL, backup или dump.
- PostgreSQL хранит только public verification keys с `key_id`, портом и сроком действия. Exact columns читает
  только verifier шва 1; менять allowlist может только миграционный канал. Login/runtime и остальные seam owners
  не получают ACL.
- PostgreSQL не хранит private/signing material: dump содержит только public verifier и не позволяет подписать
  port attestation или principal.
- В начале транзакции база выдаёт одноразовый challenge. Подписываемый envelope связывает `key_id`, точный порт,
  database OID, `session_user`, целевой runtime-role либо signature definer-функции, backend identity вместе с
  `backend_start`, transaction id, purpose, canonical hash аргументов, expiry и nonce.
- База проверяет подпись public key, все привязки и одноразовость nonce. Принятый envelope живёт только как
  transaction-local значение. Конец или abort транзакции уничтожает его силами PostgreSQL.
- Любой pre-session/definer-вызов проверяет envelope с собственной константой function signature/purpose и hash
  фактических аргументов **до первого чтения**. Caller-supplied UUID, email, delivery id, webhook id и custom GUC
  сами по себе полномочием не являются.

Функция/акцессор port gate бросает `42501`, если envelope отсутствует, испорчен, просрочен, выпущен другим портом,
для другой БД, login, роли, backend, транзакции, функции, purpose или набора аргументов. Проверка не возвращает
`false`/`NULL`, потому что это был бы тихий ноль.

### 2.2 Principal context: «это такой человек»

После прикладной идентификации порт подписывает отдельный principal envelope. Он повторно связан с уже принятой
port attestation и той же DB/login/role/backend/transaction, а также содержит:

- `principal_class`: `staff`, `patient`, `integrator` или `platform`;
- нужные этому классу `actor_user_id`, `organization_id`, `patient_user_id` либо `integrator_user_id`;
- purpose, expiry и отдельный nonce.

`app.current_org_id()`, `app.current_patient_user_id()` и `app.current_integrator_user_id()` проверяют подпись,
port attestation, exact role и транзакцию и бросают `42501` при несовпадении. Для глобального администратора
вводится отдельный бросающий accessor `app.require_platform_principal()`. Он не возвращает tenant id, а доказывает
класс `platform`; без него `app_platform_settings` получает громкий отказ, а не silent zero.

Principal одного класса нельзя использовать после `RESET ROLE; SET ROLE` в другой runtime-role: exact role входит
в подпись и проверяется accessor-ом. Principal из прошлой транзакции, pool lease или повторно использованного PID
недействителен.

### 2.3 Жизненный цикл соединения

Оба порта выполняют один порядок: `BEGIN` → проверка чистого transaction-local состояния → выбор exact role →
challenge → port attestation → при необходимости principal context → запросы → `COMMIT/ROLLBACK`. Соединение с
ошибкой установки или очистки уничтожается, а не возвращается в pool. Transaction-local хранение является
основной fail-closed границей; application cleanup остаётся проверкой, не единственной защитой.

В шве 1 остаётся шесть целевых функций: `install_signed_context`, три tenant/integrator accessor-а, новый port
gate и `require_platform_principal`. Прежние `release_principal_context` и `reset_principal_context` перестают быть
definer-контрактами: завершение транзакции само снимает контекст. Поэтому пересборка механизма не увеличивает
census швов и функций.

## 3. Логины, membership и runtime-роли

### 3.1 Четыре прикладных login на среду

| Login | Назначение | Standing access |
|---|---|---|
| `<env>_migrator` | канал deploy/migration | только `CONNECT`; временные DDL-полномочия выдаются внутри одной миграционной транзакции |
| `<env>_webapp_staff` | staff/platform/service-транзакции webapp | `SET` только в объявленные webapp runtime-роли; прямых object ACL нет |
| `<env>_webapp_patient` | patient и pre-session webapp | `SET app_patient` после идентификации; exact `EXECUTE` pre-session seams; прямых object ACL нет |
| `<env>_integrator` | integrator и его service-транзакции | `SET` только в delivery/scheduler роли; exact `EXECUTE` integrator seams; прямых object ACL нет |

Все четыре: `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`. Каждое разрешённое
membership имеет `INHERIT FALSE, SET TRUE, ADMIN FALSE`; все остальные рёбра отсутствуют. Декларация и сверка
сравнивают все три option, а также транзитивную достижимость. `RESET ROLE` внутри соединения доступен всегда и не
считается стеной: данные удерживают port/principal proof и exact role binding.

| Member login | Exact target roles |
|---|---|
| `<env>_migrator` | нет standing membership |
| `<env>_webapp_staff` | `app_staff`, `app_clinic_billing`, `app_platform_settings`, `app_worker`, `app_operational_media_worker`, `saas_telemetry_operator` |
| `<env>_webapp_patient` | `app_patient` |
| `<env>_integrator` | `app_operational_delivery_worker`, `app_operational_scheduler` |

`postgres` — поимённый суперпользователь, не прикладной login. Глобальный администратор отдельного login не имеет.

### 3.2 Девять runtime-ролей

Каждая роль — `NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`, не член другой
runtime-role.

| Роль | Порт | Scope | Единственная потребность |
|---|---|---|---|
| `app_staff` | webapp | `ORG` | лечебная и организационная работа своей клиники |
| `app_patient` | webapp | `OWN` | только свои данные в текущей организации; тесты только из своей программы, без внутренних полей |
| `app_clinic_billing` | webapp | `ORG` | коммерция своей клиники после отдельного application gate |
| `app_platform_settings` | webapp | `PLATFORM` | тарифы, счета и каркас организаций; медицина исключена |
| `app_worker` | webapp | `NONE` | webapp jobs, retention и очистка журналов |
| `app_operational_media_worker` | webapp | `NONE` | точные media/transcode/statistics operations |
| `saas_telemetry_operator` | webapp | `PLATFORM_SERVICE` | только exact functions телеметрии изоляции, ноль table ACL |
| `app_operational_delivery_worker` | integrator | `NONE` | точные очереди и delivery operations |
| `app_operational_scheduler` | integrator | `NONE` | idempotency, ticks, incidents и probes без queue mutation доставки |

`app_operational_diagnostic` удаляется как лишняя роль: её единственный read-only health-путь вызывает точную
probe-функцию шва 31 через integrator port attestation. Он не получает table ACL и не переезжает в delivery-role,
поэтому удаление роли не расширяет права health-проверки.

### 3.3 Громкий отказ для пяти прежних service-путей `NONE`

У service-пути нет tenant id, но отсутствие строкового tenant-предиката не означает отсутствие стены. Каждая
служебная операция требует port attestation с exact port, role, transaction и purpose. На прямых таблицах стоит
`AS RESTRICTIVE` policy, вызывающая бросающий service/port accessor; только за ней применима business policy exact
role. `USING (true)` допустима для runtime-role лишь когда объявленная работа действительно охватывает все строки
**этой одной таблицы**; exact columns/operations и restrictive port gate остаются обязательны.

| Прежний service-путь | Целевой denial |
|---|---|
| `app_worker` | webapp attestation + exact `app_worker` + job purpose; чужой job/table не проходит |
| media worker | отдельный процесс обращается по authenticated internal HTTP к webapp-порту; DB-login у процесса нет; в БД — webapp attestation + exact media purpose |
| delivery worker | integrator attestation + exact delivery role/purpose; queue business policy ограничивает допустимые состояния/lease |
| scheduler | integrator attestation + exact scheduler role/purpose; delivery mutation policy отсутствует |
| diagnostic | runtime-role отсутствует; exact probe-function шва 31 проверяет integrator attestation и возвращает фиксированный health result |

`media_files` не выбирает между «tenant» и «worker». Tenant-вызовы проходят restrictive port+principal gate и
org/patient business policy; media service проходит другую exact-role policy с media purpose. Из-за `NOINHERIT`
policies tenant и service ролей не складываются для одного caller.

## 4. Стена данных

Для каждой relation/command доступ образует один AND:

1. точный object/column grant;
2. `ENABLE ROW LEVEL SECURITY` и `FORCE ROW LEVEL SECURITY`;
3. обязательная `AS RESTRICTIVE` gate-policy, чей accessor проверяет port attestation и бросает `42501`;
4. principal/service business policy exact role; для `INSERT/UPDATE` тот же scope закреплён в `WITH CHECK`.

Business policies могут быть permissive и объединяться через OR только **внутри** уже обязательного restrictive
gate. Там, где подразумевается conjunction организации, человека и business condition, оно записывается одной
policy либо несколькими restrictive policies. Catalog invariant запрещает table/role/command без gate и широкую
permissive policy, которая применима другой роли через membership.

### Классы

- **Клиника/staff:** строка принадлежит `app.current_org_id()` напрямую либо через объявленный scoped parent.
- **Patient:** одновременно совпадают организация и `current_patient_user_id()` либо доказанная связь
  enrollment/program/appointment; отсутствие patient-policy означает полный запрет.
- **Platform:** policy вызывает `require_platform_principal()`; роли нет на медицинских таблицах.
- **Integrator/service:** проверяется exact port/role/purpose; где row scope существует, он дополнительно связан с
  подписанными аргументами или выведен функцией, но caller-provided GUC/identifier не является authority.
- **Authentication/context secrets:** runtime-role не имеет table ACL; доступ только через exact seam call с
  port proof. Public key не является secret, но его изменение также недоступно runtime.

### Транзитивная сила записи

Декларация writable surface включает не только таблицу, но и `pg_trigger`, вызываемые trigger functions, FK,
UNIQUE/EXCLUDE и cascade actions. Trigger-definer входит в полный function census; invoker-trigger не получает
силу шире caller. Межстенный FK/UNIQUE либо включает tenant key, либо mutation выполняет exact seam с signed scope
и одинаковым внешним отказом, не раскрывающим существование чужого ключа. Нельзя считать relation безопасной,
проверив только текст прямой функции.

## 5. Все definer-швы

Census 30 распределил **244 функции по 42 швам**. Точная арифметика воспроизводится командой:

```bash
printf '%s\n' 6 17 25 9 13 8 2 7 2 11 3 1 2 3 1 1 7 10 5 8 4 2 3 8 6 4 2 2 2 2 12 2 3 1 2 7 4 5 5 11 12 4 \
  | awk '{s+=$1} END{print s}'
```

Она печатает `244`; полный catalog mapping и owner census — evidence/30 Q2/Q6/Q7.

| # | Owner | Шов | Функций |
|---:|---|---|---:|
| 1 | `app_seam_context_owner` | port attestation и principal context | 6 |
| 2 | `app_seam_password_auth_owner` | password auth/rate limit | 17 |
| 3 | `app_seam_email_otp_owner` | email OTP | 25 |
| 4 | `app_seam_passkey_owner` | passkey | 9 |
| 5 | `app_seam_phone_binding_owner` | contact/channel binding | 13 |
| 6 | `app_seam_self_security_owner` | PIN/session epoch | 8 |
| 7 | `app_seam_identity_lookup_owner` | pre-session identity lookup | 2 |
| 8 | `app_seam_patient_invite_owner` | patient invite | 7 |
| 9 | `app_seam_org_invite_owner` | staff organization invite | 2 |
| 10 | `app_seam_specialist_provision_owner` | specialist/first-org provisioning | 11 |
| 11 | `app_seam_public_slug_owner` | public slug | 3 |
| 12 | `app_seam_public_booking_owner` | public booking | 1 |
| 13 | `app_seam_dedicated_bot_owner` | dedicated bot | 2 |
| 14 | `app_seam_payment_webhook_owner` | payment webhook | 3 |
| 15 | `app_seam_delivery_scope_owner` | delivery scope | 1 |
| 16 | `app_seam_patient_program_resolver_owner` | patient program resolver | 1 |
| 17 | `app_seam_settings_preauth_owner` | preauth settings | 7 |
| 18 | `app_seam_settings_integrator_owner` | integrator settings | 10 |
| 19 | `app_seam_settings_runtime_owner` | runtime settings | 5 |
| 20 | `app_seam_org_commerce_owner` | SaaS/org commerce | 8 |
| 21 | `app_seam_patient_org_projection_owner` | patient/org projection | 4 |
| 22 | `app_seam_patient_booking_owner` | patient booking | 2 |
| 23 | `app_seam_patient_self_actions_owner` | patient self actions | 3 |
| 24 | `app_seam_reminder_patient_owner` | patient reminders | 8 |
| 25 | `app_seam_reminder_materialization_owner` | reminder materialization/discovery | 6 |
| 26 | `app_seam_reminder_specialist_owner` | specialist reminder | 4 |
| 27 | `app_seam_reminder_appointment_owner` | appointment reminder | 2 |
| 28 | `app_seam_reminder_email_cooldown_owner` | email cooldown | 2 |
| 29 | `app_seam_telemetry_patient_owner` | patient telemetry | 2 |
| 30 | `app_seam_telemetry_media_owner` | media telemetry | 2 |
| 31 | `app_seam_telemetry_operator_owner` | operator telemetry/probes | 12 |
| 32 | `app_seam_catalog_public_owner` | public catalogs | 2 |
| 33 | `app_seam_catalog_admin_owner` | clinical measure kinds | 3 |
| 34 | `app_seam_org_directory_owner` | platform org directory | 1 |
| 35 | `app_seam_telemetry_exclusion_owner` | telemetry exclusion | 2 |
| 36 | `saas_telemetry_owner` | SaaS isolation telemetry | 7 |
| 37 | `saas_system_health_owner` | curated system health | 4 |
| 38 | `app_seam_login_token_owner` | messenger login tokens | 5 |
| 39 | `app_seam_oauth_owner` | OAuth binding | 5 |
| 40 | `app_seam_phone_otp_owner` | phone OTP/challenges | 11 |
| 41 | `app_seam_staff_security_owner` | staff 2FA/TOTP/recovery | 12 |
| 42 | `app_seam_patient_lfk_media_owner` | patient LFK/platform-media entitlement | 4 |

Каждый owner имеет `NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`, не имеет
членов, не владеет relation/schema/database и владеет только функциями своего шва. Доступ к relations — exact
column/operation grants и policies. `saas_telemetry_owner` и `saas_system_health_owner` обоснованы соответственно
global isolation telemetry и curated cross-tenant health, а не тем, что они уже существовали.

Все TEST-функции владельца login-migrator получают NOLOGIN owners из таблицы; ни одна функция не остаётся у login.
`start_provisioned_organization_trial()` уходит от runtime-role `app_platform_settings` к
`app_seam_specialist_provision_owner`. `app_owner` в целевом составе отсутствует. Ни login-, ни runtime-role не
владеет definer-функцией.

Body census evidence/30 не нашёл ни одной функции, которой нужен `BYPASSRLS`: cross-tenant чтение даётся только
exact policies на named relations/columns.

Для каждой definer-функции обязательны:

- function-level `search_path`, содержащий только trusted schemas с `pg_catalog` и `pg_temp` последним; все
  application relations/functions/types/operators в body квалифицированы схемой;
- database `TEMPORARY` отозван у `PUBLIC` и runtime logins; runtime не имеет `CREATE` ни в одной schema из path;
- `EXECUTE` отозван у `PUBLIC` по умолчанию. Весь DEV `PUBLIC`-set из census evidence/30 Q5 отзывается, а нужные
  pre-session функции получают exact caller только через порт;
- port-entrypoint проверяет signed exact function/purpose/arguments до первого relation access; custom GUC и
  caller id не authority;
- internal/trigger function не имеет `EXECUTE` у login/runtime, принимает только объявленное ребро вызова от
  owner и проверяет signed root-call той же транзакции; caller-controlled часть её входа уже входит в hash root;
- объявленная прямая и транзитивная relation/trigger/constraint/function surface;
- exact caller list; функция без доказанного caller сохраняет owner, но не получает runtime `EXECUTE`.

Фактические **72** DEV-функции с `PUBLIC EXECUTE` получены и помечены `REVOKE` точной Q5-командой (на DEV она
печатала `72|231`, на TEST — `0|244`):

```sql
BEGIN TRANSACTION READ ONLY;
WITH funcs AS (
  SELECT p.oid,p.proacl,p.proowner
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.prosecdef AND n.nspname IN ('app','public','integrator','app_ext')
), expanded AS (
  SELECT DISTINCT f.oid,x.grantee
  FROM funcs f
  CROSS JOIN LATERAL aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) x
  WHERE x.privilege_type='EXECUTE'
)
SELECT count(DISTINCT oid) FILTER (WHERE grantee=0),count(DISTINCT oid) FROM expanded;
ROLLBACK;
```

Cross-tenant `USING (true)` допустима только exact NOLOGIN seam owner на exact relation/columns за обязательным
restrictive signed-call gate. Для principal-aware швов она запрещена. Две policies разных owners на
`email_send_cooldowns` объявляются обе: слияние OTP и reminder owners расширило бы соседние credential surfaces.

## 6. Декларация, генератор и полный объектный контур

Декларация перечисляет только выданное. Генератор одной транзакцией отзывает всё управляемое у `PUBLIC`, login-,
runtime-, service- и owner-ролей, затем выдаёт объявленное и делает двустороннюю сверку. Обязательный объектный
контур:

- database: `CONNECT`, `CREATE`, `TEMPORARY`, owner и per-role/per-database settings;
- schemas: owner, `USAGE`, `CREATE`;
- ordinary/partitioned tables, columns, RLS/FORCE, permissive/restrictive policies and commands;
- sequences (`USAGE/SELECT/UPDATE`) — default и уже существующие;
- functions/procedures: owner, `SECURITY`, `EXECUTE`, signature, `proconfig/search_path`;
- views: owner и `security_invoker=true`; любой definer-view — отдельный именованный seam;
- materialized views и foreign tables: по умолчанию запрещены для managed data; появление требует отдельной
  declaration/wall, иначе generator/sweep падает;
- large objects и их ACL: tenant/medical payload в large objects запрещён; любое разрешённое исключение exact и
  объявленное;
- triggers, trigger functions, constraints и cascade dependencies;
- FDW, foreign servers, user mappings, publications, subscriptions, replication slots, extensions, languages,
  tablespaces и их owners/ACL.

Generator, preflight и sweep получают список seam owners из декларации; число швов не зашивается в оснастку.

Relations, schemas и managed database принадлежат поимённым `NOLOGIN` owner-ролям либо `postgres`, но не login,
runtime или seam owner. Это исключает скрытую силу владельца и сохраняет действие `FORCE RLS`.

Cluster-wide allowlist строится из фактических `pg_roles`, owners и memberships. Только `postgres` может иметь
`SUPERUSER`, `REPLICATION`, server-file/program роли, `pg_read_all_data`/`pg_write_all_data`, создавать
subscriptions/extensions либо владеть managed database/tablespace. У migrator и приложения явно false/absent:
`SUPERUSER`, `CREATEDB`, `CREATEROLE`, `REPLICATION`, `BYPASSRLS`; отсутствуют memberships в
`pg_read_server_files`, `pg_write_server_files`, `pg_execute_server_program` и других powerful predefined roles.
FDW/server/user mapping или extension вне exact allowlist — FAIL, не «неизвестный объект».

Default privileges закрываются отдельно для каждого возможного creator. Event trigger проверяет `CREATE TABLE` и
`ALTER TABLE`, включая позднее добавление scope-колонки, и либо устанавливает объявленную стену, либо отклоняет
DDL; trigger защищён от рекурсии и принадлежит `postgres`. CI запрещает ACL/policy/role DDL в новых migrations и
требует declaration для нового объекта. Sweep страхует те же каталожные инварианты, не заменяя generator.

## 7. Миграционное окно без переживающей crash элевации

`<env>_migrator` никогда не получает persistent `BYPASSRLS`. Managed database остаётся во владении `postgres`,
а object owners — NOLOGIN.

Migration wrapper открывает одно контролируемое соединение `postgres` и одну транзакцию. Внутри неё он выдаёт
migrator только нужные временные owner-memberships/DDL grants и исполняет schema changes через
`SET LOCAL ROLE <env>_migrator`; backfill, которому действительно нужно пройти `FORCE RLS`, выполняется после
`RESET ROLE` самим поимённым `postgres`; затем временные grants/memberships отзываются и post-state проверяется
**до commit**. Grant, migration, cleanup и catalog assertions атомарны.

Crash, `SIGKILL`, потеря соединения или host до commit откатывают и migration, и временную выдачу; trap не является
границей безопасности. После commit у migrator остаётся только standing access из §3.1. Никакая прикладная роль не
имеет обхода ни внутри, ни вне окна; единственное объявленное исключение — суперпользователь `postgres` в
контролируемой миграционной/локальной административной операции.

## 8. Исполняемая приёмка

Одна команда использует фактические каталоги, а не декларацию, и печатает principal/object/result для каждого
пункта:

1. красный baseline на непочиненной базе;
2. каждый login из `pg_roles` напрямую с верным паролем и без port key: отказ, ноль строк, log event;
3. каждая достижимая role/membership combination без attestation/context: тот же громкий отказ;
4. `PUBLIC`: нет `CONNECT`, schema `USAGE`, `TEMPORARY` и default privileges;
5. каждая фактическая definer-функция, включая все 244 census-signatures: без exact signed call отказ; owner не
   login/runtime; `PUBLIC EXECUTE` отсутствует;
6. exact-role/transaction/backend/argument negative controls: повтор, другая role, transaction, backend и один
   изменённый аргумент дают `42501`;
7. positive controls через оба порта: pre-session получает только минимальный результат; staff/patient/platform,
   service и integrator видят только объявленную область;
8. `row_security=off` выявляет silent filtering; ни один ожидаемый отказ не засчитывается без server-log event;
9. сверка ACL/policies/owners охватывает object classes §6, triggers/constraints и powerful cluster paths;
10. crash injection до commit миграционной транзакции оставляет migrator без memberships/grants/BYPASS и каталог
    без частично применённой migration.

Исключения перечислены поимённо: `postgres`; migrator — только внутри атомарной транзакции §7 и без собственного
`BYPASSRLS`. Положительный контроль обязателен: стена, не пустившая порты, является поломкой.

## 9. Закрытие 12 gaps ревью полноты

| Gap | Статус в дизайне | Чем закрыт |
|---|---|---|
| G1 pre-session/cross-tenant без ключа | закрыт | port attestation обязательна для каждого seam; function/purpose/args подписаны |
| G2 login наследует runtime-права | закрыт | login `NOINHERIT`, memberships `INHERIT FALSE/SET TRUE/ADMIN FALSE`, прямых ACL нет |
| G3 context не связан с role/transaction | закрыт | DB/login/exact role/backend start/transaction binding; transaction-local lifetime; bad connection уничтожается |
| G4 HMAC verifier противоречит env-only | закрыт | asymmetric private keys только в env портов; в БД только public verification keys |
| G5 неполный definer census | закрыт | 244 функции распределены по 42 швам; ноль login/runtime owners |
| G6 caller id/GUC становится authority | закрыт | canonical args входят в signed call; GUC без валидной подписи отвергается |
| G7 unsafe search path/TEMP | закрыт | pinned trusted `search_path`, qualified objects, TEMP/CREATE revoked, `proconfig` сверяется |
| G8 permissive OR снимает AND | закрыт | обязательная restrictive gate; conjunction — restrictive/единая policy; catalog invariant |
| G9 FK/UNIQUE/triggers вне модели | закрыт | dependency surface в declaration; tenant keys либо exact signed seam; uniform external denial |
| G10 sequences/views/matview/foreign/LO вне модели | закрыт | полный object contour §6, default deny и двусторонняя сверка |
| G11 crash оставляет BYPASS | закрыт | migrator не получает BYPASS; одно соединение/транзакция; crash rollback |
| G12 replication/files/program/FDW/extensions/DB owner | закрыт | cluster-wide allowlist и отдельная acceptance-инвентаризация всех мощных путей |

Это закрытие **в проекте**, не утверждение о реализованной БД. Green status Ф1 не заменяет Ф4–Ф8 и живую
приёмку.

## 10. РАЗВИЛКИ, ЗАКРЫТЫЕ В ДИЗАЙНЕ

Каждая строка ниже — ранее открытый выбор и его явное инженерное закрытие по правилу владельца «меньше доступа».

1. **Port proof или identity proof:** разделены; port proof обязателен всегда, identity добавляется позже — иначе
   pre-session снова получает данные только по паролю login.
2. **HMAC secret в БД или env:** asymmetric signing; private key только в env, public key в БД — dump не даёт
   возможности подписывать principal.
3. **Платформенная отметка:** введён класс `platform` со своим raising accessor — меньше, чем открыть global role
   по membership, и выполняет громкий отказ.
4. **Неизвестный без соединения или pre-session через БД:** разрешена только attested транзакция webapp без
   identity и с exact seam — меньше, чем голый bootstrap login, и явно отмечено расхождение с буквальной строкой.
5. **Один или два webapp login:** два — staff login не доступен предсессионному пути даже при ошибке role switch.
6. **Медиа-воркер как DB client или через порт:** отдельный compute process остаётся, но DB вызывает через internal
   webapp port — отдельного DB входа и секрета у него нет.
7. **Telemetry global или tenant:** global только через семь функций шва 36, без table ACL и с port call proof —
   уже прямого доступа не выдаётся.
8. **Три integrator service-роли или одна:** остаются две write-роли; diagnostic-role удалена, probe идёт exact
   function шва 31 — меньше и объединённой широкой роли, и read-role с table ACL.
9. **Отдельная роль очистки или `app_worker`:** одна `app_worker` до live evidence различия — новая роль без
   доказанного отдельного набора прав не создаётся.
10. **Сохранять ли `PUBLIC EXECUTE`:** весь DEV `PUBLIC`-set отзывается; pre-session получает exact login grant и
    signature gate — PUBLIC шире доказанной потребности.
11. **Staff cross-user `close_active_user_phone_history`:** staff `EXECUTE` не выдаётся; patient-self остаётся —
    недоказанный cross-user доступ закрыт до конкретного live-отказа.
12. **Caller `list_platform_organization_members`:** runtime `EXECUTE` пока не выдаётся; функция остаётся в шве 34
    без caller до доказанной потребности — меньше, чем угадать platform caller.
13. **132 DEV-функции или весь кластер:** принят полный набор 244/42 из census 30 — меньший census оставлял скрытую
    силу login/runtime owners.
14. **Владельцы `saas_telemetry_owner`, health и discovery:** telemetry/health остаются отдельными швами 36/37;
    discovery входит в шов 25 — функция не наследует соседнюю поверхность только из-за прежнего owner.
15. **`app_owner` оставить переходно или удалить:** в target отсутствует — контейнер общей силы не сохраняется.
16. **`require_staff_security_self_user_id` definer или invoker:** становится invoker/accessor без table ACL; его
    контракт остаётся, привилегия не выдается без потребности.
17. **Два owners на `email_send_cooldowns` или слияние:** остаются две exact policies — слияние owners дало бы
    reminder-функциям OTP/password surface.
18. **Десять различающихся DEV/TEST bodies:** target body выбирает принятая migration chain/live-run; union прав
    двух версий запрещён как лишний доступ.
19. **Кто делает backup после стены:** существующий backup переводится на локальную административную операцию
    `postgres`; новый постоянный backup login и migrator-wide read не создаются.
20. **`USING (true)` для service scope NONE:** разрешено только exact role/table за restrictive signed port gate;
    общий service-policy или доступ без gate запрещён.

Шесть повторов round 1 удалены: правило про BYPASS, принцип недовыдачи, два изменения контекста, механику стены,
запрет отдельных worker-connections и acceptance-критерий каждый изложены один раз в несущем разделе. Седьмой
излишек — `app_operational_diagnostic` — удалён без расширения прав.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет. Все развилки, поднятые evidence/25, evidence/26 и ревью 28/29, перечислены в §10 и закрыты в сторону меньшего
доступа; deployment drift из evidence/30 не превращён в union grants.
