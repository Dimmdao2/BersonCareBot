# Слепой kill-set и результат — systemic access model (этапы 1 и 6)

Ветка `wt/systemic-access-20260827`, база `feat/doctor-ui-rebuild@3e40130e5`.
Список составлен ДО чтения существующих тестов, по authority
[`SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`](../../SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md)
(A1–A5, этапы 1 и 6). Формат: «подали такое — получили неправильное такое».

## Список и что с ним стало

| # | Поломка | Последствие | Итог |
| - | ------- | ----------- | ---- |
| K1 | Разрешающая политика арендной роли на `org: true` отношении БЕЗ `organization_id = app.current_org_id()` | сотрудник клиники A читает строки клиники B (A1) | ЗАКРЫТО: `tenantPredicateViolations` + отказ генератора |
| K2 | Организационный предикат убран из генератора, гейт остаётся зелёным | стена держится на ручном списке, а не на инварианте | ЗАКРЫТО инъекцией: см. «Инъекции» ниже |
| K3 | Пациентский entitlement-путь идёт под `app_patient` туда, где у роли ноль прав | `42501` → SSR 500 на странице контента (A2) | ЗАКРЫТО: узкий колоночный грант + пациентская ветка политики |
| K4 | Пациенту выдан table-wide SELECT на `content_access_grants_webapp` | пациент читает `token_hash` чужих грантов | ЗАКРЫТО: грант ровно на 6 колонок, `token_hash` не выдаётся |
| K5 | В пациентской ветке нет ни организации, ни собственного ключа | пациент видит грант, выданный другой клиникой | ЗАКРЫТО: обе проверки в ветке + инвариант их требует |
| K6 | Пациентский callsite объявлен на staff-only relation, перепись зелёная | разрыв A2 воспроизводится на следующей таблице (A3) | ЗАКРЫТО: `assertPatientCallsiteDoors` в `--census` |
| K7 | `DB_PRINCIPAL_CONTEXT_MODE` отсутствует/с опечаткой в продуктовом рантайме | молчаливый откат на legacy: organization/cron → `app_staff` (A3/A4) | ЗАКРЫТО: старт отказывает, старый путь достижим только явным тестовым режимом |
| K8 | Строгая проверка режима ломает тестовые harnesses | нельзя гонять существующие targeted-тесты | ПРОВЕРЕНО: `vitest.setup.ts` называет `legacy-guc` явно и работает |
| K9 | Две новые миграции получают один timestamp | порядок применения не определён именем, гейт молчит (A5) | ЗАКРЫТО: `findMigrationTimestampCollisions` |
| K10 | Новый файл добавлен в историческую collision-группу | baseline растёт вместо исчерпывающего | ЗАКРЫТО: baseline закрыт по составу группы |
| K11 | Быстрые гейты не подключены к GitHub CI | декларация и закоммиченный SQL расходятся, merge зелёный | ЗАКРЫТО: три отдельных job |

## Инъекции: что сломано → какое утверждение покраснело

| Инъекция | Красное утверждение |
| -------- | ------------------- |
| В `revision10DirectBusinessPredicate` снят организационный предикат (`if (false && carriesOrganizationColumn …)`) и удалена ветка `content_access_grants_webapp` | `generate-cli.mjs --check` → `exit 1`, «стена арендатора не доехала до политики»; 20 нарушений на 10 отношениях; `tenant-predicate-invariant.test.mjs` 3 из 5 красных |
| В политике `rev10_direct_business` подменён квал на `(current_user = 'app_staff'::name)` (состояние до 27.08) | `generatePrivilegesSql` бросает; тест «the generator refuses to emit an artifact once the tenant predicate is removed» |
| Пациентская ветка сведена к `revoked_at IS NULL` (без организации и без своего ключа) | тест «the patient branch … stays on its own row», роль `app_patient` |
| С `content_access_grants_webapp` снят грант `app_patient` | `assertPatientCallsiteDoors` → «patient-only callsite reaches a relation with no app_patient door … pgEntitlements.ts» |
| В `resolveWebappDbPrincipalContextMode` обезврежен отказ (`if (false && declared !== …)`) | 8 красных в `envDatabaseRuntime.unit.test.ts`, включая загрузку настоящего `./env` под production |
| В `findMigrationTimestampCollisions` обезврежена группировка (`tags.length < 2 || true`) | 3 красных в `migration-order.test.mjs` |

## Прогоны

| Команда | Результат |
| ------- | --------- |
| `pnpm test:db-privileges` | 172 pass, 0 fail, 140 skipped (opt-in devDbProof) |
| `pnpm test:scripts` | 39 pass, 0 fail |
| `pnpm test:db-principal` | 31 pass, 0 fail |
| `node deploy/postgres/privileges/generate-cli.mjs --check` | артефакты совпадают побайтно, `exit 0`; под инъекцией `exit 1` |
| `node deploy/postgres/privileges/generate-cli.mjs --census` | 208 ACTIVE отношений, 3257 файлов; 379 patient-only модулей против 117 отношений с пациентской дверью |
| `vitest run src/config src/infra/db src/instrumentation.portContextStartup.test.ts` | 8 файлов, 67 pass |
| `vitest run src/app/app/patient/{sections,content} src/modules/platform-access` | 4 файла, 6 pass |
| `tsc -p deploy/postgres/privileges` | чисто |
| `eslint` по затронутым файлам | чисто |
| `check-db-chokepoint`, `check-no-new-raw-sql`, `check-test-runner-visibility` | OK |

## Не доказано живьём

Живой прогон на DEV/TEST в этот ход НЕ делался (бриф: общий DEV/TEST не занимать). Остаются
непроверенными на живой базе: `42501`-отказ пациенту до правки и его отсутствие после; A/B-проба
двух клиник на `content_access_grants_webapp`; отказ старта webapp без `port-context` на реальном
сервисе. Это приёмка этапа 1 и делается вместе с этапом 7.
