# SCHEME — целевая схема слоя прав БД BersonCareBot

Черновик Ч1.1 (PLAN.md Ф1). Реализует четыре принятых принципа (PLAN.md «Целевая архитектура»).
Каждое решение несёт ссылку на FACTS.md, evidence/ или код (`файл:строка`). Ничего из §9 FACTS
(capability-only, «всегда бросать», AST, EXPLAIN) схема не использует.

---

## A. Декларация — один типизированный файл

**Решение:** одна декларация `deploy/postgres/privileges/declaration.ts` + типы `schema.ts`.
Почему TypeScript, а не YAML/HCL: репозиторий — TS-монорепо, весь инструментарий прав уже на
Node (`scripts/verify-a1-rls-conformance.mjs`, `scripts/a0-greenfield-baseline-lib.mjs`); типы дают
проверку имён ролей, областей и привилегий компилятором до всякого SQL. Сам паттерн «желаемое
состояние в данных, сверяемое с каталогом» — pg_permissions/CIS (evidence/07 §1); формат носителя
там не нормирован (pgbedrock — YAML, Atlas — HCL, pg_permissions — таблица), значит выбираем то,
что дешевле сопровождать здесь.

Декларация содержит шесть разделов (всё, чем управляет генератор, — и ничего больше):

1. **roles** — все роли: логины, терминальные, capability, владельцы; атрибуты
   (`login/superuser/bypassrls/inherit/createrole/rolconfig`), членства с опциями
   (`ADMIN/INHERIT/SET` — как в c5a: `GRANT app_clinic_billing TO app_staff WITH ADMIN FALSE,
   INHERIT FALSE, SET TRUE`, `c5a-platform-operations-runtime.sql:32`).
2. **scopes** — область на роль, `ORG | OWN | GLOBAL | NONE` — ровно те «11 строк», которых
   требует FACTS §1.5 (без объявленной области `app_patient` даёт 65 ложных «тихих нулей»).
3. **tables** — на таблицу: владелец, признак `org` (несёт `organization_id`), режим RLS
   (`force` — обязателен для org-таблиц), гранты по ролям **включая колоночные** (колоночный
   GRANT — живой механизм: `app_patient` держит `UPDATE(calendar_timezone, reminder_muted_until)`
   на `platform_users`, FACTS §1.4; громкий 42501 на новой невыданной колонке доказан,
   evidence/12 §7), политики (имя, PERMISSIVE/RESTRICTIVE, команда, роли, USING, WITH CHECK —
   RESTRICTIVE обязан быть выразим: композиция И/ИЛИ доказана, evidence/12 §10).
4. **definerExceptions** — SECURITY DEFINER функции как ПЕРЕЧИСЛЕННЫЕ исключения, каждая со
   строкой-обоснованием и точным ACL (capability-only как норма отвергнута — FACTS §9.4,
   evidence/07 §5; definer — «аудируемое исключение», evidence/07 §5 «защитимая середина»).
5. **orgTableAllowlist** — выводится из `tables[*].org == true`; это же множество ест event
   trigger (§E) — отдельного списка нет, одна власть (принцип 1).
6. **environments** — отображение канонических ролей на логины окружений
   (`bcb_test_staff_login` ↔ `app_runtime_staff_login` стенда, `verify-a1-rls-conformance.mjs:21-22`;
   мигратор-логин обнаруживается из env — `deploy-test-saas.sh:546-548,640`).

### Живой образец (2 роли-терминала + 1 платформенная; 3 реальные таблицы)

```ts
export const declaration: PrivilegeDeclaration = {
  roles: {
    app_staff:             { kind: 'terminal', scope: 'ORG', login: false, bypassrls: false },
    app_patient:           { kind: 'terminal', scope: 'OWN', login: false, bypassrls: false },
    app_platform_settings: { kind: 'terminal', scope: 'GLOBAL', login: false, bypassrls: false },
    app_clinic_billing:    { kind: 'capability', scope: 'ORG',
                             grantedTo: [{ role: 'app_staff', admin: false, inherit: false, set: true }] },
    app_owner:             { kind: 'owner', scope: 'NONE', members: [] },  // ноль членов вне окна миграций
    bcb_test_staff_login:  { kind: 'login', memberOf: ['app_staff'], inherit: false },
  },
  tables: {
    'public.be_appointments': {
      org: true, rls: 'force', owner: 'migrator',
      grants: { app_staff: ['SELECT', 'INSERT', 'UPDATE'], app_patient: ['SELECT'] },
      policies: [
        { name: 'be_appointments_staff_org', as: 'PERMISSIVE', cmd: 'ALL', to: ['app_staff'],
          using: 'organization_id = app.current_org_id()',
          withCheck: 'organization_id = app.current_org_id()' },
      ],
    },
    'public.be_organization_members': {           // сегодня relrowsecurity=false — дефект FACTS §1.2-1.3
      org: true, rls: 'force', owner: 'migrator',
      grants: { app_staff: ['SELECT'], app_platform_settings: ['SELECT'] }, // exact-wall: c5a:1293-1355
      policies: [ /* org-политики для staff; платформенное чтение — через
                     app.list_platform_organization_members(uuid), см. definerExceptions */ ],
    },
    'public.platform_users': {                    // owner-gate №1: включение RLS (FACTS §1.4)
      org: false, rls: 'pending-owner-decision', owner: 'migrator',
      grants: { app_patient: [{ kind: 'columns', priv: 'UPDATE',
                                columns: ['calendar_timezone', 'reminder_muted_until'] }] },
    },
  },
  definerExceptions: {
    'app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)': {
      owner: 'app_owner', execute: ['app_staff', 'app_patient', 'app_clinic_billing'],
      why: 'вход принципала: HMAC-подпись проверяется до установки GUC (packages/db-principal/src/index.ts)' },
    'app.release_principal_context()': {
      owner: 'app_owner', execute: ['app_staff', 'app_patient', 'app_clinic_billing'],
      why: 'выход принципала: гигиена пула соединений' },
    'app.list_platform_organization_members(uuid)': {
      owner: 'app_owner', execute: ['app_platform_settings'],
      why: 'платформенный подсчёт мест без чтения platform_users/инвайтов (c5a:1293-1355)' },
  },
};
```

Полная декларация заполняется переписью живого каталога минус известные дефекты (PLAN.md Ф2);
объём порядка снятой поверхности: ~45 ролей, ~235 прикладных таблиц, ~291 политика, ~253 функции
`app.*` (evidence/07 «Общий вердикт», FACTS §1.6: 307 таблиц всего в базе).

## B. Генератор

**Вход** — декларация; **выход** — один детерминированный `deploy/postgres/generated/privileges.sql`,
**закоммиченный** в репозиторий (диффы прав видны на ревью; CI перегенерирует и падает при
расхождении файла с декларацией — та же дисциплина, что у drizzle-снапшотов). Скрипт —
`scripts/generate-db-privileges.mjs`, по образцу существующих (`a0-greenfield-baseline-lib.mjs`).

Свойства выходного SQL — все доказаны исполнением:

- **полное переприменение**: на каждый объект `REVOKE ALL … FROM <все управляемые роли>` затем
  точные GRANT; `DROP POLICY IF EXISTS` затем `CREATE POLICY`; идемпотентность побайтно доказана
  (evidence/12 §8);
- **одна транзакция** (`psql -1 -v ON_ERROR_STOP=1`): раздельные autocommit-операторы ломают
  открытых читателей 42501 в окне — запрещено (FACTS §4.1, evidence/12 §9);
- порядок статей внутри файла отсортирован (стабильный дифф).

**Место в конвейере:** тот же слот, где сегодня идёт цепочка оверлеев после миграций —
`runtime_overlay_apply_post_migration_chain` (`deploy/host/runtime-overlay-rehydrate-lib.sh:65`),
исполнитель — существующий админ-канал `runtime_overlay_admin_psql`. Это соответствует предписанию
Liquibase «гранты отдельным changelog, runAlways, подключается последним» (evidence/07 §2).
Стенд a1 в CI применяет **тот же самый файл** вместо четырёх оверлеев, которые он проигрывает
сегодня (`verify-a1-rls-conformance.mjs:405-429`) — одна дорожка для CI, TEST и будущего прода.

**Гейт «миграции — только схема»:** новая миграция с `GRANT/REVOKE/CREATE POLICY/CREATE ROLE/
ALTER ROLE/ALTER DEFAULT PRIVILEGES` = красная сборка (PLAN.md Ф2). Двум движкам нельзя спорить за
один ACL — задокументированный wontfix dbt #6238 (evidence/07 §2б). Старые 377 не трогаются (§H).

### Судьба 61 оверлея `deploy/postgres/*.sql` (посчитано: 61 файл)

| Класс | Примеры | Судьба |
|---|---|---|
| Чистые права/политики/роли | `p0-5b-grants.sql`, `d3-4-…`, `phase4-locked-helper-rls-policies.sql`, `phase4-force-rls-cutover.sql`, `dev-c4…c10`, `s5`, `u9a`, `d2`, `d15b4` | **поглощаются декларацией**, файлы удаляются |
| Смешанные: definer-тела + их ACL + сверки | `c5a`, `c4`, `integrator-server-runtime-config.sql`, `p2-b`, `organization-member-invites-rls.sql`, `specialist-*`, `patient-*`, `public-*`, `reference-catalog-rls.sql`, `saas-*`, `store-*`, `e1-*` | **расщепляются**: тела функций → миграции (схема); ACL/политики/exact-wall-блоки → декларация (сверку берёт §F) |
| Онлайн-индексы | `c4d-…`, `d30-…` | остаются как есть (не права) |
| Данные/фикстуры | `p0-data-fix-…`, `test-settings-override.sql`, `test-saas-isolation-telemetry-fixtures.sql`, `dev-c2-dev-bypass-fixture.sql` | остаются (данные, не права) |
| Разовый бутстрап | новый `bootstrap-deny-by-default.sql` (§D) + установка event trigger (§E) | два новых файла |

**Конечное состояние: в `deploy/postgres/` права существуют только в `generated/privileges.sql`;
всего ≤12 файлов вместо 61** (генерат + бутстрап + триггер + индексы/данные/фикстуры).

## C. Модель владения

| Что | Кто | Основание |
|---|---|---|
| Таблицы | мигратор-роль (логин из env; в стенде — `bcb_a0_owner`) | так уже есть: drizzle применяет DDL под этим логином (`scripts/migrate-all.sh`); FORCE RLS удерживает и владельца — потому FORCE несущий и остаётся |
| SECURITY DEFINER функции | `app_owner` — NOLOGIN, **ноль членов** вне окна миграций | канон уже в коде: `verify-a1-rls-conformance.mjs:301-319,466-472` (окно `grant/revoke_migrator_app_owner_membership`, постпроверка нуля членов), `c5a:44` (`ALTER FUNCTION … OWNER TO app_owner`) |
| Event trigger | суперпользователь `postgres` | владеть event trigger может только суперпользователь — доказано, evidence/12 §6 |
| Миграции запускает | мигратор-логин через `scripts/migrate-all.sh` с временным членством в `app_owner` | `deploy-test-saas.sh:134-166`; FACTS §3 (поломка №6 и её починка) |
| Генератор применяет | админ-канал деплоя (`runtime_overlay_admin_psql`, sudo-postgres) | ему нужны ALTER ROLE/OWNER на чужие объекты; тот же канал, что и оверлеи сегодня (`runtime-overlay-rehydrate-lib.sh:113`) |

Ни одна рантайм-роль не владеет ничем и не имеет `BYPASSRLS/SUPERUSER/CREATEROLE` — сегодня это
проверяет стенд (`verify-a1-rls-conformance.mjs:460-467`), в целевой схеме это строки декларации,
сверяемые §F.

## D. Deny-by-default — разовый бутстрап

Файл `deploy/postgres/bootstrap-deny-by-default.sql`, применяется один раз на базу (идемпотентен).
Механика доказана: после этой настройки новая таблица рождается закрытой, рантайм-роль получает
42501 без дальнейших действий (evidence/12 §1-2).

Схемы этой базы: `public`, `app`, `integrator`, `drizzle` (`FACTS §1.1` — схема `integrator`;
`verify-a1-rls-conformance.mjs` — `app`, `drizzle`).

1. `REVOKE ALL ON DATABASE <db> FROM PUBLIC;` затем `GRANT CONNECT` только перечисленным логинам
   декларации (PUBLIC CONNECT/TEMPORARY — неявный дефолт, evidence/12 §1).
2. `REVOKE ALL ON SCHEMA public, app, integrator, drizzle FROM PUBLIC;` затем `GRANT USAGE`
   по-ролево из декларации. `CREATE` на схемах — только владельцам (§C).
3. **Закрытый список создающих ролей** — defaults живут по-создающей-роли (evidence/12 §3b:
   членство НЕ наследует defaults): `postgres`, мигратор-логин, `app_owner`,
   `saas_telemetry_owner`, `saas_system_health_owner` (владельцы, создающие объекты в оверлеях
   сегодня — `saas-isolation-telemetry.sql`, `saas-system-health-diagnostics.sql`; точный список
   фиксирует перепись Ф2 и он попадает в декларацию). На каждого:
   `ALTER DEFAULT PRIVILEGES FOR ROLE <r> REVOKE ALL ON TABLES/SEQUENCES/FUNCTIONS/TYPES FROM PUBLIC;`
   — особенно FUNCTIONS/TYPES, где дефолт PUBLIC EXECUTE/USAGE (evidence/12 §1).
4. Никаких «положительных» default privileges не заводим вовсе: права на новые объекты выдаёт
   только генератор при следующем деплое. Посхемный REVOKE не вычитает глобальный грант
   (evidence/12 §3d) — ещё одна причина не держать положительных дефолтов.

До бутстрапа снимается перепись фактических прав (та же машинерия, что §F) — чтобы «красный»
шаг приёмки был воспроизводим и ничего живого не отвалилось молча.

## E. Event trigger — стена в точке рождения

Адаптация доказанного прототипа (evidence/12 §4-6, рабочий код там же):

- **Схемы под надзором:** `public`, `app`, `integrator` (все прикладные; `drizzle` — журнал
  мигратора, org-таблиц там нет).
- **Признак org-таблицы:** колонка `organization_id` (`attnum > 0`, не dropped) — ровно предикат
  прототипа (evidence/12 §4) и определение из FACTS §1.3.
- **Теги:** `CREATE TABLE`, `CREATE TABLE AS`, **`ALTER TABLE`** — поздняя org-колонка ловится,
  без тега ALTER дыра (evidence/12 §6, оговорка В0.2).
- **Режим: reject.** Org-таблица не в allowlist (= `tables[*].org` декларации, §A.5) →
  `RAISE … ERRCODE '42501'`, DDL откатывается (доказано `to_regclass = NULL`, evidence/12 §5).
  Обоснование: принцип 2 требует «громкий 42501 на dev, никогда не тихая утечка» (PLAN.md);
  accept-режим («молча поставить RLS+FORCE») дал бы таблицу со стеной, но БЕЗ политик и БЕЗ строки
  в декларации — сверка §F покраснела бы лишь позже, а не в момент дефекта. Reject заставляет
  автора миграции объявить таблицу до её создания — дефект не рождается (порядок принципов,
  PLAN.md: «сначала конструкция…»).
- Для объявленных org-таблиц триггер тут же ставит `ENABLE`+`FORCE ROW LEVEL SECURITY` — таблица
  рождается за стеной ещё до прихода политик генератором (RLS без политик = deny-all для
  не-владельца); механика доказана (evidence/12 §4).
- **Защита от рекурсии:** собственные ALTER триггера снова зовут `ddl_command_end` (лог прототипа,
  evidence/12 §4) — обработчик ставит session-GUC `app.ddl_wall_active` и выходит немедленно,
  если тот уже стоит; плюс существующая перепроверка флагов.
- **Владелец — `postgres`** (только суперпользователь, evidence/12 §6); компрометация
  суперпользователя — вне этой стены, там же доказано. Allowlist-таблица в схеме `app_control`,
  закрыта от всех рантайм-ролей; генератор синхронизирует её из декларации в той же транзакции.
- CI-гейт `check-new-table-rls-coverage.mjs` (уже в CI — FACTS §2) остаётся страховкой на период
  внедрения; после включения reject-режима на dev/CI/TEST он избыточен и снимается.

## F. Двусторонняя сверка declared ↔ catalog

Расширение паттерна c5a — `(actual EXCEPT expected) UNION ALL (expected EXCEPT actual)`
(`c5a-platform-operations-runtime.sql:1340-1350,1713-1727`; это pg_permissions/CIS-паттерн,
evidence/07 §1) — с точечных exact-wall-блоков на **всю базу и все роли**.

**Ожидаемое состояние строит тот же генератор** из той же декларации (второй артефакт:
`generated/expected-state.json`) — одна власть над «ожидаемым», сверка не может разойтись с
генератом иначе как через дефект каталога.

Покрываемые классы объектов (каждый — обе стороны EXCEPT):

| Класс | Каталог | Прецедент |
|---|---|---|
| table ACL | `pg_class.relacl` через `aclexplode(COALESCE(relacl, acldefault(…)))` | c5a:1297-1310 |
| column ACL | `pg_attribute.attacl` | c5a:1311-1319; без него табличная проверка врёт (FACTS §1.4) |
| function ACL + `prosecdef` + владелец | `pg_proc.proacl/prosecdef/proowner` | c5a:1320-1336,1345 |
| политики, вкл. RESTRICTIVE, USING/WITH CHECK-текст | `pg_policies` | c5a:1719-1721; RESTRICTIVE меняет семантику — evidence/12 §10 |
| атрибуты ролей | `pg_roles`: `rolcanlogin/rolsuper/rolbypassrls/rolinherit/rolcreaterole/rolconfig` | `verify-a1-rls-conformance.mjs:460-461`; pgTAP атрибуты не покрывает — писать самим (evidence/07 §3) |
| членства с опциями | `pg_auth_members` (admin/inherit/set) | c5a:32; rig:462-480 |
| владельцы объектов | `relowner/proowner` | §C |

**Где бежит:** (1) CI — на одноразовом кластере a1 после миграций + генерата; (2) деплой-постчек
на TEST сразу после применения генерата (тот же слот, что нынешние постчеки
`deploy-test-saas.sh:500-521`). Скрипт один: `scripts/verify-db-privileges-conformance.mjs`.

**Красный:** ненулевое число строк в любом направлении; вывод печатает сами строки
(`направление, роль, объект, привилегия/политика`) и завершает `exit 1` — деплой падает.
Приёмка Ф4: ручной `GRANT SELECT ON … TO app_staff` мимо декларации обязан дать ровно одну
строку `actual-not-declared` (PLAN.md Ф4).

## G. Свип — 6 каталожных инвариантов

Один файл `scripts/db-privileges-sweep.sql`, каждый запрос обязан вернуть **0 строк**
(шаблон Splinter/GitLab — evidence/07 §3). Эскизы для этой базы:

```sql
-- 1. RLS на каждой org-таблице (красный сегодня: 5 таблиц FACTS §1.3)
SELECT c.oid::regclass FROM pg_class c
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='organization_id'
  AND a.attnum>0 AND NOT a.attisdropped
WHERE c.relkind IN ('r','p') AND c.relnamespace::regnamespace::text IN ('public','app','integrator')
  AND NOT c.relrowsecurity;
-- 2. FORCE там же (тот же запрос с NOT c.relforcerowsecurity)
-- 3. нет RLS-таблиц без единой политики
SELECT c.oid::regclass FROM pg_class c WHERE c.relrowsecurity
  AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid);
-- 4. нет политик TO PUBLIC и грантов PUBLIC на прикладных объектах
SELECT polrelid::regclass, polname FROM pg_policy WHERE polroles = ARRAY[0]::oid[];
SELECT c.oid::regclass FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) x
WHERE x.grantee=0 AND c.relnamespace::regnamespace::text IN ('public','app','integrator');
-- 5. нет неожиданного BYPASSRLS/SUPERUSER (allowlist: только postgres)
SELECT rolname FROM pg_roles WHERE (rolbypassrls OR rolsuper) AND rolname <> 'postgres';
-- 6. представления — только security_invoker (definer-представление видит чужое: FACTS §4, замер Sol)
SELECT c.oid::regclass FROM pg_class c WHERE c.relkind='v'
  AND c.relnamespace::regnamespace::text IN ('public','app','integrator')
  AND COALESCE((SELECT NOT ('security_invoker=true' = ANY(c.reloptions))), true);
```

Свип — страховка движка, не основной механизм (принцип 4): в нормальной жизни вечно зелёный,
красный = ЧП. Бежит вместе со сверкой §F (CI + деплой-постчек). Стенд a1 остаётся поведенческим
доказательством сквозь реальный код (FACTS §3) и добирает свои 5 дыр по Ф5 — свип его не заменяет.

## H. Путь миграции от сегодняшнего состояния

Каждый шаг — красный→зелёный→снова-красный (PLAN.md «Правило приёмки»). Применённые миграции НЕ
переписываются: журнал drizzle — watermark по `created_at`, переписывание истории ломает мигратор.

1. **Перепись** живого каталога TEST → черновик декларации (снятое состояние минус дефекты
   FACTS §1.2-1.4). Машинерия переписи = §F наоборот. *(красный: сверка против пустой декларации.)*
2. **Генератор + сверка §F на одноразовом кластере** (инфраструктура a1). Зелёный = каталог после
   «миграции + генерат» побайтно сходится с декларацией в обе стороны.
3. **CI-гейты:** (а) новая миграция содержит GRANT/REVOKE/CREATE POLICY/CREATE ROLE → красный;
   (б) `generated/privileges.sql` разошёлся с декларацией → красный.
4. **Бутстрап §D + event trigger §E** — сначала одноразовый кластер и a1, на TEST — только по
   команде владельца (деплой на TEST остановлен — FACTS §11).
5. **Первое применение генерата на TEST = Ф6:** дефекты закрываются приведением реальности к
   декларации, не заплатками: 5 таблиц без RLS+FORCE (§1.3), 7 ячеек утечки (§1.2),
   `platform_users` (§1.4 — после развилки №1). Доказательство — свип зелёный + обход
   1892 ячеек `(роль × таблица × принципал)` ноль чужих строк (FACTS §6) + стенд PASS.
6. **Оверлеи:** расщепление по таблице §B; каждый удаляемый файл — отдельный коммит с тремя
   транскриптами (его отсутствие компенсировано генератом — сверка зелёная без него).
7. **Baseline-сжатие 377 миграций (~160 с правами — PLAN.md Ф1):** по протоколу Django
   (evidence/07 §2): сжать → старые файлы сохранить → выпустить → дождаться, пока все живые базы
   (TEST, позже прод) пройдут watermark за точку сжатия → только потом архивировать. Для свежих
   сред — baseline-слепок (механика a0 уже есть: `scripts/a0-greenfield-baseline-lib.mjs`).
   GRANT-статьи внутри исторических миграций остаются в файлах (история), но носителем истины
   быть перестают: генератор всё равно полностью переприменяет ACL поверх (§B, full reapply).
   Приёмочный тест сжатия: старый и сжатый пути в контейнерах, сравнение
   `information_schema.role_table_grants` + `pg_policies` (evidence/07 §2).

Порядок важен: шаги 1-3 не трогают TEST вовсе (одноразовые кластеры), «включение» стен на TEST
(4-5) — один owner-gate, дальше сопровождение только через декларацию.

## I. Вне рамок и развилки владельца

**Вне рамок схемы:** Result-типизация порта и 177 мест гашения (отдельный механизм —
evidence/07 §4); отгрузка журнала/алертинг 42501; починка угадывания роли в Node
(`withClient.ts:56-66`, FACTS §1.1) — устраняется своей работой Ф6; клиентский код приложения;
прод (не трогается — миграция прода на SaaS отдельным решением владельца).

**Развилки (дополняю рекомендациями к листу PLAN.md):**

1. **`platform_users` RLS — сейчас.** Единственная стена на 278 строк ПДн; `app_staff` без
   принципала читает всё (FACTS §1.4). Схема уже несёт для неё строку декларации; откладывание
   означает вечную пометку `rls: 'off'` в декларации на самой чувствительной таблице.
2. **7 ячеек утечки — сузить `app_platform_settings`.** 5/7 ячеек — биллинг под GLOBAL-ролью
   (FACTS §1.2); платформа читает членства через definer-исключение, а не табличный SELECT
   (образец уже есть — c5a:1293-1355). Политики поверх GLOBAL-роли добавили бы второй механизм
   там, где хватает точного ACL (меньше движущихся частей).
3. **Свой генератор, не Atlas Pro.** Atlas покрывает поверхность (evidence/07 §1), но: $9/место/мес
   + облачная авторизация; event trigger он не ведёт (нет и у pgschema); наша сверка обязана
   строиться из ТОЙ ЖЕ декларации, что и генерат (§F), иначе две власти; c5a-паттерн и вся
   Node-обвязка уже в репозитории. Генератор здесь — ~сотни строк поверх уже доказанных механик
   (evidence/12 §8). Пересмотреть, если сопровождение своего станет заметной статьёй.
4. **Приёмка этой схемы (Ч1.3)** — продуктовое решение владельца.

---

*Проверка на непротиворечие FACTS §9: definer-функции — перечисленные исключения, не норма (§9.4);
отказ прав остаётся 42501 от движка, «всегда бросать» в коде не вводится (§9.2); все проверки —
каталог и исполнение, ни одной статической/AST (§9.3) и ни одной через EXPLAIN (§4); FORCE RLS
сохраняется на всех org-таблицах (констрейнт задачи; свип §G.2 его караулит); стенд a1 остаётся
поведенческим доказательством (§3); watermark-журнал мигратора не переписывается (§H).*
