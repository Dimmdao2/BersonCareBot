-- D2 / FB#1 bootstrap phone-write direct surface.
--
-- Purpose:
--   Grant the C0 nonstaff bootstrap base login the minimal direct DML/function surface needed by
--   pre-auth OTP/messenger/booking phone-contact writes while it remains the base login after
--   RESET ROLE in locked mode. This does not grant row-security bypass, owner membership, app_staff
--   membership, or broad patient-role writes.
--
-- Required psql variable:
--   - d2_fb1_bootstrap_base_role
--
-- Rollback:
--   Re-run with -v d2_fb1_bootstrap_grants_down=1.

\set ON_ERROR_STOP on
\pset pager off

\if :{?d2_fb1_bootstrap_base_role}
\else
\echo 'FATAL: missing required psql variable d2_fb1_bootstrap_base_role.'
SELECT 1 / 0 AS d2_fb1_bootstrap_base_role_missing;
\endif

SELECT 1 / (
  length(:'d2_fb1_bootstrap_base_role') > 0
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'d2_fb1_bootstrap_base_role')
)::int AS d2_fb1_bootstrap_base_role_exists;

\if :{?d2_fb1_bootstrap_grants_down}
REVOKE EXECUTE ON FUNCTION app.close_active_user_phone_history(uuid) FROM :"d2_fb1_bootstrap_base_role";
REVOKE SELECT, INSERT, UPDATE ON TABLE public.user_phone_history FROM :"d2_fb1_bootstrap_base_role";
REVOKE SELECT, INSERT, UPDATE ON TABLE public.platform_user_contacts FROM :"d2_fb1_bootstrap_base_role";
REVOKE USAGE ON SCHEMA app FROM :"d2_fb1_bootstrap_base_role";
REVOKE USAGE ON SCHEMA public FROM :"d2_fb1_bootstrap_base_role";
\echo 'D2 FB#1 bootstrap phone-write grants DOWN complete.'
\quit
\endif

GRANT USAGE ON SCHEMA public, app TO :"d2_fb1_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.close_active_user_phone_history(uuid) TO :"d2_fb1_bootstrap_base_role";
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_phone_history TO :"d2_fb1_bootstrap_base_role";
GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_user_contacts TO :"d2_fb1_bootstrap_base_role";

\echo 'D2 FB#1 bootstrap phone-write grants UP complete.'
