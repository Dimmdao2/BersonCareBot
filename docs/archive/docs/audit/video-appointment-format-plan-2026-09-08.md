# Plan-delta audit — #1100 appointment delivery format (`очно` / `онлайн`)

Candidate: `0ae2c2ebcdd57d6bb7d5bceca48d814375c5882f` ("docs(#1100): specify appointment delivery format")
Branch: `wt/video-appointment-format-plan-audit-20260908` (worktree head `d7978baca`; the audited object is the
plan delta at `0ae2c2ebc`, not the later brief commits).
Authority: `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` — owner-correction 08.09.2026 «по записям», UI-03..UI-07,
GATE-01..04, §3, Wave 2 G, Wave 3 kill-set, §6 rollout; `AGENTS.md` §1 (migrations, privileges, index), §5
(single chokepoint, DB access), §10a/§10b, §12, §16/§21/§22, §24.

**Verdict: MUST FIX.**

The delta states the right product shape, but its two load-bearing sentences — «значение по умолчанию выводится из
уже выбранного филиала» and «провести его через существующие create/update/read-paths» — are both false against the
committed code. Online appointments do **not** carry the Online branch (they carry `branch_id = NULL`), and there is
**no** appointment-update path that is free of reschedule semantics. Implemented literally, the delta mislabels
exactly the appointments it exists for, and makes a format toggle emit a reschedule to the patient.

## 1. Classification (§24.4), decided before reading the implementation

This pass is **quality of a one-time action**: completeness and internal consistency of a plan delta before any
implementation exists. Proof method is reading the final plan text against the actual canonical choke points
(`code-search`, then exact `rg`/`sed` on the named files). No tests written, none run — there is no behaviour to
test yet, and a test on plan prose would freeze document text (§10a).

## 2. Inspected paths

Schema / privileges
- `apps/webapp/db/schema/bookingEngine.ts:534-689` (`be_appointments`)
- `apps/webapp/db/schema/schema.ts:2567-2655` (`patient_bookings`, `booking_type` check)
- `deploy/postgres/privileges/declaration.ts` — `"public.be_appointments"` grants block (12306+), definer surfaces
  at 28274 / 28304 / 28347 / 29188 / 29231 / 29397 / 29443 / 29506

Module ports / services
- `apps/webapp/src/modules/booking-engine/{types.ts,ports.ts,onlineLocation.ts}`
- `apps/webapp/src/modules/patient-booking/{canonicalCreate.ts,service.ts,types.ts,patientBookingLabels-consumers}`

Repositories
- `apps/webapp/src/infra/repos/pgBookingEngine.ts` (`insertOnlineAppointmentsIfAvailableInTransaction:526`,
  `transitionAppointmentStatus:2097`)
- `apps/webapp/src/infra/repos/pgBookingAppointmentLifecycle.ts` (`applyReschedule:346-500`)
- `apps/webapp/src/infra/repos/pgBookingCalendar.ts:94-245` (filter meta + appointment select list)

Routes
- `apps/webapp/src/app/api/doctor/booking-engine/appointments/manual/route.ts`
- `apps/webapp/src/app/api/doctor/booking-engine/appointments/[id]/manual-reschedule/route.ts`
- `apps/webapp/src/app-layer/booking/staffAppointmentLifecycleEffects.ts:109-145`

UI
- `apps/webapp/src/app/app/doctor/DoctorTodayNextAppointment.tsx`
- `apps/webapp/src/app/app/doctor/loadDoctorTodayDashboard.ts:156-169, 408-441`
- `apps/webapp/src/app/app/doctor/TodayAppointmentFullModal.tsx`
- `apps/webapp/src/app/app/doctor/calendar/DoctorCalendarEventPanel.tsx` (create footer 633-640, edit submit
  758-870), `apps/webapp/src/app/app/doctor/calendar/DoctorAppointmentForm.tsx`
- `apps/webapp/src/app/app/doctor/patients/[userId]/PatientCardClient.tsx:617-638`
- `apps/webapp/src/app/app/doctor/patients/[userId]/PatientEncounterStartModal.tsx:186-225`
- `apps/webapp/src/app/app/patient/cabinet/patientBookingLabels.ts`,
  `apps/webapp/src/app/app/patient/booking/confirm/ConfirmStepClient.tsx:248-258`

Gate
- `apps/webapp/src/modules/system-settings/doctorWorkspaceComposition.ts` (`WORKSPACE_MODULE_KEYS` already carries
  `video_meetings`; no `VideoMeetingOnlineGate` / `online_location_inactive` remains — Wave 1 A2 has landed).

## 3. Existing canonical choke points

| Concern | Single existing point | Note |
|---|---|---|
| Appointment row | `be_appointments` (`bookingEngine.ts:534`) | `branch_id` is **nullable** |
| Staff create | `POST …/appointments/manual` → `ctx.service.createAppointment` | `branchId` required in the body |
| Patient create | `canonicalCreate.ts` → `createOnlineAppointmentsIfAvailable` / `createAppointment` / `createAppointmentChain`; under a patient principal the insert runs inside definer `app.create_current_patient_booking_appointments(text)` | online branch sets `canonicalBranchId = null` |
| Appointment edit | `POST …/appointments/[id]/manual-reschedule` — the **only** door; `updateAppointmentFinancialSnapshot` is a targeted second write inside the same request | no format-neutral update exists |
| Doctor form | `DoctorAppointmentForm` (one form for `create` and `edit`), hosted by `DoctorCalendarEventPanel`, reused by `TodayAppointmentFullModal` | one form, one submit |
| Today read | `pgBookingCalendar` select → `CalendarAppointmentEvent` → `TodayNextAppointmentItem` → `DoctorTodayNextAppointment` | field must be threaded through all four |
| Video access | effective `video_meetings` workspace module ∩ tariff entitlement | already independent of branch (A2 landed) |
| "is this the built-in Online branch" | `isBuiltInOnlineLocation` / `isBuiltInOnlineLocationCityCode` (`onlineLocation.ts`) | needs `cityCode`/`title`, which calendar filter meta does not expose |

## 4. MUST FIX

### MF-1. The stated default cannot be derived from persisted branch data — online rows carry `branch_id = NULL`

**Reachable scenario.** A patient books an online consultation (`/app/patient/booking`, `type: 'online'`).
`canonicalCreate.ts` never resolves a branch for that path: `canonicalBranchId` stays `null` (declared 188, set only
at 287 inside the `in_person` arm, used at 440). The row lands with `branch_id = NULL`. Under the delta's rule
(«онлайн-филиал подставляет `онлайн`, физический — `очно`»), that row has no Online branch, so it defaults to
`очно`. Every existing patient-booked online consultation is backfilled as `очно`, and every future one is created
as `очно`.

**Impact.** UI-04 then shows «Начать приём» on the Today card for a genuinely online appointment — the exact case the
whole delta exists to serve. UI-06's stored value is wrong at creation, so the specialist must correct it by hand on
every online booking.

**Requirement.** Owner: «онлайн-филиал только подставляет `онлайн` по умолчанию при создании записи»; UI-04/UI-06.

**Smallest plan correction.** Wave 2 G must name the derivation as a union over the three shapes that actually exist,
and must place it server-side on the create path rather than on branch alone:
1. `branch` is the built-in Online location (`isBuiltInOnlineLocation`) → `online`;
2. the create path is the online patient flow (`createInput.type === 'online'` / `createOnlineAppointmentsIfAvailable`)
   → `online`, regardless of the NULL branch;
3. otherwise → `in_person`.
For existing rows the same union is the backfill rule: Online branch **or** a linked `patient_bookings` row with
`booking_type = 'online'` → `online`; everything else → `in_person`. The plan must say the backfill is data-only
(`-- BCB-MIGRATION-BACKFILL`, §1) and that the column arrives `NOT NULL DEFAULT 'in_person'` only after the backfill,
so no row is left unclassified.

Note for the form: `CalendarFilterMeta.branches` (`pgBookingCalendar.ts:169-175`) exposes only `id/label/shortLabel/
color`, not `cityCode`. The plan must require the server to publish an explicit per-branch flag computed with the
existing `isBuiltInOnlineLocation` predicate, instead of the client re-deciding "is this Online" from a label —
otherwise a second, weaker copy of that rule appears in the UI (§5).

### MF-2. There is no format-only write path; the only edit door carries full reschedule semantics

**Reachable scenario.** The specialist opens «Детали записи», flips the format from `очно` to `онлайн`, saves. The
only appointment edit contract is `POST …/appointments/[id]/manual-reschedule`
(`DoctorCalendarEventPanel.tsx:801`). It calls `lifecycle.staffReschedule`, whose repository body
(`pgBookingAppointmentLifecycle.ts:404-490`) unconditionally, with no "did anything actually move" guard:
transitions the row through `status = 'rescheduled'`, sets `rescheduleCount: current.rescheduleCount + 1`, inserts a
`be_appointment_reschedules` row and a history event. The route then always runs
`applyStaffRescheduleSideEffects` (`staffAppointmentLifecycleEffects.ts:109-145`), which emits
`booking.rescheduled` with `cancelPendingReminders: true` and `patientPushVariant: 'rescheduled'`, and finally
`payments.recordReschedulePaymentCarryOver`.

**Impact.** Changing only the delivery format (a) pushes the patient a false «запись перенесена» notification and
cancels/re-materialises their pending reminders, (b) marks the appointment «Перенесена» on the Today card
(`loadDoctorTodayDashboard.ts:439`, `wasRescheduled: rescheduleCount > 0`), (c) inflates the
`reschedulesInPeriod` KPI (`pgDoctorCanonicalAppointments.ts:672-676`) — the metric a dedicated sanitation
(`docs/OPERATIONS/RESCHEDULE_COUNT_SANITATION.md`, R28) exists to keep honest. The panel's own optimistic state
already assumes the opposite (`DoctorCalendarEventPanel.tsx:870`: count bumps only `startChanged`), so the UI and the
server would disagree about what just happened.

**Requirement.** Owner: «специалист может изменить формат» — an override, not a reschedule. AGENTS.md §5: the format
must have exactly one write point, and a second parallel appointment-update endpoint is not allowed.

**Smallest plan correction.** Wave 2 G must name the single write point and state that a no-move edit produces no
reschedule artefact: the format travels on the **existing** `manual-reschedule` contract (the same contract that
already carries price, prepayment, service, branch and patient — «второй ручки рядом нет»), and the plan must require
that the reschedule side effects (`rescheduleCount`, `be_appointment_reschedules`, `status='rescheduled'`,
`booking.rescheduled`, reminder cancellation, payment carry-over) fire only on an actual time change, exactly as the
client already computes `startChanged`. Safe default to state explicitly: a format change alone notifies nobody. A
new second endpoint for the format is forbidden (§5); if the worker believes the shared contract cannot carry it, that
is a stop-and-ask, not a licence to add a door.

### MF-3. A new `be_appointments` column is not free: the plan names no declaration, no definer-surface, no preflight step

**Reachable scenario.** The worker adds the column and a migration, as Wave 2 G says, and stops there. `GRANT` in a
migration is forbidden (§1) and would be revoked anyway: canonical reconcile re-issues column lists from
`deploy/postgres/privileges/declaration.ts`. `be_appointments` grants are enumerated **per column**: `app_staff`
INSERT lists 36 columns and UPDATE lists 25 (declaration.ts, `"public.be_appointments"` block); `app_tenant_service`
has narrow column lists. First live staff create after reconcile → `42501` on the unlisted column.

Additionally, five SECURITY DEFINER seams read the appointment row **wholesale** and therefore enumerate every column
in their `relationSurfaces` (the existing `overlap_confirmed_*` comment states this rule verbatim):
`app.settle_appointment_cash_prepayment(text)`, `app.create_current_patient_booking_appointments(text)`,
`app.read_current_patient_booking_appointment(uuid)`, `app.apply_current_patient_booking_reschedule(text)`,
`app.apply_current_patient_booking_cancellation(text)`. Of these, `app.create_current_patient_booking_appointments`
is the **insert** door for patient self-booking: unless its body is changed by the migration (with owner /
`BCB-MIGRATION-REHOME-FUNCTION` markers) and its surface updated, patient online bookings silently insert without the
format — which re-opens MF-1 through a second route.

**Impact.** Either a hard `42501` on the first live write after reconcile, or a silent wrong format on precisely the
online patient path.

**Requirement.** AGENTS.md §1 («⛔ Миграция не выдаёт и не отзывает права», «Перед приземлением миграции — разбор её
прав»), plan §6.1/§6.2.

**Smallest plan correction.** Give Wave 2 G the sentence Wave 1 A and B already carry: the column is declared in
`deploy/postgres/privileges/declaration.ts` first (`app_staff` INSERT **and** UPDATE, plus the five whole-row definer
surfaces and the patient-booking insert seam), canonical privilege artefacts are regenerated
(`node deploy/postgres/privileges/generate-cli.mjs --all`, then `--check`), the migration itself contains no grants,
and the candidate passes the owner-aware rollback-only preflight from the exact candidate checkout before audit and
landing. No index is required — the column is read with the row and never appears in `WHERE`/`JOIN`/`ORDER BY`.

### MF-4. The Today CTA rule is unconditional and can render a dead button

**Reachable scenario.** An appointment is saved with format `онлайн`. Then either (a) the tariff or the workspace
composition turns `video_meetings` off — which owner explicitly says branch/format must never override — or (b) the
appointment has no linked patient account (`platformUserId` is nullable; the manual create route accepts
`platformUserId: null`, and the current card already guards `appointment.clientUserId` before showing the camera).
The delta's text is unconditional: «онлайн-запись показывает одним основным действием "Начать созвон"». The doctor
gets a primary CTA that either has no `/app/doctor/patients/<userId>/live` target to build or leads straight to the
server refusal every video door correctly returns.

**Impact.** The single main action of the Today card becomes a dead end for a specialist whose clinic simply has the
module off — the module state stops being invisible and becomes a broken button.

**Requirement.** GATE-01 («эффективный доступ равен пересечению тарифной доступности и этой настройки»); owner:
format never grants or revokes the module.

**Smallest plan correction.** Add one sentence to UI-04/Wave 2 G: «Начать созвон» is shown only when the effective
`video_meetings` module is on **and** the appointment has a linked patient; otherwise the online record falls back to
the ordinary «Начать приём» without an extra camera. The stored format is not changed by this fallback.

### MF-5. A second stored representation of the same format already exists and is hardcoded

**Reachable scenario.** `patient_bookings.booking_type` is already the exact `in_person` / `online` vocabulary
(`schema.ts:2645`). The staff projection writes it as a constant: `bookingType: 'in_person'`
(`patient-booking/service.ts:329`), on every staff-created appointment. The patient's own cabinet renders its card
subtitle from that field (`patientBookingLabels.ts:12-29` → `CabinetActiveBookings`, `CabinetPastBookings`,
`BookingUpcomingSection`, `BookingPastHistorySection`). So after the delta the specialist saves `онлайн`, the Today
card says «Начать созвон», and the same appointment in the patient's cabinet still reads «Очный приём». The reverse
divergence already exists in the other direction: a patient booking made through the in-person flow into the built-in
Online branch (`ConfirmStepClient.tsx:248`) is stored as `booking_type = 'in_person'`.

**Impact.** Two stored fields answer one product question and diverge by construction, not by accident; the patient is
shown the wrong one. This is the failure mode §5 «Один общий проход» names explicitly — the copy nobody remembers is
the one that breaks first.

**Requirement.** AGENTS.md §5; owner: «у записи есть явный формат `очно` / `онлайн`».

**Smallest plan correction.** One sentence in Wave 2 G: the legacy projection's `booking_type` is derived from the
canonical appointment format at the existing projection write point (`ensureStaffBookingProjection`), not hardcoded;
the canonical field is the only source. This is a data-derivation change at a write point already in scope and touches
no page, so it does not conflict with UI-07. If the owner would rather leave the patient-facing label untouched for
now, that must be written into the plan as an explicit, dated deferral instead of being left unsaid.

## 5. OWNER QUESTION

**OQ-1. Do the create-modal buttons «Очный приём» / «Онлайн-приём» also write the stored format?**

In the create form these two buttons already exist (`DoctorCalendarEventPanel.tsx:633-640`) and today mean only
"create, then continue this way now" — they choose the post-create destination (encounter page vs `/live`), they store
nothing. After UI-06 the same modal will also contain a stored format field. Two controls with the same two words and
different meanings sit in one dialog.

Both readings are implementable and they differ materially:
- **A (recommended).** Pressing «Онлайн-приём» in create also saves format `онлайн` (and «Очный приём» saves `очно`),
  overriding the branch-derived default. The specialist's visible choice and the stored value never disagree, and the
  Today card for that same appointment later offers the matching CTA.
- **B (safe-default if left unanswered).** The buttons keep meaning only "start it this way now"; the stored format
  comes solely from the field. Consequence to accept knowingly: creating from a physical branch via «Онлайн-приём»
  leaves a record stored as `очно`, and the Today card will later say «Начать приём» for the appointment the
  specialist created as online.

This is not a weaker variant to pick silently — it changes what the specialist's most visible click does.

## 6. Non-findings and recommendations (outside implementation authority)

- **Stored vocabulary.** `in_person` / `online` in the delta matches the existing
  `patient_bookings_booking_type_check` vocabulary exactly. Correct choice; no new dictionary.
- **Module independence.** The delta's restatement that branch/format never gate video agrees with the landed code:
  `video_meetings` is in `WORKSPACE_MODULE_KEYS`, and no `VideoMeetingOnlineGate` / `online_location_inactive`
  remains. Wave 1 A2 is done; §5's Wave 0 item 4 still describes it as pending — historical narrative, not a defect.
- **Patient card.** UI-03's shape is already live: `PatientCardClient.tsx:617-638` shows «История приёмов» /
  «Начать приём» under `encounters` and the camera under `video_meetings`, independently. The owner's "ad-hoc call
  needs no appointment" requirement needs no plan change.
- **One form, one door.** `TodayAppointmentFullModal` reuses `DoctorCalendarEventPanel` → `DoctorAppointmentForm`, so
  "the existing appointment details form" is unambiguous and adding the field there covers both entry points.
- **Recommendation for the worker brief (not a plan change).** §22 requires `displayLabel` on a `SelectTrigger` whose
  `value` is not the human label — a format select would otherwise render the raw `in_person` key before the option
  list mounts. The brief must also carry §5 and ask explicitly whether the existing write point can be parameterised
  instead of adding a new one (§24.2).
- **Recommendation.** §6.6's live-check enumeration does not yet name the format (default from Online branch, manual
  override, CTA switch on the Today card). DoD §8 already requires per-checkbox live evidence, so this is not a gap in
  the rules — but adding the three items to §6.6 is what will make UI-04/UI-06 closable in one owner pass.
- **Pre-existing, out of this delta's scope.** `DoctorCalendarEventPanel.tsx:870` bumps `rescheduleCount` optimistically
  only when the start changed, while the server bumps it on every `manual-reschedule` call — so branch- or
  service-only edits already inflate the count today. MF-2's correction happens to fix it; it is not itself owner
  scope and must not become one.
- **No index needed** for the new column (§1 hot-column rule): it is neither a filter, join, sort nor a dedup key.
