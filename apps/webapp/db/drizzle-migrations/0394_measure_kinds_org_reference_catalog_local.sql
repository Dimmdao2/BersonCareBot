-- 0394: measurement kinds are a clinic-owned reference catalog, not a mutable global pool.
-- Preserve any legacy global rows by copying them into every existing organization, extend the
-- baseline for future organizations, then remove the obsolete table and capability functions.

INSERT INTO public.reference_catalog_baselines (version, definition_json)
SELECT 2,
       jsonb_set(
         baseline.definition_json,
         '{categories}',
         (baseline.definition_json->'categories') || jsonb_build_array(jsonb_build_object(
           'code', 'clinical_test_measure_kind',
           'title', 'Виды измерений (клинические тесты)',
           'isUserExtensible', true,
           'items', '[]'::jsonb
         ))
       )
FROM public.reference_catalog_baselines AS baseline
ORDER BY baseline.version DESC
LIMIT 1
ON CONFLICT (version) DO NOTHING;

INSERT INTO public.reference_categories (organization_id, code, title, is_user_extensible)
SELECT organization.id,
       'clinical_test_measure_kind',
       'Виды измерений (клинические тесты)',
       true
FROM public.be_organizations AS organization
ON CONFLICT (organization_id, code) DO NOTHING;

INSERT INTO public.reference_items (
  organization_id, category_id, code, title, sort_order, is_active, meta_json
)
SELECT category.organization_id,
       category.id,
       measure_kind.code,
       measure_kind.label,
       measure_kind.sort_order,
       true,
       '{}'::jsonb
FROM public.reference_categories AS category
CROSS JOIN public.clinical_test_measure_kinds AS measure_kind
WHERE category.code = 'clinical_test_measure_kind'
ON CONFLICT (category_id, code) DO NOTHING;

DROP FUNCTION app.list_clinical_test_measure_kinds();
DROP FUNCTION app.upsert_clinical_test_measure_kind_by_label(text);
DROP FUNCTION app.save_clinical_test_measure_kinds(jsonb);
DROP TABLE public.clinical_test_measure_kinds;
