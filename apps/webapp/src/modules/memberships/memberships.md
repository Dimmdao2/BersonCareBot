# Memberships (booking stage 6)

Composite packages: catalog templates (`be_subscription_packages` + `be_package_items`) and patient instances (`be_patient_packages` + `be_patient_package_items`).

Balance is **derived** from append-only `be_package_usages` (`reserve`, `consume`, `release`, `penalty`, `manual_adjust`) — see `balanceCalculator.ts`. Validity: `packageValidity.ts` (auto `expired` when `valid_until` passed).

## Payments

`modules/payments`: `purpose=package_purchase`, `productRef=patient_package:{id}`. Activation after capture in `buildAppDeps` (`onPackagePaymentCaptured`). Free manual packages (`priceMinor=0`) activate without payment offer.

## Booking integration

- Create (in_person): optional `patientPackageId` on `POST /api/booking/create` — validated before appointment; `reserveForAppointment` before `markConfirmed`; skips prepayment when package covers service.
- Cancel: `applyCancelPackageOutcome` — release or penalty; patient late cancel uses `policyResolver` (`chargePackageSessionOnLate` → `package_charged`).
- Visit: `wrapBookingEngineMembershipHooks` calls `onVisitConfirmed` after transition to `visit_confirmed` or `completed` when `deductionMode=auto_on_visit_confirmed`.

## Patient APIs (`requirePatientApiBusinessAccess`)

| Method | Path |
|--------|------|
| GET | `/api/booking/memberships` |
| GET | `/api/booking/memberships/[id]` |
| GET | `/api/booking/memberships/available?serviceId=` or `?branchServiceId=` |
| GET | `/api/booking/memberships/catalog` |
| POST | `/api/booking/memberships/purchase` |
| GET | `/api/booking/memberships/payment-status` |
| POST | `/api/booking/memberships/payments/mock-complete` |

UI: `PatientMembershipsSection`, `/app/patient/memberships/pay`, `/app/patient/memberships/[id]`, package picker in `ConfirmStepClient`.

## Staff APIs (admin + doctor mirror)

| Method | Path |
|--------|------|
| GET/POST | `/api/admin/booking-engine/packages` |
| GET/POST | `/api/admin/booking-engine/patient-packages` (`?platformUserId=` on GET) |
| POST | `/api/admin/booking-engine/patient-packages/[id]/consume` |

Same under `/api/doctor/booking-engine/...`. UI: `BookingCatalogPackagesSection`, `BookingPatientPackagesSection` on `/app/doctor/admin/booking`.

## Docs

`docs/OWN_BOOKING_ENGINE_INITIATIVE/STAGE_CHECKLISTS.md` §Этап 6 · plan `.cursor/plans/archive/own_booking_stage6_memberships.plan.md`
