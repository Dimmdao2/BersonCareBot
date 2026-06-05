# patient-booking

Запись пациента: канонический write-путь (`be_appointments`) + совместимость с `patient_bookings` и уведомлениями.

## Read/write sources (transitional, 2026-05-30)

Admin keys (`system_settings`, scope `admin`):

- **`booking_doctor_appointments_read_source`:** `rubitime_legacy` | `canonical` — список записей врача, KPI, **календарь** (тот же switch).
- **`booking_slots_read_source`:** `rubitime` | `canonical` — patient/public слоты и логика **create**.

| `booking_slots_read_source` | Create |
|-----------------------------|--------|
| `rubitime` | Rubitime-first: `createRecord` обязателен, канон после; rollback `cancelRecord` при сбое; без `assertSlotAvailable` |
| `canonical` | Канон primary; Rubitime best-effort при `booking_rubitime_bridge_enabled` |

Код: `canonicalCreate.ts`, `slotsReadSource.ts`, `doctorAppointmentsReadSwitch.ts`, `bookingCalendarReadSwitch.ts`.

## Поток создания (этап 2)

1. При **`booking_slots_read_source=canonical`:** валидация слота (`booking-scheduling.assertSlotAvailable`) и обязательных полей (`booking-form`). При **`rubitime`** — skip assert (слот из Rubitime API).
2. `be_appointments` со статусом `confirmed` или `awaiting_payment` при обязательной предоплате (exclusion constraint на специалиста).
3. `patient_bookings` (pending → confirmed), связь `canonical_appointment_id`.
4. Rubitime — по режиму выше; mapping `appointment` ↔ rubitime.
5. Проекция в `appointment_records` (`integrator_record_id` = `be:{appointmentId}`) для кабинета врача при canonical cutover / native path.
6. `emitBookingEvent('booking.created')` → integrator / напоминания.

Реализация: `canonicalCreate.ts` (вызывается из `service.ts` при наличии `bookingEngine` + `bookingScheduling` в DI).

## Слоты

`GET /api/booking/slots` — Rubitime API или собственный расчёт (`modules/booking-scheduling`) по **`booking_slots_read_source`**. Query `slotCount` (1–8) для цепочек в canonical mode; UI `/app/patient/booking/new/slot` фиксирует `slotCount=1` (без multi-slot selector).

## Поля формы

- `GET /api/booking/form-fields` — поля для пациента (сессия).
- Create/cancel принимают `formAnswers[]`; серверная валидация через `booking-form.validateAnswers`.
- Admin: `GET`/`POST /api/admin/booking-engine/form-fields`.

## Публичный вход

**Публичный канал (этап 3):** UI `/book/new` (очный + онлайн), embed `/book/embed.js`; read-API `GET /api/booking/public/catalog/*`, `slots`, `form-fields`; `POST /api/booking/public/create` — без сессии, rate-limit (`booking.public_create`), UTM → `be_appointments.attribution_json`, `bookingChannel: public_widget`; пользователь через `resolveOrCreateUserByPhone` (`TrustedPatientPhoneSource.PublicBookingByPhone`); кандидаты мерджа — `patient_merge_candidates` + admin `/api/admin/booking-engine/merge-candidates`, UI `/app/doctor/admin/booking`, `/app/doctor/booking-merge`.

## Перенос и отмена (этап 4)

Записи с **`canonical_appointment_id`**:

1. Preview: `GET /api/booking/actions?bookingId=` → `previewCancel` / `previewReschedule` (политики `booking-policies`, anti-bypass §8.4).
2. **Отмена:** `booking-appointment-lifecycle.patientCancel` (канон) **до** best-effort Rubitime `cancelRecord`; затем `patient_bookings` → `cancelled`; проекция; `emitBookingEvent('booking.cancelled')`; `notifications_sent` (+ `rubitime_mirror` при сбое моста). API: `{ ok: true }` или partial flags (`rubitimeMirrorFailed`, `notificationOutcomeFailed`, `paymentOutcomeFailed`, `membershipOutcomeFailed`, `productOutcomeFailed`) — канон уже отменён.
3. **Перенос:** проверка слота с `excludeAppointmentId`; lifecycle → `patient_bookings.updateSlotsAfterReschedule`; проекция (`native.rescheduled`); `emitBookingEvent('booking.rescheduled')` (integrator schema + handler); история в `be_appointment_reschedules`. API: `{ ok: true }` или partial flags (`rubitimeMirrorFailed`, `notificationOutcomeFailed`, `paymentOutcomeFailed`).

Без канона — legacy-отмена только через Rubitime + `patient_bookings` (без политик).

Ручные решения: admin `.../manual-cancel|manual-reschedule`; doctor `/api/doctor/booking-engine/appointments/[id]/...` (`canAccessDoctor`); история `GET .../appointments/[id]/lifecycle` (admin).

## Предоплата и оплата (этап 5)

При политике предоплаты и `booking_payment_enabled`:

1. `canonicalCreate` → `awaiting_payment` + `be_payment_intents`; `patient_bookings.awaiting_payment`; **`booking.created` не отправляется** до capture.
2. Оплата: пациент **`GET/POST /api/booking/payment-*`** → UI `/app/patient/booking/pay`; публично **`/api/booking/public/payment-*`** → `/book/pay` (верификация телефона).
3. Capture → `be_appointments.payment_ref`, переход `paid` → `confirmed`, `patient_bookings.confirmed`, `emitBookingEvent('booking.payment_captured')` (напоминания).
4. Отмена с типами retain/refund prepayment → `modules/payments` `applyCancelPaymentOutcome`.
5. Перенос → `prepayment_carried_on_reschedule` в `be_payment_history_events`.

Модуль: `modules/payments/`. Admin: `BookingPaymentsSection`, `BookingPrepaymentSection`; staff B-pay — `BookingStaffPaymentPanel`.

## Admin

- `POST /api/admin/booking-engine/appointments/manual` — ручная бронь.
- `GET`/`POST`/`DELETE /api/admin/booking-engine/schedule-blocks` — блокировки расписания.
- `GET`/`POST /api/admin/booking-engine/policies` — политики отмены/переноса (org-level в UI).
- `GET`/`PUT /api/admin/booking-engine/prepayment-policies` — предоплата по услуге или онлайн-категории.

## Модули и инфра

| Слой | Путь |
|------|------|
| Порты | `ports.ts` (`AppointmentProjectionPort` — в модуле, не в infra) |
| Сервис | `service.ts`, `canonicalCreate.ts`, `patientMirrorOutbound.ts` (cancel/reschedule → Rubitime) |
| Слоты | `../booking-scheduling/` |
| Поля | `../booking-form/` |
| Bookings | `infra/repos/pgPatientBookings.ts` |
| API | `app/api/booking/*` |

## Тесты

`service.test.ts`, `canonicalCreate.test.ts`, `patientMirrorOutbound.test.ts`, `slotOverlap.test.ts`, `createInputValidation.test.ts`; payments — `modules/payments/*.test.ts`, `app/api/booking/payment-routes.test.ts`.
