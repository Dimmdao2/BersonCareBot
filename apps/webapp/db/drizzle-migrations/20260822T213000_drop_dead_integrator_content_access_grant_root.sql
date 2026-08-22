-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.integrator_upsert_content_access_grant(uuid,text,text,bigint,text,text,text,timestamp with time zone,timestamp with time zone,text,timestamp with time zone)') IS NULL
--
-- D17: production has no caller of this projection and no source relation
-- `integrator.content_access_grants`; remove the unused definer surface.

DROP FUNCTION IF EXISTS app.integrator_upsert_content_access_grant(
  uuid,
  text,
  text,
  bigint,
  text,
  text,
  text,
  timestamp with time zone,
  timestamp with time zone,
  text,
  timestamp with time zone
);
