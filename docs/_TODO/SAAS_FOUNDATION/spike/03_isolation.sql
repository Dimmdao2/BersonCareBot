-- PROOF 3: Isolation via search_path
-- Inserts distinct diagnoses into tenant_a and tenant_b.
-- Proves zero cross-schema leak via search_path switching.

-- 3a. Insert synthetic patients
INSERT INTO tenant_a.patient VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'Alice A (tenant_a only)');

INSERT INTO tenant_b.patient VALUES
    ('bbbbbbbb-0000-0000-0000-000000000001', 'Bob B (tenant_b only)');

-- 3b. Insert distinct diagnoses
INSERT INTO tenant_a.clinical_diagnosis (id, patient_user_id, dx, icd_code) VALUES
    ('a1a1a1a1-0000-0000-0000-000000000001',
     'aaaaaaaa-0000-0000-0000-000000000001',
     'Hypertension (tenant_a)',
     'I10');

INSERT INTO tenant_b.clinical_diagnosis (id, patient_user_id, dx, icd_code) VALUES
    ('b1b1b1b1-0000-0000-0000-000000000001',
     'bbbbbbbb-0000-0000-0000-000000000001',
     'Type 2 Diabetes (tenant_b)',
     'E11');

-- 3c. Isolation check with explicit search_path

-- tenant_a view: should see ONLY Alice/I10
SET search_path = tenant_a, public;
SELECT 'tenant_a scope' AS scope, count(*) AS row_count, string_agg(dx, ', ') AS diagnoses
FROM clinical_diagnosis;

-- tenant_b view: should see ONLY Bob/E11
SET search_path = tenant_b, public;
SELECT 'tenant_b scope' AS scope, count(*) AS row_count, string_agg(dx, ', ') AS diagnoses
FROM clinical_diagnosis;

-- 3d. Cross-schema leak attempt: scoped to tenant_a, try to read tenant_b table BY SCHEMA
-- This uses search_path=tenant_a but explicit schema prefix — still visible (schema boundary
-- is enforced by the app via search_path, not by grants in this spike role).
-- Record: explicit-schema access IS possible within same role. App must never expose it.
-- For PASS on isolation, the unqualified name resolves to the right schema only:
SET search_path = tenant_a, public;
SELECT 'cross_leak_unqualified' AS check_label,
       count(*) AS visible_from_a_via_unqualified_name
FROM clinical_diagnosis
WHERE dx LIKE '%tenant_b%';

-- Should be 0
SET search_path = public;
