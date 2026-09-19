# S11 / PAY-REL-04 — correction evidence

Correction scope: exact F1–F6 from the independent report
`docs/_TODO/runs/s11-payment-reconciliation-audit.md`. The saved acceptance tests from `ca35b7a1b`
were reused unchanged; no blind audit, kill-set, UI, queue, journal, process, setting or manual path was added.

## F1–F6

- **F1 — process route typecheck.** The signed, strict, tenant-principal route now returns the service result
  directly, whose discriminated success result already owns `ok`; it no longer constructs a duplicate `ok` key.
  Provider/reconciliation failures cross the signed boundary only as an allowlisted stable category.
- **F2 — repeat point lane.** The pending reconciliation migration now includes the wake id in each point-row
  `event_id`, while the existing active-row predicate remains the only duplicate suppression. Completed point rows
  order future materialization by their completion time, so the bounded 500-row pass reaches intents that were not
  in an earlier pass instead of repeatedly selecting the oldest completed rows.
- **F3 — YooKassa invoice.** `in-…` refs use authenticated `GET /v3/invoices/{invoice_id}` then authenticated
  `GET /v3/payments/{payment_details.id}`. The resulting normalized fact retains the local invoice ref for local
  binding and retains the payment metadata idempotency key used by webhook verification. Direct payment refs still
  use `GET /v3/payments/{id}`. The retained fixture already supplies the official invoice `payment_details.id`, so
  no fixture weakening or semantic rewrite was needed.
- **F4 — unbound appointment-looking item.** Sweep resolution now reads the local intent first. A canonical
  appointment purpose, appointment marker/UUID subject, or local appointment binding makes the item
  appointment-looking; an absent local intent raises the stable
  `appointment_payment_reconciliation_appointment_unbound` failure, and a local one still passes full binding
  validation before canonical settlement. Irrelevant SaaS/package items without any of these signs remain outside
  appointment settlement. The watermark is not advanced after such a failure.
- **F5 — incidents.** The process route maps only the allowlist `provider_list_truncated`, appointment-unbound,
  binding-mismatch and unavailable-capability categories; every other provider failure becomes the fixed
  `appointment_payment_reconciliation_provider_failed` category. At queue exhaustion the worker derives only one
  of these fixed keys (or the fixed terminal-retry key) from the persisted safe category, never from a dynamic
  error string. No payload, credentials, checkout URL or patient data crosses into the incident.
- **F6 — late success.** A successful settlement for locally `cancelled`/`failed` intent returns the existing
  stable `success_after_local_expiry` signal. The worker opens/touches its operator incident before marking the
  row sent; failure to persist it keeps the row retryable, while the canonical settlement root remains idempotent.
  Point materialization and sweep anchoring retain locally terminal intents with a provider ref until a processed
  `payment.succeeded`, `payment.canceled` or `payment.expired` event proves a terminal provider outcome. Those
  events release the intent, preventing an eternal historical sweep anchor.

## Validation

- `pnpm --dir apps/webapp exec vitest run src/infra/payments/yookassaPaymentProvider.unit.test.ts src/modules/payments/appointmentPaymentReconciliation.unit.test.ts` — PASS, 12/12. This is both saved RED acceptance cases (F3, F4), now green.
- `pnpm --dir apps/integrator exec vitest run src/infra/runtime/scheduler/schedulerLockedTick.unit.test.ts -t "wakes appointment payment reconciliation"` — PASS, 1 selected / 9 skipped.
- `pnpm --dir apps/webapp exec vitest run src/modules/payments/appointmentPaymentReconciliation.unit.test.ts -t "webhook-compatible identity"` — PASS, 1 selected / 1 skipped.
- `pnpm --dir apps/webapp exec vitest run src/modules/payments/providerWebhookSettlement.test.ts src/modules/payments/service.test.ts src/infra/repos/pgPayments.providerWebhook.principal.unit.test.ts src/app-layer/booking/appointmentPaymentConfirmedHandler.d14.test.ts` — PASS, 36/36.
- `pnpm --dir apps/integrator exec vitest run src/infra/runtime/scheduler/fixedCadenceWake.unit.test.ts src/infra/runtime/scheduler/schedulerLockedTick.unit.test.ts src/infra/runtime/worker/outgoingDeliveryWorker.bookingLifecycle.s11.test.ts src/infra/runtime/worker/outgoingDeliveryWorker.scope.test.ts src/infra/db/repos/outgoingDeliveryQueue.namedRoot.unit.test.ts` — PASS, 35/35.
- `pnpm --dir apps/webapp typecheck` and `pnpm --dir apps/integrator typecheck` — PASS.
- `pnpm --dir apps/webapp lint` and `pnpm --dir apps/integrator lint` — PASS.
- `pnpm run check:db-privileges-generated` and `node deploy/postgres/privileges/migration-order.mjs` — PASS.
- `node --test deploy/postgres/privileges/migration-order.test.mjs deploy/postgres/privileges/port-context-catalog.test.mjs deploy/postgres/privileges/named-root-column-mapping.test.mjs deploy/postgres/privileges/row-lock-privileges.test.mjs deploy/postgres/privileges/appointment-prepayment-least-privilege.test.mjs deploy/postgres/privileges/function-census.test.mjs deploy/postgres/privileges/relation-access.test.mjs` — PASS, 115/115.
- `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` — PASS; owner-ordered rollback-only DEV validation reports `pending=1 total=241 reapplied=0`, then rolls back.
- `rg -n "settleProviderWebhookEvent|settle_booking_payment_webhook_event" apps/webapp/src/modules/payments/service.ts apps/webapp/src/infra/repos/pgPayments.ts apps/webapp/src/app/api/integrator/appointment-payment-reconciliation apps/integrator/src` — inspection confirms reconciliation still reaches the existing settlement port/root only.
- `rg -n "api\\.yookassa|globalThis\\.fetch|fetch\\(" apps/integrator/src/infra/runtime/scheduler apps/webapp/src/app/api/integrator/appointment-payment-reconciliation apps/webapp/src/modules/payments/service.ts || true` — empty; provider I/O remains in the existing adapter.
- `git diff --check` — PASS.

No execute migration, full CI, deploy, push or live UI check was run.
