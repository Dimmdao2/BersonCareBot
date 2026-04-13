-- Integrator role must be able to resolve qualified names `public.*` (see
-- `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`: USAGE on schemas + table GRANTs).
-- Complements `20260413_0002_integrator_grants_public_messenger_canon.sql` (table-level only).
-- Idempotent. If migrations run as superuser, mirror these grants to the application role; see
-- `docs/WEBAPP_FIRST_PHONE_BIND/STAGE_01_BIND_TX_AND_GRANTS.md`.

GRANT USAGE ON SCHEMA public TO CURRENT_USER;
