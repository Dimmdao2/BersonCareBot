-- PROOF 4: Global directory + unique client enrolled in two tenants
-- Creates directory schema with person + person_tenant tables.
-- Enrolls one synthetic person in both tenant_a and tenant_b with separate clinical charts.

-- 4a. Directory schema
DROP SCHEMA IF EXISTS directory CASCADE;
CREATE SCHEMA directory;

CREATE TABLE directory.person (
    person_id  uuid    PRIMARY KEY,
    phone      text    UNIQUE NOT NULL
);

CREATE TABLE directory.person_tenant (
    person_id    uuid  NOT NULL REFERENCES directory.person(person_id),
    schema_name  text  NOT NULL,
    PRIMARY KEY (person_id, schema_name)
);

-- 4b. Synthetic shared person (same person_id in both tenants)
INSERT INTO directory.person VALUES
    ('cccccccc-0000-0000-0000-000000000001', '+70000000001');

-- 4c. Enroll in both tenants in the directory
INSERT INTO directory.person_tenant VALUES
    ('cccccccc-0000-0000-0000-000000000001', 'tenant_a'),
    ('cccccccc-0000-0000-0000-000000000001', 'tenant_b');

-- 4d. Insert the shared person as a patient in each tenant (separate rows, separate charts)
INSERT INTO tenant_a.patient VALUES
    ('cccccccc-0000-0000-0000-000000000001', 'Carol C — chart at tenant_a');

INSERT INTO tenant_b.patient VALUES
    ('cccccccc-0000-0000-0000-000000000001', 'Carol C — chart at tenant_b');

-- Add a distinct diagnosis in each tenant for Carol
INSERT INTO tenant_a.clinical_diagnosis (id, patient_user_id, dx, icd_code) VALUES
    ('c1c1c1c1-a000-0000-0000-000000000001',
     'cccccccc-0000-0000-0000-000000000001',
     'Migraine — tenant_a chart',
     'G43');

INSERT INTO tenant_b.clinical_diagnosis (id, patient_user_id, dx, icd_code) VALUES
    ('c1c1c1c1-b000-0000-0000-000000000001',
     'cccccccc-0000-0000-0000-000000000001',
     'Asthma — tenant_b chart',
     'J45');

-- 4e. Prove: query directory → Carol's tenant list
SELECT 'directory lookup' AS step, p.phone, pt.schema_name
FROM directory.person p
JOIN directory.person_tenant pt ON pt.person_id = p.person_id
WHERE p.person_id = 'cccccccc-0000-0000-0000-000000000001'
ORDER BY pt.schema_name;

-- 4f. Prove: pull Carol's separate diagnosis rows from each schema
SELECT 'tenant_a chart' AS source, dx, icd_code
FROM tenant_a.clinical_diagnosis
WHERE patient_user_id = 'cccccccc-0000-0000-0000-000000000001'

UNION ALL

SELECT 'tenant_b chart' AS source, dx, icd_code
FROM tenant_b.clinical_diagnosis
WHERE patient_user_id = 'cccccccc-0000-0000-0000-000000000001'

ORDER BY source;
