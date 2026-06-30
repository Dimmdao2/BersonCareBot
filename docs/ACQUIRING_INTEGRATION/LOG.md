# Acquiring Integration — LOG

## 2026-06-14 — Initial implementation

### Task
Real acquiring (card payment) integration behind ONE generic provider port, adapters for FOUR
Russian providers: YooKassa, Tinkoff, CloudPayments, Alfa-Bank.

### Abstraction Unification Decision

Two existing seams were reconciled into one coherent abstraction:
- `modules/payments/providerPort.ts` (`PaymentProviderPort: createIntent/refund/verifyWebhook`) — booking payments
- `modules/patient-payments/ports.ts` (`AcquiringGatewayPort: createCharge`) — doctor «Учётка»

**Decision:** Keep both interfaces. Extend `AcquiringGatewayPort` to add `refund()` + `verifyWebhook()`.
Create `infra/payments/registryAcquiringGateway.ts` as the bridge that makes `AcquiringGatewayPort`
delegate to the same `PaymentProviderPort` adapters used by booking payments. This avoids:
- Creating a third abstraction
- Rewriting YooKassa adapter
- Duplicating configuration (both share `system_settings.booking_payment_providers`)

### Files Created
- `apps/webapp/src/infra/payments/tinkoffPaymentProvider.ts` — Token=SHA-256 signed params
- `apps/webapp/src/infra/payments/tinkoffPaymentProvider.test.ts` — 9 tests
- `apps/webapp/src/infra/payments/cloudpaymentsPaymentProvider.ts` — HMAC-SHA256 Content-HMAC
- `apps/webapp/src/infra/payments/cloudpaymentsPaymentProvider.test.ts` — 10 tests
- `apps/webapp/src/infra/payments/alfabankPaymentProvider.ts` — SHA-256(mdOrder+secret) checksum
- `apps/webapp/src/infra/payments/alfabankPaymentProvider.test.ts` — 9 tests
- `apps/webapp/src/infra/payments/paymentProviderRegistry.test.ts` — 8 tests covering all 5 adapters
- `apps/webapp/src/infra/payments/registryAcquiringGateway.ts` — bridge adapter

### Files Modified
- `apps/webapp/src/infra/payments/paymentProviderRegistry.ts` — add tinkoff/cloudpayments/alfabank
- `apps/webapp/src/modules/payments/types.ts` — add terminalKey/publicId/merchantLogin/gatewayUrl to PaymentProviderConfig
- `apps/webapp/src/modules/patient-payments/ports.ts` — extend AcquiringGatewayPort with refund()+verifyWebhook()
- `apps/webapp/src/modules/system-settings/types.ts` — update booking_payment_providers comment
- `apps/webapp/src/infra/repos/noopAcquiringGateway.ts` — add refund()/verifyWebhook() noop stubs
- `apps/webapp/src/app-layer/di/buildAppDeps.ts` — wire registryAcquiringGateway (replaces noop for DB)

### Webhook Verification Schemes
- YooKassa: Basic Auth header OR HMAC-SHA256 of body via x-yookassa-signature
- Tinkoff: SHA-256 of sorted (alphabetical) param values + Password field appended
- CloudPayments: HMAC-SHA256 of raw body, base64-encoded in Content-HMAC header
- Alfa-Bank: SHA-256(mdOrder + secret) as `checksum` field; no checksum = passthrough (caller must call getOrderStatusExtended)

### Webhook Route
Existing route `app/api/payments/webhook/[provider]/route.ts` already handles all providers via
`deps.payments.processProviderWebhook({ providerId: provider, ... })`. No new route needed.
The AcquiringGatewayPort.verifyWebhook() in registryAcquiringGateway throws `use_booking_webhook_route_for_verification`
as a guard — patient-payments acquiring webhooks should route through the same path.

### No New Dependencies
All signature schemes implemented using Node.js built-in `node:crypto` (no npm packages added).

### Tests
- 42 tests pass across 8 test files: infra/payments/*.test.ts + modules/payments/*.test.ts
- TypeScript typecheck: pass (exit 0)
- ESLint: pass (exit 0)

### System Settings Keys
No new ALLOWED_KEYS added — all four providers use existing `booking_payment_providers` key.
Updated the JSDoc comment to document per-provider field mapping.

### Migration
No new migration needed — existing `patient_payment` table (0122_patient_payments.sql) supports acquiring.
The `provider` and `provider_payment_id` columns are already there.

### Orchestrator Integration Notes
- No new migration file: 0126+ slot is free for orchestrator use
- Journal idx 125 is the last entry; no collision expected
- The `booking_payment_providers` system_settings key already exists; just add provider configs via admin UI
- Test: use `"mock"` provider (always succeeds without credentials)
