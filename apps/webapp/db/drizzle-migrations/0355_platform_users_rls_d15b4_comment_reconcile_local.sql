-- TEMPORARY LOCAL MIGRATION NUMBER 0355
-- RECONCILES-MIGRATION-HASH: 0353_platform_users_rls_d15b4_local
--
-- #1057: deploying feat/doctor-ui-rebuild to TEST for the live billing payment failed the
-- migration ledger completeness check with `migration_ledger_incomplete tags=0353_platform_users_
-- rls_d15b4_local`, even though `drizzle.__drizzle_migrations` already has a row at 0353's journal
-- `when` slot. Cause: TEST had 0353 applied from an EARLIER checkout of this branch, before commit
-- `60ab00db5` edited 0353's file to retract a false owner attribution inside a comment (no DDL
-- changed -- verified by diff, the edit touches only comment text). That comment edit changed
-- 0353's file hash, so the hash recorded in the ledger from the earlier apply no longer matches the
-- current file, and the installed migrator compares by hash, not by tag (see this file's own
-- completeness check in `run-webapp-drizzle-migrate.mjs`). Same repair idiom as `0330`/`0331`/
-- `0345`/`0349`: an append-only forward migration that reapplies 0353's body verbatim (every
-- statement is `DROP POLICY IF EXISTS` / `CREATE POLICY` / `ALTER TABLE ... ENABLE|FORCE ROW LEVEL
-- SECURITY`, so re-running it is a no-op wherever it already landed) and declares the
-- reconciliation. 0353's own file is untouched.

DROP POLICY IF EXISTS c4_web_push_reminder_discovery ON public.platform_users;
--> statement-breakpoint
DROP POLICY IF EXISTS c4_web_push_reminder_user ON public.platform_users;
--> statement-breakpoint

ALTER TABLE public.platform_users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.platform_users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS platform_users_self_select ON public.platform_users;
--> statement-breakpoint
CREATE POLICY platform_users_self_select ON public.platform_users
  FOR SELECT TO app_patient
  USING (app.current_patient_user_id() IS NOT NULL AND id = app.current_patient_user_id());
--> statement-breakpoint

DROP POLICY IF EXISTS platform_users_self_update ON public.platform_users;
--> statement-breakpoint
CREATE POLICY platform_users_self_update ON public.platform_users
  FOR UPDATE TO app_patient
  USING (app.current_patient_user_id() IS NOT NULL AND id = app.current_patient_user_id())
  WITH CHECK (app.current_patient_user_id() IS NOT NULL AND id = app.current_patient_user_id());
--> statement-breakpoint

DROP POLICY IF EXISTS platform_users_staff_org_select ON public.platform_users;
--> statement-breakpoint
CREATE POLICY platform_users_staff_org_select ON public.platform_users
  FOR SELECT TO app_staff
  USING (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.org_enrollments oe
        WHERE oe.platform_user_id = platform_users.id
          AND oe.organization_id = app.current_org_id()
      )
      OR EXISTS (
        SELECT 1 FROM public.be_organization_members bom
        WHERE bom.platform_user_id = platform_users.id
          AND bom.organization_id = app.current_org_id()
      )
    )
  );
--> statement-breakpoint

DROP POLICY IF EXISTS platform_users_staff_org_update ON public.platform_users;
--> statement-breakpoint
CREATE POLICY platform_users_staff_org_update ON public.platform_users
  FOR UPDATE TO app_staff
  USING (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.org_enrollments oe
        WHERE oe.platform_user_id = platform_users.id
          AND oe.organization_id = app.current_org_id()
      )
      OR EXISTS (
        SELECT 1 FROM public.be_organization_members bom
        WHERE bom.platform_user_id = platform_users.id
          AND bom.organization_id = app.current_org_id()
      )
    )
  )
  WITH CHECK (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.org_enrollments oe
        WHERE oe.platform_user_id = platform_users.id
          AND oe.organization_id = app.current_org_id()
      )
      OR EXISTS (
        SELECT 1 FROM public.be_organization_members bom
        WHERE bom.platform_user_id = platform_users.id
          AND bom.organization_id = app.current_org_id()
      )
    )
  );
--> statement-breakpoint

DROP POLICY IF EXISTS platform_users_staff_org_delete ON public.platform_users;
--> statement-breakpoint
CREATE POLICY platform_users_staff_org_delete ON public.platform_users
  FOR DELETE TO app_staff
  USING (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.org_enrollments oe
        WHERE oe.platform_user_id = platform_users.id
          AND oe.organization_id = app.current_org_id()
      )
      OR EXISTS (
        SELECT 1 FROM public.be_organization_members bom
        WHERE bom.platform_user_id = platform_users.id
          AND bom.organization_id = app.current_org_id()
      )
    )
  );
--> statement-breakpoint

DROP POLICY IF EXISTS platform_users_staff_insert ON public.platform_users;
--> statement-breakpoint
CREATE POLICY platform_users_staff_insert ON public.platform_users
  FOR INSERT TO app_staff
  WITH CHECK (app.is_staff());
--> statement-breakpoint

DROP POLICY IF EXISTS platform_users_identity_bootstrap_select ON public.platform_users;
--> statement-breakpoint
CREATE POLICY platform_users_identity_bootstrap_select ON public.platform_users
  FOR SELECT
  USING (pg_has_role(current_user, 'app_identity_bootstrap', 'member'));
--> statement-breakpoint

DROP POLICY IF EXISTS platform_users_identity_bootstrap_insert ON public.platform_users;
--> statement-breakpoint
CREATE POLICY platform_users_identity_bootstrap_insert ON public.platform_users
  FOR INSERT
  WITH CHECK (pg_has_role(current_user, 'app_identity_bootstrap', 'member'));
--> statement-breakpoint

DROP POLICY IF EXISTS platform_users_identity_bootstrap_update ON public.platform_users;
--> statement-breakpoint
CREATE POLICY platform_users_identity_bootstrap_update ON public.platform_users
  FOR UPDATE
  USING (pg_has_role(current_user, 'app_identity_bootstrap', 'member'))
  WITH CHECK (pg_has_role(current_user, 'app_identity_bootstrap', 'member'));
