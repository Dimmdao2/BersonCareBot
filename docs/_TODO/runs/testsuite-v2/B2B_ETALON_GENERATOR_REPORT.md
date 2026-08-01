# Б2б — генератор эталона `a0-greenfield` приведён в соответствие со схемой — ОТЧЁТ

**Бриф:** [`B2B_ETALON_GENERATOR_BRIEF.md`](B2B_ETALON_GENERATOR_BRIEF.md). **Ветка:** `wt/testsuite-b2`.
**Прод не трогался, не читался. Схема DEV не менялась** — весь diff в `scripts/` и `docs/`; DEV читался
только `SELECT`-запросами непривилегированной ролью `bcb_webapp_dev_user` через `apps/webapp/.env.dev`
(без `sudo`, без записи).

## Итог одной строкой

Три из шести отказов были устаревшим знанием генератора о ролях — исправлено находкой конкретных
`CREATE ROLE`-миграций. `phone_literal_forbidden` оказался ложным срабатыванием на repo-wide плейсхолдере
`+70000000000` — проверка сужена ровно до этого литерала, строгость к любому другому телефону подтверждена
арбитражом (намеренная порча кода красит тест). `environment_identifier_forbidden` оказался **верным**
срабатыванием — в живой `bcb_webapp_dev` в теле двух функций буквально запечён `'bersoncarebot_test'` — это
**не исправлено**, вынесено находкой ниже, проверка не ослаблена. Обновление самого эталона (привилегированный
`refresh-a0-greenfield-baseline.mjs`) не запускал — граница брифа, это шаг лида.

## 1. Четыре роли — найдены создающие их миграции

Список `allowedPolicyRoles` в `scripts/a0-greenfield-baseline-lib.mjs` был не в курсе четырёх ролей, реально
существующих в `bcb_webapp_dev` (подтверждено `SELECT DISTINCT unnest(polroles::regrole[])::text FROM pg_policy`
— именно эти четыре роли и никакие другие сверх уже известных трёх плюс нормализуемого `app_owner`):

| Роль | `CREATE ROLE` | Коммит |
|---|---|---|
| `app_platform_settings` | `deploy/postgres/u9a-platform-settings-role.sql:6` | `7c9d94bea7` «feat(platform): add global settings principal spine», 2026-07-21 |
| `app_operational_web_push_reminder` | `deploy/postgres/c4-web-push-reminder-runtime.sql:20` | `7ebda04181` «fix(saas): close owner-ready notification runtime gaps», 2026-07-17 |
| `app_web_push_reminder_discovery_definer` | `deploy/postgres/c4-web-push-reminder-runtime.sql:23` | тот же коммит |
| `app_clinic_billing` | `deploy/postgres/c5a-platform-operations-runtime.sql:21` | `8efd156982` «fix(saas): close C5A quota trial and platform gates», 2026-07-21 |

Важно: все четыре `CREATE ROLE` живут в `deploy/postgres/*.sql` — provisioning-скриптах деплоя, **не** в одном
из двух отслеживаемых generator'ом migration ledger (`apps/integrator/.../migrations/core`,
`apps/webapp/db/drizzle-migrations`). Это не ошибка допущения: `deploy/postgres` — канонический механизм
role/ACL provisioning в этом репо (см. `AGENTS.md` §10a, пример 5 — деплой role-скриптов проверяется против
живой БД, не текстом), но `a0-greenfield` их не переигрывает, только фиксирует итоговые роли как «известные»
для policy-сканера. Список внесён с комментарием-цитатой файла+коммита у каждой роли
(`scripts/a0-greenfield-baseline-lib.mjs`, блок `allowedPolicyRoles`).

Роль без найденной `CREATE ROLE`-миграции в список не вносилась — все четыре найдены, «не найденных» нет.

## 2. `phone_literal_forbidden` и `environment_identifier_forbidden` — разобраны по факту

Оба срабатывания диагностированы **не по догадке**, а прямым `SELECT` по `pg_proc.prosrc`/`pg_policies`/
`pg_attrdef`/`pg_constraint`/`pg_views` живой `bcb_webapp_dev` (непривилегированная роль, только чтение) —
единственные объекты, матчащие оба паттерна генератора, это ровно 3 функции:

```sql
SELECT count(*) FROM pg_proc p
WHERE p.prosrc ~* 'bersoncarebot_(dev|test|prod)' OR p.prosrc ~ '''[+][1-9][0-9]{9,14}''';
-- matching_functions: 3
```

Ни одна policy, column default, check constraint или view не матчат ни один из паттернов — источник
локализован полностью в теле этих трёх функций.

### 2а. `phone_literal_forbidden` — ЛОЖНОЕ срабатывание, проверка сужена

`app.is_platform_registration_analytics_user_excluded()` (тело создано
`apps/webapp/db/drizzle-migrations/0261_platform_registration_events_read.sql:24`) содержит
`platform_user.phone_normalized = '+70000000000'`.

`+70000000000` — не PII, а repo-wide sentinel плейсхолдер для служебной записи «БЛОК ОКНА» (ручная блокировка
слота календаря, не реальный пациент). Та же константа определена независимо в двух местах приложения:

- `apps/webapp/src/infra/repos/pgAnalyticsAudience.ts:7` — `ALWAYS_EXCLUDED_ANALYTICS_PHONES = ['+70000000000']`;
- `apps/webapp/scripts/purge-placeholder-bookings.ts:79` — `PHONES = ['+70000000000', '+79189000782']`.

Также используется как безопасный fallback-плейсхолдер в нескольких route/repo-файлах (`booking-engine/.../manual/route.ts`,
`emitBookingDeletedEvent.ts`, `emitPackageCalendarSync.ts`, `staffBookingIntegratorEvent.ts`) — устойчивый,
многократно подтверждённый repo-wide sentinel, не разовая случайность.

**Правка:** `quotedPhonePattern` в `scanSeedArtifact` (seed) не тронут — остаётся полностью строгим, телефонов
там и не должно быть. В `scanSchemaArtifact` добавлена `findSchemaPhoneLiteral()`: извлекает все
`'+<цифры>'`-литералы и падает на первом, который **не равен** `+70000000000` ровно (`SCHEMA_PLACEHOLDER_PHONE_LITERALS`
— `Set` из одного элемента, с комментарием-цитатой обоих источников константы и породившей миграции).

### 2б. `environment_identifier_forbidden` — ВЕРНОЕ срабатывание, НЕ исправлено — находка уровня репозитория

Тела двух функций в живой `bcb_webapp_dev` буквально содержат `current_database() <> 'bersoncarebot_test'`:

- `app.set_saas_isolation_test_scenario(text)`
- `app.read_saas_isolation_test_scenario_fixture_counts()`

Обе созданы `deploy/postgres/saas-isolation-telemetry.sql:301-379`, коммит `16a910970b` «feat(saas): prepare
owner-ready strict TEST environment», 2026-07-16 (`ALTER FUNCTION ... OWNER TO saas_telemetry_owner`, роль
`saas_telemetry_owner` там же). Это provisioning-скрипт деплоя (снова не migration ledger). Функции — тестовые
сценарные хелперы, по конструкции no-op вне `bersoncarebot_test` (`RAISE EXCEPTION` при другом
`current_database()`), но их персистентное тело хранит буквальный идентификатор среды `bersoncarebot_test`.

Тот факт, что эти объекты видны в `pg_dump` именно `bcb_webapp_dev`, означает: `saas-isolation-telemetry.sql`
применялся не только к TEST, но и к DEV — то есть в DEV-схеме реально есть строковая привязка к имени другой
среды, ровно то, от чего `environment_identifier_forbidden` и должен защищать общий эталон.

**Не исправлено умышленно** — задача прямо запрещает чинить верное срабатывание молча или ослаблять проверку.
Регэксп `/\bbersoncarebot_(?:dev|test|prod)\b/iu` не тронут. Это блокирует `a0-greenfield` refresh до
owner-решения на уровне репозитория: возможные развилки (не выбирались мной — вне границ этой задачи) —
(a) не применять `saas-isolation-telemetry.sql` к DEV впредь и переприменить/пересоздать эти два объекта без
буквального DB-имени в теле (например через `current_setting`/параметр вместо литерала), или (b) явно решить,
что greenfield-эталон обязан исключать `saas_telemetry_owner`-объекты целиком, или (c) принять, что этот
provisioning-скрипт вообще не должен идти на DEV.

## 3. Строгость не ослаблена — арбитражная проверка (метод из `AGENTS.md` §10a)

Именованную поломку внёс руками в `scripts/a0-greenfield-baseline-lib.mjs`, прогнал целевой самотест, вернул
файл (`diff` после отката — пустой):

```
$ python3 -c "... заменить 'if (!SCHEMA_PLACEHOLDER_PHONE_LITERALS.has(digits)) return digits;' на 'if (false) return digits;' ..."
$ node --test --test-name-pattern="known placeholder-booking phone literal" scripts/a0-greenfield-baseline.test.mjs
not ok 1 - schema scanner accepts only the exact known placeholder-booking phone literal
  error: "'+79990001122'"
```

```
$ python3 -c "... заменить 'if (!allowedPolicyRoles.has(role)) failures.push(...)' на 'if (false) failures.push(...)' ..."
$ node --test --test-name-pattern="deploy-script roles it was taught" scripts/a0-greenfield-baseline.test.mjs
not ok 1 - schema scanner recognizes exactly the four deploy-script roles it was taught, nothing else
```

Оба самотеста красятся немедленно при подмене проверки на «пропускать всё» — они действительно ловят
ослабление, а не текст. Полный прогон после отката порчи, дословно:

```
$ node --test scripts/a0-greenfield-baseline.test.mjs
# Subtest: committed A0 package is internally consistent
not ok 1 - committed A0 package is internally consistent
  error: 'drizzle_historical_hash_drift:0175_p0_8_b4_roles_1_is_staff_wall_rls'
# Subtest: schema scanner rejects data, ACL, environment-role and PII leakage
ok 2
# Subtest: schema scanner accepts only the exact known placeholder-booking phone literal
ok 3
# Subtest: schema scanner recognizes exactly the four deploy-script roles it was taught, nothing else
ok 4
# Subtest: seed scanner accepts only reserved .test identity and approved tables
ok 5
# Subtest: package checker rejects schema and historical ledger hash drift
ok 6
# Subtest: dump normalization changes only the six known reference-catalog policy positions
ok 7
# Subtest: refresh rejects dirty migration/generator state and trusts only root-owned PostgreSQL binaries
ok 8
# pass 7
# fail 1
```

Тест 1 (`committed A0 package is internally consistent`) красный **и до, и после** моей правки — проверено
`git stash` / повторным прогоном на неизменённом коде: тот самый `drizzle_historical_hash_drift:0175_...`,
названный в брифе как следствие устаревшего committed `schema.sql`/`manifest.json`. Это не моя регрессия и не
то, что эта задача чинит — эталон устарел относительно текущего migration ledger, и обновить его может только
привилегированный `refresh-a0-greenfield-baseline.mjs`, который выполняет лид.

Добавлены новые самотесты (в `scripts/a0-greenfield-baseline.test.mjs`):
- `environment_identifier_forbidden` теперь входит в общий mutations-список (`schema scanner rejects data, ACL, environment-role and PII leakage`) — раньше этот failure-код вообще не был покрыт самотестами.
- `schema scanner accepts only the exact known placeholder-booking phone literal` — плейсхолдер проходит, `'+79990001122'`/`'+70000000001'`/`'+7000000000'`/`'+700000000000'` (близкие подмены) продолжают падать.
- `schema scanner recognizes exactly the four deploy-script roles it was taught, nothing else` — все четыре новые роли принимаются, `app_totally_unknown_role` продолжает падать.

## Изменённые файлы

- `scripts/a0-greenfield-baseline-lib.mjs` — четыре роли в `allowedPolicyRoles` (с комментарием-провенансом
  каждая), `findSchemaPhoneLiteral()` вместо голого `quotedPhonePattern.test()` в `scanSchemaArtifact`
  (только там; `scanSeedArtifact` не тронут).
- `scripts/a0-greenfield-baseline.test.mjs` — три новых/расширенных самотеста, см. выше.
- `docs/ARCHITECTURE/DB_DUMPS/a0-greenfield/README.md` — три новых раздела: список известных ролей с
  провенансом, известный плейсхолдер телефона, находка про `environment_identifier_forbidden`.

## НЕ СДЕЛАНО

- **Обновление самого эталона не выполнено** — `refresh-a0-greenfield-baseline.mjs` требует `sudo -n -u postgres`,
  недоступно в песочнице агента (`NoNewPrivs=1`, вне границ брифа). После того как лид его запустит, часть 1
  и 2а этой правки должны снять пять из шести исходных отказов (`unexpected_policy_role:*` × 4,
  `phone_literal_forbidden`); `environment_identifier_forbidden` останется красным до owner-решения из §2б.
- **`environment_identifier_forbidden` не исправлен и не будет исправлен этой веткой** — умышленно, это
  находка уровня репозитория (провенанс, развилки и коммит-источник — в §2б), решение по ней не моё.
- **Схема DEV не менялась и не будет** — граница брифа; находка из §2б требует правки `deploy/postgres/*.sql`
  и, возможно, переприменения на DEV/TEST, что не входит в задачу генератора.
- **`build-template`/полный disposable-DB прогон не гонял** — требует тот же привилегированный путь; проверено
  только на уровне `scanSchemaArtifact`/`scanSeedArtifact`/юнит-самотестов против committed `schema.sql`
  (который сам устарел, см. тест 1) и против прямого чтения живой `bcb_webapp_dev` через непривилегированный
  `SELECT`.
- Push/merge не делал, галочки плана не ставил — по границам брифа.
