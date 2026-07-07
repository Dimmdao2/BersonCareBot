ALTER TABLE reference_categories
  ADD COLUMN IF NOT EXISTS organization_id uuid;

CREATE INDEX IF NOT EXISTS idx_reference_categories_organization_id
  ON reference_categories USING btree (organization_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reference_categories_organization_id_fkey'
      AND conrelid = 'reference_categories'::regclass
  ) THEN
    ALTER TABLE reference_categories
      ADD CONSTRAINT reference_categories_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_org_count integer;
  v_stale_owner_count bigint;
  v_stale_tenant_count bigint;
BEGIN
  SELECT count(*)::integer
  INTO v_org_count
  FROM be_organizations
  WHERE id = v_default_org_id;

  IF v_org_count <> 1 THEN
    RAISE EXCEPTION 'P0.4.RC expected default organization %, found %', v_default_org_id, v_org_count;
  END IF;

  SELECT count(*) FILTER (WHERE owner_id IS NOT NULL), count(*) FILTER (WHERE tenant_id IS NOT NULL)
  INTO v_stale_owner_count, v_stale_tenant_count
  FROM reference_categories;

  IF v_stale_owner_count <> 0 OR v_stale_tenant_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.RC expected stale owner_id/tenant_id to be unused, found owner rows %, tenant rows %',
      v_stale_owner_count,
      v_stale_tenant_count;
  END IF;

  UPDATE reference_categories
  SET organization_id = v_default_org_id
  WHERE organization_id IS NULL;

  UPDATE reference_items target
  SET organization_id = parent.organization_id
  FROM reference_categories parent
  WHERE target.category_id = parent.id
    AND target.organization_id IS DISTINCT FROM parent.organization_id;
END $$;

DO $$
DECLARE
  v_null_count bigint;
  v_mismatch_count bigint;
BEGIN
  SELECT count(*) FILTER (WHERE organization_id IS NULL)
  INTO v_null_count
  FROM reference_categories;

  IF v_null_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.RC expected no NULL reference_categories.organization_id rows, found %', v_null_count;
  END IF;

  SELECT count(*)::bigint
  INTO v_mismatch_count
  FROM reference_items item
  JOIN reference_categories category
    ON category.id = item.category_id
  WHERE item.organization_id IS DISTINCT FROM category.organization_id;

  IF v_mismatch_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.RC expected reference_items to match reference_categories org, found %', v_mismatch_count;
  END IF;
END $$;
