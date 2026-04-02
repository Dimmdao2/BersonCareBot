# Prod remediation: booking incident (time / projection / manage URL)

**Audience:** operator on production host with DB access (integrator + webapp PostgreSQL as deployed).

**Principle:** diagnostics first (SELECT only), then targeted replay/reconcile. Destructive steps only after deploy of fixes in this incident branch.

## Preconditions

- Webapp migration `054_patient_bookings_rubitime_manage_url.sql` applied.
- Integrator + webapp deployed with:
  - `create-record` wall-time fix (MSK / app timezone).
  - `upsertFromRubitime` SQL casts (no `could not determine data type of parameter $5`).
  - `patient_bookings.rubitime_manage_url` populated from webhook / create response.

## 1) Diagnostics (read-only, mandatory before any UPDATE)

Run all checks first and save outputs into incident ticket / execution log.

### 1.1 Integrator DB: dead `appointment.record.upserted`

```sql
SELECT id, event_type, status, attempts_done, next_try_at, last_error, left(payload::text, 300) AS payload_head
FROM projection_outbox
WHERE event_type = 'appointment.record.upserted'
  AND status = 'dead'
ORDER BY id DESC
LIMIT 200;
```

Targeted filter for the original incident error:

```sql
SELECT count(*) AS dead_with_param5_error
FROM projection_outbox
WHERE event_type = 'appointment.record.upserted'
  AND status = 'dead'
  AND last_error ILIKE '%could not determine data type of parameter $5%';
```

### 1.2 Webapp DB: suspect rows for wrong-time create bug

Use release window boundaries (`<incident_start_utc>`, `<incident_fix_deploy_utc>`) and concrete phones/ids when possible.

```sql
SELECT id, rubitime_id, contact_phone, slot_start, slot_end, status, source, created_at
FROM patient_bookings
WHERE source = 'native'
  AND created_at >= '<incident_start_utc>'::timestamptz
  AND created_at <  '<incident_fix_deploy_utc>'::timestamptz
  AND status IN ('creating', 'confirmed', 'rescheduled', 'cancel_failed')
ORDER BY created_at DESC
LIMIT 500;
```

### 1.3 Webapp DB: stale active rows after external cancel/update

```sql
SELECT id, rubitime_id, contact_phone, slot_start, status, updated_at
FROM patient_bookings
WHERE source = 'native'
  AND rubitime_id IS NOT NULL
  AND status IN ('creating', 'confirmed', 'rescheduled', 'cancel_failed')
ORDER BY updated_at DESC
LIMIT 500;
```

### 1.4 Webapp DB: missing Rubitime manage URL

```sql
SELECT id, rubitime_id, status, source, slot_start, updated_at
FROM patient_bookings
WHERE rubitime_id IS NOT NULL
  AND (rubitime_manage_url IS NULL OR btrim(rubitime_manage_url) = '')
ORDER BY updated_at DESC
LIMIT 500;
```

## 2) Replay dead projection events (integrator DB)

Use existing script `apps/webapp/scripts/requeue-projection-outbox-dead.ts`.

Dry-run:

```bash
DATABASE_URL='<integrator_db_url>' \
pnpm --dir apps/webapp exec tsx scripts/requeue-projection-outbox-dead.ts \
  --event-type=appointment.record.upserted \
  --error-contains='parameter $5'
```

Commit:

```bash
DATABASE_URL='<integrator_db_url>' \
pnpm --dir apps/webapp exec tsx scripts/requeue-projection-outbox-dead.ts \
  --event-type=appointment.record.upserted \
  --error-contains='parameter $5' \
  --commit
```

Verification:

```sql
SELECT status, count(*)
FROM projection_outbox
WHERE event_type = 'appointment.record.upserted'
GROUP BY status
ORDER BY status;
```

## 3) Reconcile `patient_bookings` (webapp DB, manual + transactional)

> Never run broad UPDATE without explicit `id`/time-window filter. Start with a small batch and verify.

### 3.1 Wrong-time rows (native create bug period)

1) Create candidate table from diagnostics/export (manual input by operator):

```sql
CREATE TEMP TABLE pb_fix_time (
  booking_id uuid PRIMARY KEY,
  expected_slot_start timestamptz NOT NULL,
  expected_slot_end timestamptz NOT NULL
);
```

2) Populate it with verified rows only (from Rubitime truth/export), then apply:

```sql
BEGIN;

UPDATE patient_bookings pb
SET slot_start = f.expected_slot_start,
    slot_end = f.expected_slot_end,
    status = CASE WHEN pb.status = 'creating' THEN 'confirmed' ELSE pb.status END,
    updated_at = now()
FROM pb_fix_time f
WHERE pb.id = f.booking_id
  AND pb.source = 'native';

SELECT pb.id, pb.rubitime_id, pb.slot_start, pb.slot_end, pb.status
FROM patient_bookings pb
JOIN pb_fix_time f ON f.booking_id = pb.id
ORDER BY pb.updated_at DESC;

-- COMMIT;
-- ROLLBACK;
```

### 3.2 Stale active rows that should be cancelled

```sql
BEGIN;

UPDATE patient_bookings
SET status = 'cancelled',
    cancelled_at = COALESCE(cancelled_at, now()),
    cancel_reason = COALESCE(cancel_reason, 'reconcile_rubitime_cancelled'),
    updated_at = now()
WHERE id = ANY(ARRAY[
  -- '<booking_uuid_1>'::uuid,
  -- '<booking_uuid_2>'::uuid
]);

SELECT id, rubitime_id, status, cancelled_at, cancel_reason, updated_at
FROM patient_bookings
WHERE id = ANY(ARRAY[
  -- '<booking_uuid_1>'::uuid,
  -- '<booking_uuid_2>'::uuid
]);

-- COMMIT;
-- ROLLBACK;
```

### 3.3 Backfill `rubitime_manage_url`

If webhook replay supplies URL, prefer replay first. For residual rows, manual targeted update:

```sql
BEGIN;

UPDATE patient_bookings
SET rubitime_manage_url = v.manage_url,
    updated_at = now()
FROM (
  VALUES
    -- ('<booking_uuid_1>'::uuid, 'https://...'),
    -- ('<booking_uuid_2>'::uuid, 'https://...')
) AS v(booking_id, manage_url)
WHERE patient_bookings.id = v.booking_id
  AND v.manage_url ~ '^https?://';

SELECT id, rubitime_id, rubitime_manage_url, updated_at
FROM patient_bookings
WHERE id = ANY(ARRAY[
  -- '<booking_uuid_1>'::uuid,
  -- '<booking_uuid_2>'::uuid
]);

-- COMMIT;
-- ROLLBACK;
```

## 4) Post-deploy smoke (S6 checklist)

- [ ] New native booking: selected UI time equals Rubitime record wall-time.
- [ ] `appointment.record.upserted` processes without new `dead` rows.
- [ ] Rubitime cancel/update/remove is reflected in cabinet status.
- [ ] «Изменить» opens exact HTTPS Rubitime URL when present.
- [ ] «Изменить» is absent when `rubitime_manage_url` is null/empty.
- [ ] Replay/reconcile batch verification attached to incident ticket (booking IDs + event IDs).

## 5) Mandatory logging payload for closeout

Record these fields in `AGENT_EXECUTION_LOG.md` after operator run:

- prod SHA (`git rev-parse HEAD`) and service status for api/worker/webapp.
- dead-event counters before/after replay.
- exact replay filter used (`event-type`, `error-contains`, row count).
- list of reconciled booking IDs and what changed (time/status/url).
- smoke outcomes and residual risks.

## Residual risks

- Historical rows may lack manage URL until webhook replay or manual backfill.
- Replay duplicates: rely on idempotent `upsertFromRubitime` and outbox idempotency keys.
