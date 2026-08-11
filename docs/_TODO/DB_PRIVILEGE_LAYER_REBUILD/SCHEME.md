# SCHEME revision 9 — целевой слой прав БД BersonCareBot

Authority: [`OWNER_DECISIONS.md`](../../OWNER_DECISIONS.md), «Права БД, роли и стены», затем [`PLAN.md`](PLAN.md). Это target-contract до Ф4: не миграция и не описание текущего каталога.

## 1. Две двери: mTLS до SQL

У managed application data две двери: **webapp** и **integrator**. Application-login — `<env>_webapp_staff`, `<env>_webapp_patient`, `<env>_integrator`; `<env>_migrator` — `NOLOGIN`, локальный `postgres` — единственное административное исключение §7. Неизвестный человек никогда не получает credential или connection: его запрос обслуживает уже известный webapp port только в `pre_session`-транзакции.

Пароль — второй фактор, не доказательство порта. Каждая application connection проходит именно первую подходящую HBA-строку ниже; более широкая allow-строка для этих users запрещена. PostgreSQL применяет только первую совпавшую HBA-строку и при auth failure не переходит к следующей ([PG 16 HBA](https://www.postgresql.org/docs/16/auth-pg-hba-conf.html)).

```conf
hostnossl  <managed_db>  <env>_webapp_staff,<env>_webapp_patient,<env>_integrator  0.0.0.0/0  reject
hostnossl  <managed_db>  <env>_webapp_staff,<env>_webapp_patient,<env>_integrator  ::0/0       reject
local      <managed_db>  <env>_webapp_staff,<env>_webapp_patient,<env>_integrator              reject
hostssl    <managed_db>  <env>_webapp_staff,<env>_webapp_patient  0.0.0.0/0  scram-sha-256 clientcert=verify-full clientname=CN map=bcb_port_webapp
hostssl    <managed_db>  <env>_webapp_staff,<env>_webapp_patient  ::0/0       scram-sha-256 clientcert=verify-full clientname=CN map=bcb_port_webapp
hostssl    <managed_db>  <env>_integrator                         0.0.0.0/0  scram-sha-256 clientcert=verify-full clientname=CN map=bcb_port_integrator
hostssl    <managed_db>  <env>_integrator                         ::0/0       scram-sha-256 clientcert=verify-full clientname=CN map=bcb_port_integrator
```

`<managed_db>` and `<env>` are declaration parameters already expanded per database/environment; they are never HBA `all` user/database entries. The exact `pg_ident.conf` maps are:

```conf
bcb_port_webapp      bcb-port-webapp      <env>_webapp_staff
bcb_port_webapp      bcb-port-webapp      <env>_webapp_patient
bcb_port_integrator  bcb-port-integrator  <env>_integrator
```

One webapp certificate CN may therefore authenticate only those two logins; integrator CN only its login. `verify-full` requires a trusted client certificate and CN-to-login/map match, and can pair with SCRAM ([PG 16 HBA](https://www.postgresql.org/docs/16/auth-pg-hba-conf.html), [certificate auth](https://www.postgresql.org/docs/16/auth-cert.html)). `local postgres ... peer` is a separate preceding admin-only rule; there is no `local` exception for application logins.

The port uses `sslmode=verify-full`, client key, client certificate and CA bundle only from its own env. It verifies server chain/issuer and exact DNS/IP SAN matching `host`; CN is not a hostname fallback. PostgreSQL host keeps server key/certificate and public CA/CRL verifier material only. `ssl_ca_file` enables client verification and `ssl_crl_file`/`ssl_crl_dir` supply CRL input ([PG 16 connection settings](https://www.postgresql.org/docs/16/runtime-config-connection.html)). A private key is never an SQL parameter, GUC, table/dump value, application log value or PostgreSQL log value.

Rotation adds new certificate/key to its port env and accepts its public chain during bounded overlap; then revoke old serial and remove old env key. HBA/`pg_ident.conf` need reload for **new** connections; `ssl_crl_file` loads at configuration reload, while new CRLs in `ssl_crl_dir` are used at connection time ([PG 16 HBA](https://www.postgresql.org/docs/16/auth-pg-hba-conf.html), [SSL settings](https://www.postgresql.org/docs/16/runtime-config-connection.html)). A changed PostgreSQL SSL setting that reports pending restart is applied only by the controlled restart in the host runbook, followed by fresh connection verification. Neither reload nor restart re-authenticates surviving TLS backends. Revocation requires reload, drain both pools, terminate every backend authenticated by that certificate, then establish fresh pooled connections.

Positive controls: valid webapp certificate + mapped staff/patient login + SCRAM; valid integrator certificate + mapped login + SCRAM; and a port whose server `verify-full` succeeds. Negative controls: wrong/missing/expired/revoked certificate, wrong CN map/login/port, non-TLS/socket, stolen password and server impersonation. Each rejects before application SQL. **Historical replacement:** HBA authentication is complete port proof; target has no custom challenge, ciphertext, nonce, proof, replay ledger, verifier, PGP key type or crypto rotation.

## 2. Transaction context (Ф3б-A1)

### 2.1 Types, claims and declared capability

`app.port_name` is enum `('webapp','integrator')`; `app.port_context_class` is enum `('pre_session','staff','patient','platform','integrator','service')`. `app.port_typed_arg` is composite `(type_tag text, value bytea)`. `app.port_context_claims` is:

```sql
(protocol_version smallint, context_class app.port_context_class, target_role name,
 purpose text, function_identity regprocedure, typed_args_hash bytea,
 actor_ref uuid, subject_ref uuid, organization_id uuid,
 integrator_user_id bigint, request_id uuid)
```

Only version `1` is accepted; purpose is ASCII `[a-z][a-z0-9._:-]{0,127}` and hash is 32 bytes. `actor_ref`/`subject_ref` are opaque protocol IDs, never `platform_users.id`. Complete non-NULL matrix: `pre_session` = `request_id,function_identity`; `staff` = `actor_ref,organization_id`; `patient` = `actor_ref,subject_ref,organization_id`; `platform` = `actor_ref`; `integrator` = `integrator_user_id`; `service` = none. Every other identity field is NULL. Named seam roots always carry `function_identity`; direct relations carry NULL and zero-arg hash.

`app_ext.port_context_capabilities`, owned by `app_seam_context_owner`, is the declaration-owned allowlist:

```sql
(capability_id uuid PRIMARY KEY, port app.port_name NOT NULL, session_login name NOT NULL,
 target_role name NOT NULL, context_class app.port_context_class NOT NULL, purpose text NOT NULL,
 function_identity regprocedure NULL, active_from timestamptz NOT NULL, active_until timestamptz NULL,
 CHECK (active_until IS NULL OR active_from < active_until),
 UNIQUE NULLS NOT DISTINCT (port,session_login,target_role,context_class,purpose,function_identity))
```

It contains only declared rows. Installer derives port from `session_user` (both webapp logins → webapp, integrator → integrator); caller cannot name port or login. Capability must exactly equal derived port/login and claims class/role/purpose/function identity and be active. This also limits pre-session to named function/purpose/args and no tenant/medical access.

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
| `app.install_port_context(p_capability_id uuid,p_claims app.port_context_claims)` | `void`; inserts one current transaction row or `42501` | three application logins |
| `app.require_accepted_context(p_effective_role name,p_target_role name,p_context_class app.port_context_class,p_purpose text,p_typed_args_hash bytea,p_function_identity regprocedure)` | `boolean`; true or `42501`, never NULL | exact declaration runtime roles/seam owners |
| `app.require_platform_principal()` | `boolean`; true or `42501` | declared platform roles/seam owners |
| `app.clear_port_context()` | `void`; clears only caller current row | application logins and declared runtime roles |
| `app.current_org_id()`, `app.current_actor_user_id()`, `app.current_patient_user_id()`, `app.current_integrator_user_id()` | matching `uuid`/`bigint` or `42501` | only declared carrying roles/seam owners |
| `app.hash_port_typed_args(p_args app.port_typed_arg[])` | `bytea`, **SECURITY INVOKER IMMUTABLE PARALLEL SAFE**, `SET search_path=pg_catalog` | context owner and exact named seam owners |
| `app_ext.resolve_variant_a_identity(p_platform_user_id uuid)` | `uuid`; private definer resolver | declared pre-session root owners |

`PUBLIC`, login/runtime roles and non-context seam owners have no `USAGE` on `app_ext`, private relation ACL or resolver/helper execute. Closed rows are deleted only by a named context seam after 24h; they cannot replay because every gate requires matching current transaction ID and `cleared_at IS NULL`.

### 2.3 Canonical args, gate and lifecycle

Args are one-dimensional `app.port_typed_arg[]`, lower bound 1, 0–64 elements. NULL array, another dimension/bound, NULL element, invalid tag or invalid size is `22023`. Tag is 1–128 ASCII bytes matching `[a-z][a-z0-9_.]*@[1-9][0-9]*`; value is NULL or 0–1,048,576 bytes. Supported bases: `uuid,oid,integer,bigint,xid8,boolean,text,name,bytea,timestamptz`.

Hash is SHA-256 of `ASCII("BCBPORTARGS") || 0x00 || u16be(1) || u16be(count)`, then each ordinal: `u16be(ordinal)||u16be(1)||u16be(tag_length)||tag||u16be(2)||u32be(value_length)||value`. NULL is length `0xffffffff` without bytes; non-NULL empty is `0`. Integers are unsigned network byte order. Direct relation zero-arg hash is exactly `decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a','hex')`, never NULL. Named root recomputes hash from normalized typed SQL args before data access; HTTP hash is not authority.

`require_accepted_context` checks all six arguments, non-NULL class matrix, current database OID/PID/transaction ID/session login, and one non-cleared row. It is boolean and valid in RLS. Runtime policy uses literals:

```sql
current_user = '<runtime_role>'::name
AND (SELECT app.require_accepted_context('<runtime_role>'::name, '<runtime_role>'::name,
  '<class>'::app.port_context_class, 'relation', <H0>, NULL::regprocedure))
```

Outer policy sees real querying `current_user`. Inside a `SECURITY DEFINER` root, `current_user` is owner ([PG 16 identity functions](https://www.postgresql.org/docs/16/functions-info.html)); its restrictive policy therefore supplies owner as effective role and declaration literals supply stored target/class/purpose/hash/exact root `regprocedure`. It cannot mistake owner for invoker. `regprocedure` is stored by OID and generator renders schema-qualified identity from `pg_proc`/ `pg_namespace`, not search-path display.

One checkout runs: `BEGIN → RESET ROLE → clear_port_context() → install_port_context(...) → SET LOCAL ROLE <target> → queries → clear_port_context() → RESET ROLE → COMMIT`. Any setup, cleanup or query error rolls back and destroys the pool client. `SET LOCAL` ends with transaction, so every transaction installs new context. PostgreSQL permits `SET LOCAL ROLE` in transaction only with membership `SET TRUE`, and cannot run it in a definer ([PG 16 SET ROLE](https://www.postgresql.org/docs/16/sql-set-role.html)).

### 2.4 Variant A → I

A declared pre-session root validates human credential then privately calls `resolve_variant_a_identity(platform_users.id)` to insert-or-return `variant_a_identity_refs(physical_user_id uuid PRIMARY KEY,opaque_ref uuid UNIQUE NOT NULL,created_at timestamptz NOT NULL)`. It returns opaque refs to the known port and commits. The **next** staff/patient/platform transaction supplies opaque refs; scalar accessors resolve physical IDs only privately for Variant-A policies. Physical `platform_users.id` is neither port proof nor a context capability. Variant I replaces resolver/map and subject resolution, not protocol version, mTLS, role graph, typed args or RLS gate.

## 3. Roles, grants and RLS

All managed login/runtime/seam/object-owner roles and `<env>_migrator` are `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`; only three application roles have `LOGIN`. Application login has `CONNECT`, minimal schema access and exact context/pre-session `EXECUTE`, but zero managed table/column/sequence ACL. Runtime relation access begins only after installed context and `SET LOCAL ROLE`.

Every membership is `INHERIT FALSE, SET TRUE, ADMIN FALSE`, with no transitive edges:

| Login | Exact target roles |
|---|---|
| `<env>_webapp_staff` | `app_pre_session,app_staff,app_clinic_billing,app_platform_settings,app_worker,app_operational_media_worker,saas_telemetry_operator` |
| `<env>_webapp_patient` | `app_pre_session,app_patient` |
| `<env>_integrator` | `app_operational_delivery_worker,app_operational_scheduler` |

Global admin uses webapp staff login/role; no own login. `app_object_owner` is NOLOGIN, memberless, no definer functions and subject to FORCE RLS. 42 narrow seam owners remain separate, NOLOGIN, memberless, without BYPASSRLS. `app_operational_diagnostic` is absent.

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

Each managed relation requires exact object/column grant, ENABLE+FORCE RLS, restrictive context gate and permissive business policy. Restrictive policies AND; permissive policies OR ([PG 16 CREATE POLICY](https://www.postgresql.org/docs/16/sql-createpolicy.html)). `USING`/`WITH CHECK` carry same context gate. Missing context raises `42501` before a data-dependent scan and logs; only no-scan query may be quietly empty. `USING (true)` is only exact service/seam owner+relation+operation after gate, never principal-aware. Sequence ACL is zero for PUBLIC/login/runtime/service; only named seam owner can hold named sequence privilege.

## 4. Revision-8 invariants, census and acceptance

Ordinary `app_object_owner`, NOLOGIN migrator, 42 seam owners, no standing BYPASSRLS, sequence wall, catalog-derived revoke of `pg_stat_activity`, `pg_stat_get_activity(integer)` and every `pg_stat_get_backend_*`, and complete object map remain. `PUBLIC EXECUTE` is absent. Context surface is exactly nine definers in §2.2 (private resolver included) plus one invoker helper. **Historical replacements removed:** `install_signed_context`, `release_principal_context`, `reset_principal_context` and all custom OpenPGP/challenge helpers.

```text
target_definer_count = |revision_8_declared_definers \ {install_signed_context,
  release_principal_context, reset_principal_context}| + 9
target_context_function_count = 10
```

Generator derives both from each database's revision-9 declaration: fixed DEV/TEST totals are forbidden. It compares actual `prosecdef` bidirectionally with exact declaration and separately checks all ten context objects, owners, execute/configuration and private-state ACL.

`app_object_owner` owns ordinary schemas/tables/indexes/sequences/views/types/invoker functions; `app_seam_context_owner` alone owns two private context relations and §2 functions. Each other definer belongs to exactly one of 42 seam owners. Generator declares only grants, atomically revokes managed grants from PUBLIC/login/runtime/service/owner roles, then applies owner/ACL/RLS/policy and catalog sweep. Migration is one local `postgres` transaction with temporary `SET TRUE` owner memberships for NOLOGIN migrator; it never grants LOGIN, CONNECT or BYPASSRLS.

Final live proof checks catalogs and server log: every non-admin cluster login and every allowed `SET ROLE` without context returns `42501`, zero managed rows and log event; negative mTLS vectors reject at connect; positive webapp pre-session/staff/patient/platform/service and integrator paths return only declared results. It proves post-revocation pool drain, private-state denial, direct definer rejection, RLS fault injection, sequence wall, catalog revoke and revision-9 census.

## 5. Closed design decisions

1. HBA certificate authentication is port proof; human identity is later transaction context.
2. SCRAM remains required with `clientcert=verify-full`; password theft alone opens no application connection.
3. `pg_stat_ssl` is not used as proof input; HBA is authoritative.
4. Context is server-bound to declared capability, login, DB OID, backend PID and transaction ID; no custom crypto or replay protocol remains.
5. The six-argument boolean gate is sole RLS/definer gate: policy checks querying role, definer path checks stored target plus declared owner/root.
6. Variant A private physical→opaque resolver hands off to next transaction; I replaces only that seam.

There is no owner question. A2–A10 implement/test/operate this contract; this document implements only A1.
