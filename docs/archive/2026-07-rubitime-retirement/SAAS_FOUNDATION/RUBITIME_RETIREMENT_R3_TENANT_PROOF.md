# Rubitime retirement R3-TENANT — exact-org booking proof

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Status: implementation proof, 2026-07-14.

## Canon

- Rubitime export CSV remains the booking-history canon for R1/R2/R3 reconciliation; `integrator.rubitime_records` is not authoritative when a fresh Rubitime export exists.
- Tenant source for booking must be explicit. `booking_default_organization_id` is a migration fallback only, not a runtime tenant resolver.
- Patient identity alone is not tenant identity. Public booking must derive org from host/link/resource; patient booking must derive org from resource/enrollment/explicit selector.

## Implemented in this batch

- In-person `branchServiceId` now resolves organization from canonical availability mapping without calling `booking_default_organization_id`.
- Canonical branch/service input validates that branch and service belong to the same organization before resolving legacy branch-service mapping.
- Public and authenticated in-person slots/create run under `withExplicitOrganizationPrincipal(...)` using the derived organization.
- Public merge-candidate side effect after create uses the same derived organization, not default org.
- Patient booking create no longer calls default org; online create without trusted org fails with `ambiguous_booking_tenant`.
- Patient online slots without trusted org fail with `ambiguous_booking_tenant`.
- Patient cancel/reschedule/payment-status derive organization from the canonical appointment resource.
- Product/package availability for a selected branch/service derives organization from that branch-service context.
- Patient/public booking form fields derive organization from the selected branch-service context.
- Patient in-person service catalog derives organization from the selected branch.
- Patient booking history derives organization from the patient's active enrollment before reading timeline/payments/visits.
- Patient product and membership catalog/list endpoints derive organization from the patient's active enrollment.
- Patient/public product purchase/payment-status/mock-complete endpoints derive organization from the product or purchase resource.
- Patient/public membership purchase/payment-status/mock-complete endpoints derive organization from the catalog package, patient package, or payment intent.
- Patient/public booking payment-status endpoints derive organization from the canonical appointment resource.
- Booking payment mock-complete endpoints derive organization from the payment intent before capture.
- Patient product payment page derives organization from the product purchase row before reading purchase detail.
- Booking payment provider webhook verifies the provider payload, resolves organization from the payment intent id or provider intent reference, and ignores unknown events instead of falling back to `booking_default_organization_id`.

## Default-org inventory

Current inventory from:

```bash
rg -n "getDefaultOrganizationId\\(" apps/webapp/src/app/api/booking apps/webapp/src/app/api/booking/public apps/webapp/src/modules/patient-booking apps/webapp/src/modules/products apps/webapp/src/modules/memberships apps/webapp/src/modules/payments
```

Result: no matches.

Additional runtime entry checks:

- `apps/webapp/src/app/app/patient/purchases/pay/page.tsx` does not call `getDefaultOrganizationId`; it calls
  `products.resolvePurchaseOrganizationId(purchaseId)` first.
- `apps/webapp/src/app/api/payments/webhook/[provider]/route.ts` does not call `getDefaultOrganizationId`; it calls
  `payments.resolveProviderWebhookOrganizationId(...)` after signature verification.

R3-TENANT runtime booking endpoints no longer select a hardcoded default organization. Remaining `booking_default_organization_id` uses, if any outside this inventory, are compatibility/migration scope and must not be used as a runtime tenant resolver for patient/public booking.

## Validation

- `pnpm -C apps/webapp exec vitest run src/app/api/booking src/modules/products/service.test.ts src/modules/memberships/service.test.ts` — pass, 95 tests.
- `pnpm -C apps/webapp run typecheck` — pass.
- `pnpm -C apps/webapp run lint` — pass.
- `pnpm run check:rubitime-retirement-r0` — pass.
- `git diff --check` — pass.
