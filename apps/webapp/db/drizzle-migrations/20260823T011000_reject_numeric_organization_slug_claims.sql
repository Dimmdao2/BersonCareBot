-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM pg_constraint AS c WHERE c.conrelid = 'public.organization_slug_claims'::regclass AND c.conname = 'organization_slug_claims_slug_numeric_check' AND pg_get_constraintdef(c.oid) LIKE '%slug !~ ''^[0-9]+$''%')
--
-- B1a: keep the database boundary aligned with the existing all-digits application rule. The
-- reserved-label list remains in its existing constraint; this independent class check does not
-- duplicate that list. Rollback (DEV only): add a timestamped follow-up migration that drops
-- `organization_slug_claims_slug_numeric_check`, then run migrate-dev.sh --preflight and --execute.

ALTER TABLE public.organization_slug_claims
  ADD CONSTRAINT organization_slug_claims_slug_numeric_check
  CHECK (slug !~ '^[0-9]+$');
