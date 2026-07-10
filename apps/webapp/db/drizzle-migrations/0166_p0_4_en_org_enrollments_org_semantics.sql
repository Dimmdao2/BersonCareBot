-- 0166: P0.4.EN supplemental — org_enrollments organization_id tenant-semantics validation.
-- org_enrollments already has organization_id uuid NOT NULL from creation
-- (0144_org_enrollments.sql) and is fully seeded for existing clients (0145_seed_client_org_enrollments.sql).
-- This migration adds no schema change; it only proves the P0.10.3 no-NULL invariant so
-- org_enrollments can be classified SCOPED in tiers-218.tsv, matching the same
-- "already_direct_org" pattern used for public.patient_merge_candidates in P0.4.P1
-- (0146_p0_4_p1_clinical_ehr_org.sql). Tracked in docs/_TODO/SAAS_FOUNDATION/LOG.md (taskdb #648).

DO $$
DECLARE
  v_null_count bigint;
BEGIN
  SELECT count(*) FILTER (WHERE organization_id IS NULL)
  INTO v_null_count
  FROM org_enrollments;

  IF v_null_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.EN expected no NULL organization_id rows, found %', v_null_count;
  END IF;
END $$;
