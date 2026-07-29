# Rubitime retirement R3-CATALOG — public booking catalog migration proof

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Status: patient/public runtime legacy catalog **table-read proof retained**; bounded compatibility-removal gate
reopened 2026-07-22 because its `2026-07-21` deadline expired while `branchServiceId` remains live.

## Canon

- Fresh Rubitime export CSV remains the source of truth for historical appointment reconciliation; `integrator.rubitime_records` is audit-only when the export exists.
- Public/patient booking catalog must not silently choose `booking_default_organization_id`.
- Legacy `public.booking_*` tables are not Rubitime raw history, but they are deprecated v1 booking catalog. They can only be dropped after patient/public runtime no longer needs legacy IDs.

## Table disposition

| Legacy table              | Canonical target                                             | R3-CATALOG disposition                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `booking_cities`          | `be_branches.city_code`                                      | patient city list is derived from active canonical branches in the patient's active organization; generic public city list fails closed until host/link org source exists |
| `booking_branches`        | `be_branches`                                                | patient service flow and public branch-service deep links read canonical branch rows                                                                                      |
| `booking_services`        | `be_clinic_services`                                         | patient service list and public branch-service deep links read canonical service rows                                                                                     |
| `booking_specialists`     | `be_specialists` + `be_specialist_service_availability`      | service availability uses canonical specialist/service availability; legacy specialist rows remain admin/compat only                                                      |
| `booking_branch_services` | `be_specialist_service_availability` + compatibility mapping | primary APIs use canonical `branchId+serviceId`; legacy `branchServiceId` remains bounded compatibility for old links/rows                                                |

## Implemented in this batch

- Authenticated patient wizard city list now derives from `be_branches` scoped by active patient enrollment.
- Authenticated patient service list already used `be_*`; it now derives organization from active patient enrollment instead of default org.
- Authenticated `/api/booking/catalog/cities` and `/api/booking/catalog/services` now read canonical `be_*` under explicit org principal.
- Public `/api/booking/public/catalog/cities` and `/api/booking/public/catalog/services` fail closed with `organization_selection_required` because no host/link org resolver exists yet.
- Public `/app/book/new` no longer reads legacy `bookingCatalog`; branch-service deep links resolve through canonical scheduling context and canonical branch/service rows.

## Closed in follow-up

- `modules/patient-booking/canonicalCreate.ts` no longer calls `bookingCatalog.resolveBranchService(...)` in the
  patient/public create path.
- In-person create snapshots now come from canonical `resolveInPersonContext` + `be_branches` + `be_clinic_services`.
- Deprecated `branchServiceId` input remains accepted only as a compatibility key into
  `be_external_entity_mappings.metadata->>'legacy_branch_service_id'`; resolving it no longer joins public
  `booking_*`.

## Remaining compatibility

- `pgBookingCatalog` remains the admin/legacy CRUD repository for `booking_*` rows.
- Historical `patient_bookings.branchServiceId` values remain trace-only compatibility data, but patient/public
  schemas, URLs, slots/create and RSC paths no longer accept or propagate that input. New canonical projections write
  no legacy catalog link. The bounded static guard and pre-window matrix are recorded in
  `RUBITIME_RETIREMENT_R3_BRANCH_SERVICE_ID_REMOVAL_PREP.md`.
- This repository preparation does not itself close R3-CATALOG: a serialized TEST window must smoke canonical slots,
  create and the resulting booking screens, then record any old-link breakage and rollback decision.

R3-CATALOG is not a table-drop approval. Drop/archive planning remains blocked until legacy `branchServiceId`
compatibility is removed or replaced by a canonical compatibility view and old runtime URLs are drained. Atomic
mapping and owner question: `RUBITIME_RETIREMENT_R5_R7_PROVENANCE_RECONCILIATION.md`.

## Inventory

```bash
rg -n "bookingCatalog\\.list|bookingCatalog\\.resolve|booking_cities|booking_branches|booking_branch_services|booking_services|booking_specialists" apps/webapp/src/app/api/booking apps/webapp/src/app/api/booking/public apps/webapp/src/app/app/patient/booking apps/webapp/src/app/book apps/webapp/src/modules/patient-booking apps/webapp/src/modules/booking-catalog apps/webapp/src/infra/repos/pgBookingCatalog.ts
```

Result after this batch:

- app routes/RSC: no legacy `bookingCatalog.list*` reads remain.
- `app/book/new`: no legacy catalog read remains; generic public city list fails closed without org.
- patient/public create: no `bookingCatalog.resolveBranchService` call remains; deprecated `branchServiceId`
  compatibility resolves through canonical mapping only.
- remaining matches are `pgBookingCatalog`, `modules/booking-catalog` types/admin legacy module, admin/manual routes,
  tests, and Rubitime mapping/admin compatibility.

## Validation

- `pnpm -C apps/webapp run typecheck` — pass after follow-up removal of patient/public legacy catalog read.
- `pnpm -C apps/webapp exec vitest run src/modules/patient-booking/canonicalCreate.test.ts src/modules/patient-booking/inPersonBookingResolve.test.ts` — pass, 19 tests.
- `rg -n "bookingCatalog\\.resolveBranchService|resolveBranchService\\(createInput\\.branchServiceId\\)|FROM booking_branch_services|JOIN booking_branches|JOIN booking_cities|JOIN booking_services|JOIN booking_specialists" apps/webapp/src/modules/patient-booking apps/webapp/src/app/api/booking apps/webapp/src/app/api/booking/public --glob '!**/*.test.ts' --glob '!**/*.test.tsx'` — no matches.
- `pnpm -C apps/webapp exec vitest run src/app/api/booking/catalog/cities/route.test.ts src/app/api/booking/catalog/services/route.test.ts src/app/app/patient/booking/new/city/CityStepClient.test.tsx src/app/app/patient/booking/new/service/ServiceStepClient.test.tsx src/app/app/patient/booking/new/slot/SlotStepClient.test.tsx src/app/app/patient/booking/new/confirm/ConfirmStepClient.test.tsx src/modules/patient-booking/inPersonBookingResolve.test.ts src/modules/patient-booking/canonicalCreate.test.ts` — pass, 36 tests.
- `pnpm -C apps/webapp exec vitest run src/app/api/booking src/modules/products/service.test.ts src/modules/memberships/service.test.ts` — pass, 95 tests.
