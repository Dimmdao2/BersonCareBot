# V9b S03 — DEV booking ownership census audit

Date: 2026-08-02
Scope: one read-only classification of DEV before any S03 reconcile. No migration, DDL/DML, seed,
restart, or production/test access was performed.

## Verdict

`BLOCKED_BY_UNPROVABLE_DATA`.

The blocker is not a choice of default clinic. At least **219** `patient_bookings` have no
`canonical_appointment_id`; **195** of them retain a patient owner and **152** are in an active
booking lifecycle status. Thus the immutable relationship that would carry an organization was
never recorded. Assigning an organization from membership, snapshots, phone, or a one-clinic
assumption would mix tenants.

There is a second reachable class: **11** non-native `appointment_records` satisfy the live
`bookings.forUser` reader predicate. The remaining **397** non-native records cannot be classified
as retired archive: the current integrator still exposes exact-id lookup of `appointment_records`.

`0309` must continue to abort; it must not be applied or landed as `NOT NULL` against this DEV
state. The 673-row total is unchanged from the reported census.

## Read-only execution and RLS context

The worktree has no ignored `apps/webapp/.env.dev`; the canonical DEV file is the same path in the
primary worktree. It was sourced without printing its contents. Every database command used:

```bash
set -a
source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev
set +a
PGOPTIONS='-c default_transaction_read_only=on' psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -P pager=off
```

The following read-only transaction established that the query is not mistaking an RLS-hidden
zero for an empty canonical table:

```sql
BEGIN READ ONLY;
SELECT current_database(), session_user, current_user,
       current_setting('transaction_read_only');
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
       has_table_privilege(current_user, format('public.%I', c.relname), 'SELECT'),
       c.reltuples::bigint
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('patient_bookings','appointment_records','be_appointments',
                    'be_external_entity_mappings')
ORDER BY c.relname;
COMMIT;
```

Result: database `bcb_webapp_dev`; `session_user=current_user=bcb_webapp_dev_user`;
`transaction_read_only=on`. `patient_bookings` and `appointment_records` are not RLS-protected
and have exact planner counts **263** and **410**. Both canonical parents are `ENABLE + FORCE RLS`;
their planner counts are respectively **384** and **408**, while a no-principal `SELECT count(*)`
returns 0 for each. The live policy requires a staff organization principal (and, for appointments,
may alternatively permit the matching patient principal); this login is neither `app_staff` nor
`app_worker`.

Consequently, the RLS-visible result below means "no proof available to the `0309` classifier under
this login", not "the canonical tables are empty". No principal was fabricated and no policy was
weakened.

## Reproduced five-reason census

DEV has not received `0309`, so neither target table has `organization_id`. The migration's exact
`WHERE organization_id IS NULL` target filter cannot be parsed on this schema. The census used the
unchanged `candidate_signals`/`candidate_summary`/`resolved`/`provider_checks`/`classified` CTE from
[`0309_v9b_booking_ownership_local.sql`](../../../../apps/webapp/db/drizzle-migrations/0309_v9b_booking_ownership_local.sql),
with only the two target filters omitted (all current rows are pre-stamp targets), then ran:

```sql
BEGIN READ ONLY;
WITH targets AS (
  SELECT 'patient_bookings'::text AS target_table, pb.id AS row_id,
         pb.platform_user_id AS row_user_id, NULL::text AS integrator_record_id,
         '{}'::jsonb AS payload_json, pb.canonical_appointment_id AS direct_appointment_id
  FROM public.patient_bookings pb
  UNION ALL
  SELECT 'appointment_records', ar.id, ar.platform_user_id, ar.integrator_record_id,
         ar.payload_json, NULL::uuid
  FROM public.appointment_records ar
),
candidate_signals AS (
  SELECT t.target_table,t.row_id,a.id appointment_id,a.organization_id proof_org,a.organization_id parent_org
  FROM targets t JOIN public.be_appointments a ON t.target_table='patient_bookings' AND a.id=t.direct_appointment_id
  UNION ALL SELECT t.target_table,t.row_id,a.id,a.organization_id,a.organization_id
  FROM targets t JOIN public.be_appointments a ON t.target_table='appointment_records'
    AND t.integrator_record_id ~ '^be:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND a.id=substring(t.integrator_record_id FROM 4)::uuid
  UNION ALL SELECT t.target_table,t.row_id,a.id,a.organization_id,a.organization_id
  FROM targets t JOIN public.be_appointments a ON t.target_table='appointment_records'
    AND coalesce(t.payload_json->>'appointment_id','') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND a.id=(t.payload_json->>'appointment_id')::uuid
  UNION ALL SELECT t.target_table,t.row_id,a.id,m.organization_id,a.organization_id
  FROM targets t JOIN public.be_external_entity_mappings m ON t.target_table='appointment_records'
    AND m.external_system='rubitime' AND m.entity_type='appointment' AND m.external_id=t.integrator_record_id
  JOIN public.be_appointments a ON a.id=m.canonical_id
), summary AS (
  SELECT t.target_table,t.row_id,count(DISTINCT c.appointment_id)::int match_count,
         count(DISTINCT c.proof_org)::int proof_org_count,
         coalesce(bool_or(c.proof_org IS DISTINCT FROM c.parent_org),false) mapping_org_mismatch,
         min(c.appointment_id::text)::uuid appointment_id
  FROM targets t LEFT JOIN candidate_signals c USING(target_table,row_id)
  GROUP BY t.target_table,t.row_id
), resolved AS (
  SELECT t.*,s.match_count,s.proof_org_count,s.mapping_org_mismatch,a.organization_id matched_org,
         a.platform_user_id matched_user,a.specialist_id matched_specialist,a.deleted_at matched_deleted,
         nullif(btrim(t.payload_json->>'platform_user_id'),'') payload_user_raw,
         CASE WHEN nullif(btrim(t.payload_json->>'platform_user_id'),'') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN (t.payload_json->>'platform_user_id')::uuid END payload_user,
         CASE WHEN coalesce(t.payload_json->>'source','')='native' OR coalesce(t.integrator_record_id,'') LIKE 'be:%' THEN nullif(btrim(t.payload_json->>'specialist_id'),'') END canonical_provider_raw,
         CASE WHEN (coalesce(t.payload_json->>'source','')='native' OR coalesce(t.integrator_record_id,'') LIKE 'be:%') AND nullif(btrim(t.payload_json->>'specialist_id'),'') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN (t.payload_json->>'specialist_id')::uuid END canonical_provider,
         CASE WHEN coalesce(t.payload_json->>'source','')<>'native' AND coalesce(t.integrator_record_id,'') NOT LIKE 'be:%' THEN nullif(btrim(coalesce(t.payload_json->>'cooperator_id',t.payload_json->>'rubitime_cooperator_id',t.payload_json->>'specialist_id')),'') END external_provider_raw
  FROM targets t JOIN summary s USING(target_table,row_id) LEFT JOIN public.be_appointments a ON a.id=s.appointment_id
), providers AS (
  SELECT r.*,CASE WHEN r.external_provider_raw IS NULL THEN 0 ELSE count(DISTINCT m.canonical_id)::int END external_provider_count,
         min(m.canonical_id::text)::uuid external_provider,
         coalesce(bool_or(m.organization_id IS DISTINCT FROM r.matched_org),false) external_provider_org_mismatch
  FROM resolved r LEFT JOIN public.be_external_entity_mappings m ON r.external_provider_raw IS NOT NULL
    AND m.external_system='rubitime' AND m.entity_type='specialist' AND m.external_id=r.external_provider_raw
  GROUP BY r.target_table,r.row_id,r.row_user_id,r.integrator_record_id,r.payload_json,r.direct_appointment_id,r.match_count,r.proof_org_count,r.mapping_org_mismatch,r.matched_org,r.matched_user,r.matched_specialist,r.matched_deleted,r.payload_user_raw,r.payload_user,r.canonical_provider_raw,r.canonical_provider,r.external_provider_raw
), classified AS (
  SELECT p.*,CASE
    WHEN p.match_count=0 THEN 'zero_match'
    WHEN p.match_count<>1 OR p.proof_org_count<>1 OR p.mapping_org_mismatch THEN 'multiple_match'
    WHEN p.matched_deleted IS NOT NULL THEN 'deleted_parent'
    WHEN (p.row_user_id IS NOT NULL AND p.matched_user IS NOT NULL AND p.row_user_id<>p.matched_user)
      OR (p.payload_user_raw IS NOT NULL AND p.payload_user IS NULL)
      OR (p.payload_user IS NOT NULL AND p.matched_user IS NOT NULL AND p.payload_user<>p.matched_user)
      OR (p.payload_user IS NOT NULL AND p.row_user_id IS NOT NULL AND p.payload_user<>p.row_user_id) THEN 'user_mismatch'
    WHEN p.canonical_provider_raw IS NOT NULL AND (p.canonical_provider IS NULL OR p.matched_specialist IS NULL OR p.canonical_provider<>p.matched_specialist) THEN 'provider_mismatch'
    WHEN p.external_provider_raw IS NOT NULL AND (p.external_provider_count<>1 OR p.external_provider IS DISTINCT FROM p.matched_specialist OR p.external_provider_org_mismatch) THEN 'provider_mismatch'
    ELSE NULL END reason
  FROM providers p
)
SELECT target_table, coalesce(reason, 'stamped') AS reason, count(*) AS row_count
FROM classified
GROUP BY target_table, reason
ORDER BY target_table, reason;
COMMIT;
```

The executable command was the env prefix above plus this exact read-only SQL; it returned only
aggregate table/reason/count columns; no data-selection or classification rule changed.

| Reason | `patient_bookings` | `appointment_records` | Total |
| --- | ---: | ---: | ---: |
| `zero_match` | 263 | 410 | 673 |
| `multiple_match` | 0 | 0 | 0 |
| `deleted_parent` | 0 | 0 | 0 |
| `user_mismatch` | 0 | 0 | 0 |
| `provider_mismatch` | 0 | 0 | 0 |
| **sum** | **263** | **410** | **673** |

This is the migration-visible five-reason result for the pre-0309 state. Its 673 `zero_match`
rows are not evidence that canonical parent/mapping tables are empty, because of the documented
RLS context above.

## Further decomposition commands and results

The following aggregate-only query was run in the same explicit read-only transaction. It contains
no names, phones, email, raw ids, payloads, or connection data.

```sql
BEGIN READ ONLY;
SELECT
  count(*) FILTER (WHERE canonical_appointment_id IS NULL) AS patient_bookings_without_canonical_id,
  count(*) FILTER (WHERE canonical_appointment_id IS NOT NULL) AS patient_bookings_with_canonical_id,
  count(*) AS patient_bookings_total
FROM public.patient_bookings;

SELECT
  count(*) FILTER (WHERE integrator_record_id ~ '^be:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') AS native_id_shape,
  count(*) FILTER (WHERE NOT (integrator_record_id ~ '^be:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')) AS non_native_id_shape,
  count(*) FILTER (WHERE coalesce(payload_json->>'appointment_id','') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') AS payload_uuid_shape,
  count(*) FILTER (WHERE status IN ('created','updated') AND deleted_at IS NULL
                    AND (record_at IS NULL OR record_at >= now())) AS active_by_user_reader_eligible,
  count(*) AS appointment_records_total
FROM public.appointment_records;

SELECT
  count(*) FILTER (WHERE canonical_appointment_id IS NULL AND platform_user_id IS NOT NULL) AS no_canonical_key_with_patient_owner,
  count(*) FILTER (WHERE canonical_appointment_id IS NULL AND platform_user_id IS NULL) AS no_canonical_key_without_patient_owner,
  count(*) FILTER (WHERE canonical_appointment_id IS NULL AND status IN ('creating','awaiting_payment','confirmed','rescheduled','cancelling','cancel_failed')) AS no_canonical_key_active_lifecycle_status,
  count(*) FILTER (WHERE canonical_appointment_id IS NOT NULL AND platform_user_id IS NOT NULL) AS canonical_key_with_patient_owner
FROM public.patient_bookings;
COMMIT;
```

Results:

| Aggregate | Count |
| --- | ---: |
| `patient_bookings` without canonical id | 219 |
| `patient_bookings` with canonical id | 44 |
| `appointment_records` native `be:<uuid>` id shape | 2 |
| `appointment_records` non-native id shape | 408 |
| `appointment_records` with UUID-shaped payload `appointment_id` | 7 |
| `appointment_records` eligible for active-by-user reader | 11 |
| no-canonical booking with `platform_user_id` | 195 |
| no-canonical booking in active lifecycle status | 152 |

## Classification and minimum reconcile action

| Class | Deterministic relation actually present | Minimum reconcile action | Cross-org protection |
| --- | --- | --- | --- |
| 219 `patient_bookings` without `canonical_appointment_id` | None to a canonical appointment. Snapshots/catalog ids are legacy compatibility fields; 195 retain patient ids and 152 are active. | Keep unresolved and abort. No row-level stamping action exists. | Never derive from patient membership, phone, branch/service snapshot, current clinic, or cardinality. |
| 44 `patient_bookings` with `canonical_appointment_id` | Immutable canonical id is retained, but its parent/org cannot be observed by the permitted no-principal DEV role because `be_appointments` is FORCE RLS. | A later read-only migration-role census may classify this exact key as one canonical parent, deleted parent, or dangling. Do not stamp until then. | Accept only one parent appointment with its declared `organization_id` and matching patient owner; otherwise preserve abort. |
| 2 native `appointment_records` (`be:<uuid>`) | Immutable canonical id is retained; it is likewise RLS-hidden from this census role. | Same bounded migration-role read-only classification; do not infer from payload or user. | Require exactly one canonical appointment, matching user/provider assertions, and its declared organization. |
| 11 non-native `appointment_records` active in `bookings.forUser` | No native id. An external mapping could be proof only if the existing immutable mapping resolves exactly once; RLS prevents proving that here. | Classify through the existing mapping under the migration role; if absent/ambiguous, preserve abort. | Only `be_external_entity_mappings(external_system='rubitime', entity_type='appointment')` → exactly one canonical appointment is admissible. |
| 397 other non-native `appointment_records` | Same missing native key. They are not returned by the active list now, but exact-id reader remains live. | Do not declare archive/dead or delete; use the same mapping-only classification. | Same exact mapping rule; no retention/default/membership inference. |

## Writer/read-path decision

Current writers are canonical: `canonicalCreate.ts` passes an already-resolved `organizationId` into
`CreatePendingPatientBookingInput`; `projectCanonicalAppointment.ts` writes `be:<appointment-id>`,
the canonical appointment id in payload, and `BeAppointment.organizationId` for all create,
reschedule, cancel, and no-show projection writes. `pgAppointmentProjection.ts` rejects an upsert
that would change an existing projection's organization.

This does not rescue historical rows. `patient_bookings` remains a historical projection and its
patient page calls `listMyBookings`; rows without a canonical appointment cannot offer canonical
actions but may still be displayed. The accepted R2 retirement evidence removed doctor and patient
UI reads from old provider projections, but current code still routes integrator
`bookings.forUser` through `booking.activeByUser` to `appointment_records`, and retains exact-id
`booking.recordByExternalId`. Therefore no `appointment_records` class is treated as a safely
retired/dead projection in this decision.

S01's accepted `0304` removed five different legacy catalog/projection tables. It did not remove
`patient_bookings` or `appointment_records`, so neither table is a removable parallel ownership
model. The proposed actions reuse only the canonical `be_appointments.organization_id` (and its
existing immutable external mapping); they do not introduce another owner source.

## Bounded next-worker brief (no implementation)

Run one read-only, aggregate-only census through the existing migration executor/principal that is
authorised to see canonical parents. Reuse the 0309 classifier and report, separately for the
44 native booking ids, 2 `be:` projection ids, and 408 non-native ids, exact counts for:
one canonical parent, deleted parent, missing parent, and exact immutable mapping. Do not apply a
migration, add a role/harness/table/column, set a default organization, delete/quarantine rows, or
change RLS. The worker must retain the 219 no-canonical-id bookings as the already-proven
unresolvable blocker and return `BLOCKED_BY_UNPROVABLE_DATA` if any mapping-only candidate is not
exactly provable.
