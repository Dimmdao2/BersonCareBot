# Rubitime retirement R3-TENANT — exact-org booking proof

Status: partial implementation proof, 2026-07-14.

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

## Residual default-org consumers

Current inventory from:

```bash
rg -n "getDefaultOrganizationId\\(" apps/webapp/src/app/api/booking apps/webapp/src/app/api/booking/public apps/webapp/src/modules/patient-booking apps/webapp/src/infra/repos/pgBookingScheduling.ts
```

Remaining consumers are outside the fixed slots/create core and need a tenant source before R3-TENANT can close:

- `apps/webapp/src/app/api/booking/history/route.ts`
- patient/public product catalog, purchase, payment-status and mock-complete routes
- membership catalog, purchase, payment-status and mock-complete routes
- booking payment mock-complete routes that receive only `intentId`

These must not be patched by reading integrator data or by silently choosing the default organization. Required follow-up: introduce/route an explicit tenant source for public host/link/profile and authenticated patient enrollment/resource selection, then wrap reads/writes in the principal helper.

## Validation

- `pnpm -C apps/webapp exec vitest run src/modules/patient-booking/inPersonBookingResolve.test.ts src/modules/patient-booking/service.test.ts src/modules/patient-booking/canonicalCreate.test.ts src/app/api/booking/public/create/route.test.ts src/app/api/booking/products-available-route.test.ts src/app/api/booking/membership-routes.test.ts` — pass, 56 tests.
- `pnpm -C apps/webapp run typecheck` — pass.
