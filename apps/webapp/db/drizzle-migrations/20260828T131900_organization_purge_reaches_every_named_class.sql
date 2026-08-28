-- BCB-MIGRATION-OWNER: app_object_owner
-- Organization purge must actually reach every class the lifecycle registry names for it.
-- Exhaustive lifecycle census audit 2026-08-28, F3: four relations declared `orgPurge:
-- organization_id` while the database either knew nothing about the reference (no FK at all, so the
-- raw clinic uuid simply survived) or refused the delete outright (default NO ACTION). Measured
-- read-only on bcb_webapp_dev: outgoing_delivery_queue 117 rows / 2 organizations,
-- media_playback_stats_hourly 10 / 1, organization_slug_claims 5, organization_slug_rename_events 2,
-- manual_patient_commands 0 (empty today, but reaching the clinic through a NO ACTION composite FK
-- to org_enrollments all the same). No orphan row exists in either managed database, so every
-- constraint below is satisfiable as written.
--
-- The queue and the hourly rollup are clinic-owned operational rows: they go with the clinic.
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 5 FROM pg_catalog.pg_constraint WHERE (conname IN ('outgoing_delivery_queue_organization_id_fkey', 'media_playback_stats_hourly_organization_id_fkey', 'manual_patient_commands_enrollment_fkey') AND confdeltype = 'c') OR (conname IN ('organization_slug_claims_organization_id_fkey', 'organization_slug_rename_events_organization_id_fkey') AND confdeltype = 'n')
ALTER TABLE public.outgoing_delivery_queue
  ADD CONSTRAINT outgoing_delivery_queue_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.media_playback_stats_hourly
  ADD CONSTRAINT media_playback_stats_hourly_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- The idempotency ledger of staff-issued manual commands reaches the clinic only through the
-- enrollment pair, with the default NO ACTION: the row both refused the organization delete and
-- (audit 2026-08-28, F1) refused the ACCOUNT delete of every patient who ever received a manual
-- command. `org_enrollments` cascades from both parents, so cascading from it is the whole answer.
ALTER TABLE public.manual_patient_commands
  DROP CONSTRAINT manual_patient_commands_enrollment_fkey,
  ADD CONSTRAINT manual_patient_commands_enrollment_fkey
    FOREIGN KEY (organization_id, platform_user_id)
    REFERENCES public.org_enrollments(organization_id, platform_user_id) ON DELETE CASCADE;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- A cascading composite FK is checked by the referenced side on every enrollment delete, and the
-- existing index leads with (organization_id, created_at), which cannot serve it. The table is
-- empty in both managed databases, so a plain CREATE INDEX is free here.
CREATE INDEX IF NOT EXISTS idx_manual_patient_commands_enrollment
  ON public.manual_patient_commands (organization_id, platform_user_id);

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- The two slug relations are the opposite case: they must SURVIVE the clinic, unlinked. Deleting a
-- claim would release the public slug for anyone to take over, and deleting a rename event would
-- erase the proof that the slug was ever held — which is the only reason either table exists. So
-- the clinic reference becomes nullable and is nulled by the database itself, leaving a tombstone
-- that still holds the name. `uq_organization_slug_claims_current_org` is a partial unique index
-- over organization_id, and distinct NULLs do not collide, so any number of tombstones is fine.
ALTER TABLE public.organization_slug_claims
  ALTER COLUMN organization_id DROP NOT NULL;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.organization_slug_claims
  DROP CONSTRAINT organization_slug_claims_organization_id_fkey,
  ADD CONSTRAINT organization_slug_claims_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE SET NULL;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.organization_slug_rename_events
  ALTER COLUMN organization_id DROP NOT NULL;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.organization_slug_rename_events
  DROP CONSTRAINT organization_slug_rename_events_organization_id_fkey,
  ADD CONSTRAINT organization_slug_rename_events_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE SET NULL;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- A tombstone the database refuses to write is not a tombstone. Both slug guards are BEFORE DELETE
-- OR UPDATE and reject every mutation of a durable row, so with them unchanged the SET NULL above
-- would simply move the organization delete's refusal from the constraint to the trigger — measured
-- live: `DELETE FROM be_organizations` raised «organization slug aliases are immutable outside
-- same-organization reclaim». The guards exist to stop a slug being RETARGETED or erased; releasing
-- a dead clinic's claim to NULL is neither. Exactly one new transition is allowed, and only when
-- nothing else on the row moves.
-- BCB-MIGRATION-VERIFY: SELECT position('organization released' in pg_get_functiondef('app.guard_organization_slug_claim_mutation()'::regprocedure)) > 0 AND position('organization released' in pg_get_functiondef('app.guard_organization_slug_rename_event_mutation()'::regprocedure)) > 0
CREATE OR REPLACE FUNCTION app.guard_organization_slug_claim_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  -- organization released: the clinic row is gone and the FK nulled the reference. The claim stays
  -- exactly as it was in every other respect, so the public slug it holds cannot be taken over.
  IF TG_OP = 'UPDATE'
     AND OLD.organization_id IS NOT NULL
     AND NEW.organization_id IS NULL
     AND NEW.kind IS NOT DISTINCT FROM OLD.kind
     AND NEW.slug IS NOT DISTINCT FROM OLD.slug
  THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' AND OLD.kind IN ('current', 'alias') THEN
    RAISE EXCEPTION 'durable organization slug claims cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.kind = 'alias' AND (
    NEW.kind <> 'current'
    OR NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
  ) THEN
    RAISE EXCEPTION 'organization slug aliases are immutable outside same-organization reclaim';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.kind = 'current' AND (
    NEW.kind NOT IN ('current', 'alias')
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR (NEW.kind = 'alias' AND NEW.slug IS DISTINCT FROM OLD.slug)
  ) THEN
    RAISE EXCEPTION 'current organization slug target is immutable outside same-organization reclaim';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.kind = 'reservation' AND NEW.kind NOT IN ('reservation', 'current') THEN
    RAISE EXCEPTION 'invalid organization slug reservation transition';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- The rename audit stays append-only in the sense that matters: no row may be deleted, and no
-- recorded FACT of the rename may be edited. The two identity references are not facts of the
-- rename — they are links to rows that can legitimately disappear, and the lifecycle registry
-- declares both as released rather than deleted. Without this the actor SET NULL installed by
-- 20260828T085822_anonymise_audit_actors_on_account_delete.sql could never fire either: this guard
-- would refuse it and the account delete would fail instead of anonymising.
CREATE OR REPLACE FUNCTION app.guard_organization_slug_rename_event_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  -- organization released / actor released: identity links only, everything recorded stays put.
  IF TG_OP = 'UPDATE'
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.initiated_by IS NOT DISTINCT FROM OLD.initiated_by
     AND NEW.previous_slug IS NOT DISTINCT FROM OLD.previous_slug
     AND NEW.next_slug IS NOT DISTINCT FROM OLD.next_slug
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND (
       (OLD.organization_id IS NOT NULL AND NEW.organization_id IS NULL)
       OR NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
     )
     AND (
       (OLD.actor_platform_user_id IS NOT NULL AND NEW.actor_platform_user_id IS NULL)
       OR NEW.actor_platform_user_id IS NOT DISTINCT FROM OLD.actor_platform_user_id
     )
     AND (
       NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.actor_platform_user_id IS DISTINCT FROM OLD.actor_platform_user_id
     )
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'organization slug rename audit is append-only';
END
$function$;
