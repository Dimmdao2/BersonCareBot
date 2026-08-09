# SCHEME revision 6 — целевой слой прав БД BersonCareBot

Authority: [`OWNER_DECISIONS.md`](../../OWNER_DECISIONS.md), «Права БД, роли и стены», затем [`PLAN.md`](PLAN.md); текущий каталог — только проверка, право появляется лишь из доказанной потребности.

## 1. Схема без SQL

У данных две прикладные двери: порт **webapp** и порт **integrator**. Постоянных входов четыре: локальный `postgres`
deploy-канала, отдельные webapp staff и patient login и integrator login. Пароль прикладного login открывает соединение,
но не данные. Сначала порт расшифровывает одноразовый challenge приватным ключом из env; ключ не попадает в SQL или БД.

Переход login → runtime-role держит штатное постоянное членство
`GRANT <runtime_role> TO <login> WITH INHERIT FALSE, SET TRUE, ADMIN FALSE`. Иного условного механизма у PostgreSQL
16 нет: `SET ROLE` проверяет membership `session_user`; `SECURITY DEFINER` его не меняет, а смена роли внутри функции
не переживает возврат. Login не наследует права и не передаёт membership, но может выполнить `SET LOCAL ROLE` до
контекста. После принятия каждый accessor сверяет `current_user` с target role transcript; второй switch даёт `42501`.

Громкий отказ несут два разных механизма:

1. сессия, которая не переключилась, остаётся в login-роли без application table/column/sequence privileges;
   обращение к прикладной relation падает `42501` на permission check до чтения строк, включая `WHERE false` и
   `LIMIT 0`, и PostgreSQL пишет ERROR в server log;
2. сессия, которая переключилась без принятого контекста, попадает под restrictive policy: её one-time accessor
   бросает `42501` до любого data-dependent scan независимо от наличия строки, и PostgreSQL пишет ERROR в server log.

### 1.1 Именованная граница: системный каталог и SQL вне прикладных данных

Гарантия стены относится к managed application relations. `pg_catalog`, `information_schema` и tableless SQL
(`SELECT 1`, `VALUES`) доступны в штатном объёме: их метаданные не являются данными клиник, врачей или пациентов.
Исключение — SQL activity: view `pg_stat_activity` и `EXECUTE pg_stat_get_activity(integer)` отозваны у `PUBLIC` и
login/runtime-ролей, оставлены `postgres`.
Это сознательное сужение дословного owner-критерия решением ведущего: полный отзыв системных метаданных ломает
клиенты, migration tools и `psql`, не усиливая tenant-стену.

### 1.2 Именованная граница: настоящий пустой результат

Restrictive policy вызывает raising accessor один раз над relation scan, а не для найденной строки. Поэтому probe с
существующим и отсутствующим indexed value одинаково получает `42501` до scan: existence oracle нет. Тихий ноль без
контекста допустим лишь при no-scan (`WHERE false`, `LIMIT 0`); обычный запрос даже к пустой relation проходит gate.
После принятого контекста business-empty равен нулю. Это сознательное сужение дословного owner-критерия решением
ведущего: константный no-scan не видит и не удерживает данные.

### 1.3 Явное расхождение с `PLAN.md` Ф3б

Буквальная строка Ф3б «неизвестный не получает соединения» расходится с target: человек не получает DB credentials,
но до входа известный webapp port открывает attested transaction exact request/purpose/args без human principal.
Это явное расхождение и единственный вопрос §10. После входа порт ставит class и exact ids; integrator/jobs —
service-контекст. Порт не знает class запроса — connection в pool не выдаётся.

Обычными объектами приложения владеет `app_object_owner`: роль не имеет `LOGIN`, `BYPASSRLS`, членов или
definer-функций и недостижима вне миграционного окна. Под `FORCE RLS` владелец без
`BYPASSRLS` подчиняется policies; следовательно, владение не создаёт скрытого runtime-обхода. Владельцы 42 швов
владеют только функциями своего шва и получают только точные права на нужные relations.

Недостающее право не угадывается заранее: оно остаётся невыданным до конкретного отказа живого прогона Ф7, после
которого выбирается одно из четырёх действий — убрать обход порта, выдать exact право, провести через шов или
признать путь лишним.

## 2. Ключ, verifier и контекст

### 2.1 Исполняемый verifier

`app.install_port_context(...)` — единственный `SECURITY DEFINER` verifier шва 1; challenge шифрует штатная
`app_ext.pgp_pub_encrypt_bytea`. Login имеет `EXECUTE` только на issue/verifier и exact pre-session entrypoints;
membership §3.1 отдельно разрешает `SET LOCAL ROLE`, который сам контекст не создаёт.

Приватный OpenPGP decryption key `K` живёт только в env порта. `app_ext.port_key_verifiers` хранит `key_id`, port,
public encryption key `P`, сроки и revoke. Владелец — `app_object_owner`; `SELECT` есть только у
`app_seam_context_owner`, write — у migration window §7. В БД/dump нет секрета, эквивалентного `K`.

### 2.2 Challenge, привязки и single use

1. Внутри `BEGIN`, до `SET LOCAL ROLE`, exact login вызывает `app.issue_port_challenge(...)`. Функция генерирует
   32-byte nonce `N` через `pgcrypto.gen_random_bytes`, сохраняет только `SHA-256(N)` и server-derived bindings в
   private state, шифрует `N || SHA-256(T)` публичным `P` и возвращает ciphertext, ids и transcript `T`.
2. `T`: prefix `ASCII("BCBCTX6") || 0x00` и length-prefixed key/port, database OID, `session_user`, target role,
   backend PID/start, transaction id, class/principal ids, purpose, expiry ≤30 seconds, typed args hash и nonce hash.
3. Порт локально расшифровывает ciphertext приватным `K`, сверяет `SHA-256(T)` и передаёт одноразовый `proof=N` в
   `app.install_port_context(challenge_id, key_id, proof)`; `K` не покидает процесс порта и не может стать bind value.
4. Verifier заново строит bindings и принимает proof, только если его hash совпал с сохранённым и key active; затем
   атомарно переводит challenge `ISSUED → ACCEPTED`. Несовпадение, expiry и второй consume дают `42501`.
5. Accepted state привязан к backend, transaction и target role. `app.require_accepted_context()` сравнивает
   `current_user` с role; новая role/transaction, иной backend start, expiry или pool-return дают `42501`; ошибка
   очистки уничтожает connection. Private state читают только функции шва 1.

| Артефакт у атакующего | Может | Не может |
|---|---|---|
| dump | увидеть `P`, transcript и hashes state; сам шифровать произвольный plaintext | расшифровать выданный challenge, найти `N` или ответить на новый challenge |
| logged proof | знать `N` одного уже consumed challenge | получить `K`, расшифровать новый challenge или применить proof к другому backend/transaction |
| dump + logged proof | сопоставить и проверить историческую пару `N`/hash | получить эквивалент `K` или произвести ещё один valid proof; replay старого закрыт bindings и atomic consume |

Компрометация env/памяти порта раскрывает `K` до revoke — именованный остаточный риск. Rotation добавляет пару
`key_id`/`P` + env `K`, кратко перекрывает сроки и отзывает старую; её challenge после revoke не принимается.

### 2.3 Principal и service context

Принятый контекст содержит один класс:

- `staff`: `actor_user_id` и `organization_id`;
- `patient`: `actor_user_id`, `organization_id`, `patient_user_id`;
- `platform`: только platform marker; медицина роли недоступна;
- `pre_session`: webapp request id, exact function/purpose/args, без tenant identity;
- `integrator` или `service`: integrator id либо exact job/probe purpose.

`app.require_accepted_context()` и вызывающие его `current_org_id`, `current_patient_user_id`,
`current_integrator_user_id`, `require_platform_principal` читают accepted private state, сверяют `current_user` с
target role и бросают `42501`. Custom GUC и caller-provided ids полномочием не являются.

Жизненный цикл обоих портов: `BEGIN` → чистый state → challenge/proof → install context → `SET LOCAL ROLE` exact role →
queries → `COMMIT/ROLLBACK`. Для следующей transaction proof выпускается заново.

## 3. Принципалы

Все управляемые login-, runtime-, seam-, object-owner роли и `<env>_migrator` имеют
`NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`; три прикладных входа имеют `LOGIN`,
остальные управляемые роли — `NOLOGIN`. Четвёртый вход — поимённый локальный суперпользователь `postgres`.

### 3.1 Точки входа и membership

| Login / identity | Единственная точка входа | Standing access |
|---|---|---|
| `postgres` | локальный deploy/migration channel | поимённое административное исключение, только §7 |
| `<env>_migrator` (`NOLOGIN`, без `CONNECT`) | identity внутри deploy-сеанса | owner-memberships существуют лишь внутри §7 |
| `<env>_webapp_staff` | staff/platform/service webapp | verifier шва 1; exact pre-session entrypoints; ноль table ACL |
| `<env>_webapp_patient` | patient и pre-session webapp | verifier шва 1; exact pre-session entrypoints; ноль table ACL |
| `<env>_integrator` | integrator и его jobs | verifier шва 1; exact integrator entrypoints; ноль table ACL |

Прямых object ACL нет у прикладных login; `postgres` — поимённое исключение. Каждое ребро ниже постоянно и имеет
`INHERIT FALSE, SET TRUE, ADMIN FALSE`; других и транзитивных рёбер нет. Членство разрешает только `SET ROLE`,
но ничего не наследует и не обходит обязательный accessor принятого контекста.

| Member identity | Exact target roles |
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
`ENABLE`+`FORCE RLS`, обязательной restrictive context-policy с one-time accessor §1.2 и business policy exact role.
Для `INSERT/UPDATE` тот же scope стоит в `WITH CHECK`; business policies могут складываться через OR только за
restrictive policy. Generator закрепляет gate как некоррелированный scalar subquery над scan:
`USING ((SELECT app.require_accepted_context()) AND (<business predicate>))`, для write — та же форма `WITH CHECK`.

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
`require_accepted_context`, `current_integrator_user_id`, `current_org_id`, `current_patient_user_id`,
`require_platform_principal`.
`release_principal_context` и `reset_principal_context` удаляются из definer surface: lifecycle держит transaction
binding private state.

| База | Целевые definer-signatures | Логических швов | Как получено |
|---|---:|---:|---|
| `bcb_webapp_dev` | 232 | 42 | фактические 231 минус две снятые signatures плюс три новые |
| `bersoncarebot_test` | 245 | 42 | фактические 244 минус две снятые signatures плюс три новые |

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
Инвариант: прикладной login не имеет object ACL; membership точно совпадает с §3.1, без транзитивных рёбер;
`pg_stat_activity` и `pg_stat_get_activity(integer)` не имеют `PUBLIC`/login/runtime ACL.

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

Grant, migration, backfill, revoke и assertions атомарны: crash до commit откатывает всё; после commit migrator
остаётся `NOLOGIN` без `CONNECT` и membership. Положительный контроль применяет representative real migration на disposable clone,
проверяет owner нового и изменённого object, успешный backfill и чистый post-state. Отрицательный контроль убивает
то же окно до commit и проверяет полный rollback.

Backup — локальная административная операция `postgres`, не чтение через application URL. Restore старых dumps
идёт с `--no-owner`; extensions/admin objects создаёт `postgres`, application schema/data восстанавливается через
`SET ROLE app_object_owner`, после чего generator назначает exact seam owners и gate проверяет карту. Старые
`OWNER TO app_owner`/login из dump не исполняются.

## 8. Исполняемая приёмка

Одна команда использует фактические каталоги и server log и печатает principal/object/result:

1. красный baseline: сегодняшнее прямое подключение без port key отдаёт данные;
2. каждый login из `pg_roles` проверен: поимённые admin-исключения отмечены, у остальных без key/`SET ROLE` каждая
   managed application relation даёт permission `42501`, ноль строк и log event;
3. каждое разрешённое `SET ROLE` без context даёт `42501`; пара indexed probes «строка есть/строки нет» неразличима
   и красная, no-scan control тихо пуст; context роли A + запрос из роли B — красный `42501`;
4. каталог/tableless SQL укладываются в §1.1; same-login sentinel не виден через view или `pg_stat_get_activity`;
5. `PUBLIC`: нет `CONNECT`, application schema `USAGE`, `TEMPORARY` и defaults;
6. каждая фактическая definer-signature текущей базы: exact declaration owner/caller/surface, без attested call отказ;
7. challenge negative vectors: wrong proof, другая DB/login/role/backend/start/transaction/class/purpose/arg,
   expiry, второй consume и replay; dump, logged proof и их сочетание не отвечают на fresh challenge, а success/error
   прогоны с sentinel `K` доказывают отсутствие приватного key в application/server logs;
8. positive controls через оба порта: pre-session, staff, patient, platform, service и integrator получают только
   объявленный результат; неизвестный портом request не обслуживается;
9. после valid context RLS/policy fault injection и `row_security=off` выявляют silent filtering/лишнюю видимость;
10. owner/ACL/policy/function/role/cluster census двусторонне совпадает с вариантом декларации для этой базы;
11. положительный и crash-контроли миграционного окна §7 оба проходят;
12. зелёный target и снова красный после отката одной независимой поломки каждого механизма.

## 9. РАЗВИЛКИ, ЗАКРЫТЫЕ В ДИЗАЙНЕ

1. **Port proof или identity proof:** независимы; key proof обязателен всегда, identity/service context уточняет его.
2. **Передавать key или challenge-response:** публично шифрованный challenge; proof — одноразовый `N`, private `K` не становится SQL-параметром, dump+proof не дают новый ответ.
3. **Условный переход verifier или standing membership:** membership `INHERIT FALSE, SET TRUE, ADMIN FALSE`; второй role switch ловит role-bound accessor, не отсутствующий observer `SET ROLE`.
4. **Protocol оставить исполнителю или зафиксировать:** private state, `K/P`, transcript, nonce hash, bindings, consume и rotation заданы в §2.
5. **Платформенная отметка:** отдельный raising accessor — меньше membership-only global access.
6. **Неизвестный без соединения или pre-session через БД:** выбран exact attested pre-session через известный port; это явное расхождение с буквальной Ф3б.
7. **Три или четыре login:** решением ведущего четыре — deploy, webapp staff, webapp patient, integrator. Patient в target имеет ноль table privileges; отделить его дешевле, чем сливать. Владелец уведомлён и может переопределить; до этого fork закрыт.
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
28. **Буквально «любой запрос» или managed application data:** второе — сознательное сужение ведущего по §1.1/§1.2; metadata/no-scan не выпускают clinic/doctor/patient data.
29. **Row-by-row accessor или one-time gate:** one-time scalar subquery над scan; существующий/отсутствующий indexed value одинаково красные, existence oracle закрыт.
30. **Activity SQL оставить системным metadata:** нет; view и `pg_stat_get_activity` закрыты от runtime/login, потому что same-login pool показывает patient literals соседней сессии.
31. **Migrator подключается или задаёт identity:** второе; deploy входит локальным `postgres`, а `<env>_migrator` имеет `NOLOGIN`, без `CONNECT`, и существует только внутри §7.
## 10. ВОПРОСЫ ВЛАДЕЛЬЦУ

Подтвердить ли для Ф3б границу §1.3: неизвестный человек не получает DB credentials/собственного соединения, а известный webapp port может открыть только attested pre-session transaction exact purpose/args без человеческого principal? Это единственная открытая формулировка.
