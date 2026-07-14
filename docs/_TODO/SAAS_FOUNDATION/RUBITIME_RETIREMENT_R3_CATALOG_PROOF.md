# Rubitime retirement R3-CATALOG — public booking catalog migration proof

Status: partial implementation proof, 2026-07-14.

## Canon

- Fresh Rubitime export CSV remains the source of truth for historical appointment reconciliation; `integrator.rubitime_records` is audit-only when the export exists.
- Public/patient booking catalog must not silently choose `booking_default_organization_id`.
- Legacy `public.booking_*` tables are not Rubitime raw history, but they are deprecated v1 booking catalog. They can only be dropped after patient/public runtime no longer needs legacy IDs.

## Table disposition

| Legacy table | Canonical target | R3-CATALOG disposition |
| --- | --- | --- |
| `booking_cities` | `be_branches.city_code` | patient city list is derived from active canonical branches in the patient's active organization; generic public city list fails closed until host/link org source exists |
| `booking_branches` | `be_branches` | patient service flow and public branch-service deep links read canonical branch rows |
| `booking_services` | `be_clinic_services` | patient service list and public branch-service deep links read canonical service rows |
| `booking_specialists` | `be_specialists` + `be_specialist_service_availability` | service availability uses canonical specialist/service availability; legacy specialist rows remain admin/compat only |
| `booking_branch_services` | `be_specialist_service_availability` + compatibility mapping | primary APIs use canonical `branchId+serviceId`; legacy `branchServiceId` remains bounded compatibility for old links/rows |

## Implemented in this batch

- Authenticated patient wizard city list now derives from `be_branches` scoped by active patient enrollment.
- Authenticated patient service list already used `be_*`; it now derives organization from active patient enrollment instead of default org.
- Authenticated `/api/booking/catalog/cities` and `/api/booking/catalog/services` now read canonical `be_*` under explicit org principal.
- Public `/api/booking/public/catalog/cities` and `/api/booking/public/catalog/services` fail closed with `organization_selection_required` because no host/link org resolver exists yet.
- Public `/app/book/new` no longer reads legacy `bookingCatalog`; branch-service deep links resolve through canonical scheduling context and canonical branch/service rows.

## Remaining compatibility

- `modules/patient-booking/canonicalCreate.ts` still accepts deprecated `branchServiceId` and calls `bookingCatalog.resolveBranchService(...)` for legacy snapshot compatibility.
- `pgBookingCatalog` remains the admin/legacy CRUD repository for `booking_*` rows.
- `patient_bookings.branchServiceId` and old URLs can still carry legacy IDs through the bounded release window.

R3-CATALOG is not a table-drop approval. Drop/archive planning remains blocked until legacy `branchServiceId` compatibility is removed or replaced by a canonical compatibility view and old runtime URLs are drained.

## Inventory

```bash
rg -n "bookingCatalog\\.list|bookingCatalog\\.resolve|booking_cities|booking_branches|booking_branch_services|booking_services|booking_specialists" apps/webapp/src/app/api/booking apps/webapp/src/app/api/booking/public apps/webapp/src/app/app/patient/booking apps/webapp/src/app/book apps/webapp/src/modules/patient-booking apps/webapp/src/modules/booking-catalog apps/webapp/src/infra/repos/pgBookingCatalog.ts
```

Result after this batch:

- app routes/RSC: no legacy `bookingCatalog.list*` reads remain.
- `app/book/new`: no legacy catalog read remains; generic public city list fails closed without org.
- remaining matches are `pgBookingCatalog`, `modules/booking-catalog` types/admin legacy module, and `canonicalCreate` deprecated `branchServiceId` compatibility.

## Validation

- `pnpm -C apps/webapp run typecheck` — pass.
- `pnpm -C apps/webapp exec vitest run src/app/api/booking/catalog/cities/route.test.ts src/app/api/booking/catalog/services/route.test.ts src/app/app/patient/booking/new/city/CityStepClient.test.tsx src/app/app/patient/booking/new/service/ServiceStepClient.test.tsx src/app/app/patient/booking/new/slot/SlotStepClient.test.tsx src/app/app/patient/booking/new/confirm/ConfirmStepClient.test.tsx src/modules/patient-booking/inPersonBookingResolve.test.ts src/modules/patient-booking/canonicalCreate.test.ts` — pass, 36 tests.
- `pnpm -C apps/webapp exec vitest run src/app/api/booking src/modules/products/service.test.ts src/modules/memberships/service.test.ts` — pass, 95 tests.
