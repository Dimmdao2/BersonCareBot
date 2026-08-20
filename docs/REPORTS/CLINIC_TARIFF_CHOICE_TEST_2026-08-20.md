# Диагностика выбора тарифа клиникой на TEST — 2026-08-20

## Итог

На TEST каталог **не пуст**: `public.saas_tariffs` содержит 4 строки, все 4 имеют `is_active = true`.
Роль, выбранная `runWithDbClinicBillingPrincipal`, — `app_clinic_billing`; у неё есть `USAGE` на `public`,
`SELECT` на `public.saas_tariffs`, а login TEST `bcb_test_webapp_staff` имеет право `SET ROLE
app_clinic_billing`. Runtime capability из `/opt/env/bersoncarebot/webapp.test` точно совпадает с capability в
БД: `a95ea064-1d03-5f18-8986-af68845481bf`, `staff / relation / app_clinic_billing`.

Прямой запрос в обязательной read-only сессии после `SET LOCAL ROLE app_clinic_billing` **не вернул ноль строк,
а завершился ошибкой** `SQLSTATE 42501: accepted port context required`. Точная провалившаяся политика —
restrictive `rev10_context_gate_188`; permissive `rev10_direct_business_188` роль пропускает. `ROW LEVEL SECURITY`
и `FORCE ROW LEVEL SECURITY` включены. Это не доказательство невидимого каталога в настоящем запросе:
TEST работает в `port-context`, а настоящий helper перед запросом вызывает `app.begin_port_context`, который
неизбежно делает `INSERT` в `app_ext.accepted_port_contexts`. Выполнить это в `BEGIN READ ONLY` невозможно и
отдельным hard constraint запрещён любой `INSERT`.

**Классификация по правилу «если evidence не разделяет варианты»: (b) DATA исключён; остаются (a)
PRIVILEGE/RLS и (c) NEITHER.** Метаданные сильно поддерживают (c): при штатно принятом контексте
`rev10_context_gate_188 = true`, `rev10_direct_business_188 = true`, и ни одна применимая политика не фильтрует
строки по организации или активности, поэтому роль должна видеть те же 4 активных строки. Но требуемый прямой
row count под *принятым* контекстом не был получен: единственный штатный способ создать его является записью,
запрещённой brief. Для окончательного разделения нужен либо уже существующий authenticated live request с
наблюдаемым результатом `choices`, либо отдельное разрешение выполнить штатную port-context транзакцию (она пишет
служебную строку контекста и очищает её). В журнале `bersoncarebot-webapp-test.service` за 2026-08-20 точный поиск
`tariff|billing|accepted port context|42501` не дал строк, поэтому причина наблюдаемого UI-симптома вне этого
DB-пути также не доказана. Исправления, grants, policies, task card и PROD не затрагивались.

## 1. SQL `listActiveTariffChoices`

Реализация находится в `apps/webapp/src/infra/repos/pgSaasBilling.ts`:

```ts
async listActiveTariffChoices() {
  return getDrizzle()
    .select({ id: saasTariffs.id, name: saasTariffs.name, priceMinor: saasTariffs.priceMinor })
    .from(saasTariffs)
    .where(eq(saasTariffs.isActive, true))
    .orderBy(saasTariffs.name);
}
```

`saasTariffs` объявлена как таблица `public.saas_tariffs`; поля — `id`, `name`, `price_minor`, `is_active`.
Эквивалентный SQL запроса:

```sql
SELECT id, name, price_minor
FROM public.saas_tariffs
WHERE is_active = true
ORDER BY name;
```

Таблица одна: `public.saas_tariffs`. Активный предикат один: `is_active = true`.

Предметная команда поиска:

```bash
node /home/dev/brain/tools/code-search.mjs "listActiveTariffChoices active tariff choices repository implementation" --repo bcb -k 12
```

Вывод:

```text
# code-search: «listActiveTariffChoices active tariff choices repository implementation» · репо bcb · лексический BM25 · индекс 2026-08-20T12:30:02.810Z (25021 чанков)

• bcb/apps/webapp/src/modules/saas-billing/service.ts:1121-1170
• bcb/apps/webapp/src/infra/repos/inMemorySaasBilling.ts:281-330
• bcb/apps/webapp/src/modules/saas-billing/ports.ts:361-410
• bcb/apps/webapp/src/infra/repos/pgSaasBilling.ts:561-610
```

## 2. Ground truth как `postgres`

Команда:

```bash
sudo -n -u postgres psql -X -A -t -q -h /var/run/postgresql -p 5432 -d bersoncarebot_test <<'SQL'
\set ON_ERROR_STOP on
BEGIN READ ONLY;
\echo [identity]
SELECT current_database(), current_user, inet_server_addr(), inet_server_port();
\echo [counts: total|active]
SELECT count(*) AS total_rows, count(*) FILTER (WHERE is_active = true) AS active_rows
FROM public.saas_tariffs;
\echo [rows: id|name|price_minor|is_active]
SELECT id, name, price_minor, is_active
FROM public.saas_tariffs
ORDER BY name, id;
COMMIT;
SQL
```

Вывод:

```text
[identity]
bersoncarebot_test|postgres||
[counts: total|active]
4|4
[rows: id|name|price_minor|is_active]
59fbb0c9-371d-4fcc-8602-78e174c81062|КЛИНИКА|280000|t
d1156dc6-e71e-4225-ad94-93c9d423c9e1|ПОЛНЫЙ ДОСТУП - РАЗРАБОТЧИК|0|t
2512c9fd-128d-484d-a83c-3593ae56fe8a|ПРОФИ|150000|t
e07db366-f471-40a5-bc9b-499908636acd|СТАРТ|80000|t
```

Числа получены именно этой командой: всего `4`, активных `4`.

## 3. Principal helper и роль

Трасса:

1. `apps/webapp/src/app/app/settings/page.tsx` вызывает `runWithDbClinicBillingPrincipal` с
   `organizationId`, `platformUserId` и source
   `clinic-billing-settings-tariff-change-read`.
2. `packages/db-principal/src/index.ts` создаёт principal вида `clinicBilling`.
3. Там же константа `DB_PRINCIPAL_CLINIC_BILLING_ROLE = 'app_clinic_billing'`, а
   `dbRuntimeRoleForPrincipal()` отображает `clinicBilling` в `app_clinic_billing`.
4. В фактическом TEST mode `port-context` webapp строит staff-context: actor — непрозрачная ссылка личности,
   organization — UUID клиники; `app.begin_port_context` в одной транзакции устанавливает принятый контекст и
   делает `SET LOCAL ROLE app_clinic_billing`.

Команда проверки runtime mode и состояния сервиса:

```bash
sudo -n grep -E '^DB_PRINCIPAL_CONTEXT_MODE=' /opt/env/bersoncarebot/webapp.test; systemctl is-active bersoncarebot-webapp-test.service; systemctl show bersoncarebot-webapp-test.service -p ActiveState -p SubState -p ExecMainStatus --no-pager
```

Вывод:

```text
DB_PRINCIPAL_CONTEXT_MODE='port-context'
active
ExecMainStatus=0
ActiveState=active
SubState=running
```

Команда проверки exact runtime capability без вывода секретов:

```bash
sudo -n bash -c 'set -a; source /opt/env/bersoncarebot/webapp.test; set +a; node -e '\''const c=JSON.parse(process.env.WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON); console.log(JSON.stringify({clinicBilling:c.clinicBilling},null,2))'\'''
```

Вывод:

```json
{
  "clinicBilling": {
    "capabilityId": "a95ea064-1d03-5f18-8986-af68845481bf",
    "targetRole": "app_clinic_billing",
    "contextClass": "staff",
    "purpose": "relation"
  }
}
```

## 4. Тот же запрос под ролью в read-only session

Команда:

```bash
sudo -n -u postgres psql -X -A -t -q -h /var/run/postgresql -p 5432 -d bersoncarebot_test <<'SQL'
\set ON_ERROR_STOP on
\set VERBOSITY verbose
BEGIN READ ONLY;
SELECT set_config('app.org', (SELECT id::text FROM public.be_organizations ORDER BY id LIMIT 1), true);
SELECT set_config('app.patient_user_id', '', true);
SELECT set_config('app.integrator_user_id', '', true);
SET LOCAL ROLE app_clinic_billing;
SELECT id, name, price_minor
FROM public.saas_tariffs
WHERE is_active = true
ORDER BY name;
ROLLBACK;
SQL
```

Вывод:

```text
a0000000-0000-4000-8000-000000000001


ERROR:  42501: accepted port context required
CONTEXT:  PL/pgSQL function require_accepted_context(name,name,port_context_class,text,bytea,regprocedure) line 23 at RAISE
LOCATION:  exec_stmt_raise, pl_exec.c:3897
```

SQLSTATE — `42501`. Denied object PostgreSQL не назвал; дословный отказ — `accepted port context required` из
`app.require_accepted_context(...)`. Row count не получен: запрос завершился до чтения строк.

Legacy GUC недостаточны именно на этом TEST. Штатный контекст нельзя установить без записи. Это доказано
определением `app.install_port_context`: оно выполняет

```sql
INSERT INTO app_ext.accepted_port_contexts (...)
VALUES (...);
```

`app_ext.accepted_port_contexts` — постоянная relation (`relpersistence = 'p'`), не временная таблица. Поэтому
запуск helper в `BEGIN READ ONLY` нарушил бы режим, а запуск в read-write транзакции нарушил бы явный запрет brief
на INSERT, даже если затем сделать rollback.

## 5. Grants, FORCE RLS и применимые policies

Команда:

```bash
sudo -n -u postgres psql -X -A -t -q -h /var/run/postgresql -p 5432 -d bersoncarebot_test <<'SQL'
\set ON_ERROR_STOP on
BEGIN READ ONLY;
\echo [role]
SELECT rolname, rolcanlogin, rolinherit, rolbypassrls
FROM pg_roles
WHERE rolname = 'app_clinic_billing';
\echo [table privilege]
SELECT has_table_privilege('app_clinic_billing', 'public.saas_tariffs', 'SELECT');
\echo [rls flags]
SELECT c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner)
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'saas_tariffs';
\echo [policies: schemaname|tablename|policyname|permissive|roles|cmd|qual|with_check]
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'saas_tariffs'
ORDER BY policyname;
ROLLBACK;
SQL
```

Существенный вывод (полный `qual` приведён следующей командой для применимых policies):

```text
[role]
app_clinic_billing|f|f|f
[table privilege]
t
[rls flags]
t|t|app_object_owner
[policies]
rev10_context_gate_188|RESTRICTIVE|{app_clinic_billing,app_platform_settings,app_worker}|ALL|app.require_accepted_context(...)
rev10_direct_business_188|PERMISSIVE|{app_clinic_billing,app_platform_settings,app_worker}|ALL|CURRENT_USER = 'app_clinic_billing' OR ...
rev10_named_root_owner_gate_188|RESTRICTIVE|{app_seam_org_commerce_owner,...}|ALL|...
rev10_seam_business_188|PERMISSIVE|{app_seam_org_commerce_owner,...}|ALL|...
```

Команда проверки membership, schema/table grants и только применимых к роли policies:

```bash
sudo -n -u postgres psql -X -A -t -q -h /var/run/postgresql -p 5432 -d bersoncarebot_test <<'SQL'
\set ON_ERROR_STOP on
BEGIN READ ONLY;
\echo [staff login membership in clinic billing role: member|role|inherit_option|set_option]
SELECT member_role.rolname, granted_role.rolname, membership.inherit_option, membership.set_option
FROM pg_auth_members AS membership
JOIN pg_roles AS granted_role ON granted_role.oid = membership.roleid
JOIN pg_roles AS member_role ON member_role.oid = membership.member
WHERE member_role.rolname = 'bcb_test_webapp_staff'
  AND granted_role.rolname = 'app_clinic_billing';
\echo [schema and table privileges]
SELECT has_schema_privilege('app_clinic_billing', 'public', 'USAGE'),
       has_table_privilege('app_clinic_billing', 'public.saas_tariffs', 'SELECT');
\echo [policies applicable to app_clinic_billing]
SELECT policyname, permissive, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'saas_tariffs'
  AND ('app_clinic_billing' = ANY (roles) OR 'public' = ANY (roles))
ORDER BY policyname;
ROLLBACK;
SQL
```

Вывод:

```text
[staff login membership in clinic billing role: member|role|inherit_option|set_option]
bcb_test_webapp_staff|app_clinic_billing|f|t
[schema and table privileges]
t|t
[policies applicable to app_clinic_billing]
rev10_context_gate_188|RESTRICTIVE|ALL|{app_clinic_billing,app_platform_settings,app_worker}|app.require_accepted_context(CURRENT_USER, CURRENT_USER, 'staff', 'relation', zero_args_hash, NULL)
rev10_direct_business_188|PERMISSIVE|ALL|{app_clinic_billing,app_platform_settings,app_worker}|CURRENT_USER = 'app_clinic_billing' OR CURRENT_USER = 'app_platform_settings' OR CURRENT_USER = 'app_worker'
```

Имена policies, относящиеся к `app_clinic_billing`, точные:

- `rev10_context_gate_188` — `RESTRICTIVE`; именно она дала `42501` без accepted context.
- `rev10_direct_business_188` — `PERMISSIVE`; для `CURRENT_USER = app_clinic_billing` истинна и не содержит
  tenant-фильтра.

`rev10_named_root_owner_gate_188` и `rev10_seam_business_188` к `app_clinic_billing` не применяются, потому что
их `roles` содержат только seam-owner roles.

Команда проверки capability в самой TEST-БД:

```bash
sudo -n -u postgres psql -X -A -t -q -h /var/run/postgresql -p 5432 -d bersoncarebot_test <<'SQL'
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SELECT capability_id, current_database(), port, session_login, target_role,
       context_class, purpose, function_identity, active_from, active_until
FROM app_ext.port_context_capabilities
WHERE target_role = 'app_clinic_billing'
  AND purpose = 'relation'
ORDER BY session_login, capability_id;
ROLLBACK;
SQL
```

Вывод:

```text
a95ea064-1d03-5f18-8986-af68845481bf|bersoncarebot_test|webapp|bcb_test_webapp_staff|app_clinic_billing|staff|relation||2026-08-20 14:24:19.871874+03|
```

## 6. Проверка фактического TEST checkout и журнала

Команда:

```bash
git -C /opt/projects/bersoncarebot-test rev-parse HEAD; git rev-parse HEAD; sed -n '575,605p' /opt/projects/bersoncarebot-test/apps/webapp/src/infra/repos/pgSaasBilling.ts; sed -n '405,430p' /opt/projects/bersoncarebot-test/apps/webapp/src/app/app/settings/page.tsx
```

Вывод SHA:

```text
41e9d6c46d8b2a5a00f0ca1c6bd13809ad17d6bb
17b8499596382b047d3a1ff71858176badcebcb6
```

В deploy checkout присутствуют тот же `listActiveTariffChoices()` с `isActive = true` и тот же вызов
`runWithDbClinicBillingPrincipal(... source: 'clinic-billing-settings-tariff-change-read')`; причины вида «TEST
запущен без этого вызова/запроса» не найдено в этих двух местах.

Команда точного поиска в журнале:

```bash
sudo -n journalctl -u bersoncarebot-webapp-test.service --since '2026-08-20 00:00:00' --no-pager | rg -i 'tariff|billing|accepted port context|42501'
```

Вывод: пустой. Искались ровно журнал `bersoncarebot-webapp-test.service` с начала 2026-08-20 и четыре точных
группы маркеров: `tariff`, `billing`, `accepted port context`, `42501`. Это не доказывает отсутствия ошибки в
браузере или непопавшего в journal исключения.

## Границы

- Все SQL-сессии начинались с `BEGIN READ ONLY`; записывающие statements не выполнялись.
- Не выполнялись grants/revokes, DDL, рестарты, env edits, deploy и обращения к PROD.
- Рабочее дерево изменено только этим отчётом.
- Full CI и тесты не запускались: продуктовый код не менялся, требуемый evidence — TEST runtime/DB introspection.
