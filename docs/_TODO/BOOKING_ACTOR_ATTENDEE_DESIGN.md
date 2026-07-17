# Booking actor vs attendee — design note (#563 / #543.3)

**Статус:** design doc, DOCS-ONLY. No schema/code changed by this pass. Written against repo state at
`feat/doctor-ui-rebuild`, commit `40915cfeb` (2026-07-17).

**Parent:** taskdb `#543`, context file `.lead/runs/bcb-feedback-2026-07-08/patient-booking.md`
§"Book Another Person". **This card:** taskdb `#563` / `#543.3`, design-first, no implementation yet.

## Owner decision (verbatim from taskdb #563, already given — not re-litigated here)

> Authenticated user remains booking **actor**, receives notifications and can cancel; **attendee** is
> stored as snapshot FIO/phone inside booking/appointment; later conversion to patient is a separate
> follow-up outside #543 MVP.

Source feedback (`patient-booking.md:41-49`) frames the same need: "не перетирать `platform_user` текущего
аккаунта чужим ФИО", "нужна модель booking actor vs attendee/client", "учитывать privacy/PII... чтобы
родственники/друзья не склеивались с пациентом."

---

## 1. Current reality (file:line)

### 1.a One identity slot does double duty today: actor and attendee are conflated

- `CreatePatientBookingInput` (`apps/webapp/src/modules/patient-booking/types.ts:88-126`) has exactly one
  identity field for "whose booking is this": `userId` (the authenticated session user,
  `CreatePatientBookingCommon.userId`, `types.ts:89`) plus **contact fields** — `contactName`,
  optional `contactFio: BookingContactFioInput` (`lastName`/`firstName`/`patronymic?`, `types.ts:82-86`),
  `contactPhone`, `contactEmail?` (`types.ts:103-106,117-120`). There is no separate "who is this booking
  actually for" identity — `contactFio`/`contactName`/`contactPhone` are the closest thing to an attendee
  today, but they are **display/snapshot strings passed alongside** `userId`, not modeled as a distinct
  entity.
- `createBookingOnCanonicalEngine` (`apps/webapp/src/modules/patient-booking/canonicalCreate.ts:134-520`)
  creates the canonical appointment with:
  ```
  platformUserId: createInput.userId,     // canonicalCreate.ts:312
  ...
  actorId: createInput.userId,            // canonicalCreate.ts:319
  attributionJson: { ...attribution, contactFio: createInput.contactFio, ... }  // canonicalCreate.ts:320-324
  ```
  **`platformUserId` and `actorId` are set to the exact same value** (`createInput.userId`) — today there is
  no code path where they differ. `contactFio` (the would-be attendee identity) is only preserved as an
  opaque JSON blob inside `attribution_json`, not a queryable/indexed field.
- **`actorId` is not even stored on the appointment row.** `BeAppointment`/`beAppointments` schema
  (`apps/webapp/src/modules/booking-engine/types.ts:98-117`, `apps/webapp/db/schema/bookingEngine.ts:421-480`)
  has **no `actor_id` column** — the appointment's only patient-identity FK is `platform_user_id`
  (`bookingEngine.ts:430`). `CreateAppointmentInput.actorId` (`types.ts:132`) is consumed only by
  `pgBookingEngine.ts`'s `createAppointment`/`transitionAppointmentStatus`
  (`apps/webapp/src/infra/repos/pgBookingEngine.ts:716-773,775-...`) to write **audit-log rows**
  (`be_appointment_events.actor_id`, `be_appointment_history_events.actor_id`, e.g. lines `748,755,801,808`)
  — i.e. "who performed this create/status-change action" for history, not "who is the patient this
  appointment is about." This is a different, narrower concept than the actor/attendee split the owner is
  asking for; it happens to share a name but is not reusable as-is for this feature.
- `patient_bookings` schema (`apps/webapp/db/schema/schema.ts`, table `patientBookings`) has
  `platformUserId` (nullable, only null for unlinked Rubitime compat rows per
  `apps/webapp/migrations/052_patient_bookings_platform_user_null_compat.sql:1-2`) plus flat
  `contactPhone`/`contactEmail`/`contactName` **text** columns — no structured FIO (first/last/patronymic)
  at the DB layer; `contactFio` only exists transiently in the app/API layer, formatted down to a single
  `contactName` string before persistence (`toPendingRowInPerson`/`toPendingRowOnline`,
  `canonicalCreate.ts:74-132`, both take `contactName: input.contactName` — a pre-formatted string, not the
  structured FIO).

### 1.b The confirmed overwrite/merge risk: attendee's phone leaks into the actor's own contact list

- `persistBookingFormContacts` (`canonicalCreate.ts:41-52`, called at `canonicalCreate.ts:349,518`) calls
  `upsertBookingFormContactsBestEffort` (`apps/webapp/src/modules/platform-user-contacts/bookingContactUpsert.ts:20-59`)
  with `platformUserId: createInput.userId` (the **actor's** own id) and `contactPhone`/`contactEmail` taken
  from the booking form — i.e. **whatever phone/email was typed for the attendee**, not the actor.
- The only guard is `shouldSkipSupplementaryContactUpsert`
  (`apps/webapp/src/modules/platform-user-contacts/identityContactMatch.ts:40-49`), which skips the upsert
  **only when the typed value equals the actor's own known identity phone/email**
  (`supplementaryContactMatchesIdentity`, `identityContactMatch.ts:22-37`). It does **not** check whether the
  typed phone/email belongs to a **different, existing** `platform_user` — so today, if actor A books "for
  another person" using that person's real phone number, that phone gets **upserted into A's own
  `platform_user_contacts` as `source: "booking"`** (`bookingContactUpsert.ts:31-36`). This is exactly the
  "перетирать чужим ФИО" / merge risk the owner flagged, concretized: it doesn't overwrite `platform_users`
  itself, but it **does** attach a stranger's real contact info to the actor's own contact record, which is
  precisely the kind of data that later identity-merge tooling (`patient_merge_candidates`,
  `apps/webapp/db/schema/patientMergeCandidate.ts`, used by
  `docs/_TODO/SAAS_FOUNDATION/PATIENT_INVITE_AND_MANUAL_CREATION_DESIGN.md` and the public-booking merge
  flow, `patient-booking.md:44`) could act on incorrectly.
- This is a genuine "current overwrite/merge risk" (card #563 acceptance criterion 1) grounded in code, not
  a hypothetical: the write path exists, runs on every booking with a `contactPhone`/`contactEmail`
  different from the actor's identity, and has no "is this for someone else" signal to suppress it
  differently.

### 1.c Doctor-facing visibility today: no actor/attendee distinction, no clickable actor

- `projectCanonicalAppointmentForDoctor` (`apps/webapp/src/modules/patient-booking/projectCanonicalAppointment.ts:42-57`)
  builds the doctor-facing projection payload from a single `ProjectionContactFields` shape
  (`projectCanonicalAppointment.ts:17-25`): `contactName`, `phoneNormalized`, no actor field at all. The
  payload JSON (`basePayloadJson`, `:27-40`) stores `contact_name` — one name, presented as if it were simply
  "the patient."
- `appointment_records`/doctor projection schema carries `contact_name text NOT NULL` / `contact_phone text
  NOT NULL` (`apps/webapp/db/schema/schema.ts:1684,1686`, table columns adjacent to the `appointment_records`
  definition) — again a single flat contact identity, no actor/attendee split.
- Staff-side manual appointment creation (`DoctorCreateAppointmentDialog.tsx:82`,
  `platformUserId: patient?.id ?? null`) already has a **doctor-as-creator vs patient-as-subject** split in
  its own narrow context (staff picks an existing patient card to book for) — a useful precedent for "the
  person creating the booking" ≠ "the person the booking is about," but it is staff-side (doctor booking for
  a known patient card), not the patient-self-service "I'm booking for someone else, who may not have any
  account at all" case this design covers.
- No doctor UI component today renders "booked by X, attending: Y" with X clickable for contact — the
  wizard/doctor projection model doesn't have the second identity to render.

### 1.d Broader context: this is a known, previously-flagged gap

`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md:188` already lists, for "Public booking,"
the gap: *"Success does not prove atomic enrollment/app continuation; internal `userId` authority/leak and
identity ambiguity need removal"* — the same class of problem (one `userId` slot standing in for
"whoever is on the phone right now"), acknowledged at the broader UX-roadmap level but not designed down to
a concrete contract there (per that roadmap's own scope note, `IMPLEMENTATION_ROADMAP.md:199-200`: *"Any gap
that assumes a new persistence shape first gets a reviewed data/API contract... a future table or field name
is not part of this roadmap"*). This design note is exactly that contract for the actor/attendee slice —
it does not duplicate or re-decide anything from the UX roadmap, it fills the delta the roadmap explicitly
defers.

---

## 2. Owner decision restated as a contract

| Concept | Who | Behavior |
|---|---|---|
| **Actor** | The authenticated `platform_user` who is logged in and performs the booking | Receives all booking notifications; can cancel/reschedule; is the row's `platform_user_id` / session-authorized owner for every existing authorization check that already keys off `platform_user_id` today |
| **Attendee** | The person who will actually attend | Stored as a **snapshot** — FIO + phone, **not** necessarily any existing `platform_user` row; **not** written into the actor's own `platform_user_contacts`; **no automatic merge/link** to any other account |
| **Conversion (attendee → patient)** | N/A yet | Explicitly **out of scope** for #543 MVP per the card text — a later, separate follow-up |

This is additive to what already exists, not a rebuild: `platform_user_id` on `be_appointments` /
`patient_bookings` already **is** the actor slot today (§1.a) — it just isn't documented/enforced as
"actor, not necessarily attendee," and the attendee snapshot fields (`contactFio`/`contactName`/
`contactPhone`) already exist structurally but (a) leak into the actor's contacts (§1.b) and (b) aren't
surfaced distinctly to doctors (§1.c).

---

## 3. Design / contract

### 3.a Keep `platform_user_id` = actor; stop conflating it with attendee identity

No schema change needed for the actor side — `be_appointments.platform_user_id` /
`patient_bookings.platform_user_id` continue to mean "the logged-in user who booked and who is notified/can
cancel," matching every existing authorization chokepoint that already reads this column (cancel/reschedule
guards in `booking-appointment-lifecycle`, per `booking-scheduling.md:46-58`). **Document this explicitly**
(code comment + this design doc) so future changes don't assume `platform_user_id` == "the patient in the
appointment," since for attendee-booked appointments it will not be.

### 3.b Promote the attendee snapshot from "informal contact fields" to an explicit, first-class concept

Two viable shapes — flagged as an explicit implementation choice, not decided here:

- **Option A (minimal, no schema change):** Keep attendee identity as it mostly is today —
  `contactName`/`contactPhone`/`contactEmail` columns on `patient_bookings` (already exist,
  `schema.ts` `patientBookings.contactPhone/contactEmail/contactName`) plus `contactFio` promoted from
  "buried inside `attribution_json`" to a **top-level, documented** field of `be_appointments.attribution_json`
  with a stable shape (e.g. `{ attendee: { lastName, firstName, patronymic?, phone, email? } }`), so doctor
  UI and future conversion tooling have one well-known place to read it instead of ad hoc keys.
- **Option B (structured, small schema addition):** Add `attendee_last_name`, `attendee_first_name`,
  `attendee_patronymic`, `attendee_phone`, `attendee_email` (all nullable text) directly to
  `be_appointments` and `patient_bookings` — queryable/indexable (e.g. searching "has anyone booked with
  this attendee phone" without a JSON scan, useful for the later conversion-to-patient follow-up and for
  `patient_merge_candidates`-style tooling). Matches the repo's general precedent of adding small,
  reversible, nullable columns to booking-engine tables when a concept becomes first-class (e.g.
  `0119_be_appointments_soft_delete.sql`'s `deleted_at` addition).

  **Recommendation for implementation: Option B for `be_appointments`** (canonical write path) — an
  explicit `is_self_booking boolean` alongside the attendee columns makes "is this booking for the actor
  themselves" a single indexable predicate instead of an "attendee fields happen to equal actor identity"
  heuristic, which will matter for the later conversion-to-patient follow-up this design deliberately
  doesn't design (out of scope, per owner decision). `patient_bookings` can either mirror the same columns
  or, since it already has flat `contact_*` columns serving roughly this purpose, just add
  `attendee_patronymic` + `is_self_booking` to close the structural gap without a full duplicate set.

### 3.c Fix the merge/overwrite risk at its actual chokepoint

The concrete fix (regardless of Option A/B above): `persistBookingFormContacts`
(`canonicalCreate.ts:41-52`) must **only** call `upsertBookingFormContactsBestEffort` when the booking is
for the actor themselves (`is_self_booking` true, or equivalently: attendee FIO/phone matches the actor's
own known identity within tolerance). When the booking is explicitly "for another person," **skip the
supplementary-contact upsert entirely** — the attendee's phone/email belongs on the **appointment's**
attendee snapshot (§3.b), never on the actor's own `platform_user_contacts` row. This directly closes the
risk mapped in §1.b, and is a small, localized change (one new conditional at the existing call site,
`canonicalCreate.ts:349,518`) rather than a rework of `platform-user-contacts`.

### 3.d "Is this for me or someone else?" — the missing UI signal

Per source feedback (`patient-booking.md:41-43`): *"Если залогиненный клиент вводит чужое ФИО или по
телефону видно, что это другой человек, нужно дать выбор: «записываете себя» или «другого человека»."*
Today `ConfirmStepClient.tsx` (`:115-119,285-298`) just has flat lastName/firstName/patronymic/phone/email
inputs pre-filled from `defaultFio`/`defaultPhone`/`defaultEmail` (props passed from the page, presumably the
actor's own profile) — there's no "self vs someone else" toggle, and no heuristic detecting a FIO/phone
mismatch. The design contract: add an explicit **radio/toggle** ("Себя" / "Другого человека") at the top of
the confirm step, defaulting to "Себя" with the actor's own profile pre-filled (today's behavior, unchanged
when the toggle stays on "Себя"); switching to "Другого человека" clears the pre-fill and requires attendee
FIO + phone (email optional, same as today) as the attendee snapshot — **not** using `defaultFio`, so the
actor's own profile fields are never silently overwritten by whatever gets typed for someone else. This is
the concrete answer to "не перетирать `platform_user` текущего аккаунта чужим ФИО."

### 3.e Doctor UI: show both identities, actor clickable

Per source feedback (`patient-booking.md:43`): *"В записи должно быть видно, кто придет, и кто записал;
записавший кликабелен для связи."* Concretely: `projectCanonicalAppointmentForDoctor`'s payload
(`projectCanonicalAppointment.ts:27-40`) needs an `actor_contact` (or similar) field alongside the existing
`contact_name` (which becomes explicitly "attendee name," not "the patient"), and the doctor-facing
appointment card component needs to render both — attendee name/phone as "кто придёт," and actor
name/phone as "записал(а): [clickable, e.g. tel: link or existing patient-card-if-linked]." When
`is_self_booking` is true, these collapse to the same display (no behavior change from today for the
common case).

### 3.f Notifications and cancel authority

Owner decision states the actor "receives notifications and can cancel" — this matches what already happens
mechanically today (notifications and cancel/reschedule authorization already key off `platform_user_id`
throughout `booking-scheduling`/`booking-appointment-lifecycle`, `booking-scheduling.md:46-58`,
`emitBookingEvent`, `canonicalCreate.ts:470-503`). **No change needed here** beyond making sure no future code
accidentally starts sending notifications to "the attendee" as if the attendee had their own account/session
— since per this design, the attendee may have **no account at all**.

---

## 4. Tenant-safety

- Attendee snapshot fields (whichever option, §3.b) carry no tenant/organization identity of their own —
  they're scoped exactly the way the appointment row already is (`organization_id` on `be_appointments`,
  `bookingEngine.ts:425`), so no new cross-tenant surface is introduced by adding attendee columns.
- The merge-risk fix (§3.c) is itself a tenant-safety improvement: today, a stray attendee phone written into
  `platform_user_contacts` under the actor's own id could, in principle, feed into cross-org identity-match
  tooling (`patient_merge_candidates`) with data that was never actually the actor's — closing that write
  removes one path by which one tenant's booking data could taint another person's contact record.
- No RLS/wall enforcement changes are implied by this design (per `AGENTS.md` §4a: don't add ad hoc
  enforcement ahead of the canonical `DB_ACCESS_CHOKEPOINT`/`SAAS_FOUNDATION` stages) — this stays within
  additive, backward-compatible columns/fields.

---

## 5. Phased implementation checklist (for the follow-up ticket, not this design pass)

- [ ] Confirm attendee-storage shape: Option A (documented `attribution_json` shape) vs Option B (first-class
      nullable columns + `is_self_booking`) — recommend B (§3.b).
- [ ] Add `is_self_booking` (or equivalent) to the create input contract
      (`CreatePatientBookingInput`/`PublicCreateBookingInput`, `types.ts:97-131`).
- [ ] Fix `persistBookingFormContacts`/`upsertBookingFormContactsBestEffort` call site to skip the
      supplementary-contact upsert when the booking is for someone else (§3.c,
      `canonicalCreate.ts:41-52,349,518`).
- [ ] Add the "Себя" / "Другого человека" toggle to `ConfirmStepClient.tsx` (§3.d), with attendee fields
      independent from `defaultFio`/`defaultPhone`/`defaultEmail` when toggled.
- [ ] Extend doctor projection payload (`projectCanonicalAppointment.ts:17-40`) and the doctor-facing
      appointment card component with a distinct actor field, clickable for contact (§3.e).
- [ ] If Option B: Drizzle migration adding attendee columns (+ `is_self_booking`) to `be_appointments` and
      (mirrored subset) `patient_bookings`.
- [ ] Tests: `canonicalCreate.test.ts` (attendee snapshot persisted, actor unaffected, contact-upsert skipped
      for non-self bookings), `bookingContactUpsert.test.ts` (guard extended), `ConfirmStepClient.test.tsx`
      (toggle behavior), doctor appointment-card test (both identities render, actor clickable).
- [ ] Validation commands for the implementation pass: `pnpm --dir apps/webapp test -- patient-booking`,
      `pnpm --dir apps/webapp test -- platform-user-contacts`, `pnpm --dir apps/webapp typecheck`
      (step-level); full CI at the merge/integration checkpoint per `AGENTS.md` §9.
- [ ] Explicitly **not** in this ticket: attendee → patient conversion flow (owner decision states this is a
      separate follow-up outside #543 MVP).

---

## 6. Open questions (not answered here — need owner/product sign-off before implementation)

1. Attendee storage shape: first-class nullable columns on `be_appointments`/`patient_bookings` (recommended,
   queryable, sets up the later conversion follow-up) vs staying inside `attribution_json` (zero migration,
   but not queryable without a JSON scan)?
2. Should the "Себя" / "Другого человека" toggle attempt any automatic mismatch **detection** (e.g. typed
   phone doesn't match actor's known phone → suggest switching to "другого человека"), or stay a manual,
   always-visible toggle for MVP? Source feedback (`patient-booking.md:41`) mentions detection ("по телефону
   видно, что это другой человек") but the taskdb card's owner decision only commits to the storage/actor
   contract, not the detection heuristic — recommend manual toggle for MVP, detection as a possible
   fast-follow.
3. Exact doctor-UI copy/placement for "записал(а): [actor]" — this design specifies the data contract
   (both identities available, actor clickable) but not final visual placement, which belongs to whoever
   implements the doctor appointment-card change.
