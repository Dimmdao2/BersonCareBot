# V9b S03 — независимый аудит владения бронями (`ff803c1e9`)

Кандидат: `ff803c1e9` против родителя `9b0d50dfe`, ветка `wt/v9b-s03-booking-ownership`.
Authority: `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md` §В9б + `V9B_IMPLEMENTATION_SLICES.md` S03.
Роль: `auditor-live` (AGENTS.md §10b, §24.4, §24.5). Карточка `#1081`.

Классификация по §24.4 — этап смешанный:

- **поведение (тест + fault injection):** stamp/abort/idempotency миграции, запись org писателями,
  self-read NULL-org истории у существующего reader-шва;
- **разовое действие (взгляд по итоговому diff/introspection):** nullability 0309, отсутствие
  S04/S05 (REVOKE/RLS/FORCE), синхронность journal↔schema, file-scope.

---

## 1. Слепой kill-set (составлен по authority ДО чтения тестов кандидата)

Записан до открытия `*.postgres.integration.test.ts` кандидата. Каждый класс — независимый путь
отказа, не отдельный `it`.

### A. Проставление владельца (требование 1)

| ID | Поломка, которую обязан поймать oracle |
| --- | --- |
| A1 | Живой точный канонический родитель есть — строка НЕ проставлена (осталась NULL). |
| A2 | Родитель soft-deleted — исключён фильтром `deleted_at IS NULL`, строка осталась NULL. |
| A3 | `zero_match` (нет неизменяемого родителя) — проставлен догадкой: единственная организация в БД / членство / телефон / совпадение таймслота. |
| A4 | `zero_match` удалён, помечен, перенесён в карантин вместо сохранения NULL. |
| A5 | Проставлена организация НЕ канонического родителя (join по неверному ключу / источник org — сторонняя таблица). |

### B. Атомарный abort и идемпотентность (требование 2)

| ID | Поломка |
| --- | --- |
| B1 | `multiple_match` (два кандидата-родителя) — не падает, произвольно выбирает одного. |
| B2 | Противоречие организации в mapping-строке — не падает. |
| B3 | `user_mismatch` — не падает. |
| B4 | `provider_mismatch` — не падает. |
| B5 | Исключение бросается, но ранее выполненные UPDATE закоммичены (миграция не атомарна). |
| B6 | Повторный прогон не идемпотентен: падает на уже проставленных строках либо меняет ранее записанную org. |

### C. Писатели (требование 3)

| ID | Поломка |
| --- | --- |
| C1 | `createPending` вставляет бронь с `organization_id IS NULL` (org не разрешена/не прокинута). |
| C2 | Нативная запись проекции приёма пишет NULL org. |
| C3 | Утрачен отказ кросс-org upsert: конфликтный upsert молча переписывает org чужой строки. |
| C4 | Tombstone удаления сотрудником теряет разрешённую org. |
| C5 | Тип исторического чтения объявляет org как non-null, хотя БД возвращает NULL (нечестный тип). |

### D. Существующий пациентский reader (требование 4)

| ID | Поломка |
| --- | --- |
| D1 | Подписанный пациент НЕ получает свою собственную NULL-org legacy-бронь (регресс истории). |
| D2 | Подписанный пациент получает ЧУЖУЮ NULL-org строку (утечка). |
| D3 | Вызов без принципала получает NULL-org строки (утечка). |
| D4 | Регресс существующего поведения: каноническая своя строка перестала возвращаться либо чужая org-строка стала возвращаться. |

### E. Границы слайса (требование 5) — «взгляд»

| ID | Поломка |
| --- | --- |
| E1 | 0309 делает колонку `NOT NULL` или ставит default — NULL-история невыразима. |
| E2 | 0309 содержит REVOKE / DROP / DELETE / `ENABLE ROW LEVEL SECURITY` / `FORCE` — заезд в S04/S05. |
| E3 | Journal рассинхронизирован со схемой (нет записи, дубль idx, неверный порядок) — по watermark-мигратору файл не доедет никогда. |
| E4 | `schema.ts` не объявляет колонку либо объявляет её `notNull` — дрейф Drizzle. |
| E5 | Нет индекса на новую горячую мультиарендную колонку (AGENTS.md §1 «Индекс на горячую колонку — в том же PR»). |

---

## 2. Что запускалось

Приватный одноразовый PostgreSQL-кластер проекта Vitest `postgres-integration`
(`pnpm --dir apps/webapp test:postgres`, `vitest.postgres.config.ts` → `vitest.postgres.globalSetup.ts`).
Ни DEV (`bcb_webapp_dev`), ни TEST не мутировались; 0309 к ним не применялась. Единственное чтение DEV —
`BEGIN READ ONLY` introspection (см. §5, E-пункты).

Базовый прогон кандидата на `ff803c1e9`: **6 файлов / 17 тестов зелёные**, реплей миграций достиг
`count=310`. Тот же результат воспроизведён на восстановленном дереве в конце аудита.

---

## 3. Fault injection: 18 из 18 классов убиты

Каждая инъекция — временная правка ровно одного продуктового места, полный прогон проекта
`postgres-integration`, затем автоматическое восстановление файла и проверка `git diff --quiet`
(`RESTORED-CLEAN` после каждой строки таблицы).

| Класс | Что сломано | Какое утверждение покраснело |
| --- | --- | --- |
| A1/A2 | во все три join'а `candidate_signals` добавлен `AND a.deleted_at IS NULL` | `stamps exact live and soft-deleted canonical parents…` |
| A3/A4 | `match_count = 0` перестал быть `zero_match`, org берётся `coalesce(..., первая be_organizations)` | `preserves a zero-match historical row as NULL…` + `reuses the patient reader…` |
| A5 | `SET organization_id` берёт произвольную ЧУЖУЮ организацию вместо родительской | `stamps exact live and soft-deleted…` + `preserves a zero-match…` |
| B1 | условие `multiple_match` заменено на `false` | `classifies multiple_match when immutable native identities contradict…` |
| B2 | снят детектор `p.mapping_org_mismatch` | `B2 aborts the whole migration when the mapping organization contradicts…` (**тест добавлен аудитором**) |
| B2+ | ветка `be_external_entity_mappings` вырезана из `candidate_signals` | `B2+ stamps a retired-provider row…` + `B2 aborts…` (**добавлены аудитором**) |
| B3 | условие `user_mismatch` обёрнуто в `false AND (...)` | `classifies cross-identity user_mismatch…` |
| B4 | условие канонического `provider_mismatch` обёрнуто в `false AND` | `classifies cross-organization provider_mismatch…` |
| B5 | `RAISE EXCEPTION` → `RAISE WARNING` (abort перестал быть атомарным) | все три abort-теста: сообщение об ошибке отсутствует И `information_schema` показывает уцелевшие колонки |
| B6 | `ADD COLUMN IF NOT EXISTS` → `ADD COLUMN` (повторный прогон падает) | `…and reruns idempotently` |
| C1 | `createPending` пишет `NULL::uuid` вместо `$19` | `persists the canonical organization through pending booking…` |
| C3 | `WHERE appointment_records.organization_id = EXCLUDED.organization_id` заменён на перезапись org | `rejects a conflicting upsert and leaves the existing organization unchanged` |
| C4 | tombstone пишет `NULL::uuid`, org-guard снят | `writes the resolved canonical organization into a staff-delete tombstone` |
| D1 | из reader'а убрана ветка `row.organization_id IS NULL` | `reuses the patient reader for self-owned NULL-org history…` |
| D2 | `platform_user_id = v_patient` ослаблено до `OR row.organization_id IS NULL` | тот же тест |
| D3 | сняты guard на принципала и проверка активного `org_enrollments` | тот же тест |
| D4a | каноническая ветка reader'а вырезана целиком | `D4 keeps the canonical self-read and its organization wall…` (**добавлен аудитором**) |
| D4b | снята org-стена канонической ветки (`row.organization_id = v_org` + EXISTS) | тот же (**добавлен аудитором**) |

**Убито 18/18.** Непойманных классов из слепого списка не осталось.

Две первые инъекции (`A3`, `B3`) в первой редакции оказались неэффективными не из-за тестов, а из-за
моей ошибки: `AND false`, дописанное к последнему операнду цепочки `OR`, по приоритету не отключает
условие, а `count(be_organizations) = 1` не выполняется на seed-шаблоне. Обе переписаны и убили свой
класс — записано, чтобы «зелёный прогон» не был засчитан за доказательство ошибочной инъекцией.

### Классы, которые кандидат НЕ покрывал (тесты дописаны аудитором один раз)

- **B2 — противоречие организации в retained rubitime-mapping.** Требование 2 называет этот класс явно,
  но снятие детектора `mapping_org_mismatch` оставляло 17/17 зелёными. Вся ветка
  `be_external_entity_mappings` (единственное доказательство владения для retired-provider строк) не
  проверялась ни положительно, ни отрицательно.
- **D4 — неотрегрессированное каноническое чтение.** 0309 перезаписывает
  `app.read_current_patient_booking_rows` целиком, и это единственный reader пациента во всём репозитории
  (`rg` даёт 0199/0251/0262/0309, `pgPatientBookings.ts` и тест кандидата — других потребителей нет).
  Каноническую ветку можно было вырезать целиком или снять с неё org-стену — 17/17 оставались зелёными.
  Молчаливая поломка этого места означает пустой список записей у КАЖДОГО пациента.

Три дописанных оракула проходят на исходной реализации, то есть **дефекта поведения в B2/D4 нет —
отсутствовало доказательство**. Их fault injection подтверждён (строки B2, B2+, D4a, D4b выше).
Исходник — приложение A; по §24.5 он передаётся воркеру как фиксированный oracle.

---

## 4. Finding

### MUST FIX — REG-1: админ больше не может удалить legacy-запись, которую S03 обещает сохранить

**Где:** `apps/webapp/src/infra/repos/pgAppointmentProjection.ts`, `softDeleteByIntegratorId` —
добавленная проверка `if (organizationId && row.organization_id !== organizationId) throw
AppointmentProjectionOrganizationMismatchError()`.

**Достижимый сценарий.** `POST /api/admin/appointment-records/:integratorRecordId/soft-delete`
всегда передаёт `organizationId: gate.ctx.organizationId`. Для исторической строки с
`organization_id IS NULL` сравнение `NULL !== '<uuid>'` истинно → исключение → `catch` возвращает
`false` → маршрут отвечает `404 {ok:false,error:'not_found'}`. Кнопка живая: блок «Администратор»
(`AdminDangerActions.tsx`) рендерится из `ClientProfileCard.tsx:298` и
`SubscriberProfileCard.tsx:138`, а `sampleRecordId = appointmentHistory[0]?.id` — самая свежая запись
пациента, то есть ровно legacy-строка у пациента с историей. Пользователь видит «Ошибка удаления записи».

**До S03 это работало.** Колонки `organization_id` не существовало;
`resolveLegacyAppointmentCanonicalTarget` для не-`be:` идентификатора возвращает `null`, отказа не
было, soft-delete проходил. То есть S03 превращает «любой админ может убрать legacy-запись» в «не может
никто» — для тех самых строк, ради сохранения которых сделан коммит (14 из 233 непроверяемых строк DEV —
`appointment_records`).

**Что нарушено.** Требование 4 «Existing canonical/self and tenant behavior must not regress» и
требование 5 «0309 … does not introduce S04/S05 ACL behavior»: план прямо относит staff-delete
capability к S04 (`V9B_IMPLEMENTATION_SLICES.md` строка 60 — «S04 exact integrator-record and
staff-delete capability»). Ни одна строка authority не разрешает S03 отказывать в записи по NULL-org.

**Воспроизведение (падает на исходной реализации, приложение A, тест `REG-1`):**

```
pnpm --dir apps/webapp test:postgres
  × REG-1 keeps a NULL-org legacy record soft-deletable by an admin, as before S03
    AssertionError: expected false to be true
```

Фикстура: одна `appointment_records`-строка с внешним `integrator_record_id` и без mapping → после 0309
её `organization_id` равен NULL (проверяется в самом тесте) →
`softDeleteByIntegratorId(id, { organizationId: ORG_A })` возвращает `false` вместо `true`.

**Решение — не моё.** Либо снять отказ для `organization_id IS NULL` до S04 (сохранив отказ при
несовпадении двух непустых org), либо владелец/лид фиксирует, что потеря этой возможности намеренна, —
и тогда это записывается в `V9B_IMPLEMENTATION_SLICES.md` S03, а не остаётся молча в коде.

### Не finding (проверено и снято)

- **Убрана phone-history резолюция `platform_user_id` в `upsertRecordFromProjection`** (раньше владелец
  выводился из `user_phone_history`/`platform_users` по телефону, теперь берётся `appt.platformUserId`,
  который у staff-созданного приёма может быть `null`; `ON CONFLICT` тоже сменился с трёхветочного
  `CASE` на безусловный `EXCLUDED`). Поиск потребителей `appointment_records.platform_user_id` по
  `apps/webapp/src` и `apps/integrator/src` даёт **ноль** читателей — наблюдаемого последствия сегодня
  нет, пути воспроизведения нет. Классифицирую как наблюдение, а не finding (AGENTS.md §24.6).
- **Из payload reader'а убраны ключи `source` и `compat_quality`.** Тип `Row` и `mapRow`
  (`pgPatientBookings.ts:15-81`) их не читают — мёртвая нагрузка, потребителя нет.
- **Новый фильтр `NOT (status = 'creating' AND canonical_appointment_id IS NULL)`** в ветке `upcoming`.
  Для канонических строк это no-op: прежний обязательный `EXISTS (be_appointments …)` такие строки уже
  отсекал. Фильтр нужен именно новой NULL-org ветке. Регрессии нет.
- **FK `ON DELETE CASCADE` на `be_organizations`.** Соответствует уже существующей в схеме дисциплине
  (`be_external_entity_mappings`, `be_specialists` и др. каскадируют так же); нового класса потери
  данных не вносит.

---

## 5. Построчный итог по требованиям брифа

| Пункт | Вердикт | Evidence |
| --- | --- | --- |
| 1. Ровно один канонический родитель проставляет владельца, включая soft-deleted; строка без неизменяемого родителя остаётся NULL; никакого вывода по умолчанию/членству/телефону/таймслоту, без удаления и карантина | **PASS** | A1/A2/A3/A4/A5 убиты (§3) |
| 2. Атомарный abort на ambiguity, противоречии mapping-org, user- и provider-mismatch; идемпотентность | **PASS с добавленным доказательством** | B1/B3/B4/B5/B6 убиты кандидатом; **B2 не имел оракула** — дописан аудитором, поведение верно. Атомарность подтверждена и «взглядом»: установленный `drizzle-orm@0.45.2` `pg-core/dialect.js:60` оборачивает ВСЕ pending-миграции и запись в журнал в один `session.transaction` |
| 3. Новые писатели требуют непустую организацию и сохраняют отказ кросс-org upsert; исторические read-типы честно представляют null | **PASS** | C1/C3/C4 убиты; C5 — «взгляд»: `AppointmentRecordRow.organizationId`, `PatientBookingRecord.organizationId`, `Row.organization_id` объявлены `string \| null`. Непустота организации у писателей держится конструкцией (тип `organizationId: string` в `ports.ts`), а не runtime-проверкой — это верхняя ступень §10a, замечания нет |
| 4. Существующий reader отдаёт подписанному пациенту его собственную NULL-org legacy-бронь без канонической навигации, но никогда чужую и никогда без принципала; каноническое/self и tenant-поведение не регрессирует | **FAIL** | D1/D2/D3 убиты; D4 не имел оракула — дописан, поведение верно. НО: **REG-1** (§4) — регресс существующего admin soft-delete на NULL-org строках |
| 5. 0309 остаётся nullable и не вносит S04/S05 ACL/FORCE; журнал и схема синхронны | **PASS по 0309, FAIL по границе слайса** | E1: `information_schema` в тесте требует `is_nullable = YES` для обеих таблиц. E2: в 0309 нет REVOKE/DROP/DELETE/TRUNCATE/`ROW LEVEL SECURITY`/FORCE/GRANT (совпадения `ON DELETE CASCADE` — клаузы FK, строка 425 — комментарий). E3: журнал 310 записей, дублей idx нет, idx и `when` монотонны, `0309_v9b_booking_ownership_local` = idx 309, все 310 `.sql`-файлов представлены в журнале. E4: `schema.ts` объявляет обе колонки nullable плюс оба индекса и оба FK — дрейфа нет. E5: индексы на новую горячую колонку внесены тем же файлом (AGENTS.md §1). НО enforcement-поведение S04 частично заехало в S03 кодом — см. REG-1 |

---

## 6. Расхождение в документе (не код)

`V9B_IMPLEMENTATION_SLICES.md` строки 227–228 в разделе «NOT done (pre-land gates)» утверждают, что
запись `0309_v9b_booking_ownership_local` стоит на idx 308 и её надо перенумеровать в 309. Фактически в
`meta/_journal.json` она уже idx 309 (`when` 1793539230010), что подтверждает и строка 173 того же
документа. Устаревшая строка противоречит реальности и собственной шапке файла; по AGENTS.md §1
(«Устное решение записывать туда, где описана проблема» + три состояния галочки) её надо снять тем же
коммитом, что закрывает S03. Это правка документа, а не работа по коду.

---

## 7. Вердикт

**FAIL.**

1. **REG-1** — достижимый регресс существующего админского действия на исторических строках, с точным
   воспроизведением (§4) и падающим acceptance-тестом на исходной реализации.
2. Два класса, названных требованиями брифа (противоречие mapping-org в требовании 2 и
   неотрегрессированное каноническое чтение в требовании 4), **не имели ни одного оракула** в кандидате.
   Поведение по ним оказалось верным, но «PASS только если все требуемые классы реально доказаны» —
   доказательства не было. Оно дописано и подтверждено инъекцией; по §24.5 воркер доводит набор до
   зелёного вместе с фиксом REG-1, повторный слепой аудит той же поверхности не нужен.

Что НЕ сделано этим аудитом: 0309 не применялась к DEV/TEST; PROD, billing, raw-SQL, Track D,
S04/S05 revoke/FORCE и taskdb не трогались; полный `pnpm run ci` не гонялся (scope — `app`-уровень,
repo-факторов нет, AGENTS.md §10); DEV-перепись 440/233 принята как evidence и по эвристике не
переклассифицировалась; живая проверка кнопки удаления в браузере не выполнялась — REG-1 доказан на
уровне порта и прочитанного маршрута/UI-обвязки.

Продуктовое дерево восстановлено побайтово к `ff803c1e9` (`cmp` по пяти затронутым файлам — OK),
финальный прогон восстановленного дерева: 6 файлов / 17 тестов зелёные, `count=310`. Ветка не
пушится и не мёржится.

---

## Приложение A — дописанные аудитором оракулы

Файл `apps/webapp/src/infra/repos/bookingOwnershipAuditGaps.postgres.integration.test.ts`
(в дерево не закоммичен по условию брифа «commit only that report»; воркер восстанавливает его
дословно и доводит до зелёного вместе с фиксом REG-1). На исходной реализации: 3 зелёных
(B2+, B2, D4) и 1 красный (REG-1).

```ts
/**
 * Independent audit acceptance oracles for the two S03 kill-set classes the candidate suite
 * leaves uncovered (#1081):
 *   B2 — the retained rubitime appointment mapping is the only proof for a retired-provider row;
 *        a mapping whose organization contradicts its canonical parent must abort the migration.
 *   D4 — 0309 replaces the sole patient reader wholesale, so its pre-existing canonical self-read
 *        and its organization wall must still hold after the replacement.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { PoolClient } from 'pg';
import { getPool } from '@/infra/db/client';
import { createPgAppointmentProjectionPort } from './pgAppointmentProjection';
import { getWebappSqlFromPgClient, runWebappPgText } from '@/infra/db/runWebappSql';

const migrationSql = readFileSync(
  new URL('../../../db/drizzle-migrations/0309_v9b_booking_ownership_local.sql', import.meta.url),
  'utf8',
);

const ORG_A = '30000000-0000-4000-8000-000000000001';
const ORG_B = '30000000-0000-4000-8000-000000000002';
const USER_A = '30000000-0000-4000-8000-000000000003';
const APPOINTMENT_A = '30000000-0000-4000-8000-000000000007';
const APPOINTMENT_B = '30000000-0000-4000-8000-000000000008';
const BOOKING_OWN = '30000000-0000-4000-8000-000000000009';
const BOOKING_FOREIGN = '30000000-0000-4000-8000-00000000000a';
const LEGACY_RECORD_ID = 's03-audit-rubitime-1';

/** The driver wraps the server error; the RAISE text lives on the cause chain. */
function errorMessages(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return `${error.message} ${error.cause === undefined ? '' : errorMessages(error.cause)}`;
}

describe('S03 independent audit — uncovered kill-set classes', () => {
  const pool = getPool();

  async function run<T = unknown>(queryText: string, values: readonly unknown[] = []) {
    return runWebappPgText<T>(queryText, values);
  }

  async function runOnClient<T = unknown>(
    client: PoolClient,
    queryText: string,
    values: readonly unknown[] = [],
  ) {
    return runWebappPgText<T>(queryText, values, getWebappSqlFromPgClient(client));
  }

  beforeAll(async () => {
    await run(
      `ALTER TABLE be_organizations DISABLE ROW LEVEL SECURITY;
       ALTER TABLE be_organizations DISABLE TRIGGER be_organizations_reference_catalog_snapshot;
       ALTER TABLE platform_users DISABLE ROW LEVEL SECURITY;
       ALTER TABLE be_appointments DISABLE ROW LEVEL SECURITY;
       ALTER TABLE be_external_entity_mappings DISABLE ROW LEVEL SECURITY;
       ALTER TABLE org_enrollments DISABLE ROW LEVEL SECURITY;
       ALTER TABLE patient_bookings DISABLE ROW LEVEL SECURITY;
       ALTER TABLE appointment_records DISABLE ROW LEVEL SECURITY;`,
    );
  });

  beforeEach(async () => {
    await run(`DELETE FROM app.principal_context WHERE patient_user_id = $1`, [USER_A]);
    await run(`DELETE FROM appointment_records`);
    await run(`DELETE FROM patient_bookings`);
    await run(`DELETE FROM org_enrollments WHERE platform_user_id = $1`, [USER_A]);
    await run(
      `DELETE FROM be_external_entity_mappings WHERE external_system = 'rubitime' AND external_id = $1`,
      [LEGACY_RECORD_ID],
    );
    await run(`DELETE FROM be_appointments WHERE id IN ($1, $2)`, [APPOINTMENT_A, APPOINTMENT_B]);
    await run(`DELETE FROM platform_users WHERE id = $1`, [USER_A]);
    await run(`DELETE FROM be_organizations WHERE id IN ($1, $2)`, [ORG_A, ORG_B]);
    await run(`DROP FUNCTION IF EXISTS app.read_current_patient_booking_rows(text, timestamptz)`);
    await run(
      `ALTER TABLE patient_bookings DROP COLUMN IF EXISTS organization_id;
       ALTER TABLE appointment_records DROP COLUMN IF EXISTS organization_id;`,
    );
  });

  afterAll(async () => {
    await run(
      `ALTER TABLE be_organizations ENABLE ROW LEVEL SECURITY;
       ALTER TABLE be_organizations ENABLE TRIGGER be_organizations_reference_catalog_snapshot;
       ALTER TABLE platform_users ENABLE ROW LEVEL SECURITY;
       ALTER TABLE be_appointments ENABLE ROW LEVEL SECURITY;
       ALTER TABLE be_external_entity_mappings ENABLE ROW LEVEL SECURITY;
       ALTER TABLE org_enrollments ENABLE ROW LEVEL SECURITY;
       ALTER TABLE patient_bookings ENABLE ROW LEVEL SECURITY;
       ALTER TABLE appointment_records ENABLE ROW LEVEL SECURITY;`,
    );
    await pool.end();
  });

  async function insertOrganization(id: string): Promise<void> {
    await run(`INSERT INTO be_organizations (id, title) VALUES ($1, $2)`, [id, `S03 audit ${id}`]);
  }

  async function insertAppointment(input: {
    id: string;
    organizationId: string;
    userId?: string | null;
  }): Promise<void> {
    await run(
      `INSERT INTO be_appointments (
         id, organization_id, platform_user_id, start_at, end_at,
         duration_minutes, source, status
       ) VALUES ($1, $2, $3, '2027-04-01T10:00:00Z', '2027-04-01T10:30:00Z', 30, 'native', 'confirmed')`,
      [input.id, input.organizationId, input.userId ?? null],
    );
  }

  async function insertBooking(input: {
    id: string;
    appointmentId: string | null;
    userId: string | null;
  }): Promise<void> {
    await run(
      `INSERT INTO patient_bookings (
         id, platform_user_id, booking_type, category, slot_start, slot_end, status,
         contact_phone, contact_name, canonical_appointment_id
       ) VALUES (
         $1, $2, 'online', 'general', '2027-04-01T10:00:00Z', '2027-04-01T10:30:00Z',
         'confirmed', '+70000000003', 'S03 audit', $3
       )`,
      [input.id, input.userId, input.appointmentId],
    );
  }

  async function insertLegacyRecord(): Promise<void> {
    await run(
      `INSERT INTO appointment_records (integrator_record_id, status, payload_json)
       VALUES ($1, 'created', '{"source":"rubitime"}'::jsonb)`,
      [LEGACY_RECORD_ID],
    );
  }

  async function insertAppointmentMapping(organizationId: string): Promise<void> {
    await run(
      `INSERT INTO be_external_entity_mappings (
         organization_id, entity_type, canonical_id, external_system, external_id
       ) VALUES ($1, 'appointment', $2, 'rubitime', $3)`,
      [organizationId, APPOINTMENT_A, LEGACY_RECORD_ID],
    );
  }

  async function runMigration(): Promise<Error | null> {
    const client = await pool.connect();
    try {
      await runOnClient(client, 'BEGIN');
      await runOnClient(client, migrationSql);
      await runOnClient(client, 'COMMIT');
      return null;
    } catch (error) {
      await runOnClient(client, 'ROLLBACK');
      return error instanceof Error ? error : new Error(String(error));
    } finally {
      client.release();
    }
  }

  it('B2+ stamps a retired-provider row from the retained appointment mapping', async () => {
    await insertOrganization(ORG_A);
    await insertAppointment({ id: APPOINTMENT_A, organizationId: ORG_A });
    await insertLegacyRecord();
    await insertAppointmentMapping(ORG_A);

    expect(await runMigration()).toBeNull();
    const rows = await run<{ organization_id: string | null }>(
      `SELECT organization_id FROM appointment_records WHERE integrator_record_id = $1`,
      [LEGACY_RECORD_ID],
    );
    expect(rows.rows[0]?.organization_id).toBe(ORG_A);
  });

  it('B2 aborts the whole migration when the mapping organization contradicts its canonical parent', async () => {
    await insertOrganization(ORG_A);
    await insertOrganization(ORG_B);
    await insertAppointment({ id: APPOINTMENT_A, organizationId: ORG_A });
    await insertLegacyRecord();
    await insertAppointmentMapping(ORG_B);

    const error = await runMigration();
    expect(error).not.toBeNull();
    expect(errorMessages(error)).toContain('multiple_match=1');
    const columns = await run<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('patient_bookings', 'appointment_records')
          AND column_name = 'organization_id'`,
    );
    expect(columns.rows[0]?.count).toBe('0');
  });

  it('REG-1 keeps a NULL-org legacy record soft-deletable by an admin, as before S03', async () => {
    await insertOrganization(ORG_A);
    await insertLegacyRecord();

    expect(await runMigration()).toBeNull();
    const nullOrg = await run<{ organization_id: string | null }>(
      `SELECT organization_id FROM appointment_records WHERE integrator_record_id = $1`,
      [LEGACY_RECORD_ID],
    );
    // Precondition: this is exactly the retained history S03 promises to preserve.
    expect(nullOrg.rows[0]?.organization_id).toBeNull();

    const projection = createPgAppointmentProjectionPort();
    // Pre-S03 the admin soft-delete route succeeded on a legacy record: no organization_id column
    // existed, so the caller's workspace org could not refuse it.
    await expect(
      projection.softDeleteByIntegratorId(LEGACY_RECORD_ID, { organizationId: ORG_A }),
    ).resolves.toBe(true);
    const after = await run<{ deleted_at: Date | null }>(
      `SELECT deleted_at FROM appointment_records WHERE integrator_record_id = $1`,
      [LEGACY_RECORD_ID],
    );
    expect(after.rows[0]?.deleted_at).not.toBeNull();
  });

  it('D4 keeps the canonical self-read and its organization wall after the reader is replaced', async () => {
    await insertOrganization(ORG_A);
    await insertOrganization(ORG_B);
    await run(`INSERT INTO platform_users (id) VALUES ($1)`, [USER_A]);
    await insertAppointment({ id: APPOINTMENT_A, organizationId: ORG_A, userId: USER_A });
    await insertAppointment({ id: APPOINTMENT_B, organizationId: ORG_B, userId: USER_A });
    await insertBooking({ id: BOOKING_OWN, appointmentId: APPOINTMENT_A, userId: USER_A });
    await insertBooking({ id: BOOKING_FOREIGN, appointmentId: APPOINTMENT_B, userId: USER_A });
    await run(
      `INSERT INTO org_enrollments (organization_id, platform_user_id, status)
       VALUES ($1, $2, 'active')`,
      [ORG_A, USER_A],
    );

    expect(await runMigration()).toBeNull();

    const client = await pool.connect();
    try {
      await runOnClient(
        client,
        `INSERT INTO app.principal_context (
           backend_pid, org_id, patient_user_id, nonce, expires_epoch
         ) VALUES (
           pg_backend_pid(), $1, $2, 's03-audit-canonical',
           extract(epoch FROM clock_timestamp())::bigint + 300
         )`,
        [ORG_A, USER_A],
      );
      const rows = await runOnClient<{ id: string }>(
        client,
        `SELECT booking->>'id' AS id
           FROM app.read_current_patient_booking_rows('history', '2030-01-01T00:00:00Z')`,
      );
      expect(rows.rows.map((row) => row.id)).toEqual([BOOKING_OWN]);
    } finally {
      await runOnClient(
        client,
        `DELETE FROM app.principal_context WHERE backend_pid = pg_backend_pid()`,
      );
      client.release();
    }
  });
});

```
