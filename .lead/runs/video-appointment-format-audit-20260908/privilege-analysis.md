# Appointment delivery format — lead privilege analysis

Candidate: `d6bcb35e4`; migration: `20260908T120000_appointment_delivery_format.sql`.

1. **Objects.** The migration adds `public.be_appointments.delivery_format`, backfills it, sets its default and `NOT NULL`, and replaces the existing `app.create_current_patient_booking_appointments(text)` function. It creates no table, role, policy, trigger, or index and drops no object.
2. **Owners/runtime roles.** Table DDL runs as `app_object_owner`; the data-only update uses `BCB-MIGRATION-BACKFILL`. The replaced `SECURITY DEFINER` function remains owned by `app_seam_patient_booking_owner` and is executed through its existing `app_patient` capability.
3. **Privileges required by the body.** Replacement needs temporary `CREATE/USAGE` on schema `app`, `USAGE` on `plpgsql`, and exact-function rehome; all three are requested by the migration markers and revoked by the runner. The function retains its existing reads/writes and additionally inserts `delivery_format` into `public.be_appointments`. Staff creation/edit additionally need `INSERT`/`UPDATE` on this column.
4. **Declaration coverage.** `deploy/postgres/privileges/declaration.ts` adds `delivery_format` to the `app_staff` INSERT/UPDATE column lists, the patient-booking insert relation surface, and all five whole-row appointment function surfaces. Generated DEV/TEST privilege files match the declaration byte-for-byte. The migration contains no `GRANT`, `REVOKE`, role, default-privilege, or policy statement. No index is required because the field is not used in `WHERE`, `JOIN`, `ORDER BY`, or `GROUP BY`.

Evidence:

- `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` — PASS, exact candidate migration validated owner-aware and rolled back.
- `node deploy/postgres/privileges/generate-cli.mjs --check` — PASS.
