# Переаудит «четырёх механических блокеров» публичной записи

Проверяемые коммиты: `b6e31c2c07e1` (фикс F2-F6) и `1df8409b5fdd` (отчёт). Ветка на момент прогона —
`wt/public-booking-write-20260819` @ `61b785081`. Задание: тест, не взгляд — каждое число отчёта
перемерено живой командой, центральный вопрос (файл vs применённая БД) решён инъекцией и прямым SQL,
не чтением диффа.

**Итог: F3, F4, F5, F6 подтверждены живьём, без расхождений с отчётом по существу. F2 подтверждена с
находкой (ниже, «строка леджера временно теряла личность»). Правило владельца §33.2 на публичной
стороне подтверждено 7 живыми проверками — но на СТОРОНЕ ПЕРСОНАЛА оно больше НЕ действует: более
позднее решение владельца Т12 (влитое в эту же ветку после `b6e31c2c0`) убрало `patient_count` у
писателя карточек персонала целиком, и это ломает и слепой тест приёмки, и `pnpm typecheck` на текущей
голове. Это не дефект коммитов `b6e31c2c0`/`1df8409b5` — это факт живого состояния, который отчёт не
мог знать (Т12 влился позже), но который блокирует приземление голову сейчас.**

---

## 1. Пересчёт чисел отчёта

| Число отчёта | Команда | Факт сейчас | Причина расхождения |
|---|---|---|---|
| `generate-cli.mjs --check` EXIT=0 | `node deploy/postgres/privileges/generate-cli.mjs --check` | **EXIT=0**, побайтно | совпадает |
| `--check --port-context-only` EXIT=0 | тот же с флагом | **EXIT=0**, побайтно | совпадает |
| Lint EXIT=0 | `pnpm --dir apps/webapp lint` | **EXIT=0** | совпадает |
| Typecheck EXIT=0 | `pnpm typecheck` | **EXIT=2, КРАСНЫЙ** | `transactionQuotaPort.ts:97` — см. §4 |
| Тесты мигратора 19/19 | `node --test migrate-local.test.mjs migrate-local-objects.test.mjs` | **15/15** (9+6) зелёные | `migrate-local.test.mjs` переписан ПОСЛЕ `b6e31c2c0` слиянием параллельной ветки (`5929a179f`→`807f592e8`): было 13 тестов, стало 9. Поведение то же, форма другая — не дефект. |
| Декларации 39/39 | `node --test function-census port-context-catalog port-context-callsite-catalog` | **39/39** | совпадает |
| Гейт квоты self-test 6 forms / 2 writers | `node scripts/check-transaction-quota-port-boundary.mjs --self-test` | **3 forms / 1 writer** | тот же файл переписан коммитом `047a8bfa6` (Т12, ПОСЛЕ `b6e31c2c0`): `orgEnrollments` и вход `assertOrgPatientCountQuotaAvailable` сняты из защищаемого периметра, потому что квоты, которую они охраняли, больше нет. Не ослабление гейта — сокращение периметра вслед за снятой механикой. |
| Слепой тест приёмки 8/8 | `npx vitest run …publicBookingSeatIndependence.unit.test.ts` | **7/8** — файл не менялся с `eac8ed8ee` (git log пуст) | падает `a staff-opened card still spends one`: **ожидает** `StockQuotaReachedError`, получает `patient_not_available` — см. §4 |
| Юнит автора 4/4 | `…createVerifiedPublicBooking.unit.test.ts` | **4/4** | совпадает |
| Маршрут 3/3 | `…confirm/route.route.test.ts` | **3/3** | совпадает |
| `devDbProof` 2/4 | `RUN_PUBLIC_BOOKING_WRITE_WALLS_DB=1 node --test …devDbProof.test.mjs` | **2/4** — то же число, но **другая сигнатура отказа**: было `42501 permission denied for table org_enrollments`, стало `accepted patient context required` (RAISE в `current_patient_user_id()`) | причина не выяснялась — вне скоупа этой ветки по тексту исходного отчёта; роль `app_seam_public_clinic_card_owner` на TEST теперь держит **2** объекта, не 54 (см. §3) — состояние блокера уже сдвинулось само |

---

## 2. Центральный вопрос: применённая DEV ≠ файл после правок REVOKE?

**Нет расхождения по содержимому.** Прямой `sha256sum` трёх файлов сейчас:

```
0051_a_public_visitor_becomes_a_client_when_identified.sql  ba4a69129732ff76…
0052_a_failed_public_booking_must_not_leave_a_client.sql    efdb857d09bcf0f2…
0053_a_visitor_booking_spends_no_tariff_seat.sql             556c698a61df85ef…
```

Ровно те же хеши, что в леджере `bcb_webapp_dev` (`drizzle.__drizzle_migrations.hash`, id 587-589).
Все четыре функции — `assert_org_patient_count_quota_available(uuid)`,
`enroll_current_patient_in_public_booking_clinic(uuid,text)`,
`resolve_public_booking_client_by_phone(text,text,boolean)`, `revoke_public_booking_enrollment(uuid)`
— на месте в `pg_proc`. CHECK `org_enrollments_portal_activation_check` в базе — те же 4 значения,
что в `bookingEngine.ts:314`. `COMMENT` на `assert_org_patient_count_quota_available` в
`pg_description` — тот же текст, что в `0053`.

**Находка — не про содержимое, про личность строки.** До того, как в этом аудите первый раз был
запущен `migrate-local.mjs --rollback-only`, прямой `SELECT tag FROM drizzle.__drizzle_migrations
WHERE id IN (587,588,589)` возвращал **NULL** для всех трёх — не «применено под другим именем», а
буквально пусто, хотя `hash`/`created_at` были на месте. Канон (`AGENTS.md` §«Миграции после baseline
B0») называет `tag` личностью миграции ради того самого случая, который чинит F2: «переименование
[не] превратит её обратно в pending». Строка без `tag` этому гейту не видна как «применённая по имени»
никак — `selectPendingMigrations` матчит по `tag`, и `NULL` в `applied`-множестве не попадает.

Прогон `migrate-local.mjs --rollback-only` **сам вылечил три строки** — не как побочный эффект чтения,
а буквально: `bootstrapLedger()` шлёт отдельный `psql -c` (вне транзакции `--rollback-only`,
коммитится всегда) с `UPDATE … SET tag = legacy.tag FROM (…meta/_journal.json…) AS legacy WHERE
ledger.tag IS NULL AND ledger.created_at = legacy.created_at`. `meta/_journal.json` до сих пор несёт
записи `idx 50-52` с `tag` для всех трёх файлов, поэтому подстановка сработала. После этого повторный
`SELECT` уже отдаёт правильные теги, и они переживают отдельную read-only транзакцию — значит записаны
по-настоящему.

**Почему это произошло.** `migrate-local.mjs`/`migration-order.mjs` были переписаны ПОСЛЕ `b6e31c2c0`
параллельной веткой (коммиты `5929a179f`/`c63367456`, влиты `807f592e8`) — независимая реализация той
же самой идеи (личность = `tag`), запущенная позже на общем DEV поверх строк, которые эта ветка уже
записала своей версией кода. Форензика «кто именно записал NULL» не выполнялась (не входит в скоуп
переаудита F2-F6) — важен факт: **на момент старта этого аудита DEV временно был в состоянии, когда
три строки леджера не несли личности**, и единственное, что спасло гейт от возврата к болезни F2
(«already current поверх дыры»), — то, что `meta/_journal.json` случайно ещё помнит эти три `tag` как
«исторические». Это подстраховка, а не гарантия: для БУДУЩЕЙ post-B0 миграции, если её запись не
попадёт в `_journal.json` (а канон прямо говорит «журнал больше не задаёт порядок и руками не
правится» — то есть его пополнение для новых миграций не гарантировано никаким гейтом), потеря `tag`
таким же образом НЕ самолечится, и `selectPendingMigrations` покажет её как pending, а не «дыра».
**Рекомендация лиду:** гейт, требующий `tag NOT NULL` у каждой строки леджера сразу после
`bootstrapLedger`, закрыл бы этот класс явным падением вместо тихого самолечения через побочный канал.

---

## 3. Запрет DDL прав в 0051-0053

```
$ grep -nE "^\s*(GRANT|REVOKE|CREATE ROLE|ALTER ROLE|ALTER DEFAULT PRIVILEGES|CREATE POLICY)\b" \
    apps/webapp/db/drizzle-migrations/005{1,2,3}_*.sql
(пусто, все три файла)
$ grep -noE "\bREVOKE\b" apps/webapp/db/drizzle-migrations/005{1,2,3}_*.sql
(пусто)
```

Единственные вхождения подстроки «revoke» — часть имени функции `revoke_public_booking_enrollment`
(бизнес-действие «отозвать зачисление», не SQL-глагол). **PASS, без исключений.**

Побочно: роль `app_seam_public_clinic_card_owner` (пятый блокер отчёта, вне скоупа этой ветки) сейчас
на DEV владеет **0** объектами (было так же), на TEST — **2** объектами, не 54, как в отчёте
19.08. Блокер сдвинулся сам, кем — не выяснялось (не задание этого переаудита).

---

## 4. Правило владельца live: публичная запись не тратит место, карточка персонала — тратит

**Публичная половина подтверждена, живым прогоном.** `app.enroll_current_patient_in_public_booking_clinic`
(0053) не содержит вызова `assert_org_patient_count_quota_available` — прочитано в файле и подтверждено
прогоном: 7 из 8 подтестов `publicBookingSeatIndependence.unit.test.ts` зелёные, включая ровно тот,
который проверяет «публичная запись не зовёт дверь квоты ни при каком состоянии клиники» (записанный
инструментированным SQL-слоем, не строгим мок-ассертом).

**Половина про персонал — FALSE на текущей голове.** Восьмой подтест:

```
FAIL  publicBookingSeatIndependence.unit.test.ts > a staff-opened card still spends one
      (the half the owner did NOT revoke) > asks the ceiling for a genuinely new card
      and refuses when it is reached
AssertionError: expected Error: patient_not_available to be an instance of StockQuotaReachedError
```

Причина — не в этой ветке. `apps/webapp/src/infra/repos/pgPatientOrganizationEnrollment.ts`
(писатель карточки персонала) сейчас гласит дословно:

> «Т12 (owner 19.08, дословно): «лимит клиентов - убрать». A new relationship used to pass an atomic
> `patient_count` ceiling here first … a new card now goes straight in with no counting and no quota
> lock at all.»

Это отдельное, более позднее решение владельца того же дня (`docs/OWNER_DECISIONS.md` → Т12,
`docs/_TODO/DECIDED_NOT_DONE.md`: «Лимит клиентов убрать … Сделано в ветке
`wt/drop-patient-count-20260819` … ждёт аудита»), влитое в ЭТУ ветку коммитами `807f592e8`/`047a8bfa6`
ПОСЛЕ `b6e31c2c0`. `OWNER_PRODUCT_RULES.md` §33.2, на который опирается задание этого переаудита,
сам помечен как **не окончательный**: «⚠️ ОТКРЫТО, ждёт владельца … До решения новый код лимит по
клиентам на публичном пути НЕ вводит» — а Т12, судя по коду и `DECIDED_NOT_DONE.md`, это решение уже
приняло, просто канон-документ `OWNER_PRODUCT_RULES.md` не обновлён следом.

**Живой побочный эффект, красный прямо сейчас:**

```
$ pnpm typecheck
src/infra/repos/transactionQuotaPort.ts(97,72): error TS2345:
  Argument of type '"patient_count"' is not assignable to parameter of type 'StockQuotaMechanic'.
EXIT=2
```

`StockQuotaMechanic` (та же строка 12 файла) сузили Т12-коммитом до `'branches' | 'files'` —
`'patient_count'` из объединения убрали. Но `assertOrgPatientCountQuotaAvailable` (транспорт,
защищаемый гейтом F4 этой ветки) на строке 97 всё ещё бросает `new StockQuotaReachedError
('patient_count')`. Сама функция сейчас **мертва**: `grep -rn assertOrgPatientCountQuotaAvailable
apps/webapp/src` вне тестов не находит ни одного вызывающего — ни публичная дверь (0053 её сняла), ни
писатель карточки персонала (Т12 её снял). Мёртвый код всё равно ломает `tsc --noEmit` для всего
репозитория.

**Итог по пункту:** правило владельца в его редакции §33.2 («публичная запись не тратит, карточка
персонала — тратит») сейчас выполняется только наполовину, и не потому, что эта ветка его сломала, а
потому что более новое решение того же владельца (Т12) отменило вторую половину. Приземление ГОЛОВЫ
(не одного коммита `b6e31c2c0`) блокируется: (a) красным `pnpm typecheck` — однострочная причина,
орфанный `throw` в снятой ветке типа; (b) красным слепым тестом приёмки на утверждении, которое
владелец сам отменил позже. Решать, что из этого правка, а что обновление документа/теста под Т12, —
не задача этого переаудита (аудит — гейт против плана владельца, не источник нового скоупа); выносится
вопросом ведущему.

---

## 5. Scoped-гейт

| Проверка | Команда | Результат |
|---|---|---|
| Lint вебаппа | `pnpm --dir apps/webapp lint` | **EXIT=0** |
| Typecheck | `pnpm typecheck` | **EXIT=2** — `transactionQuotaPort.ts:97`, см. §4 |
| Артефакт прав (оба режима) | `generate-cli.mjs --check[--port-context-only]` | **EXIT=0** оба |
| Слепой тест приёмки | `publicBookingSeatIndependence.unit.test.ts` | **7/8** |
| Юнит автора | `createVerifiedPublicBooking.unit.test.ts` | **4/4** |
| Маршрут | `confirm/route.route.test.ts` | **3/3** |
| Тесты мигратора | `migrate-local.test.mjs` + `migrate-local-objects.test.mjs` | **15/15** |
| Декларации | `function-census` + `port-context-catalog` + `port-context-callsite-catalog` | **39/39** |
| Живые стены | `devDbProof` (`RUN_PUBLIC_BOOKING_WRITE_WALLS_DB=1`) | **2/4**, другая сигнатура (§1) |

Full CI не гонялся, по заданию.

---

## Вердикт

**F2-F6 (сам коммит `b6e31c2c0`): PASS.** Все шесть заявленных фактов подтверждены живым прогоном, без
исключений на DDL-запрет. Одна находка внутри F2 — временная потеря `tag` тремя строками леджера,
самовылеченная побочным каналом бутстрапа, не гарантированным для будущих миграций (§2).

**Готовность к приземлению ГОЛОВЫ: FAIL.** Не из-за этой ветки — из-за более позднего слияния (Т12,
`807f592e8`/`047a8bfa6`), не согласовавшего два места: тип `StockQuotaMechanic` (typecheck красный) и
слепой тест приёмки/канон `OWNER_PRODUCT_RULES.md` §33.2 (утверждение о карточке персонала больше не
факт). Ни то ни другое не чинилось этим переаудитом — это находки для триажа владельца/ведущего, не
автофикс.

ПРОД не трогался. TEST не трогался. На DEV этим переаудитом изменено ровно одно: три строки леджера
(`id 587-589`) получили свой законный `tag` обратно тем же санкционированным `--rollback-only`
прогоном, которым отчёт 19.08 сам же предлагал их проверять.
