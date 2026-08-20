-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regclass('integrator.projection_outbox') IS NULL AND to_regprocedure('app.read_integrator_projection_health(integer)') IS NULL
--
-- D10: every producer and consumer has been removed, and the named DEV/TEST censuses contain no
-- unapplied rows. The projection transport table is no longer part of the application schema.

DROP FUNCTION IF EXISTS app.read_integrator_projection_health(integer);

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
DROP TABLE IF EXISTS integrator.projection_outbox;
