# 13 — Ф2.1 Перепись живого кластера (READ-ONLY, 2026-08-08)

Машинно-проверяемая перепись под декларацию слоя прав (SCHEME §A/§F/§H.1, FACTS §1/§1.5/§4.1/§11).
Всё выполнено `sudo -u postgres psql` на живом PG16 `:5432`, **только SELECT/каталог, ни одного
DDL/DML/GRANT/REVOKE**. Каждое значение — вывод запроса, вставлен дословно. Управляемые базы в
контуре: `bersoncarebot_test`, `bcb_webapp_dev`. `bcb_webapp_prod` — старая копия прода, вне контура,
не писалась и не менялась.

**Где перепись расходится с FACTS/SCHEME — расхождение помечено `⚠ ДРЕЙФ`; перепись авторитетна для «сейчас».**

---

## 1. Инвентарь кластера

### 1.1 Все базы (`pg_database`)

```sql
SELECT d.datname, pg_get_userbyid(d.datdba) AS datdba,
       pg_encoding_to_char(d.encoding) AS enc, d.datallowconn, d.datacl
FROM pg_database d ORDER BY d.datname;
```
```
            datname            |       datdba        | enc  | allowconn |                                 datacl
-------------------------------+---------------------+------+-----------+-------------------------------------------------------------------------
 bcb_webapp_dev                | bcb_webapp_dev_user | UTF8 | t         | {=Tc/bcb_webapp_dev_user,bcb_webapp_dev_user=CTc/bcb_webapp_dev_user,bcb_saas_operator_dev=c/bcb_webapp_dev_user}
 bcb_webapp_prod               | bcb_webapp_prod     | UTF8 | t         | (null)
 bersoncarebot_test            | bersoncarebot_test  | UTF8 | t         | {=Tc/bersoncarebot_test,bersoncarebot_test=CTc/bersoncarebot_test,app_operational_web_push_reminder=c/bersoncarebot_test,bcb_saas_operator_test=c/bersoncarebot_test}
 postgres                      | postgres            | UTF8 | t         | (null)
 scratch_migrate_debug         | postgres            | UTF8 | t         | (null)
 secondbrain                   | postgres            | UTF8 | t         | {=Tc/postgres,postgres=CTc/postgres,brain_ro=c/postgres,code_search_ro=c/postgres}
 storylama_dev                 | storylama_dev       | UTF8 | t         | (null)
 storylama_prod                | storylama_prod      | UTF8 | t         | {=Tc/storylama_prod,storylama_prod=CTc/storylama_prod}
 template0                     | postgres            | UTF8 | f         | {=c/postgres,postgres=CTc/postgres}
 template1                     | postgres            | UTF8 | t         | {=c/postgres,postgres=CTc/postgres}
 trackd_login_audit_1785715424 | postgres            | UTF8 | t         | {=Tc/postgres,postgres=CTc/postgres}
```

**11 баз, тег:**

| База | Тег | Примечание |
|---|---|---|
| `bersoncarebot_test` | **managed** | контур; datdba=`bersoncarebot_test` |
| `bcb_webapp_dev` | **managed** | контур; datdba=`bcb_webapp_dev_user` |
| `bcb_webapp_prod` | **stray-copy** | старая копия прода, вне контура; datacl NULL (только владелец) — не трогать |
| `secondbrain` | foreign | мозг; grants brain_ro/code_search_ro |
| `storylama_dev` / `storylama_prod` | foreign | storylama |
| `postgres` / `template0` / `template1` | system | системные |
| `scratch_migrate_debug` | ephemeral | owner=postgres, пустой scratch |
| `trackd_login_audit_1785715424` | ephemeral | owner=postgres, timestamped |

**⚠ Дефект §D.1 (обе managed):** PUBLIC несёт `=Tc` (CONNECT+TEMP) на `bersoncarebot_test` и
`bcb_webapp_dev` — `REVOKE ALL ON DATABASE … FROM PUBLIC` (§D.1) **не применён**. Пока PUBLIC CONNECT
жив, ЛЮБАЯ login-роль кластера (включая bcb-остатки §5) может подключиться к managed-базе → это и есть
«путь доступа» юрисдикции §F/№8. Также `bersoncarebot_test.datacl` даёт CONNECT напрямую рантайм-роли
`app_operational_web_push_reminder` (не логину) — материал env-маппинга §A.1.

### 1.2 Все не-pg роли (`pg_roles WHERE rolname NOT LIKE 'pg\_%'`) — 45 ролей

```sql
SELECT rolname, rolcanlogin, rolsuper, rolbypassrls, rolinherit,
       rolcreaterole, rolcreatedb, rolconfig
FROM pg_roles WHERE rolname NOT LIKE 'pg\_%' ORDER BY rolname;
```
```
                   rolname                    | login | super | bypass | inh | crrole | crdb |             rolconfig
----------------------------------------------+-------+-------+--------+-----+--------+------+------------------------------------
 app_bootstrap_base_c1_20260713021531         | t     | f     | f      | t   | f      | f    |
 app_clinic_billing                           | f     | f     | f      | f   | f      | f    |
 app_identity_bootstrap                       | f     | f     | f      | f   | f      | f    |
 app_operational_delivery_worker              | f     | f     | f      | f   | f      | f    |
 app_operational_diagnostic                   | f     | f     | f      | f   | f      | f    |
 app_operational_media_worker                 | f     | f     | f      | f   | f      | f    |
 app_operational_scheduler                    | f     | f     | f      | f   | f      | f    |
 app_operational_web_push_reminder            | f     | f     | f      | f   | f      | f    |
 app_owner                                    | f     | f     | t      | t   | f      | f    |
 app_patient                                  | t     | f     | f      | t   | f      | f    |
 app_platform_settings                        | f     | f     | f      | f   | f      | f    |
 app_runtime_login_c1_20260713021531          | t     | f     | f      | t   | f      | f    |
 app_staff                                    | t     | f     | f      | t   | f      | f    |
 app_web_push_reminder_discovery_definer      | f     | f     | f      | f   | f      | f    |
 app_worker                                   | f     | f     | f      | t   | f      | f    |
 bcb_dev                                      | t     | f     | f      | t   | f      | f    |
 bcb_dev_runtime_nonstaff_login               | t     | f     | f      | f   | f      | f    |
 bcb_dev_runtime_staff_login                  | t     | f     | f      | f   | f      | f    |
 bcb_saas_diag_test                           | t     | f     | f      | t   | f      | f    |
 bcb_saas_operator_dev                        | t     | f     | f      | t   | f      | f    |
 bcb_saas_operator_test                       | t     | f     | f      | t   | f      | f    |
 bcb_test_integrator_login                    | t     | f     | f      | f   | f      | f    | {"search_path=public, integrator"}
 bcb_test_nonstaff_login                      | t     | f     | f      | f   | f      | f    | {"search_path=public, integrator"}
 bcb_test_operational_delivery_login          | t     | f     | f      | f   | f      | f    |
 bcb_test_operational_diagnostic_login        | t     | f     | f      | f   | f      | f    |
 bcb_test_operational_media_login             | t     | f     | f      | f   | f      | f    |
 bcb_test_operational_scheduler_login         | t     | f     | f      | f   | f      | f    |
 bcb_test_operational_web_push_reminder_login | t     | f     | f      | f   | f      | f    |
 bcb_test_staff_login                         | t     | f     | f      | t   | f      | f    | {"search_path=public, integrator"}
 bcb_test_worker_login                        | t     | f     | f      | t   | f      | f    | {"search_path=public, integrator"}
 bcb_webapp_dev_user                          | t     | f     | f      | t   | f      | f    |
 bcb_webapp_prod                              | t     | f     | f      | t   | f      | f    | {"search_path=public, integrator"}
 bersoncarebot_test                           | t     | f     | f      | t   | f      | f    | {"search_path=public, integrator"}
 brain                                        | t     | f     | f      | t   | f      | f    |
 brain_ro                                     | t     | f     | f      | t   | f      | f    |
 code_search_ro                               | t     | f     | f      | t   | f      | f    |
 pbt_tpl_1785583727857_d29e62                 | t     | f     | f      | t   | f      | f    |
 pbt_tpl_1785583783003_37ea98                 | t     | f     | f      | t   | f      | f    |
 postgres                                     | t     | t     | t      | t   | t      | t    |
 saas_system_health_owner                     | f     | f     | t      | f   | f      | f    |
 saas_telemetry_operator                      | f     | f     | f      | f   | f      | f    |
 saas_telemetry_owner                         | f     | f     | f      | f   | f      | f    |
 storylama_dev                                | t     | f     | f      | t   | f      | t    |
 storylama_prod                               | t     | f     | f      | t   | f      | t    |
 tgcarebot                                    | t     | f     | f      | t   | f      | f    |
```

**Тег 45 ролей:**

| Тег | Роли | N |
|---|---|---|
| declared-runtime (terminal) | `app_staff`, `app_patient`, `app_platform_settings`, `app_worker` | 4 |
| declared-runtime (operational, через definer) | `app_operational_delivery_worker`, `app_operational_diagnostic`, `app_operational_media_worker`, `app_operational_scheduler`, `app_operational_web_push_reminder`, `app_web_push_reminder_discovery_definer` | 6 |
| capability | `app_clinic_billing`, `app_identity_bootstrap` | 2 |
| owner (NOLOGIN definer-владельцы) | `app_owner` (BYPASSRLS), `saas_system_health_owner` (BYPASSRLS), `saas_telemetry_owner` | 3 |
| saas-operator (declared logins/role) | `saas_telemetry_operator`, `bcb_saas_operator_test`, `bcb_saas_operator_dev`, `bcb_saas_diag_test` | 4 |
| migrator-login / datdba | `bersoncarebot_test`, `bcb_webapp_dev_user` | 2 |
| TEST runtime-логины | `bcb_test_integrator_login`, `bcb_test_nonstaff_login`, `bcb_test_staff_login`, `bcb_test_worker_login`, `bcb_test_operational_{delivery,diagnostic,media,scheduler,web_push_reminder}_login` | 9 |
| DEV runtime-логины | `bcb_dev_runtime_nonstaff_login`, `bcb_dev_runtime_staff_login` | 2 |
| foreign | `brain`, `brain_ro`, `code_search_ro`, `storylama_dev`, `storylama_prod`, `tgcarebot`, `bcb_webapp_prod` (владелец вне-контурной копии) | 7 |
| ephemeral | `pbt_tpl_1785583727857_d29e62`, `pbt_tpl_1785583783003_37ea98` | 2 |
| **stray-bcb-leftover (drop-кандидаты, §5)** | `app_bootstrap_base_c1_20260713021531`, `app_runtime_login_c1_20260713021531`, `bcb_dev` | 3 |
| superuser | `postgres` | 1 |
| **Итого** | | **45** |

**BYPASSRLS в кластере — ровно 3:** `postgres` (super), `app_owner`, `saas_system_health_owner`.
Совпадает со SCHEME §G («на TEST BYPASSRLS несут ТРИ роли») и решениями §I Р5/Р9. NOSUPERUSER у всех,
кроме `postgres`. NOCREATEROLE у всех, кроме `postgres`.

**⚠ Дрейф атрибута логинов vs SCHEME §A.1 (пиновка `NOINHERIT`):** `bcb_test_staff_login` и
`bcb_test_worker_login` имеют `rolinherit=t`; `bcb_webapp_dev_user` тоже `rolinherit=t` (он же datdba).
Остальные рантайм-логины — `NOINHERIT`. SCHEME §A.1 пиновит логины `NOINHERIT` — декларация обязана
либо привести, либо объявить исключением (staff/worker наследуют членство в терминале — не через SET).

### 1.3 Членства (`pg_auth_members`, с опциями)

```sql
SELECT r.rolname AS member, g.rolname AS granted_role, m.admin_option, m.inherit_option, m.set_option
FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member JOIN pg_roles g ON g.oid=m.roleid
WHERE r.rolname NOT LIKE 'pg\_%' AND g.rolname NOT LIKE 'pg\_%' ORDER BY g.rolname, r.rolname;
```
```
                    member                    |           granted_role            | admin | inherit | set
----------------------------------------------+-----------------------------------+-------+---------+-----
 app_staff                                    | app_clinic_billing                | f     | f       | t
 bcb_dev_runtime_nonstaff_login               | app_identity_bootstrap            | f     | f       | t
 bcb_test_integrator_login                    | app_identity_bootstrap            | f     | f       | t
 bcb_test_nonstaff_login                      | app_identity_bootstrap            | f     | f       | t
 bcb_webapp_dev_user                          | app_identity_bootstrap            | f     | t       | t
 bcb_test_operational_delivery_login          | app_operational_delivery_worker   | f     | f       | t
 bcb_test_operational_diagnostic_login        | app_operational_diagnostic        | f     | f       | t
 bcb_test_operational_media_login             | app_operational_media_worker      | f     | f       | t
 bcb_test_operational_scheduler_login         | app_operational_scheduler         | f     | f       | t
 bcb_test_operational_web_push_reminder_login | app_operational_web_push_reminder | f     | f       | t
 bcb_dev_runtime_nonstaff_login               | app_patient                       | f     | f       | t
 bcb_test_integrator_login                    | app_patient                       | f     | f       | t
 bcb_test_nonstaff_login                      | app_patient                       | f     | f       | t
 app_staff                                    | app_platform_settings             | f     | f       | t
 bcb_dev_runtime_staff_login                  | app_staff                         | f     | f       | t
 bcb_test_integrator_login                    | app_staff                         | f     | f       | t
 bcb_test_staff_login                         | app_staff                         | f     | t       | t
 bcb_test_integrator_login                    | app_worker                        | f     | f       | t
 bcb_test_worker_login                        | app_worker                        | f     | t       | t
 bcb_saas_operator_test                       | saas_telemetry_operator           | f     | t       | t
 (20 rows)
```
Наблюдения: `app_staff` — член `app_clinic_billing` и `app_platform_settings` (оба SET, не INHERIT) —
capability-грант образца SCHEME §A. `bcb_test_integrator_login` — член пяти терминалов
(identity_bootstrap, patient, staff, worker) — широкий интегратор-логин. Ни у одной роли нет
членства в `app_owner` (ноль членов вне окна миграций — §C, подтверждено).

---

## 2. Матрица прав по managed-базе × роли (EXPECTED-сторона + дефекты)

### 2.1 Схемы и `nspacl` — `bersoncarebot_test`

```sql
SELECT n.nspname, pg_get_userbyid(n.nspowner) AS owner, n.nspacl
FROM pg_namespace n WHERE n.nspname IN ('public','app','app_ext','integrator','drizzle','app_control');
```
```
  nspname   |       owner        | nspacl
------------+--------------------+------------------------------------------------------------------
 app        | app_owner          | {app_owner=UC/app_owner,=U/app_owner,app_staff=U/…,app_patient=U/…,
                                    bersoncarebot_test=U/…,app_platform_settings=U/…,
                                    bcb_test_nonstaff_login=U/…,app_worker=U/…,bcb_test_integrator_login=U/…,
                                    saas_telemetry_operator=U/…,saas_system_health_owner=U/…,
                                    app_clinic_billing=U/…,app_operational_web_push_reminder=U/…,
                                    app_identity_bootstrap=U/…,app_operational_diagnostic=U/…,
                                    app_operational_delivery_worker=U/…,app_operational_scheduler=U/…,
                                    app_operational_media_worker=U/…,bcb_test_operational_diagnostic_login=U/…,
                                    bcb_test_operational_delivery_login=U/…,bcb_test_operational_scheduler_login=U/…,
                                    bcb_test_operational_media_login=U/…}
 app_ext    | postgres           | {postgres=UC/postgres,app_owner=U/postgres}
 drizzle    | bersoncarebot_test | {bersoncarebot_test=UC/bersoncarebot_test}
 integrator | bersoncarebot_test | {bersoncarebot_test=UC/…,app_staff=U/…,app_patient=U/…,bcb_test_integrator_login=U/…,
                                    app_owner=U/…,app_operational_diagnostic=U/…,app_operational_delivery_worker=U/…,
                                    app_operational_scheduler=U/…}
 public     | pg_database_owner  | {pg_database_owner=UC/…,=U/…(PUBLIC USAGE),app_staff=U/…,app_patient=U/…,
                                    app_owner=U/…,app_platform_settings=U/…,bcb_test_integrator_login=U/…,
                                    bcb_test_nonstaff_login=U/…,app_clinic_billing=U/…,
                                    app_web_push_reminder_discovery_definer=U/…,app_operational_web_push_reminder=U/…,
                                    app_identity_bootstrap=U/…,app_operational_delivery_worker=U/…,
                                    app_operational_media_worker=U/…,app_operational_scheduler=U/…}
```
(`nspacl` вставлен с переносами для читаемости; коды дословны: `U`=USAGE, `C`=CREATE.)

### 2.2 Схемы и `nspacl` — `bcb_webapp_dev`

```
  nspname   |        owner        | nspacl
------------+---------------------+---------------------------------------------------------------
 app        | app_owner           | {app_owner=UC/app_owner,app_staff=U/…,app_patient=U/…,bcb_webapp_dev_user=U/…,
                                     app_platform_settings=U/…,app_clinic_billing=U/…,
                                     bcb_dev_runtime_nonstaff_login=U/…,bcb_dev_runtime_staff_login=U/…,
                                     app_identity_bootstrap=U/…,app_operational_delivery_worker=U/…,
                                     app_worker=U/…,saas_telemetry_operator=U/…,saas_system_health_owner=U/…}
 app_ext    | bcb_webapp_dev_user | {bcb_webapp_dev_user=UC/…,app_owner=U/…}
 drizzle    | bcb_webapp_dev_user | (null)
 integrator | bcb_webapp_dev_user | {bcb_webapp_dev_user=UC/…,app_staff=U/…,app_patient=U/…,app_owner=U/…,
                                     app_operational_delivery_worker=U/…}
 public     | pg_database_owner   | {pg_database_owner=UC/…,=U/…(PUBLIC USAGE),app_staff=U/…,app_patient=U/…,
                                     app_owner=U/…,app_platform_settings=U/…,app_clinic_billing=U/…,
                                     bcb_dev_runtime_nonstaff_login=U/…,app_identity_bootstrap=U/…}
```

**⚠ Две managed-базы НЕ идентичны — per-database секции обязательны, общая матрица солгала бы:**
- `app_ext` владелец: TEST=`postgres`, dev=`bcb_webapp_dev_user` (§C говорит postgres для app_ext-шва — dev дрейфит).
- `integrator` USAGE: TEST даёт diagnostic/delivery/scheduler операционным ролям; dev — только delivery.
- `app` USAGE: списки грантополучателей различны (TEST несёт больше операционных ролей и TEST-логинов).
- **PUBLIC USAGE на `public`** присутствует в ОБЕИХ (`=U/pg_database_owner`) — §D.2 REVOKE PUBLIC **не применён**.
- `app_control` — **отсутствует в обеих** (см. §2.5): стена (§B шаг 3) не установлена.

### 2.3 RLS-флаги org-таблиц — дефект §1.3 (обе базы, ⚠ шире, чем FACTS)

```sql
-- org-таблицы (есть organization_id) без RLS ИЛИ без FORCE
SELECT c.relnamespace::regnamespace::text AS schema, c.relname,
       c.relrowsecurity AS rls, c.relforcerowsecurity AS force
FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='organization_id'
  AND a.attnum>0 AND NOT a.attisdropped
WHERE c.relkind IN ('r','p') AND c.relnamespace::regnamespace::text IN ('public','app','integrator')
  AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity) ORDER BY 1,2;
```

**`bersoncarebot_test` (org-таблиц всего 172):**
```
 schema |               relname               | rls | force
--------+-------------------------------------+-----+-------
 public | appointment_records                 | f   | f
 public | be_organization_members             | f   | f
 public | outgoing_delivery_queue             | f   | f
 public | patient_bookings                    | f   | f
 public | product_analytics_hourly            | f   | f
 public | reference_catalog_snapshot_receipts | f   | f   ← ⚠ НЕ в списке FACTS §1.3
(6 rows)
```
**`bcb_webapp_dev`:**
```
 schema |               relname               | rls | force
--------+-------------------------------------+-----+-------
 public | appointment_records                 | f   | f
 public | be_organization_members             | f   | f
 public | outgoing_delivery_queue             | f   | f
 public | patient_bookings                    | f   | f
 public | patient_specialist_links            | t   | f   ← ⚠ RLS on, FORCE off; dev-специфично
 public | product_analytics_hourly            | f   | f
 public | reference_catalog_snapshot_receipts | f   | f
(7 rows)
```
**⚠ ДРЕЙФ vs FACTS §1.3 (заявлено 5):** на TEST дефектных **6** (+`reference_catalog_snapshot_receipts`);
на dev **7** (+`reference_catalog_snapshot_receipts`, +`patient_specialist_links` c FORCE-off). Красный
baseline Ф6 строить по ЖИВОМУ набору per-DB, не по «пяти».

### 2.4 platform_users + межарендная утечка (§1.2/§1.4) — катал. сторона

```sql
SELECT c.relname, c.relrowsecurity rls, c.relforcerowsecurity force,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid) npol
FROM pg_class c WHERE c.relnamespace::regnamespace::text='public'
  AND c.relname IN ('platform_users','be_organization_members','saas_billing_invoices',
   'saas_billing_subscriptions','saas_billing_provider_events','saas_billing_accounts','admin_audit_log');
```
**`bersoncarebot_test`:**
```
           relname            | rls | force | npol
------------------------------+-----+-------+------
 admin_audit_log              | t   | t     |    4
 be_organization_members      | f   | f     |    0
 platform_users               | t   | t     |    9   ← ⚠ ДРЕЙФ: FACTS §1.4 baseline = RLS OFF
 saas_billing_accounts        | t   | t     |    7   ← ⚠ теперь RLS+FORCE (было в утечке §1.2)
 saas_billing_invoices        | t   | t     |    8   ← ⚠ теперь RLS+FORCE
 saas_billing_provider_events | t   | t     |    7   ← ⚠ теперь RLS+FORCE
 saas_billing_subscriptions   | t   | t     |    8   ← ⚠ теперь RLS+FORCE
```
`platform_users`: 278 строк (`SELECT count(*)` = 278). `bcb_webapp_dev`: `platform_users` rls=t force=t,
`be_organization_members` rls=f force=f (то же).

**⚠ ДРЕЙФ vs FACTS §1.2/§1.4:**
- `platform_users` **уже несёт RLS+FORCE** (9 политик) на ОБЕИХ базах — НЕ «off» baseline §1.4
  (вероятно от идущей `patientMaintenance.ts`). Для доказательства красный→зелёный Ф6 базу надо
  сперва вернуть в красное (снять RLS) ЛИБО брать красный на greenfield a0-слепке (как и предупреждает §1.4).
- 5 из 7 ячеек утечки §1.2 — на `saas_billing_*` — **теперь несут RLS+FORCE+политики**. Значит
  каталог-side утечка на биллинге, замеренная в окне §1.2, вероятно закрыта RLS; фактический пере-замер
  требует обхода `SET ROLE`+принципал (тяжёлый, не делался — read-only census фиксирует катал. флаги).
- **2 из 7 ячеек — живы и подтверждаются каталогом:** `be_organization_members` RLS **выключен** и
  роли `app_staff` и `app_platform_settings` держат на ней `SELECT` (см. ACL ниже) → обе читают все
  строки всех орг. Это и есть 2 не-биллинговые ячейки FACTS §1.2 (`app_staff|be_organization_members`,
  `app_platform_settings|be_organization_members`), воспроизводимы сейчас.

`be_organization_members` ACL (механизм утечки, `bersoncarebot_test`):
```
          grantee          | privilege_type
---------------------------+----------------
 bersoncarebot_test        | SELECT,INSERT,UPDATE,DELETE,REFERENCES,TRIGGER,TRUNCATE
 app_owner                 | SELECT,INSERT,UPDATE
 app_staff                 | SELECT,INSERT,UPDATE,DELETE        ← читает все орг (RLS off)
 app_platform_settings     | SELECT                            ← читает все орг (RLS off)
 bcb_test_nonstaff_login   | SELECT
 bcb_test_integrator_login | SELECT
```

### 2.5 Представительные ACL (EXPECTED-сторона)

Чистая org-таблица `public.be_appointments` (`bersoncarebot_test`):
```
      grantee       |                          privs
--------------------+---------------------------------------------------------
 bersoncarebot_test | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE  (владелец-мигратор)
 app_owner          | SELECT
 app_staff          | DELETE,INSERT,SELECT,UPDATE
 app_patient        | SELECT
```
Политики `be_appointments`: `saas_org_dormant_p0_8_3` PERMISSIVE cmd=`*` (роли — PUBLIC/пусто:
«dormant»-паттерн; свип §G.4 такие караулит).

Колоночный ACL `platform_users` (подтверждает FACTS §1.4 — табличная проверка это скрывает):
```
        attname         |          grantee            | priv
------------------------+-----------------------------+------
 calendar_timezone      | app_patient                 | UPDATE   ← образец §A tables.platform_users
 reminder_muted_until   | app_patient                 | UPDATE   ← образец §A
 reminder_muted_until   | app_web_push_reminder_discovery_definer | SELECT
 id / email / …         | app_owner                   | SELECT
 display_name/first_name/last_name/phone_normalized/… | bcb_test_integrator_login | INSERT/UPDATE
```
Правило последовательностей §A.4 (образец `bersoncarebot_test`): роль с INSERT на таблице несёт
`USAGE`+`SELECT` на её `*_id_seq` — подтверждено: `integrator_push_outbox_id_seq`,
`be_patient_packages_display_number_seq` → `app_staff = {USAGE,SELECT}`.

**`app_control` схема — отсутствует на обеих managed-базах** (`SELECT count(*) FROM pg_namespace WHERE
nspname='app_control'` → `test|0`, `dev|0`): стена ещё не установлена — ожидаемо (деплой на TEST
остановлен, FACTS §11; §B шаг 3 её строит каждым деплоем).

---

## 3. Точные search_path / config (литералы, которые круг угадывал)

### 3.1 SECURITY DEFINER функции — по схемам и по distinct `proconfig` (`bersoncarebot_test`)

```sql
SELECT n.nspname, count(*) FILTER (WHERE p.prosecdef) AS secdef, count(*) AS total_fns
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('app','public','integrator','app_ext') GROUP BY n.nspname;
```
```
 nspname | secdef | total_fns
---------+--------+-----------
 app     |    244 |       253
 app_ext |      0 |        36
 public  |      0 |       193
(integrator: 0 функций вообще)
```
**Все 244 SECURITY DEFINER — в схеме `app`.** В `public`/`integrator`/`app_ext` — ноль definer-функций.

```sql
SELECT COALESCE(array_to_string(p.proconfig,' || '),'(null)') AS proconfig, count(*)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prosecdef AND n.nspname IN ('app','public','integrator','app_ext')
GROUP BY p.proconfig ORDER BY 2 DESC;
```
```
              proconfig               | n_functions
--------------------------------------+-------------
 search_path=pg_catalog               |         235
 search_path=app, pg_catalog          |           5
 search_path=pg_catalog, public       |           2
 search_path=app, app_ext, pg_catalog |           1
 search_path=app, public, pg_catalog  |           1
(итого 244; 5 distinct — совпадает со SCHEME §A.7 «5 различных значений»)
```

**Дефолт декларации для definer: `searchPath: 'pg_catalog'` (235 функций). Ниже — 9 ИМЕНОВАННЫХ
исключений, значения дословны — заменяют угаданные литералы:**

```sql
SELECT n.nspname||'.'||p.proname AS fn, pg_get_function_identity_arguments(p.oid) AS args,
       pg_get_userbyid(p.proowner) AS owner, array_to_string(p.proconfig,' | ') AS proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prosecdef AND n.nspname IN ('app','public','integrator','app_ext')
  AND p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog'] ORDER BY proconfig, proname;
```
```
                     fn                      |                    args                     |                  owner                  |              proconfig
---------------------------------------------+---------------------------------------------+-----------------------------------------+--------------------------------------
 app.install_signed_context                  | p_nonce text, p_backend_pid integer,        | app_owner                               | search_path=app, app_ext, pg_catalog
                                             |  p_expires_epoch bigint, p_org_id uuid,     |                                         |
                                             |  p_patient_user_id uuid,                    |                                         |
                                             |  p_integrator_user_id bigint,               |                                         |
                                             |  p_signature_hex text                       |                                         |
 app.current_integrator_user_id              | (нет аргументов)                            | app_owner                               | search_path=app, pg_catalog
 app.current_org_id                          | (нет аргументов)                            | app_owner                               | search_path=app, pg_catalog
 app.current_patient_user_id                 | (нет аргументов)                            | app_owner                               | search_path=app, pg_catalog
 app.release_principal_context               | (нет аргументов)                            | app_owner                               | search_path=app, pg_catalog
 app.reset_principal_context                 | (нет аргументов)                            | app_owner                               | search_path=app, pg_catalog
 app.close_active_user_phone_history         | p_user uuid                                 | app_owner                               | search_path=app, public, pg_catalog
 app.list_web_push_reminder_organization_ids | p_now timestamp with time zone              | app_web_push_reminder_discovery_definer | search_path=pg_catalog, public
 app.read_outbound_provider_incident_health  | (нет аргументов)                            | bersoncarebot_test                      | search_path=pg_catalog, public
```
Подтверждает образец SCHEME §A.7: `app.install_signed_context(...)` → `app, app_ext, pg_catalog`
(тело зовёт `app_ext.hmac`). Байтово: пробел после запятой в каждом значении (`§F сравнивает байтово`).

### 3.2 Владельцы definer-функций `app.*` (⚠ дрейф владения vs §C)

```sql
SELECT pg_get_userbyid(p.proowner) AS owner, count(*)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prosecdef AND n.nspname='app' GROUP BY 1 ORDER BY 2 DESC;
```
```
                  owner                  |  n
-----------------------------------------+-----
 app_owner                               | 193
 bersoncarebot_test                      |  38   ← ⚠ мигратор-логин, НЕ app_owner (§C говорит app_owner)
 saas_telemetry_owner                    |   7
 saas_system_health_owner                |   4
 app_platform_settings                   |   1   ← ⚠ рантайм-роль владеет definer-функцией
 app_web_push_reminder_discovery_definer |   1
(244)
```
**⚠ Дрейф §C:** только 193/244 definer-функций владеет `app_owner`. **38 owned мигратор-логином
`bersoncarebot_test`**, 1 — рантайм-ролью `app_platform_settings`. Часть намеренна
(`saas_telemetry_owner` владеет saas_isolation — §C; `app_web_push_reminder_discovery_definer` — свой
шов), но 38 под мигратором и 1 под `app_platform_settings` — кандидаты в `ALTER FUNCTION … OWNER TO
app_owner` (§B статьи владения). Декларация должна объявить владельца ПОФУНКЦИОННО, не константой.

### 3.3 EXECUTE-ACL ключевых definer-функций (якорь §1.1 + scope)

`app.current_org_id()` EXECUTE:
```
 bersoncarebot_test, app_owner, app_staff, app_patient, bcb_test_nonstaff_login, app_worker,
 app_operational_media_worker, app_platform_settings, app_clinic_billing, app_identity_bootstrap
```
**⚠ Подтверждение корня §1.1 (61 050 отказов/сут):** EXECUTE на `current_org_id()` **НЕ выдан**
`app_operational_scheduler`, `app_operational_delivery_worker`, `app_operational_diagnostic`,
`app_operational_web_push_reminder` — ровно роли из журнала отказов FACTS §1.1
(scheduler_login → `current_org_id`, delivery_login → `current_org_id`). Каталог подтверждает: это
не-выданный EXECUTE, а не «угаданная роль» сама по себе даёт 42501.

`app.install_signed_context(...)` EXECUTE: `app_owner, app_staff, app_patient, app_clinic_billing`
(совпадает с образцом §A.7). `app.release_principal_context()` EXECUTE: app_owner + staff + patient +
4 TEST-логина + 4 operational-роли + integrator/nonstaff-логины + clinic_billing (14 грантополучателей).

### 3.4 `pg_db_role_setting` — полный дамп (байтово), обе scope

```sql
SELECT COALESCE(d.datname,'(setdatabase=0)') AS db, r.rolname, s.setconfig
FROM pg_db_role_setting s LEFT JOIN pg_database d ON d.oid=s.setdatabase
LEFT JOIN pg_roles r ON r.oid=s.setrole ORDER BY db, r.rolname;
```
```
           db            |           role            |             setconfig
-------------------------+---------------------------+------------------------------------
 (setdatabase=0)         | bcb_test_integrator_login | {"search_path=public, integrator"}
 (setdatabase=0)         | bcb_test_nonstaff_login   | {"search_path=public, integrator"}
 (setdatabase=0)         | bcb_test_staff_login      | {"search_path=public, integrator"}
 (setdatabase=0)         | bcb_test_worker_login     | {"search_path=public, integrator"}
 (setdatabase=0)         | bcb_webapp_prod           | {"search_path=public, integrator"}
 (setdatabase=0)         | bersoncarebot_test        | {"search_path=public, integrator"}
 bcb_webapp_dev          | bcb_webapp_dev_user       | {"search_path=public, integrator"}   ← §A.10 НЕСУЩАЯ строка
 bcb_webapp_prod         | bcb_webapp_prod           | {"search_path=public, integrator"}   ← вне контура (foreign)
(8 rows)
```
- **`setdatabase≠0` (класс §A.10, невидимый `pg_roles.rolconfig`):** ровно 2 строки.
  1. `bcb_webapp_dev_user IN DATABASE bcb_webapp_dev` → байтово `search_path=public, integrator`
     (пробел после запятой). Несущая (§A.10), объявляется исключением с ДОСЛОВНЫМ значением, не сброс.
  2. `bcb_webapp_prod IN DATABASE bcb_webapp_prod` → на вне-контурной базе, foreign, не сверяется.
- **`setdatabase=0` (роль-уровень §A.1):** 6 ролей несут `search_path=public, integrator` — 4 TEST-логина
  (integrator/nonstaff/staff/worker) + `bcb_webapp_prod` + `bersoncarebot_test` (мигратор/datdba TEST).
  Все прочие рантайм-логины rolconfig=NULL (ассерт `dev-c0:136`).

### 3.5 `datdba` управляемых баз
```
      datname       |       datdba
--------------------+---------------------
 bersoncarebot_test | bersoncarebot_test
 bcb_webapp_dev     | bcb_webapp_dev_user
```
Совпадает со SCHEME §A.10/§C.

---

## 4. Область (scope) ролей — предложение (SCHEME §A.2 / FACTS §1.5)

Обоснование — по ФАКТУ, что роль реально может читать (нижние секции этой переписи), не догадкой.
FACTS §1.5 требует один файл `роль→область`, **«11 строк»**. Ниже — предложение по каждой
declared runtime/capability роли; неопределённые помечены `?ВОПРОС`.

| Роль | kind | scope | Обоснование (по факту) |
|---|---|---|---|
| `app_staff` | terminal | **ORG** | «своя организация» верно для staff (FACTS §1.5); RLS-политики org-фильтруют; на TEST 167/172 чисто (§1.2) |
| `app_patient` | terminal | **OWN** | стена — только свои данные (FACTS §1.5); под `SET ROLE` видит 0 строк `platform_users` (§1.4); неверное ORG-правило дало бы 65 ложных нулей |
| `app_platform_settings` | terminal | **GLOBAL** | читает биллинг/членства через орг (5/7 ячеек §1.2 — биллинг); решение §I Р4 сужает поверхность, но область роли — платформенная (GLOBAL) |
| `app_clinic_billing` | capability | **ORG** | биллинг в рамках орг; выдан `app_staff` (SET); образец SCHEME §A = ORG |
| `app_worker` | terminal | **ORG** `?` | инфра-роль воркеров; фильтр на ENQUEUE (memory «walls worker infra role»); имеет EXECUTE `current_org_id` — работает по орг. `?ВОПРОС`: подтвердить ORG vs NONE у лида |
| `app_identity_bootstrap` | capability | **OWN** `?` | bootstrap идентичности при регистрации (nonstaff/integrator логины его члены); данные — свои у регистрирующегося. `?ВОПРОС`: OWN vs NONE |
| `app_operational_scheduler` | terminal | **NONE** | на уровне таблиц всё «запрещено» (FACTS §6); доступ ИСКЛЮЧИТЕЛЬНО через definer (сейчас даже `current_org_id` не выдан — §3.3). Кросс-орг обход — внутри definer |
| `app_operational_delivery_worker` | terminal | **NONE** | то же (FACTS §6, §1.1) |
| `app_operational_diagnostic` | terminal | **NONE** | то же |
| `app_operational_media_worker` | terminal | **NONE** | то же (имеет EXECUTE current_org_id, но табличного прямого чтения org нет) |
| `app_operational_web_push_reminder` | terminal | **NONE** | то же; discovery идёт через `app_web_push_reminder_discovery_definer` |
| `app_web_push_reminder_discovery_definer` | (definer-владелец) | **NONE** | владеет discovery-функцией; не рантайм-читатель таблиц |
| `saas_telemetry_operator` | operator | **GLOBAL** `?` | читает телеметрию изоляции (кросс-орг диагностика); `bcb_saas_operator_test` — член. `?ВОПРОС`: GLOBAL vs своя телеметрия |
| `app_owner` | owner | **NONE** | definer-шов, ноль членов (§C) |
| `saas_system_health_owner` | owner | **NONE** | NOLOGIN health-владелец (§I Р9) |
| `saas_telemetry_owner` | owner | **NONE** | владелец saas_isolation таблиц (§C) |

**Замечание про «11 строк»:** FACTS §1.5 «11 строк» = 11 ролей обхода 1892 ячеек (§1.2: «11 ролей ×
172 таблицы»). Точный список этих 11 в переписи не воспроизведён (обход `SET ROLE`×принципал —
тяжёлый, вне read-only census); scope-поле SCHEME §A.2 требуется на КАЖДОЙ роли раздела 1, поэтому
таблица выше шире 11. **`?ВОПРОС` лиду:** зафиксировать точный список 11 tenant-обходимых ролей, к
которым §H.5 рендерит ожидаемую видимость, — чтобы 4 роли с `?` получили область не догадкой.

---

## 5. Stray-leftover — тег для решения владельца (НИЧЕГО не удалено, read-only)

Проверка юрисдикции 3 bcb-остатков (членства + любой ACL-хит на TEST):
```sql
SELECT count(*) FROM pg_auth_members … WHERE role=$R;         -- members_of / has_members
SELECT count(*) FROM pg_namespace/pg_class/pg_database WHERE …acl LIKE '%$R%';
```
Результат для всех трёх (`app_bootstrap_base_c1_20260713021531`, `app_runtime_login_c1_20260713021531`,
`bcb_dev`): **members_of=0, has_members=0, schema_acl=0, table_acl=0, db_acl=0**.

| Объект | Тег | Обоснование |
|---|---|---|
| роль `app_bootstrap_base_c1_20260713021531` | **drop-кандидат (freeze+dump сперва)** | timestamped bootstrap-остаток c1; ноль членств, ноль явных ACL. LOGIN — достижима через PUBLIC CONNECT (§1.1), поэтому формально «путь доступа» есть до §D.1. TEST обратим (§H.1) |
| роль `app_runtime_login_c1_20260713021531` | **drop-кандидат (freeze+dump)** | то же; timestamped runtime-логин-остаток |
| роль `bcb_dev` | **drop-кандидат (freeze+dump)** | stray login-остаток; ноль членств/ACL; не путать с `bcb_webapp_dev_user` (datdba dev) и `bcb_dev_runtime_*_login` (живые dev-логины) |
| роли `pbt_tpl_1785583727857_d29e62`, `pbt_tpl_1785583783003_37ea98` | **keep (foreign ephemeral)** | чужие probe-template роли; приходят/уходят; вне юрисдикции bcb (§A), не трогать |
| база `bcb_webapp_prod` | **keep, НЕ трогать** | старая копия прода вне контура (владелец 08.08 «копия явно»); datacl NULL; чистка возможна, но НЕ заказана |
| роль `bcb_webapp_prod` | **keep (foreign)** | владелец вне-контурной копии; не объявлять в bcb-декларации |
| база `scratch_migrate_debug` | **keep/наблюдать** | owner=postgres, ephemeral scratch; не bcb-managed, вне контура |
| база `trackd_login_audit_1785715424` | **keep (foreign ephemeral)** | owner=postgres, timestamped; чужая |

**Решение об удалении — владельца/лида, не переписи.** Перепись лишь тегирует.

---

## 6. Пробелы для декларации (то, чему НЕ нашлось живого значения → вопрос, не догадка)

1. **Точный список 11 tenant-обходимых ролей** (FACTS §1.5 «11 строк») — обход `SET ROLE`×принципал не
   выполнялся (тяжёлый, вне read-only census). 4 роли scope помечены `?` (§4). → вопрос лиду.
2. **Фактический пере-замер 5 биллинговых ячеек утечки §1.2** — `saas_billing_*` теперь RLS+FORCE
   (§2.4); закрыта ли утечка ПО ФАКТУ, а не по флагу, требует принципал-обхода (Ф3/§H.5). Каталог
   даёт только «флаги на месте».
3. **Целевой владелец 38 definer-функций под мигратором + 1 под `app_platform_settings`** (§3.2) —
   привести к `app_owner` или объявить исключением владения? Декларация обязана решить пофункционно.
   → вопрос: какие из 38 намеренно под мигратором (если такие есть).
4. **NOINHERIT логинов** (§1.2) — `bcb_test_staff_login`/`bcb_test_worker_login`/`bcb_webapp_dev_user`
   несут `rolinherit=t` против пиновки SCHEME §A.1. Привести к NOINHERIT или объявить исключением? →
   решение декларации (наследуют членство в терминале).
5. **`app_ext` владелец расходится между базами** (TEST=postgres, dev=`bcb_webapp_dev_user`; §2.1/§2.2)
   — §C/§A.10 требует объявленного владельца per-db; какое значение каноническое для dev? → вопрос.
6. **`platform_users` baseline** — сейчас RLS+FORCE (дрейф §2.4), а Ф6-доказательство красный→зелёный
   требует красного старта. Красный брать на a0-слепке ИЛИ временно снять RLS на TEST? SCHEME §I Р3
   выбирает «RLS сейчас», но baseline для приёмки Ф6 не зафиксирован. → вопрос владельцу при Ч1.3.
7. **`reference_catalog_snapshot_receipts` и dev-`patient_specialist_links`** — новые дефектные
   org-таблицы, которых нет в FACTS §1.3. org=true (несут `organization_id`) или ложно-положительные
   (глобальный справочник со случайной колонкой)? → классификация Ф2 (org-allowlist §A.9).
8. **Membership-опции терминалов (`SET` vs `INHERIT`)** — большинство членств `set=t inherit=f`, но
   staff/worker/dev_user несут `inherit=t` (§1.3). Декларация §A.1 объявляет опции членства явно —
   какие каноничны? → фиксирует env-маппинг Ф2.

---

## Итоговые счётчики

- **Базы:** 11 всего — 2 managed (`bersoncarebot_test`, `bcb_webapp_dev`), 1 stray-copy
  (`bcb_webapp_prod`, вне контура), 3 foreign (secondbrain, storylama_dev/prod), 3 system
  (postgres/template0/template1), 2 ephemeral (scratch_migrate_debug, trackd_login_audit_1785715424).
- **Роли:** 45 не-pg — declared-runtime terminal 4 + operational 6 + capability 2 + owner 3 +
  saas-operator 4 + migrator/datdba 2 + TEST-логины 9 + DEV-логины 2 + foreign 7 + ephemeral 2 +
  **stray-bcb-leftover 3** + superuser 1. BYPASSRLS = 3 (postgres, app_owner, saas_system_health_owner).
- **Definer-функции:** 244 SECURITY DEFINER, ВСЕ в `app` (public/integrator/app_ext = 0). **5 distinct
  proconfig:** 235 `pg_catalog` / 5 `app, pg_catalog` / 2 `pg_catalog, public` / 1 `app, app_ext,
  pg_catalog` / 1 `app, public, pg_catalog`. Владение: 193 app_owner, 38 мигратор, 7 saas_telemetry_owner,
  4 saas_system_health_owner, 1 app_platform_settings, 1 discovery_definer.
- **Подтверждённые живые дефекты:** (1) org-таблицы без RLS+FORCE — **6 на TEST, 7 на dev** (не 5);
  (2) `be_organization_members` RLS off + SELECT у app_staff/app_platform_settings → 2 ячейки утечки §1.2
  живы; (3) `current_org_id()` EXECUTE не выдан 4 operational-ролям → корень 61k отказов §1.1;
  (4) PUBLIC CONNECT/TEMP на обеих managed + PUBLIC USAGE на `public` (§D не применён);
  (5) 39 definer-функций владеет не-`app_owner` (38 мигратор + 1 app_platform_settings); (6) `app_control`
  отсутствует (стена не установлена); (7) NOINHERIT-дрейф у 3 логинов. **Дрейфы vs FACTS:**
  `platform_users` теперь RLS+FORCE (не off), 5 биллинг-ячеек теперь RLS+FORCE.
```
