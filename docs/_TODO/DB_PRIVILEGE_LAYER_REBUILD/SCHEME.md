# SCHEME — целевая схема слоя прав БД BersonCareBot

Черновик Ч1.2-r5 — ревизия после адверсарного критика №5 + решения владельца 08.08. Реализует
четыре принятых принципа (PLAN.md «Целевая архитектура»). Каждое решение несёт ссылку на
FACTS.md, evidence/ или код (`файл:строка`). Ничего из §9 FACTS (capability-only, «всегда
бросать», AST, EXPLAIN) схема не использует.

---

## A. Декларация — один типизированный файл

**Решение:** одна декларация `deploy/postgres/privileges/declaration.ts` + типы `schema.ts`.
Почему TypeScript, а не YAML/HCL: репозиторий — TS-монорепо, инструментарий прав уже на Node
(`scripts/verify-a1-rls-conformance.mjs`, `scripts/a0-greenfield-baseline-lib.mjs`); типы дают
проверку имён ролей, областей и привилегий компилятором до всякого SQL. Паттерн «желаемое
состояние в данных, сверяемое с каталогом» — pg_permissions/CIS (evidence/07 §1); формат носителя
там не нормирован (pgbedrock — YAML, Atlas — HCL) — выбираем то, что дешевле сопровождать здесь.

**Скоупинг: КЛАСТЕР и БАЗЫ — раздельные уровни; юрисдикция = ДОСТУП к управляемым базам, а не
существование на кластере.** Несущий факт: `bersoncarebot_test` и `bcb_webapp_dev` живут в ОДНОМ
PG16 на `:5432` (SERVER CONVENTIONS.md:124; `migrate-all.sh:84,:91` пиновит оба таргета к
`151.241.228.122`; `migrate-dev.sh:265` бьёт в `PGPORT=5432`), а роли и логины в Postgres —
кластерные: per-database декларация ролей структурно врёт — TEST-сверка перечислила бы dev-логины
как «необъявленные» (ложный красный), а фильтр по именам вернул бы неохраняемые роли. При этом
кластер РАЗДЕЛЯЕМЫЙ — перепись 08.08 (воспроизводимо:
`sudo -u postgres psql -Atc "SELECT datname FROM pg_database"` и
`… "SELECT rolname FROM pg_roles WHERE rolname NOT LIKE 'pg\_%'"`): **11 баз**, из них чужие
`secondbrain`, `storylama_dev/prod`, `trackd_login_audit_1785715424`, `scratch_migrate_debug` и
`bcb_webapp_prod` — старая копия прода (владелец 08.08: «копия явно»; вне контура, привилегий
объявленных ролей на ней быть не должно, чистка возможна, но НЕ заказана); **45 не-pg ролей**, из
них чужие `brain`/`brain_ro`/`code_search_ro`/`storylama_*`/`tgcarebot` и эфемерные
`pbt_tpl_<timestamp>`. Сверка кластерных классов «против объединения объявленных env» на таком
кластере красна ПО ПОСТРОЕНИЮ, фильтр по именам запрещён (см. выше), ручной ignore-list забываем
человеком. Поэтому граница юрисдикции — механическая: под сверкой роли, которые ОБЪЯВЛЕНЫ, либо
ИМЕЮТ хоть один путь доступа к управляемой базе (точные пути — §F). Чужая роль без доступа к
нашим базам — вне юрисдикции: приходит и уходит (эфемерные `pbt_tpl_*`), не трогая наш зелёный.
Остаточный риск со-жительства — принят и записан в §I.

Раздел `cluster` декларации владеет каноническими ролями и логинами всех управляемых env кластера
(login-set каждого env перечислен, §A.1), разделы `databases.<db>` — per-database истиной (схемы,
таблицы, гранты, политики, функции, типы, definer-исключения, creators, orgTableAllowlist). Один
файл управляет обеими базами; dev-база — в контуре сразу (решение владельца 08.08, §I Р1).

Декларация содержит девять разделов (всё, чем управляет генератор, — и ничего больше);
разделы 1-2 — уровень `cluster`, разделы 3-9 — уровень `databases.<db>`:

1. **roles** — все канонические роли; kind — закрытая грамматика `terminal | capability | owner |
   service` (`service` — инфраструктурные кластерные роли схемы: маркер-роль `app_migration_phase`
   §E — NOLOGIN, ноль членов в стационаре); атрибуты
   (`login/superuser/bypassrls/inherit/createrole/rolconfig`), членства с опциями
   (`ADMIN/INHERIT/SET`, как в `c5a-platform-operations-runtime.sql:31`). С `bypassrls: true`
   объявляются ДВЕ роли, обе с обоснованием: `app_owner` — NOLOGIN definer-шов, деплой жёстко
   ассертит `rolbypassrls` (`deploy-test-saas.sh:907`, `deploy-test.sh:174`); и
   `saas_system_health_owner` — NOLOGIN definer-владелец health-агрегации: живая цепочка ставит
   ему BYPASSRLS (`saas-system-health-diagnostics.sql:166-173`, исполняется
   `deploy-test-saas.sh:75,:732,:2832`), при этом комментарий `dev-c3-app-function-owners.sql:205`
   зовёт ТУ ЖЕ кластерную роль «NOT BYPASSRLS» — атрибут dev-c3 не пишет, спора записей нет, но
   документация противоречит живому атрибуту; декларация закрывает класс одной строкой.
   Оба — оставить-и-объявить: решения §I Р5 и Р9.
2. **scopes** — область на роль, `ORG | OWN | GLOBAL | NONE` — ровно те «11 строк», которых
   требует FACTS §1.5 (без объявленной области `app_patient` даёт 65 ложных «тихих нулей»).
   Потребитель поля — явный (тот же класс привязки, что `rls`/`owner`): обход 1892 ячеек §H.5
   рендерит ОЖИДАЕМУЮ видимость каждой ячейки `(роль × таблица × принципал)` из этого раздела.
3. **schemas + database** — по каждой схеме (`public/app/app_ext/integrator/drizzle/app_control`;
   `app_ext` — живая схема pgcrypto-шва: создаётся и используется p2-b,
   `p2-b-protected-principal-context.sql:94,107,129,189,231` — definer-функции зовут
   `app_ext.hmac`): `USAGE/CREATE` по-ролево; по базе `CONNECT` — привязан к логинам, рендер с
   env-маппингом (§A.1). Схемный `USAGE` — первый рубеж 42501 (evidence/12 §1). Множество схем —
   тоже истина декларации, сверяемая в обе стороны (§F).
4. **tables** — на таблицу: владелец, признак `org` (несёт `organization_id`), режим RLS —
   закрытая грамматика **`rls: 'force' | 'on' | 'off'`** (`'force'` — RLS+FORCE, обязателен для
   org-таблиц; `'on'` — RLS без FORCE, допустим только со строкой-обоснованием; `'off'` — явно
   объявленное отсутствие RLS, а не молчание), гранты по ролям **включая колоночные** (живой
   механизм: `app_patient` держит `UPDATE(calendar_timezone, reminder_muted_until)` на
   `platform_users`, FACTS §1.4; громкий 42501 на невыданной колонке доказан, evidence/12 §7),
   политики (имя, PERMISSIVE/RESTRICTIVE, команда, роли, USING, WITH CHECK — композиция И/ИЛИ
   доказана, evidence/12 §10). Правило для последовательностей: роль с `INSERT/UPDATE` на таблице
   получает `USAGE` на её последовательностях (serial-DEFAULT требует USAGE; необходимость для
   identity-последовательностей — требует прогона в Ф3); исключения — явными sequence-записями.
   У каждого гранта есть поле `grantable` (`WITH GRANT OPTION`), по умолчанию `false` — и это
   дефолтное `false` ВХОДИТ в ожидаемую сторону сверки: c5a уже сравнивает `is_grantable`
   (`c5a:1300`), общая сверка §F делает то же по всем ACL-классам.
5. **functions / views** — явные ACL не-definer функций и представлений: по умолчанию ничего
   (шаг wall-install §D снимает и дефолт, и уже материализованный `PUBLIC EXECUTE`), EXECUTE —
   только перечисленным здесь; представления — обязательный `security_invoker` (§G.6).
6. **types** — явные `USAGE`-гранты по пользовательским типам. Сегодня раздел пуст: в 377
   `.sql`-файлах `apps/webapp/db/drizzle-migrations/` (плюс каталог `meta/`) ноль `CREATE TYPE`
   (посчитано grep'ом), но дефолт `PUBLIC USAGE` на типах существует (evidence/12 §1), hardening
   §D его закрывает — раздел заведён, чтобы первый будущий тип был объявлен, а не унаследовал дефолт.
7. **definerExceptions** — SECURITY DEFINER функции как ПЕРЕЧИСЛЕННЫЕ исключения, каждая со
   строкой-обоснованием, владельцем и точным ACL (capability-only как норма отвергнута —
   FACTS §9.4, evidence/07 §5; definer — «аудируемое исключение», evidence/07 §5 «защитимая
   середина»). Этот же список ест CI-сканер красного списка миграций (§B).
8. **creators** — закрытый список создающих ролей (`postgres`, мигратор-логин, `app_owner`,
   `saas_telemetry_owner`, `saas_system_health_owner`; состав фиксирует перепись Ф2): defaults
   живут по-создающей-роли, членством не наследуются (evidence/12 §3b) — список едят
   wall-install §D.3 и default-hardening генератора §B.
9. **orgTableAllowlist** — выводится из `tables[*].org == true`; это же множество ест event
   trigger (§E) — отдельного списка нет, одна власть (принцип 1).

### A.1 Привязка к окружению — per-env маппинг логинов (истина уровня логина)

Логины — единственная env-зависимая часть (стенд: `app_runtime_staff_login`, TEST: `bcb_test_*` —
`scripts/verify-a1-rls-conformance.mjs:21-22`; мигратор-логин обнаруживается из env —
`deploy-test-saas.sh:546-548,640`). Они живут НЕ в теле декларации, а в per-env маппинге
`deploy/postgres/privileges/env/<env>.json`; раздел `cluster` декларации ПЕРЕЧИСЛЯЕТ управляемые
env этого кластера (TEST и dev — один кластер, см. §A выше), так что множество всех легитимных
логинов кластера = объединение объявленных env-маппингов — это ОБЪЯВЛЕННАЯ сторона кластерной
сверки §F (вторая сторона — по доступу, юрисдикция §A). Маппинг — не пары имён, а полная запись
логина (иначе истина уровня логина бездомна и живёт в `dev-c0-runtime-logins.sql` + головах):

- **имя логина → каноническая роль** (членство с опциями);
- **источник пароля** — ссылка на env-секрет (имя переменной), НИКОГДА не литерал;
- **атрибуты — все пиновятся**: `LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEROLE`
  (стенд уже ассертит `NOT rolinherit` у логинов — `verify-a1-rls-conformance.mjs:460-461`);
- **rolconfig — по умолчанию `NULL`**, исключения объявляются явно (класс дефекта —
  login-уровневый `search_path`, FACTS §9.6; ассерт сегодня — `dev-c0-runtime-logins.sql:136`);
- **VALID UNTIL / connection limit** — пиновятся (дефолт: не заданы); **CONNECT** на базу.

Маппинг едят два потребителя: шаг `roles-install` (§B шаг 1) — создание/приведение логинов, и
сверка §F — рендер ожидаемых per-env строк по ВСЕМ этим классам. Login-специфичные статьи
генератор рендерит В МОМЕНТ ПРИМЕНЕНИЯ из декларации + маппинга; рендер не коммитится.
Провижининг логинов — в контуре декларации (решение §I Р8).

### Живой образец (2 роли-терминала + 1 платформенная; 3 реальные таблицы)

```ts
export const declaration: PrivilegeDeclaration = {
  // скоупинг §A: roles — уровень cluster; tables/definerExceptions — databases.<db> (тут плоско)
  roles: {
    app_staff:             { kind: 'terminal', scope: 'ORG', login: false, bypassrls: false },
    app_patient:           { kind: 'terminal', scope: 'OWN', login: false, bypassrls: false },
    app_platform_settings: { kind: 'terminal', scope: 'GLOBAL', login: false, bypassrls: false },
    app_clinic_billing:    { kind: 'capability', scope: 'ORG',
                             grantedTo: [{ role: 'app_staff', admin: false, inherit: false, set: true }] },
    app_owner:             { kind: 'owner', scope: 'NONE', members: [],   // ноль членов вне окна миграций
                             bypassrls: true },  // definer-шов; ассерт deploy-test-saas.sh:907; решение §I Р5
    app_migration_phase:   { kind: 'service', scope: 'NONE', login: false,
                             members: [] },      // маркер фазы миграций §E; ноль членов в стационаре
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
    'public.platform_users': {          // решение §I Р3: RLS сейчас; сегодня выключен (FACTS §1.4), закрывает Ф6
      org: false, rls: 'force', owner: 'migrator',
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

**Вход** — декларация; **выход №1** — детерминированный закоммиченный
`deploy/postgres/generated/privileges.<db>.sql` (по файлу на управляемую базу — скоупинг §A):
вся env-НЕзависимая истина (роли и членства канонических ролей — кластерная часть, схемные,
табличные, колоночные, sequence-, type-, function- и view-гранты, политики, ACL definer-исключений,
default-privilege hardening, RLS-флаги, владельцы). Login-специфичные статьи (биндинг логинов,
CONNECT) в него НЕ входят — их генератор рендерит при применении из декларации + env-маппинга
(§A.1), рендер не коммитится. CI держит два гейта: (а) побайтная перегенерация артефакта —
расхождение с декларацией = красный (дисциплина drizzle-снапшотов); (б) детерминизм: тот же
вход → побайтно тот же выход. Скрипт — `scripts/generate-db-privileges.mjs`, по образцу
`a0-greenfield-baseline-lib.mjs`.

Свойства выходного SQL — механики доказаны исполнением:

- **полное переприменение**: на каждый объект `REVOKE ALL … FROM <все управляемые роли>` затем
  точные GRANT; `DROP POLICY IF EXISTS` затем `CREATE POLICY`; идемпотентность побайтно доказана
  (evidence/12 §8);
- **RLS-флаги — статьи генерата, не только триггера**: на КАЖДУЮ объявленную таблицу (org и
  не-org одинаково) генерат эмитит `ALTER TABLE … ENABLE|DISABLE ROW LEVEL SECURITY` и
  `FORCE|NO FORCE` ровно по `tables[*].rls`. Без этого поле `rls` — мёртвая запись: триггер §E
  ставит флаги только в момент DDL, существующие таблицы не тронет никто, и красный→зелёный Ф6
  для 5 таблиц FACTS §1.3 неконструируем; `platform_users` получает RLS строкой декларации
  (решение §I Р3), не руками. Сами `ALTER … ROW LEVEL SECURITY` доказаны исполнением
  (evidence/12 §4, вкл. идемпотентную перечитку флагов); эмиссия их генератором — приёмка Ф2;
- **владение — статьи генерата, по тому же доводу**: на каждую объявленную таблицу
  `ALTER TABLE … OWNER TO <tables[*].owner>`, на каждую definer-функцию
  `ALTER FUNCTION … OWNER TO <definerExceptions[*].owner>` (прецедент: `c5a:43`). Без статей
  поле `owner` — объявлено-и-сверяемо, но НЕ применяемо: дрейф владения (будущая миграция
  создала definer-функцию под мигратором при объявленном `app_owner`) краснел бы в §F без шага
  цепочки, ведущего в зелёный, — ручная заплатка, нарушение цели. Со статьями
  красный→зелёный→снова-красный для дрейфа владения конструируем. Эмиссия — приёмка Ф2;
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

0. **`watermark-check`** — старт цепочки: живой `max(created_at)` журнала
   `drizzle.__drizzle_migrations` против `app_control.privileges_watermark`, записанного в конце
   ПРЕДЫДУЩЕГО завершённого прогона (шаг 6). Журнал впереди = мигрировали МИМО цепочки, гейты
   6-7 не отбегали → красный; лечение одно — этот же полный прогон (6-7 заживляют, 6
   переписывает знак). Отсутствие watermark (свежая/пересозданная база; restore шага 2 стирает
   `app_control`) — НЕ красный: прогон всё установит, непрогнанную базу красит §F по всем
   управляемым базам (шаг 7). Семантика исполнения — требует прогона в Ф3.
1. **`roles-install`** — кластерный уровень, рендер из ТОЙ ЖЕ декларации (канонические роли +
   атрибуты) + env-маппинга (логины, §A.1). Роли кластерные, restore переживают; на greenfield
   обязаны существовать ДО восстановления слепка — политики слепка резолвят имена ролей при
   создании (стенд доказывает порядок: создание ролей `verify-a1:263-281` до restore). Закрывает
   «runtime roles must be provisioned BEFORE…» (`deploy-test-saas.sh:141-146`) и FACTS §3 №1-2.
2. **restore** (только full-reset; в a1 — восстановление a0-слепка).
3. **`wall-install`** — в базе: схема `app_control` + её таблицы `org_table_allowlist`,
   `privileges_watermark` (шаги 0/6), `ddl_wall_log` (журнал фазы §E) + маркер-роль фазы (§E) +
   event trigger (владелец `postgres`); deny-by-default §D (REVOKE PUBLIC, default-hardening
   создателей, снятие материализованного `PUBLIC EXECUTE`).
4. **`sync-org-allowlist`** — та же декларация; применяет allowlist **ТОЛЬКО ДОБАВЛЕНИЕМ/
   ОБНОВЛЕНИЕМ**, строк не удаляет (снятие — шаг 6, где финальное состояние известно). Одна
   транзакция, исполнитель — `runtime_overlay_admin_psql` (`runtime-overlay-rehydrate-lib.sh:113`).
5. **migrate** — `pnpm migrate` под временной скобкой элевации (`ALTER ROLE $DBROLE BYPASSRLS`
   `:3098` + членство в `app_owner` `:3092-3097`, снятие и ассерт — `cleanup_elevation`); та же
   скобка помечает сессию мигратора для стены (§E, фаза миграций). Декларация пиновит мигратора
   `NOBYPASSRLS` в стационаре: BYPASSRLS, повисший после упавшего migrate, ловит сверка §F
   (атрибуты ролей); сегодня то же делает cleanup — снятие и ассерт `deploy-test.sh:83-86`,
   пред-ассерты скобки `:173-176`.
   **Маркер-скобка живёт в `scripts/migrate-all.sh`** — дефолтной точке migrate (корневой
   `pnpm migrate` = `bash scripts/migrate-all.sh`, `package.json:80`; через него ходят
   `deploy-test-saas.sh:3101`, `deploy-test.sh:183`, `deploy/host/migrate-dev.sh:259`,
   `scripts/deploy-saas-667.sh:236`, стенды `verify-a1:338`, `verify-a0:277`). **Мимо скобки
   ведут ПЯТЬ поименованных обходов** (перепись по репо; алиасы — только вход, Ф2 целится в
   НЕСУЩИЕ скрипты): `migrate:webapp`, `db:migrate`, `db:migrate:prod` (`package.json:82-84`) →
   под ними `apps/webapp/scripts/run-webapp-drizzle-migrate.mjs` (`apps/webapp/package.json:26`)
   и интеграторный `src/infra/db/migrate.ts` / сборка `dist/infra/db/migrate.js`
   (`apps/integrator/package.json:20-21`); `migrate:legacy` →
   `apps/webapp/scripts/run-migrations.mjs` (`:27`); `db:migrate:drizzle` (`:62`) — сырой CLI
   `drizzle-kit migrate`, третья реализация мигратора без своего скрипта; судьбу каждого решает
   Ф2 — перевод СКРИПТА на migrate-all.sh либо удаление (снятие алиаса обход не закрывает).
   **Честное следствие обхода** (прежнее «бьётся о fail-closed reject» было неверно):
   стационарный reject §E ловит ТОЛЬКО DDL необъявленной org-таблицы; миграция, трогающая
   не-org или уже объявленные таблицы, доходит до конца и двигает журнал, а шаги 4/6/7 не
   бегут — новая таблица остаётся БЕЗ грантов (deny-by-default §D: не течёт, но и не работает)
   до следующего полного прогона цепочки. Чтобы обход не жил незамеченным — watermark: шаг 6 в
   конце прогона пишет в `app_control.privileges_watermark` максимум `created_at` журнала
   drizzle; точки контроля — шаг 0 следующего прогона И старт КАЖДОГО запуска migrate-all.sh
   (chokepoint: обходчик краснеет при ближайшем легальном migrate), НЕ соседний шаг 7 (зелен по
   построению). Watermark — runtime-состояние момента применения, в закоммиченный артефакт не
   входит: вход генератора остаётся декларацией, детерминизм-гейт цел; машинерия оправдана —
   «закрывающие гейты не отбежали» из остаточного риска становится детектируемым красным;
   сверх evidence/12, приёмка — Ф3/Ф4. Сегодня
   элевационные скобки живут в двух местах (`deploy-test-saas.sh:3092-3102`;
   `migrate-dev.sh:69,:96`) — целевая схема сводит маркер в migrate-all.sh; механика (как
   непривилегированный мигратор получает и гарантированно теряет маркер — definer open/close
   по образцу `verify-a1:300-315` либо адм-обёртка) — требует прогона в Ф3.
6. **генерат** — в слоте нынешней цепочки оверлеев, тем же админ-каналом. Полное переприменение
   ACL/политик/флагов/владельцев + ПОЛНОЕ переприменение allowlist: снятые из декларации строки
   уходят ЗДЕСЬ; тут же пишется watermark (точки контроля — шаг 0 и старт migrate-all.sh;
   описание — шаг 5). Соответствует предписанию Liquibase «гранты
   отдельным changelog, runAlways, последним» (evidence/07 §2).
7. **сверка §F + свип §G** — деплой-постчек, fail-closed: org-таблица, пережившая migrate и не
   объявленная в декларации, = красный деплой (§E, фаза миграций).

**Все пути к migrate — одна реализация цепочки.** Ежедневный code-only `deploy-test.sh`
(git-bundle → build → pending migrations → restart; SERVER CONVENTIONS.md:125) получает ТЕ ЖЕ
точки вставки: шаги 0-1, 3, 4 перед его `pnpm migrate` (`deploy-test.sh:183`), шаги 6-7 — в общем
закрывающем подрежиме, который он уже зовёт (`:197` → `deploy-test-saas.sh:2958-2963` →
`run_strict_post_migration_closure` `:2685`). Greenfield/a1 — та же цепочка, a0-слепок в роли
restore (порядок 1→2 доказан, шаг 1). **Dev-путь — `deploy/host/migrate-dev.sh`, та же цепочка
для `bcb_webapp_dev`:** шаги 0, 3, 4 перед его `pnpm run migrate` (`migrate-dev.sh:259` —
корневой алиас, т.е. migrate-all.sh), шаги 6-7 после; рендер для dev-базы из ТОЙ ЖЕ декларации;
маркер-скобку сегодня несут его элевационные функции (`migrate-dev.sh:69,:96`) до сведения в
migrate-all.sh (шаг 5). Без этих вставок принцип 2 («громкий 42501 на dev») структурно не
исполним — на dev не бежал бы ни один закрывающий гейт. Refresh dev из прод-дампов снят из
процесса владельцем 30.07 (`docs/ARCHITECTURE/DB_DUMPS/README.md:24-36` «DEV: без
restore/refresh»; migrate-dev.sh — единственная дорожка миграций dev); пересоздание, если
случится, убьёт стену — первый же migrate-dev.sh её переустановит (довод restore на TEST выше),
а непрогнанную базу красит §F TEST-постчека по всем управляемым базам (§F «Где бежит»).

**Гейт «миграции — только схема»:** новая миграция со статьёй из красного списка = красная
сборка (PLAN.md Ф2). Красный список: `GRANT/REVOKE`, `CREATE/ALTER/DROP POLICY`,
`CREATE ROLE/ALTER ROLE`, `ALTER DEFAULT PRIVILEGES`, `CREATE SCHEMA` (множество схем — истина
декларации §A.3), `ALTER FUNCTION … OWNER` и `ALTER TABLE … OWNER TO` (владение — статьи
генерата), `ALTER TABLE … ENABLE/DISABLE/FORCE ROW LEVEL SECURITY` (RLS-флаги — статьи генерата
по `tables[*].rls`; два движка не спорят за одну статью — тот же довод dbt #6238 ниже),
`CREATE MATERIALIZED VIEW` (RLS к matview не применяется ВООБЩЕ, org-данные в matview
неоградимы — запрет дешёв: сегодня в 377 миграциях и 61 оверлее ноль `CREATE MATERIALIZED VIEW`,
посчитано grep'ом; каталожный backstop — свип §G.1) и `CREATE FUNCTION … SECURITY DEFINER` — с
ОДНИМ вырезом: тела definer-функций едут именно миграциями (таблица судеб ниже), поэтому
CI-сканер красного списка сверяется с декларацией — сигнатура перечислена в `definerExceptions`
(§A.7) → зелёный, не перечислена → красный. Двум движкам нельзя спорить за один ACL —
задокументированный wontfix dbt #6238 (evidence/07 §2б). Старые 377 не трогаются (§H).

### Судьба 61 оверлея `deploy/postgres/*.sql` (посчитано: 61 файл)

| Класс | Примеры | Судьба |
|---|---|---|
| Чистые права/политики | `p0-5b-grants.sql`, `d3-4-…`, `phase4-locked-helper-rls-policies.sql`, `phase4-force-rls-cutover.sql`, `phase4-app-worker-narrow-rls.sql` (политики + узкие EXECUTE), `dev-c4`, `dev-c6…c8`, `dev-c10`, `s5`, `u9a`, `d2`, `d15b4`; сюда же `integrator-login-public-identity-grants.sql` — чистые гранты, но грантополучатель — env-логин (psql-переменная): статьи рендерятся с env-маппингом §A.1; это файл из FACTS §2, чьё отсутствие однажды роняло весь входящий Telegram/Max на TEST — его содержимое обязано жить в декларации, не в голове | **поглощаются декларацией** (генерат), файлы удаляются |
| Роли/логины/env-привязка | `p0-5b-role-split-staff-patient.sql`, `dev-c0-runtime-logins.sql`; сюда же `dev-c5` (членство dev-логина `bcb_webapp_dev_user` в capability-роли, `dev-c5:63-64`) и `dev-c9` (`dev-c9:81-82`: EXECUTE dev-логину — материал env-маппинга; парный EXECUTE capability-роли — декларация §A.5). Грантополучатель-логин = материал env-маппинга §A.1 + `roles-install`, НЕ генерата | **поглощаются `roles-install`** (декларация + env-маппинг §A.1) |
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

**Конечное состояние: в `deploy/postgres/` права существуют только в `generated/privileges.<db>.sql`;
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
   env-маппинга (PUBLIC CONNECT/TEMPORARY — неявный дефолт, evidence/12 §1). После этого CONNECT
   к управляемой базе — только явный, что и делает юрисдикционную проверку §F перечислимой.
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

Весь wall-install — ОДНА транзакция (`psql -1 -v ON_ERROR_STOP=1`), как и генерат: массовый REVOKE
раздельными autocommit-операторами ломает открытых читателей 42501 в окне (FACTS §4.1, evidence/12 §9).

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
    маркер-роли `app_migration_phase` (kind `service` в декларации §A п.1; NOLOGIN, создаёт
    wall-install), проверка триггера — `pg_has_role(session_user, …, 'MEMBER')`. В фазе триггер
    НЕ отвергает необъявленную org-таблицу, но ставит ей `ENABLE+FORCE ROW LEVEL SECURITY` и
    пишет каждую org-DDL в `app_control.ddl_wall_log`. Fail-closed смещается в конец деплоя, где
    финал ИЗВЕСТЕН: генерат + §F (§B шаги 6-7) красят деплой, если пережившая migrate таблица
    не объявлена; транзиент, умерший внутри хвоста, никого не красит. **Ничего не забываемо
    человеком:** маркер ставит и снимает код цепочки; нет маркера → триггер отвергает
    (fail-closed); остаточное членство после падения ловит §F (членства маркер-роли объявлены
    пустыми в стационаре) — довод тот же, что для остаточного BYPASSRLS (§B шаг 5). Механика
    маркера — требует прогона в Ф3. Политика транзиентов — принята, решение §I Р7.
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
- CI-гейт `check-new-table-rls-coverage.mjs` (уже в CI — FACTS §2) остаётся страховкой и после
  включения reject — оба гейта живут: решение §I Р6.

## F. Двусторонняя сверка declared ↔ catalog

Расширение паттерна c5a — `(actual EXCEPT expected) UNION ALL (expected EXCEPT actual)`
(`c5a-platform-operations-runtime.sql:1340-1350,1713-1727`; это pg_permissions/CIS-паттерн,
evidence/07 §1) — с точечных exact-wall-блоков на **всю базу и все роли**.

**Ожидаемое состояние строит тот же генератор** из той же декларации (второй артефакт:
`generated/expected-state.json`) — одна власть над «ожидаемым». В ожидаемую сторону входят и
объекты стены: схема `app_control`, allowlist, watermark, маркер-роль (ноль членов в стационаре),
триггер.

Покрываемые классы объектов (каждый — обе стороны EXCEPT):

| Класс | Каталог | Прецедент |
|---|---|---|
| table ACL (вкл. `is_grantable` против объявленного `grantable`) | `pg_class.relacl` через `aclexplode(COALESCE(relacl, acldefault(…)))` | c5a:1297-1310; is_grantable — c5a:1300 |
| RLS-флаги таблиц | `pg_class.relrowsecurity/relforcerowsecurity` против `tables[*].rls` — обе стороны: force-таблица без флага И флаг на таблице, объявленной `'off'` | §B (RLS-статьи генерата); красный сегодня — 5 таблиц FACTS §1.3 |
| column ACL | `pg_attribute.attacl` | c5a:1311-1319; без него табличная проверка врёт (FACTS §1.4) |
| function ACL + `prosecdef` + владелец | `pg_proc.proacl/prosecdef/proowner` (схемы вкл. `app_ext`) | c5a:1320-1336,1345 |
| политики, вкл. RESTRICTIVE, USING/WITH CHECK-текст | `pg_policies` | c5a:1719-1721; RESTRICTIVE меняет семантику — evidence/12 §10 |
| атрибуты ролей | `pg_roles`: `rolcanlogin/rolsuper/rolbypassrls/rolinherit/rolcreaterole/rolconfig` | `verify-a1-rls-conformance.mjs:457-461` (частично); pgTAP атрибуты не покрывает — писать самим (evidence/07 §3); ловит и остаточный BYPASSRLS мигратора после упавшего migrate (§B шаг 5) |
| членства с опциями | `pg_auth_members` (admin/inherit/set) | c5a:31; rig:462-486; вкл. пустоту маркер-роли §E |
| владельцы объектов | `relowner/proowner` против `tables[*].owner`/`definerExceptions[*].owner` — применяет генерат (§B), сверяет §F | §C |
| schema ACL + само МНОЖЕСТВО схем | `pg_namespace.nspacl` через `aclexplode(COALESCE(…, acldefault('n',…)))`; список схем — обе стороны: необъявленная схема с объектами = красный (`CREATE SCHEMA` заодно в красном списке §B) | §A.3; USAGE — первый рубеж 42501, evidence/12 §1 |
| database ACL (CONNECT/TEMP/CREATE) | `pg_database.datacl` | §A.3; PUBLIC CONNECT/TEMP — неявный дефолт, evidence/12 §1 |
| sequence ACL | `pg_class.relacl` при `relkind='S'` | §A.4 (правило USAGE) |
| type ACL | `pg_type.typacl` | §A.6; сегодня ожидаемая сторона пуста — ноль `CREATE TYPE` в миграциях |
| default privileges — обе стороны | `pg_default_acl` (`defaclrole/defaclobjtype/defaclacl`) | §B hardening + §G.7; evidence/12 §3 |
| view: ACL + `security_invoker` | `pg_class.relacl/reloptions` при `relkind='v'` | §A.5; §G.6; FACTS §4 (definer-view видит чужое) |
| журнал vs watermark — точки контроля НЕ здесь: §B шаг 0 + старт каждого migrate-all.sh (в шаге 7, сразу после записи шагом 6, проверка зелена по построению) | `max(created_at)` из `drizzle.__drizzle_migrations` против `app_control.privileges_watermark` | §B шаги 0/5 (обход мимо цепочки); сверх evidence/12, приёмка Ф3/Ф4 |

**Где бежит:** (1) CI — на одноразовом кластере a1 после полной цепочки §B; (2) деплой-постчек
на TEST — шаг 7 той же цепочки (слот нынешних постчеков `deploy-test-saas.sh:500-521`), причём
обходит **ВСЕ управляемые базы кластера** (`bersoncarebot_test` И `bcb_webapp_dev`): кластерные
классы — один раз, per-database — по каждой базе раздела `databases`; dev-база, отставшая или
пересозданная мимо своего прогона, краснеет здесь; (3) dev — шаг 7 dev-пути `migrate-dev.sh`
(§B). Скрипт один: `scripts/verify-db-privileges-conformance.mjs`.

**Скоуп кластерных классов — по юрисдикции §A, двусторонне:** (1) каждая объявленная роль и
логин существуют с объявленными атрибутами и членствами (объявленное множество = канонические
роли + объединение env-маппингов кластера; dev-логин на TEST-сверке не «необъявленный» — он
объявлен в env-маппинге dev того же кластера); (2) ноль НЕобъявленных ролей, имеющих хоть один
путь доступа к управляемой базе: `CONNECT` на неё (после §D.1 PUBLIC снят — значит только
явный), любая привилегия на схеме/таблице/функции/последовательности/типе внутри неё, либо
членство в любой объявленной роли (`pg_auth_members` в ОБЕ стороны). Чужая роль кластера без
таких путей — вне юрисдикции, сверка её не перечисляет: эфемерные `pbt_tpl_*` приходят и уходят,
не трогая красный. Кластерные атрибуты чужих ролей (SUPERUSER/BYPASSRLS) — принятый остаточный
риск, §I. Per-database классы (ACL, политики, RLS-флаги, дефолты) — по-базово. Login-уровень —
по-окруженная часть: все классы записи логина §A.1 (членство в терминале, атрибуты вкл.
`NOINHERIT`, `rolconfig IS NULL` либо исключение, CONNECT) рендерятся в момент проверки из
декларации + env-маппингов.

**Красный:** ненулевое число строк в любом направлении; вывод печатает сами строки (`направление,
роль, объект, привилегия/политика`), `exit 1` — деплой падает. Приёмка Ф4: ручной `GRANT SELECT
ON … TO app_staff` мимо декларации обязан дать ровно одну строку `actual-not-declared`.

## G. Свип — 9 каталожных инвариантов

Один файл `scripts/db-privileges-sweep.sql`, каждый запрос обязан вернуть **0 строк**
(шаблон Splinter/GitLab — evidence/07 §3; №1-7 — из Ф5 плана, №8-9 добавлены Ч1.2-r4). **Списки
свипа (роли И схемы) — рендер из декларации + env-маппинга В МОМЕНТ ИСПОЛНЕНИЯ; отрендеренный
свип — не артефакт и не коммитится.** Захардкоженные списки сделали бы свип вторым источником
(принцип 1) и красным по построению на живых средах — на TEST BYPASSRLS несут ТРИ роли (третья —
`saas_system_health_owner`, §A п.1), на CI-кластере a1 суперпользователь — `bcb_a1_operator`
(`verify-a1-rls-conformance.mjs:17,:208`), не `postgres`. Плейсхолдеры `:allow_*`/`:schemas`
заполняет тот же генератор; фильтр схем — все шесть схем §D, включая `drizzle` (org-таблиц там
быть не должно — тоже инвариант). Эскизы:

```sql
-- 1. RLS на каждой org-таблице (красный сегодня: 5 таблиц FACTS §1.3). relkind включает 'm':
--    RLS к matview не применяется вовсе => org-matview красен ВСЕГДА (сегодня matview ноль, §B)
SELECT c.oid::regclass FROM pg_class c
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='organization_id'
  AND a.attnum>0 AND NOT a.attisdropped
WHERE c.relkind IN ('r','p','m')
  AND c.relnamespace::regnamespace::text IN (:schemas)  -- шесть схем §D, рендер из декларации
  AND NOT c.relrowsecurity;
-- 2. FORCE там же (тот же запрос с NOT c.relforcerowsecurity)
-- 3. нет RLS-таблиц без единой политики
SELECT c.oid::regclass FROM pg_class c WHERE c.relrowsecurity
  AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid);
-- 4. нет политик TO PUBLIC и грантов PUBLIC на прикладных объектах
SELECT polrelid::regclass, polname FROM pg_policy WHERE polroles = ARRAY[0]::oid[];
SELECT c.oid::regclass FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) x
WHERE x.grantee=0
  AND c.relnamespace::regnamespace::text IN (:schemas);
-- 5. нет неожиданного BYPASSRLS/SUPERUSER. Allowlist НЕ пишется руками — рендер из декларации:
--    роли с объявленным bypassrls (app_owner, saas_system_health_owner — §A п.1) + кластерный
--    суперпользователь окружения (postgres на TEST/dev, bcb_a1_operator на a1 — verify-a1:17).
--    Красный и на BYPASSRLS мигратора, забытом упавшим migrate (§B шаг 5).
--    Скоуп — юрисдикция §A: чужие роли кластера БЕЗ доступа к управляемым базам не перечисляются
--    (их атрибуты — принятый остаточный риск, §I)
SELECT rolname FROM pg_roles WHERE (rolbypassrls OR rolsuper)
  AND rolname IN (:jurisdiction_roles)      -- объявленные + имеющие доступ (рендер §F/№8)
  AND rolname NOT IN (:allow_bypass_or_super);
-- 6. представления — только security_invoker, обе формы записи true|on
--    (definer-представление видит чужое: FACTS §4, замер Sol)
SELECT c.oid::regclass FROM pg_class c WHERE c.relkind='v'
  AND c.relnamespace::regnamespace::text IN (:schemas)
  AND NOT EXISTS (SELECT 1 FROM unnest(c.reloptions) o
                  WHERE o IN ('security_invoker=true','security_invoker=on'));
-- 7. ноль положительных default-грантов кому бы то ни было, кроме создателя о себе: декларация
--    дефолтов не заводит (§D.4) — ЛЮБАЯ чужая positive-запись красна. Фильтра по имени НЕТ:
--    LIKE 'app\_%' пропускал бы грантополучателей bcb_test_*/saas_*
SELECT d.defaclrole::regrole, d.defaclobjtype, a.grantee::regrole
FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
WHERE a.grantee <> d.defaclrole;
-- 8. ноль НЕобъявленных ролей с ЛЮБЫМ путём доступа к управляемой базе (юрисдикция §A/§F):
--    CONNECT на базу, привилегия на схеме/объекте внутри неё, членство в объявленной роли —
--    pg_auth_members в обе стороны; объявленное множество — рендер в момент исполнения.
--    Сверх evidence/12 — точный SQL: приёмка Ф4 (машинерия та же, что кластерные классы §F)
-- 9. каждый FK между двумя org-таблицами спаривает и колонки organization_id: действия
--    ссылочной целостности исполняются В ОБХОД RLS (док. PostgreSQL CREATE POLICY:
--    «referential integrity checks … always bypass row security»; внутренние RI-запросы бегут
--    от владельца таблицы) — FK через границу организаций дал бы каскад/чтение чужих строк
--    мимо стены. Выводимо из pg_constraint (conkey/confkey); точный SQL — требует прогона в Ф3
```

Свип — страховка движка, не основной механизм (принцип 4): в норме вечно зелёный, красный = ЧП.
Бежит вместе со сверкой §F (CI + деплой-постчек, §B шаг 7) и, как она, по каждой управляемой
базе кластера (§F «Где бежит»; №5/№8 — кластерные, один раз). Стенд a1 остаётся поведенческим
доказательством сквозь реальный код (FACTS §3) и добирает 5 дыр по Ф5 — свип его не заменяет.

## H. Путь миграции от сегодняшнего состояния

Каждый шаг — красный→зелёный→снова-красный (PLAN.md «Правило приёмки»). Применённые миграции НЕ
переписываются: журнал drizzle — watermark по `created_at`, переписывание истории ломает мигратор.

1. **Перепись** живого каталога TEST → черновик декларации (снятое состояние минус дефекты
   FACTS §1.2-1.4). Машинерия переписи = §F наоборот. Кластерная часть переписи ОБЯЗАНА
   протегировать каждую из 45 не-pg ролей (перепись 08.08, команды в §A): «объявленная» /
   «чужая-без-доступа» (вне юрисдикции) / «bcb-остаток» — `app_bootstrap_base_c1_20260713021531`,
   `app_runtime_login_c1_20260713021531`, `bcb_dev` — кандидаты на удаление после freeze+дампа
   (TEST обратим); база `bcb_webapp_prod` — старая копия прода (владелец 08.08: «копия явно»):
   вне контура, привилегий объявленных ролей на ней быть не должно, чистка возможна, но НЕ
   заказана — не трогать без команды. *(красный: сверка против пустой декларации.)*
2. **Генератор + сверка §F на одноразовом кластере** (инфраструктура a1), полная цепочка §B.
   Зелёный = каталог после цепочки побайтно сходится с декларацией в обе стороны.
3. **CI-гейты:** (а) новая миграция содержит статью из красного списка §B (GRANT/REVOKE/политики/
   роли/CREATE SCHEMA/ALTER FUNCTION|TABLE OWNER/ALTER TABLE … ROW LEVEL SECURITY/
   SECURITY DEFINER вне definerExceptions/CREATE MATERIALIZED VIEW) → красный; (б) `generated/privileges.<db>.sql` разошёлся с
   декларацией → красный.
4. **`wall-install` + event trigger §E** — сначала одноразовый кластер и a1 (с механикой фазы
   миграций — прогоны Ф3), на TEST — только по команде владельца (деплой остановлен — FACTS §11).
   Вставка во все пути (два TEST-деплоя + dev) — §B «Все пути к migrate — одна реализация».
5. **Первое применение генерата на TEST = Ф6:** дефекты закрываются приведением реальности к
   декларации, не заплатками: 5 таблиц без RLS+FORCE (§1.3), 7 ячеек утечки (§1.2),
   `platform_users` (§1.4 — решение §I Р3). Красный→зелёный здесь конструируем ИМЕННО
   RLS-статьями генерата (§B): существующие таблицы §1.3 получают `ENABLE+FORCE` статьями
   первого применения — триггер §E их не тронул бы никогда (их DDL в прошлом), а сверка §F
   (строка RLS-флагов) держит зелёное состояние. Доказательство — свип зелёный + обход 1892
   ячеек `(роль × таблица × принципал)`, чья ожидаемая видимость рендерится из раздела `scopes`
   декларации (§A.2 — его явный потребитель): ноль чужих строк (FACTS §6) + стенд PASS.
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

## I. Вне рамок, развилки и принятые решения

**Вне рамок схемы:** Result-типизация порта и 177 мест гашения (evidence/07 §4); отгрузка
журнала/алертинг 42501; угадывание роли в Node (`withClient.ts:56-66`, FACTS §1.1) — своя работа
Ф6; `pgEmailSetupFlowPort`, гасящий 42501 в `reason:'user_not_found'` (FACTS §11.7), — код-фикс
Ф6, не механизм схемы; FACTS §11.5 (15 обходов ESLint) и §11.6 (2 находки ACCESS_SWEEP) —
app-слой, включены явными пунктами Ф6 (решение Р10 ниже); PUBLIC CONNECT наших логинов в ЧУЖИЕ
базы кластера (пока те базы не сняли PUBLIC) — забота тех проектов, вне контура этой декларации;
клиентский код; прод (не трогается — отдельное решение владельца).

### Блок 1 — развилки владельца (одна обязательная + одна опция)

1. **Приёмка этой схемы (Ч1.3)** — продуктовое решение владельца.
2. **ОПЦИЯ (не спроектирована, не решена): периодический свип §G между деплоями.** Watermark
   (§B шаг 0) ловит обход лишь при следующем прогоне/migrate-all — остаётся окно дрейфа;
   периодический свип его сжал бы. Новая машинерия (таймер/крон) — решение владельца при Ч1.3.

### Блок 2 — принятые решения (зафиксированы 08.08, у каждого основание одной строкой)

Пометка «инженерное решение 08.08» значит: основание — мировая практика/факты, возражений
владельца не поступило; Р1-Р2 — прямые решения владельца.

1. **Dev-база — в контуре стены/генератора сразу** — решение владельца 08.08 («Dev-база —
   никаких прямо сейчас работ не идет»); совпадает с инженерным доводом: принцип 2 обещает
   громкий 42501 на dev, кластер общий (§A), полумера оставляла бы незащищённую базу рядом.
2. **Свой генератор, не Atlas Pro** — решение владельца 08.08 («денег нет»). Инженерная сторона
   совпадает: $9/место/мес + схема в чужое облако; event trigger Atlas не ведёт; сверка обязана
   строиться из ТОЙ ЖЕ декларации, что генерат (§F), иначе две власти; c5a-паттерн и Node-обвязка
   уже в репозитории; генератор — ~сотни строк поверх доказанных механик (evidence/12 §8).
3. **`platform_users` RLS — сейчас** — инженерное решение 08.08: единственная стена на 278 строк
   ПДн, `app_staff` без принципала читает всё (FACTS §1.4); проверяемо, продуктового трейдоффа
   нет; декларация несёт `rls: 'force'` (образец §A), реальность приводит Ф6. **⚠ Предъявить
   повторно при приёмке Ч1.3** — закрывает исходную развилку №1 плана в НЕ-дефолтную сторону.
4. **7 ячеек утечки — сузить `app_platform_settings`** — инженерное решение 08.08: 5/7 —
   биллинг под GLOBAL-ролью (FACTS §1.2); платформенное чтение членств — definer-исключение
   (образец c5a:1293-1355), не табличный SELECT. **⚠ Предъявить повторно при приёмке Ч1.3** —
   закрывает исходную развилку №2 плана в НЕ-дефолтную сторону.
5. **BYPASSRLS у `app_owner` — оставить-и-объявить** — инженерное решение 08.08: соответствует
   живым ассертам деплоя (`deploy-test-saas.sh:907`, `deploy-test.sh:174`); снятие сам деплой
   зовёт изменением модели безопасности (`deploy-test-saas.sh:1383-1387`) — отдельный анализ,
   схема его не проектирует.
6. **Оба гейта остаются** (`check-new-table-rls-coverage.mjs` + reject §E) — инженерное решение
   08.08: CI-гейт ловит на диффе кода, стена — на исполнении; слои разные, дублирование дешёвое.
7. **Транзиентные org-таблицы — терпеть через фазу миграций** — инженерное решение 08.08:
   соответствует случившейся истории 0095→0298 (§E); таблица в фазе всё равно рождается за
   стеной; запрет транзиентов красил бы легальную историю.
8. **Провижининг логинов — в контуре декларации** (env-маппинг §A.1, `roles-install` применяет,
   §F сверяет) — инженерное решение 08.08: вне контура истина уровня логина живёт в двух местах
   и §F не караулит класс дефекта FACTS §9.6 (login-level `search_path`).
9. **BYPASSRLS у `saas_system_health_owner` — оставить-и-объявить** — инженерное решение 08.08:
   то же обращение, что Р5 (NOLOGIN definer-владелец, ноль членов, живой деплой атрибут уже
   ставит — §A п.1); заодно закрыт спор оверлеев dev/TEST.
10. **FACTS §11.5 + §11.6 — явными пунктами Ф6** — инженерное решение 08.08: открытые дефекты
    того же расследования, лист Ф6 — место, где они не потеряются; app-слой, не механизмы схемы.

### Принятый остаточный риск со-жительства (записан, не проектируется)

Кластерные атрибуты ЧУЖИХ ролей — вне юрисдикции bcb (§A): чужой `SUPERUSER`/`BYPASSRLS` на
разделяемом кластере достаёт до ЛЮБОЙ базы, включая управляемые, и никакая наша декларация,
стена или сверка его не ограничит — это факт со-жительства шести чужих баз на `:5432`. Полностью
снимает его только разделение кластеров; здесь оно НЕ проектируется (вне мандата). Компенсация
та же, что для суперпользователя вообще (§E: компрометация суперпользователя вне стены).

---

*Непротиворечие FACTS §9: definer-функции — перечисленные исключения, не норма (§9.4); отказ прав
остаётся 42501 от движка, «всегда бросать» не вводится (§9.2); все проверки — каталог и
исполнение, ни AST (§9.3), ни EXPLAIN (§4); сканер красного списка — grep-класс по диффу миграций
со сверкой списка сигнатур, не AST-анализ семантики кода; FORCE RLS сохраняется на всех
org-таблицах (свип §G.2 караулит; фаза миграций §E ставит FORCE даже необъявленным); стенд a1
остаётся поведенческим доказательством (§3); watermark-журнал мигратора не переписывается (§H).*

---

## Changelog Ч1.2-r4 → Ч1.2-r5 (по находкам критика №5)

- **MAJOR-1 (dev вне цепочки)** → §B «Все пути…» + §F/§G «где бежит»: `migrate-dev.sh` получает
  шаги 0/3/4 перед `pnpm run migrate` (`:259`) и 6-7 после (скобка — его функции `:69,:96` до
  сведения в migrate-all.sh); §F/§G TEST-постчека обходят ВСЕ управляемые базы кластера. Refresh
  dev из прод-дампов снят владельцем 30.07 (`DB_DUMPS/README.md:24-36`); пересоздание лечит
  первый migrate-dev.sh, непрогнанную базу красит TEST-постчек.
- **MAJOR-2 (watermark зелен по построению)** → §B шаг 0: проверка перенесена из шага 7 в старт
  цепочки + старт каждого migrate-all.sh; шаг 6 — писатель; watermark — runtime-состояние, в
  артефакт не входит (детерминизм цел); строка §F помечена; семантика — прогон в Ф3.
- **m2-m5** → wall-install дополнен `privileges_watermark`+`ddl_wall_log` (§B шаг 3);
  потребитель `scopes` — обход §H.5 (§A.2+§H.5); в красный список — `ALTER TABLE … OWNER TO` и
  `ALTER TABLE … ROW LEVEL SECURITY`; обходы migrate-all.sh названы скриптами
  (`run-webapp-drizzle-migrate.mjs`, `run-migrations.mjs`, `src/infra/db/migrate.ts`) — Ф2
  целится в скрипты, не алиасы.
- **Ниты** → `dev-c3:205` — комментарий, не запись атрибута; `migrate-all.sh` → `:84,:91`.
- **Предъявление владельцу** → §I Р3/Р4: «⚠ предъявить повторно при Ч1.3» (развилки №1-2 плана
  закрыты в НЕ-дефолтную сторону); §I Блок 1 — опция периодического свипа (не решена).
