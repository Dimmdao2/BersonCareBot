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
