-- Remove only the TEST-only system_settings locks copied by TEST -> DEV restore.
-- This file is intentionally DEV-specific and must be run transactionally.

DO $dev_target_guard$
BEGIN
  IF current_database() <> 'bcb_webapp_dev' THEN
    RAISE EXCEPTION 'DEV post-refresh unlock refused database "%"', current_database()
      USING ERRCODE = '55000';
  END IF;
END
$dev_target_guard$;

DO $dev_lock_identity_guard$
DECLARE
  public_guard_oid oid := to_regprocedure('public.system_settings_test_lock_guard()');
  integrator_guard_oid oid := to_regprocedure('integrator.system_settings_test_lock_guard()');
  expected_public_body constant text := $expected_public_body$
DECLARE
  locked_keys TEXT[] := ARRAY['patient_app_maintenance_enabled','dev_mode','test_account_identifiers','smtp_outbound','specialist_signup_enabled','patient_program_discussion_ui_enabled'];
BEGIN
  IF OLD.key = ANY(locked_keys) THEN
    RAISE EXCEPTION 'TEST ENV LOCK: system_settings key "%" is locked for safety. Remove trigger system_settings_test_lock before changing.', OLD.key
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$expected_public_body$;
  expected_integrator_body constant text := $expected_integrator_body$
DECLARE
  locked_keys TEXT[] := ARRAY['smtp_outbound','app_base_url','test_account_identifiers','specialist_signup_enabled','patient_program_discussion_ui_enabled'];
BEGIN
  IF OLD.key = ANY(locked_keys) THEN
    RAISE EXCEPTION 'TEST ENV LOCK (integrator): system_settings key "%" is locked.', OLD.key
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$expected_integrator_body$;
BEGIN
  IF public_guard_oid IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_proc AS function_row
    JOIN pg_language AS language_row ON language_row.oid = function_row.prolang
    WHERE function_row.oid = public_guard_oid
      AND function_row.prokind = 'f'
      AND function_row.pronargs = 0
      AND function_row.prorettype = 'trigger'::regtype
      AND language_row.lanname = 'plpgsql'
      AND NOT function_row.prosecdef
      AND NOT function_row.proleakproof
      AND function_row.provolatile = 'v'
      AND function_row.proconfig IS NULL
      AND function_row.prosrc = expected_public_body
  ) THEN
    RAISE EXCEPTION 'DEV post-refresh unlock refused unexpected public lock function'
      USING ERRCODE = '55000';
  END IF;

  IF integrator_guard_oid IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_proc AS function_row
    JOIN pg_language AS language_row ON language_row.oid = function_row.prolang
    WHERE function_row.oid = integrator_guard_oid
      AND function_row.prokind = 'f'
      AND function_row.pronargs = 0
      AND function_row.prorettype = 'trigger'::regtype
      AND language_row.lanname = 'plpgsql'
      AND NOT function_row.prosecdef
      AND NOT function_row.proleakproof
      AND function_row.provolatile = 'v'
      AND function_row.proconfig IS NULL
      AND function_row.prosrc = expected_integrator_body
  ) THEN
    RAISE EXCEPTION 'DEV post-refresh unlock refused unexpected integrator lock function'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_row
    JOIN pg_class AS relation_row ON relation_row.oid = trigger_row.tgrelid
    JOIN pg_namespace AS schema_row ON schema_row.oid = relation_row.relnamespace
    WHERE trigger_row.tgname = 'system_settings_test_lock'
      AND schema_row.nspname = 'public'
      AND relation_row.relname = 'system_settings'
      AND (
        trigger_row.tgisinternal
        OR trigger_row.tgfoid IS DISTINCT FROM public_guard_oid
        OR trigger_row.tgtype <> 19
        OR trigger_row.tgenabled <> 'O'
        OR trigger_row.tgconstraint <> 0
        OR trigger_row.tgattr::text <> ''
        OR octet_length(trigger_row.tgargs) <> 0
        OR trigger_row.tgqual IS NOT NULL
        OR trigger_row.tgoldtable IS NOT NULL
        OR trigger_row.tgnewtable IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'DEV post-refresh unlock refused unexpected public trigger target'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_row
    JOIN pg_class AS relation_row ON relation_row.oid = trigger_row.tgrelid
    JOIN pg_namespace AS schema_row ON schema_row.oid = relation_row.relnamespace
    WHERE trigger_row.tgname = 'system_settings_test_lock'
      AND schema_row.nspname = 'integrator'
      AND relation_row.relname = 'system_settings'
      AND (
        trigger_row.tgisinternal
        OR trigger_row.tgfoid IS DISTINCT FROM integrator_guard_oid
        OR trigger_row.tgtype <> 19
        OR trigger_row.tgenabled <> 'O'
        OR trigger_row.tgconstraint <> 0
        OR trigger_row.tgattr::text <> ''
        OR octet_length(trigger_row.tgargs) <> 0
        OR trigger_row.tgqual IS NOT NULL
        OR trigger_row.tgoldtable IS NOT NULL
        OR trigger_row.tgnewtable IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'DEV post-refresh unlock refused unexpected integrator trigger target'
      USING ERRCODE = '55000';
  END IF;
END
$dev_lock_identity_guard$;

DROP TRIGGER IF EXISTS system_settings_test_lock ON public.system_settings;
DROP TRIGGER IF EXISTS system_settings_test_lock ON integrator.system_settings;

DROP FUNCTION IF EXISTS public.system_settings_test_lock_guard();
DROP FUNCTION IF EXISTS integrator.system_settings_test_lock_guard();

DO $dev_unlock_assert$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_row
    JOIN pg_class AS relation_row ON relation_row.oid = trigger_row.tgrelid
    JOIN pg_namespace AS schema_row ON schema_row.oid = relation_row.relnamespace
    WHERE trigger_row.tgname = 'system_settings_test_lock'
      AND (schema_row.nspname, relation_row.relname) IN (
        ('public', 'system_settings'),
        ('integrator', 'system_settings')
      )
  )
    OR to_regprocedure('public.system_settings_test_lock_guard()') IS NOT NULL
    OR to_regprocedure('integrator.system_settings_test_lock_guard()') IS NOT NULL
  THEN
    RAISE EXCEPTION 'DEV post-refresh unlock did not remove the exact TEST-only lock objects'
      USING ERRCODE = '55000';
  END IF;
END
$dev_unlock_assert$;
