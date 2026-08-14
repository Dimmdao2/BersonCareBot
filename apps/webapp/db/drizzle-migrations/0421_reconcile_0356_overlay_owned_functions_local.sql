-- 0356 was authored against a long-lived TEST where three closure-overlay functions already
-- existed. A fresh PROD-copy transition reaches 0356 before those overlays are installed, so the
-- historical body now conditionally re-homes those three and still requires every function owned
-- by the migration chain itself. Existing databases need no ownership delta from this correction.
-- RECONCILES-MIGRATION-HASH: 0356_platform_users_definer_owner_app_owner_local

DO $migration_owned_functions$
BEGIN
  IF to_regprocedure('app.bump_platform_user_session_epoch_self()') IS NULL
    OR to_regprocedure('app.email_otp_public_delete_unverified_registration(uuid)') IS NULL
    OR to_regprocedure('app.email_otp_public_find_user_by_email(text)') IS NULL
    OR to_regprocedure('app.email_otp_public_register_patient(text,text,text,text)') IS NULL
    OR to_regprocedure('app.email_password_find_login_candidate(text)') IS NULL
    OR to_regprocedure('app.email_password_register_pending(text,text,text,text,text,text)') IS NULL
    OR to_regprocedure('app.is_platform_registration_analytics_user_excluded(uuid)') IS NULL
    OR to_regprocedure('app.list_platform_organization_members(uuid)') IS NULL
    OR to_regprocedure('app.patient_done_reminder_occurrence(text)') IS NULL
    OR to_regprocedure('app.patient_skip_reminder_occurrence(uuid,text,text)') IS NULL
    OR to_regprocedure('app.patient_snooze_reminder_occurrence(uuid,text,integer)') IS NULL
    OR to_regprocedure('app.propagate_staff_session_version_to_session_epoch()') IS NULL
  THEN
    RAISE EXCEPTION '0356 migration-owned function prerequisite is missing'
      USING ERRCODE = '42883';
  END IF;
END
$migration_owned_functions$;
