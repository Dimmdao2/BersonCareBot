# В9б — исполнимая декомпозиция tenant-wall recommendation

## Роль и authority

Ты bounded security research worker; production code и migration files не меняешь. До действий прочитай
`AGENTS.md` (§1 migrations/server, §5, §6, §7, §9, §24), `docs/ORCHESTRATION_BINDINGS.md`, В9б в test-suite
plan, `V9B_WALL_RECOMMENDATION.md` и оба его source-аудита. Используй code-search до точных `rg`.

Источник оракула: `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`, В9б — «Стена стоит у данных, а не на маршруте»;
`docs/_TODO/runs/testsuite-v2/V9B_WALL_RECOMMENDATION.md` — FORCE RLS только после capability/backfill/caller
remediation, затем A1 и TEST evidence под реальными non-owner `app_*_login`.

Группа таблиц — принятое инженерное security-решение, не owner question. Scope только декомпозиция; DB/server/
DEV/TEST/PROD/deploy/push запрещены. Номера миграций не бронировать и файлы не создавать — это сделает
оркестратор по доске после принятия slices.

## Обязательный результат

Пройди реальный human/data path и разложи рекомендацию на минимальные independently auditable deliveries в
строгом порядке:

1. retirement-first пяти dead booking projections;
2. broad-grant removal + exact pre-principal/operational capabilities;
3. `organization_id` schema/backfill/quarantine для `patient_bookings` и `appointment_records`;
4. caller remediation для беспринципальных/id-only/cross-user paths;
5. policies + ENABLE/FORCE для десяти живых таблиц;
6. A1 named SELECT/DML matrix и затем разрешённый TEST enforcement под `app_*_login`.

Для каждого slice дать:

- human consequence и почему prerequisite действительно нужен до FORCE;
- exact code/schema/migration/grant-generator/deploy/test file manifest;
- exact tables, columns, FK/backrefs, principals/roles и callers;
- существующие capabilities/patterns, которые переиспользуются; новая capability только при доказанном gap;
- deterministic backfill source и fail-closed treatment orphan/ambiguous rows;
- overlap/dependency с тарифным соседом и Track D (особенно `buildAppDeps.ts`, dead projection transport,
  `stockQuotaCheck.ts`, `pgOrganizationInvites.ts`); конфликтующий slice маркировать WAIT_OVERLAP, не менять scope;
- acceptance kill-set: cross-org/no-principal/bootstrap/operational, SELECT+INSERT+UPDATE+DELETE, FORCE metadata,
  policy bypass/owner exemption; точные commands существующего A1 contour;
- один migration number need per slice (число файлов, но без назначения номера) и land/TEST order.

## Доказательность

«Нет caller/FK/grant/capability» доказывать тремя источниками: точный identifier search, code-search, обратные
ссылки в schema/registries/plans. Не копировать старые `53`/`263`/`410`/`284` без команды; runtime counts в этом
doc-only этапе не обновлять и явно оставить TEST verifier-у.

Проверь, что A1 уже существует и расширяется, а не строится второй harness. FORCE owner-role прогон не считать
tenant proof. Не предлагать прямые grants pre-principal secrets или platform-wide rows tenant-ролям.

Отчёт: `docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES.md` с closure matrix всех строк исходной
recommendation, slice table в порядке исполнения, conflict map, migration-file count, first-worker brief и
`НЕ ПРОВЕРЕНО`. Один docs-only commit `#1081`, чистое дерево; В9б не закрывать.
