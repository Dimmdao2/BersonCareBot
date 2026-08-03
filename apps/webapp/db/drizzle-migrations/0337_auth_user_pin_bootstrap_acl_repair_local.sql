-- 0337: repair older environments where the bootstrap PIN UUID capabilities still inherited
-- PostgreSQL's default PUBLIC EXECUTE privilege. They are server-only pre-session capabilities:
-- the signed identity-self role must use the target-free functions introduced by 0336.

REVOKE ALL ON FUNCTION app.auth_user_pin_read(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_user_pin_upsert(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_user_pin_increment_failed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.auth_user_pin_reset_attempts(uuid) FROM PUBLIC;

DO $auth_user_pin_bootstrap_acl_repair$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    REVOKE EXECUTE ON FUNCTION app.auth_user_pin_read(uuid) FROM app_patient;
    REVOKE EXECUTE ON FUNCTION app.auth_user_pin_upsert(uuid, text) FROM app_patient;
    REVOKE EXECUTE ON FUNCTION app.auth_user_pin_increment_failed(uuid) FROM app_patient;
    REVOKE EXECUTE ON FUNCTION app.auth_user_pin_reset_attempts(uuid) FROM app_patient;
  END IF;
END
$auth_user_pin_bootstrap_acl_repair$;
