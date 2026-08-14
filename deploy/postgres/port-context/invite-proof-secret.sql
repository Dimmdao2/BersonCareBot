-- The custom signed DB-principal protocol is retired, but three patient-invite definer roots still
-- verify the webapp's short-lived start/verify/claim authorization HMAC. Keep that one narrow secret
-- store until those function signatures are migrated; do not recreate nonce/session context tables.
-- Required psql variable: invite_proof_secret (loaded from a protected process environment).

CREATE TABLE IF NOT EXISTS app.context_signing_secrets (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  secret text NOT NULL CHECK (length(secret) >= 32)
);

INSERT INTO app.context_signing_secrets (id, secret)
VALUES (true, :'invite_proof_secret')
ON CONFLICT (id) DO UPDATE SET secret = EXCLUDED.secret;
