# Независимый аудит S0б: тесты и рекомендации платформы

**Дата:** 12.09.2026  
**Кандидат:** `wt/exercise-store-s0b@13ef014bd`  
**Продукт:** `c04f748df`; коррекция route-test: `36af599dc`; merge с `feat`: `183e6a92b`;
live-proof и оспариваемая коррекция: `13ef014bd`  
**Authority:** `EXERCISE_STORE_PLAN.md` §5, этап S0б  
**Роль:** `auditor-live`

## Вердикт

**FAIL / не land-ready.** Два требования S0б реально нарушены:

1. Обычное создание теста и рекомендации через реальные Drizzle-порты падает. Drizzle перечисляет
   `owner_kind` даже когда поле отсутствует в `.values(...)`, а declaration намеренно не выдаёт
   `app_staff` `INSERT(owner_kind)`.
2. Статический gate стены не ловит возврат исходного пропуска `org: true` у `public.tests`.

Отдельный BLOCKED по неприменённому DEV reconcile вызван чужим catalog drift и сам по себе не является FAIL S0б.

## Оспаривание коррекции ведущего

**ОПРОВЕРГАЮ.** Тезис «непустой `.values({...})` не называет default-колонку `owner_kind`» неверен.

- Все product-вызовы просмотрены командой
  `rg -n "\\.insert\\(|\\.values\\(|\\.update\\(|\\.returning\\(" apps/webapp/src/infra/repos/pgClinicalTests.ts apps/webapp/src/infra/repos/pgRecommendations.ts`.
  Ни один payload не передаёт `ownerKind` явно; create и обе массовые вставки regions используют Drizzle,
  update корней меняет только собранный patch, а update regions удаляет и вставляет строки заново.
- Реальный query builder с непустыми product-shaped payloads проверен командой из `apps/webapp`:

  ```bash
  node_modules/.bin/tsx -e "import { drizzle } from 'drizzle-orm/pg-proxy'; import { clinicalTests, clinicalTestRegions } from './db/schema/clinicalTests'; import { recommendations, recommendationRegions } from './db/schema/recommendations'; const db=drizzle(async()=>({rows:[]})); const statements=[['tests',db.insert(clinicalTests).values({organizationId:'11111111-1111-4111-8111-111111111111',title:'x'}).returning().toSQL().sql],['clinical_test_regions',db.insert(clinicalTestRegions).values({organizationId:'11111111-1111-4111-8111-111111111111',clinicalTestId:'22222222-2222-4222-8222-222222222222',bodyRegionId:'33333333-3333-4333-8333-333333333333'}).toSQL().sql],['recommendations',db.insert(recommendations).values({organizationId:'11111111-1111-4111-8111-111111111111',title:'x',bodyMd:'x'}).returning().toSQL().sql],['recommendation_regions',db.insert(recommendationRegions).values({organizationId:'11111111-1111-4111-8111-111111111111',recommendationId:'22222222-2222-4222-8222-222222222222',bodyRegionId:'33333333-3333-4333-8333-333333333333'}).toSQL().sql]]; for (const [name,sql] of statements) console.log(name+'|'+sql);"
  ```

  Все четыре emitted INSERT начинают список колонок с `owner_kind`; значение — `default`.
- Candidate artifact проверен командой
  `rg -n "GRANT (SELECT|INSERT).* ON TABLE \\"public\\".\\"(tests|clinical_test_regions|recommendations|recommendation_regions)\\" TO \\"app_staff\\"" deploy/postgres/generated/privileges.bcb_webapp_dev.sql`:
  `owner_kind` присутствует в SELECT, но отсутствует во всех четырёх INSERT grants.
- Реальное приложение кандидата было поднято командой
  `pnpm --dir apps/webapp exec next dev --hostname 127.0.0.1 --port 5214`. После реального входа доктором из
  brief запросы `curl -X POST http://127.0.0.1:5214/api/doctor/clinical-tests ...` и
  `curl -X POST http://127.0.0.1:5214/api/doctor/recommendations ...` вернули соответственно HTTP `500`
  (`doctor_clinical_tests_failed`) и HTTP `500` (`recommendation_save_failed`). Сервер остановлен; команда
  `ss -ltnp '( sport = :5214 )'` после проверки не показывает listener.
- Новый обратный тест действительно не ослаблен в своей собственной формулировке. После временного
  `GRANT INSERT(owner_kind)` на все четыре отношения команда
  `RUN_PLATFORM_TESTS_RECOMMENDATIONS_READ_DB=1 node --test deploy/postgres/privileges/platform-tests-recommendations-read.devDbProof.test.mjs`
  дала `6 PASS / 1 FAIL`: упал тест «врач не получает права писать колонку владения». Гранты отозваны в том же
  harness; финальный запрос ниже дал `owner_kind_insert_grants|0`.

Итог: ручной SQL нового «обычного» теста не воспроизводит product SQL. Одновременно требовать, чтобы product
INSERT прошёл, и чтобы `app_staff` не имел `INSERT(owner_kind)`, с текущим Drizzle schema невозможно.

## Периметр

**S0б-PROOF → PASS →** команда
`RUN_PLATFORM_TESTS_RECOMMENDATIONS_READ_DB=1 node --test deploy/postgres/privileges/platform-tests-recommendations-read.devDbProof.test.mjs`
дала `7 PASS / 0 FAIL`. Ровно одна требуемая повторная fault injection,
`S0B_PLATFORM_POLICY_FAULT=using_true RUN_PLATFORM_TESTS_RECOMMENDATIONS_READ_DB=1 node --test deploy/postgres/privileges/platform-tests-recommendations-read.devDbProof.test.mjs`,
дала `3 FAIL`: чужая строка стала видна (`own|platform|foreign = 1|1|1`), стала видна corrupt platform-строка,
и доступ получила унаследованная роль. Это ожидаемое красное; транзакции откатились.

**S0б-1 → FAIL →** baseline-команда
`node --test deploy/postgres/privileges/tenant-predicate-invariant.test.mjs` дала `5 PASS / 0 FAIL`.
После временного удаления `org: true` ровно из declaration-строки `public.tests` та же команда снова дала
`5 PASS / 0 FAIL` (`ORG_TRUE_REMOVAL_TEST_EXIT=0`). Строка возвращена; чистый `git diff` подтвердил возврат.
Следовательно, требуемый планом статический gate эту таблицу фактически не сторожит.

**S0б-2 → PASS →** `pnpm run check:db-privileges-generated` завершилась с exit `0`: побайтно совпали privileges,
allowlist и port-context artifacts для `bcb_webapp_dev`, `bersoncarebot_test`, `therapysto_prod`. Команда

```bash
for db in bcb_webapp_dev bersoncarebot_test therapysto_prod; do
  rg -c 'CREATE POLICY "rev10_platform_lfk_read_(76|163|164|205)"' \
    "deploy/postgres/generated/privileges.$db.sql"
done
```

дала `4` для каждой базы; это четыре новые `FOR SELECT TO app_staff` policy.

**S0б-3 → PASS →** сравнение `git diff c04f748df^ c04f748df -- apps/webapp/src/infra/repos/pgClinicalTests.ts apps/webapp/src/infra/repos/pgRecommendations.ts`
и точный поиск `rg -n "includePlatformBase|exercise_catalog" apps/webapp/src` показали один механизм:
`includePlatformBase` повторяет predicate `pgLfkExercises` и задаётся вызывающей стороной только из entitlement
`exercise_catalog`. Ветка без флага оставляет старый `organization_id = current organization` predicate.
Второй product-рубильник для тех же platform tests/recommendations не найден; legacy `exercise_packages`
не решает эту видимость.

**S0б-4 → PASS →** baseline-команда
`pnpm --dir apps/webapp exec vitest run src/app/api/doctor/clinicalTestsBuiltInProgram.route.test.ts`
дала `1 file PASS / 5 tests PASS`. После временного удаления вызова `requireEntitlementForMutation` из
`apps/webapp/src/app/api/doctor/clinical-tests/route.ts` та же команда дала `2 FAIL / 3 PASS`: тест увидел
отсутствие запроса entitlement и недопустимый HTTP `200` при выключенном тарифе. Обе строки возвращены в том же
ходе; `git diff` чист.

**S0б-5 → BLOCKED →** безопасный штатный DDL preflight
`bash deploy/host/migrate-dev.sh --preflight` завершился `migrate-dev preflight: PASS`, `pending=0`, `total=183`,
`verified-objects=351`, `foreign-ledger-rows=8`. Read-only catalog closure из того же reconciler проверен командой:

```bash
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs \
  --db bcb_webapp_dev --catalog-closure-verify |
sudo -n -u postgres psql -X -h /var/run/postgresql -d bcb_webapp_dev -v ON_ERROR_STOP=1
```

Результат — exit `3`, `ERROR: undeclared managed routine: app.read_booking_payment_check(uuid)`.
Штатный `reconcile-access.mjs` не имеет dry-run и завершает success через `COMMIT`; `migrate-dev.sh --execute`
до reconcile выполняет отдельные мутации. Поэтому безопасного штатного применения с возвратом в этом ходе нет,
и execute не запускался. Это чужой drift, не FAIL кандидата.

**S0б-6 → PASS →** журнал всех DB-bearing команд этого аудита имеет единственную цель:
`-h /var/run/postgresql -p 5432 -d bcb_webapp_dev`; сам live-proof жёстко отвергает любое имя кроме
`bcb_webapp_dev`. Generated check только читает закоммиченные файлы. Команд к `bersoncarebot_test`,
`therapysto_prod` или удалённому host не было.

## Cleanup

Финальная команда:

```bash
sudo -n -u postgres psql -X -A -t -h /var/run/postgresql -p 5432 \
  -d bcb_webapp_dev -v ON_ERROR_STOP=1
```

с четырьмя read-only SELECT дала:

```text
owner_kind_insert_grants|0
temporary_audit_role|0
temporary_audit_policy|0
proof_rows|0|0
```

То есть временный grant, роль, policy и rollback-only fixtures отсутствуют. Временные source-инъекции тоже
возвращены; перед сохранением отчёта рабочее дерево было чистым.

## Tally

**Убито 6 / непойманных 2.** В шесть входят четыре policy-fault класса предыдущего прохода (один из них
перепроверен здесь), временный `GRANT INSERT(owner_kind)` и удаление route entitlement. Непойманные:

1. реальный Drizzle INSERT называет `owner_kind`, а исправленный ведущим тест моделирует другой SQL;
2. удаление `org: true` у `public.tests` не красит статический gate.

## НЕ ПРОВЕРЕНО

- Три остальные policy fault injection повторно не запускались — brief требовал перепроверить ровно одну.
- Persistent reconcile на DEV не применялся из-за указанного чужого catalog drift.
- Runtime-каталоги TEST и PROD не читались и не изменялись.
- Полный `pnpm run ci` не запускался: product tree в аудите не менялся, а релевантные targeted gates перечислены
  выше.
