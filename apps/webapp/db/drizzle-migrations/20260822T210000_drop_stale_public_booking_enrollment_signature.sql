-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.enroll_current_patient_in_public_booking_clinic(uuid)') IS NULL AND pg_catalog.to_regprocedure('app.enroll_current_patient_in_public_booking_clinic(uuid,text)') IS NOT NULL
--
-- 20260819T170216 created the enrollment door before the confirmation channel became an
-- argument.  20260819T182039 created the two-argument replacement but cannot replace an
-- overload, so the original signature remained in the migration ledger without a later
-- retirement.  Its absence after reconciliation is therefore explicit migration history,
-- rather than a catalog hole the ledger must ask an operator to reapply.
DROP FUNCTION IF EXISTS app.enroll_current_patient_in_public_booking_clinic(uuid);
