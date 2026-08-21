# D15b/6 TEST reconcile-access repair — result

Дата: 21.08.2026. Authority: incident brief D15b/6: repair migration → reconcile-access contract
before TEST recovery; owner: «исправляй». Источник оракула: `docs/OWNER_DECISIONS.md` —
«Миграции описывают только schema/data; декларация — единственный источник доступа.»

## Причина

`20260821T040000_cut_over_canonical_contacts.sql` удалила из `public.platform_users` пять
контактных колонок (`phone_normalized`, `email`, `email_normalized`, `email_verified_at`,
`patient_phone_trust_at`) и одновременно переписала тела всех задетых функций на
`public.user_contacts`. Три hand-maintained metadata-источника генератора привилегий остались
не обновлены и продолжали называть удалённые колонки как читаемые/писомые колонки
`platform_users`:

- `deploy/postgres/privileges/function-census.ts` (`BUSINESS_SEAM_FUNCTIONS`) — 27
  `relationSurfaces`-записей с устаревшими колонками.
- `deploy/postgres/privileges/declaration.ts` — 11 самостоятельных (не наследуемых из census)
  `relationSurfaces`-блоков плюс отдельная прямая табличная декларация
  `REV10_SYSTEM_DIRECT_ACCESS['public.platform_users']` (роли `app_patient`,
  `app_platform_settings`) с теми же устаревшими колонками.
- `deploy/postgres/privileges/relation-access.ts` — прямая табличная декларация
  `REV10_CLINICAL_ACCESS['public.platform_users']` (роли `app_staff`, `app_tenant_service`) —
  третий, независимый от первых двух источник, также с устаревшими колонками.

Генератор (`generate.mjs`) транслирует эти списки в `GRANT SELECT/INSERT/UPDATE (<колонки>) ON
TABLE public.platform_users …`, поэтому закоммиченные артефакты
(`deploy/postgres/generated/privileges.*.sql`) уже содержали `GRANT ... ("email", ...)` —
именно это `reconcile-access` на TEST и получил как `ERROR: column "email" of relation
"platform_users" does not exist`.

## Проверка канонического источника тел функций

Для каждой из 27+11 задетых функций найдено каноническое тело: сперва в
`20260821T040000_cut_over_canonical_contacts.sql` (`CREATE OR REPLACE FUNCTION …`), для функций
вне этой миграции — в generated bootstrap snapshot `deploy/postgres/generated/prod-to-target/
schema-pre.sql` (канонический источник schema B bootstrap по AGENTS.md §1 «Миграции schema B»).
Во всех случаях тело уже полностью читает/пишет контакты через `public.user_contacts`; ни одна
функция не обращается к удалённой колонке `platform_users` напрямую — репозиторий не содержит
LIVE_BUG, только stale metadata. Отдельно подтверждено для `app.find_platform_user_ids_by_any_
confirmed_email(text)` и `app.email_auth_find_email_owner_conflict(uuid,text)` (оба отсутствуют
в forward-миграциях, тело — из bootstrap snapshot) и для трёх `password_login_*` non-impl
wrapper-идентичностей (в декларации у них `relationSurfaces: []`, устаревшие census-колонки
были мёртвыми, не доезжали до генератора).

Для двух прямых табличных деклараций (`declaration.ts` app_patient/app_platform_settings,
`relation-access.ts` app_staff/app_tenant_service) codePaths сверены напрямую: `pgUserProjection.
ts#getProfileEmailFields` и `pgUserByPhone.ts#loadSessionIdentityUser` уже читают контакты через
`drizzlePrimaryEmailCol`/`drizzlePrimaryEmailConfirmedAtCol` (коррелированный подзапрос к
`user_contacts` по `platformUsers.id`) и прямой `SELECT … FROM user_contacts`, без обращения к
удалённым колонкам `platform_users`. `public.user_contacts` уже имеет собственную корректную
прямую декларацию для `app_staff`/`app_tenant_service`/`app_patient` — новых грантов не
потребовалось, только удаление мёртвых колонок.

## Правка

Механически (детерминированный AST-подобный скрипт по `relation: 'public.platform_users'` /
`"relation": "public.platform_users"` блокам, с ручной проверкой diff) удалены пять удалённых
колонок из всех платформенных `relationSurfaces`/`grants.columns` записей:

- `function-census.ts`: 27 блоков.
- `declaration.ts`: 11 самостоятельных `relationSurfaces`-блоков + прямая декларация
  `app_patient`/`app_platform_settings` (`REV10_SYSTEM_DIRECT_ACCESS`).
- `relation-access.ts`: прямая декларация `app_staff`/`app_tenant_service`
  (`REV10_CLINICAL_ACCESS`), 5 `grants`-записей (SELECT/INSERT/UPDATE × 2 роли + один
  INSERT-массив).

Ни одна колонка не расширена, ни один грант не добавлен — только сужение до колонок, реально
используемых текущим каноническим телом. `public.user_contacts` доступ уже был объявлен
отдельно и не менялся. Артефакты перегенерированы штатным генератором (`generate-cli.mjs
--all`), ручной правки generated SQL не было.

## Регрессионный тест

`deploy/postgres/privileges/relation-access.test.mjs` содержал два теста с захардкоженными
списками колонок, унаследованными от домиграционного состояния (`'tenant identity grant is
operation- and column-specific'`, `'runtime settings and account email use semantic row walls
without broad patient identity access'`) — они стали red после чистки деклараций (ожидали
удалённые колонки) и обновлены под текущее каноническое тело: это и есть durable regression —
любой будущий возврат удалённой колонки в `platform_users`-грант снова красит эти тесты.

## Прогоны

```
node deploy/postgres/privileges/generate-cli.mjs --check     # 4/4 ok, побайтно
node deploy/postgres/privileges/generate-cli.mjs --all       # перегенерировано, --check затем зелёный
node deploy/postgres/privileges/generate-cli.mjs --census    # bcb_webapp_dev/bersoncarebot_test: 217/217 ACTIVE relations
node --test deploy/postgres/privileges/function-census.test.mjs
  -> 18 tests, 17 pass, 1 fail (ПРЕДСУЩЕСТВУЮЩИЙ, не связан с этой правкой — см. ниже)
node --test deploy/postgres/privileges/relation-access.test.mjs
  -> 41/41 pass (после обновления двух тестов)
node --test deploy/postgres/privileges/port-context-catalog.test.mjs               -> 16/16 pass
node --test deploy/postgres/privileges/reminder-materialization-declaration.test.mjs -> 3/3 pass
node --test deploy/postgres/privileges/migration-order.test.mjs                     -> 22/22 pass
node --test deploy/postgres/privileges/retired-db-security-oracles.test.mjs         -> 5/5 pass
node --test deploy/postgres/privileges/saas-billing-invoice-money-wall.test.mjs     -> 2/2 pass
node --test deploy/postgres/privileges/port-context-callsite-catalog.test.mjs
  -> ERR_MODULE_NOT_FOUND 'typescript' — этот worktree не имеет node_modules; предсуществующее
     окружение, не относится к правке (не запускался DB/deploy-код).
node --experimental-strip-types --check deploy/postgres/privileges/{function-census,declaration}.ts -> ok
git diff --check -- <изменённые файлы>  -> чисто
```

**Предсуществующий fail** `function-census.test.mjs` subtest 2 («b0ForwardArtifactRoots
diverged: appeared app.read_integrator_clinic_delivery_credential,
app.read_integrator_provider_runtime_setting») подтверждён идентичным на чистой базе через
`git stash` до применения этой правки — новые VK-миграционные корни (`20260821T050000_add_vk_
messenger_settings.sql`) ещё не занесены в `name-census.json`. Не тронуто по scope этого
инцидента: не про контактные колонки, требует отдельного `BCB_UPDATE_NAME_CENSUS=1` прохода.

## Границы

Не выполнялось (запрещено брифом): прямой SQL, DB-доступ, TEST/DEV/PROD restart/deploy/reapply,
disposable DB, push, полный CI. Правка ограничена тремя metadata-файлами + одним тестом +
регенерацией артефактов существующим генератором.
