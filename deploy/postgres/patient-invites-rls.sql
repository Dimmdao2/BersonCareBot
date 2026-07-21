-- U3B patient invite strict runtime overlay.
-- Applies no data migration and sends nothing. It only closes table access and hands the narrow
-- pre-session functions to the existing NOLOGIN/BYPASSRLS app_owner boundary.
\set ON_ERROR_STOP on
\pset pager off

SELECT (
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient')
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff')
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner' AND rolbypassrls AND NOT rolcanlogin)
  AND to_regclass('public.patient_invites') IS NOT NULL
  AND to_regclass('public.patient_merge_candidates') IS NOT NULL
  AND to_regclass('public.org_enrollments') IS NOT NULL
  AND to_regclass('public.platform_users') IS NOT NULL
  AND to_regclass('app.context_signing_secrets') IS NOT NULL
  AND to_regprocedure('app.current_patient_user_id()') IS NOT NULL
  AND to_regprocedure('app.claim_unbound_patient_invite_email(text,text,text,bigint,text)') IS NOT NULL
  AND to_regprocedure('app_ext.hmac(text,text,text)') IS NOT NULL
  AND has_schema_privilege('app_owner', 'app_ext', 'USAGE')
  AND has_function_privilege('app_owner', 'app_ext.hmac(text,text,text)', 'EXECUTE')
)::int AS patient_invites_preflight_ok \gset

\if :patient_invites_preflight_ok
\else
\echo 'FATAL: patient invite RLS prerequisites are missing.'
SELECT 1 / 0 AS patient_invites_preflight_abort;
\endif

BEGIN;

ALTER TABLE public.patient_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_invites FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_invites_exact_staff_org ON public.patient_invites;
DROP POLICY IF EXISTS saas_org_dormant_p0_8_3 ON public.patient_invites;
CREATE POLICY saas_org_dormant_p0_8_3 ON public.patient_invites
  FOR ALL
  USING (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND organization_id = app.current_org_id()
  )
  WITH CHECK (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND organization_id = app.current_org_id()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.patient_invites TO app_staff;
REVOKE ALL ON TABLE public.patient_invites FROM app_patient;

GRANT USAGE ON SCHEMA public TO app_owner;
GRANT SELECT, UPDATE ON TABLE public.patient_invites TO app_owner;
GRANT SELECT, UPDATE ON TABLE public.org_enrollments TO app_owner;
GRANT SELECT, UPDATE ON TABLE public.platform_users TO app_owner;
GRANT SELECT, UPDATE ON TABLE public.be_organizations TO app_owner;
GRANT SELECT, INSERT ON TABLE public.patient_merge_candidates TO app_owner;

ALTER FUNCTION app.exchange_patient_invite(text, text, timestamptz) OWNER TO app_owner;
ALTER FUNCTION app.lookup_patient_invite_continuation(text) OWNER TO app_owner;
ALTER FUNCTION app.start_patient_invite_email_proof(text, text, text, timestamptz, text, bigint, text) OWNER TO app_owner;
ALTER FUNCTION app.cancel_patient_invite_email_proof(text, text) OWNER TO app_owner;
ALTER FUNCTION app.verify_patient_invite_email_proof(text, text, text, text, bigint, text) OWNER TO app_owner;
ALTER FUNCTION app.redeem_patient_invite_email(text) OWNER TO app_owner;
ALTER FUNCTION app.claim_unbound_patient_invite_email(text, text, text, bigint, text) OWNER TO app_owner;

REVOKE ALL ON FUNCTION app.exchange_patient_invite(text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.lookup_patient_invite_continuation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.start_patient_invite_email_proof(text, text, text, timestamptz, text, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.cancel_patient_invite_email_proof(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.verify_patient_invite_email_proof(text, text, text, text, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.redeem_patient_invite_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.claim_unbound_patient_invite_email(text, text, text, bigint, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.exchange_patient_invite(text, text, timestamptz) TO app_patient;
GRANT EXECUTE ON FUNCTION app.lookup_patient_invite_continuation(text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.start_patient_invite_email_proof(text, text, text, timestamptz, text, bigint, text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.cancel_patient_invite_email_proof(text, text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.verify_patient_invite_email_proof(text, text, text, text, bigint, text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.redeem_patient_invite_email(text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.claim_unbound_patient_invite_email(text, text, text, bigint, text) TO app_patient;

COMMIT;
