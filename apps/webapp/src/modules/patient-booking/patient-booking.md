# patient-booking

Запись пациента: канонический write-путь (`be_appointments`) + совместимость с `patient_bookings` и уведомлениями.

## Read/write sources

Doctor list/KPI/calendar and patient/public slots/create are canonical-only. Historical source-selection rows may
remain in the database for migration audit, but runtime does not read them.

| Area                  | Runtime source                                                  |
| --------------------- | --------------------------------------------------------------- |
| Patient/public slots  | `booking-scheduling` canonical slots                            |
| Patient/public create | native `be_appointments` via booking engine                     |
| Create overlap guard  | `assertSlotAvailable` preflight + atomic canonical insert guard |

Код: `canonicalCreate.ts`, `slotsReadSource.ts`, `doctorAppointmentsReadSwitch.ts`, `bookingCalendarReadSwitch.ts`.

## Поток создания (этап 2)

1. Быстрая валидация слота (`booking-scheduling.assertSlotAvailable`) и обязательных полей (`booking-form`).
2. `be_appointments` со статусом `confirmed` или `awaiting_payment`. Для очной записи действует exclusion constraint на специалиста; legacy online/null-capacity путь блокирует все минутные ключи полуинтервала `(organization, [start, end))`, повторно проверяет занятость и вставляет цепочку в одной транзакции.
3. `patient_bookings` (pending → confirmed), связь `canonical_appointment_id`.
4. Проекция в `appointment_records` (`integrator_record_id` = `be:{appointmentId}`) для кабинета врача.
5. `emitBookingEvent('booking.created')` → integrator / напоминания.

Реализация: `canonicalCreate.ts` (вызывается из `service.ts` при наличии `bookingEngine` + `bookingScheduling` в DI).

## Слоты

`GET /api/booking/slots` — собственный расчёт (`modules/booking-scheduling`). Query `slotCount` (1–8) для цепочек; UI `/app/patient/booking/slot` фиксирует `slotCount=1` (без multi-slot selector).

## Поля формы

- `GET /api/booking/form-fields` — поля для пациента (сессия).
- Create/cancel принимают `formAnswers[]`; серверная валидация через `booking-form.validateAnswers`.
- Admin: `GET`/`POST /api/admin/booking-engine/form-fields`.

## Публичный вход

**Публичный канал (этап 3):** UI `/book` (очный + онлайн), embed `/book/embed.js`; read-API `GET /api/booking/public/catalog/*`, `slots`, `form-fields`; `POST /api/booking/public/create` — без сессии, rate-limit (`booking.public_create`), UTM → `be_appointments.attribution_json`, `bookingChannel: public_widget`; пользователь через `resolveOrCreateUserByPhone` (`TrustedPatientPhoneSource.PublicBookingByPhone`); кандидаты мерджа — `patient_merge_candidates` + admin `/api/admin/booking-engine/merge-candidates`, UI `/app/doctor/admin/booking`, `/app/doctor/booking-merge`.

Встроенная локация **«Онлайн»** использует тот же canonical service → specialist → slot путь, что и
очная локация (`type=in_person` остаётся техническим параметром текущего движка). Она показывается
только в контексте точной организации, когда локация активна и к ней назначена публичная услуга
активного специалиста. Generic `/book` не выбирает организацию автоматически; старый online-category
API остаётся fail-closed. Существующие authenticated intake-ссылки реабилитации и нутрициологии не
заменяются этим механизмом.

В публичном per-clinic wizard `orgSlug` сохраняется от услуги до slots/confirm/create. Серверные
`/api/booking/public/slots` и `/api/booking/public/create` заново разрешают организацию по slug и
сверяют её с организацией canonical branch/service; отсутствие slug, неизвестный slug и несовпадение
дают одинаковый нейтральный fail-closed ответ. Поэтому идентификаторы другой клиники нельзя подставить
в уже открытый `/book/{slug}` wizard.

## Перенос и отмена (этап 4)

Записи с **`canonical_appointment_id`**:

1. Preview: `GET /api/booking/actions?bookingId=` → `previewCancel` / `previewReschedule` (политики `booking-policies`, anti-bypass §8.4).
2. **Отмена:** `booking-appointment-lifecycle.patientCancel`, затем `patient_bookings` → `cancelled`; проекция; `emitBookingEvent('booking.cancelled')`; API может вернуть provider-neutral partial flags для notification/payment/membership/product side effects.
3. **Перенос:** проверка слота с `excludeAppointmentId`; lifecycle → `patient_bookings.updateSlotsAfterReschedule`; проекция (`native.rescheduled`); `emitBookingEvent('booking.rescheduled')` (integrator schema + handler); история в `be_appointment_reschedules`.

Запись без `canonical_appointment_id` не поддерживает самостоятельную отмену/перенос.

Ручные решения: admin/doctor `.../manual-cancel|manual-reschedule|delete` (delete — только отменённые; DELETE `patient_bookings`, без второго `booking.cancelled`); история `GET .../appointments/[id]/lifecycle` (admin). Staff delete убирает строку из `listHistoryByUser` / upcoming.

## Предоплата и оплата (этап 5)

При политике предоплаты и `booking_payment_enabled`:

1. `canonicalCreate` → `awaiting_payment` + `be_payment_intents`; `patient_bookings.awaiting_payment`; **`booking.created` не отправляется** до capture.
2. Оплата: пациент **`GET/POST /api/booking/payment-*`** → UI `/app/patient/booking/pay`; публично **`/api/booking/public/payment-*`** → `/book/pay` (верификация телефона).
3. Capture → `be_appointments.payment_ref`, переход `paid` → `confirmed`, `patient_bookings.confirmed`, `emitBookingEvent('booking.payment_captured')` (напоминания).
4. Отмена с типами retain/refund prepayment → `modules/payments` `applyCancelPaymentOutcome`.
5. Перенос → `prepayment_carried_on_reschedule` в `be_payment_history_events`.

Модуль: `modules/payments/`. Admin: `BookingPaymentsSection`, `BookingPrepaymentSection`; staff B-pay — `BookingStaffPaymentPanel`.

## Staff and clinic management

- `POST /api/doctor/booking-engine/appointments/manual` — ручная бронь в server-resolved doctor/clinic scope.
- Рабочий график редактируется через doctor schedule API; старые admin schedule-block mirrors удалены.
- `GET`/`POST /api/admin/booking-engine/policies` — политики отмены/переноса (org-level в UI).
- `GET`/`PUT /api/admin/booking-engine/prepayment-policies` — предоплата по услуге или онлайн-категории.

## Модули и инфра

| Слой     | Путь                                                            |
| -------- | --------------------------------------------------------------- |
| Порты    | `ports.ts` (`AppointmentProjectionPort` — в модуле, не в infra) |
| Сервис   | `service.ts`, `canonicalCreate.ts`                              |
| Слоты    | `../booking-scheduling/`                                        |
| Поля     | `../booking-form/`                                              |
| Bookings | `infra/repos/pgPatientBookings.ts`                              |
| API      | `app/api/booking/*`                                             |

## Тесты

`service.test.ts`, `canonicalCreate.test.ts`, `slotOverlap.test.ts`, `createInputValidation.test.ts`; payments — `modules/payments/*.test.ts`, `app/api/booking/payment-routes.test.ts`.
