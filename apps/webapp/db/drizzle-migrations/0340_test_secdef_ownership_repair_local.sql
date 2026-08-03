-- 0340: TEST closure (2026-08-03) measured app_owner owning 154 SECURITY DEFINER functions where the
-- reviewed baseline expects the four D30 Ш4 patient-reminder-materialization capabilities from migration
-- 0338 included in that count. 0338 created
-- app.patient_reminder_materialization_fingerprint(text,text),
-- app.upsert_patient_reminder_occurrence_plan(text,text,uuid,uuid,text,timestamptz),
-- app.mark_patient_reminder_occurrence_queued(text,integer,text[]) and
-- app.revalidate_patient_reminder_delivery_materialization(uuid) as SECURITY DEFINER but never executed
-- ALTER FUNCTION ... OWNER TO app_owner, so all four are still owned by the migration-runner role
-- (bersoncarebot_test) instead of the database-owner capability role. Forward-only ownership repair:
-- same narrow, exact-EXECUTE capabilities 0338 already designed, now actually owned by app_owner.
--
-- Fixing ownership alone would break the two writer capabilities: 0338 also revoked SELECT, INSERT
-- and UPDATE on integrator.user_reminder_occurrences from app_owner in the same migration, on the
-- (mistaken, paired with the missing OWNER TO) assumption that only direct callers needed locking
-- down. But app.upsert_patient_reminder_occurrence_plan and app.mark_patient_reminder_occurrence_queued
-- read (`SELECT ... FOR UPDATE`, which itself requires UPDATE privilege, not only SELECT), insert and
-- update that exact table from inside the SECURITY DEFINER body -- once the owner is actually
-- app_owner, app_owner needs those exact three privileges to execute, or every materialization call
-- fails with "permission denied for table user_reminder_occurrences". This was masked until now
-- because the functions ran as the unrestricted migration-runner role. Restoring exactly
-- SELECT/INSERT/UPDATE to app_owner on this one table is not "broad table DML": no other role gets
-- table access, and app_owner already got wider access here from the c4-operational-runtime.sql
-- deploy overlay's `GRANT SELECT, UPDATE, DELETE` (reapplied every deploy) -- this migration only
-- adds INSERT and makes the grant durable from the migration chain itself, not deploy-overlay order.

GRANT SELECT, INSERT, UPDATE ON TABLE integrator.user_reminder_occurrences TO app_owner;

ALTER FUNCTION app.patient_reminder_materialization_fingerprint(text, text) OWNER TO app_owner;
ALTER FUNCTION app.upsert_patient_reminder_occurrence_plan(text, text, uuid, uuid, text, timestamptz)
  OWNER TO app_owner;
ALTER FUNCTION app.mark_patient_reminder_occurrence_queued(text, integer, text[]) OWNER TO app_owner;
ALTER FUNCTION app.revalidate_patient_reminder_delivery_materialization(uuid) OWNER TO app_owner;

-- Re-assert the exact EXECUTE ACL from 0338: owner-only for the fingerprint helper, owner + app_staff
-- for the two staff-triggered writers, owner + app_operational_delivery_worker for the worker-facing
-- revalidation. PUBLIC and every other runtime role keep zero EXECUTE.
REVOKE ALL ON FUNCTION app.patient_reminder_materialization_fingerprint(text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION app.upsert_patient_reminder_occurrence_plan(text, text, uuid, uuid, text, timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.upsert_patient_reminder_occurrence_plan(text, text, uuid, uuid, text, timestamptz)
  TO app_staff;

REVOKE ALL ON FUNCTION app.mark_patient_reminder_occurrence_queued(text, integer, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.mark_patient_reminder_occurrence_queued(text, integer, text[]) TO app_staff;

REVOKE ALL ON FUNCTION app.revalidate_patient_reminder_delivery_materialization(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.revalidate_patient_reminder_delivery_materialization(uuid)
  TO app_operational_delivery_worker;
