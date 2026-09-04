# payments

Платёжный слой записи (этап 5 OWN_BOOKING_ENGINE): предоплата, intents, capture, refund/retain.

## Конфигурация

- `system_settings.booking_payment_enabled` (boolean)
- `system_settings.booking_payment_providers` — JSON: `defaultProviderId`, `providers[]` (`id`, `label`, `enabled`, `webhookSecret`, …)
- Секреты **не** в ENV; merge/redaction в `bookingPaymentSettings.ts` + admin Settings / `BookingPaymentsSection`

## Поток

1. `canonicalCreate` → `resolvePrepayment` (услуга или `online_category`) → при `required`: intent + `awaiting_payment`.
2. Capture (mock UI, webhook) → `payment_ref` на `be_appointments` → `paid` → `confirmed` → callback в `buildAppDeps` → `booking.payment_captured`.
3. Cancel с retain/refund → `applyCancelPaymentOutcome` (из lifecycle этапа 4).
4. Reschedule → `recordReschedulePaymentCarryOver` → history event.

Публичный provider webhook до установки tenant-principal определяет организацию только через
`app.resolve_payment_webhook_organization(provider_id, idempotency_key, event_type)`. Это узкий
`SECURITY DEFINER`-контракт: наружу возвращается только `organization_id`; payload, суммы и прямое
чтение платёжных таблиц bootstrap-роли не выдаются. Сначала проверяется уже сохранённое lifecycle-
событие, затем исходный intent с тем же provider/idempotency key; неоднозначность даёт `NULL`.

## API

См. `apps/webapp/src/app/api/api.md` — секции **booking/** (patient/public payment routes), **payments/** (webhook), **admin/booking-engine/** (`prepayment-policies`, `appointments/[id]/payment`).

Doctor appointment cards use the same `appointments/[id]/payment` contract. `GET` returns the
canonical prepayment summary plus the appointment-scoped cash-ledger total; `POST { action: 'cash' }`
settles only the server-authorized remainder, while `POST { action: 'link' }` reuses
`createAppointmentPaymentIntent` with a deterministic appointment/remainder idempotency key.

`GET` additionally states what the card is allowed to draw, so the UI never renders a control the
`POST` door would refuse:

- `paymentsEntitled` — tariff mechanic `payments` (`getMechanicMutationAvailability`); `false` hides
  the whole payment block, it is not a disabled control.
- `onlinePaymentAvailable` — the above **plus** `getPrepaymentAvailability` (payments enabled and a
  provider resolvable); gates «Выставить счёт», QR and the pay-link.
- `patientChatAvailable` — the patient is `linked` to the portal, so the support conversation is a
  real delivery path; gates «Отправить в чат». There is no per-channel send seam and no patient SMS
  contract, so no surface offers Telegram / Max / push / SMS as separate channels.

## Модули

| Слой                | Путь                                    |
| ------------------- | --------------------------------------- |
| Порт                | `ports.ts`                              |
| Сервис              | `service.ts`                            |
| Калькулятор         | `prepaymentCalculator.ts`               |
| Контекст из booking | `prepaymentContextFromBooking.ts`       |
| Repo                | `infra/repos/pgPayments.ts`             |
| Mock adapter        | `infra/payments/mockPaymentProvider.ts` |

## Тесты

`prepaymentCalculator.test.ts`, `service.test.ts`, `prepaymentContextFromBooking.test.ts`; маршруты — `app/api/booking/payment-routes.test.ts`.
