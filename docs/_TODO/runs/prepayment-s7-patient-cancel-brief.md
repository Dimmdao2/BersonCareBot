# Brief — S7: the patient learns his booking was cancelled, and why

Owner plan — the ONLY source of todo and done:
`docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, stage **S7**. Close S7.1 and S7.2 there
and nothing else. A finding of yours with no checkbox in that file is a QUESTION for the lead, never
work.

Источник оракула: `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` §K2 `PAY-APPT-11` —
«Если предоплата не поступила до дедлайна, бронь автоматически освобождается, а запись получает»
однозначный истёкший/отменённый статус согласно действующей модели.

Решение владельца 11.09, дословно: «у нас есть статус там отменена поздняя отмена или отменена
например по неоплате вот можно писать ну типа писать статус как бы показывать запись отменённую вот
и показывать причина да не оплачено типа бронь неоплаченная или предоплата не внесена». И там же:
«никаких уведомлений ему приходить не должно» — про ВРАЧА. Уведомлений врачу не заводить.

## Первый шаг — доказать состояние, а не поверить брифу

Лид прочитал это по коду и НЕ проверял живьём. Начни с живого замера на `bcb_webapp_dev`: найди
запись, отменённую истечением предоплаты (`be_appointment_history_events.payload->>'source' =
'prepayment_expired'`), и покажи рядом её строку в `patient_bookings` — какой у неё `status`.
Если окажется, что проекция всё-таки обновляется, СТОП и доложи: тогда этап другой, и переписывать
его буду я, а не ты.

## Что известно (проверено чтением, перепроверь)

- Корень истечения `app.expire_due_booking_prepayments` — миграция
  `apps/webapp/db/drizzle-migrations/20260905T233000_an_appointment_owns_its_price_and_prepayment.sql:672-748`.
  Пишет в `be_appointments`, `be_appointment_history_events`, `be_patient_timeline_events`.
  `patient_bookings` не трогает.
- Тик `apps/webapp/src/app/api/internal/booking-prepayment/expire/route.ts` зовёт только этот корень.
- Зеркалящего триггера на `be_appointments` нет; единственный триггер там —
  `be_appointments_confirmed_overlap_occupancy_guard`.
- У врача причина уже выводится из истории: `pgBookingCalendar.ts:396`, `pgDoctorClients.ts:842`,
  бейдж `DoctorAppointmentIndicators.tsx:34-41`. **Это существующее правило — источник признака для
  пациента тоже. Второго правила не заводи.**
- Список записей пациента строится из `PatientBookingRecord.status`
  (`apps/webapp/src/app/app/patient/booking/BookingUpcomingSection.tsx`).

## Что построить

- **S7.1** Отмена доходит до проекции пациента **в том же корне и в той же транзакции**, что и отмена
  самой записи. Не заводи второй тик, не заводи фоновую досинхронизацию и не чини это из приложения
  после факта: расхождение проекции — это то, что мы чиним, а не то, что мы добавляем.
- **S7.2** Пациент видит причину «Предоплата не внесена», а не обычную отмену клиникой.

## Ограничения

- Ветка `wt/prepayment-s7-patient-cancel`. Коммить только свои файлы поимённо. `git add -A` запрещён.
- **Не трогай** (их правят параллельно): `apps/webapp/src/modules/patient-booking/canonicalCreate.ts`,
  `apps/webapp/src/app-layer/booking/bookingCreatedEffects.ts`,
  `apps/webapp/src/modules/patient-booking/patientMessageText.ts`,
  `apps/webapp/src/app/book/pay/**`, `apps/webapp/src/app/app/patient/booking/pay/**`,
  `apps/webapp/src/shared/lib/paymentStatusView.ts`,
  `apps/webapp/src/app/app/doctor/calendar/AppointmentPaymentSection.tsx`.
  `BookingUpcomingSection.tsx` правится параллельно — согласуй правку минимальной и скажи об этом в
  отчёте. Если этап без запрещённого файла не делается — СТОП и доложи, не правь.
- **Новая колонка или новый грант — это четыре места в декларации прав**, а не `GRANT` в миграции:
  reconcile его снесёт. Смотри `deploy/postgres/privileges/declaration.ts` и прогони
  `check:db-privileges-generated`.
- Сырой SQL для нового кода запрещён — только через drizzle-порт; исключение ровно одно: тело
  именованного SQL-корня в миграции.
- Новую базу не заводить, историю миграций не переигрывать. DEV — `bcb_webapp_dev`. ПРОД не трогать
  вообще, включая чтение.

## Тесты

`AGENTS.md` §10a и §10. Тестов лучше МЕНЬШЕ, чем больше. Тест пишется там, где отказ дорогой И
молчаливый — а тихое расхождение проекции с записью ровно такое. Тест, фиксирующий формулировку,
число элементов или аргументы вызова между нашими же функциями, — не доказательство, не пиши его.
Каждый написанный тест докажи внесением поломки: сломал → покраснел → откатил. Тяжёлые прогоны —
через `/home/dev/brain/host-orch/run-tests.sh "<cmd>"`.

## Готово

Нумерованный чек-лист, каждая строка с доказательством:
1. Живой замер ДО: запись отменена истечением, а `patient_bookings` показывает прежний статус.
2. Живой замер ПОСЛЕ: та же ситуация — проекция отменена в той же транзакции.
3. Пациент видит причину «Предоплата не внесена».
4. Врач видит ровно то же, что и раньше (его бейдж не сломан).
5. Узкий прогон тестов и typecheck зелёные; `check:db-privileges-generated` зелёный.
6. `git status`/`git log` чистые: только свои файлы.

Отдельной секцией «НЕ СДЕЛАНО», даже если она пустая.
