-- PROOF 2: Migration loop — system update across all tenant schemas
-- Adds icd_code text to clinical_diagnosis in template, then applies to all tenant_% schemas.

-- 2a. Add column to template first (source of truth)
ALTER TABLE tenant_template.clinical_diagnosis
    ADD COLUMN IF NOT EXISTS icd_code text;

-- 2b. Migration loop: apply to every schema matching 'tenant_%'
DO $$
DECLARE
    r       record;
    n       int := 0;
    t_start timestamptz := clock_timestamp();
BEGIN
    FOR r IN
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name LIKE 'tenant_%'
          AND schema_name <> 'tenant_template'
        ORDER BY schema_name
    LOOP
        EXECUTE format(
            'ALTER TABLE %I.clinical_diagnosis ADD COLUMN IF NOT EXISTS icd_code text',
            r.schema_name
        );
        n := n + 1;
        RAISE NOTICE 'Migrated schema: % (elapsed: %ms)',
            r.schema_name,
            round(extract(milliseconds FROM (clock_timestamp() - t_start))::numeric, 2);
    END LOOP;

    RAISE NOTICE '=== Migration complete: % schemas updated in %ms ===',
        n,
        round(extract(milliseconds FROM (clock_timestamp() - t_start))::numeric, 2);
END;
$$;

-- 2c. Verify: every tenant_% schema has the new column
SELECT
    c.table_schema,
    c.column_name,
    c.data_type,
    CASE WHEN c.column_name IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS result
FROM information_schema.schemata s
JOIN information_schema.columns c
     ON c.table_schema = s.schema_name
    AND c.table_name   = 'clinical_diagnosis'
    AND c.column_name  = 'icd_code'
WHERE s.schema_name LIKE 'tenant_%'
  AND s.schema_name <> 'tenant_template'
ORDER BY c.table_schema;

-- Count: how many tenant schemas got the column (should equal count of tenant_% schemas)
SELECT
    (SELECT count(*) FROM information_schema.schemata
     WHERE schema_name LIKE 'tenant_%' AND schema_name <> 'tenant_template') AS total_tenants,
    (SELECT count(*) FROM information_schema.columns
     WHERE table_schema LIKE 'tenant_%'
       AND table_schema <> 'tenant_template'
       AND table_name = 'clinical_diagnosis'
       AND column_name = 'icd_code') AS schemas_with_new_col;
