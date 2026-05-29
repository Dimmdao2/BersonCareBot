# patient-booking

Запись пациента: канонический write-путь (`be_appointments`) + совместимость с `patient_bookings` и уведомлениями.

## Поток создания (этап 2)

1. Валидация слота (`booking-scheduling`) и обязательных полей (`booking-form`).
2. `be_appointments` со статусом `confirmed` (exclusion constraint на специалиста).
3. `patient_bookings` (pending → confirmed), связь `canonical_appointment_id`.
4. Rubitime — только при включённом мосте, без блокировки ядра; mapping `appointment` ↔ rubitime.
5. Проекция в `appointment_records` (`integrator_record_id` = `be:{appointmentId}`) для кабинета врача.
6. `emitBookingEvent('booking.created')` → integrator / напоминания.

Реализация: `canonicalCreate.ts` (вызывается из `service.ts` при наличии `bookingEngine` + `bookingScheduling` в DI).

## Слоты

`GET /api/booking/slots` — собственный расчёт (`modules/booking-scheduling`), query `slotCount` (1–8) для цепочек. Fallback на integrator/Rubitime только если движок недоступен (in-memory/legacy).

## Поля формы

- `GET /api/booking/form-fields` — поля для пациента (сессия).
- Create/cancel принимают `formAnswers[]`; серверная валидация через `booking-form.validateAnswers`.
- Admin: `GET`/`POST /api/admin/booking-engine/form-fields`.

## Публичный вход

**Публичный канал (этап 3):** UI `/book/new` (очный + онлайн), embed `/book/embed.js`; read-API `GET /api/booking/public/catalog/*`, `slots`, `form-fields`; `POST /api/booking/public/create` — без сессии, rate-limit (`booking.public_create`), UTM → `be_appointments.attribution_json`, `bookingChannel: public_widget`; пользователь через `resolveOrCreateUserByPhone` (`TrustedPatientPhoneSource.PublicBookingByPhone`); кандидаты мерджа — `patient_merge_candidates` + admin `/api/admin/booking-engine/merge-candidates`, UI `/app/doctor/admin/booking`, `/app/doctor/booking-merge`.

## Перенос и отмена (этап 4)

Записи с **`canonical_appointment_id`**:

1. Preview: `GET /api/booking/actions?bookingId=` → `previewCancel` / `previewReschedule` (политики `booking-policies`, anti-bypass §8.4).
2. **Отмена:** Rubitime `cancelRecord` (если есть `rubitimeId`) **до** `booking-appointment-lifecycle.patientCancel`; затем `patient_bookings` → `cancelled`; проекция `appointment_records` (`native.cancelled`); `emitBookingEvent('booking.cancelled')`; `notifications_sent` в `be_appointment_cancellations`.
3. **Перенос:** проверка слота с `excludeAppointmentId`; lifecycle → `patient_bookings.updateSlotsAfterReschedule`; проекция (`native.rescheduled`); `emitBookingEvent('booking.rescheduled')` (integrator schema + handler); история в `be_appointment_reschedules`.

Без канона — legacy-отмена только через Rubitime + `patient_bookings` (без политик).

Ручные решения: admin `.../manual-cancel|manual-reschedule`; doctor `/api/doctor/booking-engine/appointments/[id]/...` (`canAccessDoctor`); история `GET .../appointments/[id]/lifecycle` (admin).

## Admin

- `POST /api/admin/booking-engine/appointments/manual` — ручная бронь.
- `GET`/`POST`/`DELETE /api/admin/booking-engine/schedule-blocks` — блокировки расписания.
- `GET`/`POST /api/admin/booking-engine/policies` — политики отмены/переноса (org-level в UI).

## Модули и инфра

| Слой | Путь |
|------|------|
| Порты | `ports.ts` (`AppointmentProjectionPort` — в модуле, не в infra) |
| Сервис | `service.ts`, `canonicalCreate.ts` |
| Слоты | `../booking-scheduling/` |
| Поля | `../booking-form/` |
| Bookings | `infra/repos/pgPatientBookings.ts` |
| API | `app/api/booking/*` |

## Тесты

`service.test.ts`, `canonicalCreate.test.ts`, `slotOverlap.test.ts`, `createInputValidation.test.ts`.
