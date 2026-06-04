# Memberships (booking stage 6)

Composite packages: catalog templates (`be_subscription_packages` + `be_package_items`) and patient instances (`be_patient_packages` + `be_patient_package_items`).

Balance is **derived** from append-only `be_package_usages` (`reserve`, `consume`, `release`, `penalty`, `manual_adjust`, `refund`) — see `balanceCalculator.ts`. `remaining` blocks overbooking (includes reserves); `displayRemaining` is for doctor card UI (reserved sessions still count as owned). Sale metadata on `be_patient_packages`: `sold_at`, `paid_amount_minor`, `paid_currency` (backfill from `created_at` / `price_minor`).

Validity: `packageValidity.ts` (auto `expired` when `valid_until` passed).

## Payments

`modules/payments`: `purpose=package_purchase`, `productRef=patient_package:{id}`. Activation after capture in `buildAppDeps` (`onPackagePaymentCaptured`). Free manual packages (`priceMinor=0`) activate without payment offer.

## Booking integration

**Canonical-only debit path:** reserve/consume/FEFO и ручные действия staff опираются на **canonical `serviceId`** записи и позиций пакета. Rubitime/legacy — только через mapping (`branch_service_mapping_missing` fail-closed на create/available, этап 2). В UI сеансов абонемента: `mappingStatus` + бейдж «нет связи услуги».

- Create (in_person): optional `patientPackageId` on `POST /api/booking/create`; if omitted and no `productPurchaseId`, **auto FEFO** (`fefoPicker.ts`) among active packages with balance for service; `reserveForAppointment` before `markConfirmed`; skips prepayment when package covers visit. Staff manual create (`POST .../appointments/manual`) uses the same FEFO when `platformUserId` + `serviceId` are set.
- Calendar: `booking.package_linked` / `booking.package_unlinked` → integrator GCal update only (no patient/doctor notifications). Summary `✅` after status markers; description line `Абонемент от <soldAt>: сеанс n из N`. After consume/penalty ref change, `refreshPackageCalendar` emits `package_linked` (best-effort).
- Refund: restores balance + clears ref; reverts `charged_to_package` → prior status from history (`visit_confirmed` / `confirmed` / `completed`).
- Penalty without prior reserve sets `package_usage_ref` for GCal.
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
| GET/POST | `/api/admin/booking-engine/patient-packages` (`?platformUserId=` on GET; manual POST optional `title`, `notes`; catalog offer `notes`) |
| PATCH | `.../patient-packages/[id]` — `{ notes: string \| null }` |
| GET | `.../patient-packages/[id]/sessions?includePast=` — session rows + server `actions` |
| POST | `.../patient-packages/[id]/consume` |
| POST | `.../appointments/[id]/package/detach` — `{ outcome?, confirmPastTwice? }` (late → `409 late_detach_choice_required`) |
| POST | `.../appointments/[id]/package/unlink` / `refund` — thin wrappers → detach |

Same under `/api/doctor/booking-engine/...` where mirrored. Admin setting `booking_allow_doctor_unlink_past_package_sessions` (boolean, scope `admin`) gates past detach in UI/API.

UI: `BookingPatientPackagesSection` (admin booking ops), **`DoctorClientMembershipsPanel`** + `PatientPackageCard` / `PatientPackageSessionsList` on patient card tab «Записи».

## Docs

`docs/OWN_BOOKING_ENGINE_INITIATIVE/STAGE_CHECKLISTS.md` §Этап 6 · plan `.cursor/plans/archive/own_booking_stage6_memberships.plan.md` · **BOOKING rework этап 3:** `docs/BOOKING_REWORK_INITIATIVE/STAGE3_DECOMPOSITION.md`, `ACCEPTANCE_STAGE3.md`, `LOG.md`
