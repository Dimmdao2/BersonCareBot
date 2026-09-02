# Независимый аудит #1069 4b.3/4b.4 — семантика понижения тарифа для механик-возможностей

**Кандидат:** `8571d5311` на `wt/systemic-tariff-downgrade-20260902` (HEAD `1629cbebc`), база интеграции `ce620aa46`.
**Authority:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md`, пункты 4b.3 и 4b.4.
**Дата:** 02.09.2026. **Вердикт: FAIL** — блокирующий дефект, приземлять нельзя.

Изменение продуктового кода в этом проходе не делалось. Все временные инъекции выполнялись на копиях в
`/tmp` и внутри транзакций с `ROLLBACK`; DEV после прогонов не изменён (доказательство ниже).

---

## 1. Что проверялось (слепой kill-set, составлен по authority ДО чтения тестов)

| # | Названная поломка | Результат |
|---|---|---|
| K1 | исключённая механика, сохранено `read_only` → должно быть `read_only`, запись запрещена | ✅ выполняется |
| K2 | сохранено `disable_immediately` → `disabled` | ✅ |
| K3 | значение не сохранено → fail-closed `disabled` | ✅ |
| K4 | неизвестное значение / `block` / JSON `null` / ` read_only ` с пробелами → `disabled` | ✅ |
| K5 | включённая механика не деградирует от сохранённого значения | ✅ |
| K6 | числовые (`files`, `branches`) и местовая (`clinic_team`) механики не попадают под capability-политику | ✅ |
| K7/K8 | политика чужой организации/чужого тарифа не применяется | ✅ (`42501`, exact-org) |
| K9 | `read_only` — чтение можно, запись нельзя; `disabled` — ни того, ни другого | ✅ (`checkEntitlement`) |
| K10 | данные не удаляются, возврат на больший тариф восстанавливает доступ | ✅ (миграция не трогает данные) |
| K11 | контролы в коммерческом конструкторе не возвращены | ✅ (миграция без UI) |
| K12 | миграция не выдаёт и не отзывает права | ✅ |
| K15 | правка расширяет ЕДИНСТВЕННЫЙ существующий резолвер, второй политики не заводит | ✅ |
| **K13** | **порядок миграций и корректность базового тела функции** | ❌ **ПРОВАЛ** |

---

## 2. Блокирующая находка: миграция молча откатывает две уже применённые миграции

`20260901T231600_a_downgraded_capability_reads_its_own_tariff_policy.sql` делает
`CREATE OR REPLACE FUNCTION app.resolve_organization_mechanic_access(uuid,text)`, взяв тело из
`20260819T210005_a_clinic_is_billed_for_seats_not_for_people.sql`. Но после 19.08 эту же функцию
переписали ещё две применённые миграции:

- `20260820T175432_paid_period_global_access_authority.sql` — CTE `global_paid_policy_history` и
  `effective_global_paid_policy` (с `was_tightened`), четыре ветки исхода по `period_source = 'paid_period'`,
  ветка `post_paid_period_tariff` + `lifecycle = 'active'` → `full_access`, источник политики `global_paid_period`;
- `20260823T030000_integrator_tenant_role_reaches_delivery_roots.sql` — роль `app_integrator_tenant_service`
  в списке принимаемых контекстов и перенос инициализации `v_current_organization_id`/`v_now` ПОСЛЕ гейта.

Ничего из этого в кандидатском теле нет. `CREATE OR REPLACE` заменяет тело целиком, поэтому применение
кандидата стирает обе доработки. Обе миграции есть в ledger `bcb_webapp_dev`, то есть откат достижим на
каждом стенде.

Пробы `-- BCB-MIGRATION-VERIFY` этого не ловит: она проверяет только наличие подстроки
`downgrade_policies` в определении, и после отката остаётся зелёной.

### 2.1. Живое доказательство — состояние доступа (одна транзакция, `ROLLBACK`)

Фикстура — организация с истёкшим оплаченным периодом, механика `courses` включена в тариф:

| глобальная политика после оплаченного периода | живой DEV (0820+0823) | с применённым кандидатом |
|---|---|---|
| `tariff` | `full_access` / `global_paid_period` / mutation=**true** | `disabled` / `system` / mutation=false |
| `read_only` | `read_only` / `global_paid_period` / mutation=**false** | `grace` / `system` / mutation=**true** |
| `blocked` | `disabled` / `global_paid_period` / mutation=**false** | `grace` / `system` / mutation=**true** |

Достижимое последствие: организация, у которой оплаченный период закончился и глобальная политика говорит
`read_only` либо `blocked`, получает **право записи**. Это дыра в платёжной стене — неоплатившая клиника
продолжает писать. Симметрично, при политике `tariff` организация теряет механику, на которую имеет право.

### 2.2. Живое доказательство — интегратор (та же схема)

| | живой DEV | с применённым кандидатом |
|---|---|---|
| `app_integrator_tenant_service` с принятым контекстом зовёт дверь | `ALLOWED rows=1` | `REFUSED 42501 accepted port context required` |

Достижимое последствие: путь доставки интегратора (напоминания, клиентские каналы) перестаёт проходить
проверку механик — отказ в рантайме, а не при выкатке.

### 2.3. Существующая защита была, её просто не прогнали

Оба отката ловятся уже написанными оракулами репозитория:
`deploy/postgres/privileges/global-paid-period-access.devDbProof.test.mjs` и
`deploy/postgres/privileges/integrator-narrow-delivery-roots.devDbProof.test.mjs`. Оба зелёные на текущем
DEV и покраснели бы после применения кандидата. В evidence кандидата (`4b.4` в плане) их нет — прогонялись
только vitest-наборы на фейках, которые SQL-дверь не видят. Новых тестов на этот класс не требуется.

**Что нужно сделать исполнителю:** переписать миграцию так, чтобы она изменяла ДЕЙСТВУЮЩЕЕ определение
функции, а не подменяла его телом от 19.08 — тем же приёмом якорной замены через `pg_get_functiondef`,
которым пользуются 0820 и 0823, либо взяв за основу актуальное тело со всеми тремя слоями.

---

## 3. Целевая правка сама по себе корректна

Ветка `NOT mechanic_included` → `downgrade_policies ->> p_mechanic = 'read_only'` делает ровно то, что
требует владелец в 4b.3/4b.4, и ничего сверх. Матрица (в транзакции с `ROLLBACK`, тело кандидата против
живого):

| случай | живой DEV (без правки) | с кандидатом |
|---|---|---|
| исключена + `read_only` | `disabled` / false | **`read_only` / false** |
| исключена + `disable_immediately` | `disabled` / false | `disabled` / false |
| исключена + значение не сохранено | `disabled` / false | `disabled` / false |
| исключена + неизвестное значение | `disabled` / false | `disabled` / false |
| исключена + `block` | `disabled` / false | `disabled` / false |
| исключена + JSON `null` | `disabled` / false | `disabled` / false |
| исключена + `" read_only "` | `disabled` / false | `disabled` / false |
| ВКЛЮЧЕНА + `read_only` | `full_access` / true | `full_access` / true |
| `files` + `freeze_growth` | `full_access` / true | `full_access` / true |
| `files` + `read_only` | `full_access` / true | `full_access` / true |
| `branches` + `read_only` | `full_access` / true | `full_access` / true |
| `clinic_team` + `read_only` | `full_access` / true | `full_access` / true |

Меняется ровно одна клетка — та, ради которой правка и делалась. Числовые и местовая механики не
затронуты: `included` держит `files`/`branches` всегда включёнными, а для `clinic_team`
`assertDowngradePolicy` вообще запрещает сохранять любое значение (класс `места` отсутствует в
`DOWNGRADE_POLICY_VALUES_BY_CLASS`). Хардкода по имени механики нет ни в SQL, ни в TS — решает класс и
данные, как и требует 4b.4.

Приёмная сторона не менялась и не нуждалась: `checkEntitlement`
(`apps/webapp/src/app-layer/guards/requireEntitlement.ts:127`) отказывает записи при `read_only` и
отказывает всему при `disabled`; `resolveMechanicSurfaceVisibility` оставляет раздел видимым при
`read_only`. Единственный проход сохранён — второй двери не появилось.

---

## 4. Разбор прав миграции (§1 «Перед приземлением миграции»)

1. **Объекты:** заменяется одно тело `app.resolve_organization_mechanic_access(uuid,text)`. Таблиц,
   колонок, индексов, удалений нет.
2. **Роль тела:** `SECURITY DEFINER`, владелец `app_seam_org_commerce_owner` — тот же, что в
   owner-маркере миграции, и тот же, что у живой функции. `REHOME-FUNCTION` не требуется; сигнатура и OID
   не меняются (`CREATE OR REPLACE`).
3. **Нужные права:** новая строка читает `saas_tariffs.downgrade_policies` через уже существующий
   LATERAL к `app.saas_billing_effective_tariff` (тоже `SECURITY DEFINER`, тот же владелец), который
   возвращает `SETOF saas_tariffs`. Обращение к полю записи не требует колоночной привилегии, новых
   грантов нет. Подтверждено живьём: под настоящей цепочкой definer значение прочиталось (`read_only`).
4. **Декларация:** функция уже объявлена (`deploy/postgres/privileges/declaration.ts`,
   `function-census.ts`), добавлять нечего.
5. **Права в миграции:** `GRANT`/`REVOKE`/`CREATE POLICY`/`ALTER ROLE` отсутствуют — правило §1 соблюдено.

---

## 5. Команды и результаты

```
# owner-aware rollback-only preflight из candidate checkout (§1)
node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator \
  --drizzle-folder apps/webapp/db/drizzle-migrations --sudo-postgres --rollback-only
→ exit 0; "validated and rolled back … pending=1 total=112 reapplied=0 unapplied=0"
  (CREATE FUNCTION прошёл под SET LOCAL ROLE app_seam_org_commerce_owner, затем ROLLBACK)

# гейты имени/порядка/статики миграций
bash apps/webapp/scripts/check-drizzle-migration-order.sh                        → OK
findMigrationNameViolations / findMigrationStaticViolations / findMigrationTimestampCollisions → []

# существующие оракулы SQL-двери, база bcb_webapp_dev
RUN_GLOBAL_PAID_PERIOD_ACCESS_DB=1 node --test \
  deploy/postgres/privileges/global-paid-period-access.devDbProof.test.mjs      → 3/3 pass
RUN_D17_INTEGRATOR_ROOTS_DB=1 node --test \
  deploy/postgres/privileges/integrator-narrow-delivery-roots.devDbProof.test.mjs → 1/1 pass

# новый acceptance-оракул 4b.3/4b.4 (opt-in, в CI пропускается)
RUN_DOWNGRADE_CAPABILITY_POLICY_DB=1 node --test \
  deploy/postgres/privileges/downgrade-capability-policy.devDbProof.test.mjs
→ 4 pass / 1 fail: красный ровно на названном дефекте 4b.3 (живая дверь ещё отдаёт `disabled`
  вместо `read_only`) — это handoff-оракул по §24.5, зеленеет после исправленной миграции.
  Без переменной окружения: 5 skipped.

# точечные наборы и типы
pnpm --dir apps/webapp exec vitest run src/modules/org-entitlements/service.test.ts \
  src/infra/repos/pgOrgEntitlements.test.ts \
  src/app-layer/guards/requireEntitlementReadOnlyRefusesWrites.test.ts \
  src/app-layer/guards/requireEntitlementDataPreservedAndRestored.test.ts \
  src/app-layer/guards/cabinetAccessLadder.test.ts                              → 97/97 pass
pnpm --dir apps/webapp typecheck                                                → exit 2 (см. §6)
```

### Целевые мутации (§10b: «что сломано → какое утверждение покраснело»)

| класс поломки | инъекция | покрасневшее утверждение |
|---|---|---|
| `read_only` держит чтение | дверь без правки (живой DEV) | «an excluded capability stored as read_only keeps reads and refuses writes» |
| fail-closed на остальные значения | `= 'read_only'` → `IS DISTINCT FROM 'disable_immediately'` (копия в `/tmp`) | «every other stored value … fails closed»: `unset`/`null`/`block`/unknown/` read_only ` дали `read_only` вместо `disabled` |
| откат применённых миграций | тело кандидата вместо живого | таблицы §2.1 и §2.2 — записи разрешены неоплатившей организации, интегратор получает `42501` |

### Доказательство отката DEV

После всех прогонов на `bcb_webapp_dev`:
`integrator_intact = t`, `candidate_leaked = f`, фикстурных тарифов 0, фикстурных организаций 0,
строк ledger по тегу `20260901T231600…` — 0. Постоянных изменений не осталось.

---

## 6. Отдельный факт, не относящийся к 4b.3/4b.4

`pnpm --dir apps/webapp typecheck` на текущем HEAD падает:
`src/app/app/doctor/comments/loadDoctorCommentPatients.ts(118,13)` и `(118,37)` —
`Type 'string | null | undefined' is not assignable to type 'string | null'`.

Кандидат `8571d5311` тронул только `.sql` и `.md`, вызвать ошибку типов не может. Файл приехал коммитом
`3e009731e` (`feat/doctor-ui-rebuild`) через merge `1629cbebc`. Это унаследованный блокер land-гейта
ветки, а не находка по этому аудиту.

---

## НЕ СДЕЛАНО

- Полный CI не гонялся — прямой запрет брифа.
- Миграция не применялась ни на одном стенде; исправление миграции — работа исполнителя по §24.6,
  аудитор продуктовый код не правит.
- Унаследованная ошибка типов из §6 не исправлялась — вне скоупа этого аудита.
- Живая проверка через интерфейс (кабинет клиники после понижения) не делалась: правка целиком в
  SQL-двери, а UI-слой (`checkEntitlement`) не менялся и покрыт существующими наборами.
