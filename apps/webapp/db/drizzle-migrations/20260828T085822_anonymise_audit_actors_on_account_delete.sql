-- BCB-MIGRATION-OWNER: app_object_owner
-- These append-only journals retain the event but must release the deleted actor identity.
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 3 FROM pg_catalog.pg_constraint WHERE conname IN ('system_settings_audit_changed_by_fkey', 'organization_slug_rename_events_actor_fkey', 'online_intake_status_history_changed_by_fkey') AND confdeltype = 'n'
ALTER TABLE public.system_settings_audit
  DROP CONSTRAINT system_settings_audit_changed_by_fkey,
  ADD CONSTRAINT system_settings_audit_changed_by_fkey
    FOREIGN KEY (changed_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.organization_slug_rename_events
  DROP CONSTRAINT organization_slug_rename_events_actor_fkey,
  ADD CONSTRAINT organization_slug_rename_events_actor_fkey
    FOREIGN KEY (actor_platform_user_id) REFERENCES public.platform_users(id) ON DELETE SET NULL;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.online_intake_status_history
  DROP CONSTRAINT online_intake_status_history_changed_by_fkey,
  ADD CONSTRAINT online_intake_status_history_changed_by_fkey
    FOREIGN KEY (changed_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;
