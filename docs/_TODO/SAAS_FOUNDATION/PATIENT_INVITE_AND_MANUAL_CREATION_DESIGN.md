# Patient invite + manual calendar/walk-in creation — design (#801 + #806)

**Статус:** design doc, DOCS-ONLY. No schema/code changed by this pass. Written against repo state at
`feat/doctor-ui-rebuild`, 2026-07-17.

**Authority order:** `docs/_TODO/SAAS_FOUNDATION/OWNER_RULINGS_2026-07-17.md` §2 (arms this block) →
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/OWNER_RULINGS_2026-07-16.md` UX08-11 (product decision) →
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/{ENTRY_AND_INVITE_JOURNEYS.md, TARGET_IA.md, SCREEN_COMPOSITION.md,
IMPLEMENTATION_ROADMAP.md}` (audited UX-04/06/09 product/screen/stage canon, dated 2026-07-15/16, merged
to `feat/doctor-ui-rebuild` at commit `12cdef5d6`) → `docs/_TODO/SAAS_FOUNDATION/TENANT_WALLS_AND_ACCESS_MODEL.md`
(tenant-wall canon) → this document.

**This document is not a from-scratch redesign.** The UX-04/06/09 package already covers #801/#806 at the
journey/screen/stage-contract level (§0 below maps exactly which sections). What that package does **not**
do, and explicitly defers: table names, columns, token shape, transaction boundaries, and route-level
wiring against the *current* codebase — `IMPLEMENTATION_ROADMAP.md:199` states this directly ("Any gap
that assumes a new persistence shape first gets a reviewed data/API contract. A future table or field name
is not part of this roadmap") and U3B's own `Workstreams` row names exactly this as owed:
"data — lifecycle/enrollment/booking transaction contracts" (`IMPLEMENTATION_ROADMAP.md:473`). This
document **is** that contract: the delta between the audited package and the current repository, made
concrete enough to implement. §0 separates (a) what the package already specifies, (b) what it leaves
open, (c) the implementation contract this doc adds for the delta, per the coordinator's requested
structure.

Card texts (taskdb, verbatim from owner ruling 2026-07-16):

- **#801**: "specialist can manually create a new patient + scheduled appointment from the calendar
  (name/surname, phone, optional email, date/time), and a walk-in flow (create patient card + actual
  visit without prior booking). Patient card/clinical relationship exists BEFORE portal activation;
  later a verified email/phone identity links exactly-once to the existing card/visits/program. Patient
  self-booking stays a parallel optional entry. Invite delivery is NOT proof of identity."
- **#806**: "specialist creates patient/card/program WITHOUT phone/email, copies a channel-agnostic
  invite link (sends via MAX/Telegram/whatever). Opaque high-entropy bearer token bound to exact
  organization + existing patient/enrollment. Before authentication: NO clinical data exposed. After
  successful auth (user picks phone/email/OAuth): atomic exactly-once redeem linking the new portal
  identity to the existing card/program/history. Token: short-lived, revocable, single-use, hashed at
  rest, never logged/analytics/referrer, removed from URL via server exchange+redirect; audit
  issue/redeem/revoke/conflict; already-linked/expired/replayed/wrong-org/conflicting-identity all fail
  closed."

---

## 0. Position in the audited UX package

### 0.a What the package already specifies (cite doc + section)

- **Stage ownership is already assigned.** `IMPLEMENTATION_ROADMAP.md` §8 stage **U3B — "patient invite,
  delivery, activation, install and public-booking continuation"** (:450-486) owns exactly #801/#806 (plus
  SMS fallback and public-booking continuation, out of this doc's scope — see §6). Its stated `Outcome`
  (:452-454) is verbatim the product shape of both cards: "specialist can immediately create a patient
  card/relationship plus scheduled appointment or walk-in; optional email-first portal invite... links a
  verified canonical identity to that existing card." Its `Scope` line (:460-464) already enumerates: manual
  patient create (name, phone, optional email), scheduled/walk-in state, portal
  not-activated/invited/linked status, exactly-once link, immutable delivery attempts, consent/suppression.
- **Screen IDs and routes are already allocated.** `TARGET_IA.md` §6 (:218-219) and `SCREEN_COMPOSITION.md`
  §6 (:90-91) assign: `CLIN-02` (`/app/work/patients`) = "manual create card+scheduled/walk-in visit,
  optional portal invite"; `CLIN-03` (`/app/work/patients/[patientId]`) = "portal-link status" on the
  patient card; `ORG-PUB-03` (`/join/[exchange]`) = "Neutral exchange; org summary; masked recipient;
  OTP/auth; relationship confirmation" — and `SCREEN_COMPOSITION.md:56`'s alias-table row
  (`CLIN-PAT-INVITE → CLIN-02/CLIN-03`) states explicitly: "Manual relationship exists before portal
  activation; delivery never implies proof/access," with states
  "created/not-activated/invited/linked; delivery remains independent from proof; duplicate/conflict/revoke/resend."
  `TARGET_IA.md:139`'s alias row adds that public acceptance for this same flow "continues through
  ORG-PUB-03/PUB-04." **The canonical target UI for #806's redeem step is the shared `/join/[exchange]`
  route, not a new dedicated patient-invite page** — this doc's §2.2/§7 are revised below to attach to that
  route, not invent a second one.
- **The engineering invariants are already locked**, `IMPLEMENTATION_ROADMAP.md` §4 (:87-113): invite/
  booking/route/slug/query never grants rights, only server-resolved records do and re-verify before every
  mutation (:91-92); "Invite relationship, delivery attempt and auth/recipient proof — три независимые оси"
  (:99-100, matches `ENTRY_AND_INVITE_JOURNEYS.md` §1's three-class split verbatim); raw-token handling,
  exactly-once, no persona overwrite are architecture invariants, not open questions (§5.1, :144-152).
  This doc's §4/§8 are written to satisfy these, not to re-derive them.
- **The audited package independently found the same code gap this doc's §1 documents from scratch.**
  `IMPLEMENTATION_ROADMAP.md` §6.2 (:186) states, for "Manual patient + portal linking": *"Manual card +
  scheduled/walk-in visit and identity-to-existing-card linking are incomplete; invite/proof remains
  separate."* `SCREEN_INVENTORY_SPECIALIST.md` §8 (:134) adds: *"Clinic invite UI creates/copies invite
  links, but this audit found no end-to-end email delivery/first-login/recovery surface."* §1 below reaches
  the same conclusion independently, with file:line evidence, and should be read as confirming (not
  discovering) the audited gap.
- **The "detailed matching/conflict policy" this doc supplies is itself named and deferred by the roadmap.**
  `IMPLEMENTATION_ROADMAP.md` §5's decision-gate table, row `UX08-11` (:133): "Implementation policy /
  non-blocking backlog: **Detailed matching/conflict policy**" — i.e. the roadmap already anticipates that
  duplicate/conflict handling (this doc's §3/§4.1) is a separate artifact, not a re-opened owner decision.
- **Existing merge/name-match UI is explicitly *not* reusable as-is.** `ROUTE_MIGRATION_MAP.md:65` (row
  S26, `doctor/booking-merge` + `doctor/clients/name-match-hints`): *"retire / reclassify before any
  reuse... Existing global patient merge/name-match UI is not migrated. Any future correction must use a
  separately reviewed, authorized patient/specialist identity-resolution workflow; no merge mutation or
  schema is specified here."* §3 below reuses the `patient_merge_candidates` **table** (data layer, already
  org-scoped) but explicitly does **not** propose reusing those two UI pages — a staff-facing review surface
  for the queue this doc creates is separately scoped (flagged in the checklist, §10).

### 0.b What the package leaves open for #801/#806 specifically

- Exact `patient_invites`-equivalent schema, token crypto, TTL default, and SQL/RLS function shapes — by
  design (`IMPLEMENTATION_ROADMAP.md:199`, U0's own `Forbidden` line :265-266: "schema/SQL... assumptions
  from table names alone" are out of scope *for U0*, and U3B's `Migration/compat` line :475-476 states "no
  schema invention" at the *stage-outcome* level while its `Workstreams` line still owes a "data" contract
  — the two are reconciled by treating schema definition as this reviewed pre-stage artifact, consumed by
  U3B, not as ad hoc invention during U3B itself).
- Which existing route/service is the actual current caller of `POST /api/doctor/clients` (§1.2) — not
  resolved by the UX package either; flagged in §7/§10 as an implementation-time lookup.
- The precise `org_enrollments`/token-table wiring, since the UX package works one level of abstraction
  above persistence ("enrollment," "invite," "relationship" as logical objects, `ENTRY_AND_INVITE_JOURNEYS.md`
  §3 preamble: "Названия ниже — logical contract, не требование немедленно создать таблицы с такими
  именами").
- Reconciliation of the existing three token primitives found in code (§1.6/§5) — the UX package does not
  know about `user_email_setup_tokens`/`email_challenges`/`organization_member_invites` at the code level; it
  states the *contract* they must jointly satisfy, not which of them to extend versus replace.
- The messenger channel-binding precedence risk (§1.5/§9 item 7) is a code-level interaction the UX package
  does not model at this granularity, since `identityResolutionPort.ts` is below its abstraction level.

### 0.c This document's contract for the delta (what's added, scoped strictly to the above gap)

Everything from §1 onward. In one line: §1 is the current-code audit the roadmap's own gap line (:186)
asserts but does not detail; §2-§5 are the "reviewed data/API contract" `IMPLEMENTATION_ROADMAP.md:199`
requires before U3B's data workstream can start; §6 is the explicit #805/#806 non-overlap contract U3B's
`Dependencies`/`Boundaries` lines already require but do not spell out in table form; §7 maps the contract
onto both the **current** route tree (what exists today, pre-migration) and the **canonical** `CLIN-02/
CLIN-03/ORG-PUB-03` target IDs (per `ROUTE_MIGRATION_MAP.md` row S03, :42, which already assigns the current
`doctor/patients/**` files to those same canonical IDs); §8 checks this design against U3B's `Forbidden`/
`Boundaries` lines explicitly; §9 lists contradictions found against *both* the current code and,
separately, gaps the UX package itself flags as still-open; §10 is a checklist scoped to U3B's own
`Completion` criteria (:483-485) plus the code-level items §1 found that the roadmap's abstraction level
doesn't reach.

**Sequencing constraint carried forward, not reopened here:** `IMPLEMENTATION_ROADMAP.md` §3.1 and U3B's own
`Dependencies` line (:471-472) are explicit that U3B — and therefore this contract's implementation —
depends on completed **U1** (capability guard spine) and **U5A** (patient organization resolver), and that
shared exchange/proof primitives come from U3S, never from deferred U3A. Per `IMPLEMENTATION_ROADMAP.md:4`,
"Implementation ещё не начиналась" for the whole UX-09 sequence at time of writing. This document does not
assert U1/U5A/U3S are complete, does not re-verify their status, and does not authorize starting U3B
implementation ahead of that dependency order — it is the artifact U3B's data workstream consumes once its
prerequisites are met.

---

## 1. Reality audit (evidence, file:line)

### 1.1 Calendar manual appointment creation — exists, patient-search only, no patient creation

- `apps/webapp/src/app/app/doctor/calendar/DoctorCalendarEventPanel.tsx:295,311-314,338-343` — the create
  form already carries a `createPatient` field (`{ id, phone }`) and posts `platformUserId` +
  `phoneNormalized` straight to `POST appointments/manual`. There is **no name/surname field** and no
  "create new patient" affordance in this panel today — it only searches/selects an existing patient by
  phone or accepts a bare phone string.
- `apps/webapp/src/app/api/doctor/booking-engine/appointments/manual/route.ts:24-34,116-143` — body schema
  accepts `platformUserId` (nullable) and `phoneNormalized` (nullable) independently. It requires a
  concrete `specialistId` (comment at :86-90 explains why: NULL specialist bypasses the overlap exclusion
  constraint) but does **not** require `platformUserId`.
- `apps/webapp/src/infra/repos/pgBookingEngine.ts:716-773` (`createAppointment`) — inserts
  `beAppointments` with `platformUserId: input.platformUserId ?? null` and `phoneNormalized:
  input.phoneNormalized ?? null` **verbatim, with no resolve-or-create of a `platform_users` row**. If
  staff types a phone for a brand-new patient with no matching `platformUserId`, the appointment is
  created with a bare phone string and `platformUserId = NULL` — no canonical patient identity, no card.
- **Finding:** the calendar path today can attach an *existing* patient to a new appointment, or record a
  phone with no patient at all. It cannot create a new patient card as part of appointment creation. #801's
  "create a new patient + scheduled appointment" is not one transaction anywhere in the codebase today.

### 1.2 Patient card creation — exists, but disconnected from the calendar and from appointments

- `apps/webapp/src/app/api/doctor/clients/route.ts:1-60` (`POST /api/doctor/clients`) — the actual
  "create a patient card" endpoint. Requires `phone`, accepts optional `email`, calls
  `createDoctorClient`. **Does not accept or create an appointment/visit in the same call.**
- `apps/webapp/src/app-layer/doctor/createDoctorClient.ts:28-91` — normalizes RU phone
  (`normalizeRuPhoneE164`, hard regex `^\+7\d{10}$` at :33 — **RU-only format, no country flexibility**),
  resolves-or-creates via `resolveOrCreateDoctorClientByPhone`, and if an email was supplied, fires
  `fireAndForgetContactEmailSetup` with `source: "doctor_profile"`.
- `apps/webapp/src/infra/repos/pgDoctorClientCreate.ts:37-105` — dedup is **phone-first, global**:
  `findCanonicalUserIdByPhone` looks up by phone across the whole `platform_users` table (not
  organization-scoped) and silently reuses that row if found. If a *different* existing user already owns
  the supplied email, the whole creation **hard-fails** with `email_conflict` (409) — no soft/staff-review
  path, unlike the mechanism in §1.4.
- **Finding:** patient-card creation exists as an isolated endpoint. It has no walk-in/visit bundling, no
  name+surname split (single `displayName`), and treats email collision very differently (hard 409) from
  how the codebase treats phone collision (silent transparent reuse) or how it treats organization-scoped
  duplicate suspicion (`patient_merge_candidates`, soft/reviewable — §1.4). #801/#806 need one consistent
  policy, not three.

### 1.3 Walk-in — exists, but only for an *already-known* patient, not a brand-new one

- `apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabKarta.tsx:1216-1217,1316,1334,1637` —
  there is already a `"from_booking" | "walk_in"` mode toggle, with a comment at :1637 ("the appointment
  this visit is being created from; `null` = walk-in without booking"). This lives **inside an existing
  patient's card** (route is `/app/doctor/patients/[userId]/tabs/karta`) — it creates a walk-in *visit* for
  a patient who is already resolved by `userId`. (The child `NewVisitPanel.tsx` is only ~1474 lines and does
  not hold this toggle; the mode state lives in this parent tab file.)
- **Finding:** #801's walk-in requirement ("create patient card and actual visit without prior booking",
  i.e. for a brand-new person standing at the front desk who has no card yet) has no existing code path.
  The only "walk-in" concept in the repo assumes the card already exists.

### 1.4 Duplicate resolution — two inconsistent existing mechanisms, neither org-invite-aware

- `apps/webapp/db/schema/patientMergeCandidate.ts:1-65` + `apps/webapp/src/infra/repos/pgPatientMergeCandidate.ts:1-110`
  — `patient_merge_candidates` (organization-scoped, `anchor_user_id`/`candidate_user_id`,
  `status: pending|resolved|dismissed`, unique-pending-pair index, `trigger_appointment_id`). This is a
  **soft, reviewable** duplicate-suspicion queue: something suspects two `platform_users` rows are the same
  person, staff reviews and resolves/dismisses. Already wired to at least one appointment-triggered path
  (`triggerAppointmentId`).
- Compare to §1.2: `createDoctorClient` email collision is a **hard, blocking** 409 with no queue entry at
  all. Same product problem ("is this a duplicate person?"), two incompatible severities.
- **Finding:** #801/#806 must pick one policy and reconcile it with the existing `patient_merge_candidates`
  table rather than inventing a third. See §3.

### 1.5 Identity/registration split — confirmed per 2026-07-13 ruling, patient auth is passwordless-OTP target

- `apps/webapp/src/app/api/auth/phone/start/route.ts`, `apps/webapp/src/modules/auth/phoneAuth.ts`,
  `apps/webapp/src/modules/auth/phoneChallengeStore.ts` — phone OTP infra exists and is the patient-side
  identity-proof primitive the redeem step should call into (per ENTRY_AND_INVITE_JOURNEYS.md §7, patient
  target auth is passwordless OTP; password/OAuth are compatibility, not target).
- `apps/webapp/src/modules/auth/oauthWebLoginResolve.ts`, `oauthYandexResolve.ts` — OAuth resolution exists
  for the "user picks phone/email/OAuth" chooser #806 requires at redeem time.
- `apps/webapp/src/modules/auth/identityResolutionPort.ts:1-40` — **relevant risk, not yet reconciled**:
  `findOrCreateByChannelBinding` auto-resolves/creates a canonical `platform_users` row from a Telegram/MAX/
  VK channel binding, and matches `phoneNormalized` "only when the canon already has integrator/trusted
  projection activation" (comment at :17-18, i.e. gated by `patient_phone_trust_at` — see §1.6). If a
  patient opens a #806 invite link *inside* a MAX/Telegram Mini App (a channel #806 explicitly names as a
  delivery transport), the ambient messenger-entry bootstrap could resolve/create an identity via this
  channel-binding path **before** the invite-redeem chooser ever runs. §9 (item 7) flags this as a required
  reconciliation point, not a design already covered by existing code.

### 1.6 Enrollment/membership model — schema exists and already anticipates the right states, but is unwired

- `docs/_TODO/SAAS_FOUNDATION/00_DECISIONS_AND_SCHEMA.md:8` (D2) — "Enrollment = explicit
  `(organization_id, platform_user_id)` table (NOT derived)".
- `apps/webapp/db/schema/bookingEngine.ts:208-233` — `org_enrollments` table: `(organization_id,
  platform_user_id)` unique pair, **`status` check constraint already allows
  `active | invited | discharged | archived`** — i.e. the schema already has the exact pre-activation state
  #801/#806 need, unused.
- `apps/webapp/src/infra/repos/pgPatientOrganization.ts:20-37` — the **only** code that touches
  `org_enrollments` at all, and it is **read-only** (`listActiveEnrollmentsByPlatformUser`, `status =
  'active'` only). A repo-wide grep for `orgEnrollments`/`org_enrollments` outside migrations/docs found
  no INSERT anywhere in `apps/webapp/src`.
- `apps/webapp/db/drizzle-migrations/0145_seed_client_org_enrollments.sql` — the only rows that exist were
  a one-time backfill seed, not an ongoing write path.
- **Finding — the central contradiction this design must close:** the target schema for "card exists before
  portal activation, later a verified identity links exactly-once" is *already sitting in the database*
  (`org_enrollments.status IN ('invited','active', ...)`) but **no code path ever writes it**. Neither
  `createDoctorClient` (§1.2) nor `createAppointment` (§1.1) ever ensures an `org_enrollments` row. This is
  consistent with ENTRY_AND_INVITE_JOURNEYS.md §9's own finding for public booking ("SaaS S6.4 plan still
  lists ensure-enrollment in the booking transaction as unfinished") — the gap is systemic, not specific to
  one route. §2 below designs directly on top of this existing, currently-dormant column rather than adding
  a new one.
- `deploy/postgres/organization-member-invites-rls.sql` (full file, repo root) — the **staff-side**
  invite/accept pattern already implements almost exactly the mechanics #806 needs, just for
  `be_organization_members` instead of `org_enrollments`: opaque `token_hash`-only lookup
  (`app.lookup_pending_org_invite`, :116-153), single SECURITY DEFINER accept function
  (`app.accept_org_invite`, :158-293) that row-locks the invite (`FOR UPDATE`), re-checks
  `status = 'pending'`, expiry, recipient match, then does the membership upsert and invite-status flip in
  one transaction, `EXECUTE` granted only to `app_patient`/pre-session roles with **no direct table grants**
  to the invite table for non-staff. §3/§4 model the new patient-invite mechanism directly on this file.
- `apps/webapp/src/modules/organization-invites/service.ts:1-21` — token crypto for that flow: `sha256(token
  + pepper)`, `randomBytes(32).toString("base64url")`, 7-day TTL. Same shape (not identical function) as
  `apps/webapp/src/modules/auth/emailSetupTokens/tokenCrypto.ts:1-19` (`est_` prefix, same sha256+pepper
  scheme) and `apps/webapp/db/schema/userEmailSetupTokens.ts:1-45` (`token_hash` unique, `used_at`,
  `revoked_at`, `source` check enum already including `"registration_claim"` — declared in
  `apps/webapp/src/modules/auth/emailSetupAccess/ports.ts:6` but, per
  `apps/webapp/src/infra/repos/pgEmailSetupAccessPort.ts:9,17` ("setup теперь кодовый" — comment: "setup is
  now code-based"), **never actually issued at runtime**: `doctor_profile` source is wired to
  `startEmailChallenge` (an OTP-code challenge on `email_challenges`), not to `userEmailSetupTokens` at all.
- **Finding:** the repo has *three* independent bearer/code token primitives (`organization_member_invites`
  token_hash, `user_email_setup_tokens` token_hash, `email_challenges` OTP code), each solid on its own, but
  none of them fits #806 as-is: `organization_member_invites` is staff/membership-shaped;
  `user_email_setup_tokens` requires a known `userId` **and** a known `emailNormalized` at issue time (#806
  explicitly requires the invite to work with *no* phone/email on file, channel chosen at redeem time);
  `email_challenges` is a short OTP code tied to one already-known email, not a copyable link. §3 proposes a
  fourth, narrow table modeled on `organization_member_invites`'s proven RLS/SECURITY DEFINER shape rather
  than reusing any of the three as-is (see §5 for the explicit "why not reuse X" for each).

### 1.7 Trusted-phone tier — an existing mechanism partially already does exactly-once phone linking, silently

- `apps/webapp/src/modules/platform-access/trustedPhonePolicy.ts:14-64` — `TrustedPatientPhoneSource` enum
  already includes `DoctorStaffClientCreate = "doctor_staff_client_create"` (:35) as a source that sets
  `patient_phone_trust_at`.
- `apps/webapp/src/infra/repos/pgDoctorClientCreate.ts:75-82` — the INSERT that creates a new patient row
  from staff input sets `patient_phone_trust_at = now()` **immediately at card-creation time**, before any
  patient has proved control of that phone.
- **Finding, non-trivial:** this means the phone-known half of #801 already has an *implicit* linking path —
  when the real patient later does a genuine phone-OTP login with that exact number, canonical-phone
  resolution finds the same `platform_users` row created by staff and the patient lands on their existing
  card, no separate "redeem" step needed. That is functionally consistent with "verified phone identity
  links exactly-once to the existing card." **But** it happens with **no explicit activation event, no
  audit record, and no `org_enrollments` status transition** (§1.6) — it is silent. It also means
  `patient_phone_trust_at` is granted on staff's say-so, not on proof, which is a narrower but real version
  of the same principle #806 states explicitly ("invite delivery is not proof of identity") — a staff-typed
  phone number is not proof either; it should not by itself imply anything beyond "this appointment's
  contact channel" until the *patient* proves it via OTP. The current code already accepts this trust grant
  at creation time; §3 does not propose removing it (that is a different, larger authn-tier change out of
  scope for this design) but does require adding the missing `org_enrollments` transition + audit event so
  the linking is no longer silent.

### 1.8 Tenant wall — confirmed canon, nothing to change here

- `docs/_TODO/SAAS_FOUNDATION/TENANT_WALLS_AND_ACCESS_MODEL.md` §§1-4 — exactly two walls: clinical
  (`app.is_staff() AND organization_id = app.current_org_id()`) and patient-own
  (`row owned by app.current_patient_user_id()`). Organization-for-a-patient is an **application filter**,
  never a second DB wall. §2 below is written to fit this exactly: the new invite table gets a staff-side
  RLS policy identical in shape to `organization_member_invites`'s (§1.6), and the patient-side pre-session
  exchange goes through narrow SECURITY DEFINER functions only — never a direct grant to `app_patient` on
  the invite table itself.

### 1.9 #805 boundary — confirmed separate, already ruled

- `docs/_TODO/SAAS_FOUNDATION/OWNER_RULINGS_2026-07-17.md` §1 — `/book/{publicSlug}` confirmed as the
  public-booking canon; "персональные инвайт-токены — отдельный flow (#806), не смешивать."
- `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/ENTRY_AND_INVITE_JOURNEYS.md` §9 (J5) — public booking resolves
  organization from a *published* branch/service/slot record and trusts phone as the identity source;
  that path is anonymous-initiated and catalog-shaped. #806 is staff-initiated, bound to one already-created
  patient/enrollment, and exposes zero catalog/clinical data pre-auth. See §6 for the explicit non-overlap
  contract.

---

## 2. Data model — card before identity

No new concept is needed for "the card exists before the identity is verified" — `org_enrollments.status`
already models it (§1.6). This design's job is to **wire** it, not replace it.

### 2.1 Reused as-is

| Table | Role in this design |
|---|---|
| `platform_users` | Canonical global person. Created by staff with phone (+ optional name/email) at card-creation time, same as today's `createDoctorClient` (§1.2), just transactionally combined with the appointment/enrollment insert (§2.3). |
| `org_enrollments` | **The activation-state column.** `status = 'invited'` set at card-creation time (whether or not an invite link is ever actually sent — "card exists before portal activation" per #801 applies even with no invite at all). `status = 'active'` set exactly once, only by a successful redeem (phone OTP match, email OTP claim, or #806 token redeem — §3). `discharged`/`archived` unchanged, out of scope here. |
| `be_appointments` | Scheduled appointment only, with `platformUserId` set to the same canonical id created/resolved above. A walk-in is not a booking. |
| `clinical_visit` | Standalone walk-in visit with exact `organization_id`, `patient_user_id`, trusted creator and `canonical_appointment_id = NULL`. |
| `patient_merge_candidates` | The **single** duplicate-suspicion queue (§3 folds the email-collision case from `createDoctorClient` into this table instead of a hard 409). |
| `platform_user_contacts` | Records the delivery-channel value (phone/telegram/max/…) staff used to send the invite, with `source: 'doctor'` (already a valid enum value at `apps/webapp/db/schema/platformUserContacts.ts:49-55`) — audit trail of *how* it was sent, distinct from whether it was *proven*. |

### 2.2 New — `patient_invites` (modeled on `organization_member_invites`, §1.6)

```
patient_invites
  id                          uuid PK
  organization_id             uuid FK be_organizations       -- exact org, immutable
  patient_user_id             uuid FK platform_users          -- exact existing card, immutable
  enrollment_id               uuid FK org_enrollments         -- the row this invite will flip to 'active'
  token_hash                  text UNIQUE                     -- sha256(token + pepper), same shape as
                                                                -- organization_member_invites.token_hash /
                                                                -- user_email_setup_tokens.token_hash
  status                      text CHECK IN
                                ('pending','accepted','expired','revoked','superseded')
  created_by_platform_user_id uuid FK platform_users           -- attributed specialist/staff
  delivery_channel_hint       text NULL                        -- 'max'|'telegram'|'sms'|'other'|NULL;
                                                                -- display-only, NEVER authorizes anything
  expires_at                  timestamptz
  accepted_by_platform_user_id uuid NULL                       -- set on redeem; must equal patient_user_id
  accepted_via                text NULL CHECK IN ('phone_otp','email_otp','oauth')
  superseded_by_invite_id     uuid NULL FK patient_invites
  created_at / accepted_at / revoked_at   timestamptz
```

Why a new table instead of reusing one of the three existing token primitives — see §5 (explicit
reuse-rejection rationale per ENTRY_AND_INVITE_JOURNEYS.md's own instruction not to invent silently).

**UI target is the existing canonical route, not a new page.** Per §0.a, `TARGET_IA.md` §4 (:167) and
`SCREEN_COMPOSITION.md:44` already allocate `ORG-PUB-03` at `/join/[exchange]` as the one
shared "neutral exchange → org summary → recipient proof → relationship confirmation" surface for **both**
the existing staff org-invite and this new patient invite — `TARGET_IA.md:139`'s alias row
states patient portal-invite acceptance "continues through ORG-PUB-03/PUB-04" explicitly. Current code has
**no such unified route at all**: the only accept UI found is staff-specific
(`apps/webapp/src/app/api/clinic/invites/accept/{lookup,confirm}/route.ts`, §1.6), and no `/join/**` route
exists in the repo today (checked; absent). This is an additional gap beyond §1.6/§9: the redeem route this
design specifies should be built as (or under) `/join/[exchange]`, with `exchange` resolving server-side to
invite *kind* (staff org-invite vs. this patient invite vs., later, a public-booking continuation object)
before dispatching to the matching lookup/redeem pair — one shared entry shell, not a parallel
`/patient-invite/accept` tree, consistent with the repo's single-chokepoint convention and with
`IMPLEMENTATION_ROADMAP.md` §4's "no duplicate solo/clinic route trees" spirit applied to invite routes.

**RLS/grants, directly mirroring `deploy/postgres/organization-member-invites-rls.sql`:**

- Staff-side direct table policy: `FOR ALL USING (app.is_staff() AND organization_id =
  app.current_org_id())` — identical shape to the existing invite table's policy (§1.6 citation), so a
  specialist can only ever see/create/revoke invites for their own org.
- Pre-session (patient, unauthenticated) access is **only** through two narrow `SECURITY DEFINER` functions,
  owned by the same NOLOGIN/BYPASSRLS `app_owner` boundary already used for
  `app.lookup_pending_org_invite`/`app.accept_org_invite`:
  - `app.lookup_pending_patient_invite(token_hash)` → returns organization title/logo + masked recipient
    hint only (no `patient_user_id`, no card fields, no clinical data — enforces #806's "before
    authentication: no clinical data exposed" at the SQL layer, not just in the route).
  - `app.redeem_patient_invite(token_hash, authenticated_platform_user_id, accepted_via)` → row-locks
    (`FOR UPDATE`), re-checks `status = 'pending'` and `expires_at > now()`, flips `org_enrollments.status`
    to `'active'` (creating the row if #801's manual-creation path had left it absent — defensive, should
    not happen if §2.3 is followed), sets `patient_invites.status = 'accepted'`, `accepted_by_platform_user_id`,
    `accepted_via`, `accepted_at`, all in one transaction — the exact idempotent-mutation shape
    `app.accept_org_invite` already proves out (§1.6).
- No `GRANT SELECT/INSERT/UPDATE` on `patient_invites` to `app_patient` at all — same "no direct table
  grants to non-staff roles" property the existing file already has (§1.6, comment at
  `organization-member-invites-rls.sql:88-89`).

### 2.3 The atomic transaction implemented by #801

One new app-layer transaction, `createManualPatientVisit`, callable from both calendar-manual-appointment
and walk-in entry points:

1. Resolve-or-create `platform_users` by phone (reuse `resolveOrCreateDoctorClientByPhone`, §1.2) —
   **but** route the email-collision case to `patient_merge_candidates` instead of a hard 409 (§3).
2. Upsert `org_enrollments (organization_id, platform_user_id)` — `ON CONFLICT DO NOTHING` if already
   enrolled (idempotent, matches the unique pair constraint at `bookingEngine.ts:230`), else insert with
   `status = 'invited'`.
3. If a scheduled date/time was given: insert `be_appointments` via the existing `createAppointment` (§1.1),
   `platformUserId` = the resolved id, `source: 'staff_manual'` or similar.
4. If walk-in (no scheduled booking): insert a standalone exact-organization `clinical_visit` with the entered
   visit time and `canonical_appointment_id = NULL`. Do not invent booking duration/end time or create a completed
   `be_appointments` row. This is the owner-authoritative UX08-11 meaning of card + visit "без booking".
5. All four steps run in one DB transaction; a failure at step 3/4 rolls back the `org_enrollments` insert too
   (mirrors the existing rollback pattern in `appointments/manual/route.ts:154-172` for the Rubitime-sync
   failure case — same "don't leave a half-created relationship" discipline, just extended to enrollment).

This closes §1.1 exactly: "create a new patient + scheduled appointment" or "card + walk-in visit" becomes
one call, one transaction, and — new — one committed `org_enrollments` row where today none exists.

**Implementation closeout (2026-07-21).** Task `#801` landed in `feat/doctor-ui-rebuild` through `7c6537236`.
The command is idempotent across scheduled/walk-in kinds, rejects future walk-ins, preserves exact organization and
specialist authority, and exposes truthful `not_activated`/`linked` state without activating portal access. The
terminal independent audit and authenticated DEV desktop/mobile/API acceptance passed. A real two-connection
PostgreSQL race proof remains an explicit U3B milestone check, not an unproved claim of the unit harness.

---

## 3. Duplicate resolution strategy (reconciling §1.2/§1.4)

Single policy, replacing the two inconsistent ones found in the audit:

| Signal at card-creation time | Today (§1.2/§1.4) | Target (this design) |
|---|---|---|
| Phone matches an existing canonical `platform_users` row | Silent reuse, no flag, no review | **Unchanged** — silent reuse remains correct: phone is the strongest signal the codebase already trusts for this (§1.7), and forcing a review queue on every returning-patient phone match would make the common case slower for no safety gain. |
| Email matches a *different* existing canonical row than the one resolved by phone | Hard 409 `email_conflict`, creation blocked entirely | Card is still created/enrolled normally on the phone-resolved (or newly created) identity. The email collision is written to `patient_merge_candidates` (`reason: 'staff_create_email_collision'`, `anchorUserId`/`candidateUserId` = the two rows in conflict, `triggerAppointmentId` if a visit was created in the same call) as `status: 'pending'` for staff review — same table, same review UI surface already implied by `listPendingByOrganization` (§1.4). The card is **not** silently merged; the two identities stay distinct until a human resolves the candidate. |
| No phone/email at all (#806 no-contact-info path) | N/A (not currently possible — `phone` is a required field on `POST /api/doctor/clients`, §1.2) | New: card creation allows phone to be replaced by an org-scoped placeholder identity (see §3.1) specifically for the #806 flow. |

Rationale for softening the email path: #801/#806 both explicitly frame this domain around *recoverable,
audit-visible* states ("fail closed" for security-relevant redeem states, not for ordinary data-entry
friction). A hard 409 on a common front-desk mistake (typo'd email that happens to belong to another
record) blocks the whole card-creation instead of just flagging it — inconsistent with how the same product
already treats phone collisions. This does not touch #806's redeem-time fail-closed list in §4 at all,
which is deliberately strict because those are security/identity-proof states, not data-entry duplicates.

**Scope boundary on "same review UI surface" above:** this reuses the `patient_merge_candidates` **table**
only (org-scoped data layer, §1.4). It explicitly does **not** propose reusing
`apps/webapp/src/app/app/doctor/booking-merge/page.tsx` or
`apps/webapp/src/app/app/doctor/clients/name-match-hints/page.tsx` — `ROUTE_MIGRATION_MAP.md:65` (row S26)
already marks both "retire / reclassify before any reuse" and states any future correction "must use a
separately reviewed, authorized patient/specialist identity-resolution workflow." A staff-facing review
surface for the queue this design writes to is therefore a **separate, out-of-scope-here** design item
(carried into §10's checklist), not an extension of those two pages.

### 3.1 #806's "no phone/no email" card

`createDoctorClient`'s current hard `phone` requirement (§1.2, schema at
`apps/webapp/src/app/api/doctor/clients/route.ts:13`) must become optional specifically for this flow.
When neither phone nor email is supplied:

- `platform_users` row is created with `phone_normalized = NULL`, `email = NULL`, `display_name` = the
  staff-entered name/surname (already a field the route accepts, §1.2).
- **No** `patient_phone_trust_at` is set (§1.7 does not apply — there is no phone to trust).
- Because there is no phone/email to dedupe against, this card cannot be silently matched to any existing
  person at creation time. If the same person later gets a #806 invite redeemed with a phone/email that
  *does* match another existing canonical user, that collision surfaces at redeem time (§4, "conflicting
  identity" — fails closed, routed to `patient_merge_candidates` for staff, exactly like the routes in the
  table above but gated behind actual proof instead of typed input).

---

## 4. Invite token lifecycle + threat model (#806 requirements → design, verbatim mapping)

| #806 requirement (verbatim) | Design answer | Evidence/pattern reused |
|---|---|---|
| "Opaque high-entropy bearer token bound to exact organization + existing patient/enrollment" | `patient_invites.token_hash`, `organization_id`, `patient_user_id`, `enrollment_id` all immutable FKs set at issue time; token itself is `randomBytes(32).toString("base64url")` (256 bits) | `apps/webapp/src/modules/organization-invites/service.ts:16-21` (same generator), `apps/webapp/src/modules/auth/emailSetupTokens/tokenCrypto.ts:13-15` |
| "Before authentication: NO clinical data exposed" | `app.lookup_pending_patient_invite` (§2.2) returns only `organization_title`, `organization_logo_url`, masked recipient hint (if any contact on file) — no `patient_user_id`, no card/program/visit fields, at the SQL layer, not just filtered in the route | `app.lookup_pending_org_invite`, `organization-member-invites-rls.sql:116-153` |
| "User picks phone/email/OAuth; after successful auth, redeem atomically and exactly once" | `app.redeem_patient_invite` (§2.2) takes the *already-authenticated* canonical user id (proved via phone OTP / email OTP / OAuth **before** this call — the route calls the appropriate existing auth module first, then calls redeem) and row-locks + re-validates + flips state in one transaction | `app.accept_org_invite`, :158-293 (row lock, re-check, one transaction) |
| "Short-lived" | TTL constant, new module (e.g. `patientInvites/constants.ts`), proposed default 7 days matching `organization-invites`' `INVITE_TTL_MS` (owner has not set a different number; flag as engineering-policy default per ENTRY_AND_INVITE_JOURNEYS.md §13's own precedent of not escalating TTL numbers to the owner) | `organization-invites/service.ts:11` |
| "Revocable, single-use" | `status` transitions `pending → accepted / expired / revoked / superseded`; `revoked_at`/`accepted_at` columns; redeem only succeeds from `pending` | Same shape as `organization_member_invites.status` |
| "Hashed at rest" | `token_hash` only column; plaintext token never persisted, only returned once to the issuing staff session (same as `organization-invites createInvite` returning `{ ...result, token }` once, :49-51) | `organization-invites/service.ts:44-51` |
| "Never logged/analytics/referrer" | Route-level requirement: redeem endpoint must set `Referrer-Policy: no-referrer` and never pass the raw token to `console.log`/product-analytics event payloads — same rule ENTRY_AND_INVITE_JOURNEYS.md §11 already states for the staff-invite/booking-continuation flows; no existing violation found in the staff-invite accept routes read for this design (§1.6), so this is a "keep doing what's already done right," not a fix |  |
| "Removed from URL via server exchange+redirect" | Client-side entry page reads `?token=` once, immediately calls `lookup_pending_patient_invite` via `POST` body (not query string) and replaces the URL (`history.replaceState`/redirect) before rendering anything — same shape as `apps/webapp/src/app/api/clinic/invites/accept/lookup/route.ts:6-8` already taking the token in a POST body, not a GET query string | `clinic/invites/accept/lookup/route.ts` |
| "Audit issue/redeem/revoke/conflict" | Every `patient_invites` status transition is itself the audit record (append-only via `superseded_by_invite_id` chain on resend, matching ENTRY_AND_INVITE_JOURNEYS.md §3.1's "resend supersedes, does not overwrite"); `patient_merge_candidates` entries created for any redeem-time identity conflict (§3.1) are the audit trail for conflicts specifically |  |
| "Already-linked/expired/replayed/wrong-org/conflicting-identity all fail closed" | See table below — one row per case, each mapped to an explicit `redeem_patient_invite` return code, no ambiguous 200 |  |

### 4.1 Fail-closed matrix (redeem time)

| Case | `redeem_patient_invite` outcome |
|---|---|
| Token not found / malformed | `invalid_token`, no mutation |
| `status <> 'pending'` (already accepted) | `already_linked` if `accepted_by_platform_user_id` matches the authenticating user (idempotent reopen of the same relationship, no second mutation — same idempotency contract as `accept_org_invite`); otherwise `accepted_by_other` |
| `expires_at <= now()` | `expired_token`, marks row `expired` if still `pending` |
| `status = 'revoked'` | `revoked_token` |
| `status = 'superseded'` | `superseded_token`, response includes no hint about the newer token (staff must resend through the authenticated management UI, not the recipient) |
| Authenticated user's proven phone/email already belongs to a **different** existing `platform_users` row than `patient_invites.patient_user_id` | `conflicting_identity` — no mutation, write a `patient_merge_candidates` row (anchor = invite's `patient_user_id`, candidate = authenticated user's canonical id, `reason: 'invite_redeem_identity_conflict'`), route the user to the same neutral recovery copy ENTRY_AND_INVITE_JOURNEYS.md §11/J7 already specifies |
| Authenticating staff session's org does not match `organization_id` (should be structurally impossible since the function takes no org input from the caller, but re-checked for defense-in-depth) | `wrong_org` |
| Two concurrent redeem attempts | `FOR UPDATE` row lock — second waits, then re-reads `status`, returns `already_linked` (same convergence property proven for `accept_org_invite`, §1.6) |

---

## 5. Why not reuse an existing token table as-is (explicit, since §1.6 found three)

- **`organization_member_invites`** — shape is right (this design copies its RLS/SECURITY DEFINER pattern
  almost verbatim), but its rows are staff/membership-typed (`invited_role IN admin|doctor`,
  `be_organization_members` target). Repurposing it for patients would either weaken its staff-only RLS
  policy or require a polymorphic target — both worse than one small parallel table.
- **`user_email_setup_tokens`** — closest in *mechanism* (sha256+pepper, TTL, single-use, revocable), but
  its schema requires `email_normalized` **at issue time** (`apps/webapp/db/schema/userEmailSetupTokens.ts:10-11`)
  and is bound to a `userId` that already has that email as a claim target. #806's entire point is that
  *neither* phone nor email is known at issue time — channel is chosen by the patient at redeem time. Using
  this table would mean inventing a placeholder email, which is exactly the kind of "invent schema to fit"
  the mission brief says to avoid; a token bound to `(organization_id, patient_user_id)` instead of
  `(userId, email)` is the smaller, more honest change.
- **`email_challenges`** — an OTP *code* tied to one specific email for a proof-of-control step, not a
  copyable bearer link at all; wrong shape for "copy this link, send it any way you like."

---

## 6. Interaction with `/book/{publicSlug}` (#805) — explicitly separate, do not merge

Per the owner ruling (§1.9) and ENTRY_AND_INVITE_JOURNEYS.md J5 vs J3:

| | `/book/{publicSlug}` (#805) | Patient invite (#806) |
|---|---|---|
| Trigger | Anonymous visitor discovers a published org page | Staff-issued, for one specific already-existing patient |
| What's known before auth | Organization's published catalog (services/slots) | Nothing except org name/logo (§4 row 2) |
| Identity source of truth | Phone entered in the booking form (trusted per `PublicBookingByPhone`, §1.7 enum) | Whatever the user proves at redeem time (phone OTP/email OTP/OAuth), independent of any phone/email staff may or may not have on file |
| Organization resolution | Server-side slug → organization resolver (owner-ruling §1, this doc's §1.9) | `patient_invites.organization_id`, fixed at issue time, never derived from Host/slug/query |
| Enrollment effect | Target: booking transaction ensures `org_enrollments` (still an open implementation gap per ENTRY_AND_INVITE_JOURNEYS.md §9 — **shared** gap with this design, §1.6) | This design's `redeem_patient_invite` flips an *existing* `invited` enrollment to `active` |

**Shared chokepoint, not duplicated logic:** both flows ultimately need "ensure this canonical patient has
an active `org_enrollments` row for this organization." Per the repo's single-chokepoint convention
(`owner-prefers-single-chokepoint-no-dup`, cited in CLAUDE.md memory index), that upsert should be **one**
function (e.g. `ensureActiveEnrollment(organizationId, platformUserId)`) called from both
`redeem_patient_invite` (§2.2) and, separately, from whatever closes #805's own S6.4 enrollment gap — not
two copies of the same `ON CONFLICT` logic maintained independently. This design implements the function;
#805's implementation should call it, not re-derive it.

Public `/book/{publicSlug}` catalog reads and this invite's `lookup_pending_patient_invite` must remain on
fully separate routes/token namespaces — a `patient_invites` token must never be accepted by any `/book/*`
endpoint and vice versa, so a leaked booking-session artifact can never be replayed as an invite redeem or
vice versa.

---

## 7. Calendar/walk-in UX insertion points (reuse existing primitives, per doctor-ui-shared-primitives.mdc)

**Canonical-ID mapping first** (per §0.a/§0.c): `ROUTE_MIGRATION_MAP.md:42` (row S03) already assigns the
*current* `apps/webapp/src/app/app/doctor/patients/**` files to canonical `CLIN-02`/`CLIN-03`/`CLIN-04`/
`CLIN-08` — i.e. today's routes are the pre-migration instances of the same canonical screens, not a
separate thing this design invents. `TARGET_IA.md:218` (`CLIN-02`) and `SCREEN_COMPOSITION.md:90` already
say the target `/app/work/patients` screen itself carries "manual create card+scheduled/walk-in visit,
optional portal invite" — so the insertion points below attach to the *current* route tree now, and the
same components carry over under `CLIN-02`/`CLIN-03` once route migration (U10, a separate initiative) runs;
this design does not perform that route rename.

- **`apps/webapp/src/app/app/doctor/calendar/DoctorCalendarEventPanel.tsx`** — extend the existing
  `createPatient` state (:295,311-314) from `{ id, phone }` to also carry `{ firstName, lastName, email }`
  when the staff types a phone that does not resolve to an existing patient via search (the search
  combobox this panel already has for phone-based lookup is the right reuse point — do not add a second,
  parallel "new patient" modal). `onSubmit` (:321-368) calls the new atomic transaction (§2.3) instead of
  `appointments/manual` directly when a new patient is being created; keeps calling the existing
  `appointments/manual` route unchanged when `createPatient.id` already resolved to an existing user (no
  behavior change for the common case).
- **Walk-in entry point** — `apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabKarta.tsx`
  already has the `walk_in` mode (§1.3) but only inside an existing patient's card. #801's walk-in-for-a-
  brand-new-person needs a new entry point at the **client list / calendar toolbar level** (where
  `POST /api/doctor/clients`, §1.2, is presumably already invoked from — confirm exact caller UI component
  before implementation; not located in this pass, flagged as an implementation-time lookup, not a design
  gap), composed the same way: name/surname/phone/optional-email form → same atomic transaction (§2.3) with
  `startAt = now()` and no scheduled-time field shown.
- **Doctor UI canon** — both surfaces must follow `.cursor/rules/doctor-ui-shared-primitives.mdc`: reuse
  `Dialog` width/shell conventions already in the style guide, no bespoke card/empty-state components. The
  "portal status" badge on a patient's card (`not activated / invited / linked`, per
  ENTRY_AND_INVITE_JOURNEYS.md §7 UI list item 2) is a straightforward read of `org_enrollments.status`
  (§1.6) and belongs in the existing patient-card chrome
  (`apps/webapp/src/app/app/doctor/clients/doctorClientCardChrome.ts`), not a new card type.
- **Invite copy-link affordance (#806)** — a "Скопировать ссылку-приглашение" action next to the existing
  optional-email invite affordance already implied by `emailSetupEnqueued` in the `/api/doctor/clients`
  response (§1.2) — same screen, additional action, not a separate page.

---

## 8. Tenant-wall safety summary

- New `patient_invites` table: staff-side RLS policy identical in shape to
  `organization_member_invites` (§2.2) — org-scoped, `app_staff` only, direct grants.
- Pre-session redeem: `app_patient`/bootstrap role gets `EXECUTE` on the two SECURITY DEFINER functions
  only, **zero** table grants — matches §1.8/§1.6 exactly.
- `org_enrollments` write path (§2.3, §4): both the manual-creation transaction and the redeem function run
  under a **staff** or **owner-boundary** principal respectively, never under a raw `app_patient` table
  write — consistent with "the only DB wall a patient session has is *own-row-only*"; a patient session
  never gets a direct `UPDATE org_enrollments` grant, it only ever reaches that row through the narrow
  function.
- No new cross-organization read surface is introduced anywhere in this design. `lookup_pending_patient_invite`
  returns organization branding fields, which are already the pre-auth-safe fields the staff invite/public
  booking previews use (§1.6, §1.9) — not a new disclosure.

### 8.1 Explicit check against U3B's `Forbidden`/`Boundaries` lines (`IMPLEMENTATION_ROADMAP.md:465-468`)

| U3B forbids/bounds | This design |
|---|---|
| "SMS elevation, SMS-created identity/invite" | Not touched — §2/§4 have no SMS path; SMS fallback is explicitly out of scope here (only #801/#806, not J4) |
| "full recipient pre-auth" | `lookup_pending_patient_invite` returns branding + masked hint only (§4 row 2) |
| "internal `userId` authority" | Redeem takes the *authenticated* canonical id from the auth module's session result, never a client-supplied id (§2.2/§4) |
| "auto-push prompt before value" | Not touched — out of scope |
| "duplicate identity" | §3/§4.1 route every duplicate signal to `patient_merge_candidates`, never a silent merge |
| "silent org switch" | `patient_invites.organization_id` is immutable at issue time and re-checked at redeem (`wrong_org`, §4.1); nothing here changes a patient's active organization outside the one being redeemed |
| "real sends outside approved send-safe setup" | Delivery of the invite link itself (§7's copy-link affordance) is staff-copy-paste, not a platform send; §10 does not add a new automated send channel |
| Boundary: "invite/booking/object is trusted org source; canonical patient is global; enrollment and every care object remain org-scoped" | §2.2/§8 match exactly — `organization_id`/`patient_user_id` fixed at issue time, `org_enrollments` stays the org-scoped join |

---

## 9. Contradictions found (collected — see §1 for full evidence)

1. **`org_enrollments` is schema-complete but write-dead** (§1.6) — the single largest finding; every other
   piece of this design routes through fixing this, not around it.
2. **Calendar manual-appointment route and patient-card-create route are two disconnected transactions**
   (§1.1/§1.2) — #801 requires them to be one.
3. **Walk-in exists only for already-known patients** (§1.3) — #801's walk-in is for brand-new people.
4. **Inconsistent duplicate-collision severity**: silent phone reuse vs hard email 409 vs soft
   `patient_merge_candidates` queue, three different policies for the same underlying question (§1.4, §3).
5. **Three incompatible existing token primitives**, none fitting #806's "no phone/email known at issue
   time" requirement without schema changes that would themselves be worse than a small new table (§1.6,
   §5).
6. **Staff-entered phone is granted `patient_phone_trust_at` immediately, silently, with no audit event or
   enrollment-state transition** (§1.7) — not necessarily wrong, but currently invisible, and in tension
   with the "invite delivery is not proof of identity" principle if read narrowly.
7. **Messenger channel-binding auto-resolution (`identityResolutionPort.ts`) is not reconciled with invite
   redemption** (§1.5) — a patient opening a #806 link inside a MAX/Telegram Mini App could hit ambient
   identity resolution before the deliberate redeem chooser runs; needs an explicit precedence decision at
   implementation time (redeem-in-progress state must suppress/defer ambient channel-binding auto-login,
   not race it).
8. **`POST /api/doctor/clients` requires phone** (§1.2, route.ts:13) — must become optional for #806's
   no-contact-info card; this is a route/schema change this design specifies but does not itself perform.
9. **Public-booking enrollment gap (#805/J5) and this design's enrollment gap are the same underlying gap**
   — should be fixed via one shared `ensureActiveEnrollment` function (§6), not two independent patches
   landing from two different card streams.
10. **No unified `/join/[exchange]` route exists in code** (§2.2) — the canonical `ORG-PUB-03` target the UX
    package already allocates for this exact redeem step is unbuilt; only a staff-org-invite-specific accept
    UI exists today (§1.6). Building #806's redeem screen as a parallel one-off route instead of under
    `/join/[exchange]` would itself create the kind of duplicate route tree the roadmap forbids
    (`IMPLEMENTATION_ROADMAP.md` §4).
11. **Existing merge/name-match staff UI is marked for retirement, not extension** (`ROUTE_MIGRATION_MAP.md:65`,
    row S26) — this design's reuse of `patient_merge_candidates` is data-layer only (§3); no current UI page
    is a valid attachment point for the review surface #801/#806 need.

---

## 10. Phased implementation checklist

- [ ] Confirm U1 (capability guard spine) and U5A (patient organization resolver) are complete per their own
      `Completion` criteria before starting the items below — this checklist is U3B's data/API contract, not
      a license to jump the dependency order (§0.c).
- [ ] Add `org_enrollments` write path: `ensureActiveEnrollment(organizationId, platformUserId, status)`
      helper (single chokepoint, §6), called from the manual-creation transaction (§2.3).
- [ ] Build `createManualPatientVisit` atomic transaction (§2.3): resolve-or-create patient (reusing
      `resolveOrCreateDoctorClientByPhone`, §1.2) → `ensureActiveEnrollment(..., 'invited')` →
      appointment-or-walk-in insert, one DB transaction, rollback-on-partial-failure.
- [ ] Fold the email-collision hard-409 in `createDoctorClient`/`resolveOrCreateDoctorClientByPhone`
      (§1.2) into a `patient_merge_candidates` insert instead (§3), keep phone-match silent-reuse
      unchanged.
- [ ] Make `phone` optional on `POST /api/doctor/clients` body schema (route.ts:13) and on
      `createDoctorClient`'s input type, gated to the explicit #806 "no contact info" path (§3.1); keep the
      RU-phone-format validation for the case where a phone *is* supplied (format flexibility beyond
      `+7\d{10}` is a separate, out-of-scope i18n item — flag, do not silently expand here).
- [ ] Extend `DoctorCalendarEventPanel.tsx`'s create form (§7) with name/surname/email fields, wired to
      `createManualPatientVisit` when no existing patient was resolved by phone search.
- [ ] Add a walk-in-for-new-patient entry point at the client-list/calendar-toolbar level (§7), reusing the
      same atomic transaction with `startAt = now()`.
- [ ] Add `patient_invites` table + migration (§2.2), RLS policy mirrored from
      `organization-member-invites-rls.sql`, owned by the same `app_owner` NOLOGIN/BYPASSRLS boundary.
- [ ] Add `app.lookup_pending_patient_invite` / `app.redeem_patient_invite` SECURITY DEFINER functions
      (§2.2/§4), `EXECUTE`-only grants to `app_patient`.
- [ ] Add invite-issue service (`patientInvites/service.ts`), token crypto module mirroring
      `emailSetupTokens/tokenCrypto.ts` shape (own pepper/prefix, e.g. `pin_`), TTL constant.
- [ ] Build/extend the shared `/join/[exchange]` route (`ORG-PUB-03`, §2.2/§9 item 10) to dispatch by invite
      kind server-side; wire the patient-invite lookup/redeem pair into it rather than a parallel route tree.
      Raw token in POST body only, immediate URL scrub/redirect (`Referrer-Policy: no-referrer`), calls the
      appropriate existing auth module (phone OTP / email OTP / OAuth) to *prove* identity first, then calls
      `redeem_patient_invite` with the authenticated canonical id (never trusting a client-supplied id).
- [ ] Add "portal status" badge (`not activated / invited / linked`, §7) to the existing patient-card chrome
      reading `org_enrollments.status`.
- [ ] Add copy-invite-link staff action next to the existing optional-email affordance (§7).
- [ ] Scope (separately from this checklist) a staff-facing review surface for the
      `patient_merge_candidates` queue this design writes to — not an extension of
      `doctor/booking-merge`/`doctor/clients/name-match-hints`, which `ROUTE_MIGRATION_MAP.md` marks for
      retirement (§3, §9 item 11).
- [ ] Reconcile messenger channel-binding auto-resolution vs invite redeem precedence (§9 item 7) —
      explicit decision + guard before the invite-redeem route can be considered complete.
- [ ] Verify/implement the shared `ensureActiveEnrollment` call from #805's own booking-transaction
      enrollment gap (§6) so the two initiatives do not each patch it independently.
- [ ] RLS/tenant-wall smoke: confirm `patient_invites` gets no direct `app_patient` table grant, only
      function `EXECUTE`; confirm redeem cannot be driven cross-org (fail-closed matrix, §4.1).
- [ ] Update `docs/ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md` §8 with the new
      `patient_invites` redeem path once implemented (keeps the trusted-sources map in that doc current,
      per its own stated purpose).

---

## NOT DONE (by this design pass)

- No schema, migration, route, or UI code was written or changed — this is a docs-only design per the
  mission scope; the checklist in §10 is unexecuted.
- Exact caller UI for `POST /api/doctor/clients` (which screen currently invokes patient-card creation
  today) was not located in this pass — flagged in §7 as an implementation-time lookup.
- TTL value for `patient_invites` (proposed 7 days, matching `organization-invites`) is an engineering
  default, not owner-confirmed; flagged consistently with how ENTRY_AND_INVITE_JOURNEYS.md §13 already
  treats analogous TTL numbers as configuration, not a new owner gate — but noting it explicitly here so
  it isn't silently asserted as ruled.
- The precedence conflict between messenger channel-binding auto-resolution and invite redemption (§9
  item 7 / §10 second-to-last item) is identified but not resolved — needs an implementation-time decision,
  potentially a security-relevant one, before #806 can be called complete.
- Whether `patient_phone_trust_at` being granted at staff-card-creation time (§1.7) should itself change
  (e.g., require a lighter proof before trust) is explicitly out of scope for this design — flagged as a
  narrower related question, not decided here.
- i18n/format flexibility for non-RU phone numbers on the patient-create path is out of scope (flagged in
  §10, not designed).
- This pass did **not** re-verify whether `IMPLEMENTATION_ROADMAP.md` stages U1/U5A/U3S are actually complete
  in the current branch — §0.c states the dependency constraint but does not check it; the first checklist
  item in §10 is a gate, not a confirmation.
- A staff-facing review UI for the `patient_merge_candidates` entries this design starts writing (§3) is
  named as needed but not designed here — scoped out per §9 item 11/§10's last item.
