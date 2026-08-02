# V9b S03 — DEV booking ownership census audit

Date: 2026-08-02

## Scope and command boundary

This is the owner-authorised, privileged aggregate-only DEV census recorded before S03. It ran in
`BEGIN READ ONLY`; no migration, DDL/DML, seed, restart, or TEST/PROD action was performed.
The worker brief supplies the resulting aggregates and explicitly prohibits repeating or applying
the migration to DEV/TEST. The original evidence did not preserve a reusable shell invocation, so
this worker has not invented or rerun one.

## Aggregate result

| Target | Exact live canonical parent | Exact soft-deleted canonical parent | No immutable tenant key | Ambiguous / user / provider / mapping-org contradiction |
| --- | ---: | ---: | ---: | ---: |
| `patient_bookings` | 27 | 17 | 219 | 0 |
| `appointment_records` | 316 | 80 | 14 | 0 |
| **total** | **343** | **97** | **233** | **0** |

All **440** exact-parent rows have a provable canonical organization. Soft deletion does not erase
that immutable ownership proof, so S03 stamps both live and soft-deleted exact parents.

The remaining **233** rows have no immutable tenant key and remain `organization_id = NULL`.
They receive no default organization and are not inferred from membership, phone, snapshots,
timeslots, current clinic, deletion state, or a new ownership table. They are not deleted,
quarantined, or otherwise hidden to make the census green.

Of the 219 unresolved `patient_bookings`, 195 retain a patient owner (6 upcoming and 189 history
by the existing shapes); 24 have no patient principal. The 14 unresolved
`appointment_records` are cancelled and soft-deleted.

## S03 decision

`0309_v9b_booking_ownership_local.sql` is an expand migration:

- it adds nullable `organization_id`, FK, and index to both retained projections;
- it stamps only an exactly resolved canonical parent, including soft-deleted parents;
- it preserves zero-match historical rows as NULL;
- it rolls back the whole migration only for an ambiguity/mapping-org contradiction, user mismatch,
  or provider mismatch; and
- it is idempotent on rerun.

The existing `app.read_current_patient_booking_rows` capability remains the sole patient reader.
A signed, actively enrolled patient may self-read their NULL-org historical booking row, but receives
no canonical in-person context/navigation from it; another patient and a connection without a
principal receive no such row.

## Later policy boundary (not S03)

S04/S05 adoption, direct-grant revoke, RLS, and FORCE remain open. After the S04 adoption/revoke:

- staff policy must match a non-NULL `organization_id` to `app.current_org_id()`;
- patient policy is self-read; and
- INSERT/UPDATE/DELETE require a non-NULL organization.

Historical NULL rows are never assigned by guess.
