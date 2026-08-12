# SCHEME revision 11 — целевой слой прав БД BersonCareBot

Authority: [`OWNER_DECISIONS.md`](../../OWNER_DECISIONS.md), «Права БД, роли и стены», затем [`PLAN.md`](PLAN.md). Это target-contract до Ф4: не миграция и не описание текущего каталога.

> **REVISION 11 ЕЩЁ НЕ РАЗРЕШЕНА К НАКАТЫВАНИЮ.** Она заменяет старый трёх-login target отдельным
> `<env>_webapp_global_admin` login/certificate/pool при прежних двух software ports, требует один target для
> любого deploy/cutover и универсальную birth wall для каждой managed table. До синхронизации declaration,
> generator, generated artifacts и live proof это исполняемый контракт следующей реализации, а не готовое
> состояние базы. Exact mTLS/context/typed-args/A→I части revision 10 сохранены без изменения.

## 1. Две двери: mTLS до SQL

У managed application data две двери: **webapp** и **integrator**. Application-login —
`<env>_webapp_staff`, `<env>_webapp_patient`, `<env>_webapp_global_admin`, `<env>_integrator`;
`<env>_migrator` — `NOLOGIN`, локальный `postgres` — единственное административное исключение §7. Три первых
login принадлежат одному webapp port, поэтому отдельный global-admin login не создаёт третий software port.
Неизвестный человек никогда не получает credential или connection: его запрос обслуживает уже известный webapp
port только в `pre_session`-транзакции.

Пароль — второй фактор, не доказательство порта. Каждая application connection проходит именно первую подходящую HBA-строку ниже; более широкая allow-строка для этих users запрещена. PostgreSQL применяет только первую совпавшую HBA-строку и при auth failure не переходит к следующей ([PG 16 HBA](https://www.postgresql.org/docs/16/auth-pg-hba-conf.html)).

```conf
hostnossl  <managed_db>  <env>_webapp_staff,<env>_webapp_patient,<env>_webapp_global_admin,<env>_integrator  0.0.0.0/0  reject
hostnossl  <managed_db>  <env>_webapp_staff,<env>_webapp_patient,<env>_webapp_global_admin,<env>_integrator  ::0/0       reject
local      <managed_db>  <env>_webapp_staff,<env>_webapp_patient,<env>_webapp_global_admin,<env>_integrator              reject
hostssl    <managed_db>  <env>_webapp_staff    0.0.0.0/0  scram-sha-256 clientcert=verify-full clientname=CN
hostssl    <managed_db>  <env>_webapp_staff    ::0/0       scram-sha-256 clientcert=verify-full clientname=CN
hostssl    <managed_db>  <env>_webapp_patient  0.0.0.0/0  scram-sha-256 clientcert=verify-full clientname=CN
hostssl    <managed_db>  <env>_webapp_patient  ::0/0       scram-sha-256 clientcert=verify-full clientname=CN
hostssl    <managed_db>  <env>_webapp_global_admin  0.0.0.0/0  scram-sha-256 clientcert=verify-full clientname=CN
hostssl    <managed_db>  <env>_webapp_global_admin  ::0/0       scram-sha-256 clientcert=verify-full clientname=CN
hostssl    <managed_db>  <env>_integrator      0.0.0.0/0  scram-sha-256 clientcert=verify-full clientname=CN
hostssl    <managed_db>  <env>_integrator      ::0/0       scram-sha-256 clientcert=verify-full clientname=CN
```

`<managed_db>` and `<env>` are declaration parameters already expanded per database/environment; they are never HBA `all` user/database entries. There is no `pg_ident.conf` dependency. Each application login has its own client certificate whose CN is exactly that login: staff, patient and global-admin key/certificate material exists only in the webapp port env, integrator material only in the integrator port env. `verify-full` requires the trusted certificate CN to equal the requested login and can pair with SCRAM ([PG 16 HBA](https://www.postgresql.org/docs/16/auth-pg-hba-conf.html), [certificate auth](https://www.postgresql.org/docs/16/auth-cert.html)). `local postgres ... peer` is a separate preceding admin-only rule; there is no `local` exception for application logins.

The port uses `sslmode=verify-full`, client key, client certificate and CA bundle only from its own env. The server certificate is issued with exact DNS/IP SAN for every configured host. PG16/libpq verifies chain and host name: a matching CN remains its standard fallback when no applicable SAN exists, so a missing SAN alone is not an acceptance-negative; no custom SAN-only verifier is introduced ([PG 16 libpq SSL](https://www.postgresql.org/docs/16/libpq-ssl.html)). PostgreSQL host keeps server key/certificate and public CA/CRL verifier material only. `ssl_ca_file` enables client verification and `ssl_crl_file`/`ssl_crl_dir` supply CRL input ([PG 16 connection settings](https://www.postgresql.org/docs/16/runtime-config-connection.html)). A private key is never an SQL parameter, GUC, table/dump value, application log value or PostgreSQL log value.

Rotation adds new certificate/key to its port env and accepts its public chain during bounded overlap; then revoke old serial and remove old env key. HBA needs reload for **new** connections; `ssl_crl_file` loads at configuration reload, while new CRLs in `ssl_crl_dir` are used at connection time ([PG 16 HBA](https://www.postgresql.org/docs/16/auth-pg-hba-conf.html), [SSL settings](https://www.postgresql.org/docs/16/runtime-config-connection.html)). A changed PostgreSQL SSL setting that reports pending restart is applied only by the controlled restart in the host runbook, followed by fresh connection verification. Neither reload nor restart re-authenticates surviving TLS backends. Revocation requires reload, drain both pools, terminate every backend authenticated by that certificate, then establish fresh pooled connections.

Positive controls: valid webapp staff/patient/global-admin certificate with its exact login CN + SCRAM; valid integrator certificate with its exact login CN + SCRAM; and a port whose server `verify-full` succeeds. Negative controls: wrong/missing/expired/revoked certificate, wrong CN/login/port, non-TLS/socket, stolen password and server impersonation. Each rejects before application SQL. **Historical replacement:** HBA authentication is complete port proof; target has no custom challenge, ciphertext, nonce, proof, replay ledger, verifier, PGP key type or crypto rotation.

## 2. Transaction context (Ф3б-A1)

### 2.1 Types, claims and declared capability

`app.port_name` is enum `('webapp','integrator')`; `app.port_context_class` is enum `('pre_session','staff','patient','platform','integrator','tenant_service','service')`. `app.port_typed_arg` is composite `(type_tag text, value bytea)`. `app.port_context_claims` is:

```sql
(protocol_version smallint, context_class app.port_context_class, target_role name,
 purpose text, function_identity regprocedure, typed_args_hash bytea,
 actor_ref uuid, subject_ref uuid, organization_id uuid,
 integrator_user_id bigint, request_id uuid)
```

Only version `1` is accepted with `protocol_version IS NOT DISTINCT FROM 1`; purpose is ASCII `[a-z][a-z0-9._:-]{0,127}` and hash is 32 bytes. `actor_ref`/`subject_ref` are opaque protocol IDs, never `platform_users.id`. Complete non-NULL matrix: `pre_session` = `request_id,function_identity`; `staff` = `actor_ref,organization_id`; `patient` = `actor_ref,subject_ref,organization_id`; `platform` = `actor_ref`; `integrator` = `integrator_user_id,organization_id`; `tenant_service` = `organization_id`; `service` = none. Every forbidden identity field is NULL. Named seam roots always carry exact `function_identity` and their actual typed-args hash; direct relations carry NULL and zero-arg hash.

`app_ext.port_context_capabilities`, owned by `app_seam_context_owner`, is the declaration-owned allowlist:

```sql
(capability_id uuid PRIMARY KEY, port app.port_name NOT NULL, session_login name NOT NULL,
 target_role name NOT NULL, context_class app.port_context_class NOT NULL, purpose text NOT NULL,
 function_identity regprocedure NULL, active_from timestamptz NOT NULL, active_until timestamptz NULL,
 CHECK (active_until IS NULL OR active_from < active_until),
 UNIQUE NULLS NOT DISTINCT (port,session_login,target_role,context_class,purpose,function_identity))
```

It contains only declared rows. Installer accepts the session login only by exact equality to its capability row and derives the port from that row; caller cannot name port or login and fixture login names are never compiled into the contract. Capability must exactly equal derived port/login and claims class/role/purpose/function identity and be active. This also limits pre-session to named function/purpose/args and no tenant/medical access; the integrator resolver is a distinct narrow capability, never a human DB credential.

### 2.2 Private state and exact SQL surface

`app_ext.accepted_port_contexts`, also solely owned by `app_seam_context_owner`, is exactly:

```sql
(database_oid oid NOT NULL, backend_pid integer NOT NULL, transaction_id xid8 NOT NULL,
 capability_id uuid NOT NULL REFERENCES app_ext.port_context_capabilities,
 session_login name NOT NULL, port app.port_name NOT NULL, target_role name NOT NULL,
 context_class app.port_context_class NOT NULL, purpose text NOT NULL,
 function_identity regprocedure NULL, typed_args_hash bytea NOT NULL CHECK (octet_length(typed_args_hash)=32),
 actor_ref uuid NULL, subject_ref uuid NULL, organization_id uuid NULL,
 integrator_user_id bigint NULL, request_id uuid NULL, installed_at timestamptz NOT NULL,
 cleared_at timestamptz NULL, PRIMARY KEY (database_oid,backend_pid,transaction_id),
 CHECK (cleared_at IS NULL OR cleared_at >= installed_at))
```

Installer derives database OID from `pg_database` lookup by `current_database()`, login from `session_user`, PID from `pg_backend_pid()`, transaction ID from `pg_current_xact_id()`. It does not query `pg_stat_ssl`: HBA has already authenticated this backend. That view provides one row per backend and only TLS status plus possibly NULL/truncated DN/serial/issuer ([PG 16 `pg_stat_ssl`](https://www.postgresql.org/docs/16/monitoring-stats.html)); it is neither necessary nor a trust root.

All context definers are owner `app_seam_context_owner`, `SECURITY DEFINER VOLATILE PARALLEL UNSAFE`, `SET search_path = pg_catalog, app, app_ext, pg_temp`, fully qualified, and have no `PUBLIC EXECUTE`.

| Exact signature | Result | EXECUTE |
|---|---|---|
| `app.install_port_context(p_capability_id uuid,p_claims app.port_context_claims)` | `void`; inserts one current transaction row or `42501` | four application logins |
| `app.require_accepted_context(p_effective_role name,p_target_role name,p_context_class app.port_context_class,p_purpose text,p_typed_args_hash bytea,p_function_identity regprocedure)` | `boolean`; true or `42501`, never NULL | exact declaration runtime roles/seam owners |
| `app.require_platform_principal()` | `boolean`; true or `42501` | declared platform roles/seam owners |
| `app.clear_port_context()` | `void`; clears only caller current row | four application logins |
| `app.current_org_id()`, `app.current_actor_user_id()`, `app.current_patient_user_id()`, `app.current_integrator_user_id()` | matching `uuid`/`bigint` or `42501` | only declared carrying roles/seam owners |
| `app.hash_port_typed_args(p_args app.port_typed_arg[])` | `bytea`, **SECURITY INVOKER IMMUTABLE PARALLEL SAFE**, `SET search_path=pg_catalog` | context owner and exact named seam owners |
| `app_ext.resolve_variant_a_identity(p_platform_user_id uuid)` | `uuid`; private definer resolver | exact declared pre-session root owners |

`app_seam_context_owner` owns exactly two private relations: `port_context_capabilities` and `accepted_port_contexts`. `app_seam_identity_lookup_owner` owns `variant_a_identity_refs` and `resolve_variant_a_identity`; the context owner never reads the physical→opaque map and stores only opaque refs. `PUBLIC`, login/runtime roles and non-owning seam owners have no `USAGE` on `app_ext`, private relation ACL or resolver/helper execute. Closed rows are deleted only by a named context seam after 24h; they cannot be reused because every gate requires matching current transaction ID and `cleared_at IS NULL`.

### 2.3 Canonical args, gate and lifecycle

Canonical zero args is a dimensionless empty array: `cardinality(p_args)=0`, while `array_ndims`, `array_lower` and `array_dims` are NULL. For non-empty args only one dimension with lower bound 1 is valid, with 1–64 elements. NULL array, another dimension/bound, NULL element, invalid tag or invalid size is `22023`. Tag is 1–128 ASCII bytes matching `[a-z][a-z0-9_.]*@[1-9][0-9]*`; value is NULL or 0–1,048,576 bytes. Supported bases: `uuid,oid,integer,bigint,xid8,boolean,text,name,bytea,timestamptz`.

Hash is SHA-256 of `ASCII("BCBPORTARGS") || 0x00 || u16be(1) || u16be(count)`, then each ordinal: `u16be(ordinal)||u16be(1)||u16be(tag_length)||tag||u16be(2)||u32be(value_length)||value`. NULL is length `0xffffffff` without bytes; non-NULL empty is `0`. Direct relation zero-arg hash is exactly `decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a','hex')`, never NULL. Named root recomputes hash from normalized typed SQL args before data access; HTTP hash is not authority.

Every non-NULL supported value has exactly this versioned tag and PostgreSQL 16 binary-send value; SQL uses the named `pg_catalog` primitive and the Node port reproduces the stated bytes exactly (database encoding is required to be `UTF8`). `uuid@1`=`uuid_send` (16 UUID bytes); `oid@1`=`oidsend` (u32be; PG16 has no `oid_send`); `integer@1`=`int4send` (signed i32be); `bigint@1`=`int8send` (signed i64be); `xid8@1`=`xid8send` (u64be); `boolean@1`=`boolsend` (one byte `00`/`01`); `text@1`=`textsend` (UTF-8 bytes); `name@1`=`namesend` (UTF-8 name bytes, no terminator); `bytea@1`=`byteasend` (identity bytes); `timestamptz@1`=`timestamptz_send` (signed i64be microseconds since `2000-01-01 00:00:00+00`). NULL remains distinct from a non-NULL empty `text@1`, `name@1` or `bytea@1` by framing length. The disposable PG16 probe must query every primitive as `encode(pg_catalog.<send>(value),'hex')` and compare it with Node's bytes before this contract is accepted.

`require_accepted_context` checks all six arguments, non-NULL class matrix, current database OID/PID/transaction ID/session login, and one non-cleared row. It is boolean and valid in RLS. Runtime policy uses literals:

```sql
current_user = '<runtime_role>'::name
AND (SELECT app.require_accepted_context('<runtime_role>'::name, '<runtime_role>'::name,
  '<class>'::app.port_context_class, 'relation', <H0>, NULL::regprocedure))
```

Outer policy sees real querying `current_user`. Inside a `SECURITY DEFINER` root, `current_user` is owner ([PG 16 identity functions](https://www.postgresql.org/docs/16/functions-info.html)); its restrictive policy therefore supplies owner as effective role and declaration literals supply stored target/class/purpose/hash/exact root `regprocedure`. It cannot mistake owner for invoker. `regprocedure` is stored by OID and generator renders schema-qualified identity from `pg_proc`/ `pg_namespace`, not search-path display.

One checkout runs: `BEGIN → RESET ROLE → clear_port_context() → install_port_context(...) → SET LOCAL ROLE <target> → queries → RESET ROLE → clear_port_context() → COMMIT`. Any setup, cleanup or query error rolls back and destroys the pool client. Thus an application login executes only install/clear before and after the switch; every named root, including pre-session, is executable only by its exact target role. `SET LOCAL` ends with transaction, so every transaction installs new context. PostgreSQL permits `SET LOCAL ROLE` in transaction only with membership `SET TRUE`, and cannot run it in a definer ([PG 16 SET ROLE](https://www.postgresql.org/docs/16/sql-set-role.html)).

### 2.4 Variant A → I

A declared pre-session root validates human credential then privately calls `resolve_variant_a_identity(platform_users.id)` owned by `app_seam_identity_lookup_owner` to insert-or-return `variant_a_identity_refs(physical_user_id uuid PRIMARY KEY,opaque_ref uuid UNIQUE NOT NULL,created_at timestamptz NOT NULL)`. It returns opaque refs to the known port and commits. The **next** staff/patient/platform transaction supplies opaque refs; scalar accessors resolve physical IDs only privately for Variant-A policies. Physical `platform_users.id` is neither port proof nor a context capability. Variant I replaces this identity seam/map and subject resolution, not protocol version, mTLS, role graph, typed args or RLS gate.

## 3. Roles, grants and RLS

All managed login/runtime/seam/object-owner roles and `<env>_migrator` are `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`; only four application roles have `LOGIN`. Application login has `CONNECT`, minimal schema access and only `install_port_context`/`clear_port_context` EXECUTE, but zero managed table/column/sequence ACL. Runtime relation access and every named root begin only after installed context and `SET LOCAL ROLE`.

Every membership is `INHERIT FALSE, SET TRUE, ADMIN FALSE`, with no transitive edges:

| Login | Exact target roles |
|---|---|
| `<env>_webapp_staff` | `app_pre_session,app_staff,app_clinic_billing,app_worker,app_operational_media_worker,saas_telemetry_operator` |
| `<env>_webapp_patient` | `app_pre_session,app_patient` |
| `<env>_webapp_global_admin` | `app_platform_settings,app_platform_admin` |
| `<env>_integrator` | `app_integrator_request,app_integrator_resolver,app_operational_delivery_worker,app_operational_scheduler,app_tenant_service,app_service` |

Global admin uses its dedicated webapp-owned login/certificate/pool and only platform/global roles after mandatory
human global-admin context and 2FA. `app_platform_settings` is the settings/system-health surface;
`app_platform_admin` is the separately declared cross-organization directory/admin surface. Staff cannot `SET ROLE`
either platform role; global-admin cannot `SET ROLE` staff/patient/clinical roles and has no medical access.
Webapp has no delivery-role membership. `app_object_owner`
is NOLOGIN, memberless, no definer functions and subject to FORCE RLS. 42 narrow seam owners remain separate,
NOLOGIN, memberless, without BYPASSRLS. `app_operational_diagnostic` is absent.

The 42 exact owners/seams remain: `app_seam_context_owner` (port/context), `app_seam_password_auth_owner`,
`app_seam_email_otp_owner`, `app_seam_passkey_owner`, `app_seam_phone_binding_owner`,
`app_seam_self_security_owner`, `app_seam_identity_lookup_owner`, `app_seam_patient_invite_owner`,
`app_seam_org_invite_owner`, `app_seam_specialist_provision_owner`, `app_seam_public_slug_owner`,
`app_seam_public_booking_owner`, `app_seam_dedicated_bot_owner`, `app_seam_payment_webhook_owner`,
`app_seam_delivery_scope_owner`, `app_seam_patient_program_resolver_owner`,
`app_seam_settings_preauth_owner`, `app_seam_settings_integrator_owner`,
`app_seam_settings_runtime_owner`, `app_seam_org_commerce_owner`,
`app_seam_patient_org_projection_owner`, `app_seam_patient_booking_owner`,
`app_seam_patient_self_actions_owner`, `app_seam_reminder_patient_owner`,
`app_seam_reminder_materialization_owner`, `app_seam_reminder_specialist_owner`,
`app_seam_reminder_appointment_owner`, `app_seam_reminder_email_cooldown_owner`,
`app_seam_telemetry_patient_owner`, `app_seam_telemetry_media_owner`,
`app_seam_telemetry_operator_owner`, `app_seam_catalog_public_owner`,
`app_seam_catalog_admin_owner`, `app_seam_org_directory_owner`,
`app_seam_telemetry_exclusion_owner`, `saas_telemetry_owner`, `saas_system_health_owner`,
`app_seam_login_token_owner`, `app_seam_oauth_owner`, `app_seam_phone_otp_owner`,
`app_seam_staff_security_owner`, `app_seam_patient_lfk_media_owner`. Each owns only its declared definer
signatures and relation/column/operation surface; no owner is a fallback for another seam.

Every managed relation is born with no `PUBLIC`/runtime ACL and must have one declared class wall before DDL may
commit. Tenant/clinical relations require `ENABLE+FORCE RLS`, restrictive context gate and their declared
tenant/patient business policies. Platform/system/identity/closed/definer relations require the exact wall declared
for that class; they are never accepted merely because they are «not org tables». Restrictive policies AND;
permissive policies OR ([PG 16 CREATE POLICY](https://www.postgresql.org/docs/16/sql-createpolicy.html)).
`USING`/`WITH CHECK` carry the same context gate. Missing context raises `42501` before a data-dependent scan and
logs; only no-scan query may be quietly empty. `USING (true)` is only exact service/seam owner+relation+operation
after gate, never principal-aware. Sequence ACL is zero for PUBLIC/login/runtime/service; only named seam owner can
hold named sequence privilege.

## 6. Владение, декларация и полный объектный контур

### 6.1 Роль владельца и exact map

`app_object_owner` не имеет standing members и не владеет `SECURITY DEFINER` functions. Её единственная потребность — стабильное владение обычными application objects и выполнение их DDL в §7.

Каждый managed object получает owner из этой карты; второго fallback нет:

| Object class | Exact owner |
|---|---|
| managed database; tablespaces; extensions; extension members; languages; event trigger/function; FDW/server/user mapping; publication/subscription | `postgres` |
| schemas `public`, `app`, `integrator`, `app_ext` | `app_object_owner` |
| ordinary/partitioned tables and partitions, indexes, sequences, views, matviews, foreign tables, allowed large objects | `app_object_owner` |
| application types/domains/collations and `SECURITY INVOKER` functions/procedures | `app_object_owner` |
| `SECURITY DEFINER` application functions | exact seam owner из §3 |
| system/catalog objects | exact bootstrap owner из PostgreSQL install allowlist, обычно `postgres` |

Trigger/constraint ownership следует owner relation; replication slots не имеют независимого owner и допускаются только как exact administrative object `postgres`. Любой новый class без строки в декларации — FAIL. Все прежние objects `app_owner`, login-migrator или seam owner переназначаются по этой карте; `app_owner` после нулевого census ownership/membership удаляется.

### 6.2 Декларация и generator

Декларация перечисляет только выданное. Для каждого object она содержит exact identity, owner, ACL, policy,
attributes и dependencies. До её применения миграционная цепочка приводит восстановленную базу в точку ноль:
удаляет старые application login/roles/grants/default privileges и закрывает `PUBLIC`. Нулевое состояние отдельно
доказывается на disposable/DEV; только после этого generator одной транзакцией защитно отзывает управляемые ACL,
назначает карту §6.1, выдаёт объявленное и выполняет двустороннюю сверку. Защитный revoke generator не заменяет
предшествующую миграцию и не считается доказательством точки ноль.
Инвариант: прикладной login не имеет object ACL; membership точно совпадает с §3, без транзитивных рёбер; `pg_stat_activity`, `pg_stat_get_activity(integer)` и выбранные каталогом §1 `pg_stat_get_backend_*` не имеют `PUBLIC`/login/runtime ACL.
Для каждого `relkind='S'` `aclexplode` не находит `PUBLIC` grants, а `has_sequence_privilege` даёт false на `USAGE`/`SELECT`/`UPDATE` для login/runtime/service-ролей; нужный `nextval`/`last_value` доступен только exact seam owner именованной sequence. Цена: 7 последовательностей, 0 identity-колонок, `app_staff` сейчас держит `rU` на пяти; прямые runtime-INSERT из `projectionOutbox.ts:27` и `integratorPushOutbox.ts:87` переезжают в поимённые швы.

Контур включает database `CONNECT/CREATE/TEMPORARY/settings`; schemas; tables/columns/RLS/policies; sequences; functions/procedures/signatures/security/proconfig; invoker views; matviews/foreign tables; large objects; triggers, constraints/cascades; roles/memberships; FDW/servers/mappings; publications/subscriptions/slots; extensions, languages и tablespaces. Matview/foreign table/large object с managed data по умолчанию запрещён.

Default privileges закрываются для каждого creator. Event trigger `postgres` проверяет каждую managed
`CREATE TABLE` и `ALTER TABLE`, включая позднюю tenant/patient scope-column, и ставит объявленную class wall либо
отклоняет DDL; защита от рекурсии обязательна. CI запрещает ACL/policy/role DDL в migrations и требует declaration
для нового объекта. Cluster allowlist строится из фактических roles, owners и memberships; мощный attribute,
predefined role или object вне exact allowlist — FAIL.

## 7. Миграция, backup и restore

Каждый ordinary deploy и initial/restored-dump cutover получает ровно один target database/environment и не
изменяет sibling DEV/TEST. Initial/restored-dump cutover выполняет `legacy → zero → prove-zero → install → live`;
обычный post-cutover deploy — `schema/data migrations (birth-closed) → declaration reconcile → bidirectional
catalog audit → smoke`. Ни один режим не делает `DROP/CREATE` target database. Общий cluster-role baseline
идемпотентен; удаление env-login требует предварительной проверки зависимостей во всех БД кластера. Host HBA/mTLS
provisioning — разовая операция ввода среды/ротации, а обычный deploy только проверяет readiness своего блока.

Окно — одно локальное соединение `postgres` и одна транзакция. Wrapper временно выдаёт `<env>_migrator` `INHERIT FALSE, SET TRUE, ADMIN FALSE` membership ровно в owners затрагиваемых объектов, затем делает `SET LOCAL SESSION AUTHORIZATION <env>_migrator` и перед каждым schema DDL — `SET LOCAL ROLE <declared_owner>`. Новый object поэтому сразу принадлежит `app_object_owner`, exact seam owner либо `postgres`; существующий DDL получает owner-power той же роли. После `RESET ROLE; RESET SESSION AUTHORIZATION` необходимый backfill исполняет `postgres`. Временные memberships отзываются, exact owner/ACL/policy post-state проверяется до commit.

Цена `NOLOGIN`: target-миграции больше нельзя запускать `run-webapp-drizzle-migrate.mjs` по `DATABASE_URL`; они исполняются только на database host из локального `postgres` connection через этот wrapper.

Grant, migration, backfill, revoke и assertions атомарны: crash до commit откатывает всё; после commit migrator остаётся `NOLOGIN` без `CONNECT` и membership. Положительный контроль применяет representative real migration на disposable clone, проверяет owner нового и изменённого object, успешный backfill и чистый post-state. Отрицательный контроль убивает то же окно до commit и проверяет полный rollback.

Backup — локальная административная операция `postgres`, не чтение через application URL. Restore старых dumps идёт с `--no-owner`; extensions/admin objects создаёт `postgres`, application schema/data восстанавливается через `SET ROLE app_object_owner`, после чего generator назначает exact seam owners и gate проверяет карту. Старые `OWNER TO app_owner`/login из dump не исполняются.

## 8. Исполняемая приёмка

Одна команда использует фактические каталоги и server log и печатает principal/object/result:

1. красный baseline: сегодняшнее прямое подключение без port certificate/password не должно открыть managed data;
2. каждый login из `pg_roles` проверен: поимённые admin-исключения отмечены, у остальных password-only, wrong CN/login и без `SET ROLE` каждая managed application relation даёт permission `42501`, ноль строк и log event; valid certificate matching exact login + SCRAM — положительный control;
3. каждая разрешённая `SET ROLE` без context даёт `42501`; indexed probes «есть/нет» неразличимы и красные, no-scan тихо пуст; context role A + role A зелёный, запрос из role B красный; каждый `relkind='S'` закрыт от direct `last_value`/`nextval`, positive path идёт только через named seam;
4. каталог/tableless SQL укладываются в §1; predicate §1 доказывает ноль `PUBLIC`/login/runtime `EXECUTE` на всём `pg_stat_get_backend_*`; same-login sentinel обязательно идёт через `pg_stat_get_backend_idset()` → `pg_stat_get_backend_activity(integer)`, view и `pg_stat_get_activity` — controls;
5. `PUBLIC`: нет `CONNECT`, application schema `USAGE`, `TEMPORARY` и defaults;
6. каждая фактическая definer-signature текущей базы: exact declaration owner/caller/surface, без installed context и `SET LOCAL ROLE` direct root call отказ;
7. mTLS/context negatives: wrong/missing/expired/revoked client certificate, wrong exact CN/login/port, non-TLS/socket, password-only and server impersonation reject at connect; wrong capability/DB/login/role/backend/transaction/class/purpose/args and pool reuse raise `42501`; CRL reload plus drain terminates every pre-revocation backend;
8. positive controls через оба порта: pre-session, staff, patient, platform, service и integrator получают только объявленный результат; неизвестный портом request не обслуживается;
9. после valid context RLS/policy fault injection и `row_security=off` выявляют silent filtering/лишнюю видимость; без context runtime-role получает в `pg_stats` ноль строк прикладных таблиц;
10. owner/ACL/policy/function/role/cluster census двусторонне совпадает с вариантом декларации для этой базы, включая две context-private relations и отдельно identity resolver/map owner;
11. положительный и crash-контроли миграционного окна §7 оба проходят;
12. зелёный target и снова красный после отката одной независимой поломки каждого механизма.

Generator derives all definer totals from the revision-11 declaration per database (no fixed DEV/TEST total), compares `prosecdef` bidirectionally, and separately checks context/private-state execute, configuration and ACL. The context owner owns exactly two private relations; the identity lookup owner owns the physical→opaque map/resolver. **Historical replacements:** `install_signed_context`, `release_principal_context`, `reset_principal_context` and custom OpenPGP/challenge helpers are absent.

## 9. Closed design decisions

1. HBA certificate authentication is port proof; human identity is later transaction context.
2. SCRAM remains required with `clientcert=verify-full`; password theft alone opens no application connection.
3. `pg_stat_ssl` is not used as proof input; HBA is authoritative.
4. Context is server-bound to declared capability, login, DB OID, backend PID and transaction ID; no custom crypto or freshness protocol remains.
5. The six-argument boolean gate is sole RLS/definer gate: policy checks querying role, definer path checks stored target plus declared owner/root.
6. Variant A private physical→opaque resolver hands off to next transaction; I replaces only that seam.

There is no owner question. A2–A10 implement/test/operate this contract; this document implements only A1.
