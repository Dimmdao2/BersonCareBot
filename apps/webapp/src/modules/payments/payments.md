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

## API

См. `apps/webapp/src/app/api/api.md` — секции **booking/** (patient/public payment routes), **payments/** (webhook), **admin/booking-engine/** (`prepayment-policies`, `appointments/[id]/payment`).

## Модули

| Слой | Путь |
|------|------|
| Порт | `ports.ts` |
| Сервис | `service.ts` |
| Калькулятор | `prepaymentCalculator.ts` |
| Контекст из booking | `prepaymentContextFromBooking.ts` |
| Repo | `infra/repos/pgPayments.ts` |
| Mock adapter | `infra/payments/mockPaymentProvider.ts` |

## Тесты

`prepaymentCalculator.test.ts`, `service.test.ts`, `prepaymentContextFromBooking.test.ts`; маршруты — `app/api/booking/payment-routes.test.ts`.
