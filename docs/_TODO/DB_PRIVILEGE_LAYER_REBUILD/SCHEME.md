# SCHEME revision 5 — целевой слой прав БД BersonCareBot

Authority: [`OWNER_DECISIONS.md`](../../OWNER_DECISIONS.md), «Права БД, роли и стены», затем [`PLAN.md`](PLAN.md).
Текущий каталог используется только для проверки; право появляется лишь из доказанной потребности.

## 1. Схема без SQL

У данных две прикладные двери: порт **webapp** и порт **integrator**. Их обслуживают три прикладных login: отдельные
webapp staff и patient плюс integrator; четвёртый login принадлежит deploy-каналу. DB-пароль открывает соединение,
но не данные. Перед первым прикладным запросом порт отвечает на одноразовый challenge производным proof; исходный
32-byte key остаётся только в env порта и никогда не становится SQL-параметром.

Переход login → runtime-role держит штатное постоянное членство
`GRANT <runtime_role> TO <login> WITH INHERIT FALSE, SET TRUE, ADMIN FALSE`. Иного условного механизма у PostgreSQL
16 нет: `SET ROLE` проверяет membership `session_user`; `SECURITY DEFINER` не меняет `session_user`, а смена роли
внутри функции не переживает её возврат. Login поэтому не наследует права роли и не может передать членство дальше,
но технически может выполнить `SET LOCAL ROLE` до установки контекста.

Громкий отказ несут два разных механизма:

1. сессия, которая не переключилась, остаётся в login-роли без application table/column/sequence privileges;
   обращение к прикладной relation падает `42501` на permission check до чтения строк, включая `WHERE false` и
   `LIMIT 0`, и PostgreSQL пишет ERROR в server log;
2. сессия, которая переключилась без принятого контекста, попадает под обязательную restrictive policy. Когда
   запрос достигает существующих строк и стена их скрывает, policy вызывает accessor контекста, тот бросает
   `42501`, и PostgreSQL пишет ERROR в server log.

### 1.1 Именованная граница: системный каталог и SQL вне прикладных данных

Гарантия стены относится к управляемым прикладным relations. `pg_catalog`, `information_schema` и SQL без обращения
к прикладной relation (`SELECT 1`, `VALUES`) остаются доступны в штатном объёме PostgreSQL. Каталог содержит метаданные
ролей, объектов, policies и функций, но не данные клиник, врачей или пациентов. Отзывать его видимость нельзя:
это ломает клиенты, migration tools и `psql` и не применяется как прикладная tenant-стена.

### 1.2 Именованная граница: настоящий пустой результат

RLS-policy вычисляется для строк, которые запрос реально рассматривает. Если подходящих строк нет — в том числе
из-за `WHERE false`, `LIMIT 0` или пустой таблицы, — accessor не вызывается и допустим тихий ноль: стена ничего не
скрыла. Если данные существуют, достигаются запросом и удерживаются именно отсутствующим/несовпавшим контекстом,
accessor вызывается и бросает `42501`. Это точный достижимый смысл owner-критерия без нового statement-компонента.

### 1.3 Явное расхождение с `PLAN.md` Ф3б

Буквальная строка Ф3б «неизвестный не получает соединения» не совпадает с целевой auth-механикой. Неизвестный
человек не получает DB credentials или собственное соединение, но до входа известный webapp port открывает короткую
attested pre-session transaction для exact request/purpose/args без человеческого principal. Это явно отмеченное
расхождение, а не молчаливое смягчение Ф3б; его формулировка остаётся единственным вопросом владельцу в §10.

До входа webapp знает конкретный pre-session request и открывает за него только короткую attested-транзакцию с
exact purpose/args; человеческого principal в ней нет. После входа порт устанавливает класс `staff`, `patient` или
`platform` и точные идентификаторы.
Integrator и фоновые работы устанавливают service-контекст, а не выдуманную человеческую личность. Порт не знает
класс запроса — соединение в pool не выдаётся.

Обычными объектами приложения владеет `app_object_owner`: роль не имеет `LOGIN`, `BYPASSRLS`, членов или
definer-функций и недостижима вне миграционного окна. Под `FORCE RLS` владелец без
`BYPASSRLS` подчиняется policies; следовательно, владение не создаёт скрытого runtime-обхода. Владельцы 42 швов
владеют только функциями своего шва и получают только точные права на нужные relations.

Недостающее право не угадывается заранее: оно остаётся невыданным до конкретного отказа живого прогона Ф7, после
которого выбирается одно из четырёх действий — убрать обход порта, выдать exact право, провести через шов или
признать путь лишним.

## 2. Ключ, verifier и контекст

### 2.1 Исполняемый verifier

`app.install_port_context(...)` — единственный `SECURITY DEFINER` verifier шва 1. Он использует штатные
`pgcrypto.digest`/`hmac`; из login-роли разрешены только
`BEGIN/COMMIT/ROLLBACK`, `app.issue_port_challenge(...)`, verifier и exact pre-session entrypoints после attestation.

Ключ `K` — случайные 32 bytes только в env соответствующего порта. Для `port`/`key_id` порт локально выводит
`C = HMAC-SHA-256(K, UTF8("BCB-PORT-CLIENT-V5") || 0x00 || UTF8(port) || 0x00 || UTF8(key_id))` и отдаёт только
`S = SHA-256(C)`. `app_ext.port_key_verifiers` хранит `key_id`, port, 32-byte `stored_key=S`, `not_before`,
`not_after`, `revoked_at`. Таблицей владеет `app_object_owner`; только `app_seam_context_owner` имеет `SELECT`,
миграционный канал меняет строки в окне §7, остальные роли имеют ноль ACL. Ни `K`, ни `C` в БД, backup или dump нет.

### 2.2 Challenge, привязки и single use

1. Внутри `BEGIN`, до `SET LOCAL ROLE`, exact login вызывает `app.issue_port_challenge(...)`. Функция генерирует
   32-byte nonce через `pgcrypto.gen_random_bytes`, записывает `ISSUED` state в private
   `app_ext.port_context_state` и возвращает `challenge_id`, `key_id` и canonical transcript `T`.
2. `T` имеет prefix `ASCII("BCBCTX5") || 0x00` и length-prefixed binary fields: key/port, database OID, `session_user`, target role,
   backend PID/start, transaction id, class/principal identifiers, purpose, expiry не далее 30 seconds, SHA-256
   ordered typed args и nonce. State хранит те же server-derived values; caller-generated binding не принимается.
3. Порт локально вычисляет `C` и `S`, затем `client_signature = HMAC-SHA-256(S,T)` и одноразовый
   `proof = C XOR client_signature`. В `app.install_port_context(challenge_id, key_id, proof)` передаются только
   идентификаторы и proof: исходный ключ и `C` не покидают процесс порта и не могут стать bind value в логе.
4. Verifier заново строит `T` из private state, вычисляет `C' = proof XOR HMAC-SHA-256(S,T)` и принимает proof,
   только если `SHA-256(C')` совпал с active `S`; затем атомарно переводит challenge `ISSUED → ACCEPTED`.
   Несовпадение, expiry и второй consume дают `42501`. Logged proof связан с одним nonce и повторно бесполезен.
5. Accepted state привязан к одному backend и transaction. Необъявленная смена role, новая transaction, повтор PID
   с другим `backend_start`, expiry или возврат connection в pool делает его недействительным; ошибка очистки
   уничтожает connection. Private state читают только функции шва 1, tenant-роли — никогда.

Компрометация env/памяти порта раскрывает `K` до revoke — именованный остаточный риск. Rotation добавляет новый
`key_id`/`S`, выкатывает новый env, держит короткое перекрытие `not_before/not_after`, затем отзывает старый key;
начатый challenge старого key после `revoked_at` не принимается.

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

Жизненный цикл обоих портов: `BEGIN` → чистый state → challenge/proof → install context → `SET LOCAL ROLE` exact role →
queries → `COMMIT/ROLLBACK`. Для следующей transaction proof выпускается заново.

## 3. Принципалы

Все перечисленные login-, runtime-, seam- и object-owner роли имеют
`NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`; четыре входа имеют `LOGIN`, остальные
роли — `NOLOGIN`. Исключение — поимённый локальный суперпользователь `postgres`.

### 3.1 Login и membership

| Login | Единственная точка входа | Standing access |
|---|---|---|
| `<env>_migrator` | deploy/migration channel | только `CONNECT`; owner-memberships существуют лишь внутри §7 |
| `<env>_webapp_staff` | staff/platform/service webapp | verifier шва 1; exact pre-session entrypoints; ноль table ACL |
| `<env>_webapp_patient` | patient и pre-session webapp | verifier шва 1; exact pre-session entrypoints; ноль table ACL |
| `<env>_integrator` | integrator и его jobs | verifier шва 1; exact integrator entrypoints; ноль table ACL |

Прямых object ACL у login нет. Каждое ребро к роли из следующей таблицы постоянно и имеет ровно
`INHERIT FALSE, SET TRUE, ADMIN FALSE`; других и транзитивных рёбер нет. Членство разрешает только `SET ROLE`,
но ничего не наследует и не обходит обязательный accessor принятого контекста.

| Login | Exact target roles |
|---|---|
| `<env>_migrator` | нет standing membership |
| `<env>_webapp_staff` | `app_staff`, `app_clinic_billing`, `app_platform_settings`, `app_worker`, `app_operational_media_worker`, `saas_telemetry_operator` |
| `<env>_webapp_patient` | `app_patient` |
| `<env>_integrator` | `app_operational_delivery_worker`, `app_operational_scheduler` |

Глобальный администратор отдельного login не имеет.

### 3.2 Runtime-роли

Ни одна runtime-role не состоит в другой runtime-role.

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

После `SET LOCAL ROLE` доступ для каждой relation/command равен AND из exact object/column grant,
`ENABLE`+`FORCE RLS`, обязательной restrictive context-policy и business policy exact role. Для `INSERT/UPDATE` тот
же scope стоит в `WITH CHECK`; business policies могут складываться через OR только за restrictive policy.

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

## 5. Definer-швы

Целевой seam 1 содержит ровно эти signatures: `issue_port_challenge`, `install_port_context`,
`current_integrator_user_id`, `current_org_id`, `current_patient_user_id`, `require_platform_principal`.
`release_principal_context` и `reset_principal_context` удаляются из definer surface: lifecycle держит transaction
binding private state.

| База | Целевые definer-signatures | Логических швов | Как получено |
|---|---:|---:|---|
| `bcb_webapp_dev` | 231 | 42 | фактические 231 минус две снятые signatures плюс две новые |
| `bersoncarebot_test` | 244 | 42 | фактические 244 минус две снятые signatures плюс две новые |

Acceptance обходит фактический `prosecdef`-набор текущей базы и двусторонне сравнивает exact signatures с её
вариантом декларации; TEST-only functions не требуются на DEV.

| # | Owner | Шов | # | Owner | Шов |
|---:|---|---|---:|---|---|
| 1 | `app_seam_context_owner` | port/principal context | 22 | `app_seam_patient_booking_owner` | patient booking |
| 2 | `app_seam_password_auth_owner` | password auth/rate limit | 23 | `app_seam_patient_self_actions_owner` | patient self actions |
| 3 | `app_seam_email_otp_owner` | email OTP | 24 | `app_seam_reminder_patient_owner` | patient reminders |
| 4 | `app_seam_passkey_owner` | passkey | 25 | `app_seam_reminder_materialization_owner` | reminder materialization/discovery |
| 5 | `app_seam_phone_binding_owner` | contact/channel binding | 26 | `app_seam_reminder_specialist_owner` | specialist reminder |
| 6 | `app_seam_self_security_owner` | PIN/session epoch | 27 | `app_seam_reminder_appointment_owner` | appointment reminder |
| 7 | `app_seam_identity_lookup_owner` | pre-session identity lookup | 28 | `app_seam_reminder_email_cooldown_owner` | email cooldown |
| 8 | `app_seam_patient_invite_owner` | patient invite | 29 | `app_seam_telemetry_patient_owner` | patient telemetry |
| 9 | `app_seam_org_invite_owner` | staff organization invite | 30 | `app_seam_telemetry_media_owner` | media telemetry |
| 10 | `app_seam_specialist_provision_owner` | specialist/first-org provisioning | 31 | `app_seam_telemetry_operator_owner` | operator telemetry/probes |
| 11 | `app_seam_public_slug_owner` | public slug | 32 | `app_seam_catalog_public_owner` | public catalogs |
| 12 | `app_seam_public_booking_owner` | public booking | 33 | `app_seam_catalog_admin_owner` | clinical measure kinds |
| 13 | `app_seam_dedicated_bot_owner` | dedicated bot | 34 | `app_seam_org_directory_owner` | platform org directory |
| 14 | `app_seam_payment_webhook_owner` | payment webhook | 35 | `app_seam_telemetry_exclusion_owner` | telemetry exclusion |
| 15 | `app_seam_delivery_scope_owner` | delivery scope | 36 | `saas_telemetry_owner` | SaaS isolation telemetry |
| 16 | `app_seam_patient_program_resolver_owner` | patient program resolver | 37 | `saas_system_health_owner` | curated system health |
| 17 | `app_seam_settings_preauth_owner` | preauth settings | 38 | `app_seam_login_token_owner` | messenger login tokens |
| 18 | `app_seam_settings_integrator_owner` | integrator settings | 39 | `app_seam_oauth_owner` | OAuth binding |
| 19 | `app_seam_settings_runtime_owner` | runtime settings | 40 | `app_seam_phone_otp_owner` | phone OTP/challenges |
| 20 | `app_seam_org_commerce_owner` | SaaS/org commerce | 41 | `app_seam_staff_security_owner` | staff 2FA/TOTP/recovery |
| 21 | `app_seam_patient_org_projection_owner` | patient/org projection | 42 | `app_seam_patient_lfk_media_owner` | patient LFK/media entitlement |

Каждый seam owner не имеет членов и владеет только exact definer-signatures своего шва. Relation access — exact
columns/operations и policies. Function `search_path` содержит только trusted schemas, `pg_catalog` и `pg_temp` последним; application
objects в body квалифицированы. Runtime не имеет `TEMPORARY`/schema `CREATE`; `PUBLIC EXECUTE` отозван.

Internal/trigger function не получает runtime `EXECUTE`, принимает только объявленное ребро и проверяет attested
root-call. Function без доказанного caller остаётся без runtime `EXECUTE`. Десять различающихся DEV/TEST bodies не
получают union прав: surface берётся только из принятой migration chain для среды.

## 6. Владение, декларация и полный объектный контур

### 6.1 Роль владельца и exact map

`app_object_owner` не имеет standing members и не владеет `SECURITY DEFINER` functions. Её единственная
потребность — стабильное владение обычными application objects и выполнение их DDL в §7.

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
Инвариант: login не имеет object ACL; membership точно совпадает с таблицей §3.1, без транзитивных рёбер.

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
2. каждый login из `pg_roles` с верным паролем, но без key и без `SET ROLE`: обращение к каждой managed application
   relation отклонено permission check с `42501`, строк нет, log event есть;
3. каждое разрешённое `SET ROLE` без context: запрос к seeded строке каждого класса вызывает accessor и даёт
   `42501`; отдельный no-candidate control даёт допустимый тихий ноль по границе §1.2;
4. системный каталог и tableless SQL доступны только в границе §1.1; проверка подтверждает, что application data
   там нет и ни одна managed application relation не получила `PUBLIC`-доступ;
5. `PUBLIC`: нет `CONNECT`, application schema `USAGE`, `TEMPORARY` и defaults;
6. каждая фактическая definer-signature текущей базы: exact declaration owner/caller/surface, без attested call отказ;
7. challenge negative vectors: wrong proof, `S` вместо proof, другая DB/login/role/backend/start/transaction/class/
   purpose/arg, expiry, второй consume и replay; success/error прогоны с sentinel `K` доказывают его отсутствие в
   application/server logs;
8. positive controls через оба порта: pre-session, staff, patient, platform, service и integrator получают только
   объявленный результат; неизвестный портом request не обслуживается;
9. после valid context RLS/policy fault injection и `row_security=off` выявляют silent filtering/лишнюю видимость;
10. owner/ACL/policy/function/role/cluster census двусторонне совпадает с вариантом декларации для этой базы;
11. положительный и crash-контроли миграционного окна §7 оба проходят;
12. зелёный target и снова красный после отката одной независимой поломки каждого механизма.

## 9. РАЗВИЛКИ, ЗАКРЫТЫЕ В ДИЗАЙНЕ

1. **Port proof или identity proof:** независимы; key proof обязателен всегда, identity/service context уточняет его.
2. **Передавать key или challenge-response:** challenge-response; proof проверяется штатными `digest`/`hmac`, а `K` и `C` не становятся loggable bind parameters.
3. **Условный переход verifier или standing membership:** standing membership `INHERIT FALSE, SET TRUE, ADMIN FALSE`; условного перехода в PostgreSQL нет, громкость разделена по §1.
4. **Protocol оставить исполнителю или зафиксировать:** private SQL-state, `K/C/S`, canonical transcript, nonce, bindings, atomic consume и rotation заданы в §2.
5. **Платформенная отметка:** отдельный raising accessor — меньше membership-only global access.
6. **Неизвестный без соединения или pre-session через БД:** выбран exact attested pre-session через известный port; это явное расхождение с буквальной Ф3б.
7. **Три или четыре login:** четыре — deploy, webapp staff, webapp patient, integrator; patient с нулём table privileges дешевле изолировать, чем сливать credential surfaces. Владелец может переопределить.
8. **Media worker как DB client или через порт:** compute остаётся, target DB path идёт через webapp без своего login.
9. **Telemetry global или tenant:** только семь exact functions шва 36, ноль table ACL.
10. **Три integrator service-роли или две:** две write-роли; diagnostic удалён, probe идёт швом 31.
11. **Отдельная cleanup-role или `app_worker`:** одна роль до live evidence отдельной поверхности.
12. **Сохранять `PUBLIC EXECUTE`:** нет; pre-session получает exact login grant после attestation.
13. **Staff cross-user phone-history:** `EXECUTE` не выдаётся до конкретного live-отказа.
14. **Caller `list_platform_organization_members`:** runtime `EXECUTE` пока не выдаётся.
15. **132 functions или полный каталог:** exact per-database `prosecdef` census; меньшая выборка пропускала owners, TEST-число как константа ломало DEV.
16. **Telemetry/health/discovery owners:** telemetry и health — швы 36/37, discovery — шов 25.
17. **`app_owner` удалить или заменить:** заменить на `app_object_owner` по §1/§6.1 — меньше runtime-силы, чем object под login или широким definer owner.
18. **Один object owner или несколько:** один для ordinary objects; definer functions у 42 seam owners, admin objects у `postgres`.
19. **Кто владеет новым DDL:** schema DDL выполняется как declared owner, не как migrator; post-hoc угадывания нет.
20. **Context seam сохранить по старым именам:** `release/reset` заменены `issue challenge/platform accessor`; exact set изменён при неизменной мощности.
21. **Counts в acceptance:** catalog-derived per database, не hardcoded TEST total.
22. **`require_staff_security_self_user_id`:** invoker/accessor без table ACL.
23. **Два owners на `email_send_cooldowns`:** две exact policies; слияние расширило бы credential surfaces.
24. **Разные DEV/TEST bodies:** права только принятого body, не union.
25. **Кто делает backup/restore:** локальный `postgres`; без standing backup login/migrator-wide read, legacy owners нормализует декларация.
26. **`USING (true)` для service `NONE`:** только exact role/object/operation после grant+context+restrictive gates.
27. **Crash-control или оба migration controls:** обязательны и positive real migration, и crash rollback.
28. **Буквально «любой запрос» или managed application data:** второе. Каталог/tableless SQL не содержат clinic/doctor/patient data; RLS бросает при реально удерживаемой строке, настоящий пустой результат не нарушение.

## 10. ВОПРОСЫ ВЛАДЕЛЬЦУ

Подтвердить ли для Ф3б границу §1.3: неизвестный человек не получает DB credentials/собственного соединения, а известный webapp port может открыть только attested pre-session transaction exact purpose/args без человеческого principal? Это единственная открытая формулировка.
