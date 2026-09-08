# Приёмка: врачебная жалоба → отслеживание симптома у пациента

- **Кандидат:** `b6413042e` (ветка `wt/patient-symptom-bridge-audit-20260908`), диапазон `6102a732d..b6413042e`.
- **Authority:** `.lead/briefs/patient-clinical-symptom-bridge-20260908.md` (п. 1–9) + требование владельца:
  жалоба врача заводит пациенту связанное отслеживание симптома, пациент добавляет свои записи,
  врачебные и пациентские значения живут в одной истории/графике; отложенных сообщений и различия
  «кто записал» не делать.
- **Роль:** независимый `auditor-live`. Продуктовый код НЕ правился (внесённые поломки восстановлены,
  см. §4). Живой БД не касался: `--preflight`, PROD, TEST, деплой и push не выполнялись.
- **Вердикт:** **PASS по всем семи требованиям.** MUST FIX нет.

---

## 1. Слепой список поломок (составлен по authority ДО чтения тестов кандидата)

Записан до инспекции `apps/webapp/src/**` тестов, файл-протокол `/tmp/audit/killset.md`.

| # | Поломка |
|---|---|
| K1 | создание жалобы не заводит связь с отслеживанием вовсе |
| K2 | отслеживание создаётся в организации врача, а не жалобы/пациента (утечка арендатора) |
| K3 | связь ищется по совпадению НАЗВАНИЯ симптома → перехват одноимённого дневника пациента |
| K4 | путь «жалоба на первичном приёме» создаёт жалобу без отслеживания |
| K5 | путь «уточнение жалобы на повторном приёме» не зеркалит severity |
| K6 | повторная запись плодит >1 отслеживания на жалобу (нет структурной уникальности) |
| K7 | первичная severity не становится записью истории — график пуст до второй врачебной отметки |
| K8 | врачебная severity пишется мимо порта/сервиса дневника (вторая реализация записи симптома) |
| K9 | расхождение шкалы/единиц между клинической severity и дневником |
| K10 | снятие жалобы УДАЛЯЕТ отслеживание/записи → история теряется |
| K11 | снятие жалобы оставляет отслеживание активным |
| K12 | возврат жалобы в работу не поднимает отслеживание |
| K13 | принят `complaintId` другого пациента (fail-open) |
| K14 | принят id другой организации (fail-open) |
| K15 | правка `pgSymptomDiary` ломает запись пациента «в моменте» |
| K16 | изменение транзакции/DI ломает SECURITY DEFINER-корни пациента (42501 / контрактный отказ) |
| K17 | `buildAppDeps` рвёт границу модуль/инфра либо инжектит не ту реализацию |
| K18 | миграция неидемпотентна (повтор даёт дубли объектов/связей) |
| K19 | миграция содержит GRANT/REVOKE/CREATE POLICY |
| K20 | новая колонка не объявлена в декларации прав → reconcile снимет доступ |
| K21 | backfill недетерминирован / одно отслеживание достаётся многим жалобам / чужая организация |
| K22 | ломается самостоятельное отслеживание дневника (например, NOT NULL `complaint_id`) |
| K23 | нет индекса на новой горячей FK-колонке |
| K24 | нарушение имени миграции / statement-owner маркеров |
| K25 | вкладка «Симптомы дневника» врача прячет или кросс-показывает связанные отслеживания |
| K26 | фильтр видимости прячет от пациента его собственные самостоятельные отслеживания |

**Непойманного слепым списком в реализации не найдено.** Все 26 пунктов закрыты либо тестом, либо
чтением итогового кода/DDL (классификация §24.4 ниже).

---

## 2. Классификация «тест или взгляд» (§24.4)

- **Тест** (повторяемое поведение): K1, K4–K8, K10–K16 — создание/обновление/закрытие жалобы,
  зеркалирование severity, стены арендатора и пациента, единая история, маршрутизация сессии.
- **Взгляд** (разовое устройство): K2, K3, K9, K17–K26 — схема/FK/uniq, миграция и backfill,
  декларация привилегий, отсутствие GRANT/REVOKE, границы DI, индексы, RLS-политики.
- Визуальный patient UI по условию брифа не проверялся.

---

## 3. Требования: вердикт и доказательства

### R1 — создание жалобы и ОБА пути создания на приёме дают ровно одно durable-отслеживание того же арендатора и пациента, никогда по названию — **PASS**

*Тест.* `apps/webapp/src/infra/repos/pgPatientClinicalSymptomBridge.unit.test.ts`:
«жалоба из карты заводит ровно одно отслеживание…» и «жалоба, заведённая на первичном приёме…»
— `createTracking` вызван 1 раз, id отслеживания записан в саму жалобу
(`update clinical_complaint set { symptomTrackingId }`). Третий вход (уточнение на повторном приёме)
покрыт «уточнение жалобы на повторном приёме…»: связанное отслеживание переиспользуется,
второго не заводится.

*Взгляд.*
- Структурная единственность: `apps/webapp/db/schema/patientClinical.ts:161` —
  `uniqueIndex('uq_clinical_complaint_symptom_tracking_id') WHERE symptom_tracking_id IS NOT NULL`,
  плюс одна колонка на жалобе. Одна жалоба ⇒ ≤1 отслеживания; одно отслеживание ⇒ ≤1 жалобы.
  Тот же индекс и FK `ON DELETE SET NULL` в миграции
  `apps/webapp/db/drizzle-migrations/20260908T104500_clinical_complaint_links_patient_symptom_tracking.sql:29-38`.
- **K3 (по названию) закрыт по построению:** `grep -n "symptomTitle\|symptom_title"
  apps/webapp/src/infra/repos/pgPatientClinical.ts` даёт только позиции, где название ПЕРЕДАЁТСЯ в
  `createTracking` как данные (строки 178, 202, 237, 687, 755, 837, 886). Ни одного предиката поиска
  по названию нет; `ensureComplaintSymptomTracking` (`pgPatientClinical.ts:174-207`) джойнит
  `symptomTrackings.id = clinicalComplaint.symptomTrackingId`.
- **K2/K14 (арендатор):** тот же джойн требует
  `clinicalComplaint.organizationId = params.organizationId` И
  `symptomTrackings.organizationId = params.organizationId` И
  `symptomTrackings.platformUserId = params.patientUserId`; `UPDATE` жалобы ограничен теми же
  тремя условиями и `throw 'clinical_complaint_symptom_link_rejected'` при нуле строк.
- **K23:** частичный уникальный индекс покрывает новую FK-колонку — отдельный индекс не нужен.
- Три входа найдены исчерпывающе: `find apps/webapp/src/app/api -path "*complaint*" -name route.ts`
  даёт `complaints/route.ts`, `complaints/[complaintId]/updates/route.ts`,
  `complaints/[complaintId]/route.ts`; последний (`PATCH`, инлайн-правка) статус не меняет и
  severity не пишет — см. «Наблюдения» №1.

### R2 — первичная и последующие врачебные severity попадают в ту же историю, что и записи пациента «в моменте» — **PASS**

*Тест.* Все пять сценариев моста проверяют `addEntry` с `entryType: 'instant'`,
`trackingId` = связанное отслеживание и `value0_10` = severity жалобы.
`pgSymptomDiaryClinicalTransaction.unit.test.ts` проверяет, что врачебный замер исполняется
на транзакции вызывающего.

*Взгляд.*
- Второй реализации нет: `pgPatientClinical` получает `diaries` через конструктор
  (`ClinicalSymptomMirrorDiaries = Pick<SymptomDiaryPort, 'createTracking'|'addEntry'|'setTrackingActive'>`),
  а `buildAppDeps.ts:909` инжектит тот же единственный `symptomDiaryPort`, что и кабинет пациента.
- Общий график: `apps/webapp/src/app/api/patient/diary/symptom-stats/route.ts` читает
  `listSymptomEntriesForTrackingInRange` и агрегирует `aggregateSymptomEntriesByDaySplit` по
  `entry_type`. Врачебные записи идут `instant` — попадают в ту же серию, что и «в моменте»
  пациента. Различия «кто записал» нет — как и требовал владелец.
- **K9 (шкала):** обе стороны — целое 0..10. Роуты жалобы и обновления валидируют
  `z.number().int().min(0).max(10)`; `symptom_entries.value_0_10` — `smallint NOT NULL`
  (`apps/webapp/db/schema/schema.ts:636`). Конвертации нет и не нужно.
- Пациент читает врачебную запись: политика `rev10_saas_org_dormant_p0_8_4` на `symptom_entries`
  для `app_patient` гейтится `platform_user_id = app.current_patient_user_id()`, а не организацией
  (`deploy/postgres/generated/privileges.bcb_webapp_dev.sql:18775`). Мост пишет
  `platform_user_id = <пациент>` — запись видна пациенту.

### R3 — снятие жалобы архивирует/гасит связанное отслеживание, не удаляя историю; возврат в работу поднимает — **PASS**

*Тест.* «снятие жалобы гасит отслеживание и сохраняет историю, возврат в работу поднимает его»
(параметризован `resolved: true|false`): ожидается ровно
`setTrackingActive({ isActive: !resolved })`, `softDeleteTracking` не вызывается, замер пишется в
обоих случаях.

*Взгляд.* `mirrorComplaintSeverity` (`pgPatientClinical.ts:230-262`) вызывает только
`setTrackingActive`; `softDeleteTracking`/`DELETE` в мосте отсутствуют. Погашенное отслеживание
уходит из активного списка пациента (`listTrackings(activeOnly)`), но остаётся доступно по прямой
ссылке (`getTrackingForUser` фильтра `is_active` не имеет) — история цела.

### R4 — кросс-пациент / кросс-организация fail-closed — **PASS**

*Тест.* «чужая жалоба (другой пациент или другая организация) не доходит до дневника»
(`appendComplaintUpdate` → `false`, ни одного вызова дневника) и «жалоба чужой организации на
повторном приёме отказывает и не пишет в дневник» (`organization_principal_mismatch`).

*Взгляд.*
- `appendComplaintUpdate` (`pgPatientClinical.ts:848-866`) читает жалобу с
  `id AND patientUserId AND organizationId = principal`; нет строки → `return false` ДО дневника.
- Путь визита: `currentWriteOrganizationId(organizationId, existing.organizationId)`
  (`pgPatientClinical.ts:115-129`) бросает `organization_principal_mismatch` при расхождении;
  чужой пациент отсекается `clinical_target_not_found`.
- Второй рубеж в БД: `ensureComplaintSymptomTracking` перечитывает и жалобу, и отслеживание под
  теми же тремя условиями (см. R1).
- Уровень RLS (что PostgreSQL сам отвергнет чужую строку) статически прочитан
  (`rev10_saas_org_dormant_p0_8_3/_4`, `app_staff` ⇒ `organization_id = app.current_org_id()`),
  но живым прогоном НЕ доказан — см. §5 BLOCKED.

### R5 — изменения транзакции/DI не обходят существующие порты и не ломают SECURITY DEFINER-входы пациента — **PASS**

*Тест.* `pgSymptomDiaryClinicalTransaction.unit.test.ts`:
1) врачебный замер исполняется на транзакции вызывающего (иначе откат жалобы оставит осиротевшее
   отслеживание с замером);
2) запись пациента «в моменте» остаётся на корне `app.record_current_patient_symptom_entry`,
   исполняемом на ПУЛЕ — `runWebappNamedRoot` физически отказывает на транзакционной сессии
   (`apps/webapp/src/infra/db/runWebappSql.ts:87`).

*Взгляд.*
- `grep -n "runWebappNamedRoot\|getWebappSqlDb()" apps/webapp/src/infra/repos/pgSymptomDiary.ts`:
  все пять корней (строки 132, 151, 260, 403, 429) по-прежнему получают `getWebappSqlDb()`;
  на `symptomDiarySql()` переведены только обычные statement'ы.
- `getDrizzleOrMutationTx()` (`apps/webapp/src/infra/db/drizzleMutationTx.ts:9-11`) возвращает пул,
  когда транзакции нет, — вне клинического моста поведение дневника не меняется (K15).
- **K17:** порт `patient-clinical` объявляет зависимость типом из `modules/diaries/ports`, инфра-в-инфра
  инжект делает единственный `buildAppDeps`; `pnpm lint` chokepoint-гейты не затронуты.
- **K8/RLS:** врачебная запись теперь несёт `organization_id` — требование WITH CHECK политики
  `rev10_saas_org_dormant_p0_8_4`; тест проверяет, что id организации связан именно в этом
  `INSERT`, а не только в `set_config` контекста транзакции.

### R6 — миграция/backfill детерминированы и идемпотентны, следуют schema-B и декларации прав, без GRANT/REVOKE, без дублей связей — **PASS**

*Взгляд* (по условию брифа — без БД).

| Проверка | Доказательство |
|---|---|
| Имя/порядок schema B | `20260908T104500_clinical_complaint_links_patient_symptom_tracking.sql`; `node --test deploy/postgres/privileges/migration-order.test.mjs` → **28/28 pass** |
| statement-owner маркеры | каждый блок открыт `-- BCB-MIGRATION-OWNER: app_object_owner` (DDL) либо `-- BCB-MIGRATION-BACKFILL` (данные); `-- BCB-MIGRATION-VERIFY:` стоит в ведущем блоке комментариев, как в соседних миграциях |
| GRANT/REVOKE/POLICY | `grep -rn "GRANT\|REVOKE\|CREATE POLICY\|CREATE ROLE\|ALTER ROLE\|ALTER DEFAULT" <файл>` → единственное совпадение в строке 20 — прозаический комментарий. Исполняемых нет |
| Декларация прав | `symptom_tracking_id` добавлен в INSERT- и UPDATE-списки `app_staff` на `public.clinical_complaint`, `organization_id` — в INSERT-список `app_staff` на `public.symptom_entries` (`declaration.ts`). SELECT у обеих — `"columns": "table"`, дополнения не требует |
| Артефакт пересобран | `pnpm check:db-privileges-generated` → **побайтно совпадает** для `bcb_webapp_dev` и `bersoncarebot_test` (privileges, allowlist, port-context) |
| Дрейф грантов/схемы | `node --test deploy/postgres/privileges/relation-access.test.mjs` → **44/44 pass** (включая «direct staff Drizzle inserts name every schema column allowed by their INSERT grant») |
| Детерминизм backfill | id строки дневника выведен из id жалобы: `md5('clinical-complaint-symptom-tracking:' \|\| complaint.id::text)::uuid` — не `gen_random_uuid()` |
| Идемпотентность | шаг 1 `ON CONFLICT (id) DO NOTHING`; шаг 2 `WHERE complaint.symptom_tracking_id IS NULL`; шаг 3 `WHERE NOT EXISTS (SELECT 1 FROM symptom_entries WHERE tracking_id = …)`. Повтор ничего не задваивает |
| Дубли связей (K21) | ключ выводится из id жалобы ⇒ 1:1; частичный uniq запрещает отдать одно отслеживание двум жалобам |
| Жалобы без организации | пропускаются явно (`AND complaint.organization_id IS NOT NULL`) — строка дневника принадлежит арендатору, наугад не приписывается; связь заведёт первая же severity под принципалом |
| Видимость исторических | `patient_tracking_enabled = false` — сегодняшний признак сопровождения не применяется задним числом ко всей истории; врач включает переключателем во вкладке дневника |
| Типы | `symptom_key` nullable, `symptom_title` NOT NULL получает `complaint.text`; `value_0_10 smallint` получает `complaint_update.severity` (0..10) — совместимо |

*Не доказано без БД:* фактическое применение миграции (`migrate-dev.sh --preflight`) — см. §5.

### R7 — существующее самостоятельное отслеживание дневника продолжает работать — **PASS**

*Взгляд.*
- Ни один существующий путь не удалён: `git show b6413042e -- apps/webapp/src/infra/repos/pgSymptomDiary.ts`
  меняет только исполнителя (`getWebappSqlDb()` → `symptomDiarySql()`) и добавляет
  `organization_id` в staff-INSERT замера. Сигнатуры порта не менялись.
- Колонка `symptom_tracking_id` живёт на `clinical_complaint`, не на `symptom_trackings`:
  самостоятельное отслеживание никакой новой обязанности не получило (K22 не воспроизводится —
  NOT NULL-связи нет).
- Вкладка «Симптомы дневника» врача (`/api/doctor/clients/[userId]/symptom-trackings`) сохранила
  GET/POST/PATCH; вычисление `createDefault` вынесено в общий
  `app-layer/doctor/patientSymptomTrackingVisibility` и переиспользовано мостом — расчёта в двух
  местах нет (K25/K26 закрыты: правило одно и то же, чистая функция
  `patientSymptomTrackingDefaultForMode`).

*Тест.* Отдельного нового теста не писал: поломка этого класса ловится
`pgSymptomDiaryClinicalTransaction.unit.test.ts` (пациентский корень цел) и уже существующим
набором дневника; дублировать нечего.

---

## 4. Проверка новых тестов поломкой (одна целевая мутация на независимый класс)

Все мутации внесены в продуктовый код, прогнаны и **восстановлены** (`git checkout --`;
`git status --porcelain` после — только два новых файла тестов).

| # | Что сломано | Какое утверждение покраснело |
|---|---|---|
| A | `createComplaint` не вызывает `mirrorComplaintSeverity` | «жалоба из карты заводит ровно одно отслеживание…» |
| B | первичный приём не зеркалит новую жалобу | «жалоба, заведённая на первичном приёме, тоже доходит до дневника пациента» |
| C | повторный приём не зеркалит уточнение | «уточнение жалобы на повторном приёме пишет замер в связанное отслеживание» |
| D | `setTrackingActive({ isActive: true })` вместо `!resolved` | «снятие жалобы гасит отслеживание и сохраняет историю, возврат в работу поднимает его» |
| E | связанное отслеживание не переиспользуется (`existing` всегда пусто) | «повторный замер…не заводит второе» + ещё 2 |
| F | зеркалирование перенесено ДО гейта существования жалобы | «чужая жалоба…не доходит до дневника» + ещё 2 |
| G | `symptomDiarySql()` всегда возвращает пул | «врачебная запись severity исполняется на транзакции вызывающего, а не на пуле» |
| H | корень пациента переведён на `symptomDiarySql()` | «запись пациента „в моменте“ остаётся на SECURITY DEFINER-корне…» |
| I | `entryOrganizationId = null` (organization_id выпал из замера) | «врачебная запись severity…» (ассерт на параметры самого INSERT) |

**Непойманного: 0 из 9 классов.**

Первая редакция ассерта по классу I была ложной защитой (id организации совпадал с параметром
`set_config` контекста транзакции) — ассерт переписан на параметры конкретного `INSERT`, после чего
мутация I стала красной. Зафиксировано намеренно: это ровно тот дефект теста, который ищет §10b.

---

## 5. BLOCKED (живая БД не трогалась по условию брифа)

- **B1.** Реальное применение миграции и backfill на именованной DEV
  (`bash deploy/host/migrate-dev.sh --preflight`) — обязательный owner-aware rollback-only
  preflight перед landing по AGENTS.md §1. Статически миграция корректна; *применимость* не доказана.
- **B2.** Живое поведение RLS: что `app_staff` без `organization_id` в замере действительно получает
  `42501`, а пациент действительно читает врачебную запись. Уровень доказательства —
  `*.devDbProof.test.mjs` по контракту §10b; DB-free тесты этой гарантии не заявляют.
- **B3.** Клик-through пациентского UI (график с двумя источниками в одной линии) — по условию
  брифа принимает владелец по скриншотам интеграционной ветки.

---

## 6. Наблюдения (НЕ MUST FIX, требований authority не нарушают)

1. **Инлайн-правка текста жалобы не переименовывает отслеживание.**
   `PATCH /api/doctor/patients/[userId]/complaints/[complaintId]` → `updateComplaintFields` меняет
   `clinical_complaint.text`, но `symptom_trackings.symptom_title` остаётся прежним: пациент видит
   старое имя симптома. В authority переименования нет (п. 1 требует только durable-связь),
   поэтому это **вопрос владельцу**, а не работа: синхронизировать название при инлайн-правке?
2. **Удаление жалобы.** Отдельного `DELETE` жалобы в API нет; на случай удаления строки FK стоит
   `ON DELETE SET NULL` — отслеживание переживает жалобу и остаётся у пациента. Поведение
   осознанное (комментарий в миграции), но нигде не описано, что пациент продолжит видеть симптом
   снятой с учёта жалобы.
3. **`inMemoryPatientClinicalPort` моста не имеет.** В in-memory-режиме (`inMemoryRepos`) жалоба
   отслеживания не заводит. Это dev-режим, продукта не касается; в authority требования нет.
4. **Принципал без организации.** Гипотетический путь «staff-принципал без `organization_id` +
   повторный приём по жалобе с организацией» дал бы отслеживание с `organization_id = NULL` и
   пересоздание связи на каждой записи. Недостижим: все три врачебных входа идут через
   `withDoctorWorkspacePrincipal(gate.ctx)` с обязательным `gate.ctx.organizationId`, а RLS
   `WITH CHECK` такую строку и так отвергнет. Записано как латентная, а не действующая поломка.
5. **Совпадение дня.** Врачебный замер и запись пациента «в моменте» в один день схлопываются в
   максимум (`aggregateSymptomEntriesByDaySplit`). Это существующее поведение агрегации и прямое
   следствие решения владельца не различать источник.

---

## 7. Что запускалось (точные команды и результат)

| Команда | Результат |
|---|---|
| `pnpm install --frozen-lockfile` | ok (в worktree не было `node_modules` — без этого гейты давали ложный ENOENT/TS2307) |
| `pnpm --dir packages/{operator-db-schema,db-principal,shared-contracts,platform-merge,error-tracking} run build` | ok |
| `pnpm webapp:typecheck` | **exit 0**, 0 ошибок (включая оба новых теста) |
| `pnpm check:db-privileges-generated` | **exit 0**, артефакты побайтно = декларации |
| `node --test deploy/postgres/privileges/relation-access.test.mjs` | **44/44 pass** |
| `node --test deploy/postgres/privileges/migration-order.test.mjs` | **28/28 pass** |
| `npx vitest run --project unit src/infra/repos/pgPatientClinicalSymptomBridge.unit.test.ts src/infra/repos/pgSymptomDiaryClinicalTransaction.unit.test.ts` | **9/9 pass** |
| `npx eslint` по обоим новым файлам (конфиг `apps/webapp`) | **exit 0** |
| `npx vitest run --project unit` (весь проект `unit`, финальное дерево) | **267 файлов / 1332 теста pass**, exit 0 |
| fault injection A–I | 9/9 классов убиты, продукт восстановлен |

Full CI не гонялся — это гейт приземления, не аудита; ветка не пушилась, миграция не приземлялась.

---

## 8. Добавленные файлы

- `apps/webapp/src/infra/repos/pgPatientClinicalSymptomBridge.unit.test.ts` — 7 сценариев моста
  (R1, R2, R3, R4).
- `apps/webapp/src/infra/repos/pgSymptomDiaryClinicalTransaction.unit.test.ts` — 2 сценария
  маршрутизации сессии (R2, R5).

Оба попадают в vitest-project `unit` (`apps/webapp/vitest.config.ts`, include
`src/**/*.unit.test.ts`), то есть реально гоняются `pnpm test:webapp:unit` и `pnpm test:webapp`.

## НЕ СДЕЛАНО

- Живой preflight миграции на DEV (B1) — запрещён условием брифа.
- Живое доказательство RLS/42501 через `*.devDbProof` (B2) — запрещено условием брифа.
- Приёмка пациентского UI по скриншотам (B3) — за владельцем.
- Продуктовый код не правился: наблюдения §6 (в первую очередь №1, переименование симптома при
  инлайн-правке жалобы) переданы владельцу как вопрос, а не выполнены.
