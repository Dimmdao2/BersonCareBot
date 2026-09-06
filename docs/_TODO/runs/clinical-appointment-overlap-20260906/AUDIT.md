# auditor-live — clinical appointment overlap (#1096)

**Candidate:** `df87839fe50edca7e2c31b29a8540079145691a8` (ветка `wt/clinical-appointment-overlap-20260906`;
содержательный коммит — `2ca8475c1`, остальное merge из `feat/doctor-ui-rebuild`).
**Audit commit:** тесты + этот артефакт, staged поимённо.
**Authority:** `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` §P4.6 `ENCOUNTER-APPOINTMENT-04/05/06`,
§K1 `PAY-APPT-01..05`, подтверждённый дефект `patient_principal_required` в ручной двери.
**Слепой kill-set:** `KILLSET.blind.md` рядом — записан ДО открытия хоть одного тестового файла.

## VERDICT: FAIL — 1 подтверждённое нарушение owner requirement (F-1). Не land-ready.

Остальное проверено и держится. F-1 — не «стиль» и не гипотеза: воспроизведён на живой именованной DEV
под фактической ролью `app_staff`, транзакция откачена.

---

## F-1 (FAIL, CONFIRMED). Подтверждённое наложение перестаёт занимать слот, и перенос кладёт вторую запись поверх него без всякого согласия

**Owner requirement:** `ENCOUNTER-APPOINTMENT-05` — «явное согласие разрешает наложение». Обратное следствие
того же пункта: наложение БЕЗ явного согласия появляться не должно.

**Механика.** Кандидат выводит подтверждённую запись из-под `be_appointments_specialist_no_overlap` предикатом
`overlap_confirmed_* IS DISTINCT FROM start_at/end_at`. Строка, у которой пара совпала с собственным временем,
в индекс ограничения не попадает ВООБЩЕ — то есть она перестаёт не только *нарушать* ограничение, но и *занимать*
слот для других.

Для двери создания это незаметно: `POST .../appointments/manual` спрашивает `assertSlotAvailable` →
`listBusyIntervals`, а тот про новые колонки ничего не знает и видит подтверждённую запись занятой.

Но у двери **переноса** прикладной проверки нет вовсе:
`apps/webapp/src/app/api/doctor/booking-engine/appointments/[id]/manual-reschedule/route.ts` →
`booking-appointment-lifecycle/service.ts:303 staffReschedule` → `pgBookingAppointmentLifecycle.ts:346 applyReschedule`
— это простой drizzle `update`, а маршрут ловит `23P01` (`isSlotOverlapError`, строка 44). Единственной защитой
переноса было само ограничение. Кандидат убирает из него подтверждённую строку — и перенос на её слот проходит молча.

**Достижимо обычным действием врача** (оба входа зовут ту же дверь):
`ScheduleCalendarTab.tsx:2398` (drag/resize записи в календаре) и `DoctorCalendarEventPanel.tsx:778` (форма «Изменить»).

**Сценарий:** 10:00 занято записью A. Врач ставит на 10:00 запись B, подтверждает наложение — B помечена парой.
Пациент A отменяет запись (A выходит из ограничения штатно). На 10:00 остаётся только B, которой в индексе нет.
Врач перетаскивает запись C с 15:00 на 10:00 → ни `slot_overlap`, ни диалога подтверждения, ни `23P01`: две
записи на одном времени, согласия на которое никто не давал.

**Живое доказательство (bcb_webapp_dev, роль `app_staff`, транзакция откачена, P6 ниже):**
`P6 RESULT rows_at_1200=2` — обычный `UPDATE` переноса лёг поверх подтверждённой записи.
До кандидата тот же перенос отбивался `23P01` (подтверждённых строк не существовало, любая живая запись
была в индексе).

**Второй множитель той же причины (тот же F-1, не отдельная находка):** маршрут принимает `allowOverlap: true`
безусловно — он не проверяет, что конфликт вообще есть, и при `allowOverlap` пропускает `assertSlotAvailable`
целиком. То есть иммунитет шире согласия: запись, созданная с флагом на свободном слоте, тоже навсегда выпадает
из ограничения и перестаёт занимать время.

**Оракул для исполнителя** — воспроизводимый rollback-only скрипт в разделе «DEV DB proof» ниже (P4 и P6).
Проверка «починено»: P4 и P6 обязаны отказать `23P01`, при этом P2 остаётся `23P01`, а P3 и P5 не меняются.
Формы исправления не предписываю (§24.6): годится и прикладная проверка занятости на двери переноса, и такой
предикат/индекс, при котором подтверждённая строка продолжает занимать слот для чужих записей.

---

## По каждому ID

| ID | Тест или взгляд | Итог | Evidence |
|---|---|---|---|
| `ENCOUNTER-APPOINTMENT-04` | взгляд (единственность двери) + тест (канонические поля) | **PASS** | Единственные drizzle-вставки в `be_appointments` — `pgBookingEngine.ts:413` (`insertAppointmentInTransaction`) и `:2047` (`createAppointmentChain`, существовал до кандидата и пару не пишет). Миграция не содержит ни одного `INSERT INTO public.be_appointments`. Новой упрощённой сущности нет: миграция добавляет две колонки существующей таблице. Дверь одна — расширен `.../appointments/manual` полем `allowOverlap`, второго маршрута/сервиса/репозитория не заведено. UI-обход невозможен: `assertSlotAvailable` живёт на сервере, форма только повторяет запрос. |
| `ENCOUNTER-APPOINTMENT-05` | тест | **FAIL** (F-1) | Половина пункта держится и закрыта тестами: обычный запрос на занятое время → `409 slot_overlap` и `createAppointment` НЕ вызван (отмена не создаёт ничего); повтор с согласием создаёт запись и метит ИМЕННО подтверждённый слот. Нарушена вторая половина: наложение появляется и БЕЗ согласия — F-1. |
| `ENCOUNTER-APPOINTMENT-06` | взгляд + тест | **PASS** | Без пациента/пакета `memberships`-ветка не входит вовсе; `overlapConfirmed*` при обычном создании — `null` (тест). Со связанной записью снимок/цена/предоплата считаются тем же `resolveStaffAppointmentFinancials`, что и раньше; списание пакета идёт в явной области `runWithMechanicWriteClearance('subscriptions')` (тест). |
| `PAY-APPT-01` | взгляд + существующие тесты | **PASS** | Цена услуги едет тем же payload'ом, что и длительность (`pgBookingCalendar.ts` `priceMinor`), поле «Стоимость, ₽» стоит после услуги и длительности. Снимок считает сервер; существующий тест «ручная цена врача… ложится в снимок» уже это защищает — дубля не добавлял. |
| `PAY-APPT-02` | взгляд | **PASS** | `setServiceId` подставляет цену новой услуги только при `priceOverridden === false`; после ручного ввода смена услуги её не трогает. Открытие сохранённой записи берёт СНИМОК записи, а не текущий прайс (`appointmentSnapshotDraftMoney`). |
| `PAY-APPT-03` | взгляд + существующие тесты | **PASS** | Умолчание предоплаты приходит из той же политики, из которой сервер считает снимок (`buildAppDeps.resolveServicePrepaymentDefaults` → `paymentsService.listPrepaymentPolicies`), второго источника нет. Переопределение врача покрыто существующим тестом «переопределение врача «без предоплаты»…». |
| `PAY-APPT-04` | взгляд (конструкция) | **PASS** | Пациентская дверь — definer `app.create_current_patient_booking_appointments(text)`: цена берётся из каталога прямо в теле (`SELECT service.price_minor`), аргументом не передаётся; `allowOverlap`/`overlap_confirmed_*` в её `INSERT` не названы. `app_patient` прямых грантов на `public.be_appointments` не имеет (0 строк в сгенерированном артефакте) — обойти нечем. Ручная дверь закрыта `requireDoctorBookingEngine`. Ступень 1 по §10a: тест не нужен. |
| `PAY-APPT-05` | взгляд | **PASS** | В `DoctorAppointmentForm.tsx` и `appointmentFormFinancials.ts` нет ни одного упоминания pay-link/QR; выставление счёта живёт в `AppointmentPaymentSection` деталей записи. |
| Дефект `patient_principal_required` | тест | **PASS** | Ветку выбирает право (`canActAsCurrentPatient`), а не наличие корня; персонал уходит на org-scoped путь. Стена цела: `reserveForAppointment` org-scoped ветка требует `getPatientPackage(id, organizationId)` И `raw.platformUserId === input.platformUserId`, иначе `package_not_found`. Вторая половина дефекта (списание молча падало на замке механики и глохло в пустом `catch`) закрыта явным `runWithMechanicWriteClearance('subscriptions')` + логированием. |

---

## Миграция / схема / права — verdict: PASS

`apps/webapp/db/drizzle-migrations/20260906T110000_an_overlap_stands_only_where_a_specialist_confirmed_that_slot.sql`

- **Имя:** timestamp-forward `YYYYMMDDTHHMMSS_slug.sql`, сортируется после `20260906T101500_…`. `migration-order.test.mjs` — 28/28.
- **Права:** ни `GRANT`, ни `REVOKE`, ни `CREATE/DROP POLICY`, ни `ALTER ROLE`, ни `ALTER DEFAULT PRIVILEGES` (grep — пусто).
- **`meta/_journal.json`:** кандидатом не тронут, остаётся `entries: []`.
- **Statement-owner:** 3 блока, 2 `--> statement-breakpoint`, у каждого блока ровно `-- BCB-MIGRATION-OWNER: app_object_owner`; `postgres` не встречается.
- **Verify-проба:** `-- BCB-MIGRATION-VERIFY:` проверяет обе колонки И что определение ограничения содержит `overlap_confirmed_start_at` — то есть след, а не только существование колонок.
- **Декларация:** обе колонки внесены в `REV10_CLINICAL_ACCESS` и в 5 записей function-census (`SELECT`-верх для функций, читающих строку `%ROWTYPE`). Сгенерированные артефакты совпадают побайтно.
- **Предикат ограничения:** воспроизведён из `deploy/postgres/generated/prod-to-target/schema-post.sql:196` дословно (специалист, `deleted_at IS NULL`, тот же список статусов) плюс один новый терм. Расхождения нет.
- **Индекс:** новые колонки нигде не участвуют в `WHERE`/`JOIN`/`ORDER BY` рантайма — только внутри предиката самого exclusion-индекса. Отдельный индекс не требуется. `be_appointments` на DEV — 513 строк / 736 kB, пересборка GiST при `ADD CONSTRAINT` блокировкой не грозит.
- **Рантайм-права по телу:** `app_staff` получает `INSERT` и `SELECT` на обе колонки (drizzle-вставка их ИМЕНУЕТ на каждом staff-создании) — проверено живой вставкой под `app_staff` (P1/P3 ниже, `42501` не возникло). Пин колонок в `relation-access.test.mjs` обновлён вместе с декларацией.
- **Замечание (recommendation, не finding):** `app_seam_patient_booking_owner` получает `INSERT` на обе новые колонки, хотя комментарий в декларации говорит «на запись их здесь нет». Недостижимо: роль — владелец definer-функции, а её `INSERT` перечисляет колонки поимённо и новых среди них нет. Это следствие принятого в репозитории `evidence: 'pg16-function-body-lexical-upper-bound'` (один список колонок на все операции записи), а не отступление кандидата.

---

## Команды и результаты

| Проверка | Результат |
|---|---|
| `node --test deploy/postgres/privileges/migration-order.test.mjs` | 28/28 pass |
| `pnpm run check:db-privileges-generated` | все 6 артефактов совпадают побайтно |
| `node --test deploy/postgres/privileges/*.test.mjs` | 184 pass / 0 fail / 157 skipped |
| `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` | **PASS**, `pending=1 total=125 applied=0`, три `ALTER TABLE` исполнены как `app_object_owner` и откачены. Миграция НЕ применена, одноразовая БД не создавалась |
| `pnpm --dir apps/webapp typecheck` | чисто |
| `pnpm --dir apps/webapp exec eslint <2 изменённых тест-файла>` | чисто |
| `pnpm --dir apps/webapp exec vitest run src/app/api/doctor/booking-engine src/app/app/doctor/calendar src/modules/memberships src/modules/booking-calendar src/modules/booking-appointment-lifecycle` | 20 файлов / **114 тестов** pass (было 18/101 до аудита) |

Full CI, push, deploy, land, plan/taskdb — не выполнялись (вне scope брифа).

---

## DEV DB proof — именованная `bcb_webapp_dev`, фактические рантайм-роли, всё откачено

Механика: одна транзакция, внутри неё DDL кандидата под `app_object_owner`, затем reconcile двух новых колонок
для `app_staff`, затем `SET LOCAL SESSION AUTHORIZATION bcb_dev_webapp_staff` + `app.begin_port_context(... 'staff',
'app_staff', org=a0000000-…-0001 ...)` + `SET LOCAL ROLE app_staff`, `ROLLBACK` в конце. Внешних уведомлений и
платежей не инициировалось. Одноразовая БД не создавалась. Постоянных строк не осталось
(`SELECT count(*) FROM be_appointments WHERE id LIKE '11110000-%'` — проверено после прогонов, 0).

| Проба | Что делает | Ожидание | Факт |
|---|---|---|---|
| P1 | обычная staff-вставка на свободный слот | создаётся | создана, `42501` нет |
| P2 | обычная вставка поверх обычной записи | `23P01` | **`23P01`** — защита цела |
| P3 | вставка с парой, равной собственному слоту, поверх обычной записи | создаётся | **создана, `rows=2`** — согласие исполнимо |
| P4 | на слоте ТОЛЬКО подтверждённая запись; обычная вставка на тот же слот | должна отказать | **прошла, `rows_at_slot=2`** ← корень F-1 |
| P5 | перенос ПОДТВЕРЖДЁННОЙ записи на слот обычной | `23P01` (иммунитет перевзводится) | **`23P01`** — заявление автора подтверждено |
| P6 | перенос ОБЫЧНОЙ записи на слот подтверждённой (путь `manual-reschedule`) | должен отказать | **прошёл, `rows_at_1200=2`** ← **F-1** |
| P7 | вставка в чужую организацию под принципалом org-A | отказ | **`new row violates row-level security policy for table "be_appointments"`** — стена арендатора цела |

Скрипт проб (rollback-only, воспроизводим): прелюдия ставит DDL кандидата + гранты + staff-контекст, дальше
пробы из таблицы; полный текст — в теле этого прогона, восстанавливается из миграции кандидата и
`deploy/postgres/generated/privileges.bcb_webapp_dev.sql` без дополнительных данных.

---

## Слепая матрица поломок: поймано / не поймано

Инъекции вносились в продуктовый код, прогонялись, **все откачены** (`git diff` после отката пуст).

| # | Класс поломки (из `KILLSET.blind.md`) | Инъекция | Покрасневшее утверждение |
|---|---|---|---|
| F1 | K4/K5 — согласие снимает проверку с ОБЫЧНОГО запроса | `manual/route.ts`: `!parsed.data.allowOverlap` → `false` | `«обычный запрос на занятое время отказывает и не создаёт ничего»`: `expected 200 to be 409` |
| F2 | K7 — подтверждён не тот слот, согласие мертво (`23P01`) | `manual/route.ts`: `overlapConfirmedStartAt: … ? parsed.data.startAt` → `parsed.data.endAt` | `«помечает ИМЕННО подтверждённый слот»`: `overlapConfirmedStartAt "…T09:00" → "…T10:00"` |
| F3 | K13 — ветка абонемента выбирается наличием корня, а не правом | `memberships/service.ts`: возврат к `if (deps.port.listCurrentPatientBookingPackages)` в обеих точках | `«персонал не трогает пациентский корень…»`: `expected "vi.fn()" to not be called, but been called 1 times` |
| F4 | K14 — привязка пакета без области записи механики `subscriptions` | `manual/route.ts`: снят `runWithMechanicWriteClearance('subscriptions', …)` | `«списание идёт в области записи механики…»`: `expected 'refused' to be 'cleared'` (маршрут при этом отдал 200 — ровно та молчаливость, что прятала дефект) |
| F5 | K4 (обратная сторона) — иммунитет протекает в обычное создание | `manual/route.ts`: пара пишется безусловно | `«обычный запрос не помечает слот подтверждённым»`: `null → "…T09:00"/"…T10:00"` |
| DB | K5/K7/K9/K10/K11/K12 — семантика ограничения и стена | не инъекция: прямые пробы P2–P7 на живой DEV | P2/P5/P7 отказали как положено; **P4/P6 прошли — это F-1** |

**Пойманных классов: 6 из 6 проверенных.** Непойманного, для которого удалось бы назвать отказ по §10a
ступени 2, нет; единственный найденный отказ (F-1) не «непойман», а **доказан живой пробой** и передан как
фиксированный оракул.

### Что сознательно НЕ покрыто новым тестом (и почему)

- **F-1 постоянным тестом.** Поломка видна только на живой БД: маршрут переноса с подделанным DB-слоем доказал
  бы поведение фейка, а не ограничения. §10a «цена проверки входит в решение» — оракулом служат пробы P4/P6,
  воспроизводимые одной командой. Плюс постоянный тест на конкретную форму починки предписал бы решение (§24.6).
- **K8 / K20 (пациент присылает `allowOverlap` или переопределение денег).** Ступень 1, конструкция: у
  `app_patient` нет грантов на таблицу, а definer-корень перечисляет колонки `INSERT` поимённо и новых среди них
  нет; цена читается из каталога внутри тела. Ломать нечего — тест бы охранял отсутствующую дыру.
- **K17–K19 (цена/предоплата по умолчанию, ручной override).** Уже защищено существующими тестами в
  `manual/route.route.test.ts` (`PAY-APPT-07/08`-блок). Дубль не добавлял.
- **K9 (гонка двух обычных созданий).** Ограничение БД её и ловит — P2 доказывает это на живой базе; отдельный
  конкурентный тест дал бы ту же гарантию дороже.

---

## Что осталось за границей аудита (не findings)

- `createAppointmentChain` (`pgBookingEngine.ts:2047`) — вторая drizzle-вставка в ту же таблицу; существовала до
  кандидата, пару не пишет (fail-closed). Кандидат её не создавал; сведение двух точек — отдельная работа (§5, «граница — цена»).
- `manual-patient-visit` (совсем новый пациент) `allowOverlap` не получил — автор вынес это вопросом владельцу,
  а UI честно не предлагает там подтверждение. Расширением скоупа не занимаюсь.
- Наблюдение автора про `/api/doctor/patient-packages/[id]/consume` (тот же недостающий `subscriptions`
  clearance) — вне scope этих ID, оставляю как есть.

---

## Correction result — 2026-09-06

- Correction commit SHA: `<FINAL_#1096_SHA>` (этот append-only evidence входит в тот же commit; точный SHA выдан в handoff).
- F-1 устранён в одном canonical write-path. `allowOverlap: true` больше не пропускает scheduling безусловно:
  маршрут сначала вызывает `assertSlotAvailable`, и записывает пару `overlap_confirmed_*` только когда тот вернул
  фактический `slot_overlap`. Свободный слот с флагом остаётся обычной строкой без длительного иммунитета.
- Один partial exclusion остался guard для ordinary-vs-ordinary. Новый `SECURITY INVOKER` trigger под
  `pg_advisory_xact_lock(hashtextextended('be-appointments-specialist:' || specialist_id, 0))` проверяет
  confirmed строки для каждой последующей ordinary insert/reschedule и выбрасывает тот же `23P01`.
  Поэтому B может быть создана поверх A по явному согласию, но C не обходит B; согласованный marker не переживает
  перенос B, потому что больше не совпадает с её новым интервалом и B снова входит в исходный exclusion guard.
- Права: новая internal trigger-function объявлена только в `deploy/postgres/privileges/declaration.ts` как
  `INVOKER`, без execute surface. Её `SELECT public.be_appointments` работает через уже существующий central
  `app_staff` direct `SELECT`; migration не меняет grants/policies. Generator обновил оба named artifacts;
  `pnpm run check:db-privileges-generated` подтвердил byte parity.

### DEV rollback-only proof

Команда: candidate DDL из `20260906T110000_an_overlap_stands_only_where_a_specialist_confirmed_that_slot.sql`,
reconcile-строки из `deploy/postgres/generated/privileges.bcb_webapp_dev.sql`, затем
`SET LOCAL SESSION AUTHORIZATION bcb_dev_webapp_staff` и canonical
`app.begin_port_context(... 'staff', 'app_staff', 'relation', ...)` внутри одной `BEGIN … ROLLBACK` на
именованной `bcb_webapp_dev`. Внешние уведомления и платежи не вызывались.

| Проба | Result |
|---|---|
| P1 ordinary свободный слот | `created` |
| P2 ordinary поверх ordinary | `23P01` |
| P3 confirmed поверх ordinary | `created` |
| P4 ordinary поверх confirmed | `23P01` |
| P5 перенос confirmed на ordinary | `23P01` |
| P6 перенос ordinary на confirmed | `23P01` |
| P7 не-текущий organization UUID под org-A principal | `42501` |

Внутри rollback-транзакции было 3 fixture rows (P1/P3/P4 seed); после неё
`sudo -n -u postgres psql -X -q -t -A -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -c
"SELECT count(*) FROM public.be_appointments WHERE id::text LIKE '11110000-%';"` вернула `0`.
В текущей DEV есть одна active organization (измерено
`SELECT count(DISTINCT organization_id) FROM public.be_organization_members;`), поэтому P7 использовала
отличающийся от current-org UUID и доказала именно RLS refusal, а не наличие второй fixture-клиники.

### Concurrency evidence

- ordinary-vs-ordinary: P2 — PostgreSQL exclusion `23P01`; это сохраняет существующую физическую race safety.
- confirmed-vs-later-ordinary: отдельная rollback-only transaction создала A, confirmed B поверх A, отменила A и
  держала transaction открытой. Второй backend выполнил
  `SELECT pg_try_advisory_xact_lock(pg_catalog.hashtextextended('be-appointments-specialist:<specialist-id>', 0));`
  и получил `blocked`. Любая ordinary create/reschedule входит в trigger до проверки confirmed B и берёт тот же
  xact lock, поэтому не может пройти между отменой A и commit B; после ожидания P4/P6 predicate возвращает `23P01`.

### Correction validation

- `node --test deploy/postgres/privileges/migration-order.test.mjs` — 28/28 pass.
- `pnpm run check:db-privileges-generated` — byte parity pass.
- `node --test deploy/postgres/privileges/*.test.mjs` — 184 pass / 0 fail / 157 skipped.
- `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` — PASS,
  pending остаётся не применённым.
- `pnpm --dir apps/webapp exec vitest run src/app/api/doctor/booking-engine src/app/app/doctor/calendar src/modules/memberships src/modules/booking-calendar src/modules/booking-appointment-lifecycle` — 20 files / 114 tests pass.
