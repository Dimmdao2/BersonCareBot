-- TEMPORARY LOCAL MIGRATION NUMBER 0299 -- the lead assigns the final number at merge.
-- Registration of a new clinic died with `503 provisioning_pending`; the suppressed cause was
-- `new row violates row-level security policy for table "reference_categories"` (42501).
--
-- Why: seeding a new organization's reference catalog is allowed by exactly one policy,
-- `reference_catalog_seed_owner`, whose USING/WITH CHECK requires `CURRENT_USER = 'app_owner'`.
-- Both seeding routines are SECURITY DEFINER, so inside them CURRENT_USER is the FUNCTION OWNER —
-- and they were left owned by the migrator role, not by `app_owner`. The definer seam therefore
-- presented the wrong identity to its own policy and the seed was refused, which aborts the
-- organization INSERT (the seed runs from an AFTER INSERT trigger, in the same transaction).
--
-- Ownership is the behaviour here, not bookkeeping: these two functions are the only sanctioned
-- writers into a fresh organization's catalog, and the policy identifies them by owner.
ALTER FUNCTION app.seed_reference_catalog_snapshot(uuid) OWNER TO app_owner;
--> statement-breakpoint
ALTER FUNCTION app.seed_reference_catalog_after_organization_insert() OWNER TO app_owner;
--> statement-breakpoint

-- Keep the execute surface exactly as it was: the trigger runs as the table owner, and no
-- application role may call either routine directly.
REVOKE ALL ON FUNCTION app.seed_reference_catalog_snapshot(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.seed_reference_catalog_after_organization_insert() FROM PUBLIC;
