# SCHEME revision 4 — целевой слой прав БД BersonCareBot

Authority: [`OWNER_DECISIONS.md`](../../OWNER_DECISIONS.md), «Права БД, роли и стены», затем [`PLAN.md`](PLAN.md).
Текущий каталог используется только для проверки; право появляется лишь из доказанной потребности.

## 1. Схема без SQL

У данных две прикладные двери: порт **webapp** и порт **integrator**. DB-пароль открывает только соединение.
Перед первым прикладным запросом порт предъявляет высокоэнтропийный ключ из env узкому verifier; база хранит только
SHA-256 hash этого ключа. Hash из dump не устанавливает контекст, потому что verifier принимает исходный ключ.

В PostgreSQL стоят две последовательные стены:

1. до принятия контекста соединение остаётся в login-роли без table/column/sequence ACL и без достижимого
   `SET ROLE` к роли с такими ACL; поэтому любой table statement, включая `WHERE false` и `LIMIT 0`, получает
   statement-level `42501` от permission check, а PostgreSQL сам пишет ERROR в server log до чтения строк;
2. после принятия контекста exact grants открывают только нужные операции, а `FORCE ROW LEVEL SECURITY` и policies
   фильтруют строки уже доказанного principal. Policy не несёт гарантию громкого отказа без principal.

Неизвестный человек не получает DB credentials или соединение. До входа webapp знает, что обслуживает конкретный
pre-session request, и открывает за него только короткую attested-транзакцию с exact purpose/args; человеческого
principal в ней нет. После входа порт устанавливает класс `staff`, `patient` или `platform` и точные идентификаторы.
Integrator и фоновые работы устанавливают service-контекст, а не выдуманную человеческую личность. Порт не знает
класс запроса — соединение в pool не выдаётся.

Обычными объектами приложения владеет `app_object_owner`. Это не возврат прежнего `app_owner`: новая роль не имеет
`LOGIN`, `BYPASSRLS`, членов или definer-функций и недостижима вне миграционного окна. Под `FORCE RLS` владелец без
`BYPASSRLS` подчиняется policies; следовательно, владение не создаёт скрытого runtime-обхода. Владельцы 42 швов
владеют только функциями своего шва и получают только точные права на нужные relations.

Недостающее право не угадывается заранее: оно остаётся невыданным до конкретного отказа живого прогона Ф7, после
которого выбирается одно из четырёх действий — убрать обход порта, выдать exact право, провести через шов или
признать путь лишним.

## 2. Ключ, verifier и контекст

### 2.1 Исполняемый verifier

`app.install_port_context(...)` — единственный `SECURITY DEFINER` verifier шва 1. Он использует уже установленный
`pgcrypto.digest` и до успеха не открывает runtime-role. Из login-роли разрешены только
`BEGIN/COMMIT/ROLLBACK`, `app.issue_port_challenge(...)`, verifier и exact pre-session entrypoints после attestation.

`app_ext.port_key_hashes` хранит `key_id`, порт, 32-byte `sha256_key_hash`, `not_before`, `not_after`, `revoked_at`.
Ключ — случайные 32 bytes в env соответствующего порта. Порт передаёт его verifier как binary bind parameter по TLS,
не SQL-literal; parameter не пишется в application/server log. Verifier вычисляет `digest(p_port_key, 'sha256')` и
сравнивает 32 bytes с единственной active записью exact `key_id`/port. Таблицей владеет `app_object_owner`; только
`app_seam_context_owner` имеет `SELECT`, миграционный канал меняет строки в окне §7, остальные роли имеют ноль ACL.
Ключа в БД, backup и dump нет.

### 2.2 Challenge, привязки и single use

1. Внутри `BEGIN`, до `SET LOCAL ROLE`, exact login вызывает
   `app.issue_port_challenge(name, smallint, text, bytea) → bytea`. Функция генерирует 32 bytes через
   `pgcrypto.gen_random_bytes`, записывает `ISSUED` state в private `app_ext.port_context_state` и возвращает nonce;
   owner — `app_object_owner`, читать/менять может только шов 1.
2. State сервером связан с database OID, `session_user`, target role, backend PID и `backend_start`, текущим
   transaction id, классом/principal identifiers, purpose, expiry не далее 30 seconds и SHA-256 exact typed args.
   Порт передаёт nonce, `key_id`, исходный ключ и те же значения verifier; caller-generated binding не принимается.
3. В одной операции verifier повторно получает server-derived DB/backend/transaction identity, сверяет active
   key/hash, все bindings и expiry, затем переводит nonce `ISSUED → ACCEPTED`. Несовпадение и второй consume дают
   `42501`; до `ACCEPTED` переход к exact runtime-role невозможен.
4. Accepted state привязан к одному backend и transaction. Смена role вне объявленного перехода, новая transaction,
   повтор PID с другим `backend_start`, истечение срока или возврат connection в pool делает его недействительным;
   ошибка установки/очистки уничтожает connection. Private state читают только функции шва 1, tenant-роли — никогда.

Replay готового вызова не работает без того же backend/transaction и свежего single-use nonce. Hash не защищает
слабый пароль от offline-перебора, поэтому ключ не пароль человека, а 256-bit random value. Компрометация env/памяти
порта раскрывает исходный ключ до revoke — это именованный остаточный риск; read/dump hash такого свойства не даёт.
Rotation добавляет новый `key_id`+hash, выкатывает новый env, держит короткое перекрытие `not_before/not_after`,
затем ставит `revoked_at` старому; начатый challenge старого key после revoke не принимается.

### 2.3 Principal и service context

Принятый контекст содержит один класс:

- `staff`: `actor_user_id` и `organization_id`;
- `patient`: `actor_user_id`, `organization_id`, `patient_user_id`;
- `platform`: только platform marker; медицина роли недоступна;
- `pre_session`: webapp request id, exact function/purpose/args, без tenant identity;
- `integrator` или `service`: integrator id либо exact job/probe purpose.

`app.current_org_id()`, `app.current_patient_user_id()`, `app.current_integrator_user_id()` и
`app.require_platform_principal()` читают только accepted private state и бросают `42501` при несовпадении. Custom
GUC, caller UUID/email/delivery id сами полномочием не являются.

Жизненный цикл обоих портов: `BEGIN` → чистый state → challenge → verify/install context → переход в exact role →
queries → `COMMIT/ROLLBACK`. Для следующей transaction proof выпускается заново.

## 3. Принципалы

### 3.1 Login и membership

| Login | Единственная точка входа | Standing access |
|---|---|---|
| `<env>_migrator` | deploy/migration channel | только `CONNECT`; owner-memberships существуют лишь внутри §7 |
| `<env>_webapp_staff` | staff/platform/service webapp | verifier шва 1; exact pre-session entrypoints; ноль table ACL |
| `<env>_webapp_patient` | patient и pre-session webapp | verifier шва 1; exact pre-session entrypoints; ноль table ACL |
| `<env>_integrator` | integrator и его jobs | verifier шва 1; exact integrator entrypoints; ноль table ACL |

Все четыре: `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`, прямых object ACL нет.
До accepted context нет standing membership с `SET TRUE` к роли, у которой есть table ACL. Verifier атомарно
устанавливает context и разрешает только exact target текущего backend/transaction; клиент не может сделать этот
переход отдельным вызовом до проверки ключа. Любое прямое или транзитивное ребро login → table-granted role без
этой привязки — FAIL свипа.

| Login после accepted context | Exact target roles |
|---|---|
| `<env>_migrator` | нет standing membership |
| `<env>_webapp_staff` | `app_staff`, `app_clinic_billing`, `app_platform_settings`, `app_worker`, `app_operational_media_worker`, `saas_telemetry_operator` |
| `<env>_webapp_patient` | `app_patient` |
| `<env>_integrator` | `app_operational_delivery_worker`, `app_operational_scheduler` |

`postgres` — поимённый локальный суперпользователь, не прикладной login. Глобальный администратор отдельного login
не имеет.

### 3.2 Runtime-роли

Каждая роль — `NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT` и не состоит в
другой runtime-role.

| Роль | Порт | Scope | Единственная потребность |
|---|---|---|---|
| `app_staff` | webapp | `ORG` | лечебная и организационная работа своей клиники |
| `app_patient` | webapp | `OWN` | свои данные и тесты своей программы, без внутренних полей |
| `app_clinic_billing` | webapp | `ORG` | коммерция своей клиники после application gate |
| `app_platform_settings` | webapp | `PLATFORM` | тарифы, счета и каркас организаций; медицина исключена |
| `app_worker` | webapp | `NONE` | webapp jobs, retention и очистка журналов |
| `app_operational_media_worker` | webapp | `NONE` | exact media/transcode/statistics operations |
| `saas_telemetry_operator` | webapp | `PLATFORM_SERVICE` | exact functions телеметрии изоляции, ноль table ACL |
| `app_operational_delivery_worker` | integrator | `NONE` | exact queue/delivery operations |
| `app_operational_scheduler` | integrator | `NONE` | idempotency, ticks, incidents и probes без delivery mutation |

`app_operational_diagnostic` отсутствует: health вызывает exact probe шва 31. Media compute обращается к
authenticated internal webapp port; отдельного DB-входа в target у него нет.

## 4. Стены данных

До accepted context ни одна достижимая роль не имеет table grant: permission check несёт безусловный громкий
отказ. После context доступ для каждой relation/command равен AND из exact object/column grant, `ENABLE`+`FORCE RLS`
и business policy exact role. Для `INSERT/UPDATE` тот же scope стоит в `WITH CHECK`. Restrictive policy повторно
проверяет raising accessor; business policies могут складываться через OR только за ней.

- **Staff:** строка принадлежит `current_org_id()` напрямую либо через объявленный scoped parent.
- **Patient:** совпадают организация и patient либо доказанная enrollment/program/appointment связь; отсутствие
  patient-policy означает запрет.
- **Platform:** `require_platform_principal()`; медицина роли недоступна.
- **Service/integrator:** exact port/role/purpose; при наличии row scope он связан с attested args.
- **Auth/context:** runtime не имеет table ACL; только exact attested seam.

`USING (true)` допустима только для exact service runtime-role либо seam owner, exact relation/columns и операции,
когда потребность охватывает всю эту relation; accepted context и restrictive policy обязательны. Для
principal-aware швов она запрещена. На `media_files` tenant и media-service используют разные policies; `NOINHERIT`
не даёт им сложиться. Обе exact policies разных owners на `email_send_cooldowns` остаются раздельными.

Writable surface декларации включает triggers и callees, FK, UNIQUE/EXCLUDE и cascades. Межстенный key содержит
tenant key либо mutation идёт через exact attested seam с одинаковым внешним отказом.

## 5. Definer-швы и counts

Целевой seam 1 содержит ровно эти signatures: `issue_port_challenge`, `install_port_context`,
`current_integrator_user_id`, `current_org_id`, `current_patient_user_id`, `require_platform_principal`.
`release_principal_context` и `reset_principal_context` удаляются из definer surface: lifecycle держит transaction
binding private state. Это замена двух signatures двумя, а не утверждение, что census-набор не изменился.

| База | Целевые definer-signatures | Логических швов | Как получено |
|---|---:|---:|---|
| `bcb_webapp_dev` | 231 | 42 | фактические 231 минус две снятые signatures плюс две новые |
| `bersoncarebot_test` | 244 | 42 | фактические 244 минус две снятые signatures плюс две новые |

Это варианты декларации, не константы verifier. Acceptance обходит фактический `prosecdef`-набор текущей базы и
двусторонне сравнивает exact signatures с её вариантом декларации; TEST-only functions не требуются на DEV.

| # | Owner | Шов | TEST/union count |
|---:|---|---|---:|
| 1 | `app_seam_context_owner` | port/principal context | 6 |
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
| 42 | `app_seam_patient_lfk_media_owner` | patient LFK/media entitlement | 4 |

Каждый seam owner имеет `NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`, не
имеет членов и владеет только exact definer-signatures своего шва. Relation access — exact columns/operations и
policies. Function `search_path` содержит только trusted schemas, `pg_catalog` и `pg_temp` последним; application
objects в body квалифицированы. Runtime не имеет `TEMPORARY`/schema `CREATE`; `PUBLIC EXECUTE` отозван.

Internal/trigger function не получает runtime `EXECUTE`, принимает только объявленное ребро и проверяет attested
root-call. Function без доказанного caller остаётся без runtime `EXECUTE`. Десять различающихся DEV/TEST bodies не
получают union прав: surface берётся только из принятой migration chain для среды.

## 6. Владение, декларация и полный объектный контур

### 6.1 Роль владельца и exact map

`app_object_owner` имеет `NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`, не
имеет standing members и не владеет `SECURITY DEFINER` functions. Её единственная потребность — стабильное
владение обычными application objects и выполнение их DDL в §7.

Каждый managed object получает owner из этой карты; второго fallback нет:

| Object class | Exact owner |
|---|---|
| managed database; tablespaces; extensions; extension members; languages; event trigger/function; FDW/server/user mapping; publication/subscription | `postgres` |
| schemas `public`, `app`, `integrator`, `app_ext` | `app_object_owner` |
| ordinary/partitioned tables and partitions, indexes, sequences, views, matviews, foreign tables, allowed large objects | `app_object_owner` |
| application types/domains/collations and `SECURITY INVOKER` functions/procedures | `app_object_owner` |
| `SECURITY DEFINER` application functions | exact seam owner из §5 |
| system/catalog objects | exact bootstrap owner из PostgreSQL install allowlist, обычно `postgres` |

Trigger/constraint ownership следует owner relation; replication slots не имеют независимого owner и допускаются
только как exact administrative object `postgres`. Любой новый class без строки в декларации — FAIL. Все прежние
objects `app_owner`, login-migrator или seam owner переназначаются по этой карте; `app_owner` после нулевого census
ownership/membership удаляется.

### 6.2 Декларация и generator

Декларация перечисляет только выданное. Для каждого object она содержит exact identity, owner, ACL, policy,
attributes и dependencies. Generator одной транзакцией отзывает всё управляемое у `PUBLIC`, login-, runtime-,
service- и owner-ролей, затем назначает карту §6.1, выдаёт объявленное и выполняет двустороннюю сверку.
Инвариант: login без context не имеет ACL или `SET`-пути к table-granted role; любой путь — FAIL независимо от policy.

Контур включает database `CONNECT/CREATE/TEMPORARY/settings`; schemas; tables/columns/RLS/policies; sequences;
functions/procedures/signatures/security/proconfig; invoker views; matviews/foreign tables; large objects; triggers,
constraints/cascades; roles/memberships; FDW/servers/mappings; publications/subscriptions/slots; extensions,
languages и tablespaces. Matview/foreign table/large object с managed data по умолчанию запрещён.

Default privileges закрываются для каждого creator. Event trigger `postgres` проверяет `CREATE TABLE` и
`ALTER TABLE`, включая позднюю scope-column, и ставит объявленную стену либо отклоняет DDL; защита от рекурсии
обязательна. CI запрещает ACL/policy/role DDL в migrations и требует declaration для нового объекта. Cluster
allowlist строится из фактических roles, owners и memberships; мощный attribute, predefined role или object вне
exact allowlist — FAIL.

## 7. Миграция, backup и restore

Окно — одно локальное соединение `postgres` и одна транзакция. Wrapper временно выдаёт `<env>_migrator`
`INHERIT FALSE, SET TRUE, ADMIN FALSE` membership ровно в owners затрагиваемых объектов, затем делает
`SET LOCAL SESSION AUTHORIZATION <env>_migrator` и перед каждым schema DDL — `SET LOCAL ROLE <declared_owner>`.
Новый object поэтому сразу принадлежит `app_object_owner`, exact seam owner либо `postgres`; существующий DDL
получает owner-power той же роли. После `RESET ROLE; RESET SESSION AUTHORIZATION` необходимый backfill исполняет
`postgres`. Временные memberships отзываются, exact owner/ACL/policy post-state проверяется до commit.

Grant, migration, backfill, revoke и assertions атомарны: crash до commit откатывает всё; после commit у migrator
остаётся standing state §3.1. Положительный контроль применяет representative real migration на disposable clone,
проверяет owner нового и изменённого object, успешный backfill и чистый post-state. Отрицательный контроль убивает
то же окно до commit и проверяет полный rollback.

Backup — локальная административная операция `postgres`, не чтение через application URL. Restore старых dumps
идёт с `--no-owner`; extensions/admin objects создаёт `postgres`, application schema/data восстанавливается через
`SET ROLE app_object_owner`, после чего generator назначает exact seam owners и gate проверяет карту. Старые
`OWNER TO app_owner`/login из dump не исполняются.

## 8. Исполняемая приёмка

Одна команда использует фактические каталоги и server log и печатает principal/object/result:

1. красный baseline: сегодняшнее прямое подключение без port key отдаёт данные;
2. каждый login из `pg_roles` с верным паролем, но без key: нет table ACL и перехода в table-granted role; первый
   table statement отклонён permission check, строк нет, log event есть;
3. каждая role и membership combination без exact context, включая `WHERE false` и `LIMIT 0`: `42501`; отдельный
   свип доказывает ноль login/role paths, где table grant достижим без accepted context;
4. `PUBLIC`: нет `CONNECT`, schema `USAGE`, `TEMPORARY` и defaults;
5. каждая фактическая definer-signature текущей базы: exact declaration owner/caller/surface, без attested call отказ;
6. negative vectors: wrong key, dump hash вместо ключа, другая DB/login/role/backend/start/transaction/class/purpose/
   arg, expiry, второй consume и replay;
7. positive controls через оба порта: pre-session, staff, patient, platform, service и integrator получают только
   объявленный результат; неизвестный портом request не обслуживается;
8. после valid context RLS/policy fault injection и `row_security=off` выявляют silent filtering/лишнюю видимость;
   до context громкость отдельно доказывается permission denial, не исполнением policy;
9. owner/ACL/policy/function/role/cluster census двусторонне совпадает с вариантом декларации для этой базы;
10. положительный и crash-контроли миграционного окна §7 оба проходят;
11. зелёный target и снова красный после отката одной независимой поломки каждого механизма.

## 9. РАЗВИЛКИ, ЗАКРЫТЫЕ В ДИЗАЙНЕ

1. **Port proof или identity proof:** независимы; key proof обязателен всегда, identity/service context уточняет его.
2. **C-verifier с асимметричной подписью или hash:** SHA-256 hash; 256-bit ключ только в env, БД не хранит usable
   secret, а PostgreSQL 16 проверяет штатным `pgcrypto` — тот же dump-boundary без нового компонента.
3. **Policy/standing membership или grant/context transition:** второе; без context нет `SET`-пути к table grant,
   zero-scan падает на permission check, а policies фильтруют только после principal — меньше исходного доступа.
4. **Protocol оставить исполнителю или зафиксировать:** одна private SQL-state, key/hash, server nonce, DB/backend/
   transaction/expiry/purpose/args bindings, atomic consume и rotation заданы в §2 — меньше места для replay.
5. **Платформенная отметка:** отдельный raising accessor — меньше membership-only global access.
6. **Неизвестный без соединения или pre-session через БД:** человек соединения не получает; известный webapp port
   получает только attested pre-session purpose/args — меньше bootstrap table access.
7. **Один или два webapp login:** два — pre-session не достигает staff memberships.
8. **Media worker как DB client или через порт:** compute остаётся, target DB path идёт через webapp без своего login.
9. **Telemetry global или tenant:** только семь exact functions шва 36, ноль table ACL.
10. **Три integrator service-роли или две:** две write-роли; diagnostic удалён, probe идёт швом 31.
11. **Отдельная cleanup-role или `app_worker`:** одна роль до live evidence отдельной поверхности.
12. **Сохранять `PUBLIC EXECUTE`:** нет; pre-session получает exact login grant после attestation.
13. **Staff cross-user phone-history:** `EXECUTE` не выдаётся до конкретного live-отказа.
14. **Caller `list_platform_organization_members`:** runtime `EXECUTE` пока не выдаётся.
15. **132 functions или полный каталог:** exact per-database `prosecdef` census; меньшая выборка оставляла owners мимо
    проверки, а TEST-число как константа ломало DEV.
16. **Telemetry/health/discovery owners:** telemetry и health — швы 36/37, discovery — шов 25.
17. **`app_owner` удалить вместе с владением или заменить owner:** заменить на `app_object_owner` по конструкции и
    обоснованию §1/§6.1 — меньше runtime-силы, чем object под login или широким definer owner.
18. **Один object owner или несколько:** один для обычных application objects; definer functions остаются у 42
    seam owners, admin objects у `postgres`. Дополнительный owner без отличающейся потребности был бы лишней ролью.
19. **Кто владеет новым DDL:** schema DDL выполняется как declared owner, не как migrator; post-hoc угадывания нет.
20. **Context seam сохранить по старым именам:** `release/reset` заменены `issue challenge/platform accessor`; exact
    set изменён при неизменной мощности.
21. **Counts в acceptance:** catalog-derived per database, не hardcoded TEST total.
22. **`require_staff_security_self_user_id`:** invoker/accessor без table ACL.
23. **Два owners на `email_send_cooldowns`:** две exact policies; слияние расширило бы credential surfaces.
24. **Разные DEV/TEST bodies:** права только принятого body, не union.
25. **Кто делает backup/restore:** локальный `postgres`; нового standing backup login и migrator-wide read нет,
    legacy owners dump игнорируются и нормализуются декларацией.
26. **`USING (true)` для service `NONE`:** только exact role/object/operation после grant+context+restrictive gates.
27. **Crash-control или оба migration controls:** обязательны и positive real migration, и crash rollback.

## 10. ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет. §9 содержит принятые инженерные развилки, а не незакрытые вопросы; каждое направление оставляет меньше
standing/runtime access и не ослабляет owner-критерий.
