-- PROOF 5: Transfer + headless background job simulation
-- (a) Copy Carol's rows from tenant_a → tenant_b (schema-to-schema INSERT…SELECT)
-- (b) Simulate background job: given person_id, look up schema via directory,
--     set search_path, UPDATE reminder SET sent=true in the RIGHT schema only.

-- 5a. Add a reminder for Carol in each tenant (one unsent each)
INSERT INTO tenant_a.reminder (id, patient_user_id, due_at, sent) VALUES
    ('a1a1a1a1-1111-0000-0000-000000000001',
     'cccccccc-0000-0000-0000-000000000001',
     now() + interval '1 hour',
     false);

INSERT INTO tenant_b.reminder (id, patient_user_id, due_at, sent) VALUES
    ('b1b1b1b1-1111-0000-0000-000000000001',
     'cccccccc-0000-0000-0000-000000000001',
     now() + interval '2 hours',
     false);

-- ----- PROOF 5a: Transfer -----
-- Copy ALL clinical_diagnosis rows for Carol from tenant_a → tenant_b
-- (Use a new id to avoid PK collision; the original from Proof 4 already exists in tenant_b)
INSERT INTO tenant_b.clinical_diagnosis (id, patient_user_id, dx, icd_code, created_at)
SELECT
    gen_random_uuid(),  -- new id (original row already in both)
    patient_user_id,
    dx || ' [transferred from tenant_a]',
    icd_code,
    now()
FROM tenant_a.clinical_diagnosis
WHERE patient_user_id = 'cccccccc-0000-0000-0000-000000000001'
ON CONFLICT DO NOTHING;

-- Verify transfer: count Carol rows in tenant_b (should now include transferred+original)
SELECT 'tenant_b after transfer' AS label,
       count(*)                   AS dx_rows
FROM tenant_b.clinical_diagnosis
WHERE patient_user_id = 'cccccccc-0000-0000-0000-000000000001';

-- Show all Carol rows in tenant_b so we can confirm data intact
SELECT 'tenant_b' AS schema, dx, icd_code
FROM tenant_b.clinical_diagnosis
WHERE patient_user_id = 'cccccccc-0000-0000-0000-000000000001'
ORDER BY dx;

-- ----- PROOF 5b: Headless job simulation -----
-- A plpgsql function simulates a background worker:
-- given a person_id, look up schema in directory.person_tenant (first schema found),
-- set search_path, UPDATE reminder SET sent=true, return affected row count.
CREATE OR REPLACE FUNCTION simulate_reminder_job(p_person_id uuid, p_target_schema text)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
    v_schema  text;
    v_count   int;
BEGIN
    -- Look up the person's enrollment in the directory
    SELECT schema_name INTO v_schema
    FROM directory.person_tenant
    WHERE person_id = p_person_id
      AND schema_name = p_target_schema
    LIMIT 1;

    IF v_schema IS NULL THEN
        RAISE EXCEPTION 'Person % not enrolled in schema %', p_person_id, p_target_schema;
    END IF;

    -- Set search_path to the resolved schema (mimics what the app does per-request)
    PERFORM set_config('search_path', v_schema || ',public', true);  -- local to transaction

    -- Update reminder (unqualified table name resolves via search_path)
    EXECUTE format(
        'UPDATE %I.reminder SET sent = true WHERE patient_user_id = $1 AND sent = false',
        v_schema
    ) USING p_person_id;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RAISE NOTICE 'simulate_reminder_job: schema=%, rows_updated=%', v_schema, v_count;
    RETURN v_count;
END;
$$;

-- Run job for tenant_a only — must NOT touch tenant_b reminder
SELECT 'job result (tenant_a)' AS label,
       simulate_reminder_job(
           'cccccccc-0000-0000-0000-000000000001',
           'tenant_a'
       ) AS rows_updated;

-- Verify: tenant_a reminder is now sent=true
SELECT 'tenant_a reminder' AS schema, sent FROM tenant_a.reminder
WHERE patient_user_id = 'cccccccc-0000-0000-0000-000000000001';

-- Verify: tenant_b reminder is STILL sent=false (job only touched tenant_a)
SELECT 'tenant_b reminder' AS schema, sent FROM tenant_b.reminder
WHERE patient_user_id = 'cccccccc-0000-0000-0000-000000000001';
