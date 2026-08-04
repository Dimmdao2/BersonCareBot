-- TEMPORARY LOCAL MIGRATION NUMBER 0360 — final number assigned at land, per AGENTS.md §1.
--
-- D27-C correction (audit d27c-audit-20260804 FAIL #1a): `enqueueAuthEmailOtpDelivery` runs under the
-- public login route's `bootstrap` principal, which `choosePoolKindForPrincipal` always routes to the
-- nonstaff DB pool (`app_patient` after SET ROLE, same as every other public/patient accessor). No
-- deploy script has ever granted that pool a direct INSERT on `public.outgoing_delivery_queue` -- the
-- table already carries write access for `app_staff` (reminders/broadcasts, tenant context) and the
-- migrator owner, never for an anonymous/bootstrap caller. D27-C is the FIRST producer that needs to
-- enqueue from that context.
--
-- A direct `GRANT INSERT ON outgoing_delivery_queue TO app_patient` was rejected: the table has no RLS
-- (`relrowsecurity = f`, confirmed by the audit), so a bare table grant would let a bootstrap-reachable
-- caller insert a row of ANY `kind`/`channel`/`organization_id` (forge a `doctor_broadcast_intent` or
-- `operator_alert` row, for instance) -- a real privilege-escalation surface, not just a login-code
-- queue slot. Every OTHER accessor this same anonymous path already uses
-- (`app.email_auth_insert_email_challenge`, `app.email_otp_public_*`, see
-- deploy/postgres/organization-member-invites-rls.sql) goes through a narrow SECURITY DEFINER function
-- instead of a table grant for exactly this reason -- this migration follows that established idiom
-- rather than introducing a new one.
--
-- `app.email_auth_enqueue_otp_delivery` hardcodes kind='auth_email_otp', channel='email' and
-- organization_id=NULL inside the function body (never caller-supplied), and can only INSERT a fresh
-- row -- no UPDATE/DELETE path exists through it. The caller supplies only the fields that vary per
-- OTP issuance: the idempotency event_id, the message payload, retry/priority bookkeeping.
CREATE OR REPLACE FUNCTION app.email_auth_enqueue_otp_delivery(
  p_event_id text,
  p_payload_json jsonb,
  p_max_attempts integer,
  p_next_retry_at timestamptz,
  p_priority smallint
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_row_count integer;
BEGIN
  INSERT INTO public.outgoing_delivery_queue (
    organization_id, event_id, kind, channel, payload_json,
    status, attempt_count, max_attempts, next_retry_at, priority
  ) VALUES (
    NULL, p_event_id, 'auth_email_otp', 'email', p_payload_json,
    'pending', 0, p_max_attempts, p_next_retry_at, p_priority
  )
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count > 0;
END
$function$;

COMMENT ON FUNCTION app.email_auth_enqueue_otp_delivery(text, jsonb, integer, timestamptz, smallint) IS
  'D27-C correction: narrow bootstrap-reachable enqueue for auth_email_otp only -- kind/channel/organization_id are fixed inside the body, never caller-supplied. Replaces the direct Drizzle INSERT that the shared outgoing-delivery write port uses for every other (staff-context) queue kind.';

DO $email_auth_enqueue_otp_delivery_owner$
BEGIN
  -- Same guarded ownership transfer as 0245/0247/0248/0249: a database that never provisioned the
  -- runtime roles (local dev box, CI scratch DB) still applies this migration instead of hard-failing
  -- the whole chain on a role it does not have.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    RAISE WARNING '0360: role app_owner absent; email_auth_enqueue_otp_delivery keeps the migrator as definer';
  ELSIF NOT pg_has_role(current_user, 'app_owner', 'member') THEN
    RAISE WARNING '0360: % is not a member of app_owner; email_auth_enqueue_otp_delivery keeps the migrator as definer', current_user;
  ELSE
    ALTER FUNCTION app.email_auth_enqueue_otp_delivery(text, jsonb, integer, timestamptz, smallint) OWNER TO app_owner;
  END IF;
END
$email_auth_enqueue_otp_delivery_owner$;

REVOKE ALL ON FUNCTION app.email_auth_enqueue_otp_delivery(text, jsonb, integer, timestamptz, smallint) FROM PUBLIC;

DO $email_auth_enqueue_otp_delivery_grants$
BEGIN
  -- Same grantee class as every other app.email_auth_*/app.email_otp_public_* accessor reachable from
  -- the bootstrap/public login path (app_patient only).
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient') THEN
    GRANT EXECUTE ON FUNCTION app.email_auth_enqueue_otp_delivery(text, jsonb, integer, timestamptz, smallint) TO app_patient;
  END IF;
END
$email_auth_enqueue_otp_delivery_grants$;
