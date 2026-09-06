# Независимый аудит: канонический снимок цены и жизненный цикл предоплаты записи

**Кандидат:** ветка `wt/appointment-prepayment-core`, HEAD `90859d967d5006bddb58a439d7f16f9a1c25df37`
(реализация `2b865795d6b0f0133d490e550d003b7769395409` + salvage `2e5b28904`), база сравнения
`a40bfc477549c1dde867c1a5253529bdf0789682`.
**Дата:** 2026-09-06. **Роль:** независимый аудит, продуктовые правки не вносились.

**Оракул (дословно, `DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` §K, `PAY-APPT-18`):** «Снимок
стоимости, условие/сумма предоплаты, дедлайн и платёжный статус имеют один канонический write-path;
роли врача, пациента, системной процедуры и webhook имеют только необходимые права чтения и записи
через центральную схему grants.»

## Вердикт

**НЕ PASS. Три MUST FIX** — каждый достижим обычным действием врача или пациента, и каждый ломает
именно тот сценарий, ради которого работа делалась. Ядро (доменный расчёт, схема, миграция, права,
идемпотентность вебхука, конструкция гонки истечения) сделано и проверено; ломается стык нового
состояния `awaiting_payment` с уже существующими путями правки записи и приёма денег.

---

## MUST FIX 1. Запись в ожидании оплаты нельзя ни перенести, ни отредактировать — 500

**Сценарий.** Врач (или пациент) создаёт запись, требующую предоплату → статус `awaiting_payment`.
Врач открывает карточку и меняет что угодно: время, услугу, стоимость, условие предоплаты — или
вовсе снимает требование. `POST /api/doctor/booking-engine/appointments/[id]/manual-reschedule`
возвращает **500 `reschedule_failed`**. Другой ручки для этой правки в системе нет.

**Почему.** Финансовая правка идёт ТЕМ ЖЕ маршрутом, что и перенос времени, и перенос выполняется
первым (`.../manual-reschedule/route.ts:96` — `lifecycle.staffReschedule`, финансовый блок только
на `:141`). `applyReschedule` безусловно проводит запись через `rescheduled`
(`apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.ts:389`), а FSM этого перехода из
`awaiting_payment` не знает: `apps/webapp/src/modules/booking-engine/appointmentStatusFsm.ts:22`
разрешает только `paid | confirmed | cancelled_by_patient | cancelled_by_specialist |
manual_review_required`. Кандидат добавил в FSM обратное ребро `confirmed → awaiting_payment`
(`:36-45`), но не добавил ни одного выхода для правки уже ожидающей записи.

**Доказательство (реальный FSM, не чтение кода):**

```
expect(() => assertValidAppointmentStatusTransition('awaiting_payment', 'rescheduled')).not.toThrow();
→ UserFacingError: Недопустимый переход статуса: awaiting_payment → rescheduled
```

**Нарушенное требование.** `PAY-APPT-12` («Изменение услуги, стоимости или условия предоплаты **до
оплаты** корректно обновляет снимок и платёжное требование») недостижим ровно для того состояния,
которое эта работа и вводит. Ветка `!wantsAwaiting → confirmed` в `route.ts:213` — мёртвый код.

**Связанное последствие того же места (проявится сразу после снятия запрета FSM).**
`applyReschedule` завершает запись жёстким `status: 'confirmed'`
(`pgBookingAppointmentLifecycle.ts:450`). Значит перенос ожидающей записи БЕЗ финансовой правки
молча подтвердит неоплаченную запись: `prepayment_required_minor > 0` и `payment_deadline_at`
останутся, а тик истечения фильтрует `status = 'awaiting_payment'` и такую строку больше не
увидит — слот держит подтверждённая, но неоплаченная запись. Чинить оба места разом.

**Почему тесты этого не увидели.** `financials.route.test.ts` подменяет `staffReschedule` целиком
и все сценарии стартуют из `confirmed`; настоящий FSM в этом маршруте не исполняется ни разу.

## MUST FIX 2. Оплата наличными не гасит требование предоплаты — тик истечения отменяет оплаченную запись

**Сценарий.** Запись в `awaiting_payment` (создана врачом или пациентом). Пациент платит в кассе,
врач в деталях записи жмёт «Оплачено наличными» (`POST .../appointments/[id]/payment` c
`action: 'cash'`). Через `payment_deadline_at` минутный крон отменяет запись как
`cancelled_by_specialist` и освобождает слот. Человек заплатил и остался без приёма; в календаре
это выглядит отменой клиникой.

**Почему.** `addCashPayment` пишет только в `patient_payment`
(`apps/webapp/src/infra/repos/pgPatientPayments.ts:135-162`) и не трогает ни `be_appointments.status`,
ни `prepayment_paid_minor`, ни `payment_ref` (`staffAppointmentPayments.ts:307`). Корень истечения
снимает запись именно по `status = 'awaiting_payment' AND prepayment_paid_minor = 0 AND payment_ref
IS NULL` (миграция `20260905T233000_…sql:727-731`). Ни один путь приложения не переводит запись из
`awaiting_payment` кроме шва вебхука и заблокированного маршрута из MUST FIX 1 (проверено перебором
всех вхождений `awaiting_payment` в `apps/webapp/src`).

**Нарушенное требование.** «Existing intent/webhook/**cash** paths transition money/status atomically
and idempotently» (бриф аудита, п. 4) и `PAY-APPT-11` — освобождать полагается **неоплаченное**
ожидание. Замок `isAppointmentFinancialsLocked` по той же причине не считает наличные деньгами:
после кассы врач всё ещё может переписать стоимость записи.

## MUST FIX 3. Ссылка на оплату из деталей выставляется на ПОЛНУЮ стоимость, а не на требуемую предоплату

**Сценарий.** Врач создаёт запись с предоплатой 30 % от 2500 ₽ (`prepayment_required_minor = 75 000`,
запись в `awaiting_payment`). Ссылку/QR по замыслу `PAY-APPT-05` выставляют из деталей уже
сохранённой записи — и она приходит на 2500 ₽. У пациентской записи с той же политикой намерение
создаётся на 750 ₽ (`canonicalCreate.ts:511`). Две двери, одно состояние, разные суммы.

**Почему.** `createPayment` не знает о новом снимке вовсе: сумма считается как
`totalMinor = booking?.priceMinorSnapshot` минус уже полученное
(`apps/webapp/src/app-layer/booking/staffAppointmentPayments.ts:272`), и она же уходит в намерение
(`:325`). `prepaymentRequiredMinor` в этом файле встречается только при сборке контракта чтения
(`:203`).

**Тот же дефект в контракте чтения.** Рядом со снимком в `CalendarAppointmentPaymentView` остался
`prepaymentQuote` — живой пересчёт из текущего прайса и текущей политики каталога
(`staffAppointmentPayments.ts:160-167`, `:192`). Именно его сегодня рисует карточка
(`apps/webapp/src/app/app/doctor/calendar/AppointmentPaymentSection.tsx:126,139`). После врачебного
переопределения (`PAY-APPT-02/03`) или после сдвига прайса каталога (`PAY-APPT-12`) эти два числа
расходятся — а расхождение снимка с пересчётом и есть тот дефект, ради устранения которого заведён
снимок. Требование брифа п. 8 («no duplicate payment model/write path/helper») нарушено в самом
типизированном контракте.

---

## Что проверено и держится

Проверялось мутацией (kill-set): ломаем — смотрим, какое утверждение краснеет. Всё ниже красное на
внесённой поломке и зелёное на кандидате.

| Требование | Проверка | Итог |
|---|---|---|
| Один доменный расчёт снимка на обе двери | `appointmentFinancialSnapshot.unit.test.ts`; `computePrepaymentAmount` заменён на рублёвое округление | ловится (2 утверждения) |
| Замок денег после состоявшейся/удержанной оплаты | `financials.route.test.ts`; сняты ОБА слоя замка (маршрут + домен) | ловится |
| Снимок записи не уезжает за прайсом каталога | `staffBookingProjection.unit.test.ts`; возврат к `service.priceMinor` | ловится |
| Врач не пишет фактически полученные деньги | `appointment-prepayment-least-privilege.test.mjs`; `prepayment_paid_minor` добавлен в `app_staff` UPDATE | ловится |
| Слот держится ожиданием, освобождается отменой | `be_appointments_specialist_no_overlap` (`schema-post.sql:196`): `awaiting_payment` в исключениях НЕТ, `cancelled_by_specialist` — есть | конструкция верна |
| Гонка «оплата на границе срока» | `FOR UPDATE SKIP LOCKED` + повторная проверка `status/prepayment_paid_minor/payment_ref` в самом `UPDATE` (миграция `:713-731`) | конструкция верна |
| Идемпотентность вебхука | `be_payment_provider_events (provider, key, type)` + `processed_at`, `ON CONFLICT (payment_intent_id) DO NOTHING`, прибавка суммы под `payment_ref IS DISTINCT FROM` | повторная доставка того же события денег не двоит |
| Права — только через центральную декларацию | миграция не содержит ни одного `GRANT/REVOKE/CREATE POLICY`; `check:db-privileges-generated` — побайтно | держится |
| Второго планировщика нет | строка в едином `backgroundJobManifest.ts`, cron-шаблоны сгенерированы, `background-jobs-cli --check` — OK (24 артефакта) | держится |
| Миграция исполнима под объявленными владельцами | owner-aware rollback-only preflight против именованной DEV | PASS, `pending=1 total=120` |

**Добавлены недостающие поведенческие тесты** (дыры найдены kill-set'ом — поломку никто не ловил):

- врачебная запись с политикой предоплаты открывается в `awaiting_payment` со снимком и с точным
  сроком **из настройки клиники** (90 минут, не платформенные 20); переопределение «без предоплаты»
  возвращает `confirmed`; ручная цена побеждает каталог — `appointments/manual/route.route.test.ts`.
  До этого `status: initialStatus → 'confirmed'` и захардкоженные 20 минут проходили зелёными;
- пациентская дверь кладёт снимок и дедлайн **в саму запись**, а не только в платёжное намерение, и
  не принимает финансовых значений из пользовательского ввода — `canonicalCreate.d14.test.ts`.
  До этого удаление всех финансовых полей из `createAppointment` проходило зелёным.

## Замечания ниже порога MUST FIX

1. **Двойное зачисление при повторной доставке под новым ключом.** Идемпотентность прибавки к
   `prepayment_paid_minor` держится на `payment_ref`, а он перезаписывается следующим платежом
   (миграция `:576-588`). Если по записи прошли два платежа, а провайдер повторит `payment.succeeded`
   первого намерения с ДРУГИМ `idempotency_key`, сумма первого прибавится второй раз. Названное
   владельцем требование («повторный webhook идемпотентен») выполняется; это соседний класс.
2. **Правка не атомарна с переносом.** Если платёж приходит между предпроверкой замка
   (`route.ts:143`) и `UPDATE` в репозитории, маршрут вернёт 409, но перенос времени уже применён.
   Деньги защищены, согласованность ответа — нет.
3. **`app_staff` имеет INSERT на `prepayment_paid_minor`** (`declaration.ts:12290`), хотя
   `insertAppointmentInTransaction` его не пишет и комментарий кандидата прямо утверждает обратное
   (`pgBookingEngine.ts:437-439`). Через приложение не достижимо; тест прав проверяет только UPDATE.
4. **`cancelled_by_specialist` для истечения** неотличим от настоящей отмены клиникой; причина живёт
   только в payload события истории. `PAY-APPT-11` разрешает «согласно действующей модели», поэтому
   формально соблюдено — но `PAY-APPT-15` покажет человеку «Отменена клиникой». Развилка владельца.
5. **Онлайн-запись пациента не имеет цены вовсе:** `toPendingRowOnline` кладёт
   `priceMinorSnapshot: null` (`canonicalCreate.ts:136`), поэтому `percent`/`full_price` дают 0 и
   предоплату для онлайна может потребовать только `fixed_minor`. Дефект унаследованный, не внесённый.
6. **Умолчание «20 минут» размножено в пяти местах** (доменная константа, реестр настроек, SQL-дверь
   пациента, backfill миграции, fallback в `staffAppointmentFinancials.ts:66`) и **одинаковая
   `prepaymentOverrideSchema` продублирована в двух маршрутах**.
7. **`totalMinor` в `getPaymentState`** (`:272`) читает историческую проекцию, тогда как контракт
   чтения (`:194`) уже предпочитает снимок записи. При несостоявшейся синхронизации проекции
   (маршрут ручного создания глотает эту ошибку) суммы разойдутся.

## Команды и результаты

```
# миграция под настоящими statement-owner ролями, одна транзакция BEGIN…ROLLBACK
node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator \
  --drizzle-folder apps/webapp/db/drizzle-migrations --sudo-postgres --rollback-only
→ validated and rolled back: pending=1 total=120 reapplied=0 unapplied=0

pnpm test:db-privileges            → 339 tests, 182 pass, 0 fail, 157 skip (живые DB-proof без базы)
pnpm check:db-privileges-generated → артефакты соответствуют декларации побайтно
node deploy/host/background-jobs-cli.mjs --check → OK (24 artifacts)
pnpm typecheck                     → все 7 проектов Done
pnpm lint                          → exit 0
(apps/webapp) npx vitest --run src/modules/payments src/modules/patient-booking \
  src/modules/booking-calendar src/modules/booking-engine src/app-layer/booking \
  src/app/api/doctor/booking-engine
→ 42 files, 228 tests, all pass (с добавленными здесь тестами)
```

Одноразовых баз не поднималось, DEV/TEST/PROD не изменялись, вся временная поломка кода откачена
(`git checkout --` после каждой мутации; рабочее дерево содержит только два тест-файла и этот отчёт).

---

## Устранение трёх MUST FIX (2026-09-06, та же ветка)

Отчёт аудита выше остаётся как есть — ниже отмечено, что из него уже неверно.

**MUST FIX 1 — закрыт.** FSM получил ребро `awaiting_payment → rescheduled` (и обратное
`rescheduled → awaiting_payment`), а итоговый статус переноса перестал быть константой: его выбирает
`appointmentStatusAfterReschedule` (`modules/payments/appointmentFinancialSnapshot.ts`) — запись,
пришедшая в перенос ожидающей с непокрытым требованием, возвращается в ожидание, любая другая — в
`confirmed`. То же правило повторено на SQL в пациентском корне
`app.apply_current_patient_booking_reschedule` (миграция `20260906T101500_…sql`): он тоже завершал
перенос жёстким `confirmed` и молча подтверждал неоплаченную запись. Ветка `!wantsAwaiting →
confirmed` в маршруте перестала быть мёртвой.

**MUST FIX 2 — закрыт.** Наличные по записи идут новым корнем
`app.settle_appointment_cash_prepayment(text)` того же платёжного шва
(`app_seam_payment_webhook_owner`, EXECUTE у `app_staff`, класс `staff`). Один корень пишет строку
кассового журнала и зачисляет её на запись, выводя ту из ожидания: разложить это на два коммита
нельзя — именованный корень не стартует внутри реляционной транзакции, и упавший второй коммит
оставлял бы оплаченную запись под отменой по истечении срока. Идемпотентность — существующий
уникальный ключ журнала: повтор вставляет ноль строк и зачисляет ноль. Семантика вебхука не
тронута. `prepayment_paid_minor` у `app_staff` по-прежнему нет.

**MUST FIX 3 — закрыт.** Ссылка/QR выставляются на непокрытую часть ТРЕБОВАНИЯ предоплаты из снимка
записи (`appointmentPaymentIntentAmountMinor`), а не на полную стоимость; `getPaymentState` читает
стоимость из снимка, а не из исторической проекции. Живой пересчёт `prepaymentQuote` удалён из
`CalendarAppointmentPaymentView` целиком — карточка показывает то же число снимка, на которое
создаётся намерение.

**Добавленные поведенческие тесты** (каждый краснеет на возврате прежнего поведения):
`modules/booking-engine/awaitingPaymentReschedule.unit.test.ts`,
`infra/repos/pgBookingAppointmentLifecycle.awaitingPayment.unit.test.ts`,
`infra/repos/pgPatientPayments.appointmentCash.unit.test.ts`,
`app-layer/booking/staffAppointmentPaymentIntent.unit.test.ts`, два новых случая в
`manual-reschedule/financials.route.test.ts` и два в
`privileges/appointment-prepayment-least-privilege.test.mjs`.

**Замечания ниже порога MUST FIX не трогались** — они остаются открытыми развилками/долгом.

---

## Финальная приёмка исправлений (2026-09-06, независимый проход)

**Кандидат:** `wt/appointment-prepayment-core`, HEAD `fab2b8bff` (исправления `8e1fb0a90` + слияние
актуальной `feat/doctor-ui-rebuild`). Продуктовый код не менялся; вся временная поломка откачена,
рабочее дерево чистое.

### Вердикт: **FAIL** — два блокера, оба доказаны прогоном, оба в скоупе этой работы

#### БЛОКЕР 1. Исправление наличных сломало собственный регрессионный тест платёжного принципала

**Достижимый сценарий.** `cd apps/webapp && npx vitest --run
src/infra/repos/pgPatientPayments.principal.unit.test.ts` → **3 из 6 красных** на кандидате.

Доказательство, что сломало именно `8e1fb0a90`, а не что-то раньше: откат ОДНОГО файла
`git checkout 8e1fb0a90^ -- apps/webapp/src/infra/repos/pgPatientPayments.ts` → тот же файл тестов
**6/6 зелёных**; возврат — снова 3 красных.

**Почему.** Новая ветка наличных ПО ЗАПИСИ (`pgPatientPayments.ts:190`) уходит в именованный корень
ДО `runPatientPaymentMutation`, а именно в нём стоят оба TS-уровневых гейта арендатора
(`:111` `patient_payment_organization_principal_mismatch`, `:119` `organization_principal_required`).
Для записи-двери они больше не исполняются вовсе.

**Impact.** (а) merge-gate красный. (б) Файл, который держал ответ на вопрос «под каким принципалом
пишутся собранные врачом наличные», больше не покрывает дверь записи — а он написан ровно под неё:
его фикстура — `staff-appointment-cash:<id>:700000`, и его шапка описывает живой дефект DEV 05.09
(«Оплачено наличными» на записи в 7 000 ₽ отвечало «Не удалось выполнить действие»). Стена
арендатора при этом на месте — её держит SQL (`require_accepted_context` + сверка
`organizationId` с `app.current_org_id()`), поэтому это не дыра доступа, а потерянный сторож и
красный гейт.

**Нарушенный пункт authority.** `AGENTS.md` merge-gate (полный lint + typecheck + затронутые тесты
зелёные — единственное «готово»); `PAY-APPT-18` в части «роли… имеют только необходимые права
чтения и записи» — утверждение о принципале кассовой двери теперь не проверяет ни один тест.

#### БЛОКЕР 2. Тик истечения предоплаты внесён в locked-набор cron-источников без объявленной relation-возможности

**Достижимый сценарий.** `cd apps/webapp && npx vitest --run
src/modules/db-retention/journalRetention.contract.test.ts` → красный:

```
locked-infra cron sources with no declared port capability:
  ["api/internal/booking-prepayment/expire:POST"]
```

Источник добавлен `2b865795d` (реализация этой работы) в
`packages/db-principal/src/webappLockedInfraCronSources.ts:19`. Набор нагруженный, а не
декоративный: по нему выбирается пул (`apps/webapp/src/infra/db/webappPoolProvider.ts:172`) и
допускается infra-принципал в locked-режиме (`packages/db-principal/src/index.ts:776`, `:1047`).
Соответствующей `purpose: 'relation'` возможности с этим `runtimeSources` в
`deploy/postgres/privileges/declaration.ts` нет.

**Impact.** Сам тик в port-context режиме разрешается через возможность именованного корня
(`app.expire_due_booking_prepayments(integer)`, `webappPortContextPrincipal` берёт
`operation.functionIdentity` раньше infra-источника), поэтому «джоб мёртв» здесь НЕ утверждается.
Ломается другое: контракт, который единственный связывает код, входящий в базу как infra, с
центральной декларацией, теперь красный — и красный он СРАЗУ ДЛЯ ВСЕГО набора, то есть перестаёт
ловить следующий источник, который действительно не сможет открыть соединение. Шапка самого теста
описывает этот класс дважды случившимся (`billing.saas_renewal.tick`, staff-push аудитория
операторского алерта) — каждый раз замечали только после того, как задание молча ничего не делало.

**Нарушенный пункт authority.** `PAY-APPT-18` («…через центральную схему grants» — возможность
источника объявляется только в декларации) и `PAY-APPT-11` в части доказуемости: гейт, который
подтверждает, что тик истечения вообще имеет чем войти в базу, не проходит. Плюс merge-gate.

### Унаследованный красный, НЕ находка против этой работы

`src/app-layer/entitlements/protectedActionRegistryCoverage.unit.test.ts` — красный:
`src/app/api/doctor/patients/[userId]/anamnesis/route.ts:PATCH` не зарегистрирован. Экспорт `PATCH`
добавлен `11acc20eb feat(doctor-ui): rebuild patient clinical map`, и этот коммит УЖЕ в
`feat/doctor-ui-rebuild` (`git merge-base --is-ancestor` подтверждает). Приехал слиянием, к
предоплате отношения не имеет — но приземлению кандидата мешает так же.

### Что проверено и держится

| Проверка брифа | Как проверено | Итог |
|---|---|---|
| 1. Перенос/правка `awaiting_payment` без 500, без молчаливого подтверждения | реальный FSM + реальное поведение репозитория (`awaitingPaymentReschedule.unit.test.ts`, `pgBookingAppointmentLifecycle.awaitingPayment.unit.test.ts`); kill-set: снятие ребра FSM → 4 красных, `appointmentStatusAfterReschedule → 'confirmed'` → красные | держится |
| 1. То же правило в пациентском корне | взгляд: `20260906T101500_…sql`, `v_to_status` CASE повторяет доменное правило; VERIFY-заголовок миграции ассертит наличие условия в теле функции | держится |
| 2. Наличные гасят требование атомарно и идемпотентно | взгляд: строка журнала и зачисление — один statement-атомарный корень, `FOR UPDATE` до журнала, зачисление ТОЛЬКО при фактической вставке, идемпотентность на `uq_patient_payment_appointment_idempotency (organization_id, appointment_id, idempotency_key)`; ключ детерминированный (`staff-appointment-cash:<id>:<сумма>`) | держится |
| 2. Оплаченная запись не попадает под автоотмену | тик отбирает `status='awaiting_payment' AND prepayment_paid_minor=0 AND payment_ref IS NULL`; корень выводит в `confirmed` и оставляет ненулевой `prepayment_paid_minor` | держится |
| 3. Ссылка/QR на непокрытую часть ТРЕБОВАНИЯ из снимка | `staffAppointmentPaymentIntent.unit.test.ts`; kill-set: `appointmentPaymentIntentAmountMinor → remainingTotalMinor` → красный. `deps.bookingEngine` реально подключён (`buildAppDeps.ts:2076`), фолбэка на полную стоимость в проде нет | держится |
| 3. Живой пересчёт `prepaymentQuote` убран из контракта чтения | `prepaymentQuote` отсутствует в `booking-calendar/types.ts` и в `AppointmentPaymentSection.tsx` | держится |
| 4. Миграция под объявленными владельцами | `migrate-local.mjs --rollback-only` против `bcb_webapp_dev`: `pending=2 total=122 reapplied=0 unapplied=0` | PASS |
| 4. Права, владельцы, EXECUTE, артефакты | `check:db-privileges-generated` — побайтно; `test:db-privileges` — 341/184 pass, 0 fail; владелец `app_seam_payment_webhook_owner`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE` только `app_staff`, UPDATE-поверхность ограничена `prepayment_paid_minor, status, updated_at`; `prepayment_paid_minor` у `app_staff` по-прежнему нет | держится |
| 4. Второго планировщика нет | `background-jobs-cli --check` → OK (24 артефакта) | держится |
| 5. Единая проекция статусов после синхронизации с `feat/doctor-ui-rebuild` | `src/app/app/doctor/calendar`, `src/app/app/doctor/appointments`, `src/modules/booking-calendar`, `src/shared/ui/doctor/calendar` — все зелёные | держится |
| Общий гейт | `pnpm typecheck` — все 7 проектов Done; `pnpm lint` — exit 0 | PASS |

### Команды и результаты

```
pnpm typecheck                     → Done (7 проектов)
pnpm lint                          → exit 0
pnpm check:db-privileges-generated → побайтно, exit 0
pnpm test:db-privileges            → 341 tests, 184 pass, 0 fail, 157 skip
node deploy/host/background-jobs-cli.mjs --check → OK (24 artifacts)
node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev \
  --migrator bcb_dev_migrator --drizzle-folder apps/webapp/db/drizzle-migrations \
  --sudo-postgres --rollback-only
  → validated and rolled back: pending=2 total=122 reapplied=0 unapplied=0
(apps/webapp) npx vitest --run   → 530 files: 3 FAILED / 520 passed / 7 skipped
                                   2755 tests: 5 FAILED / 2719 passed / 31 skipped
```

Прежний аудит гонял только выборочные наборы — оба блокера лежат вне них, поэтому и не были видны.
Одноразовых баз не поднималось, DEV/TEST/PROD не изменялись.

---

## Устранение двух блокеров финальной приёмки (2026-09-06, та же ветка)

Отчёт о приёмке выше остаётся как есть — ниже отмечено, что из него уже неверно. Продуктовое
поведение не менялось ни в одном из двух мест: чинились ровно гейты.

**БЛОКЕР 1 — закрыт.** Правило арендатора журнала платежей теперь сформулировано ОДИН раз
(`assertPatientPaymentTenant` в `pgPatientPayments.ts`) и стоит перед ОБЕИМИ пишущими дверьми:
реляционной транзакцией (`runPatientPaymentMutation` зовёт его) и именованным корнем наличных по
записи (зовёт его до сборки payload). Атомарный корень `app.settle_appointment_cash_prepayment` и
его SQL-защита не тронуты — снаружи от них восстановлен тот же TS-гейт, который дверь записи
потеряла. `pgPatientPayments.principal.unit.test.ts` снова покрывает дверь, которой люди
пользуются: принципал снимается в момент выдачи ТОЙ двери, которую взяла запись, а не только
реляционной, и чужая клиника в аргументе теперь доказанно не выдаёт statement НИ ОДНОЙ формы
(`expect(runWebappNamedRoot).not.toHaveBeenCalled()` рядом с прежним `withTransaction`).

**БЛОКЕР 2 — закрыт.** `api/internal/booking-prepayment/expire:POST` объявлен в центральной
декларации в `WEBAPP_WORKER_SOURCES`, то есть под уже существующей возможностью
`webapp_worker_relation` (`sessionRole app_staff` → `targetRole app_worker`, класс `service`) — той
же ролью и тем же классом, под которыми исполняется его собственный корень
`app.expire_due_booking_prepayments(integer)`, и тем же списком, где живут соседние машинные тики
(`saas-billing/renewal/tick`, `domain-health/tick`). Новой роли, новой привилегии и разрозненных
`GRANT` не заводилось; `runtimeSources` рендерится в рантайм-окружение порта на деплое, поэтому
generated-артефакты после перегенерации побайтно те же.

**Fault injection (обе поломки внесены ПОСЛЕ коммита правок и полностью откачены):**

| Поломка | Что покраснело |
|---|---|
| снят восстановленный TS-гейт с ветки именованного корня | `pgPatientPayments.principal.unit.test.ts` → 2 красных из 6 (обе стены арендатора) |
| строка источника удалена из `WEBAPP_WORKER_SOURCES` | `journalRetention.contract.test.ts` → красный, `["api/internal/booking-prepayment/expire:POST"]` назван поимённо |

**Гейты на итоговом коммите `39042bc9d`:**

```
(apps/webapp) npx vitest --run src/infra/repos/pgPatientPayments.principal.unit.test.ts → 6/6
(apps/webapp) npx vitest --run src/modules/db-retention/journalRetention.contract.test.ts → 2/2
(apps/webapp) npx vitest --run <payment/prepayment acceptance set> → 52 файла, 286 тестов, all pass
pnpm check:db-privileges-generated → побайтно, exit 0
pnpm test:db-privileges            → 341 tests, 184 pass, 0 fail, 157 skip
pnpm test:db-principal             → 31 pass, 0 fail
node deploy/host/background-jobs-cli.mjs --check → OK (24 artifacts)
pnpm typecheck                     → Done (7 проектов)
scoped ESLint (3 изменённых файла)  → exit 0
```

**НЕ СДЕЛАНО:** унаследованный красный `protectedActionRegistryCoverage.unit.test.ts`
(`anamnesis/route.ts:PATCH`) — по указанию брифа не трогался, это дефект `feat/doctor-ui-rebuild`,
приехавший слиянием; приземлению кандидата он мешает по-прежнему. Замечания ниже порога MUST FIX из
первого аудита также не трогались.

---

## Финальная приёмка исправлений (2026-09-06, независимый закрывающий проход)

**Кандидат:** `wt/appointment-prepayment-core`, HEAD `ea587013e` (исправления двух merge-блокеров
`39042bc9d`, регистрация anamnesis-действия `812bf879e`, слияние актуальной
`feat/doctor-ui-rebuild`). Продуктовый код не менялся; все временные поломки откачены, рабочее
дерево чистое.

### Вердикт: **PASS**

Все пять проверок брифа закрыты. Ни одного достижимого сценария отказа против пунктов authority
(`PAY-APPT-05`, `PAY-APPT-10`–`PAY-APPT-12`, `PAY-APPT-18`–`PAY-APPT-20`) не найдено. Оба блокера
прошлой приёмки закрыты по существу, а не обходом гейта; унаследованный красный
`protectedActionRegistryCoverage` тоже закрыт (`812bf879e` — та же exemption-строка
`critical mechanic (patient_card)`, что уже несёт соседний `POST` того же маршрута, и `PATCH`
стоит за тем же `requireDoctorWorkspaceApiContext`).

### Проверки брифа

| № | Проверка | Как проверено | Итог |
|---|---|---|---|
| 1 | Перенос/правка `awaiting_payment` без 500, без молчаливого подтверждения, запись остаётся в пути истечения | реальный FSM + реальное поведение `applyReschedule`; маршрут правки читает пред-состояние для `serviceChanged` и пост-состояние для расчёта, замок денег стоит и в маршруте, и в самом `UPDATE` (`prepayment_paid_minor = 0 AND payment_ref IS NULL`) | PASS |
| 1 | То же правило в пациентском корне | взгляд: `20260906T101500_…sql`, `v_to_status` CASE повторяет `appointmentStatusAfterReschedule`; VERIFY-заголовок миграции ассертит условие в теле функции | PASS |
| 2 | Наличные атомарно и идемпотентно гасят требование | взгляд на `app.settle_appointment_cash_prepayment(text)`: `FOR UPDATE` записи ДО журнала, зачисление только при фактической вставке (`v_inserted`), идемпотентность на `uq_patient_payment_appointment_idempotency`; журнал и зачисление — один statement-атомарный корень | PASS |
| 2 | Оплаченная запись не попадает под автоотмену | тик отбирает `status='awaiting_payment' AND prepayment_paid_minor=0 AND payment_ref IS NULL`; корень выводит в `confirmed` и оставляет ненулевой `prepayment_paid_minor`. Дверь наличных по записи достижима только с ключом: единственный вызывающий (`staffAppointmentPayments.ts:288`) всегда шлёт детерминированный `staff-appointment-cash:<id>:<сумма>`; вторая дверь (`patients/[userId]/payments`) `appointmentId` не передаёт вовсе | PASS |
| 3 | Ссылка/QR на непокрытую часть ТРЕБОВАНИЯ из снимка | `appointmentPaymentIntentAmountMinor` из снимка; `getPaymentState.totalMinor` — снимок, историческая проекция только как резерв для старых записей; живой пересчёт `prepaymentQuote` отсутствует и в контракте, и в карточке — карточка печатает то же число, на которое создаётся намерение | PASS |
| 4 | Миграция под объявленными владельцами | `migrate-local.mjs --rollback-only` против `bcb_webapp_dev`: `pending=2 total=122 reapplied=0 unapplied=0` | PASS |
| 4 | Владельцы, `EXECUTE`, grants, артефакты | `check:db-privileges-generated` побайтно; `test:db-privileges` 341/184 pass 0 fail; `test:db-principal` 31/31; `check-migration-privileges` OK (123 файла) в составе `pnpm lint`; у `app_staff` нет `UPDATE` на `prepayment_paid_minor`; новый cron-источник объявлен существующей возможностью `webapp_worker_relation` без новой роли и без ручного `GRANT` | PASS |
| 4 | Второго планировщика нет | `background-jobs-cli --check` → OK (24 артефакта) | PASS |
| 5 | Единая проекция статусов после синхронизации с `feat/doctor-ui-rebuild` | `doctorAppointmentStatusView` — единственная лесенка, и её спрашивают все три поверхности: строка списка (`ScheduleCalendarTab.tsx:549`), сетка (`:449`, `:2345` + `DoctorTodayMiniCalendar.tsx:135`) и панель деталей (`DoctorCalendarEventPanel.tsx:547`) | PASS |

### Kill-set на кандидате (каждая поломка внесена отдельно и полностью откачена)

| Поломка | Что покраснело |
|---|---|
| снято ребро FSM `awaiting_payment → rescheduled` | 3 красных: `awaitingPaymentReschedule`, `pgBookingAppointmentLifecycle.awaitingPayment`, `financials.route` |
| `appointmentStatusAfterReschedule` → константа `'confirmed'` | те же 3 красных |
| ветка именованного корня наличных отключена (падение на реляционный путь) | 3 красных: `pgPatientPayments.appointmentCash`, `pgPatientPayments.principal` |
| `appointmentPaymentIntentAmountMinor` → `remainingTotalMinor` | 3 красных в `staffAppointmentPaymentIntent` |
| `prepayment_paid_minor` добавлен в `app_staff` UPDATE | `appointment-prepayment-least-privilege` → 1 fail из 9 |
| строка источника удалена из `WEBAPP_WORKER_SOURCES` | `journalRetention.contract` → красный, источник назван поимённо |
| снят TS-гейт арендатора с ветки именованного корня | `pgPatientPayments.principal` → 2 красных из 6 |
| снята ступень «ожидает оплаты» из общей лесенки | `doctorCalendarPresentation.unit` + `DoctorCalendarEventPanel.ui` → 2 красных |

### Команды и результаты

```
(apps/webapp) npx vitest --run  → 530 файлов: 523 passed | 7 skipped | 0 failed
                                  2755 тестов: 2724 passed | 31 skipped | 0 failed
pnpm typecheck                     → Done (7 проектов)
pnpm lint                          → exit 0 (включая check-migration-privileges, 123 файла)
pnpm check:db-privileges-generated → побайтно, exit 0
pnpm test:db-privileges            → 341 tests, 184 pass, 0 fail, 157 skip
pnpm test:db-principal             → 31 pass, 0 fail
node deploy/host/background-jobs-cli.mjs --check → OK (24 artifacts)
node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev \
  --migrator bcb_dev_migrator --drizzle-folder apps/webapp/db/drizzle-migrations \
  --sudo-postgres --rollback-only
  → validated and rolled back: pending=2 total=122 reapplied=0 unapplied=0
```

### Замечания ниже порога finding (не блокируют, для триажа владельца)

1. **Счёт на ОСТАТОК стоимости после покрытой предоплаты не выставляется.** Предоплата 750 из
   2500 оплачена → `appointmentPaymentIntentAmountMinor` даёт 0, и кнопка ссылки отвечает
   `already_paid`, хотя 1750 ₽ не получены (наличными добрать по-прежнему можно —
   `canCollect` смотрит на `remainingMinor`). Требование брифа («ссылка на непокрытую часть
   ТРЕБОВАНИЯ предоплаты») выполнено буквально; нужна ли из деталей вторая ссылка на остаток и с
   каким текстом отказа — продуктовая развилка `PAY-APPT-06`, а не дефект против authority.
2. **Наличные по записи зачисляются в `prepayment_paid_minor` целиком**, даже когда требования
   предоплаты нет (`prepayment_required_minor = 0`). Следствие: после кассы включается замок
   `isAppointmentFinancialsLocked` и стоимость такой записи больше не переписывается. Поведение
   согласуется с `PAY-APPT-12` («после состоявшихся денег финансовые значения не переписываются»),
   но имя колонки в этом случае шире своего смысла.
3. Замечания 1–7 первого аудита не трогались и остаются открытыми (двойное зачисление при повторе
   под НОВЫМ ключом, неатомарность правки с переносом, `INSERT` `app_staff` на
   `prepayment_paid_minor`, неотличимость истечения от отмены клиникой, отсутствие цены у
   онлайн-записи пациента, размноженное умолчание «20 минут», дублированная
   `prepaymentOverrideSchema`).

### НЕ СДЕЛАНО

- `PAY-APPT-20` (полные сценарии на живом TEST: оплата ссылкой/QR у реального провайдера, webhook,
  повтор webhook, истечение срока) — приёмка на TEST в этот проход не выполнялась и остаётся за
  владельцем. Ни DEV, ни TEST, ни PROD не изменялись, одноразовых баз не поднималось.
- Живая приёмка владельца по галочкам `PAY-APPT-05/10/11/12/18/19` — за владельцем; здесь закрыт
  только инженерный гейт.
