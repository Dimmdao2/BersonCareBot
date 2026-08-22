# Б2 — тело запуска трила читало несуществующую колонку: регистрация клиники доходит до конца

**Дата:** 22.08.2026 · **Ветка:** `wt/trial-start-fix-20260822` · **Роль:** worker
**Оракул:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` → «Б2 — регистрация второй
клиники как это сделал бы живой человек»

---

## 1. Что тело ДОЛЖНО делать и на чём это доказано

**Пробная подписка НЕ несёт собственного тарифа.** Она идёт на ПЕРВЫЙ тариф организации, каким бы он
ни был. На пути автоматической выдачи первый тариф — это настройка регистрации
`public.saas_registration_tariff_policy.tariff_id`, которую тело уже читает отдельным запросом в
`v_registration_tariff_id`. **После трила** применяется `saas_trial_policy.post_trial_tariff_id` — и
только при `post_trial_behavior = 'tariff'`.

Это НЕ продуктовый выбор владельца и не догадка — вывод из схемы и трёх независимых мест кода:

1. **Шапка таблицы в схеме** — `apps/webapp/db/schema/saasEntitlements.ts:183-188`, дословно:
   «Триал и льготный период — owner 03.08 (Т5): the trial is a one-time period on the organization's
   FIRST tariff, whatever it is — auto-assigned via `saasRegistrationTariffPolicy` or chosen by the
   person. **It is no longer bound to its own tariff (there is no `tariffId` here)**: the tariff
   during a trial is whichever one the organization actually ends up with.»
2. **Живая реализация того же старта трила №1** — `apps/webapp/src/infra/repos/pgSaasBilling.ts:846`
   (`startOrganizationTrial`): `tariffId` приходит СНАРУЖИ (первый тариф), у политики читаются только
   `durationDays`, `discountWindowDays`, `postTrialBehavior`, `postTrialTariffId`;
   `discountEndsAt = endsAt + discountWindowDays`.
3. **Живая реализация №2** — `apps/webapp/src/infra/repos/pgPlatformEntitlements.ts:242`
   (`startTrialForOrganization`): `tariffId: organization.tariffId`, тот же расчёт окна, и явный
   отказ `organization_tariff_required_for_trial`, если тарифа нет.

Ни одна из них не читает у политики «тариф трила» — его там нет. Пару «во время / после» читает и
`app.resolve_organization_mechanic_access`
(`20260819T210005_a_clinic_is_billed_for_seats_not_for_people.sql:111` и далее):
`WHEN v_now <= trial.ends_at THEN trial.tariff_id` … `WHEN trial.post_trial_behavior = 'tariff' THEN
trial.post_trial_tariff_id`.

**Следствие для случая «регистрационного тарифа нет».** `saas_organization_trials.tariff_id` —
`NOT NULL`, то есть трилу не на чем стоять. Правильное поведение — не заводить ни тариф, ни трил и
вернуть `false`: человек выбирает тариф сам, и тот же одноразовый трил применяется к первому
прикреплению через `app.choose_organization_first_tariff(uuid,uuid)`
(`apps/webapp/src/modules/saas-billing/service.ts:110` — `assignFirstTariffWithTrialIfEligible`).
Вопроса владельцу здесь нет.

**Правильная редакция тела УЖЕ ЛЕЖАЛА В РЕПОЗИТОРИИ** — `deploy/postgres/c5a-platform-operations-runtime.sql:733`,
и совпадает с выводом выше знак в знак. Это runtime-overlay, который кладёт rehydrate, а не reconcile,
поэтому в каталог DEV/TEST она никогда не доехала. Каталог остался в редакции ДО перестройки
триальной модели (#1069 Т5/Т6, решения владельца 03.08).

---

## 2. Что было сломано (замер, а не гипотеза)

Тело в каталоге называло **четыре** несуществующих имени, а не одно:

| в теле | реальность |
|---|---|
| `policy.tariff_id` (JOIN с `saas_tariffs`) | у `public.saas_trial_policy` такой колонки НЕТ |
| `v_policy.tariff_id` | то же имя, прочитанное через `SELECT policy.*` |
| `v_policy.grace_days` | колонка снята, её место заняла `discount_window_days` |
| `grace_ends_at` (колонка вставки) | у `public.saas_organization_trials` она зовётся `discount_ends_at` |

Отдельно: **`policy.tariff_id` не был и объявлен.** Сгенерированный артефакт даёт шву SELECT по
`saas_trial_policy` ровно на восемь колонок, `tariff_id` среди них нет
(`deploy/postgres/generated/privileges.bcb_webapp_dev.sql`). То есть тело не исполнилось бы, даже
существуй колонка: декларация давно описывает ПРАВИЛЬНУЮ редакцию.

Функция сломана с рождения перестройки и ни разу не исполнялась — до неё не доходили, потому что
раньше падали более ранние стены (закрыты 22.08).

### Воспроизведено вживую на DEV ДО правки

Dev-сервер поднят из этого worktree на свободном порту 5303 (`:5200` занят соседним чатом).

```
POST /api/auth/specialist-signup/start   → {"ok":true,"challengeId":"469e8cce-…","retryAfterSeconds":60}
код из public.outgoing_delivery_queue    → 995542
POST /api/auth/specialist-signup/confirm → HTTP 200-вида тело отказа:
   {"ok":false,"error":"provisioning_pending","redirectTo":"/app/account?tab=security"}
```

`/var/log/postgresql/postgresql-16-main.log`, та же секунда:

```
2026-08-22 15:20:42.651 MSK [3770770] bcb_dev_webapp_patient@bcb_webapp_dev 42703 ERROR:  column policy.tariff_id does not exist at character 137
2026-08-22 15:20:42.651 MSK [3770770] … 42703 QUERY:  SELECT policy.*
	                  FROM public.saas_trial_policy AS policy
	  INNER JOIN public.saas_tariffs AS tariff
	    ON tariff.id = policy.tariff_id
	   AND tariff.is_active
	  WHERE policy.key = 'global' …
2026-08-22 15:20:42.651 MSK [3770770] … 42703 CONTEXT:  PL/pgSQL function app.start_provisioned_organization_trial() line 34 at SQL statement
	SQL statement "SELECT app.start_provisioned_organization_trial()"
	PL/pgSQL function app.provision_specialist_owner(uuid) line 188 at PERFORM
2026-08-22 15:20:42.651 MSK [3770770] … 42703 STATEMENT:  SELECT * FROM app.provision_specialist_owner($1::uuid)
```

DEV воспроизводит замер ведущего на TEST один в один.

---

## 3. Что изменено

### `apps/webapp/db/drizzle-migrations/20260822T120000_the_provisioned_trial_names_the_columns_its_tables_have.sql` (новый файл, 204 строки)

`CREATE OR REPLACE FUNCTION app.start_provisioned_organization_trial()` — один statement.

- **Тело** перенесено дословно из `deploy/postgres/c5a-platform-operations-runtime.sql:733`
  (правильная редакция, см. §1) + добавлено ровно одно, чего в overlay нет и быть не может:
  **аттестованный гейт первым исполняемым оператором** (`:120`). Текст гейта взят побайтно из
  `pg_proc` именованной DEV и совпадает знак в знак со строкой генератора
  (`deploy/postgres/generated/privileges.bcb_webapp_dev.sql:2430`, одноимённая строка артефакта
  `bersoncarebot_test`) — шагу reconcile, который владеет этим выражением, переписывать нечего.
- **Владелец** `app_seam_specialist_provision_owner`, сигнатура, тип возврата, волатильность,
  `SECURITY DEFINER`, `SET search_path` — прежние. `CREATE OR REPLACE` сохраняет OID (проверено:
  `1646017` до и после), поэтому `function_identity` (`regprocedure`), объявленные способности,
  `delegatesTo` и все вызовы адресуют тот же объект.
- **Секционные заголовки** `BCB-MIGRATION-OWNER` / `-SCHEMA-CREATE` / `-LANGUAGE-USAGE` (`:1-3`) —
  как в `20260822T100000`. `BCB-MIGRATION-VERIFY` (`:4`) — что ни одно тело в `app`/`app_ext`/
  `integrator` больше не содержит `policy.tariff_id`, И что именно это тело несёт `discount_ends_at`
  и не несёт `grace_ends_at`/`grace_days`.
- **Таймштамп** `20260822T120000` > последней применённой на DEV (`20260822T110000_the_email_verify_root_demotes_the_previous_primary`,
  `created_at=1800000096000`) и > последнего файла в дереве (`20260822T111100`). Мигратор идёт по
  watermark `created_at`, не по хешу.
- Прав миграция не выдаёт и не отзывает (AGENTS.md §1).

Разница с редакцией из каталога (кроме четырёх имён колонок): выборка политики больше не джойнит
`saas_tariffs` (у политики нет тарифа, джойнить не по чему) и берёт пять именованных колонок вместо
`policy.*`; проверка активности регистрационного тарифа стала явным `RAISE
registration_tariff_policy_tariff_invalid` вместо молчаливого схлопывания в NULL; добавлена ветка
«политика есть, а регистрационного тарифа нет» → трил не заводится (§1).

### `deploy/postgres/privileges/provisioned-organization-trial.devDbProof.test.mjs` (новый файл)

Поведенческое доказательство на исправленном пути — см. §5.

---

## 4. Разбор прав по AGENTS.md §1

**1. Какие объекты миграция трогает.** Ровно один: `CREATE OR REPLACE` тела
`app.start_provisioned_organization_trial()`. Таблиц, индексов, типов, ролей не создаёт и не удаляет.
Сигнатура не меняется → OID сохраняется → reconcile по `function_identity` не требуется.

**2. Под какой ролью исполняется тело.** `SECURITY DEFINER`, владелец
`app_seam_specialist_provision_owner` (проверено `pg_get_userbyid(proowner)` до и после). Вызов
приходит из `app.provision_specialist_owner(uuid)` в контексте пациента; для этого функция объявлена
делегатом (`declaration.ts:3874`, `delegatesTo`), а её аттестованный гейт принимает
`ARRAY['app_patient','app_platform_settings']`.

**3. Каких прав требует тело, чтобы ВЫПОЛНИТЬСЯ.** По телу, не по названию операции:

| отношение | операция | колонки | почему |
|---|---|---|---|
| `public.saas_registration_tariff_policy` | SELECT | `key`, `tariff_id` | выбор первого тарифа |
| то же | UPDATE | `updated_at` | `FOR UPDATE OF reg` — блокировка строки идёт по праву класса UPDATE |
| `public.saas_tariffs` | SELECT | `id`, `is_active` | проверка, что настроенный тариф жив |
| `public.saas_trial_policy` | SELECT | `key`, `duration_days`, `discount_window_days`, `post_trial_behavior`, `post_trial_tariff_id`, `start_event`, `is_active` | политика трила |
| то же | UPDATE | `updated_at` | `FOR UPDATE OF policy` |
| `public.saas_organization_trials` | SELECT / INSERT | `organization_id`, `tariff_id`, `started_at`, `ends_at`, **`discount_ends_at`**, `post_trial_behavior`, `post_trial_tariff_id`, `status`, `created_by`, `id` | строка трила; SELECT — уникальный индекс `ON CONFLICT (organization_id)` |
| `public.be_organizations` | SELECT / UPDATE | `id`, `tariff_id`, `updated_at` | прикрепление первого тарифа |
| `public.admin_audit_log` | INSERT | `organization_id`, `actor_id`, `action`, `target_id`, `details`, `status` | аудит |

**4. Чего из этого нет в декларации — НИЧЕГО.** Декларация уже описывает ИМЕННО эту редакцию:
`function-census.ts:12217` даёт `saas_trial_policy` SELECT по восьми колонкам **без** `tariff_id`, а
`saas_organization_trials` — с `discount_ends_at` и **без** `grace_ends_at`; оба `FOR UPDATE OF`
оплачены `ROW_LOCK_SURFACES` (`declaration.ts:2066`) колонкой `updated_at` каждой из двух таблиц.
Ни новой таблицы, ни новой колонки, ни новой seam-роли, ни нового `FOR UPDATE`/`FOR SHARE`, ни смены
сигнатуры. **`declaration.ts` не менялся, артефакты не перегенерировались.**

Проверено против живого кластера (все 21 требуемая пара «колонка × операция» — `t`):

```
$ psql -c "SELECT rel, col, op, has_column_privilege('app_seam_specialist_provision_owner', rel, col, op) …"
 public.saas_registration_tariff_policy | key                  | SELECT | t
 public.saas_registration_tariff_policy | tariff_id            | SELECT | t
 public.saas_registration_tariff_policy | updated_at           | UPDATE | t
 public.saas_trial_policy               | key                  | SELECT | t
 public.saas_trial_policy               | duration_days        | SELECT | t
 public.saas_trial_policy               | discount_window_days | SELECT | t
 public.saas_trial_policy               | post_trial_behavior  | SELECT | t
 public.saas_trial_policy               | post_trial_tariff_id | SELECT | t
 public.saas_trial_policy               | start_event          | SELECT | t
 public.saas_trial_policy               | is_active            | SELECT | t
 public.saas_trial_policy               | updated_at           | UPDATE | t
 public.saas_tariffs                    | id                   | SELECT | t
 public.saas_tariffs                    | is_active            | SELECT | t
 public.saas_organization_trials        | tariff_id            | INSERT | t
 public.saas_organization_trials        | discount_ends_at     | INSERT | t
 public.saas_organization_trials        | ends_at              | INSERT | t
 public.saas_organization_trials        | post_trial_behavior  | INSERT | t
 public.saas_organization_trials        | post_trial_tariff_id | INSERT | t
 public.be_organizations                | tariff_id            | UPDATE | t
 public.be_organizations                | updated_at           | UPDATE | t
 public.admin_audit_log                 | details              | INSERT | t
(21 rows)

$ psql -c "… has_column_privilege(…,'public.saas_trial_policy','tariff_id','SELECT')"
ERROR:  column "tariff_id" of relation "saas_trial_policy" does not exist
```

Последняя строка — то же самое с другой стороны: колонки, которую читало старое тело, нет ни в базе,
ни в декларации.

**RLS.** `saas_trial_policy` под `FORCE ROW LEVEL SECURITY`; политики `rev10_named_root_owner_gate_188`
(RESTRICTIVE) и `rev10_seam_business_188` адресованы `app_seam_specialist_provision_owner` — владелец
шва проходит. Ни одной политики миграция не трогает.

---

## 5. Перепись того же класса ошибок — тел, которые не могут завершиться никогда

Сделана интроспекцией, а не чтением: для каждой функции схем `app`/`app_ext`/`integrator` из
`pg_proc.prosrc` разобраны привязки `FROM|JOIN|UPDATE|INTO|USING <schema>.<table> [AS] <alias>`, затем
все ссылки `alias.column`, все колонки `INSERT INTO … (…)` и поля record-переменных, набранных через
`SELECT rel.* INTO v_x`, сверены с реальными колонками по каталогу. Строковые литералы и комментарии
вырезаны (иначе `'auth.email-otp.challenge.consume'` читается как `challenge.consume`), системные
колонки (`ctid`, `xmin`, …) учтены.

**DEV (`bcb_webapp_dev`), 450 функций — ДО правки, 7 находок в двух функциях:**

```
[alias-ref]    app.start_provisioned_organization_trial()   policy.tariff_id      -> public.saas_trial_policy
[insert-col]   app.start_provisioned_organization_trial()   grace_ends_at         -> public.saas_organization_trials
[record-field] app.start_provisioned_organization_trial()   v_policy.tariff_id    -> public.saas_trial_policy
[record-field] app.start_provisioned_organization_trial()   v_policy.grace_days   -> public.saas_trial_policy
[alias-ref]    app.read_platform_analytics_dashboard(…)     a.patient_user_id     -> public.be_appointments
[alias-ref]    app.read_platform_analytics_dashboard(…)     m.media_id            -> public.lfk_exercise_media
[alias-ref]    app.read_platform_analytics_dashboard(…)     c.video_url           -> public.media_playback_client_events
```

**Три находки в `read_platform_analytics_dashboard` — ложные, проверено чтением тела.** Алиасы
`a`, `m`, `c` там переиспользованы в разных областях видимости и в спорных местах указывают на CTE, а
не на схемную таблицу: `active_instances AS a` (строка 277 тела), `exercise_media_ids AS m` (214),
`cms_media_ids`/`FROM cms_pages AS c` (148, 204). `cms_pages` вообще не таблица — CTE, объявленный на
строке 148 (`SELECT … FROM pg_class WHERE relname='cms_pages'` → 0 строк). Мой разбор привязал эти
алиасы к схемным отношениям из соседних областей (`public.media_playback_client_events AS c` на
строке 309) — ограничение разбора, не дефект тела.

**DEV после правки — 3 находки, все три те самые ложные. Настоящих нет.**

**TEST (`bersoncarebot_test`), 455 функций — те же 4 настоящие находки в той же одной функции** плюс
те же 3 ложные. TEST не трогал (граница брифа); правка доедет туда штатным деплоем этой миграции.

**Итог: во всём контуре ровно ОДНА функция несла имена колонок, которых у её таблиц нет, — та, что
стоит на пути регистрации клиники. Она починена. Ставить вопрос владельцу не о чем.**

---

## 6. Доказательства

### 6.1 `bash deploy/host/migrate-dev.sh --preflight` — PASS, с откатом

```
$ bash deploy/host/migrate-dev.sh --preflight
…
   session_user   |            current_user             | can_create_public
------------------+-------------------------------------+-------------------
 bcb_dev_migrator | app_seam_specialist_provision_owner | f
CREATE FUNCTION
…
ROLLBACK
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": pending=8 total=38 reapplied=0 foreign-ledger-rows=0 relabeled=0 dropped-foreign=0 dropped-foreign-by-hash=0 unapplied=0
migrate-dev preflight: PASS (post-cutover DEV; rollback-only webapp DDL validation complete)
EXIT=0
```

`pending=8` = 7 чужих ожидающих миграций + эта. Statement исполнен именно от
`app_seam_specialist_provision_owner`, как объявлено в `BCB-MIGRATION-OWNER`.

Чтобы preflight вообще запустился из worktree, в него скопированы канонические DEV-env главного
дерева (`.env`, `apps/webapp/.env.dev` — оба в `.gitignore`): без них wrapper останавливается на
`FATAL: DEV API env path guard failed`, и это ограничение worktree, а не дефект.

### 6.2 Оба `--check` генератора — побайтно

```
$ node deploy/postgres/privileges/generate-cli.mjs --all --check
--check: артефакты соответствуют декларации побайтно.        (EXIT=0)
$ node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only --check
--check: артефакты соответствуют декларации побайтно.        (EXIT=0)
```

### 6.3 `pnpm test:db-privileges` — без падений

```
# tests 190
# pass 142
# fail 0
# skipped 48
```

(190 против 186 до правки — добавлены четыре случая нового поведенческого файла; они opt-in и в этом
прогоне пропущены, как и остальные `devDbProof`.)

### 6.4 Статические гейты миграций

```
$ node scripts/check-migration-privileges.mjs           → check-migration-privileges: OK (39 migration files)          EXIT=0
$ node scripts/check-migration-privileges.mjs --self-test → self-test OK (7 red fixtures, 1 green fixture)              EXIT=0
$ bash apps/webapp/scripts/check-drizzle-migration-order.sh → check-drizzle-migration-order: OK                          EXIT=0
$ bash apps/webapp/scripts/check-legacy-migrations-frozen.sh                                                             EXIT=0
$ npx eslint deploy/postgres/privileges/provisioned-organization-trial.devDbProof.test.mjs                               EXIT=0
```

### 6.5 Затронутые webapp-сюиты — зелёные

```
$ npx vitest run src/modules/saas-billing/service.test.ts \
    src/infra/repos/specialistSignupSlugOrder.unit.test.ts \
    src/infra/repos/pgPlatformEntitlements.singletonPolicies.test.ts \
    src/app/api/account/first-run/bind-specialist/route.route.test.ts
 Test Files  4 passed (4)
      Tests  82 passed (82)
```

Соседнее доказательство выдачи не сломано:

```
$ RUN_SPECIALIST_OWNER_PROVISIONING_DB=1 node --test deploy/postgres/privileges/specialist-owner-provisioning.devDbProof.test.mjs
# tests 2  # pass 2  # fail 0
```

### 6.6 ЖИВАЯ регистрация клиники до конца на DEV

Тот же dev-сервер из этого worktree, порт 5303.

```
POST /api/auth/specialist-signup/start
  {"ok":true,"challengeId":"7738578c-a874-4dab-af5d-70b0bca3ac48","retryAfterSeconds":60}
код из public.outgoing_delivery_queue (event_id = 'auth-otp:email:7738578c-…') → 897018
POST /api/auth/specialist-signup/confirm
  HTTP/1.1 200 OK
  {"ok":true,"redirectTo":"/app/account?tab=security",
   "organizationId":"26aca960-950d-4f39-b67d-fcfbe06a6530",
   "specialistId":"9fa0fbb2-bdc5-4ad1-8e80-4a140868cb2b",
   "membershipId":"c7d88ff8-f60e-4fd3-a07a-d06357a05423"}
```

Строки в базе:

```
organization_id | 26aca960-950d-4f39-b67d-fcfbe06a6530
title           | Клиника Успех Б2
is_active       | t
tariff_id       | 59fbb0c9-371d-4fcc-8602-78e174c81062
tariff_name     | КЛИНИКА          tariff_active | t

membership_id  | c7d88ff8-f60e-4fd3-a07a-d06357a05423
role           | owner            status | active     has_specialist | t

trial_id             | 468bd655-5fc3-4a58-9103-a8fd68f59cc9
tariff_id            | 59fbb0c9-371d-4fcc-8602-78e174c81062   (= КЛИНИКА, тариф регистрации)
status               | active
started_at           | 2026-08-22 15:21:48.032056+03
ends_at              | 2026-09-21 15:21:48.032056+03    duration        | 30 days
discount_ends_at     | 2026-09-21 15:21:48.032056+03    discount_window | 00:00:00
post_trial_behavior  | blocked
post_trial_tariff_id | (null)
created_by           | 10d0d77d-af33-435f-9062-491750b3fce1

admin_audit_log: saas_trial_start / ok
  after = {"tariffId":"59fbb0c9-…","startEvent":"organization_provisioned","durationDays":30,
           "postTrialBehavior":"blocked","postTrialTariffId":null,"discountWindowDays":0}
```

Тариф, срок и поведение после трила осмысленны и совпадают с настройками стенда: живая строка
`public.saas_trial_policy` = `duration_days=30, discount_window_days=0, post_trial_behavior='blocked',
post_trial_tariff_id=NULL`, живая `saas_registration_tariff_policy.tariff_id = 59fbb0c9-…` (КЛИНИКА,
активен). Нулевое окно скидки на стенде — настройка владельца, поэтому арифметика окна отдельно
доказана тестом ниже на политике `14/5`.

**Как тело попало в каталог DEV для этого прогона (отклонение, называю прямо).** `--execute` брифом
запрещён, а без применённого тела живого 200 не получить. Поэтому в каталог поставлен ровно один
statement этой миграции — тем же способом, каким его ставит раннер: временный `GRANT CREATE ON SCHEMA
app` + `GRANT USAGE ON LANGUAGE plpgsql` владельцу шва, `SET LOCAL ROLE
app_seam_specialist_provision_owner`, `CREATE OR REPLACE`, снятие грантов, `COMMIT`. Строки в ledger
НЕ добавлено, reconcile не запускался, права не менялись, OID и владелец прежние, гейт побайтно равен
артефакту — reconcile нечего править. **Ведущему всё равно нужно провести миграцию штатным
`bash deploy/host/migrate-dev.sh --execute`**: повторный `CREATE OR REPLACE` тем же байтам
идемпотентен.

### 6.7 Поведенческий тест на исправленный путь + инъекция неисправности

`deploy/postgres/privileges/provisioned-organization-trial.devDbProof.test.mjs` (opt-in,
`RUN_PROVISIONED_ORGANIZATION_TRIAL_DB=1`). Тело кандидата берётся из **файла миграции** — из того,
что ПРИЗЕМЛЯЕТСЯ; соседнее доказательство берёт его из runtime-overlay и потому этой поломки не
видело. Гранты шва и выражение гейта — из сгенерированного артефакта. Всё внутри транзакции с
`ROLLBACK`. Политика в транзакции приводится к `duration_days=14, discount_window_days=5`, иначе на
стенде с нулевым окном проверка `discount_ends_at` прошла бы вхолостую при любом теле.

```
$ RUN_PROVISIONED_ORGANIZATION_TRIAL_DB=1 node --test deploy/postgres/privileges/provisioned-organization-trial.devDbProof.test.mjs
ok 1 - гейт кандидата — ровно тот, который рендерит генератор
ok 2 - пробная подписка заводится на тариф регистрации со сроками из политики
ok 3 - несуществующая колонка снова роняет выдачу: policy.tariff_id (колонки нет у saas_trial_policy)
ok 4 - несуществующая колонка снова роняет выдачу: grace_ends_at (колонка saas_organization_trials зовётся discount_ends_at)
# tests 4  # pass 4  # fail 0
```

Тест 2 проверяет строку трила целиком: `tariff_id` = тариф регистрации, `status=active`,
`ends_at - started_at = 14 days`, `discount_ends_at - ends_at = 5 days`, `post_trial_behavior=blocked`,
`post_trial_tariff_id` пуст, `created_by` = регистрирующийся; плюс тариф организации и строку аудита
`saas_trial_start/ok/true/14/5`.

Тесты 3 и 4 — **инъекция неисправности внутри самого теста, а не разовая правка руками**: каждый
возвращает в тело кандидата ровно одно несуществующее имя колонки (для `policy.tariff_id` —
дословный JOIN из сломанного каталога), и проба обязана покраснеть `42703`, а строки трила не
появиться. Продукт при этом не трогается вовсе: инъекция живёт в памяти теста, файл миграции
неизменен (`git status` чист по нему), а прогон 6.7 сделан на уже написанном файле.

---

## ВОПРОСЫ ВЛАДЕЛЬЦУ:

Нет. Продуктового выбора в задаче не оказалось: какой тариф несёт трил и какой применяется после
него — выводится из схемы и из двух живых реализаций того же старта трила в приложении (§1), и
правильная редакция тела уже лежала в репозитории.

## НЕ СДЕЛАНО:

1. **`bash deploy/host/migrate-dev.sh --execute` не запускался** — запрещён брифом, DEV ведёт
   ведущий. Миграция `20260822T120000_…` остаётся pending в ledger. Тело в каталог DEV поставлено
   отдельным statement для живого прогона (§6.6) — ledger это не двигает, штатное применение за
   ведущим.
2. **TEST не трогал.** Там то же сломанное тело (перепись §5 подтверждает: те же 4 находки на
   `bersoncarebot_test`). Регистрация клиники на TEST продолжит падать `503 provisioning_pending`,
   пока миграция не доедет туда деплоем.
3. **Полный CI не запускался и push не делался** — запрещено брифом. Прогнаны: `test:db-privileges`,
   гейты миграций, eslint нового файла, 4 затронутых webapp-сюиты, оба `--check` генератора.
   `pnpm typecheck` не гонял: правка — SQL-миграция и `.mjs`-тест, TypeScript не менялся.
4. **Галочка Б2 не закрыта** (запрещено брифом). Закрывать её нужно приёмкой ведущего/владельца
   после применения миграции на DEV и TEST.
5. **Три ложные находки переписи (§5) в `app.read_platform_analytics_dashboard` не устранены в самом
   разборе** — это ограничение моего одноразового скрипта (переиспользование алиасов между CTE и
   схемными отношениями), а не дефект тела; постоянным гейтом разбор не делал, так как в брифе такой
   задачи нет. Если такой гейт нужен — это отдельное решение владельца.
6. **Строки живого прогона на DEV не убраны** (организация `26aca960-…`, её членство, специалист,
   трил, а также «мусорная» неисполненная заявка от воспроизведения `b2-trial-repro-…`). DEV — рабочая
   песочница; строки оставлены как предъявляемое доказательство.
