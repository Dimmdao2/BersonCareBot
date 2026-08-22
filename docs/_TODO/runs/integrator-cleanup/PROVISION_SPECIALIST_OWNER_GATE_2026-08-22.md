# Б2 — корень выдачи специалиста: что реально стояло на пути (22.08.2026)

Ветка `wt/provision-gate-20260822`, коммиты `7093cf28b` + отчётный.
Оракул — `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, пункт **Б2**.

## Коротко

**Задание брифа исполнено НЕ буквально, и это главный результат замера.** Бриф просил перевести
`app.provision_specialist_owner(uuid)` на строгий гейт класса `pre_session`, как сделано для десяти
корней миграцией `20260822T100000`. Такой перевод СЛОМАЛ БЫ регистрацию: этот корень исполняется не
под bootstrap-принципалом, а под identity-self принципалом ПАЦИЕНТА, и его собственное тело этого
принципала требует. Доказательство — ниже, разделом «Перечисление пути».

Настоящих стен на пути выдачи оказалось две, обе — расхождение декларации с тем, что телу нужно,
чтобы **выполниться** (AGENTS.md §1 «Перед приземлением миграции — разбор её прав»), и обе закрыты
**декларацией, без миграции**: гейт контекста и гранты принадлежат генератору привилегий и приезжают
шагом reconcile (§1 «⛔ Миграция не выдаёт и не отзывает права»).

## Перечисление пути (доказано, а не предположено)

| Шаг | Место | Что происходит |
|---|---|---|
| 1 | `apps/webapp/src/app/api/auth/specialist-signup/confirm/route.ts:46` | `stampBootstrapPrincipal(...)` — вход в маршрут под bootstrap |
| 2 | `route.ts:163` / `route.ts:192` | после подтверждения кода — `enterStaffSecuritySelfPrincipal(...)` в обеих ветках (`verified-self` и `retry-self`) |
| 3 | `apps/webapp/src/app-layer/principal/staffSecuritySelfPrincipal.ts:15` | это `enterWithDbPatientPrincipal({platformUserId, source})` — принципал **kind=patient**, роль БД `app_patient`, а не bootstrap |
| 4 | `route.ts:214` → `apps/webapp/src/infra/repos/pgOrganizationProvisioning.ts:182` | `SELECT * FROM app.provision_specialist_owner($1::uuid)` через `runWebappPgText` внутри `runWebappTransaction` — обращение **реляционное**, именованного корня в области видимости нет |
| 5 | `apps/webapp/src/infra/db/portContextRuntime.ts:315-317`, `:412` | `principal.kind === 'bootstrap'` даёт дескриптор `pre_session`; здесь принципал `patient`, поэтому дескриптор — объявленная способность `relation` роли `app_patient`, пул `patient` |

Проверка по каталогу DEV: способность `relation`/`app_patient`/класс `patient` для логина
`bcb_dev_webapp_patient` существует (`app_ext.port_context_capabilities`); обобщённой способности
`pre_session` нет и не должно быть.

**Почему перевод в `pre_session` сломал бы регистрацию.** Первый содержательный оператор тела —
`v_platform_user_id := app.require_staff_security_self_user_id()`, который зовёт
`app.current_patient_user_id()`, а тот читает `app_ext.accepted_port_contexts` строго по
`target_role='app_patient'` и без неё падает `42501 accepted patient context required`. Принятая
строка контекста в транзакции ровно одна — первичный ключ `(database_oid, backend_pid,
transaction_id)`. Контекст `pre_session` и требование `app_patient` несовместимы в одной транзакции.

**Утверждение брифа «EXECUTE отозван у `app_pre_session`» проверено и не является блокером:** ACL на
DEV — `{app_seam_specialist_provision_owner=X, app_patient=X}`. `app_pre_session` там не нужен,
потому что вызов идёт под `app_patient`.

## Что реально ломалось (замер на именованной `bcb_webapp_dev`, всё в `BEGIN … ROLLBACK`)

### Стена 1 — право, которого не хватало телу

```
42501 permission denied for table organization_slug_claims
CTX: SQL expression "NOT EXISTS ( SELECT 1 FROM public.organization_slug_claims AS current_claim
     WHERE current_claim.organization_id = NEW.organization_id AND current_claim.kind = 'current'
       AND current_claim.slug = NEW.slug )"
  ~ PL/pgSQL function app.guard_clinic_directory_current_slug() line 3 at IF
  ~ SQL statement "INSERT INTO public.clinic_public_directory_entries (...)"
  ~ PL/pgSQL function app.provision_specialist_owner(uuid) line 146 at SQL statement
```

Триггер `clinic_public_directory_current_slug_guard` на `public.clinic_public_directory_entries` —
**SECURITY INVOKER** (`app.guard_clinic_directory_current_slug()`, `prosecdef=false`), поэтому его
`SELECT` по `organization_slug_claims` исполняется от владельца definer-функции
`app_seam_specialist_provision_owner`. В декларации у этого шва был объявлен только `INSERT` на эту
таблицу. Это НЕ «DEV не сведён»: генератор не выдавал `SELECT` вовсе (проверено на артефакте
`HEAD~1` — среди 44 грантов шва строки `GRANT SELECT ... organization_slug_claims` нет).

Отдельно проверено, что упомянутый в брифе `INSERT` на ту же таблицу **в декларации есть, а в
кластере DEV нет** — вот это как раз staleness DEV, декларацию по этому поводу не трогал.

### Стена 2 — недостижимая пара контекстов

```
42501 accepted port context required
  ~ SQL statement "SELECT app.require_attested_context_for_roles(
        'app_seam_specialist_provision_owner'::name, ARRAY['app_platform_settings'::name]::name[])"
  ~ PL/pgSQL function app.start_provisioned_organization_trial() line 10 at PERFORM
  ~ PL/pgSQL function app.provision_specialist_owner(uuid) line 188 at PERFORM
```

и следом, после снятия первой:

```
42501 accepted port context required
  ~ SQL function "current_provisioned_owner_organization" statement 1
  ~ PL/pgSQL function app.start_provisioned_organization_trial() line 16 at assignment
```

`app.start_provisioned_organization_trial()` берёт человека из `app.current_patient_user_id()`
(нужна принятая строка с `target_role='app_patient'`) уже в инициализаторе `DECLARE`, а её
аттестованный гейт называл **одну лишь** `app_platform_settings`. То же у
`app.current_provisioned_owner_organization()`. Принятая строка контекста в транзакции одна, значит
пара «нужен пациент И нужен платформенный админ» недостижима при любом вызове — обе функции не могли
завершиться никогда, ни из регистрации, ни из админки.

Прямых вызовов этих двух функций из кода нет (`grep` по `apps/`, `packages/` — пусто): это
внутренние шаги той же выдачи. Поэтому они объявлены `delegatesTo`, а не расширением `execute`:
генератор расширяет допустимые роли делегата ролями вызывающей двери, **не делая делегат исполнимым
этой ролью напрямую** (`deploy/postgres/privileges/generate.mjs:1381-1404`) — тот же механизм, что
уже применён к `app.find_platform_user_ids_by_any_confirmed_email(text)`.

## Что изменено

| Файл | Строки | Что |
|---|---|---|
| `deploy/postgres/privileges/declaration.ts` | `3776-3807` | `app.provision_specialist_owner(uuid)`: `delegatesTo` дополнен `app.start_provisioned_organization_trial()`; поверхности `public.organization_slug_claims` добавлен `SELECT` с узким `operationColumns.SELECT = ['kind','organization_id','slug']` |
| `deploy/postgres/privileges/declaration.ts` | `3808-3814` | новый override `app.start_provisioned_organization_trial()`: `delegatesTo: ['app.current_provisioned_owner_organization()']` |
| `deploy/postgres/generated/privileges.bcb_webapp_dev.sql` | `2113`, `2413`, `15215` | перегенерировано |
| `deploy/postgres/generated/privileges.bersoncarebot_test.sql` | те же три | перегенерировано |
| `deploy/postgres/privileges/specialist-owner-provisioning.devDbProof.test.mjs` | новый | поведенческая проба выдачи на живой DEV, opt-in |

Итоговая дельта артефакта — **три строки на базу**:

```
-  ('app.current_provisioned_owner_organization()', 'attested', '...ARRAY[''app_platform_settings''...
+  ('app.current_provisioned_owner_organization()', 'attested', '...ARRAY[''app_patient''::name, ''app_platform_settings''...
-  ('app.start_provisioned_organization_trial()',   'attested', '...ARRAY[''app_platform_settings''...
+  ('app.start_provisioned_organization_trial()',   'attested', '...ARRAY[''app_patient''::name, ''app_platform_settings''...
-  ('app.provision_specialist_owner(uuid)', 'public.organization_slug_claims', ARRAY[...], ARRAY['INSERT']::text[]),
+  ('app.provision_specialist_owner(uuid)', 'public.organization_slug_claims', ARRAY[...], ARRAY['SELECT', 'INSERT']::text[]),
+GRANT SELECT ("kind", "organization_id", "slug") ON TABLE "public"."organization_slug_claims" TO "app_seam_specialist_provision_owner";
```

**Миграции нет.** Ни одного объекта не создано, не изменено и не удалено; изменились только права и
выражение гейта, а они целиком принадлежат генератору (§1). Поэтому и вопрос о таймштампе миграции
не возникает.

## Разбор прав по §1

1. **Какие отношения трогает тело `app.provision_specialist_owner(uuid)`** (по телу из `pg_proc` на
   именованной `bcb_webapp_dev`, включая делегатов и триггеры):
   `public.specialist_signup_intents` (SELECT … FOR UPDATE, UPDATE), `public.platform_users`
   (SELECT … FOR UPDATE, UPDATE), `public.user_contacts` (SELECT), `public.be_organization_members`
   (SELECT … FOR UPDATE, INSERT, UPDATE), `public.be_organizations` (INSERT; UPDATE — в делегате
   трила), `public.organization_slug_claims` (INSERT + **SELECT из триггера**),
   `public.clinic_public_directory_entries` (INSERT), `public.be_specialists` (INSERT),
   и через делегатов — `public.saas_registration_tariff_policy`, `public.saas_trial_policy`
   (SELECT … FOR UPDATE), `public.saas_tariffs` (SELECT), `public.saas_organization_trials`
   (INSERT), `public.admin_audit_log` (INSERT), `public.reference_catalog_baselines`,
   `public.reference_catalog_snapshot_receipts`, `public.reference_categories`,
   `public.reference_items`.
2. **Под какой ролью исполняется каждое тело.** Все три функции цепочки
   (`provision_specialist_owner`, `start_provisioned_organization_trial`,
   `seed_reference_catalog_snapshot`) — `SECURITY DEFINER` с владельцем
   **`app_seam_specialist_provision_owner`**; `current_provisioned_owner_organization()` — тоже.
   Значит и триггер-INVOKER на `clinic_public_directory_entries` исполняется от этой же роли. Сессия
   рантайма — `bcb_dev_webapp_patient` → `app_patient`, но внутрь definer-тела она не попадает.
3. **Хватает ли ОБЪЯВЛЕННЫХ прав, чтобы тело ВЫПОЛНИЛОСЬ.** Не хватало ровно одного —
   `SELECT (kind, organization_id, slug)` на `public.organization_slug_claims` (стена 1). Всё
   остальное в декларации уже есть: 44 гранта шва в артефакте покрывают перечисленные отношения,
   `FOR UPDATE`-поверхности оплачены `UPDATE` через `ROW_LOCK_SURFACES`, EXECUTE делегатов у
   владельца сохранён (`proacl` содержит `app_seam_specialist_provision_owner=X`).
   Доказано исполнением, а не чтением: см. живое доказательство ниже.
4. **Чего нет в декларации — добавлено в этой же ветке.** См. таблицу «Что изменено». Ничего, кроме
   этого `SELECT`, не добавлялось: расширение гейтов — не грант, `execute`-списки не тронуты, новых
   ролей и политик нет.

## Доказательства (реальный вывод)

### `bash deploy/host/migrate-dev.sh --preflight`

```
DELETE 219
INSERT 0 219
Drizzle owner-ordered migration already current for "bcb_webapp_dev": pending=0 total=29 verified-objects=74 foreign-ledger-rows=0
migrate-dev preflight: PASS (post-cutover DEV; rollback-only webapp DDL validation complete)
```

`pending=0` — подтверждает, что ветка не добавляет ни одной миграции. Preflight здесь не пустой: он
прогоняет declaration-derived seed стены через генератор, то есть трогает изменённую декларацию.
Worktree для этого получил копии `.env` и `apps/webapp/.env.dev` (`assert_canonical_file` отвергает
симлинк) — как у соседних worktree на боксе; в git они не попадают (`.gitignore:3`, `.gitignore:56`).

### Генератор

```
$ node deploy/postgres/privileges/generate-cli.mjs --all --check
--check: артефакты соответствуют декларации побайтно.
$ node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only --check
--check: артефакты соответствуют декларации побайтно.
```

### `pnpm test:db-privileges`

```
# tests 176
# pass 138
# fail 0
# skipped 38
```

### `pnpm lint`

Код возврата `0` (eslint + шесть репозиторных проверок + webapp lint).

### Затронутые webapp-сюиты

```
$ pnpm vitest run src/app/api/account/first-run/bind-specialist/route.route.test.ts \
    src/modules/auth/publicAuthSnapshot.unit.test.ts \
    src/infra/repos/specialistSignupSlugOrder.unit.test.ts
 Test Files  3 passed (3)
      Tests  7 passed (7)
```

### Живое доказательство на DEV в откаченной транзакции

`deploy/postgres/privileges/specialist-owner-provisioning.devDbProof.test.mjs`, opt-in, обе пробы —
`BEGIN … ROLLBACK`, постоянных строк на DEV не остаётся:

```
$ RUN_SPECIALIST_OWNER_PROVISIONING_DB=1 node --test \
    deploy/postgres/privileges/specialist-owner-provisioning.devDbProof.test.mjs
ok 1 - регистрация клиники доходит до конца: организация, членство владельца и его специалист
ok 2 - без принятого контекста дверь выдачи по-прежнему отказывает 42501, а не заводит клинику
# pass 2
# fail 0
```

Первая проба зовёт саму дверь под тем же контекстом, что ставит рантайм (способность `relation`
роли `app_patient` с `subject_ref` человека), и проверяет РЕЗУЛЬТАТ, а не факт вызова: `ok=true`,
организация, членство `owner/active` со **связанным** `specialist_id` (мёртвая мастерская), заявка
на слаг `kind='current'`, опубликованная карточка каталога, роль человека `doctor`, намерение
`provisioned` со ссылками на созданные объекты, снимок справочников клиники. Вторая держит стену:
без принятого контекста — `42501` и ноль организаций.

Проба приносит в свою транзакцию из репозитория (не выдумывает): гранты шва и выражения гейтов из
`deploy/postgres/generated/privileges.<база>.sql` и тело
`app.start_provisioned_organization_trial()` из `deploy/postgres/c5a-platform-operations-runtime.sql`.
Причина — DEV ведёт другая ветка и он отстаёт (см. «НЕ СДЕЛАНО»); доказывать надо, что объявленного
набора хватает, а не в каком состоянии кластер оказался сегодня.

Тот же прогон без файла-теста, «до» и «после», одним и тем же телом пробы:

```
=== ДО правки (гранты и гейты из артефакта HEAD~1) ===
42501 permission denied for table organization_slug_claims
=== ПОСЛЕ правки (артефакт HEAD) ===
ok=true code=<null> org=true spec=true member=true
```

### Инъекция неисправности

Ломал продукт (декларацию), перегенерировал артефакт, показывал красный, возвращал побайтно:

```
=== ИНЪЕКЦИЯ 1: снят delegatesTo (гейт делегата снова только app_platform_settings) ===
not ok 1 - регистрация клиники доходит до конца: организация, членство владельца и его специалист
    выдача специалиста не дошла до конца: 42501 accepted port context required
ok 2 - без принятого контекста дверь выдачи по-прежнему отказывает 42501, а не заводит клинику

=== ИНЪЕКЦИЯ 2: снят SELECT на organization_slug_claims ===
not ok 1 - регистрация клиники доходит до конца: организация, членство владельца и его специалист
    выдача специалиста не дошла до конца: 42501 permission denied for table organization_slug_claims
ok 2 - без принятого контекста дверь выдачи по-прежнему отказывает 42501, а не заводит клинику

=== ВОЗВРАТ ===
--check: артефакты соответствуют декларации побайтно.
```

Обе стены ловятся по отдельности и разными сообщениями — тест красный ровно на своей причине.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

1. **Тело `app.start_provisioned_organization_trial()` в кластере DEV старее репозитория и там
   ЛОМАНО.** Живая копия читает `policy.tariff_id` и `policy.grace_days`, которых в
   `public.saas_trial_policy` нет ни на DEV, ни в каноническом snapshot
   (`deploy/postgres/generated/prod-to-target/schema-pre.sql:26158`), и пишет
   `saas_organization_trials.grace_ends_at`, которой в таблице тоже нет. Любой вызов там падает
   `42703 column policy.tariff_id does not exist`. Репозиторная редакция
   (`deploy/postgres/c5a-platform-operations-runtime.sql:733`) правильная. Это runtime-overlay: его
   кладёт `runtime-overlay-rehydrate-lib.sh`, который зовёт только `deploy-test-saas.sh`, —
   **`migrate-dev.sh` overlay не применяет вовсе**. То есть на DEV эта функция чинится не reconcile,
   а отдельным прогоном overlay. Мой объём этого не покрывает и трогать DEV бриф запрещает.
   Вопрос: кто и когда прогоняет rehydrate на DEV — и не стоит ли `migrate-dev.sh --execute` тоже
   класть overlay, раз без него DEV систематически расходится с репозиторием?
2. **`execute: ['app_platform_settings']` у `start_provisioned_organization_trial()` и
   `current_provisioned_owner_organization()` — мёртвая строка.** Прямых вызовов из кода нет, а под
   контекстом `app_platform_settings` обе функции всё равно упадут на `app.current_patient_user_id()`.
   Я оставил её и добавил `delegatesTo` рядом (аддитивно, ничего не отнимая). Убирать ли
   `app_platform_settings` из `execute` вовсе — отдельное решение, в план Б2 оно не входит.
3. **Дублирующая запись контакта в `pgEmailAuth.verifyUserEmail`
   (`apps/webapp/src/infra/repos/pgEmailAuth.ts:230-233`) всё ещё на месте** и по замеру в WORK_ORDER
   роняет `confirm` c `Missing declared webapp port capability: pre_session` РАНЬШЕ, чем дело дойдёт
   до выдачи. Это ваша открытая развилка (бриф `d9b70f42e`), я её не трогал. Пока она не закрыта,
   живая регистрация на DEV/TEST до исправленной выдачи не доедет, хотя сама выдача теперь исправна.

## НЕ СДЕЛАНО

- **Миграция не написана — и не нужна.** Бриф просил перевод корня на строгий гейт `pre_session`
  миграцией; замер показал, что такой перевод ломает регистрацию (см. «Перечисление пути»). Ни один
  корень на пути регистрации в `pre_session` не переводился.
- **`bash deploy/host/migrate-dev.sh --execute` не запускался** — запрещён брифом, DEV ведёт другая
  ветка. Значит на живом DEV новые гранты и расширенные гейты ещё НЕ применены: они приедут первым
  же reconcile той ветки, которая ведёт DEV, либо отдельным разрешённым прогоном.
- **Живая регистрация через HTTP на `:5200` не прогонялась.** Причины две: DEV не сведён (стены 1 и 2
  на живом кластере ещё стоят) и тело трила там ломано (вопрос 1). Все доказательства — на уровне
  базы, в откаченных транзакциях, с принесённым из репозитория объявленным состоянием.
- **TEST и PROD не тронуты**, deploy не запускался, push и полный CI не запускались.
- **Галочка Б2 в WORK_ORDER не закрыта** — живая проверка владельцем отдельный гейт. WORK_ORDER этой
  веткой не правился: запись о перемере — за ведущим.
- **`pnpm typecheck` не запускался** (полный CI брифом запрещён). Изменённый TypeScript — только
  `declaration.ts`; `pnpm lint` (включая `eslint .` и webapp lint) прошёл кодом 0, а генератор
  исполняет `declaration.ts` через `--experimental-strip-types` в каждом из прогонов выше.
