# Client history (booking stage 9)

Read-only aggregation of patient booking timeline for doctor client card and patient profile. **No new source of truth** — projects append-only events from stages 1–8.

## Schema (`0096`)

| Table | Role |
|-------|------|
| `be_patient_booking_profiles` | Booking reputation: `is_problematic`, `booking_blocked`, `problematic_note` (separate from messaging `is_blocked` / `is_archived`) |
| `be_appointment_staff_comments` | Staff comments tied to `appointment_id` + `platform_user_id` |

## Module layout

| Path | Role |
|------|------|
| `ports.ts` / `service.ts` | Port + thin service (`assertSelfServiceBookingAllowed`, comment validation) |
| `types.ts` | Timeline, payment, visit, profile DTOs |
| `labels.ts` | Russian labels for event types, payment method/purpose, appointment status |
| `clientHistoryUtils.ts` | Dedupe timeline, payment classification, payment row enrichment |
| `infra/repos/pgClientHistory.ts` | Drizzle read aggregator |
| `infra/repos/inMemoryClientHistory.ts` | Test / in-memory DI stub |

## Aggregator sources (`pgClientHistory`)

Timeline merges (tenant-scoped by `organization_id`, patient by `platform_user_id` or phone for orphan product purchases):

- `be_patient_timeline_events`
- `be_payment_history_events` (+ phone-matched orphan rows via `product_purchase:{id}` in payload)
- `be_package_history_events`, fallback `be_package_usages` (consume/penalty/manual_adjust)
- `be_product_history_events`, `be_product_purchases` (incl. `buyer_phone_normalized` when `platform_user_id` is null)
- `be_appointment_reschedules`, `be_appointment_cancellations`
- `doctor_notes`, `be_appointment_staff_comments`

Dedupe: detailed reschedule/cancel vs timeline mirror; product purchase vs product history; package usage vs package history; payment timeline mirror vs canonical payment row.

## APIs

| Method | Path | Access |
|--------|------|--------|
| GET | `/api/doctor/clients/:userId/history` | Doctor — timeline + payments + visits |
| GET/PATCH | `/api/doctor/clients/:userId/booking-profile` | Doctor — booking reputation |
| GET/POST | `/api/doctor/booking-engine/appointments/:id/comments` | Doctor — staff comments |
| GET | `/api/booking/history` | Patient — own history |

Guard: `booking_blocked` on `POST /api/booking/create` and `POST /api/booking/public/create` (`canonicalCreate.assertSelfServiceBookingAllowed`).

## UI

| Surface | Component |
|---------|-----------|
| Doctor client card | `ClientBookingHistoryPanel` (tabs: events / payments / visits + reputation toggles) |
| Doctor calendar event | `AppointmentStaffCommentsSection` |
| Patient profile | `PatientBookingHistorySection` |
| Patient purchases | `PatientBookingHistorySection` (`mode="payments"`) |

Doctor notes remain in `DoctorNotesPanel` (separate from booking staff comments).

## Docs

`docs/OWN_BOOKING_ENGINE_INITIATIVE/STAGE_CHECKLISTS.md` §Этап 9 · plan `.cursor/plans/archive/own_booking_stage9_client_card_history.plan.md`
