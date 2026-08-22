-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.pre_session_resolve_identity(uuid)') IS NULL AND pg_catalog.to_regprocedure('app_ext.resolve_variant_a_identity(uuid)') IS NULL AND pg_catalog.to_regprocedure('app_ext.resolve_variant_a_physical(uuid)') IS NULL
-- D15b/7a Ш7: after all callers name the reference kind, remove the three temporary delegates.
DROP FUNCTION app.pre_session_resolve_identity(uuid);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
DROP FUNCTION app_ext.resolve_variant_a_identity(uuid);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
DROP FUNCTION app_ext.resolve_variant_a_physical(uuid);
