ALTER TABLE integrator.mailings
  ADD COLUMN IF NOT EXISTS organization_id uuid;

CREATE INDEX IF NOT EXISTS idx_mailings_organization_id
  ON integrator.mailings USING btree (organization_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mailings_organization_id_fkey'
      AND conrelid = 'integrator.mailings'::regclass
  ) THEN
    ALTER TABLE integrator.mailings
      ADD CONSTRAINT mailings_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_org_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_org_count
  FROM public.be_organizations
  WHERE id = v_default_org_id;

  IF v_org_count <> 1 THEN
    RAISE EXCEPTION 'P0.4.I4 expected default organization %, found %', v_default_org_id, v_org_count;
  END IF;

  UPDATE integrator.mailings
  SET organization_id = v_default_org_id
  WHERE organization_id IS NULL;
END $$;

DO $$
DECLARE
  v_null_count bigint;
BEGIN
  SELECT count(*) FILTER (WHERE organization_id IS NULL)
  INTO v_null_count
  FROM integrator.mailings;

  IF v_null_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.I4 expected no NULL mailings.organization_id rows, found %', v_null_count;
  END IF;
END $$;
