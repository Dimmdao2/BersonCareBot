# Memberships (booking stage 6)

Composite packages: catalog templates (`be_subscription_packages` + `be_package_items`) and patient instances (`be_patient_packages` + `be_patient_package_items`).

Balance is **derived** from append-only `be_package_usages` (`reserve`, `consume`, `release`, `penalty`, `manual_adjust`, `refund`) — see `balanceCalculator.ts`. `remaining` blocks overbooking (includes reserves); `displayRemaining` is for doctor card UI (reserved sessions still count as owned). Sale metadata on `be_patient_packages`: `sold_at`, `paid_amount_minor`, `paid_currency` (backfill from `created_at` / `price_minor`).

Validity: `packageValidity.ts` (auto `expired` when `valid_until` passed).

## Payments

`modules/payments`: `purpose=package_purchase`, `productRef=patient_package:{id}`. Activation after capture in `buildAppDeps` (`onPackagePaymentCaptured`). Free manual packages (`priceMinor=0`) activate without payment offer.

Создание нового онлайн-платежа требует одновременно `subscriptions=full_access` и `payments=full_access`. Проверка `payments` применяется только к платной отправке на оплату: бесплатная выдача и зафиксированная сотрудником офлайн-продажа остаются доступны. Уже купленные абонементы, история и расходование не зависят от возможности создавать новые платежи.
`GET /api/booking/memberships/payment-status` сохраняет чтение статуса существующего абонемента, но возвращает `checkoutUrl=null`, когда новые платежи недоступны по тарифу.

## Booking integration

**Canonical-only debit path:** reserve/consume/FEFO и ручные действия staff опираются на **canonical `serviceId`** записи и позиций пакета. В UI сеансов абонемента: `mappingStatus` + бейдж «нет связи услуги».

- Create (in_person): optional `patientPackageId` on `POST /api/booking/create`; if omitted, **auto FEFO** (`fefoPicker.ts`) among active packages with balance for service; `reserveForAppointment` before `markConfirmed`; skips prepayment when package covers visit. Staff manual create (`POST .../appointments/manual`) uses the same FEFO when `platformUserId` + `serviceId` are set.
- Calendar: `booking.package_linked` / `booking.package_unlinked` → integrator GCal update only (no patient/doctor notifications). Summary `✅` after status markers; description line `Абонемент от <soldAt>: сеанс n из N`. After consume/penalty ref change, `refreshPackageCalendar` emits `package_linked` (best-effort).
- Refund: restores balance + clears ref; reverts `charged_to_package` → prior status from history (`visit_confirmed` / `confirmed` / `completed`).
- Penalty without prior reserve sets `package_usage_ref` for GCal.
- Cancel: `applyCancelPackageOutcome` — release or penalty; patient late cancel uses `policyResolver` (`chargePackageSessionOnLate` → `package_charged`).
- Visit: `wrapBookingEngineMembershipHooks` calls `onVisitConfirmed` after transition to `visit_confirmed` or `completed` when `deductionMode=auto_on_visit_confirmed`.

## Bulk «Пересчитать» (backfill past sessions) — ST-01

`recalcPastSessionsForPackage({ organizationId, patientPackageId, createdByPlatformUserId?, nowIso? })` — idempotent bulk backfill for a package sold задним числом (owner pain #2). Internally it runs `recalcPastSessionsForPackageDbPhase(...)` under the per-package lock, then runs best-effort calendar refresh after the DB phase. The DB phase finds the patient's PAST appointments (`startsAt ∈ [soldAt; now)`, `soldAt`←`validFrom`←`createdAt` fallback) for the package's services via port `listRecalcCandidateAppointments` (drizzle join over `be_appointments` by `platformUserId` + service + window — NOT `listPackageAppointmentSessionSources`, which only returns already-linked rows), then for each **completed / visit_confirmed** appointment with `linkage === "none"` appends a `consume` to `be_package_usages`, sets `package_usage_ref`, records `recalc_consumed` history, and schedules calendar refresh (mirrors `consumeForAppointment`). Stops at zero per item (no minus, OQ-6). Returns `{ debited[], skipped[], outOfBalance[], corrected[] }` for the doctor toast. Repeated call = no-op (already-debited → `skipped: already_debited`). Cancellations / no-show / not-yet-closed past appointments are left for manual consume (OQ-5/OQ-7). Multiple packages → call per package (FEFO ordering at the API layer, ST-02).

**Concurrency (ST-02):** the whole read-balance→debit pass runs inside `runWithPackageLock(patientPackageId, organizationId, fn)` — a new port method. PG impl takes a transaction-scoped `pg_advisory_xact_lock(hashtextextended(id,0))`; a second concurrent «Пересчитать» on the same package blocks until the first commits, then reads the ledger with the first pass's debits already applied → no double-debit. `listUsagesForPackage` is read INSIDE the lock, plus a fresh `already_debited` recheck against those usages. A DB partial unique index also enforces one appointment debit row (`consume`, `penalty`, or `manual_adjust`) per `appointment_id`. In-memory/fake port serializes with a per-key mutex.

## Appointment debit idempotency — #533

One booking appointment can have reserve/release/refund rows, but must not be charged twice. Service paths check existing appointment debit rows (`consume`, `penalty`, `manual_adjust`) before appending a new debit; `23505` from the DB unique index is treated as a race signal, then the service rereads and returns the existing debit. This covers normal consume, late-cancel penalty with reserve, penalty without reserve, and manual-adjust legacy rows.

## API «Пересчитать» — ST-02

`POST /api/doctor/booking-engine/patient-packages/[id]/recalc` and `POST /api/admin/booking-engine/patient-packages/[id]/recalc` — gate `requireDoctorBookingEngine()` / `requireAdminBookingEngine()`; no body (package id from params). The routes wrap only `recalcPastSessionsForPackageDbPhase({ organizationId (from gate), patientPackageId, createdByPlatformUserId })` in the doctor workspace DB principal, then run `refreshRecalcPastSessionsCalendar(...)` outside that wrapper. The doctor route also performs best-effort calendar sync per debited appointment outside the wrapper. Returns full `{ ok, summary }` with `debited[]`, `skipped[]`, `outOfBalance[]`, and `corrected[]`. **IDOR/ownership (OQ-1):** `organizationId` from the gate scopes `getPatientPackage(id, organizationId)` — a foreign-org package → `package_not_found` (400); recalc can never touch another org's package (same guarantee as `consume`).

## Doctor UI acceptance semantics (2026-07)

- Human package number: API rows may include `displayNumber`; doctor UI renders compact badges as `аб.#NNN` (`formatPatientPackageShortLabel`) and long metadata as `аб #NNN от DD.MM.YYYY` (`formatPatientPackageLongLabel`). Missing/invalid numbers fall back to `аб.` / `аб #—`.
- Multiple active packages: patient card surfaces must render all `active` / `activated` packages, not only the first one. Overview sums active package balances and joins per-package hints with commas; Visits renders separate active cards and an `активных N` badge.
- Closed-history on Visits: an active package is shown in history when all package sessions are consumed past visits (`linkage=consumed`, `isPast=true`) and consumed count covers total package quantity. Future reserves and partially consumed packages stay active. Closed rows are collapsed by default and expand to the same `MembershipCardHeader`.
- Linked appointment highlight: the eye button toggles a violet border on appointments whose `patientPackageId` matches the selected package, both for active cards and closed-history rows.
- Wording: Overview KPI value uses `Осталось N визитов:`; Visits active and expanded-history cards use the shared membership header (`Осталось N визитов:`, composition like `2 x ЛФК`, consumed dates).
- Global doctor appointments list: `AppointmentRow` carries `packageUsageRef`, `packageTitle`, and `packageDisplayNumber`; `/app/doctor/appointments` renders the same compact violet `аб.#NNN` badge as calendar and patient-card visits.

## Patient APIs (`requirePatientApiBusinessAccess`)

| Method | Path                                                                   |
| ------ | ---------------------------------------------------------------------- |
| GET    | `/api/booking/memberships`                                             |
| GET    | `/api/booking/memberships/[id]`                                        |
| GET    | `/api/booking/memberships/available?serviceId=` or `?branchServiceId=` |
| GET    | `/api/booking/memberships/catalog`                                     |
| POST   | `/api/booking/memberships/purchase`                                    |
| GET    | `/api/booking/memberships/payment-status`                              |

UI: `PatientMembershipsSection`, `/app/patient/memberships/pay`, `/app/patient/memberships/[id]`, package picker in `ConfirmStepClient`.

## Staff APIs (admin + doctor mirror)

| Method   | Path                                                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| GET/POST | `/api/admin/booking-engine/packages`                                                                                                   |
| GET/POST | `/api/admin/booking-engine/patient-packages` (`?platformUserId=` on GET; manual POST optional `title`, `notes`; catalog offer `notes`) |
| PATCH    | `.../patient-packages/[id]` — `{ notes: string \| null }`                                                                              |
| GET      | `.../patient-packages/[id]/sessions?includePast=` — session rows + server `actions`                                                    |
| POST     | `.../patient-packages/[id]/consume`                                                                                                    |
| POST     | `.../appointments/[id]/package/detach` — `{ outcome?, confirmPastTwice? }` (late → `409 late_detach_choice_required`)                  |
| POST     | `.../appointments/[id]/package/unlink` / `refund` — thin wrappers → detach                                                             |

Same under `/api/doctor/booking-engine/...` where mirrored. Admin setting `booking_allow_doctor_unlink_past_package_sessions` (boolean, scope `admin`) gates past detach in UI/API.

UI: `BookingPatientPackagesSection` (admin booking ops), **`DoctorClientMembershipsPanel`** + `PatientPackageCard` / `PatientPackageSessionsList` on patient card tab «Записи».

## Race safety — ST-02 advisory lock

`MembershipsPort.runWithPackageLock(patientPackageId, organizationId, fn)` serializes the entire
`recalcPastSessionsForPackage` body (balance read → debit loop) under a per-package lock.

- **pg port (`pgMemberships.ts`):** wraps `fn` in a `db.transaction` + `pg_advisory_xact_lock(hashtextextended(patientPackageId, 0))`. The transaction-scoped lock is auto-released on COMMIT/ROLLBACK; the second concurrent pass blocks until the first commits, then reads the updated ledger.
- **fake/in-memory port (tests):** serialized via a per-key promise chain (`makeSerializingLock` in `service.test.ts`) — same serialization semantics without real Postgres.

Inside the lock a `debitedApptIds` Set (built from freshly-read usages) provides an additional intra-pass idempotency guard so appointments debited by the first pass are skipped immediately by the second without waiting for `computeAppointmentPackageLinkage`.

## Docs

`docs/OWN_BOOKING_ENGINE_INITIATIVE/STAGE_CHECKLISTS.md` §Этап 6 · plan `.cursor/plans/archive/own_booking_stage6_memberships.plan.md` · **BOOKING rework этап 3:** `docs/BOOKING_REWORK_INITIATIVE/STAGE3_DECOMPOSITION.md`, `ACCEPTANCE_STAGE3.md`, `LOG.md`
