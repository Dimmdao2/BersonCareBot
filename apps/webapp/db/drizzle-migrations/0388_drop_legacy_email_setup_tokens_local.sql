-- The live contact-email setup path uses password_setup OTP challenges. The old setup-link token
-- issuer has no production caller, so its API functions and storage are retired without CASCADE.

DROP FUNCTION IF EXISTS app.auth_email_setup_delete(uuid);
DROP FUNCTION IF EXISTS app.auth_email_setup_insert(uuid, text, text, timestamptz, text, uuid);
DROP FUNCTION IF EXISTS app.auth_email_setup_mark_used(uuid);
DROP FUNCTION IF EXISTS app.auth_email_setup_read(text);
DROP FUNCTION IF EXISTS app.auth_email_setup_revoke_active(uuid, text);

DO $drop_legacy_email_setup_tokens$
DECLARE
  inbound_fk text;
BEGIN
  IF to_regclass('public.user_email_setup_tokens') IS NULL THEN
    RETURN;
  END IF;

  SELECT pg_catalog.format('%I.%I:%I', source_ns.nspname, source.relname, constraint_row.conname)
    INTO inbound_fk
    FROM pg_catalog.pg_constraint constraint_row
    JOIN pg_catalog.pg_class source ON source.oid = constraint_row.conrelid
    JOIN pg_catalog.pg_namespace source_ns ON source_ns.oid = source.relnamespace
   WHERE constraint_row.contype = 'f'
     AND constraint_row.confrelid = 'public.user_email_setup_tokens'::regclass
   LIMIT 1;

  IF inbound_fk IS NOT NULL THEN
    RAISE EXCEPTION
      '0388 refuses to drop public.user_email_setup_tokens: unexpected inbound FK %',
      inbound_fk;
  END IF;

  DROP TABLE public.user_email_setup_tokens;
END
$drop_legacy_email_setup_tokens$;
