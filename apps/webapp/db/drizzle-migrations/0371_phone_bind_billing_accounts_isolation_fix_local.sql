-- TEMPORARY LOCAL MIGRATION NUMBER 0371
--
-- Closes two live TEST `role_pool_mismatch` classes from the SaaS isolation card (2026-08-04):
--
-- 1. Phone confirm (`stampBootstrapPrincipal` -> `createOrBind`) issues direct
--    `SELECT/INSERT ... FOR UPDATE` against `public.user_channel_bindings` while PostgreSQL still
--    executes as the bare NOINHERIT nonstaff login (`bcb_test_nonstaff_login` on TEST). That login
--    has only table-level SELECT on the bindings table (deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql),
--    so every bind path that reaches INSERT or `FOR UPDATE` raises SQLSTATE 42501. Reproduced live on
--    TEST 2026-08-04 21:25: `confirmPhoneAuth` -> `permission denied for table user_channel_bindings`.
--
--    Fix -- same idiom as 0258/0357: narrow `app_owner`-owned SECURITY DEFINER accessors that repeat
--    the exact channel/external-id predicates; no widening of the bootstrap login's table grants.
--
-- 2. `getOrganizationBillingOverview` runs under `SET ROLE app_staff` and reads
--    `public.saas_billing_accounts`, but 0344 only granted/policed invoices, subscriptions and
--    provider events for `app_staff`. Reproduced live on TEST 2026-08-04 15:09:
--    `permission denied for table saas_billing_accounts`.
--
--    Fix -- org-scoped SELECT only (overview is read-only on accounts; capture/webhook UPDATE paths
--    remain on the other billing tables).

DO $phone_bind_owner_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.user_channel_bindings TO app_owner;
  END IF;
END
$phone_bind_owner_grants$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.auth_phone_bind_lock_channel_binding(
  p_channel_code text,
  p_external_id text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  IF p_channel_code IS NULL
     OR btrim(p_channel_code) = ''
     OR p_external_id IS NULL
     OR btrim(p_external_id) = ''
     OR p_channel_code NOT IN ('telegram', 'max', 'vk', 'web')
  THEN
    RETURN NULL;
  END IF;

  SELECT binding.user_id
  INTO v_user_id
  FROM public.user_channel_bindings AS binding
  WHERE binding.channel_code = p_channel_code
    AND binding.external_id = p_external_id
  FOR UPDATE;

  RETURN v_user_id;
END
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.auth_phone_bind_upsert_channel_binding(
  p_user_id uuid,
  p_channel_code text,
  p_external_id text
)
RETURNS TABLE (
  inserted boolean,
  owner_user_id uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  IF p_user_id IS NULL
     OR p_channel_code IS NULL
     OR btrim(p_channel_code) = ''
     OR p_external_id IS NULL
     OR btrim(p_external_id) = ''
     OR p_channel_code NOT IN ('telegram', 'max', 'vk')
  THEN
    RETURN;
  END IF;

  INSERT INTO public.user_channel_bindings (user_id, channel_code, external_id)
  VALUES (p_user_id, p_channel_code, p_external_id)
  ON CONFLICT (channel_code, external_id) DO NOTHING
  RETURNING user_channel_bindings.user_id INTO v_user_id;

  IF v_user_id IS NOT NULL THEN
    RETURN QUERY SELECT true, v_user_id;
    RETURN;
  END IF;

  SELECT binding.user_id
  INTO v_user_id
  FROM public.user_channel_bindings AS binding
  WHERE binding.channel_code = p_channel_code
    AND binding.external_id = p_external_id
  FOR UPDATE;

  RETURN QUERY SELECT false, v_user_id;
END
$function$;
--> statement-breakpoint

DO $phone_bind_accessor_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    ALTER FUNCTION app.auth_phone_bind_lock_channel_binding(text, text) OWNER TO app_owner;
    ALTER FUNCTION app.auth_phone_bind_upsert_channel_binding(uuid, text, text) OWNER TO app_owner;
  END IF;
END
$phone_bind_accessor_owner$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app.auth_phone_bind_lock_channel_binding(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_phone_bind_upsert_channel_binding(uuid, text, text) FROM PUBLIC;
--> statement-breakpoint

DO $phone_bind_accessor_runtime_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.auth_phone_bind_lock_channel_binding(text, text) TO app_patient;
    GRANT EXECUTE ON FUNCTION app.auth_phone_bind_upsert_channel_binding(uuid, text, text) TO app_patient;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff') THEN
    GRANT EXECUTE ON FUNCTION app.auth_phone_bind_lock_channel_binding(text, text) TO app_staff;
    GRANT EXECUTE ON FUNCTION app.auth_phone_bind_upsert_channel_binding(uuid, text, text) TO app_staff;
  END IF;
END
$phone_bind_accessor_runtime_grants$;
--> statement-breakpoint

COMMENT ON FUNCTION app.auth_phone_bind_lock_channel_binding(text, text) IS
  'Bootstrap phone bind: lock an exact channel/external-id binding row, if any; never scans other rows.';
COMMENT ON FUNCTION app.auth_phone_bind_upsert_channel_binding(uuid, text, text) IS
  'Bootstrap phone bind: insert an exact user/channel/external-id binding or return the existing owner after conflict.';
--> statement-breakpoint

GRANT SELECT ON TABLE public.saas_billing_accounts TO app_staff;
--> statement-breakpoint

DROP POLICY IF EXISTS saas_billing_accounts_staff_capture_select ON public.saas_billing_accounts;
CREATE POLICY saas_billing_accounts_staff_capture_select ON public.saas_billing_accounts
  FOR SELECT TO app_staff
  USING (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id());
