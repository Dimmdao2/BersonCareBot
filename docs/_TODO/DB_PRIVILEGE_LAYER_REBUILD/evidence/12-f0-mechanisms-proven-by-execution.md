# PostgreSQL 16 privilege-layer mechanism execution report

All SQL below was executed against a rootless disposable cluster. The system PostgreSQL and all BersonCare databases were untouched.

## Disposable-cluster evidence

```text
$ /usr/lib/postgresql/16/bin/initdb -D /tmp/sol-f0-pg16.daXK6q/data --username=ephemeral_admin --auth-local=trust --auth-host=reject --no-instructions
The files belonging to this database system will be owned by user "dev".
This user must also own the server process.

The database cluster will be initialized with locale "C.UTF-8".
The default database encoding has accordingly been set to "UTF8".
The default text search configuration will be set to "english".

Data page checksums are disabled.

creating directory /tmp/sol-f0-pg16.daXK6q/data ... ok
creating subdirectories ... ok
selecting dynamic shared memory implementation ... posix
selecting default max_connections ... 100
selecting default shared_buffers ... 128MB
selecting default time zone ... Europe/Moscow
creating configuration files ... ok
running bootstrap script ... ok
performing post-bootstrap initialization ... ok
syncing data to disk ... ok
$ /usr/lib/postgresql/16/bin/pg_ctl -D /tmp/sol-f0-pg16.daXK6q/data -l /tmp/sol-f0-pg16.daXK6q/postgres.log -o "-k /tmp/sol-f0-pg16.daXK6q/socket -c listen_addresses='' -c unix_socket_permissions=0700" start
waiting for server to start.... done
server started
$ psql -h /tmp/sol-f0-pg16.daXK6q/socket -U ephemeral_admin -d postgres -c "CREATE DATABASE mechanisms;"
CREATE DATABASE
$ psql -h /tmp/sol-f0-pg16.daXK6q/socket -U ephemeral_admin -d mechanisms -c "SELECT version(), current_database(), current_user, inet_server_addr(), current_setting('listen_addresses') AS listen_addresses, current_setting('unix_socket_directories') AS socket_dir, current_setting('data_directory') AS data_dir;"
                                                                 version                                                                  | current_database |  current_user   | inet_server_addr | listen_addresses |           socket_dir           |           data_dir
------------------------------------------------------------------------------------------------------------------------------------------+------------------+-----------------+------------------+------------------+--------------------------------+------------------------------
 PostgreSQL 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1) on x86_64-pc-linux-gnu, compiled by gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0, 64-bit | mechanisms       | ephemeral_admin |                  |                  | /tmp/sol-f0-pg16.daXK6q/socket | /tmp/sol-f0-pg16.daXK6q/data
(1 row)
```

## 1. Fresh-object access and all implicit sources

**Verdict: CONFIRMED**

```text
$ psql -U ephemeral_admin <<SQL
CREATE ROLE owner_a LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
CREATE ROLE
CREATE ROLE runtime_a LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
CREATE ROLE
GRANT CREATE ON DATABASE mechanisms TO owner_a;
GRANT
$ psql -U owner_a <<SQL
CREATE SCHEMA app_data AUTHORIZATION owner_a;
CREATE SCHEMA
CREATE TABLE app_data.out_of_box(id integer PRIMARY KEY, name text);
CREATE TABLE
INSERT INTO app_data.out_of_box VALUES (1, 'owner row');
INSERT 0 1
$ psql -U ephemeral_admin <<SQL
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolinherit, rolbypassrls
FROM pg_roles WHERE rolname IN ('owner_a','runtime_a') ORDER BY rolname;
  rolname  | rolsuper | rolcreaterole | rolcreatedb | rolinherit | rolbypassrls
-----------+----------+---------------+-------------+------------+--------------
 owner_a   | f        | f             | f           | t          | f
 runtime_a | f        | f             | f           | t          | f
(2 rows)

SELECT COALESCE(r.rolname, 'PUBLIC') AS grantee, x.privilege_type
FROM pg_database d
CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl, acldefault('d', d.datdba))) x
LEFT JOIN pg_roles r ON r.oid = x.grantee
WHERE d.datname = current_database()
ORDER BY grantee, privilege_type;
     grantee     | privilege_type
-----------------+----------------
 PUBLIC          | CONNECT
 PUBLIC          | TEMPORARY
 ephemeral_admin | CONNECT
 ephemeral_admin | CREATE
 ephemeral_admin | TEMPORARY
 owner_a         | CREATE
(6 rows)

SELECT n.nspname, COALESCE(r.rolname, 'PUBLIC') AS grantee, x.privilege_type
FROM pg_namespace n
CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) x
LEFT JOIN pg_roles r ON r.oid = x.grantee
WHERE n.nspname IN ('public','app_data')
ORDER BY n.nspname, grantee, privilege_type;
 nspname  |      grantee      | privilege_type
----------+-------------------+----------------
 app_data | owner_a           | CREATE
 app_data | owner_a           | USAGE
 public   | PUBLIC            | USAGE
 public   | pg_database_owner | CREATE
 public   | pg_database_owner | USAGE
(5 rows)

SELECT c.relacl,
       has_schema_privilege('runtime_a','app_data','USAGE') AS runtime_schema_usage,
       has_schema_privilege('runtime_a','app_data','CREATE') AS runtime_schema_create,
       has_table_privilege('runtime_a','app_data.out_of_box','SELECT') AS runtime_table_select,
       has_table_privilege('runtime_a','app_data.out_of_box','INSERT') AS runtime_table_insert,
       has_database_privilege('runtime_a',current_database(),'CONNECT') AS runtime_connect,
       has_database_privilege('runtime_a',current_database(),'TEMP') AS runtime_temp,
       has_database_privilege('runtime_a',current_database(),'CREATE') AS runtime_db_create
FROM pg_class c WHERE c.oid='app_data.out_of_box'::regclass;
 relacl | runtime_schema_usage | runtime_schema_create | runtime_table_select | runtime_table_insert | runtime_connect | runtime_temp | runtime_db_create
--------+----------------------+-----------------------+----------------------+----------------------+-----------------+--------------+-------------------
        | f                    | f                     | f                    | f                    | t               | t            | f
(1 row)

SELECT count(*) AS pg_default_acl_rows FROM pg_default_acl;
 pg_default_acl_rows
---------------------
                   0
(1 row)

SELECT parent.rolname AS inherited_role
FROM pg_auth_members m
JOIN pg_roles parent ON parent.oid=m.roleid
JOIN pg_roles member ON member.oid=m.member
WHERE member.rolname='runtime_a';
 inherited_role
----------------
(0 rows)

$ psql -U runtime_a <<SQL
SELECT current_user, current_database();
 current_user | current_database
--------------+------------------
 runtime_a    | mechanisms
(1 row)

SELECT * FROM app_data.out_of_box;
ERROR:  42501: permission denied for schema app_data
LINE 1: SELECT * FROM app_data.out_of_box;
                      ^
LOCATION:  aclcheck_error, aclchk.c:2812
INSERT INTO app_data.out_of_box VALUES (2, 'runtime row');
ERROR:  42501: permission denied for schema app_data
LINE 1: INSERT INTO app_data.out_of_box VALUES (2, 'runtime row');
                    ^
LOCATION:  aclcheck_error, aclchk.c:2812
CREATE TABLE app_data.runtime_attempt(id integer);
ERROR:  42501: permission denied for schema app_data
LINE 1: CREATE TABLE app_data.runtime_attempt(id integer);
                     ^
LOCATION:  aclcheck_error, aclchk.c:2812
CREATE SCHEMA runtime_attempt;
ERROR:  42501: permission denied for database mechanisms
LOCATION:  aclcheck_error, aclchk.c:2812
CREATE TEMP TABLE runtime_temp_ok(id integer);
CREATE TABLE
INSERT INTO runtime_temp_ok VALUES (1);
INSERT 0 1
SELECT * FROM runtime_temp_ok;
 id
----
  1
(1 row)

$ psql -U ephemeral_admin <<SQL
GRANT USAGE ON SCHEMA app_data TO runtime_a;
GRANT
$ psql -U runtime_a <<SQL
SELECT * FROM app_data.out_of_box;
ERROR:  42501: permission denied for table out_of_box
LOCATION:  aclcheck_error, aclchk.c:2812
INSERT INTO app_data.out_of_box VALUES (2, 'runtime row');
ERROR:  42501: permission denied for table out_of_box
LOCATION:  aclcheck_error, aclchk.c:2812

$ psql -U ephemeral_admin <<SQL
WITH kinds(kind, code) AS (
  VALUES ('TABLE','r'::"char"), ('SEQUENCE','S'::"char"),
         ('FUNCTION','f'::"char"), ('TYPE','T'::"char"), ('SCHEMA','n'::"char")
)
SELECT k.kind, COALESCE(r.rolname,'PUBLIC') AS grantee,
       string_agg(x.privilege_type, ',' ORDER BY x.privilege_type) AS privileges
FROM kinds k
CROSS JOIN LATERAL aclexplode(acldefault(k.code,'owner_a'::regrole)) x
LEFT JOIN pg_roles r ON r.oid=x.grantee
GROUP BY k.kind, COALESCE(r.rolname,'PUBLIC')
ORDER BY k.kind, grantee;
   kind   | grantee |                       privileges
----------+---------+---------------------------------------------------------
 FUNCTION | PUBLIC  | EXECUTE
 FUNCTION | owner_a | EXECUTE
 SCHEMA   | owner_a | CREATE,USAGE
 SEQUENCE | owner_a | USAGE
 TABLE    | owner_a | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
 TYPE     | PUBLIC  | USAGE
TYPE     | owner_a | USAGE
(7 rows)

SELECT has_schema_privilege('runtime_a','pg_catalog','USAGE') AS pg_catalog_usage,
       has_table_privilege('runtime_a','pg_catalog.pg_class','SELECT') AS pg_class_select;
 pg_catalog_usage | pg_class_select
------------------+-----------------
 t                | t
(1 row)
```

For the new application table, the only implicit privilege holder was its owner; `PUBLIC` had no schema or table privilege, `pg_default_acl` was empty, and `runtime_a` had no inherited roles. The relevant cluster-wide implicit sources were `PUBLIC CONNECT` and `TEMPORARY` on the database, `PUBLIC USAGE` on the special `public` schema, default `PUBLIC EXECUTE` on functions, default `PUBLIC USAGE` on types, plus normal readable system catalogs; none conferred access to `app_data.out_of_box`.

## 2. One-time setup for durable “new table = zero runtime access”

**Verdict: CONFIRMED-WITH-CAVEATS**

```text
$ psql -U ephemeral_admin <<SQL
REVOKE ALL PRIVILEGES ON DATABASE mechanisms FROM PUBLIC;
REVOKE
GRANT CONNECT ON DATABASE mechanisms TO owner_a, runtime_a;
GRANT
REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC;
REVOKE
REVOKE ALL PRIVILEGES ON SCHEMA app_data FROM PUBLIC;
REVOKE
GRANT USAGE ON SCHEMA app_data TO runtime_a;
GRANT
ALTER DEFAULT PRIVILEGES FOR ROLE owner_a REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES
ALTER DEFAULT PRIVILEGES FOR ROLE owner_a REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES
ALTER DEFAULT PRIVILEGES FOR ROLE owner_a REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES
ALTER DEFAULT PRIVILEGES FOR ROLE owner_a REVOKE ALL PRIVILEGES ON TYPES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES
SELECT COALESCE(r.rolname, 'PUBLIC') AS grantee, x.privilege_type
FROM pg_database d
CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl, acldefault('d', d.datdba))) x
LEFT JOIN pg_roles r ON r.oid=x.grantee
WHERE d.datname=current_database()
ORDER BY grantee, privilege_type;
     grantee     | privilege_type
-----------------+----------------
 ephemeral_admin | CONNECT
 ephemeral_admin | CREATE
 ephemeral_admin | TEMPORARY
 owner_a         | CONNECT
 owner_a         | CREATE
 runtime_a       | CONNECT
(6 rows)

$ psql -U owner_a <<SQL
CREATE TABLE app_data.closed_after_setup(id integer);
CREATE TABLE
$ psql -U runtime_a <<SQL
SELECT current_user, current_database();
 current_user | current_database
--------------+------------------
 runtime_a    | mechanisms
(1 row)

SELECT id FROM app_data.closed_after_setup;
ERROR:  42501: permission denied for table closed_after_setup
LOCATION:  aclcheck_error, aclchk.c:2812
$ psql -U ephemeral_admin <<SQL
SELECT c.relacl,
       has_schema_privilege('runtime_a','app_data','USAGE') AS explicit_schema_usage,
       has_table_privilege('runtime_a','app_data.closed_after_setup','SELECT') AS table_select,
       COALESCE((SELECT bool_or(a.grantee=0 AND a.privilege_type='SELECT')
                 FROM aclexplode(c.relacl) a), false) AS public_table_select
FROM pg_class c WHERE c.oid='app_data.closed_after_setup'::regclass;
 relacl | explicit_schema_usage | table_select | public_table_select
--------+-----------------------+--------------+---------------------
        | t                     | f            | f
(1 row)
```

The durable setup is: remove database/schema privileges from `PUBLIC`, explicitly restore only required `CONNECT`/`USAGE`, restrict schema `CREATE` to controlled creator roles, and harden each controlled creator’s global defaults (especially function/type defaults). The caveat is item 3: this is one-time only for a closed, enumerated creator-role set; every additional creating role carries its own defaults.

## 3. Four `ALTER DEFAULT PRIVILEGES` caveats

**Verdict: CONFIRMED**

### 3(a). Pre-existing objects are unchanged

```text
$ psql -U owner_a <<SQL
CREATE TABLE defaults_a.pre_existing(id integer);
CREATE TABLE
INSERT INTO defaults_a.pre_existing VALUES (1);
INSERT 0 1
$ psql -U ephemeral_admin <<SQL
ALTER DEFAULT PRIVILEGES FOR ROLE owner_a IN SCHEMA defaults_a
  GRANT SELECT ON TABLES TO runtime_old;
ALTER DEFAULT PRIVILEGES
$ psql -U owner_a <<SQL
CREATE TABLE defaults_a.post_default(id integer);
CREATE TABLE
INSERT INTO defaults_a.post_default VALUES (2);
INSERT 0 1
$ psql -U runtime_old <<SQL
SELECT * FROM defaults_a.pre_existing;
ERROR:  42501: permission denied for table pre_existing
LOCATION:  aclcheck_error, aclchk.c:2812
SELECT * FROM defaults_a.post_default;
 id
----
  2
(1 row)
```

The default changed only the object created after the `ALTER DEFAULT PRIVILEGES` statement.

### 3(b). Defaults are not inherited from role membership

```text
$ psql -U ephemeral_admin <<SQL
CREATE ROLE defaults_group NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE
CREATE ROLE member_creator LOGIN NOSUPERUSER NOBYPASSRLS IN ROLE defaults_group;
CREATE ROLE
ALTER DEFAULT PRIVILEGES FOR ROLE defaults_group IN SCHEMA defaults_b
  GRANT SELECT ON TABLES TO runtime_group;
ALTER DEFAULT PRIVILEGES
$ psql -U member_creator <<SQL
SELECT current_user, pg_has_role(current_user,'defaults_group','MEMBER') AS is_member;
  current_user  | is_member
----------------+-----------
 member_creator | t
(1 row)

CREATE TABLE defaults_b.member_created(id integer);
CREATE TABLE
INSERT INTO defaults_b.member_created VALUES (10);
INSERT 0 1
SET ROLE defaults_group;
SET
SELECT current_user;
  current_user
----------------
 defaults_group
(1 row)

CREATE TABLE defaults_b.group_created(id integer);
CREATE TABLE
INSERT INTO defaults_b.group_created VALUES (20);
INSERT 0 1
$ psql -U runtime_group <<SQL
SELECT * FROM defaults_b.member_created;
ERROR:  42501: permission denied for table member_created
LOCATION:  aclcheck_error, aclchk.c:2812
SELECT * FROM defaults_b.group_created;
 id
----
 20
(1 row)
```

Membership was true, but defaults applied only after `SET ROLE defaults_group` made that role the actual creator.

### 3(c). The default is materialized at creation and is not recomputed on owner change

```text
$ psql -U member_creator <<SQL
ALTER TABLE defaults_b.member_created OWNER TO defaults_group;
ALTER TABLE
$ psql -U ephemeral_admin <<SQL
ALTER TABLE defaults_b.group_created OWNER TO owner_a;
ALTER TABLE
SELECT c.relname, c.relowner::regrole AS current_owner, c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='defaults_b' AND c.relname IN ('member_created','group_created')
ORDER BY c.relname;
    relname     | current_owner  |                      relacl
----------------+----------------+---------------------------------------------------
 group_created  | owner_a        | {runtime_group=r/owner_a,owner_a=arwdDxt/owner_a}
 member_created | defaults_group |
(2 rows)

$ psql -U runtime_group <<SQL
SELECT * FROM defaults_b.member_created;
ERROR:  42501: permission denied for table member_created
LOCATION:  aclcheck_error, aclchk.c:2812
SELECT * FROM defaults_b.group_created;
 id
----
 20
(1 row)
```

Changing `member_created` to the role that owned the default did not add the default grant; changing `group_created` away from that role did not remove the already-materialized grant.

### 3(d). Per-schema defaults cannot subtract a global default

```text
$ psql -U ephemeral_admin <<SQL
ALTER DEFAULT PRIVILEGES FOR ROLE owner_a
  GRANT SELECT ON TABLES TO runtime_global;
ALTER DEFAULT PRIVILEGES
ALTER DEFAULT PRIVILEGES FOR ROLE owner_a IN SCHEMA defaults_d
  REVOKE SELECT ON TABLES FROM runtime_global;
ALTER DEFAULT PRIVILEGES
SELECT d.defaclnamespace::regnamespace AS in_schema, d.defaclobjtype, d.defaclacl
FROM pg_default_acl d
WHERE d.defaclrole='owner_a'::regrole AND d.defaclobjtype='r'
ORDER BY d.defaclnamespace;
 in_schema  | defaclobjtype |                     defaclacl
------------+---------------+----------------------------------------------------
 -          | r             | {owner_a=arwdDxt/owner_a,runtime_global=r/owner_a}
 defaults_a | r             | {runtime_old=r/owner_a}
(2 rows)

$ psql -U owner_a <<SQL
CREATE TABLE defaults_d.global_wins_2(id integer);
CREATE TABLE
INSERT INTO defaults_d.global_wins_2 VALUES (31);
INSERT 0 1
$ psql -U runtime_global <<SQL
SELECT * FROM defaults_d.global_wins_2;
 id
----
 31
(1 row)
$ psql -U ephemeral_admin <<SQL
SELECT c.relacl, has_table_privilege('runtime_global','defaults_d.global_wins_2','SELECT') AS runtime_select
FROM pg_class c WHERE c.oid='defaults_d.global_wins_2'::regclass;
                       relacl                       | runtime_select
----------------------------------------------------+----------------
 {owner_a=arwdDxt/owner_a,runtime_global=r/owner_a} | t
(1 row)
```

The attempted schema-local revoke created no negative/default-override entry; the global `SELECT` default still applied.

## 4. `ddl_command_end` wall enabling and forcing RLS

**Verdict: CONFIRMED-WITH-CAVEATS**

```text
$ psql -U ephemeral_admin <<SQL
CREATE SCHEMA app_control AUTHORIZATION ephemeral_admin;
CREATE SCHEMA
REVOKE ALL ON SCHEMA app_control FROM PUBLIC;
REVOKE
CREATE TABLE app_control.wall_mode(reject_undeclared boolean NOT NULL);
CREATE TABLE
INSERT INTO app_control.wall_mode VALUES (false);
INSERT 0 1
CREATE TABLE app_control.org_table_allowlist(
  schema_name name NOT NULL,
  table_name name NOT NULL,
  PRIMARY KEY(schema_name, table_name)
);
CREATE TABLE
CREATE TABLE app_control.ddl_wall_log(
  log_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor name NOT NULL,
  command_tag text NOT NULL,
  object_identity text NOT NULL,
  action text NOT NULL
);
CREATE TABLE
CREATE FUNCTION app_control.enforce_org_table_wall()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app_control
AS $$
DECLARE
  cmd record;
  obj_schema name;
  obj_name name;
  has_org boolean;
  rls_on boolean;
  force_on boolean;
  reject_mode boolean;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    IF cmd.classid = 'pg_class'::regclass
       AND cmd.objid <> 0
       AND cmd.command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'ALTER TABLE') THEN
      SELECT n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
      INTO obj_schema, obj_name, rls_on, force_on
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.oid = cmd.objid AND c.relkind IN ('r','p');

      IF FOUND AND obj_schema = 'app_data' THEN
        SELECT EXISTS (
          SELECT 1 FROM pg_attribute a
          WHERE a.attrelid = cmd.objid
            AND a.attname = 'organization_id'
            AND a.attnum > 0
            AND NOT a.attisdropped
        ) INTO has_org;

        IF has_org THEN
          SELECT reject_undeclared INTO reject_mode FROM app_control.wall_mode;
          IF reject_mode AND NOT EXISTS (
            SELECT 1 FROM app_control.org_table_allowlist l
            WHERE l.schema_name = obj_schema AND l.table_name = obj_name
          ) THEN
            RAISE EXCEPTION USING
              ERRCODE = '42501',
              MESSAGE = format('org table %I.%I is not declared in allowlist', obj_schema, obj_name);
          END IF;

          INSERT INTO app_control.ddl_wall_log(actor, command_tag, object_identity, action)
          VALUES (session_user, cmd.command_tag, cmd.object_identity, 'enforce RLS+FORCE');

          IF NOT rls_on THEN
            EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', obj_schema, obj_name);
          END IF;
          SELECT c.relforcerowsecurity INTO force_on FROM pg_class c WHERE c.oid = cmd.objid;
          IF NOT force_on THEN
            EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', obj_schema, obj_name);
          END IF;
        END IF;
      END IF;
    END IF;
  END LOOP;
END
$$;
CREATE FUNCTION
REVOKE ALL ON FUNCTION app_control.enforce_org_table_wall() FROM PUBLIC;
REVOKE
CREATE EVENT TRIGGER org_table_wall
  ON ddl_command_end
  EXECUTE FUNCTION app_control.enforce_org_table_wall();
CREATE EVENT TRIGGER
$ psql -U owner_a <<SQL
CREATE TABLE app_data.org_auto(
  id bigint PRIMARY KEY,
  organization_id bigint NOT NULL
);
CREATE TABLE
$ psql -U ephemeral_admin <<SQL
SELECT c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c WHERE c.oid='app_data.org_auto'::regclass;
 relrowsecurity | relforcerowsecurity
----------------+---------------------
 t              | t
(1 row)

SELECT actor, command_tag, object_identity, action
FROM app_control.ddl_wall_log
WHERE object_identity='app_data.org_auto'
ORDER BY log_id;
  actor  | command_tag  |  object_identity  |      action
---------+--------------+-------------------+-------------------
 owner_a | CREATE TABLE | app_data.org_auto | enforce RLS+FORCE
 owner_a | ALTER TABLE  | app_data.org_auto | enforce RLS+FORCE
 owner_a | ALTER TABLE  | app_data.org_auto | enforce RLS+FORCE
(3 rows)
```

The wall set both catalog flags before `CREATE TABLE` returned. The caveat is visible in the log: the wall’s own two `ALTER TABLE` statements recursively fire `ddl_command_end`; a production version should suppress redundant recursive work or use a guarded no-op path.

## 5. Reject mode with declared allowlist

**Verdict: CONFIRMED**

```text
$ psql -U ephemeral_admin <<SQL
UPDATE app_control.wall_mode SET reject_undeclared=true;
UPDATE 1
INSERT INTO app_control.org_table_allowlist VALUES ('app_data','allowed_org');
INSERT 0 1
$ psql -U owner_a <<SQL
CREATE TABLE app_data.allowed_org(id bigint, organization_id bigint);
CREATE TABLE
CREATE TABLE app_data.rejected_org(id bigint, organization_id bigint);
ERROR:  42501: org table app_data.rejected_org is not declared in allowlist
CONTEXT:  PL/pgSQL function enforce_org_table_wall() line 36 at RAISE
LOCATION:  exec_stmt_raise, pl_exec.c:3897
$ psql -U ephemeral_admin <<SQL
SELECT to_regclass('app_data.allowed_org') AS accepted,
       to_regclass('app_data.rejected_org') AS rejected;
       accepted       | rejected
----------------------+----------
 app_data.allowed_org |
(1 row)

SELECT c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c WHERE c.oid='app_data.allowed_org'::regclass;
 relrowsecurity | relforcerowsecurity
----------------+---------------------
 t              | t
(1 row)
```

The declared table was created and walled; the undeclared table raised `42501`, and `to_regclass` proved its DDL was rolled back.

## 6. Event-trigger coverage and administrative limits

**Verdict: CONFIRMED-WITH-CAVEATS**

```text
$ psql -U ephemeral_admin <<SQL
INSERT INTO app_control.org_table_allowlist VALUES
 ('app_data','super_org'),
 ('app_data','owner_org'),
 ('app_data','ctas_org'),
 ('app_data','alter_late');
INSERT 0 4
CREATE TABLE app_data.super_org(id bigint, organization_id bigint);
CREATE TABLE
$ psql -U owner_a <<SQL
CREATE TABLE app_data.owner_org(id bigint, organization_id bigint);
CREATE TABLE
CREATE TABLE app_data.ctas_org AS
  SELECT 1::bigint AS id, 42::bigint AS organization_id;
SELECT 1
CREATE TABLE app_data.alter_late(id bigint);
CREATE TABLE
$ psql -U ephemeral_admin <<SQL
SELECT c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c WHERE c.oid='app_data.alter_late'::regclass;
 relrowsecurity | relforcerowsecurity
----------------+---------------------
 f              | f
(1 row)

$ psql -U owner_a <<SQL
ALTER TABLE app_data.alter_late ADD COLUMN organization_id bigint;
ALTER TABLE
$ psql -U ephemeral_admin <<SQL
SELECT c.relname, c.relowner::regrole AS table_owner,
       c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='app_data'
  AND c.relname IN ('super_org','owner_org','ctas_org','alter_late')
ORDER BY c.relname;
  relname   |   table_owner   | relrowsecurity | relforcerowsecurity
------------+-----------------+----------------+---------------------
 alter_late | owner_a         | t              | t
 ctas_org   | owner_a         | t              | t
 owner_org  | owner_a         | t              | t
 super_org  | ephemeral_admin | t              | t
(4 rows)

SELECT actor, command_tag, object_identity, action
FROM app_control.ddl_wall_log
WHERE object_identity IN ('app_data.super_org','app_data.owner_org','app_data.ctas_org','app_data.alter_late')
ORDER BY log_id;
      actor      |   command_tag   |   object_identity   |      action
-----------------+-----------------+---------------------+-------------------
 ephemeral_admin | CREATE TABLE    | app_data.super_org  | enforce RLS+FORCE
 ephemeral_admin | ALTER TABLE     | app_data.super_org  | enforce RLS+FORCE
 ephemeral_admin | ALTER TABLE     | app_data.super_org  | enforce RLS+FORCE
 owner_a         | CREATE TABLE    | app_data.owner_org  | enforce RLS+FORCE
 owner_a         | ALTER TABLE     | app_data.owner_org  | enforce RLS+FORCE
 owner_a         | ALTER TABLE     | app_data.owner_org  | enforce RLS+FORCE
 owner_a         | CREATE TABLE AS | app_data.ctas_org   | enforce RLS+FORCE
 owner_a         | ALTER TABLE     | app_data.ctas_org   | enforce RLS+FORCE
 owner_a         | ALTER TABLE     | app_data.ctas_org   | enforce RLS+FORCE
 owner_a         | ALTER TABLE     | app_data.alter_late | enforce RLS+FORCE
 owner_a         | ALTER TABLE     | app_data.alter_late | enforce RLS+FORCE
 owner_a         | ALTER TABLE     | app_data.alter_late | enforce RLS+FORCE
(12 rows)

$ psql -U ephemeral_admin <<SQL
CREATE ROLE event_super LOGIN SUPERUSER;
CREATE ROLE
GRANT CONNECT ON DATABASE mechanisms TO event_super;
GRANT
CREATE EVENT TRIGGER ownership_probe
  ON ddl_command_end
  EXECUTE FUNCTION app_control.enforce_org_table_wall();
CREATE EVENT TRIGGER
ALTER EVENT TRIGGER ownership_probe DISABLE;
ALTER EVENT TRIGGER
SELECT rolname, rolsuper FROM pg_roles WHERE rolname IN ('owner_a','event_super') ORDER BY rolname;
   rolname   | rolsuper
-------------+----------
 event_super | t
 owner_a     | f
(2 rows)

$ psql -U owner_a <<SQL
ALTER EVENT TRIGGER org_table_wall DISABLE;
ERROR:  42501: must be owner of event trigger org_table_wall
LOCATION:  aclcheck_error, aclchk.c:2950
DROP EVENT TRIGGER ownership_probe;
ERROR:  42501: must be owner of event trigger ownership_probe
LOCATION:  aclcheck_error, aclchk.c:2950
$ psql -U ephemeral_admin <<SQL
ALTER EVENT TRIGGER ownership_probe OWNER TO owner_a;
ERROR:  42501: permission denied to change owner of event trigger "ownership_probe"
HINT:  The owner of an event trigger must be a superuser.
LOCATION:  AlterEventTriggerOwner_internal, event_trigger.c:485
ALTER EVENT TRIGGER ownership_probe OWNER TO event_super;
ALTER EVENT TRIGGER
$ psql -U event_super <<SQL
ALTER EVENT TRIGGER ownership_probe ENABLE;
ALTER EVENT TRIGGER
SELECT evtname, evtenabled, evtowner::regrole AS owner FROM pg_event_trigger
WHERE evtname='ownership_probe';
     evtname     | evtenabled |    owner
-----------------+------------+-------------
 ownership_probe | O          | event_super
(1 row)

ALTER EVENT TRIGGER ownership_probe DISABLE;
ALTER EVENT TRIGGER
DROP EVENT TRIGGER ownership_probe;
DROP EVENT TRIGGER
SELECT to_regclass('pg_catalog.pg_event_trigger') IS NOT NULL AS catalog_still_present,
       count(*) FILTER (WHERE evtname='ownership_probe') AS ownership_probe_count
FROM pg_event_trigger;
 catalog_still_present | ownership_probe_count
-----------------------+-----------------------
 t                     |                     0
(1 row)
```

`ddl_command_end` fired for superuser DDL, ordinary table-owner DDL, `CREATE TABLE AS`, and `ALTER TABLE ... ADD COLUMN`; the handler must explicitly include and process the `ALTER TABLE` tag to close the late-column path. Event-trigger ownership requires `SUPERUSER`, so only a superuser can own and therefore normally disable/drop it; superuser compromise remains outside this wall.

## 7. Column-level grants and loud `SELECT *` failure

**Verdict: CONFIRMED-WITH-CAVEATS**

```text
$ psql -U ephemeral_admin <<SQL
CREATE TABLE coltest.docs_with_hidden(
  id integer,
  name text,
  internal_marker text
);
CREATE TABLE
INSERT INTO coltest.docs_with_hidden VALUES (1,'visible','hidden');
INSERT 0 1
GRANT SELECT (id, name) ON coltest.docs_with_hidden TO runtime_col;
GRANT
$ psql -U runtime_col <<SQL
SELECT id, name FROM coltest.docs_with_hidden;
 id |  name
----+---------
  1 | visible
(1 row)

SELECT * FROM coltest.docs_with_hidden;
ERROR:  42501: permission denied for table docs_with_hidden
LOCATION:  aclcheck_error, aclchk.c:2812
$ psql -U ephemeral_admin <<SQL
ALTER TABLE coltest.docs_with_hidden ADD COLUMN secret text DEFAULT 'new secret';
ALTER TABLE
$ psql -U runtime_col <<SQL
SELECT * FROM coltest.docs_with_hidden;
ERROR:  42501: permission denied for table docs_with_hidden
LOCATION:  aclcheck_error, aclchk.c:2812
SELECT id, name FROM coltest.docs_with_hidden;
 id |  name
----+---------
  1 | visible
(1 row)

$ psql -U ephemeral_admin <<SQL
CREATE TABLE coltest.docs_transition(id integer, name text);
CREATE TABLE
INSERT INTO coltest.docs_transition VALUES (2,'before add');
INSERT 0 1
GRANT SELECT (id, name) ON coltest.docs_transition TO runtime_col;
GRANT
$ psql -U runtime_col <<SQL
SELECT * FROM coltest.docs_transition;
 id |    name
----+------------
  2 | before add
(1 row)

$ psql -U ephemeral_admin <<SQL
ALTER TABLE coltest.docs_transition ADD COLUMN secret text DEFAULT 'not granted';
ALTER TABLE
$ psql -U runtime_col <<SQL
SELECT * FROM coltest.docs_transition;
ERROR:  42501: permission denied for table docs_transition
LOCATION:  aclcheck_error, aclchk.c:2812
SELECT id, name FROM coltest.docs_transition;
 id |    name
----+------------
  2 | before add
(1 row)
```

An ungranted selected column causes a loud `42501`; adding `secret` does not extend the existing column ACL and turns a formerly valid `SELECT *` into a loud failure while named granted columns continue working. Caveat: `SELECT *` is not intrinsically forbidden—when every existing column is granted, it succeeds until an ungranted column appears.

## 8. Idempotent full reapply and transactional atomicity

**Verdict: CONFIRMED**

```text
$ psql -U ephemeral_admin <<SQL
CREATE TABLE gen.t1(id integer, name text);
CREATE TABLE
CREATE TABLE gen.t2(id integer, name text);
CREATE TABLE
SELECT c.relname, c.relacl::text AS relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='gen' AND c.relname IN ('t1','t2') ORDER BY c.relname;
 relname | relacl
---------+--------
 t1      |
 t2      |
(2 rows)

$ psql -U ephemeral_admin <<SQL  # first run
BEGIN;
BEGIN
REVOKE ALL PRIVILEGES ON gen.t1, gen.t2 FROM runtime_r1, runtime_r2;
REVOKE
GRANT SELECT ON gen.t1 TO runtime_r1;
GRANT
GRANT INSERT ON gen.t1 TO runtime_r2;
GRANT
GRANT SELECT ON gen.t2 TO runtime_r1;
GRANT
GRANT UPDATE ON gen.t2 TO runtime_r2;
GRANT
COMMIT;
COMMIT
SELECT c.relname, c.relacl::text AS relacl_after_first
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='gen' AND c.relname IN ('t1','t2') ORDER BY c.relname;
 relname |                                         relacl_after_first
---------+-----------------------------------------------------------------------------------------------------
 t1      | {ephemeral_admin=arwdDxt/ephemeral_admin,runtime_r1=r/ephemeral_admin,runtime_r2=a/ephemeral_admin}
 t2      | {ephemeral_admin=arwdDxt/ephemeral_admin,runtime_r1=r/ephemeral_admin,runtime_r2=w/ephemeral_admin}
(2 rows)

$ psql -U ephemeral_admin <<SQL  # identical second run
SELECT c.relname, c.relacl::text AS relacl_before_second
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='gen' AND c.relname IN ('t1','t2') ORDER BY c.relname;
 relname |                                        relacl_before_second
---------+-----------------------------------------------------------------------------------------------------
 t1      | {ephemeral_admin=arwdDxt/ephemeral_admin,runtime_r1=r/ephemeral_admin,runtime_r2=a/ephemeral_admin}
 t2      | {ephemeral_admin=arwdDxt/ephemeral_admin,runtime_r1=r/ephemeral_admin,runtime_r2=w/ephemeral_admin}
(2 rows)

BEGIN;
BEGIN
REVOKE ALL PRIVILEGES ON gen.t1, gen.t2 FROM runtime_r1, runtime_r2;
REVOKE
GRANT SELECT ON gen.t1 TO runtime_r1;
GRANT
GRANT INSERT ON gen.t1 TO runtime_r2;
GRANT
GRANT SELECT ON gen.t2 TO runtime_r1;
GRANT
GRANT UPDATE ON gen.t2 TO runtime_r2;
GRANT
COMMIT;
COMMIT
SELECT c.relname, c.relacl::text AS relacl_after_second
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='gen' AND c.relname IN ('t1','t2') ORDER BY c.relname;
 relname |                                         relacl_after_second
---------+-----------------------------------------------------------------------------------------------------
 t1      | {ephemeral_admin=arwdDxt/ephemeral_admin,runtime_r1=r/ephemeral_admin,runtime_r2=a/ephemeral_admin}
 t2      | {ephemeral_admin=arwdDxt/ephemeral_admin,runtime_r1=r/ephemeral_admin,runtime_r2=w/ephemeral_admin}
(2 rows)

$ psql -U ephemeral_admin <<SQL  # failing apply
SELECT c.relname, c.relacl::text AS relacl_before_failed_apply
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='gen' AND c.relname IN ('t1','t2') ORDER BY c.relname;
 relname |                                     relacl_before_failed_apply
---------+-----------------------------------------------------------------------------------------------------
 t1      | {ephemeral_admin=arwdDxt/ephemeral_admin,runtime_r1=r/ephemeral_admin,runtime_r2=a/ephemeral_admin}
 t2      | {ephemeral_admin=arwdDxt/ephemeral_admin,runtime_r1=r/ephemeral_admin,runtime_r2=w/ephemeral_admin}
(2 rows)

BEGIN;
BEGIN
REVOKE ALL PRIVILEGES ON gen.t1, gen.t2 FROM runtime_r1, runtime_r2;
REVOKE
GRANT DELETE ON gen.t1 TO runtime_r1;
GRANT
GRANT SELECT ON gen.does_not_exist TO runtime_r2;
ERROR:  42P01: relation "gen.does_not_exist" does not exist
LOCATION:  RangeVarGetRelidExtended, namespace.c:429
COMMIT;
ROLLBACK
SELECT c.relname, c.relacl::text AS relacl_after_failed_apply
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='gen' AND c.relname IN ('t1','t2') ORDER BY c.relname;
 relname |                                      relacl_after_failed_apply
---------+-----------------------------------------------------------------------------------------------------
 t1      | {ephemeral_admin=arwdDxt/ephemeral_admin,runtime_r1=r/ephemeral_admin,runtime_r2=a/ephemeral_admin}
 t2      | {ephemeral_admin=arwdDxt/ephemeral_admin,runtime_r1=r/ephemeral_admin,runtime_r2=w/ephemeral_admin}
(2 rows)
```

The second full reapply completed without errors and produced byte-identical `relacl` text. A mid-script `42P01` aborted the transaction; `COMMIT` became `ROLLBACK`, and both ACLs remained byte-identical to the pre-failure state.

## 9. In-flight effect of `REVOKE` + `GRANT`

**Verdict: CONFIRMED-WITH-CAVEATS**

```text
$ psql -U ephemeral_admin <<SQL  # observer during one-transaction reapply
SELECT application_name, state, wait_event_type, wait_event,
       pg_blocking_pids(pid) AS blocked_by,
       left(regexp_replace(query, E'[\n\r]+', ' ', 'g'), 80) AS current_query
FROM pg_stat_activity
WHERE application_name IN ('tx_reader','tx_reapply')
ORDER BY application_name;
 application_name | state  | wait_event_type | wait_event | blocked_by |    current_query
------------------+--------+-----------------+------------+------------+---------------------
 tx_reader        | active | Timeout         | PgSleep    | {}         | SELECT pg_sleep(1);
 tx_reapply       | active | Timeout         | PgSleep    | {}         | SELECT pg_sleep(3);
(2 rows)

$ PGAPPNAME=tx_reader psql -U runtime_live <<SQL
BEGIN;
BEGIN
SELECT clock_timestamp() AS before_reapply, * FROM inflight.t;
        before_reapply         | id |   name
-------------------------------+----+----------
 2026-08-08 15:46:21.607348+03 |  1 | held row
(1 row)

SELECT pg_sleep(1);
 pg_sleep
----------

(1 row)

SELECT clock_timestamp() AS while_revoke_uncommitted, * FROM inflight.t;
   while_revoke_uncommitted    | id |   name
-------------------------------+----+----------
 2026-08-08 15:46:22.609085+03 |  1 | held row
(1 row)

SELECT pg_sleep(4);
 pg_sleep
----------

(1 row)

SELECT clock_timestamp() AS after_reapply_commit, * FROM inflight.t;
     after_reapply_commit      | id |   name
-------------------------------+----+----------
 2026-08-08 15:46:26.613875+03 |  1 | held row
(1 row)

COMMIT;
COMMIT
$ PGAPPNAME=tx_reapply psql -U ephemeral_admin <<SQL
BEGIN;
BEGIN
SELECT clock_timestamp() AS reapply_begin;
         reapply_begin
-------------------------------
 2026-08-08 15:46:21.617943+03
(1 row)

REVOKE SELECT ON inflight.t FROM runtime_live;
REVOKE
SELECT pg_sleep(3);
 pg_sleep
----------

(1 row)

GRANT SELECT ON inflight.t TO runtime_live;
GRANT
COMMIT;
COMMIT
SELECT clock_timestamp() AS reapply_commit;
        reapply_commit
-------------------------------
 2026-08-08 15:46:24.622479+03
(1 row)

$ PGAPPNAME=gap_reader psql -U runtime_gap <<SQL  # separate autocommit statements
BEGIN;
BEGIN
SELECT clock_timestamp() AS before_autocommit_revoke, * FROM inflight.gap_t;
   before_autocommit_revoke    | id |  name
-------------------------------+----+---------
 2026-08-08 15:46:26.646325+03 |  2 | gap row
(1 row)

SELECT pg_sleep(1);
 pg_sleep
----------

(1 row)

SELECT clock_timestamp() AS during_committed_revoke, * FROM inflight.gap_t;
ERROR:  42501: permission denied for table gap_t
LOCATION:  aclcheck_error, aclchk.c:2812
COMMIT;
ROLLBACK
$ PGAPPNAME=gap_reapply psql -U ephemeral_admin <<SQL
REVOKE SELECT ON inflight.gap_t FROM runtime_gap;
REVOKE
SELECT clock_timestamp() AS revoke_committed, pg_sleep(3);
       revoke_committed        | pg_sleep
-------------------------------+----------
 2026-08-08 15:46:26.660612+03 |
(1 row)

GRANT SELECT ON inflight.gap_t TO runtime_gap;
GRANT
SELECT clock_timestamp() AS grant_committed;
        grant_committed
-------------------------------
 2026-08-08 15:46:29.665495+03
(1 row)

$ psql -U runtime_gap <<SQL
SELECT has_table_privilege(current_user,'inflight.gap_t','SELECT') AS restored;
 restored
----------
 t
(1 row)

SELECT * FROM inflight.gap_t;
 id |  name
----+---------
  2 | gap row
(1 row)
```

When `REVOKE` and `GRANT` were in one transaction, the reapply did not block on the long-running reader; the reader proceeded both while the revoke was uncommitted and after commit. If they are separate autocommit statements, an already-open reader transaction is not grandfathered: its next statement during the committed gap fails `42501`, so live reapply is safe only as one transaction with the final ACL restored before commit.

## 10. Permissive plus restrictive policy composition

**Verdict: CONFIRMED**

```text
$ psql -U ephemeral_admin <<SQL
CREATE TABLE rls_sanity.t(id integer);
CREATE TABLE
INSERT INTO rls_sanity.t VALUES (1);
INSERT 0 1
ALTER TABLE rls_sanity.t ENABLE ROW LEVEL SECURITY;
ALTER TABLE
ALTER TABLE rls_sanity.t FORCE ROW LEVEL SECURITY;
ALTER TABLE
GRANT SELECT ON rls_sanity.t TO runtime_policy;
GRANT
CREATE POLICY allow_all ON rls_sanity.t AS PERMISSIVE
  FOR SELECT TO runtime_policy USING (true);
CREATE POLICY
CREATE POLICY deny_all_restrictive ON rls_sanity.t AS RESTRICTIVE
  FOR SELECT TO runtime_policy USING (false);
CREATE POLICY
$ psql -U runtime_policy <<SQL
SELECT count(*) AS visible_rows FROM rls_sanity.t;
 visible_rows
--------------
            0
(1 row)
```

The permissive `true` policy did not override the restrictive `false` policy; the runtime role got zero rows without an error.

## Summary

| Item | Verdict |
|---|---|
| 1. Fresh-object access and implicit sources | CONFIRMED |
| 2. Durable deny-by-default setup | CONFIRMED-WITH-CAVEATS |
| 3. Four default-privilege caveats | CONFIRMED |
| 4. Event-trigger RLS+FORCE wall | CONFIRMED-WITH-CAVEATS |
| 5. Allowlist accept/reject mode | CONFIRMED |
| 6. Event-trigger coverage and control | CONFIRMED-WITH-CAVEATS |
| 7. Column ACL and loud `SELECT *` | CONFIRMED-WITH-CAVEATS |
| 8. Idempotency and atomicity | CONFIRMED |
| 9. In-flight reapply | CONFIRMED-WITH-CAVEATS |
| 10. Restrictive-policy composition | CONFIRMED |

## Surprises

- `REVOKE`/`GRANT` ACL changes did not block the long-running reader; an atomic reapply proceeded immediately. Safety came from transactional visibility, not exclusion of active readers.
- A committed autocommit revoke affected the next statement even inside a transaction that had successfully read the table before the revoke.
- The event wall’s own `ENABLE` and `FORCE` statements recursively produced two more `ddl_command_end` calls. The demonstrated handler terminates because it rechecks flags, but the repeated invocations should be explicitly guarded in the production design.
- On fresh PostgreSQL 16, `PUBLIC` had database `CONNECT`/`TEMPORARY` and `USAGE` on the special `public` schema, but not `CREATE` there; a newly created application schema had no `PUBLIC` privileges.
- A per-schema `ALTER DEFAULT PRIVILEGES ... REVOKE` against a global default completed successfully but created no negative override; the global grant still won.
- Column grants do not categorically ban `SELECT *`: it works when every current column is granted, then fails loudly after an ungranted column is added.

## Cleanup transcript

```text
$ /usr/lib/postgresql/16/bin/pg_ctl -D /tmp/sol-f0-pg16.daXK6q/data stop -m fast
waiting for server to shut down.... done
server stopped
$ rm -rf -- /tmp/sol-f0-pg16.daXK6q
$ test ! -e /tmp/sol-f0-pg16.daXK6q && echo temp-cluster-removed
temp-cluster-removed
```
