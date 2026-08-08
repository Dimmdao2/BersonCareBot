# SCHEME — целевая схема слоя прав БД BersonCareBot

Черновик Ч1.2-r2 — ревизия после адверсарного критика №2 (PLAN.md Ф1). Реализует четыре принятых
принципа (PLAN.md «Целевая архитектура»). Каждое решение несёт ссылку на FACTS.md, evidence/ или
код (`файл:строка`). Ничего из §9 FACTS (capability-only, «всегда бросать», AST, EXPLAIN) схема
не использует.

---

## A. Декларация — один типизированный файл

**Решение:** одна декларация `deploy/postgres/privileges/declaration.ts` + типы `schema.ts`.
Почему TypeScript, а не YAML/HCL: репозиторий — TS-монорепо, инструментарий прав уже на Node
(`scripts/verify-a1-rls-conformance.mjs`, `scripts/a0-greenfield-baseline-lib.mjs`); типы дают
проверку имён ролей, областей и привилегий компилятором до всякого SQL. Паттерн «желаемое
состояние в данных, сверяемое с каталогом» — pg_permissions/CIS (evidence/07 §1); формат носителя
там не нормирован (pgbedrock — YAML, Atlas — HCL) — выбираем то, что дешевле сопровождать здесь.

Декларация содержит девять разделов (всё, чем управляет генератор, — и ничего больше):

1. **roles** — все канонические роли: терминальные, capability, владельцы; атрибуты
   (`login/superuser/bypassrls/inherit/createrole/rolconfig`), членства с опциями
   (`ADMIN/INHERIT/SET`, как в `c5a-platform-operations-runtime.sql:31`). `app_owner` объявляется
   с `bypassrls: true` и обоснованием: NOLOGIN definer-шов, деплой ЖЁСТКО ассертит `rolbypassrls`
   (`deploy-test-saas.sh:907`, `deploy-test.sh:174`); снятие BYPASSRLS — изменение модели
   безопасности, развилка владельца №5 (§I), схема его не проектирует.
2. **scopes** — область на роль, `ORG | OWN | GLOBAL | NONE` — ровно те «11 строк», которых
   требует FACTS §1.5 (без объявленной области `app_patient` даёт 65 ложных «тихих нулей»).
3. **schemas + database** — по каждой схеме (`public/app/app_ext/integrator/drizzle/app_control`;
   `app_ext` — живая схема pgcrypto-шва: создаётся и используется p2-b,
   `p2-b-protected-principal-context.sql:94,107,129,189,231` — definer-функции зовут
   `app_ext.hmac`): `USAGE/CREATE` по-ролево; по базе `CONNECT` — привязан к логинам, рендер с
   env-маппингом (§A.1). Схемный `USAGE` — первый рубеж 42501 (evidence/12 §1).
4. **tables** — на таблицу: владелец, признак `org` (несёт `organization_id`), режим RLS
   (`force` — обязателен для org-таблиц), гранты по ролям **включая колоночные** (живой механизм:
   `app_patient` держит `UPDATE(calendar_timezone, reminder_muted_until)` на `platform_users`,
   FACTS §1.4; громкий 42501 на невыданной колонке доказан, evidence/12 §7), политики (имя,
   PERMISSIVE/RESTRICTIVE, команда, роли, USING, WITH CHECK — композиция И/ИЛИ доказана,
   evidence/12 §10). Правило для последовательностей: роль с `INSERT/UPDATE` на таблице получает
   `USAGE` на её последовательностях (serial-DEFAULT требует USAGE; необходимость для
   identity-последовательностей — требует прогона в Ф3); исключения — явными sequence-записями.
5. **functions / views** — явные ACL не-definer функций и представлений: по умолчанию ничего
   (шаг wall-install §D снимает и дефолт, и уже материализованный `PUBLIC EXECUTE`), EXECUTE —
   только перечисленным здесь; представления — обязательный `security_invoker` (§G.6).
6. **types** — явные `USAGE`-гранты по пользовательским типам. Сегодня раздел пуст: в 378 файлах
   `apps/webapp/db/drizzle-migrations/` ноль `CREATE TYPE` (посчитано grep'ом), но дефолт
   `PUBLIC USAGE` на типах существует (evidence/12 §1), hardening §D его закрывает — раздел
   заведён, чтобы первый будущий тип был объявлен, а не унаследовал дефолт.
7. **definerExceptions** — SECURITY DEFINER функции как ПЕРЕЧИСЛЕННЫЕ исключения, каждая со
   строкой-обоснованием и точным ACL (capability-only как норма отвергнута — FACTS §9.4,
   evidence/07 §5; definer — «аудируемое исключение», evidence/07 §5 «защитимая середина»).
8. **creators** — закрытый список создающих ролей (`postgres`, мигратор-логин, `app_owner`,
   `saas_telemetry_owner`, `saas_system_health_owner`; состав фиксирует перепись Ф2): defaults
   живут по-создающей-роли, членством не наследуются (evidence/12 §3b) — список едят
   wall-install §D.3 и default-hardening генератора §B.
9. **orgTableAllowlist** — выводится из `tables[*].org == true`; это же множество ест event
   trigger (§E) — отдельного списка нет, одна власть (принцип 1).

### A.1 Привязка к окружению — per-env маппинг логинов (истина уровня логина)

Логины — единственная env-зависимая часть (стенд: `app_runtime_staff_login`, TEST: `bcb_test_*` —
`scripts/verify-a1-rls-conformance.mjs:21-22`; мигратор-логин обнаруживается из env —
`deploy-test-saas.sh:546-548,640`). Они живут НЕ в декларации, а в per-env маппинге
`deploy/postgres/privileges/env/<env>.json`. Маппинг — не пары имён, а полная запись логина
(иначе истина уровня логина бездомна и живёт в `dev-c0-runtime-logins.sql` + головах):

- **имя логина → каноническая роль** (членство с опциями);
- **источник пароля** — ссылка на env-секрет (имя переменной), НИКОГДА не литерал;
- **атрибуты — все пиновятся**: `LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEROLE`
  (стенд уже ассертит `NOT rolinherit` у логинов — `verify-a1-rls-conformance.mjs:460-461`);
- **rolconfig — по умолчанию `NULL`**, исключения объявляются явно (класс дефекта —
  login-уровневый `search_path`, FACTS §9.6; ассерт сегодня — `dev-c0-runtime-logins.sql:136`);
- **VALID UNTIL / connection limit** — пиновятся (дефолт: не заданы); **CONNECT** на базу.

Маппинг едят два потребителя: шаг `roles-install` (§B шаг 1) — создание/приведение логинов, и
сверка §F — рендер ожидаемых per-env строк по ВСЕМ этим классам. Login-специфичные статьи
генератор рендерит В МОМЕНТ ПРИМЕНЕНИЯ из декларации + маппинга; рендер не коммитится. Оставить
ли провижининг логинов в контуре — развилка №8 (§I); дефолт схемы — В контуре (рекомендация).

### Живой образец (2 роли-терминала + 1 платформенная; 3 реальные таблицы)

```ts
export const declaration: PrivilegeDeclaration = {
  roles: {
    app_staff:             { kind: 'terminal', scope: 'ORG', login: false, bypassrls: false },
    app_patient:           { kind: 'terminal', scope: 'OWN', login: false, bypassrls: false },
    app_platform_settings: { kind: 'terminal', scope: 'GLOBAL', login: false, bypassrls: false },
    app_clinic_billing:    { kind: 'capability', scope: 'ORG',
                             grantedTo: [{ role: 'app_staff', admin: false, inherit: false, set: true }] },
    app_owner:             { kind: 'owner', scope: 'NONE', members: [],   // ноль членов вне окна миграций
                             bypassrls: true },  // definer-шов; ассерт deploy-test-saas.sh:907; развилка №5
    // логинов здесь НЕТ — полная запись логина живёт в env-маппинге (§A.1)
  },
  tables: {
    'public.be_appointments': {
      org: true, rls: 'force', owner: 'migrator',
      grants: { app_staff: ['SELECT', 'INSERT', 'UPDATE'], app_patient: ['SELECT'] },
      policies: [{ name: 'be_appointments_staff_org', as: 'PERMISSIVE', cmd: 'ALL',
                   to: ['app_staff'], using: 'organization_id = app.current_org_id()',
                   withCheck: 'organization_id = app.current_org_id()' }],
    },
    'public.be_organization_members': {           // сегодня relrowsecurity=false — дефект FACTS §1.2-1.3
      org: true, rls: 'force', owner: 'migrator',
      grants: { app_staff: ['SELECT'], app_platform_settings: ['SELECT'] }, // exact-wall: c5a:1293-1355
      policies: [ /* org-политики staff; платформенное чтение — через definerExceptions */ ],
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
    'app.list_platform_organization_members(uuid)': {
      owner: 'app_owner', execute: ['app_platform_settings'],
      why: 'платформенный подсчёт мест без чтения platform_users/инвайтов (c5a:1293-1355)' },
  },
};
```

Полная декларация заполняется переписью живого каталога минус известные дефекты (PLAN.md Ф2);
объём: ~45 ролей, ~235 прикладных таблиц, ~291 политика, ~253 функции `app.*`
(evidence/07 «Общий вердикт», FACTS §1.6: 307 таблиц всего).

## B. Генератор

**Вход** — декларация; **выход №1** — детерминированный `deploy/postgres/generated/privileges.sql`,
**закоммиченный**: вся env-НЕзависимая истина (роли и членства канонических ролей, схемные,
табличные, колоночные, sequence-, type-, function- и view-гранты, политики, ACL definer-исключений,
default-privilege hardening). Login-специфичные статьи (биндинг логинов, CONNECT) в него НЕ входят —
их генератор рендерит при применении из декларации + env-маппинга (§A.1), рендер не коммитится.
CI держит два гейта: (а) побайтная перегенерация артефакта — расхождение с декларацией = красный
(дисциплина drizzle-снапшотов); (б) детерминизм: тот же вход → побайтно тот же выход.
Скрипт — `scripts/generate-db-privileges.mjs`, по образцу `a0-greenfield-baseline-lib.mjs`.

Свойства выходного SQL — все доказаны исполнением:

- **полное переприменение**: на каждый объект `REVOKE ALL … FROM <все управляемые роли>` затем
  точные GRANT; `DROP POLICY IF EXISTS` затем `CREATE POLICY`; идемпотентность побайтно доказана
  (evidence/12 §8);
- **default-privilege hardening в выходе**: на каждую роль из `creators` (§A.8) — те же статьи,
  что wall-install §D.3: создатель, добавленный в декларацию ПОЗЖЕ, получает hardening при
  ближайшем применении, а не никогда; расхождение ловят §F (pg_default_acl) и свип §G.7;
- **одна транзакция** (`psql -1 -v ON_ERROR_STOP=1`): раздельные autocommit-операторы ломают
  открытых читателей 42501 в окне — запрещено (FACTS §4.1, evidence/12 §9);
- порядок статей отсортирован (стабильный дифф).

### Место в конвейере — ЕДИНАЯ цепочка деплоя, порядок несущий

Ключевой факт (решение блокера): full-reset ВОССТАНАВЛИВАЕТ базу из прод-дампа ДО миграций
(`deploy-test-saas.sh:49` → restore `:3083-3084`, migrate `:3092-3101`; SERVER CONVENTIONS.md:125).
Дамп не несёт ни `app_control`, ни event trigger, ни REVOKE-бутстрапа, ни `pg_default_acl`-
hardening — всё это per-database и умирает с пересозданием базы. Поэтому «разового бутстрапа» в
схеме НЕТ: установка стены — идемпотентные шаги КАЖДОГО деплоя — паттерн, которым сегодня
переживают restore оверлеи (`runtime_overlay_apply_post_migration_chain`,
`deploy/host/runtime-overlay-rehydrate-lib.sh:65`). Цепочка (каждый шаг идемпотентен; упал →
деплой красный ДО следующего шага, `ON_ERROR_STOP`):

1. **`roles-install`** — кластерный уровень, рендер из ТОЙ ЖЕ декларации (канонические роли +
   атрибуты) + env-маппинга (логины, §A.1). Роли кластерные, restore переживают; на greenfield
   обязаны существовать ДО восстановления слепка — политики слепка резолвят имена ролей при
   создании (стенд доказывает порядок: создание ролей `verify-a1:263-281` до restore). Закрывает
   «runtime roles must be provisioned BEFORE…» (`deploy-test-saas.sh:141-146`) и FACTS §3 №1-2.
2. **restore** (только full-reset; в a1 — восстановление a0-слепка).
3. **`wall-install`** — в базе: схема `app_control` + `org_table_allowlist` + маркер-роль фазы
   миграций (§E) + event trigger (владелец `postgres`); deny-by-default §D (REVOKE PUBLIC,
   default-hardening создателей, снятие материализованного `PUBLIC EXECUTE`).
4. **`sync-org-allowlist`** — та же декларация; применяет allowlist **ТОЛЬКО ДОБАВЛЕНИЕМ/
   ОБНОВЛЕНИЕМ**, строк не удаляет (снятие — шаг 6, где финальное состояние известно). Одна
   транзакция, исполнитель — `runtime_overlay_admin_psql` (`runtime-overlay-rehydrate-lib.sh:113`).
5. **migrate** — `pnpm migrate` под временной скобкой элевации (`ALTER ROLE $DBROLE BYPASSRLS`
   `:3098` + членство в `app_owner` `:3092-3097`, снятие и ассерт — `cleanup_elevation`); та же
   скобка помечает сессию мигратора для стены (§E, фаза миграций). Декларация пиновит мигратора
   `NOBYPASSRLS` в стационаре: BYPASSRLS, повисший после упавшего migrate, ловит сверка §F
   (атрибуты ролей); сегодня то же ассертит cleanup (`deploy-test.sh:83,177-178`).
6. **генерат** — в слоте нынешней цепочки оверлеев, тем же админ-каналом. Полное переприменение
   ACL/политик + ПОЛНОЕ переприменение allowlist: снятые из декларации строки уходят ЗДЕСЬ.
   Соответствует предписанию Liquibase «гранты отдельным changelog, runAlways, последним»
   (evidence/07 §2).
7. **сверка §F + свип §G** — деплой-постчек, fail-closed: org-таблица, пережившая migrate и не
   объявленная в декларации, = красный деплой (§E, фаза миграций).

**Оба пути деплоя — одна реализация.** Ежедневный code-only `deploy-test.sh` (git-bundle → build →
pending migrations → restart; SERVER CONVENTIONS.md:125) получает ТЕ ЖЕ точки вставки: шаги 1, 3,
4 перед его `pnpm migrate` (`deploy-test.sh:183`), шаги 6-7 — в общем закрывающем подрежиме,
который он уже зовёт (`:197` → `deploy-test-saas.sh:2958-2963` → `run_strict_post_migration_closure`
`:2685`). Greenfield/a1 — та же цепочка, a0-слепок в роли restore (порядок 1→2 доказан, шаг 1).

**Гейт «миграции — только схема»:** новая миграция с `GRANT/REVOKE/CREATE POLICY/CREATE ROLE/
ALTER ROLE/ALTER DEFAULT PRIVILEGES` = красная сборка (PLAN.md Ф2). Двум движкам нельзя спорить за
один ACL — задокументированный wontfix dbt #6238 (evidence/07 §2б). Старые 377 не трогаются (§H).

### Судьба 61 оверлея `deploy/postgres/*.sql` (посчитано: 61 файл)

| Класс | Примеры | Судьба |
|---|---|---|
| Чистые права/политики | `p0-5b-grants.sql`, `d3-4-…`, `phase4-locked-helper-rls-policies.sql`, `phase4-force-rls-cutover.sql`, `dev-c4…c10`, `s5`, `u9a`, `d2`, `d15b4` | **поглощаются декларацией** (генерат), файлы удаляются |
| Роли/логины | `p0-5b-role-split-staff-patient.sql`, `dev-c0-runtime-logins.sql` | **поглощаются `roles-install`** (декларация + env-маппинг §A.1) |
| Смешанные: definer-тела + их ACL + сверки | `c5a`, `c4`, `integrator-server-runtime-config.sql`, `organization-member-invites-rls.sql`, `specialist-*`, `patient-*`, `public-*`, `reference-catalog-rls.sql`, `saas-*`, `store-*`, `e1-*` | **расщепляются**: тела функций → миграции (схема); ACL/политики/exact-wall-блоки → декларация (сверку берёт §F) |
| Параметризованный рантайм-шаг | `p2-b` — HMAC-секрет подписи принципала подаётся psql-переменной при применении (`p2-b:80-92,150-157`; `deploy-test-saas.sh:471-479`; стенд `verify-a1-rls-conformance.mjs:411-419`) | **остаётся отдельным деплой-шагом вне миграций и вне генератора**: статическая миграция секрет нести не может, генератор несёт только права. Тела definer-функций → миграции; их ACL/владелец → декларация; за файлом остаются объекты секрета и его засев |
| Онлайн-индексы | `c4d-…`, `d30-…` | остаются как есть (не права) |
| Данные/фикстуры | `p0-data-fix-…`, `test-settings-override.sql`, `test-saas-isolation-telemetry-fixtures.sql`, `dev-c2-dev-bypass-fixture.sql` | остаются (данные, не права) |
| Шаги стены | `wall-install` (§B шаг 3, несёт §D+§E) + `sync-org-allowlist` (§B шаг 4) | два новых идемпотентных деплой-шага (не «разовые файлы») |

**Стенд a1 (изменение Ф5):** сегодня рига проигрывает четыре оверлея
(`verify-a1-rls-conformance.mjs:405-429`: p0-5b-role-split, p2-b, p0-5b-grants,
phase4-locked-helper-rls-policies) и держит захардкоженные списки ролей (`:31,:37` — ровно класс
поломок FACTS §3 №1-2). В целевой схеме: роли — рендер `roles-install` из декларации
(хардкод-списки удаляются — второй источник истины закрыт); `p0-5b-grants` +
`phase4-locked-helper-rls-policies` заменяет генерат; `p2-b` остаётся параметризованным шагом.
«Один файл вместо четырёх» — неверно: генерат заменяет ДВА из четырёх. Одна дорожка для CI, TEST
и будущего прода.

Правило классификации: только GRANT/REVOKE/политики/роли → классы 1-2; CREATE FUNCTION/TABLE
вперемешку с ACL → расщепить; требует значения из env при применении → параметризованный шаг;
индексы/данные — как есть. Таблица выше — образцы, НЕ полная перепись: `p0-5-role-split`,
`p2-c1/c2/c3`, `smoke-reference-catalog-*`, `test-owner-ready-locked-matrix`,
`test-strict-rls-finalizer`, `test-patient-identity-capability-gate`, `u5a-*`,
`platform-owner-identity-pin`, `runtime-overlay-app-owner-handoff`, `dev-c1/c3` не
классифицированы. **Исчерпывающая пофайловая классификация всех 61 — обязательный артефакт Ф2.**

**Конечное состояние: в `deploy/postgres/` права существуют только в `generated/privileges.sql`;
итог — порядка десятка файлов вместо 61.** Точное число — ВЫХОД классификации Ф2, не угаданный
потолок (минимум: генерат 1 + wall-install 1 + sync 1 + p2-b 1 + индексы 2 + данные/фикстуры 4;
судьбу неклассифицированных решает Ф2).

## C. Модель владения

| Что | Кто | Основание |
|---|---|---|
| Таблицы | мигратор-роль (логин из env; в стенде — `bcb_a0_owner`) — по умолчанию; перечисленные исключения владения — поле `owner` декларации (§A.4): `saas_isolation_*` владеет `saas_telemetry_owner` (`saas-isolation-telemetry.sql:75-77`), три таблицы шва `app.context_signing_secrets/principal_context/context_nonce_ledger` — `app_owner` (ассерт шва: `deploy-test-saas.sh:909-913`) | так уже есть: drizzle применяет DDL под этим логином (`scripts/migrate-all.sh`); FORCE RLS удерживает и владельца — потому FORCE несущий и остаётся |
| SECURITY DEFINER функции | `app_owner` — NOLOGIN + BYPASSRLS (объявлен, §A п.1), **ноль членов** вне окна миграций | канон уже в коде: `verify-a1-rls-conformance.mjs:300-315,444-449,466-474` (окно `open/close_migration_window`, постпроверка нуля членов), `c5a:43` (`ALTER FUNCTION … OWNER TO app_owner`) |
| Event trigger | суперпользователь `postgres` | владеть event trigger может только суперпользователь — доказано, evidence/12 §6 |
| Миграции запускает | мигратор-логин через `scripts/migrate-all.sh` с временным членством в `app_owner` и временным BYPASSRLS (скобка `:3092-3101`) | `deploy-test-saas.sh:134-166`; миграции с 0295 переносят владение функций на `app_owner` (`verify-a1:300-313`); FACTS §3 (поломка №6 и её починка) |
| Генератор применяет | админ-канал деплоя (`runtime_overlay_admin_psql`, sudo-postgres) | ему нужны ALTER ROLE/OWNER на чужие объекты; тот же канал, что и оверлеи сегодня (`runtime-overlay-rehydrate-lib.sh:113`) |

Ни одна рантайм-роль не владеет ничем и не имеет `BYPASSRLS/SUPERUSER/CREATEROLE`. Стенд сегодня
проверяет ЧАСТЬ: `rolbypassrls/rolsuper/rolinherit` и членства (`verify-a1:457-486`); CREATEROLE
и владение рантайм-ролями не проверяет никто. В целевой схеме всё это — строки декларации,
сверяемые §F (включая недостающие классы).

## D. Deny-by-default — идемпотентная часть шага `wall-install` (каждый деплой)

НЕ «разовый бутстрап»: restore пересоздаёт базу и стирает всё перечисленное ниже (§B) — поэтому
применяется каждым деплоем, идемпотентно. Механика доказана: после этой настройки новая таблица
рождается закрытой, рантайм-роль получает 42501 без дальнейших действий (evidence/12 §1-2).

Схемы этой базы: `public`, `app`, `app_ext`, `integrator`, `drizzle`, `app_control`
(FACTS §1.1 — `integrator`; `verify-a1-rls-conformance.mjs` — `app`, `drizzle`; `app_ext` —
p2-b:94; `app_control` создаёт сам wall-install, §B шаг 3).

1. `REVOKE ALL ON DATABASE <db> FROM PUBLIC;` затем `GRANT CONNECT` только логинам из
   env-маппинга (PUBLIC CONNECT/TEMPORARY — неявный дефолт, evidence/12 §1).
2. `REVOKE ALL ON SCHEMA public, app, app_ext, integrator, drizzle, app_control FROM PUBLIC;`
   затем `GRANT USAGE` по-ролево (`app_control` закрыт от рантайм-ролей); `CREATE` — владельцам (§C).
3. **Закрытый список создающих ролей** — раздел `creators` (§A.8; defaults живут
   по-создающей-роли, членство их НЕ наследует — evidence/12 §3b). На каждого:
   `ALTER DEFAULT PRIVILEGES FOR ROLE <r> REVOKE ALL ON TABLES/SEQUENCES/FUNCTIONS/TYPES FROM PUBLIC;`
   — особенно FUNCTIONS/TYPES, где дефолт PUBLIC EXECUTE/USAGE (evidence/12 §1). Создателей,
   добавленных позже, закрывает и генератор — те же статьи в каждом генерате (§B).
4. Никаких «положительных» default privileges не заводим вовсе: права на новые объекты выдаёт
   только генератор при следующем деплое. Посхемный REVOKE не вычитает глобальный грант
   (evidence/12 §3d) — ещё одна причина не держать положительных дефолтов.
5. **Снятие уже МАТЕРИАЛИЗОВАННОГО `PUBLIC EXECUTE`**: пп.3-4 меняют только дефолты для будущих
   объектов (evidence/12 §3a: дефолт не трогает уже созданное). Шаг перечисляет все функции схем
   `app/public/app_ext/integrator` и выполняет `REVOKE ALL ON FUNCTION … FROM PUBLIC` на каждой;
   definer-исключения (§A.7) и явно выданные функции (§A.5) тут же получают объявленный ACL.

До первого применения на живой базе снимается перепись фактических прав (машинерия §F) — чтобы
«красный» шаг приёмки был воспроизводим и ничего живого не отвалилось молча.

## E. Event trigger — стена в точке рождения

Адаптация доказанного прототипа (evidence/12 §4-6, рабочий код там же):

- **Схемы под надзором:** `public`, `app`, `integrator` (прикладные с таблицами; `drizzle` —
  журнал мигратора, `app_ext` — extension-шов, `app_control` — сама стена: org-таблиц там нет,
  что караулит свип §G.1 фильтром схем).
- **Признак org-таблицы:** колонка `organization_id` (`attnum > 0`, не dropped) — предикат
  прототипа (evidence/12 §4) и определение FACTS §1.3.
- **Теги:** `CREATE TABLE`, `CREATE TABLE AS`, **`ALTER TABLE`** — поздняя org-колонка ловится,
  без тега ALTER дыра (evidence/12 §6, оговорка В0.2).
- **Два режима — стационар и фаза миграций; переключает не человек, а сама цепочка деплоя.**
  Решаемая проблема: allowlist ФИНАЛЬНОГО состояния против ИСТОРИИ миграций. Доказанный
  транзиент: `be_product_purchases` — создана миграцией 0095 с `organization_id`
  (`0095_booking_stage7_products.sql:60,91`), удалена 0298 (`0298_drop_…_local.sql:10`): свежая
  среда, проигрывая хвост, легально создаёт таблицу, которой в финальной декларации НЕТ —
  жёсткий reject дал бы ложный красный. Туда же: переименования посреди хвоста; упавший деплой,
  оставивший живую необъявленную таблицу, отвергающую дальше легальные ALTER.
  - **Стационар (по умолчанию, fail-closed): reject.** Org-таблица не в allowlist →
    `RAISE … ERRCODE '42501'`, DDL откатывается (доказано `to_regclass = NULL`, evidence/12 §5).
    Принцип 2: «громкий 42501 на dev, никогда не тихая утечка» (PLAN.md).
  - **Фаза миграций: не отвергать, но СТАВИТЬ СТЕНУ и ПИСАТЬ ЖУРНАЛ.** Фазу помечает ТА ЖЕ
    скобка элевации цепочки, что окружает `pnpm migrate` (временное членство + BYPASSRLS,
    `deploy-test-saas.sh:3092-3101`, снятие в `cleanup_elevation`): членство мигратор-логина в
    маркер-роли `app_migration_phase` (NOLOGIN, создаёт wall-install), проверка триггера —
    `pg_has_role(session_user, …, 'MEMBER')`. В фазе триггер НЕ отвергает необъявленную
    org-таблицу, но ставит ей `ENABLE+FORCE ROW LEVEL SECURITY` и пишет каждую org-DDL в
    `app_control.ddl_wall_log`. Fail-closed смещается в конец деплоя, где финал ИЗВЕСТЕН:
    генерат + §F (§B шаги 6-7) красят деплой, если пережившая migrate таблица не объявлена;
    транзиент, умерший внутри хвоста, никого не красит. **Ничего не забываемо человеком:**
    маркер ставит и снимает код цепочки; нет маркера → триггер отвергает (fail-closed);
    остаточное членство после падения ловит §F (членства маркер-роли объявлены пустыми в
    стационаре) — довод тот же, что для остаточного BYPASSRLS (§B шаг 5). Механика маркера —
    требует прогона в Ф3. Политика транзиентов — развилка владельца №7 (§I).
- Для объявленных org-таблиц триггер тут же ставит `ENABLE`+`FORCE ROW LEVEL SECURITY` — таблица
  рождается за стеной ещё до прихода политик генератором (RLS без политик = deny-all для
  не-владельца); механика доказана (evidence/12 §4).
- **Защита от рекурсии — ровно как в доказанном прототипе:** собственные ALTER триггера снова
  зовут `ddl_command_end` (3 вызова на один CREATE TABLE, evidence/12 §4); обработчик завершает
  их, потому что ИДЕМПОТЕНТЕН — перед каждым `ALTER` перечитывает
  `relrowsecurity/relforcerowsecurity`, флаг стоит → no-op. Session-GUC «стена уже отработала»
  ЗАПРЕЩЁН: пережил бы обработчик и ГАСИЛ БЫ allowlist-проверку следующих DDL той же
  сессии/транзакции. Подавить reject рекурсия и без GUC не может: вложенный вызов видит в
  `pg_event_trigger_ddl_commands()` только СВОИ команды — ALTER по таблице, только что прошедшей
  allowlist. Всё сверх прототипа — требует прогона в Ф3.
- **Владелец — `postgres`** (только суперпользователь, evidence/12 §6); компрометация
  суперпользователя — вне этой стены, там же доказано. Честная граница доказанного: триггер
  СРАБОТАЛ на DDL суперпользователя (§6, лог `ephemeral_admin CREATE TABLE super_org`), но
  reject-ветка исполнялась только для НЕ-суперпользователя (§5, `owner_a`) — reject именно
  суперпользовательского DDL требует прогона в Ф3. Allowlist-таблица — в `app_control`, закрыта
  от рантайм-ролей; синхронизируется из декларации ДВАЖДЫ за деплой: добавления — шагом
  `sync-org-allowlist` ДО миграций, снятия — генератом ПОСЛЕ (§B шаги 4 и 6).
- CI-гейт `check-new-table-rls-coverage.mjs` (уже в CI — FACTS §2) остаётся страховкой на период
  внедрения; снимать ли его после включения reject — развилка №6 (§I), рекомендация: оставить оба.

## F. Двусторонняя сверка declared ↔ catalog

Расширение паттерна c5a — `(actual EXCEPT expected) UNION ALL (expected EXCEPT actual)`
(`c5a-platform-operations-runtime.sql:1340-1350,1713-1727`; это pg_permissions/CIS-паттерн,
evidence/07 §1) — с точечных exact-wall-блоков на **всю базу и все роли**.

**Ожидаемое состояние строит тот же генератор** из той же декларации (второй артефакт:
`generated/expected-state.json`) — одна власть над «ожидаемым». В ожидаемую сторону входят и
объекты стены: схема `app_control`, allowlist, маркер-роль (ноль членов в стационаре), триггер.

Покрываемые классы объектов (каждый — обе стороны EXCEPT):

| Класс | Каталог | Прецедент |
|---|---|---|
| table ACL | `pg_class.relacl` через `aclexplode(COALESCE(relacl, acldefault(…)))` | c5a:1297-1310 |
| column ACL | `pg_attribute.attacl` | c5a:1311-1319; без него табличная проверка врёт (FACTS §1.4) |
| function ACL + `prosecdef` + владелец | `pg_proc.proacl/prosecdef/proowner` (схемы вкл. `app_ext`) | c5a:1320-1336,1345 |
| политики, вкл. RESTRICTIVE, USING/WITH CHECK-текст | `pg_policies` | c5a:1719-1721; RESTRICTIVE меняет семантику — evidence/12 §10 |
| атрибуты ролей | `pg_roles`: `rolcanlogin/rolsuper/rolbypassrls/rolinherit/rolcreaterole/rolconfig` | `verify-a1-rls-conformance.mjs:457-461` (частично); pgTAP атрибуты не покрывает — писать самим (evidence/07 §3); ловит и остаточный BYPASSRLS мигратора после упавшего migrate (§B шаг 5) |
| членства с опциями | `pg_auth_members` (admin/inherit/set) | c5a:31; rig:462-486; вкл. пустоту маркер-роли §E |
| владельцы объектов | `relowner/proowner` | §C |
| schema ACL | `pg_namespace.nspacl` через `aclexplode(COALESCE(…, acldefault('n',…)))`, все шесть схем §D | §A.3; USAGE — первый рубеж 42501, evidence/12 §1 |
| database ACL (CONNECT/TEMP/CREATE) | `pg_database.datacl` | §A.3; PUBLIC CONNECT/TEMP — неявный дефолт, evidence/12 §1 |
| sequence ACL | `pg_class.relacl` при `relkind='S'` | §A.4 (правило USAGE) |
| type ACL | `pg_type.typacl` | §A.6; сегодня ожидаемая сторона пуста — ноль `CREATE TYPE` в миграциях |
| default privileges — обе стороны | `pg_default_acl` (`defaclrole/defaclobjtype/defaclacl`) | §B hardening + §G.7; evidence/12 §3 |
| view: ACL + `security_invoker` | `pg_class.relacl/reloptions` при `relkind='v'` | §A.5; §G.6; FACTS §4 (definer-view видит чужое) |

**Где бежит:** (1) CI — на одноразовом кластере a1 после полной цепочки §B; (2) деплой-постчек
на TEST — шаг 7 той же цепочки (слот нынешних постчеков `deploy-test-saas.sh:500-521`). Скрипт
один: `scripts/verify-db-privileges-conformance.mjs`. Env-независимая часть ожидаемого одна на
все среды; **login-уровень — ПО-ОКРУЖЕННАЯ часть сверки, и это ВСЕ классы записи логина §A.1**
(членство в терминале, атрибуты вкл. `NOINHERIT`, `rolconfig IS NULL` либо объявленное
исключение, CONNECT): ожидаемые строки рендерятся в момент проверки из декларации + env-маппинга.

**Красный:** ненулевое число строк в любом направлении; вывод печатает сами строки (`направление,
роль, объект, привилегия/политика`), `exit 1` — деплой падает. Приёмка Ф4: ручной `GRANT SELECT
ON … TO app_staff` мимо декларации обязан дать ровно одну строку `actual-not-declared`.

## G. Свип — 7 каталожных инвариантов

Один файл `scripts/db-privileges-sweep.sql`, каждый запрос обязан вернуть **0 строк**
(шаблон Splinter/GitLab — evidence/07 §3). Эскизы для этой базы:

```sql
-- 1. RLS на каждой org-таблице (красный сегодня: 5 таблиц FACTS §1.3)
SELECT c.oid::regclass FROM pg_class c
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='organization_id'
  AND a.attnum>0 AND NOT a.attisdropped
WHERE c.relkind IN ('r','p')
  AND c.relnamespace::regnamespace::text IN ('public','app','app_ext','integrator','app_control')
  AND NOT c.relrowsecurity;
-- 2. FORCE там же (тот же запрос с NOT c.relforcerowsecurity)
-- 3. нет RLS-таблиц без единой политики
SELECT c.oid::regclass FROM pg_class c WHERE c.relrowsecurity
  AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid);
-- 4. нет политик TO PUBLIC и грантов PUBLIC на прикладных объектах
SELECT polrelid::regclass, polname FROM pg_policy WHERE polroles = ARRAY[0]::oid[];
SELECT c.oid::regclass FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) x
WHERE x.grantee=0
  AND c.relnamespace::regnamespace::text IN ('public','app','app_ext','integrator','app_control');
-- 5. нет неожиданного BYPASSRLS/SUPERUSER. Allowlist: postgres и app_owner — объявленный
--    definer-шов (§A п.1; deploy-test-saas.sh:907). Красный и на BYPASSRLS мигратора,
--    забытом упавшим migrate (§B шаг 5)
SELECT rolname FROM pg_roles WHERE (rolbypassrls OR rolsuper)
  AND rolname NOT IN ('postgres', 'app_owner');
-- 6. представления — только security_invoker, обе формы записи true|on
--    (definer-представление видит чужое: FACTS §4, замер Sol)
SELECT c.oid::regclass FROM pg_class c WHERE c.relkind='v'
  AND c.relnamespace::regnamespace::text IN ('public','app','app_ext','integrator','app_control')
  AND NOT EXISTS (SELECT 1 FROM unnest(c.reloptions) o
                  WHERE o IN ('security_invoker=true','security_invoker=on'));
-- 7. ноль положительных default-грантов кому бы то ни было, кроме создателя о себе: декларация
--    дефолтов не заводит (§D.4) — ЛЮБАЯ чужая positive-запись красна. Фильтра по имени НЕТ:
--    LIKE 'app\_%' пропускал бы грантополучателей bcb_test_*/saas_*
SELECT d.defaclrole::regrole, d.defaclobjtype, a.grantee::regrole
FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
WHERE a.grantee <> d.defaclrole;
```

Свип — страховка движка, не основной механизм (принцип 4): в норме вечно зелёный, красный = ЧП.
Бежит вместе со сверкой §F (CI + деплой-постчек, §B шаг 7). Стенд a1 остаётся поведенческим
доказательством сквозь реальный код (FACTS §3) и добирает 5 дыр по Ф5 — свип его не заменяет.

## H. Путь миграции от сегодняшнего состояния

Каждый шаг — красный→зелёный→снова-красный (PLAN.md «Правило приёмки»). Применённые миграции НЕ
переписываются: журнал drizzle — watermark по `created_at`, переписывание истории ломает мигратор.

1. **Перепись** живого каталога TEST → черновик декларации (снятое состояние минус дефекты
   FACTS §1.2-1.4). Машинерия переписи = §F наоборот. *(красный: сверка против пустой декларации.)*
2. **Генератор + сверка §F на одноразовом кластере** (инфраструктура a1), полная цепочка §B.
   Зелёный = каталог после цепочки побайтно сходится с декларацией в обе стороны.
3. **CI-гейты:** (а) новая миграция содержит GRANT/REVOKE/CREATE POLICY/CREATE ROLE → красный;
   (б) `generated/privileges.sql` разошёлся с декларацией → красный.
4. **`wall-install` + event trigger §E** — сначала одноразовый кластер и a1 (с механикой фазы
   миграций — прогоны Ф3), на TEST — только по команде владельца (деплой остановлен — FACTS §11).
   Вставка в оба пути деплоя — §B «оба пути — одна реализация».
5. **Первое применение генерата на TEST = Ф6:** дефекты закрываются приведением реальности к
   декларации, не заплатками: 5 таблиц без RLS+FORCE (§1.3), 7 ячеек утечки (§1.2),
   `platform_users` (§1.4 — после развилки №1). Доказательство — свип зелёный + обход 1892 ячеек
   `(роль × таблица × принципал)` ноль чужих строк (FACTS §6) + стенд PASS.
6. **Оверлеи:** расщепление по таблице §B; каждый удаляемый файл — отдельный коммит с тремя
   транскриптами (отсутствие компенсировано генератом — сверка зелёная без него).
7. **Baseline-сжатие 377 миграций (~160 с правами — PLAN.md Ф1):** протокол Django (сжать →
   старые файлы сохранить → выпустить → дождаться → архивировать, evidence/07 §2) переложен на
   НАШ мигратор честно — drizzle применяет по watermark `created_at`, не по хэшу. Условие
   архивации: у ВСЕХ живых баз `max(created_at)` журнала `drizzle.__drizzle_migrations` ≥
   `created_at` последней пред-сжатия миграции — всё сжимаемое уже проиграно. **Сжатый baseline
   НИКОГДА не попадает в журнал drizzle**: это слепок для свежих сред (механика a0 уже есть:
   `scripts/a0-greenfield-baseline-lib.mjs`), несущий и журнал, снятый на точке сжатия, — как
   a0-слепок, после которого стенд проигрывает только хвост (FACTS §3); watermark свежей базы
   сразу стоит ЗА точкой сжатия. GRANT-статьи в исторических миграциях остаются (история), но
   носителем истины быть перестают: генератор полностью переприменяет ACL поверх (§B). Сжатие
   заодно ХОРОНИТ исторические транзиенты (класс `be_product_purchases`, §E). Приёмочный тест:
   старый и сжатый пути в контейнерах, сравнение `information_schema.role_table_grants` +
   `pg_policies` (evidence/07 §2).

Порядок важен: шаги 1-3 не трогают TEST (одноразовые кластеры); «включение» стен на TEST (4-5) —
один owner-gate, дальше сопровождение только через декларацию.

## I. Вне рамок и развилки владельца

**Вне рамок схемы:** Result-типизация порта и 177 мест гашения (evidence/07 §4); отгрузка
журнала/алертинг 42501; угадывание роли в Node (`withClient.ts:56-66`, FACTS §1.1) — своя работа
Ф6; `pgEmailSetupFlowPort`, гасящий 42501 в `reason:'user_not_found'` (FACTS §11.7), — код-фикс
Ф6, не механизм схемы; клиентский код; прод (не трогается — отдельное решение владельца).

**Развилки (дополняю рекомендациями к листу PLAN.md):**

1. **`platform_users` RLS — сейчас.** Единственная стена на 278 строк ПДн; `app_staff` без
   принципала читает всё (FACTS §1.4). Схема уже несёт строку декларации; откладывание — вечная
   пометка `rls: 'off'` на самой чувствительной таблице.
2. **7 ячеек утечки — сузить `app_platform_settings`.** 5/7 — биллинг под GLOBAL-ролью
   (FACTS §1.2); платформа читает членства через definer-исключение, не табличный SELECT
   (образец — c5a:1293-1355). Политики поверх GLOBAL-роли — второй механизм там, где хватает ACL.
3. **Свой генератор, не Atlas Pro.** Atlas покрывает поверхность (evidence/07 §1), но:
   $9/место/мес + облачная авторизация; event trigger не ведёт (нет и у pgschema); сверка обязана
   строиться из ТОЙ ЖЕ декларации, что генерат (§F), иначе две власти; c5a-паттерн и Node-обвязка
   уже в репозитории. Генератор — ~сотни строк поверх доказанных механик (evidence/12 §8).
4. **Приёмка этой схемы (Ч1.3)** — продуктовое решение владельца.
5. **BYPASSRLS у `app_owner`: оставить-и-объявить или снимать.** Рекомендация — оставить и
   объявить (соответствует живым ассертам деплоя: `deploy-test-saas.sh:907`, `deploy-test.sh:174`;
   перевод 19 definer-аксессоров на BYPASSRLS-владельца сам деплой уже зовёт изменением модели
   безопасности — `deploy-test-saas.sh:1383-1387`). Снятие — отдельный анализ, схема его не
   проектирует.
6. **`check-new-table-rls-coverage.mjs` после включения reject-режима §E.** Рекомендация —
   оставить оба (CI-гейт ловит на диффе кода, стена — на исполнении); замена — решение владельца.
7. **Политика транзиентных org-таблиц (§E, класс `be_product_purchases`).** Рекомендация —
   терпеть через фазу миграций (соответствует случившейся истории 0095→0298; таблица в фазе всё
   равно рождается за стеной и попадает в журнал). Альтернатива — запретить транзиентные
   org-таблицы в будущих миграциях (жёстче, но красит легальную историю).
8. **Провижининг логинов — в контуре декларации или вне.** Рекомендация — В контуре (env-маппинг
   §A.1, `roles-install` применяет, §F сверяет). Альтернатива — per-env runbook вне схемы: тогда
   истина уровня логина (класс дефекта FACTS §9.6 — login-level `search_path`) снова живёт в
   двух местах, и §F её не караулит.

---

*Непротиворечие FACTS §9: definer-функции — перечисленные исключения, не норма (§9.4); отказ прав
остаётся 42501 от движка, «всегда бросать» не вводится (§9.2); все проверки — каталог и
исполнение, ни AST (§9.3), ни EXPLAIN (§4); FORCE RLS сохраняется на всех org-таблицах (свип §G.2
караулит; фаза миграций §E ставит FORCE даже необъявленным); стенд a1 остаётся поведенческим
доказательством (§3); watermark-журнал мигратора не переписывается (§H).*

---

## Changelog Ч1.2 → Ч1.2-r2 (по находкам критика №2)

- **B-1** → §B «Место в конвейере», §D: «разовый бутстрап» упразднён — restore стирает
  per-database стену (`deploy-test-saas.sh:49,:3083-3084`); wall-install/roles-install —
  идемпотентные шаги КАЖДОГО деплоя (паттерн rehydrate-lib:65); цепочка 7 шагов; greenfield/a1
  и code-only путь покрыты явно.
- **M-1** → §B шаг 1 + «Стенд a1»: pre-migrate `roles-install` из декларации + env-маппинга;
  закрывает `deploy-test-saas.sh:141-146` и FACTS §3 №1-2; хардкод-списки риги
  (`verify-a1:31,:37,:263-281`) заменяются рендером — изменение Ф5.
- **M-2** → §E «Два режима», §H.7: фазу миграций помечает скобка элевации цепочки (`:3092-3101`),
  маркер-роль, fail-closed без маркера; в фазе — RLS+FORCE+журнал вместо reject; финальный гейт —
  генерат+§F; транзиент `0095:60`→`0298:10` доказан; маркер — «требует прогона в Ф3»; развилка №7.
- **M-3** → §B шаги 4/6, §E (конец): одно поведение в обоих местах — sync до миграций ТОЛЬКО
  добавляет/обновляет, снятия делает генерат после.
- **M-4** → §A п.3, §D, §F, §G: `app_ext` (p2-b:94,107,129,189,231) — в переписи схем,
  REVOKE-списке, перечислении функций, сверке и трёх фильтрах свипа; `app_control` создаёт
  wall-install, включён в перепись/сверку.
- **M-5** → §A.1, §F: маппинг = полная запись логина (пароль-ссылка, атрибуты с `NOT rolinherit`
  `verify-a1:460-461`, rolconfig NULL `dev-c0-runtime-logins.sql:136`/FACTS §9.6, VALID UNTIL,
  членства, CONNECT); едят roles-install и §F; развилка №8.
- **M-6** → «Стенд a1»: «тот же файл вместо четырёх оверлеев» исправлено — генерат заменяет 2 из 4
  (`p0-5b-grants`, `phase4-…-policies`), роли — roles-install, `p2-b` — шаг (`verify-a1:405-429`).
- **m1** → §B шаг 5, §F, §G №5: скобка `ALTER ROLE $DBROLE BYPASSRLS` (`:3098`) названа;
  NOBYPASSRLS мигратора пиновится; остаток после падения ловят §F и свип №5.
- **m2** → §E «Владелец»: evidence/12 §6 доказал срабатывание на суперпользователе; reject
  исполнялся только для не-суперпользователя — superuser-reject «требует прогона в Ф3».
- **m3** → §G №7: `LIKE 'app\_%'` снят — красна любая чужая positive-запись (§D.4).
- **m4** → §G: 7 инвариантов — согласовано с PLAN Ф5.
- **m5** → §B «Конечное состояние»: «≤12» → «порядка десятка; точное число — выход Ф2».
- **m6** → §A п.6, §B, §F: раздел types + строка type-ACL (`pg_type.typacl`); ноль `CREATE TYPE`
  в 378 миграциях (посчитано) — раздел стартует пустым.
- **m7** → §B «Оба пути»: code-only `deploy-test.sh` — шаги 1/3/4 перед его `pnpm migrate`
  (`:183`), шаги 6-7 в closure-подрежиме (`:197` → `deploy-test-saas.sh:2958-2963,:2685`).
- **Развилки** → §I: добавлены №7 (транзиенты) и №8 (логины в контуре); №1-6 сохранены.
