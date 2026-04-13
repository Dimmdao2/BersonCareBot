-- Integrator process: read/update webapp patient canon for messenger phone bind (TX) and
-- orchestrator link-data (`getLinkDataByIdentity` → public).
--
-- Idempotent (repeated GRANT is safe). The migration runner must be able to grant on
-- `public.user_channel_bindings` and `public.platform_users` (typically: owner of those tables,
-- or superuser). If your deploy runs integrator migrations as a superuser, prefer a follow-up
-- `GRANT … TO <integrator_application_role>` so the app role matches production connections;
-- see `docs/WEBAPP_FIRST_PHONE_BIND/STAGE_01_BIND_TX_AND_GRANTS.md`.
--
-- Schema-level `USAGE` on `public` is applied in `20260413_0003_integrator_grant_usage_on_public_schema.sql`
-- (required alongside table grants per `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`).

GRANT SELECT ON TABLE public.user_channel_bindings TO CURRENT_USER;
GRANT SELECT, UPDATE ON TABLE public.platform_users TO CURRENT_USER;
