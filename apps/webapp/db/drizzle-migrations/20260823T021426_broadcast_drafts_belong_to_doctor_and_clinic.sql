-- BCB-MIGRATION-BACKFILL
-- BCB-MIGRATION-VERIFY: SELECT (SELECT attnotnull FROM pg_catalog.pg_attribute WHERE attrelid = 'public.broadcast_drafts'::regclass AND attname = 'organization_id' AND NOT attisdropped) AND NOT EXISTS (SELECT 1 FROM public.broadcast_drafts WHERE organization_id IS NULL) AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.broadcast_drafts'::regclass AND conname = 'broadcast_drafts_doctor_user_id_organization_id_key' AND contype = 'u' AND conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid = 'public.broadcast_drafts'::regclass AND attname = 'doctor_user_id'), (SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid = 'public.broadcast_drafts'::regclass AND attname = 'organization_id')]::smallint[])
-- Legacy code wrote every draft without a tenant discriminator. A draft is an expendable editing
-- scratchpad, not a clinical document: when exactly one active clinic membership identifies its
-- owner, retain it there; with zero or multiple active memberships, delete the unresolved draft
-- instead of preserving a row that no clinic can safely read or update.
DO $broadcast_drafts_tenant_backfill$
BEGIN
  WITH single_active_membership AS (
    SELECT membership.platform_user_id,
           (array_agg(membership.organization_id ORDER BY membership.organization_id))[1]
             AS organization_id
    FROM public.be_organization_members AS membership
    WHERE membership.status = 'active'
    GROUP BY membership.platform_user_id
    HAVING count(*) = 1
  )
  UPDATE public.broadcast_drafts AS draft
  SET organization_id = membership.organization_id
  FROM single_active_membership AS membership
  WHERE draft.organization_id IS NULL
    AND membership.platform_user_id = draft.doctor_user_id;

  DELETE FROM public.broadcast_drafts
  WHERE organization_id IS NULL;
END
$broadcast_drafts_tenant_backfill$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.broadcast_drafts
  ALTER COLUMN organization_id SET NOT NULL;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.broadcast_drafts
  DROP CONSTRAINT broadcast_drafts_doctor_user_id_key,
  ADD CONSTRAINT broadcast_drafts_doctor_user_id_organization_id_key
    UNIQUE (doctor_user_id, organization_id);
