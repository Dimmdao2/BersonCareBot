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

`POST /api/booking/public/create` — без сессии; пользователь через `app-layer/platform-user/resolveOrCreateUserByPhone.ts` (`TrustedPatientPhoneSource.PublicBookingByPhone`).

## Admin

- `POST /api/admin/booking-engine/appointments/manual` — ручная бронь.
- `GET`/`POST`/`DELETE /api/admin/booking-engine/schedule-blocks` — блокировки расписания.

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
