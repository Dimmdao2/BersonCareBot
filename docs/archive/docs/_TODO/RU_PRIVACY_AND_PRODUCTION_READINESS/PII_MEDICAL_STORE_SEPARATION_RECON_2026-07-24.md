# Recon — storing ФИО / contacts / medical data separately (2026-07-24)

> **RECON ONLY** (owner asked to scope complexity, not build). Feeds the decision in
> [`INFRASTRUCTURE_SECURITY_PLAN.md`](../INFRASTRUCTURE_SECURITY_PLAN.md); field-level encryption remains deferred
> behind the data/key decision and is not implied by S3 encryption. Full worker detail: session scratchpad
> `db-pii-medical-separation-recon.md`. Cross-link: CRYPTO-01 §C4.

## Current state (PROVEN)

- **No depersonalization boundary exists today.** `public.platform_users` (`apps/webapp/db/schema/schema.ts:53-114`)
  co-locates ФИО (`display_name/first_name/last_name/patronymic`), DOB, gender **AND** `height_cm/weight_kg`
  (arguably medical) in ONE row.
- **Contacts are already mostly separated** into side-tables FK'd to `platform_users.id`:
  `platform_user_contacts`, `user_phone_history`, `user_channel_bindings`.
- **~12+ medical tables** (`clinical_visit`, `clinical_diagnosis*`, `patient_comorbidity`, `clinical_anamnesis_*`,
  `patient_files`, `patient_diary_day_snapshots`, LFK/treatment-program tables) all key directly off the same
  `platform_users.id`.

## Coupling / blast radius (PROVEN + inferred floor)

- Single linking key everywhere: `platform_users.id`. 46 backend files touch medical tables; 29 explicit joins to
  `platform_users` across 17 files; the doctor patient-card API is a dozen+ sibling routes all keyed by `[userId]`.
- Rough floor for pseudonymization: **~40–50 backend files** would need touching.
- Track D's identity write (`writeIdentityAndPreferencesDirect.ts`) writes ФИО straight into `platform_users` from
  the integrator — any separation design must decide where that write lands.

## Options × complexity (described, not chosen)

| Option                                                                                                            | Effort   | Defends against                       | Fit with current direction                                                                                      |
| ----------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| (a) Same-DB **separate schema** + RLS/grant separation                                                            | **M**    | schema-level access separation        | Compatible with unified-Postgres                                                                                |
| (b) **Separate DB instance** + app-level join                                                                     | **XL**   | full physical store breach separation | **CONFLICTS** with the unified single-Postgres direction (which was a recent consolidation _away_ from two DBs) |
| (c) **Encryption-at-rest w/ separated key custody**, tables stay together                                         | **M–L**  | at-rest / key-holder breach           | ≈ what CRYPTO-01 §C4 already plans                                                                              |
| (d) **Pseudonymization / tokenization** (medical keyed by opaque token, identity map in a separate guarded store) | **L–XL** | medical-store-only breach (strongest) | breaks search/join ergonomics; needs Track D identity-write updated                                             |

## ⛔ OWNER DECISION 2026-07-24 — DEFERRED

Store-separation is **deferred** (not in first-launch scope). Rationale confirmed with owner: full pseudonymization
touches ~40–50 backend files + breaks search/join ergonomics; even a separate schema is M-effort and rubs against
the unified-Postgres direction. The **encryption angle is already covered by CRYPTO-01** (field-level encryption) —
picked up when 152-ФЗ work lands. Optional tiny cleanup (move `height_cm`/`weight_kg` out of the `platform_users`
identity row) can happen anytime cheaply but is also not urgent. **No store-separation build now.**

## OWNER CLARIFICATION 2026-08-11 — A now, preserve transition to I

The current DB privilege rebuild uses **variant A**: an attested webapp pre-session transaction may call only exact
identity/authentication seams before a human principal exists. This is a port-access decision, not
depersonalization: medical and identity data remain linked as described above.

**Variant I** is the future pseudonymization direction: medical rows use an opaque subject id and the identifying
mapping lives behind a separate identity boundary. Its data migration remains deferred under the 2026-07-24
decision; it is not added to the current RLS rebuild. The current build must preserve the migration seam:

- port attestation is independent from human identity attestation;
- the accepted context is versioned and separates actor, subject and organization fields;
- pre-session identity resolution has its own named seam;
- no port proof depends cryptographically on the physical `platform_users.id`;
- a future resolver can translate identity → opaque subject without replacing challenge-response, transaction
  binding, role graph or the RLS context gate.

Therefore A → I is an incremental identity/data migration, not a rewrite of the port security boundary. This
compatibility requirement belongs to `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md` Ф3б-A10; actual pseudonymization remains
in the privacy initiative and requires its own later owner-approved rollout.

## Bottom line (recon)

- First-order cleanup independent of any option: `height_cm/weight_kg` (measurements) sitting in the identity row
  `platform_users` is the sharpest "identity+health co-located" smell.
- (b) separate physical DB fights the unified-Postgres direction the owner just reaffirmed — likely off the table.
- (a) separate schema and (c) key-separated encryption are the paths that fit the architecture; (c) largely overlaps
  the existing CRYPTO-01 plan. (d) is the strongest legal-grade control but the most invasive.
- **Current decision:** no store-separation build now; variant A is implemented by the DB privilege work while
  preserving the seam for future variant I. The exact pseudonymization/store control level remains a later
  CRYPTO-01 / RU-privacy owner decision.
