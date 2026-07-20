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
BEGIN
  IF public_guard_oid IS NOT NULL
    AND position('TEST ENV LOCK:' IN pg_get_functiondef(public_guard_oid)) = 0
  THEN
    RAISE EXCEPTION 'DEV post-refresh unlock refused unexpected public lock function'
      USING ERRCODE = '55000';
  END IF;

  IF integrator_guard_oid IS NOT NULL
    AND position('TEST ENV LOCK (integrator):' IN pg_get_functiondef(integrator_guard_oid)) = 0
  THEN
    RAISE EXCEPTION 'DEV post-refresh unlock refused unexpected integrator lock function'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_row
    JOIN pg_class AS relation_row ON relation_row.oid = trigger_row.tgrelid
    JOIN pg_namespace AS schema_row ON schema_row.oid = relation_row.relnamespace
    WHERE NOT trigger_row.tgisinternal
      AND trigger_row.tgname = 'system_settings_test_lock'
      AND schema_row.nspname = 'public'
      AND relation_row.relname = 'system_settings'
      AND trigger_row.tgfoid IS DISTINCT FROM public_guard_oid
  ) THEN
    RAISE EXCEPTION 'DEV post-refresh unlock refused unexpected public trigger target'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_row
    JOIN pg_class AS relation_row ON relation_row.oid = trigger_row.tgrelid
    JOIN pg_namespace AS schema_row ON schema_row.oid = relation_row.relnamespace
    WHERE NOT trigger_row.tgisinternal
      AND trigger_row.tgname = 'system_settings_test_lock'
      AND schema_row.nspname = 'integrator'
      AND relation_row.relname = 'system_settings'
      AND trigger_row.tgfoid IS DISTINCT FROM integrator_guard_oid
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
    WHERE NOT trigger_row.tgisinternal
      AND trigger_row.tgname = 'system_settings_test_lock'
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
