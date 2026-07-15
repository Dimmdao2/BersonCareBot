-- Close the live cutover race between organization INSERT and catalog snapshot migrations.
-- Drizzle executes this migration transactionally. The lock is deliberately the first operation:
-- inserts either commit before the lock and are caught below, or wait until commit and fire the hook.

LOCK TABLE public.be_organizations IN SHARE ROW EXCLUSIVE MODE;

-- The permanent strict-RLS overlay is refreshed after migrations. Give only the existing seed
-- helper owner a temporary no-receipt surface so catch-up also works when FORCE RLS is already on.
DO $$
DECLARE
  v_helper_owner text;
BEGIN
  SELECT pg_get_userbyid(proowner) INTO STRICT v_helper_owner
  FROM pg_proc
  WHERE oid = 'app.seed_reference_catalog_snapshot(uuid)'::regprocedure;
  EXECUTE format(
    'CREATE POLICY reference_catalog_migration_seed ON public.reference_categories FOR ALL TO %I USING (current_user = %L AND NOT EXISTS (SELECT 1 FROM public.reference_catalog_snapshot_receipts receipt WHERE receipt.organization_id = reference_categories.organization_id)) WITH CHECK (current_user = %L AND NOT EXISTS (SELECT 1 FROM public.reference_catalog_snapshot_receipts receipt WHERE receipt.organization_id = reference_categories.organization_id))',
    v_helper_owner, v_helper_owner, v_helper_owner
  );
  EXECUTE format(
    'CREATE POLICY reference_catalog_migration_seed ON public.reference_items FOR ALL TO %I USING (current_user = %L AND NOT EXISTS (SELECT 1 FROM public.reference_catalog_snapshot_receipts receipt WHERE receipt.organization_id = reference_items.organization_id)) WITH CHECK (current_user = %L AND NOT EXISTS (SELECT 1 FROM public.reference_catalog_snapshot_receipts receipt WHERE receipt.organization_id = reference_items.organization_id))',
    v_helper_owner, v_helper_owner, v_helper_owner
  );
END
$$;

CREATE OR REPLACE FUNCTION app.seed_reference_catalog_after_organization_insert()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM app.seed_reference_catalog_snapshot(NEW.id);
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION app.seed_reference_catalog_after_organization_insert() FROM PUBLIC;

DROP TRIGGER IF EXISTS be_organizations_reference_catalog_snapshot ON public.be_organizations;
CREATE TRIGGER be_organizations_reference_catalog_snapshot
AFTER INSERT ON public.be_organizations
FOR EACH ROW
EXECUTE FUNCTION app.seed_reference_catalog_after_organization_insert();

-- 0183 could have observed an organization inserted after 0182's backfill snapshot and recorded a
-- v1 receipt for it despite the organization having no catalog at all. A seed is atomic, so zero
-- categories is the precise interrupted-cutover shape; remove only those invalid receipts.
DELETE FROM public.reference_catalog_snapshot_receipts receipt
WHERE NOT EXISTS (
  SELECT 1
  FROM public.reference_categories category
  WHERE category.organization_id = receipt.organization_id
);

-- Never manufacture a receipt. Every organization still lacking one goes through the canonical
-- receipt-backed helper while the organization INSERT lock remains held.
DO $$
DECLARE
  v_organization record;
BEGIN
  FOR v_organization IN
    SELECT organization.id
    FROM public.be_organizations organization
    LEFT JOIN public.reference_catalog_snapshot_receipts receipt
      ON receipt.organization_id = organization.id
    WHERE receipt.organization_id IS NULL
    ORDER BY organization.id
  LOOP
    PERFORM app.seed_reference_catalog_snapshot(v_organization.id);
  END LOOP;
END
$$;

DROP POLICY reference_catalog_migration_seed ON public.reference_categories;
DROP POLICY reference_catalog_migration_seed ON public.reference_items;

COMMENT ON TRIGGER be_organizations_reference_catalog_snapshot ON public.be_organizations IS
  'Atomic organization provisioning invariant: every committed organization has one immutable reference catalog snapshot receipt.';
