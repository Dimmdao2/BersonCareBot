# В9б — независимый аудит исполнимой декомпозиции tenant-wall (#1081)

## Классификация «тест или взгляд»

Это docs-only проектирование одноразового порядка внедрения: проверять inspection, exact/code-search/backrefs и
сверкой с authority. Постоянные source-text tests не писать; DB/DEV/TEST evidence ещё не исполняется.

## Роль, authority и target

Ты независимый `auditor-live`, не автор плана и не product fixer. Прочитай `AGENTS.md` §1 «Необходимо и
достаточно»/«Как решать и задавать вопросы», §5, §7 и §24, `docs/ORCHESTRATION_BINDINGS.md`, В9б в
`docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`, принятую
`docs/_TODO/runs/testsuite-v2/V9B_WALL_RECOMMENDATION.md`, Track D authority
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` и актуальную общую доску.

Target — commit `ff443a4a4` на `wt/v9b-implementation-slices`, файл
`docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES.md`. Product code, migrations, plan-checkbox, taskdb,
grant output, DB, DEV, TEST, PROD, deploy и push запрещены.

Источник оракула: В9б требует доказуемой tenant-стены на настоящих non-owner `app_*_login`, а принятая
рекомендация фиксирует 10 FORCE-RLS таблиц, retirement-first для пяти booking projections и capability-only
доступ к pre-principal/operational таблицам. Это инженерное решение; владелец не должен выбирать таблицы, SQL
политики или порядок внедрения.

## Gate

Независимо проверь:

1. Closure matrix без потерь и расширения: все 10 FORCE-таблиц, ровно пять retirement-first проекций и все
   capability/no-RLS группы из рекомендации имеют один закрывающий slice и конечное evidence.
2. Human path: после каждого land не ломаются регистрация/логин/OTP, booking, staff membership/bootstrap,
   уведомления, web-push, analytics и integrator/worker jobs; при этом ни один tenant actor не получает чужую
   строку даже при забытом route `WHERE`.
3. Порядок зависимостей: живой caller получает principal/exact capability до revoke/FORCE; backfill доказан до
   `NOT NULL`; legacy deletion не удаляет canonical booking data; A1 предшествует общей TEST-проверке.
4. Минимальность: каждый новый schema object, capability и migration file необходим. Особенно проверь
   предложенную отдельную quarantine relation и семь migrations: не плодится ли сущность/файл там, где достаточно
   fail-closed migration abort, существующего audit/event механизма или совместного атомарного slice.
5. Реальность manifests: названные файлы, символы, schema/FK, grants, роли, scripts и команды существуют и
   соответствуют текущему коду. Число без точной команды не принимать.
6. Overlap: тарифные `stockQuotaCheck.ts`/`pgOrganizationInvites.ts` не трогаются; Track D D1/D10 не получает
   второй writer/transport. Формулировка `owner confirms/releases` не должна создавать ложный вопрос владельцу:
   overlap разрешается доской и техническим source/runtime census.
7. Каждая `WAIT_OVERLAP` имеет точное измеримое условие снятия, а не бесконечное ожидание. Найди slices, которые
   уже можно начать независимо, если первый предложенный slice фактически ждёт Track D.
8. Первый worker brief исполним сейчас либо честно выбран другой ready slice; он содержит точный scope,
   acceptance, запреты, migration-board порядок и не перекладывает инженерное решение на владельца.
9. TEST gate действительно работает под non-owner login roles, проверяет SELECT и DML, FORCE metadata,
   `rolbypassrls=false`, отсутствие owner membership и точные operational capabilities; DEV-owner output не
   засчитывается.

## Сдача

Создай только `docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES_AUDIT_REPORT.md`. Укажи target SHA,
exact commands/searches, closure/dependency matrix, findings только с достижимым impact, бинарный `PASS`/`FAIL`,
минимальный fix-round и `НЕ ПРОВЕРЕНО`. При FAIL target не переписывай. Временные изменения откати; коммит audit
artifact создаёт оркестратор после возврата.
