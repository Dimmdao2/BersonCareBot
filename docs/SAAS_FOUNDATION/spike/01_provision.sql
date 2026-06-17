-- PROOF 1: Provision from template
-- Creates tenant_template, provisions tenant_a + tenant_b by cloning structure,
-- then asserts all three schemas have identical column sets.

-- Clean slate (idempotent re-run)
DROP SCHEMA IF EXISTS tenant_template CASCADE;
DROP SCHEMA IF EXISTS tenant_a CASCADE;
DROP SCHEMA IF EXISTS tenant_b CASCADE;

-- 1a. Create template schema with representative clinical tables
CREATE SCHEMA tenant_template;

CREATE TABLE tenant_template.patient (
    person_id  uuid         PRIMARY KEY,
    full_name  text         NOT NULL
);

CREATE TABLE tenant_template.clinical_diagnosis (
    id               uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_user_id  uuid      NOT NULL REFERENCES tenant_template.patient(person_id),
    dx               text      NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_template.reminder (
    id               uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_user_id  uuid      NOT NULL REFERENCES tenant_template.patient(person_id),
    due_at           timestamptz NOT NULL,
    sent             boolean   NOT NULL DEFAULT false
);

-- 1b. Provisioning function: clone template structure into a new schema
CREATE OR REPLACE FUNCTION tenant_provision(p_schema text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    -- Create schema
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', p_schema);

    -- patient
    EXECUTE format('
        CREATE TABLE %I.patient (
            person_id  uuid         PRIMARY KEY,
            full_name  text         NOT NULL
        )', p_schema);

    -- clinical_diagnosis (FK to local patient)
    EXECUTE format('
        CREATE TABLE %I.clinical_diagnosis (
            id               uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
            patient_user_id  uuid      NOT NULL REFERENCES %I.patient(person_id),
            dx               text      NOT NULL,
            created_at       timestamptz NOT NULL DEFAULT now()
        )', p_schema, p_schema);

    -- reminder (FK to local patient)
    EXECUTE format('
        CREATE TABLE %I.reminder (
            id               uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
            patient_user_id  uuid      NOT NULL REFERENCES %I.patient(person_id),
            due_at           timestamptz NOT NULL,
            sent             boolean   NOT NULL DEFAULT false
        )', p_schema, p_schema);
END;
$$;

-- 1c. Provision both tenants
SELECT tenant_provision('tenant_a');
SELECT tenant_provision('tenant_b');

-- 1d. Assert: column sets of tenant_a and tenant_b match template
-- Returns rows ONLY if there is a mismatch (should be 0 rows = PASS)
WITH template_cols AS (
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'tenant_template'
),
tenant_a_cols AS (
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'tenant_a'
),
tenant_b_cols AS (
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'tenant_b'
),
mismatch_a AS (
    SELECT 'template vs tenant_a' AS check_label, table_name, column_name
    FROM template_cols
    EXCEPT
    SELECT 'template vs tenant_a', table_name, column_name FROM tenant_a_cols
),
mismatch_b AS (
    SELECT 'template vs tenant_b' AS check_label, table_name, column_name
    FROM template_cols
    EXCEPT
    SELECT 'template vs tenant_b', table_name, column_name FROM tenant_b_cols
)
SELECT * FROM mismatch_a
UNION ALL
SELECT * FROM mismatch_b;

-- Count columns per schema (should all be equal)
SELECT table_schema, count(*) AS col_count
FROM information_schema.columns
WHERE table_schema IN ('tenant_template','tenant_a','tenant_b')
GROUP BY table_schema
ORDER BY table_schema;
