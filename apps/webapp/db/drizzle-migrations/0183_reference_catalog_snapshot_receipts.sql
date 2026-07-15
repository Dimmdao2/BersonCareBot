-- Immutable proof of which baseline was copied when an organization catalog was provisioned.
-- A receipt is written exactly once. Its presence makes every later seed attempt a strict no-op,
-- even when a newer global baseline exists.

CREATE TABLE reference_catalog_snapshot_receipts (
  organization_id uuid PRIMARY KEY
    REFERENCES be_organizations(id) ON DELETE CASCADE,
  baseline_version integer NOT NULL
    REFERENCES reference_catalog_baselines(version),
  seeded_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE reference_catalog_snapshot_receipts IS
  'One immutable baseline-version receipt per organization. Existing organization catalogs are never synchronized or supplemented from later baselines.';

-- Migration 0182 copied baseline v1 into every organization that existed at the cutover.
INSERT INTO reference_catalog_snapshot_receipts (organization_id, baseline_version)
SELECT id, 1
FROM be_organizations
ON CONFLICT (organization_id) DO NOTHING;

CREATE OR REPLACE FUNCTION app.seed_reference_catalog_snapshot(p_organization_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_version integer;
  v_definition jsonb;
  v_category jsonb;
  v_item jsonb;
  v_category_id uuid;
BEGIN
  -- There is no row to lock before the first receipt, so serialize by organization UUID.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 183));

  SELECT baseline_version INTO v_version
  FROM public.reference_catalog_snapshot_receipts
  WHERE organization_id = p_organization_id;
  IF FOUND THEN
    RETURN v_version;
  END IF;

  SELECT version, definition_json INTO STRICT v_version, v_definition
  FROM public.reference_catalog_baselines
  ORDER BY version DESC
  LIMIT 1;

  FOR v_category IN SELECT value FROM jsonb_array_elements(v_definition->'categories') LOOP
    INSERT INTO public.reference_categories (organization_id, code, title, is_user_extensible)
    VALUES (
      p_organization_id,
      v_category->>'code',
      v_category->>'title',
      (v_category->>'isUserExtensible')::boolean
    );
    SELECT id INTO STRICT v_category_id
    FROM public.reference_categories
    WHERE organization_id = p_organization_id AND code = v_category->>'code';

    FOR v_item IN SELECT value FROM jsonb_array_elements(v_category->'items') LOOP
      INSERT INTO public.reference_items (
        organization_id, category_id, code, title, sort_order, is_active, meta_json
      ) VALUES (
        p_organization_id,
        v_category_id,
        v_item->>0,
        v_item->>1,
        (v_item->>2)::integer,
        true,
        COALESCE(v_item->3, '{}'::jsonb)
      );
    END LOOP;
  END LOOP;

  INSERT INTO public.reference_catalog_snapshot_receipts (organization_id, baseline_version)
  VALUES (p_organization_id, v_version);
  RETURN v_version;
END
$$;

REVOKE ALL ON FUNCTION app.seed_reference_catalog_snapshot(uuid) FROM PUBLIC;

-- Anonymous/bootstrap callers receive only the current public baseline, never a tenant catalog.
CREATE OR REPLACE FUNCTION app.get_public_reference_baseline(p_category_code text)
RETURNS TABLE (
  id uuid,
  category_id uuid,
  code text,
  title text,
  sort_order integer,
  is_active boolean,
  deleted_at timestamptz,
  meta_json jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  WITH latest AS (
    SELECT definition_json
    FROM public.reference_catalog_baselines
    ORDER BY version DESC
    LIMIT 1
  ), category AS (
    SELECT value AS definition
    FROM latest, jsonb_array_elements(definition_json->'categories')
    WHERE value->>'code' = p_category_code
      AND p_category_code <> 'visit_manipulation'
  )
  SELECT
    md5('public-reference-item:' || p_category_code || ':' || ((expanded.item_definition::jsonb)->>0))::uuid,
    md5('public-reference-category:' || p_category_code)::uuid,
    (expanded.item_definition::jsonb)->>0,
    (expanded.item_definition::jsonb)->>1,
    ((expanded.item_definition::jsonb)->>2)::integer,
    true,
    NULL::timestamptz,
    COALESCE((expanded.item_definition::jsonb)->3, '{}'::jsonb)
  FROM category
  CROSS JOIN LATERAL jsonb_array_elements(category.definition->'items') AS expanded(item_definition)
  ORDER BY ((expanded.item_definition::jsonb)->>2)::integer, (expanded.item_definition::jsonb)->>1
$$;

REVOKE ALL ON FUNCTION app.get_public_reference_baseline(text) FROM PUBLIC;
