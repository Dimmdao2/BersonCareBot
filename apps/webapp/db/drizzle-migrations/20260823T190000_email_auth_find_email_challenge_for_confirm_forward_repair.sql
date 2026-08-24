-- BCB-MIGRATION-OWNER: app_seam_email_otp_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.email_auth_find_email_challenge_for_confirm(uuid,uuid)
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, 'require_accepted_context') > 0 AND pg_catalog.strpos(p.prosrc, 'hash_port_typed_args') > 0 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang WHERE p.oid = pg_catalog.to_regprocedure('app.email_auth_find_email_challenge_for_confirm(uuid,uuid)') AND l.lanname = 'plpgsql'
-- D17 forward-repair (audit F4, docs/_TODO/runs/integrator-cleanup/TRACK_D_PARTIAL_SALVAGE_AUDIT_2026-08-23.md
-- §F4). `4d1380339` removed the second manual overlay body for five pre_session email roots from
-- `deploy/postgres/organization-member-invites-rls.sql`, but on any database where the overlay ran
-- last after `20260822T100000_pre_session_email_and_signup_roots_accept_their_named_context.sql` was
-- already ledgered (e.g. bcb_webapp_dev), the overlay's manual body already overwrote the canonical
-- one: this root is stuck at `LANGUAGE sql`, owner `postgres`, no `require_accepted_context`, no
-- `hash_port_typed_args`. Removing the overlay's second body only stops future overwrites; it does
-- not repair what is already overwritten, and `20260822T100000_...` is already applied so it will not
-- re-run. This forward migration restores the exact canonical body (verbatim from
-- `20260822T100000_pre_session_email_and_signup_roots_accept_their_named_context.sql`) so a
-- The owner-aware runner first re-homes this exact existing signature inside the same transaction,
-- then CREATE OR REPLACE applies as app_seam_email_otp_owner. The other four
-- pre_session email roots named in that migration are already canonical on every measured database
-- (the migration won there); CREATE OR REPLACE with the identical body is a no-op for them.

CREATE OR REPLACE FUNCTION app.email_auth_find_email_challenge_for_confirm(p_challenge_id uuid, p_user_id uuid)
 RETURNS TABLE(id uuid, email text, code_hash text, expires_at bigint, attempts integer, purpose text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
BEGIN
  PERFORM app.require_accepted_context('app_seam_email_otp_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.email-otp.challenge.find-for-confirm', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg]), 'app.email_auth_find_email_challenge_for_confirm(uuid,uuid)'::regprocedure);

  RETURN QUERY
  SELECT c.id, c.email, c.code_hash, c.expires_at, c.attempts::integer, c.purpose
  FROM public.email_challenges AS c
  WHERE c.id = p_challenge_id
    AND c.user_id = p_user_id;
END
$function$;
