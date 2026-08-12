-- 0387: remove the database residue of the retired PIN login/re-auth mechanism.
-- PIN has no production caller or UI surface. Drop every exact accessor before the table so an
-- unexpected remaining dependency aborts this migration; CASCADE is deliberately forbidden.

DROP FUNCTION IF EXISTS app.auth_user_pin_increment_failed(uuid);
DROP FUNCTION IF EXISTS app.auth_user_pin_read_self();
DROP FUNCTION IF EXISTS app.auth_user_pin_read(uuid);
DROP FUNCTION IF EXISTS app.auth_user_pin_reset_attempts(uuid);
DROP FUNCTION IF EXISTS app.auth_user_pin_upsert_self(text);
DROP FUNCTION IF EXISTS app.auth_user_pin_upsert(uuid, text);

DROP TABLE IF EXISTS public.user_pins;
