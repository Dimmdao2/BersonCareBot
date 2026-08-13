-- Phase 4 locked-helper RLS policy replacement.
--
-- Default mode is dormant-compatible: existing non-context legacy sessions keep working, but
-- predicates no longer trust raw app.org/app.patient_user_id/app.integrator_user_id GUCs.
--
-- Cutover mode:
--   psql <approved-cutover-connection> -v ON_ERROR_STOP=1 -v phase4_enforce_locked_context=1 \
--     -f deploy/postgres/phase4-locked-helper-rls-policies.sql
--   psql <approved-cutover-connection> -v ON_ERROR_STOP=1 -f deploy/postgres/phase4-force-rls-cutover.sql
--
-- Dormant compatibility mode (default, no flip):
--   psql <approved-cutover-connection> -v ON_ERROR_STOP=1 \
--     -f deploy/postgres/phase4-locked-helper-rls-policies.sql
--
-- Requires deploy/postgres/p2-b-protected-principal-context.sql first. This artifact intentionally
-- contains no environment references or database names.

\set ON_ERROR_STOP on

\if :{?phase4_enforce_locked_context}
\else
\set phase4_enforce_locked_context 0
\endif

SELECT 1 / (:'phase4_enforce_locked_context' IN ('0', '1'))::int AS phase4_enforce_locked_context_is_valid;

BEGIN;

-- integrator.user_reminder_delivery_logs (saas_org_dormant_p0_8_5)
ALTER TABLE "integrator"."user_reminder_delivery_logs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_5" ON "integrator"."user_reminder_delivery_logs";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_5" ON "integrator"."user_reminder_delivery_logs" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_integrator_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "integrator"."user_reminder_occurrences" AS "b4f_occ" JOIN "public"."reminder_rules" AS "b4f_rule" ON "b4f_rule"."integrator_rule_id" = "b4f_occ"."rule_id" WHERE "b4f_occ"."id" = "occurrence_id" AND "b4f_rule"."integrator_user_id" = app.current_integrator_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_integrator_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "integrator"."user_reminder_occurrences" AS "b4f_occ" JOIN "public"."reminder_rules" AS "b4f_rule" ON "b4f_rule"."integrator_rule_id" = "b4f_occ"."rule_id" WHERE "b4f_occ"."id" = "occurrence_id" AND "b4f_rule"."integrator_user_id" = app.current_integrator_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_5" ON "integrator"."user_reminder_delivery_logs" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_integrator_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "integrator"."user_reminder_occurrences" AS "b4f_occ" JOIN "public"."reminder_rules" AS "b4f_rule" ON "b4f_rule"."integrator_rule_id" = "b4f_occ"."rule_id" WHERE "b4f_occ"."id" = "occurrence_id" AND "b4f_rule"."integrator_user_id" = app.current_integrator_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_integrator_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "integrator"."user_reminder_occurrences" AS "b4f_occ" JOIN "public"."reminder_rules" AS "b4f_rule" ON "b4f_rule"."integrator_rule_id" = "b4f_occ"."rule_id" WHERE "b4f_occ"."id" = "occurrence_id" AND "b4f_rule"."integrator_user_id" = app.current_integrator_user_id() )))));
\endif

-- integrator.user_reminder_occurrences (saas_org_dormant_p0_8_5)
ALTER TABLE "integrator"."user_reminder_occurrences" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_5" ON "integrator"."user_reminder_occurrences";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_5" ON "integrator"."user_reminder_occurrences" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_integrator_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."reminder_rules" AS "b4f_rule" WHERE "b4f_rule"."integrator_rule_id" = "rule_id" AND "b4f_rule"."integrator_user_id" = app.current_integrator_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_integrator_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."reminder_rules" AS "b4f_rule" WHERE "b4f_rule"."integrator_rule_id" = "rule_id" AND "b4f_rule"."integrator_user_id" = app.current_integrator_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_5" ON "integrator"."user_reminder_occurrences" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_integrator_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."reminder_rules" AS "b4f_rule" WHERE "b4f_rule"."integrator_rule_id" = "rule_id" AND "b4f_rule"."integrator_user_id" = app.current_integrator_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_integrator_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."reminder_rules" AS "b4f_rule" WHERE "b4f_rule"."integrator_rule_id" = "rule_id" AND "b4f_rule"."integrator_user_id" = app.current_integrator_user_id() )))));
\endif

-- public.admin_audit_log (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."admin_audit_log" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."admin_audit_log";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."admin_audit_log" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."admin_audit_log" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.app_runtime_settings (s5_runtime_settings_isolation)
ALTER TABLE "public"."app_runtime_settings" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "s5_runtime_settings_isolation" ON "public"."app_runtime_settings";
DROP POLICY IF EXISTS "app_runtime_settings_safe_read" ON "public"."app_runtime_settings";
DROP POLICY IF EXISTS "app_runtime_settings_staff_write" ON "public"."app_runtime_settings";
\if :phase4_enforce_locked_context
CREATE POLICY "s5_runtime_settings_isolation" ON "public"."app_runtime_settings" FOR ALL USING (((current_user = 'app_staff' AND ("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) OR (current_user = 'app_patient' AND "audience" IN ('public', 'authenticated_client') AND ("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) OR (current_user = 'app_runtime_nonstaff_login' AND "audience" = 'public' AND ("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) OR (pg_has_role(current_user, 'app_worker', 'member') AND "audience" = 'server' AND "organization_id" IS NULL AND app.current_org_id() IS NULL))) WITH CHECK (((current_user = 'app_staff' AND ("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) OR (current_user = 'app_patient' AND "audience" IN ('public', 'authenticated_client') AND ("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) OR (current_user = 'app_runtime_nonstaff_login' AND "audience" = 'public' AND ("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) OR (pg_has_role(current_user, 'app_worker', 'member') AND "audience" = 'server' AND "organization_id" IS NULL AND app.current_org_id() IS NULL)));
\else
CREATE POLICY "s5_runtime_settings_isolation" ON "public"."app_runtime_settings" FOR ALL USING (((current_user = 'app_staff' AND ("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) OR (current_user = 'app_patient' AND "audience" IN ('public', 'authenticated_client') AND ("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) OR (current_user = 'app_runtime_nonstaff_login' AND "audience" = 'public' AND ("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) OR (pg_has_role(current_user, 'app_worker', 'member') AND "audience" = 'server' AND "organization_id" IS NULL AND app.current_org_id() IS NULL))) WITH CHECK (((current_user = 'app_staff' AND ("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) OR (current_user = 'app_patient' AND "audience" IN ('public', 'authenticated_client') AND ("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) OR (current_user = 'app_runtime_nonstaff_login' AND "audience" = 'public' AND ("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) OR (pg_has_role(current_user, 'app_worker', 'member') AND "audience" = 'server' AND "organization_id" IS NULL AND app.current_org_id() IS NULL)));
\endif

-- public.app_runtime_settings_audit (s5_runtime_settings_audit_staff)
ALTER TABLE "public"."app_runtime_settings_audit" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "s5_runtime_settings_audit_staff" ON "public"."app_runtime_settings_audit";
\if :phase4_enforce_locked_context
CREATE POLICY "s5_runtime_settings_audit_staff" ON "public"."app_runtime_settings_audit" FOR ALL USING ((current_user = 'app_staff' AND ("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK ((current_user = 'app_staff' AND ("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\else
CREATE POLICY "s5_runtime_settings_audit_staff" ON "public"."app_runtime_settings_audit" FOR ALL USING ((current_user = 'app_staff' AND ("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK ((current_user = 'app_staff' AND ("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.be_appointment_cancellations (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_appointment_cancellations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_appointment_cancellations";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_appointment_cancellations" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_appointments" AS "b4f_appt" WHERE "b4f_appt"."id" = "appointment_id" AND "b4f_appt"."platform_user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_appointments" AS "b4f_appt" WHERE "b4f_appt"."id" = "appointment_id" AND "b4f_appt"."platform_user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_appointment_cancellations" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_appointments" AS "b4f_appt" WHERE "b4f_appt"."id" = "appointment_id" AND "b4f_appt"."platform_user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_appointments" AS "b4f_appt" WHERE "b4f_appt"."id" = "appointment_id" AND "b4f_appt"."platform_user_id" = app.current_patient_user_id() )))));
\endif

-- public.be_appointment_history_events (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_appointment_history_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_appointment_history_events";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_appointment_history_events" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_appointments" AS "b4f_appt" WHERE "b4f_appt"."id" = "appointment_id" AND "b4f_appt"."platform_user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_appointments" AS "b4f_appt" WHERE "b4f_appt"."id" = "appointment_id" AND "b4f_appt"."platform_user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_appointment_history_events" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_appointments" AS "b4f_appt" WHERE "b4f_appt"."id" = "appointment_id" AND "b4f_appt"."platform_user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_appointments" AS "b4f_appt" WHERE "b4f_appt"."id" = "appointment_id" AND "b4f_appt"."platform_user_id" = app.current_patient_user_id() )))));
\endif

-- public.be_appointment_no_shows (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_appointment_no_shows" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_appointment_no_shows";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_appointment_no_shows" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_appointments" AS "b4f_appt" WHERE "b4f_appt"."id" = "appointment_id" AND "b4f_appt"."platform_user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_appointments" AS "b4f_appt" WHERE "b4f_appt"."id" = "appointment_id" AND "b4f_appt"."platform_user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_appointment_no_shows" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_appointments" AS "b4f_appt" WHERE "b4f_appt"."id" = "appointment_id" AND "b4f_appt"."platform_user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_appointments" AS "b4f_appt" WHERE "b4f_appt"."id" = "appointment_id" AND "b4f_appt"."platform_user_id" = app.current_patient_user_id() )))));
\endif

-- public.be_appointment_reschedules (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_appointment_reschedules" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_appointment_reschedules";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_appointment_reschedules" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_appointments" AS "b4f_appt" WHERE "b4f_appt"."id" = "appointment_id" AND "b4f_appt"."platform_user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_appointments" AS "b4f_appt" WHERE "b4f_appt"."id" = "appointment_id" AND "b4f_appt"."platform_user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_appointment_reschedules" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_appointments" AS "b4f_appt" WHERE "b4f_appt"."id" = "appointment_id" AND "b4f_appt"."platform_user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_appointments" AS "b4f_appt" WHERE "b4f_appt"."id" = "appointment_id" AND "b4f_appt"."platform_user_id" = app.current_patient_user_id() )))));
\endif

-- public.be_appointment_staff_comments (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_appointment_staff_comments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_appointment_staff_comments";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_appointment_staff_comments" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_appointment_staff_comments" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))));
\endif

-- public.be_appointments (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_appointments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_appointments";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_appointments" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_appointments" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))));
\endif

-- public.be_availability_rules (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_availability_rules" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_availability_rules";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_availability_rules" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_availability_rules" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.be_booking_form_fields (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_booking_form_fields" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_booking_form_fields";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_booking_form_fields" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_booking_form_fields" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.be_booking_form_submissions (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_booking_form_submissions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_booking_form_submissions";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_booking_form_submissions" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_appointments" AS "b4f_appt" WHERE "b4f_appt"."id" = "appointment_id" AND "b4f_appt"."platform_user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_appointments" AS "b4f_appt" WHERE "b4f_appt"."id" = "appointment_id" AND "b4f_appt"."platform_user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_booking_form_submissions" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_appointments" AS "b4f_appt" WHERE "b4f_appt"."id" = "appointment_id" AND "b4f_appt"."platform_user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_appointments" AS "b4f_appt" WHERE "b4f_appt"."id" = "appointment_id" AND "b4f_appt"."platform_user_id" = app.current_patient_user_id() )))));
\endif

-- public.be_branches (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_branches" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_branches";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_branches" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_branches" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.be_cancellation_policies (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_cancellation_policies" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_cancellation_policies";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_cancellation_policies" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_cancellation_policies" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.be_clinic_services (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_clinic_services" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_clinic_services";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_clinic_services" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_clinic_services" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.be_external_entity_mappings (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_external_entity_mappings" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_external_entity_mappings";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_external_entity_mappings" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_external_entity_mappings" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.be_package_history_events (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_package_history_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_package_history_events";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_package_history_events" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_patient_packages" AS "b4f_pkg" WHERE "b4f_pkg"."id" = "patient_package_id" AND "b4f_pkg"."platform_user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_patient_packages" AS "b4f_pkg" WHERE "b4f_pkg"."id" = "patient_package_id" AND "b4f_pkg"."platform_user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_package_history_events" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_patient_packages" AS "b4f_pkg" WHERE "b4f_pkg"."id" = "patient_package_id" AND "b4f_pkg"."platform_user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_patient_packages" AS "b4f_pkg" WHERE "b4f_pkg"."id" = "patient_package_id" AND "b4f_pkg"."platform_user_id" = app.current_patient_user_id() )))));
\endif

-- public.be_package_items (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."be_package_items" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."be_package_items";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."be_package_items" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND (EXISTS ( SELECT 1 FROM "public"."be_subscription_packages" AS "p0_8_4_parent" WHERE "p0_8_4_parent"."id" = "package_id" AND "p0_8_4_parent"."organization_id" = app.current_org_id() ) AND EXISTS ( SELECT 1 FROM "public"."be_clinic_services" AS "p0_8_4_cross" WHERE "p0_8_4_cross"."id" = "service_id" AND "p0_8_4_cross"."organization_id" = app.current_org_id() ))))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND (EXISTS ( SELECT 1 FROM "public"."be_subscription_packages" AS "p0_8_4_parent" WHERE "p0_8_4_parent"."id" = "package_id" AND "p0_8_4_parent"."organization_id" = app.current_org_id() ) AND EXISTS ( SELECT 1 FROM "public"."be_clinic_services" AS "p0_8_4_cross" WHERE "p0_8_4_cross"."id" = "service_id" AND "p0_8_4_cross"."organization_id" = app.current_org_id() )))));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."be_package_items" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND (EXISTS ( SELECT 1 FROM "public"."be_subscription_packages" AS "p0_8_4_parent" WHERE "p0_8_4_parent"."id" = "package_id" AND "p0_8_4_parent"."organization_id" = app.current_org_id() ) AND EXISTS ( SELECT 1 FROM "public"."be_clinic_services" AS "p0_8_4_cross" WHERE "p0_8_4_cross"."id" = "service_id" AND "p0_8_4_cross"."organization_id" = app.current_org_id() )))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND (EXISTS ( SELECT 1 FROM "public"."be_subscription_packages" AS "p0_8_4_parent" WHERE "p0_8_4_parent"."id" = "package_id" AND "p0_8_4_parent"."organization_id" = app.current_org_id() ) AND EXISTS ( SELECT 1 FROM "public"."be_clinic_services" AS "p0_8_4_cross" WHERE "p0_8_4_cross"."id" = "service_id" AND "p0_8_4_cross"."organization_id" = app.current_org_id() ))))));
\endif

-- public.be_package_usages (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_package_usages" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_package_usages";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_package_usages" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_patient_packages" AS "b4f_pkg" WHERE "b4f_pkg"."id" = "patient_package_id" AND "b4f_pkg"."platform_user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_patient_packages" AS "b4f_pkg" WHERE "b4f_pkg"."id" = "patient_package_id" AND "b4f_pkg"."platform_user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_package_usages" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_patient_packages" AS "b4f_pkg" WHERE "b4f_pkg"."id" = "patient_package_id" AND "b4f_pkg"."platform_user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_patient_packages" AS "b4f_pkg" WHERE "b4f_pkg"."id" = "patient_package_id" AND "b4f_pkg"."platform_user_id" = app.current_patient_user_id() )))));
\endif

-- public.be_patient_booking_profiles (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_patient_booking_profiles" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_patient_booking_profiles";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_patient_booking_profiles" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_patient_booking_profiles" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))));
\endif

-- public.be_patient_package_items (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."be_patient_package_items" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."be_patient_package_items";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."be_patient_package_items" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND (EXISTS ( SELECT 1 FROM "public"."be_patient_packages" AS "p0_8_4_parent" WHERE "p0_8_4_parent"."id" = "patient_package_id" AND "p0_8_4_parent"."organization_id" = app.current_org_id() ) AND EXISTS ( SELECT 1 FROM "public"."be_clinic_services" AS "p0_8_4_cross" WHERE "p0_8_4_cross"."id" = "service_id" AND "p0_8_4_cross"."organization_id" = app.current_org_id() )))) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_patient_packages" AS "p0_8_4_patient_parent" WHERE "p0_8_4_patient_parent"."id" = "patient_package_id" AND "p0_8_4_patient_parent"."platform_user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND (EXISTS ( SELECT 1 FROM "public"."be_patient_packages" AS "p0_8_4_parent" WHERE "p0_8_4_parent"."id" = "patient_package_id" AND "p0_8_4_parent"."organization_id" = app.current_org_id() ) AND EXISTS ( SELECT 1 FROM "public"."be_clinic_services" AS "p0_8_4_cross" WHERE "p0_8_4_cross"."id" = "service_id" AND "p0_8_4_cross"."organization_id" = app.current_org_id() )))) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_patient_packages" AS "p0_8_4_patient_parent" WHERE "p0_8_4_patient_parent"."id" = "patient_package_id" AND "p0_8_4_patient_parent"."platform_user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."be_patient_package_items" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND (EXISTS ( SELECT 1 FROM "public"."be_patient_packages" AS "p0_8_4_parent" WHERE "p0_8_4_parent"."id" = "patient_package_id" AND "p0_8_4_parent"."organization_id" = app.current_org_id() ) AND EXISTS ( SELECT 1 FROM "public"."be_clinic_services" AS "p0_8_4_cross" WHERE "p0_8_4_cross"."id" = "service_id" AND "p0_8_4_cross"."organization_id" = app.current_org_id() )))) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_patient_packages" AS "p0_8_4_patient_parent" WHERE "p0_8_4_patient_parent"."id" = "patient_package_id" AND "p0_8_4_patient_parent"."platform_user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND (EXISTS ( SELECT 1 FROM "public"."be_patient_packages" AS "p0_8_4_parent" WHERE "p0_8_4_parent"."id" = "patient_package_id" AND "p0_8_4_parent"."organization_id" = app.current_org_id() ) AND EXISTS ( SELECT 1 FROM "public"."be_clinic_services" AS "p0_8_4_cross" WHERE "p0_8_4_cross"."id" = "service_id" AND "p0_8_4_cross"."organization_id" = app.current_org_id() )))) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_patient_packages" AS "p0_8_4_patient_parent" WHERE "p0_8_4_patient_parent"."id" = "patient_package_id" AND "p0_8_4_patient_parent"."platform_user_id" = app.current_patient_user_id() )))));
\endif

-- public.be_patient_packages (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_patient_packages" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_patient_packages";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_patient_packages" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_patient_packages" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))));
\endif

-- public.be_patient_timeline_events (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_patient_timeline_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_patient_timeline_events";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_patient_timeline_events" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_patient_timeline_events" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))));
\endif

-- public.be_payment_history_events (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_payment_history_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_payment_history_events";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_payment_history_events" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_payment_history_events" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))));
\endif

-- public.be_payment_intents (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_payment_intents" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_payment_intents";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_payment_intents" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_payment_intents" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))));
\endif

-- public.be_payment_provider_events (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_payment_provider_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_payment_provider_events";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_payment_provider_events" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_payment_provider_events" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.be_payments (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_payments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_payments";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_payments" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_payments" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))));
\endif

-- public.be_prepayment_policies (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_prepayment_policies" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_prepayment_policies";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_prepayment_policies" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_prepayment_policies" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.be_refunds (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_refunds" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_refunds";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_refunds" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_payments" AS "b4f_payment" WHERE "b4f_payment"."id" = "payment_id" AND "b4f_payment"."platform_user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_payments" AS "b4f_payment" WHERE "b4f_payment"."id" = "payment_id" AND "b4f_payment"."platform_user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_refunds" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_payments" AS "b4f_payment" WHERE "b4f_payment"."id" = "payment_id" AND "b4f_payment"."platform_user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."be_payments" AS "b4f_payment" WHERE "b4f_payment"."id" = "payment_id" AND "b4f_payment"."platform_user_id" = app.current_patient_user_id() )))));
\endif

-- public.be_reschedule_policies (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_reschedule_policies" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_reschedule_policies";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_reschedule_policies" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_reschedule_policies" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.be_rooms (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_rooms" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_rooms";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_rooms" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_rooms" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.be_schedule_blocks (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_schedule_blocks" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_schedule_blocks";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_schedule_blocks" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_schedule_blocks" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.be_schedule_templates (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_schedule_templates" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_schedule_templates";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_schedule_templates" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_schedule_templates" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.be_service_location_availability (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_service_location_availability" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_service_location_availability";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_service_location_availability" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_service_location_availability" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.be_specialist_locations (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_specialist_locations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_specialist_locations";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_specialist_locations" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_specialist_locations" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.be_specialist_rooms (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_specialist_rooms" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_specialist_rooms";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_specialist_rooms" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_specialist_rooms" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.be_specialist_service_availability (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_specialist_service_availability" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_specialist_service_availability";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_specialist_service_availability" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_specialist_service_availability" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.be_specialists (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_specialists" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_specialists";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_specialists" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_specialists" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.be_subscription_packages (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_subscription_packages" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_subscription_packages";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_subscription_packages" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_subscription_packages" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.be_working_days (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_working_days" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_working_days";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_working_days" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_working_days" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.be_working_hours (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."be_working_hours" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."be_working_hours";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_working_hours" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."be_working_hours" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.broadcast_audit (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."broadcast_audit" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."broadcast_audit";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."broadcast_audit" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."broadcast_audit" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.broadcast_audit_recipients (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."broadcast_audit_recipients" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."broadcast_audit_recipients";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."broadcast_audit_recipients" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."broadcast_audit_recipients" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))));
\endif

-- public.broadcast_drafts (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."broadcast_drafts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."broadcast_drafts";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."broadcast_drafts" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."broadcast_drafts" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.clinic_public_directory_entries (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."clinic_public_directory_entries" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."clinic_public_directory_entries";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."clinic_public_directory_entries" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."clinic_public_directory_entries" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\endif

-- public.clinical_anamnesis_illness (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."clinical_anamnesis_illness" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."clinical_anamnesis_illness";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."clinical_anamnesis_illness" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."clinical_anamnesis_illness" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))));
\endif

-- public.clinical_anamnesis_lifestyle (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."clinical_anamnesis_lifestyle" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."clinical_anamnesis_lifestyle";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."clinical_anamnesis_lifestyle" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."clinical_anamnesis_lifestyle" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))));
\endif

-- public.clinical_anamnesis_trauma (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."clinical_anamnesis_trauma" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."clinical_anamnesis_trauma";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."clinical_anamnesis_trauma" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."clinical_anamnesis_trauma" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))));
\endif

-- public.clinical_complaint (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."clinical_complaint" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."clinical_complaint";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."clinical_complaint" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."clinical_complaint" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))));
\endif

-- public.clinical_complaint_update (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."clinical_complaint_update" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."clinical_complaint_update";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."clinical_complaint_update" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."clinical_complaint" AS "b4f_complaint" WHERE "b4f_complaint"."id" = "complaint_id" AND "b4f_complaint"."patient_user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."clinical_complaint" AS "b4f_complaint" WHERE "b4f_complaint"."id" = "complaint_id" AND "b4f_complaint"."patient_user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."clinical_complaint_update" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."clinical_complaint" AS "b4f_complaint" WHERE "b4f_complaint"."id" = "complaint_id" AND "b4f_complaint"."patient_user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."clinical_complaint" AS "b4f_complaint" WHERE "b4f_complaint"."id" = "complaint_id" AND "b4f_complaint"."patient_user_id" = app.current_patient_user_id() )))));
\endif

-- public.clinical_diagnosis (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."clinical_diagnosis" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."clinical_diagnosis";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."clinical_diagnosis" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."clinical_diagnosis" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))));
\endif

-- public.clinical_diagnosis_catalog (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."clinical_diagnosis_catalog" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."clinical_diagnosis_catalog";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."clinical_diagnosis_catalog" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."clinical_diagnosis_catalog" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.clinical_diagnosis_status_history (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."clinical_diagnosis_status_history" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."clinical_diagnosis_status_history";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."clinical_diagnosis_status_history" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."clinical_diagnosis" AS "b4f_diagnosis" WHERE "b4f_diagnosis"."id" = "diagnosis_id" AND "b4f_diagnosis"."patient_user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."clinical_diagnosis" AS "b4f_diagnosis" WHERE "b4f_diagnosis"."id" = "diagnosis_id" AND "b4f_diagnosis"."patient_user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."clinical_diagnosis_status_history" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."clinical_diagnosis" AS "b4f_diagnosis" WHERE "b4f_diagnosis"."id" = "diagnosis_id" AND "b4f_diagnosis"."patient_user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."clinical_diagnosis" AS "b4f_diagnosis" WHERE "b4f_diagnosis"."id" = "diagnosis_id" AND "b4f_diagnosis"."patient_user_id" = app.current_patient_user_id() )))));
\endif

-- public.clinical_diagnosis_update (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."clinical_diagnosis_update" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."clinical_diagnosis_update";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."clinical_diagnosis_update" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."clinical_diagnosis" AS "b4f_diagnosis" WHERE "b4f_diagnosis"."id" = "diagnosis_id" AND "b4f_diagnosis"."patient_user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."clinical_diagnosis" AS "b4f_diagnosis" WHERE "b4f_diagnosis"."id" = "diagnosis_id" AND "b4f_diagnosis"."patient_user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."clinical_diagnosis_update" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."clinical_diagnosis" AS "b4f_diagnosis" WHERE "b4f_diagnosis"."id" = "diagnosis_id" AND "b4f_diagnosis"."patient_user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."clinical_diagnosis" AS "b4f_diagnosis" WHERE "b4f_diagnosis"."id" = "diagnosis_id" AND "b4f_diagnosis"."patient_user_id" = app.current_patient_user_id() )))));
\endif

-- public.clinical_test_regions (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."clinical_test_regions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."clinical_test_regions";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."clinical_test_regions" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."clinical_test_regions" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.clinical_visit (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."clinical_visit" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."clinical_visit";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."clinical_visit" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."clinical_visit" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))));
\endif

-- public.comments (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."comments";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."comments" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR ("target_type" = ANY (ARRAY['exercise', 'test', 'test_set', 'recommendation', 'lesson']::text[]) OR ("target_type" = 'program_instance' AND (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instances" AS "b4c4_comment_program" WHERE "b4c4_comment_program"."id" = "target_id" AND "b4c4_comment_program"."patient_user_id" = app.current_patient_user_id() ))) OR ("target_type" = 'lfk_complex' AND (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."lfk_complexes" AS "b4c4_comment_complex" WHERE "b4c4_comment_complex"."id" = "target_id" AND "b4c4_comment_complex"."platform_user_id" = app.current_patient_user_id() ))) OR ("target_type" = 'stage_instance' AND (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instance_stages" AS "b4c4_comment_stage" JOIN "public"."treatment_program_instances" AS "b4c4_comment_stage_program" ON "b4c4_comment_stage_program"."id" = "b4c4_comment_stage"."instance_id" WHERE "b4c4_comment_stage"."id" = "target_id" AND "b4c4_comment_stage_program"."patient_user_id" = app.current_patient_user_id() ))) OR ("target_type" = 'stage_item_instance' AND (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instance_stage_items" AS "b4c4_comment_stage_item" JOIN "public"."treatment_program_instance_stages" AS "b4c4_comment_item_stage" ON "b4c4_comment_item_stage"."id" = "b4c4_comment_stage_item"."stage_id" JOIN "public"."treatment_program_instances" AS "b4c4_comment_item_program" ON "b4c4_comment_item_program"."id" = "b4c4_comment_item_stage"."instance_id" WHERE "b4c4_comment_stage_item"."id" = "target_id" AND "b4c4_comment_item_program"."patient_user_id" = app.current_patient_user_id() )))))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR ("target_type" = ANY (ARRAY['exercise', 'test', 'test_set', 'recommendation', 'lesson']::text[]) OR ("target_type" = 'program_instance' AND (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instances" AS "b4c4_comment_program" WHERE "b4c4_comment_program"."id" = "target_id" AND "b4c4_comment_program"."patient_user_id" = app.current_patient_user_id() ))) OR ("target_type" = 'lfk_complex' AND (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."lfk_complexes" AS "b4c4_comment_complex" WHERE "b4c4_comment_complex"."id" = "target_id" AND "b4c4_comment_complex"."platform_user_id" = app.current_patient_user_id() ))) OR ("target_type" = 'stage_instance' AND (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instance_stages" AS "b4c4_comment_stage" JOIN "public"."treatment_program_instances" AS "b4c4_comment_stage_program" ON "b4c4_comment_stage_program"."id" = "b4c4_comment_stage"."instance_id" WHERE "b4c4_comment_stage"."id" = "target_id" AND "b4c4_comment_stage_program"."patient_user_id" = app.current_patient_user_id() ))) OR ("target_type" = 'stage_item_instance' AND (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instance_stage_items" AS "b4c4_comment_stage_item" JOIN "public"."treatment_program_instance_stages" AS "b4c4_comment_item_stage" ON "b4c4_comment_item_stage"."id" = "b4c4_comment_stage_item"."stage_id" JOIN "public"."treatment_program_instances" AS "b4c4_comment_item_program" ON "b4c4_comment_item_program"."id" = "b4c4_comment_item_stage"."instance_id" WHERE "b4c4_comment_stage_item"."id" = "target_id" AND "b4c4_comment_item_program"."patient_user_id" = app.current_patient_user_id() ))))));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."comments" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR ("target_type" = ANY (ARRAY['exercise', 'test', 'test_set', 'recommendation', 'lesson']::text[]) OR ("target_type" = 'program_instance' AND (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instances" AS "b4c4_comment_program" WHERE "b4c4_comment_program"."id" = "target_id" AND "b4c4_comment_program"."patient_user_id" = app.current_patient_user_id() ))) OR ("target_type" = 'lfk_complex' AND (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."lfk_complexes" AS "b4c4_comment_complex" WHERE "b4c4_comment_complex"."id" = "target_id" AND "b4c4_comment_complex"."platform_user_id" = app.current_patient_user_id() ))) OR ("target_type" = 'stage_instance' AND (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instance_stages" AS "b4c4_comment_stage" JOIN "public"."treatment_program_instances" AS "b4c4_comment_stage_program" ON "b4c4_comment_stage_program"."id" = "b4c4_comment_stage"."instance_id" WHERE "b4c4_comment_stage"."id" = "target_id" AND "b4c4_comment_stage_program"."patient_user_id" = app.current_patient_user_id() ))) OR ("target_type" = 'stage_item_instance' AND (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instance_stage_items" AS "b4c4_comment_stage_item" JOIN "public"."treatment_program_instance_stages" AS "b4c4_comment_item_stage" ON "b4c4_comment_item_stage"."id" = "b4c4_comment_stage_item"."stage_id" JOIN "public"."treatment_program_instances" AS "b4c4_comment_item_program" ON "b4c4_comment_item_program"."id" = "b4c4_comment_item_stage"."instance_id" WHERE "b4c4_comment_stage_item"."id" = "target_id" AND "b4c4_comment_item_program"."patient_user_id" = app.current_patient_user_id() ))))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR ("target_type" = ANY (ARRAY['exercise', 'test', 'test_set', 'recommendation', 'lesson']::text[]) OR ("target_type" = 'program_instance' AND (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instances" AS "b4c4_comment_program" WHERE "b4c4_comment_program"."id" = "target_id" AND "b4c4_comment_program"."patient_user_id" = app.current_patient_user_id() ))) OR ("target_type" = 'lfk_complex' AND (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."lfk_complexes" AS "b4c4_comment_complex" WHERE "b4c4_comment_complex"."id" = "target_id" AND "b4c4_comment_complex"."platform_user_id" = app.current_patient_user_id() ))) OR ("target_type" = 'stage_instance' AND (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instance_stages" AS "b4c4_comment_stage" JOIN "public"."treatment_program_instances" AS "b4c4_comment_stage_program" ON "b4c4_comment_stage_program"."id" = "b4c4_comment_stage"."instance_id" WHERE "b4c4_comment_stage"."id" = "target_id" AND "b4c4_comment_stage_program"."patient_user_id" = app.current_patient_user_id() ))) OR ("target_type" = 'stage_item_instance' AND (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instance_stage_items" AS "b4c4_comment_stage_item" JOIN "public"."treatment_program_instance_stages" AS "b4c4_comment_item_stage" ON "b4c4_comment_item_stage"."id" = "b4c4_comment_stage_item"."stage_id" JOIN "public"."treatment_program_instances" AS "b4c4_comment_item_program" ON "b4c4_comment_item_program"."id" = "b4c4_comment_item_stage"."instance_id" WHERE "b4c4_comment_stage_item"."id" = "target_id" AND "b4c4_comment_item_program"."patient_user_id" = app.current_patient_user_id() )))))));
\endif

-- public.content_access_grants_webapp (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."content_access_grants_webapp" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."content_access_grants_webapp";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."content_access_grants_webapp" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."content_access_grants_webapp" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))));
\endif

-- public.content_pages (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."content_pages" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."content_pages";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."content_pages" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."content_pages" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.content_section_slug_history (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."content_section_slug_history" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."content_section_slug_history";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."content_section_slug_history" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."content_section_slug_history" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.content_sections (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."content_sections" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."content_sections";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."content_sections" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."content_sections" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.courses (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."courses" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."courses";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."courses" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."courses" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.doctor_notes (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."doctor_notes" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."doctor_notes";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."doctor_notes" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."doctor_notes" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))));
\endif

-- public.doctor_patient_support (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."doctor_patient_support" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."doctor_patient_support";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."doctor_patient_support" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."doctor_patient_support" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))));
\endif

-- public.lfk_complex_exercises (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."lfk_complex_exercises" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."lfk_complex_exercises";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."lfk_complex_exercises" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."lfk_complexes" AS "b4f_complex" WHERE "b4f_complex"."id" = "complex_id" AND "b4f_complex"."platform_user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."lfk_complexes" AS "b4f_complex" WHERE "b4f_complex"."id" = "complex_id" AND "b4f_complex"."platform_user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."lfk_complex_exercises" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."lfk_complexes" AS "b4f_complex" WHERE "b4f_complex"."id" = "complex_id" AND "b4f_complex"."platform_user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."lfk_complexes" AS "b4f_complex" WHERE "b4f_complex"."id" = "complex_id" AND "b4f_complex"."platform_user_id" = app.current_patient_user_id() )))));
\endif

-- public.lfk_complex_template_exercises (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."lfk_complex_template_exercises" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."lfk_complex_template_exercises";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."lfk_complex_template_exercises" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."lfk_complex_template_exercises" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.lfk_complex_templates (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."lfk_complex_templates" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."lfk_complex_templates";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."lfk_complex_templates" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."lfk_complex_templates" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.lfk_complexes (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."lfk_complexes" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."lfk_complexes";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."lfk_complexes" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."lfk_complexes" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))));
\endif

-- public.lfk_exercise_media (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."lfk_exercise_media" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."lfk_exercise_media";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."lfk_exercise_media" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."lfk_exercise_media" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.lfk_exercise_regions (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."lfk_exercise_regions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."lfk_exercise_regions";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."lfk_exercise_regions" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."lfk_exercise_regions" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.lfk_exercises (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."lfk_exercises" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."lfk_exercises";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."lfk_exercises" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."lfk_exercises" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.lfk_sessions (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."lfk_sessions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."lfk_sessions";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."lfk_sessions" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."lfk_sessions" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))));
\endif

-- public.material_ratings (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."material_ratings" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."material_ratings";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."material_ratings" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."material_ratings" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))));
\endif

-- public.media_files (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."media_files" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."media_files";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."media_files" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND ("usage_purpose" IS DISTINCT FROM 'program_item_submission' OR "uploaded_by" = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND ("usage_purpose" IS DISTINCT FROM 'program_item_submission' OR "uploaded_by" = app.current_patient_user_id()))));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."media_files" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND ("usage_purpose" IS DISTINCT FROM 'program_item_submission' OR "uploaded_by" = app.current_patient_user_id()))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND ("usage_purpose" IS DISTINCT FROM 'program_item_submission' OR "uploaded_by" = app.current_patient_user_id())))));
\endif

-- public.media_folders (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."media_folders" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."media_folders";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."media_folders" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR ("patient_user_id" IS NULL OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR ("patient_user_id" IS NULL OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."media_folders" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR ("patient_user_id" IS NULL OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR ("patient_user_id" IS NULL OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())))));
\endif

-- public.media_hls_proxy_error_events (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."media_hls_proxy_error_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."media_hls_proxy_error_events";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."media_hls_proxy_error_events" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."media_hls_proxy_error_events" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))));
\endif

-- public.media_playback_client_events (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."media_playback_client_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."media_playback_client_events";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."media_playback_client_events" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."media_playback_client_events" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))));
\endif

-- public.media_playback_resolution_events (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."media_playback_resolution_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."media_playback_resolution_events";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."media_playback_resolution_events" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."media_playback_resolution_events" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))));
\endif

-- public.media_playback_user_video_first_resolve (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."media_playback_user_video_first_resolve" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."media_playback_user_video_first_resolve";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."media_playback_user_video_first_resolve" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."media_playback_user_video_first_resolve" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))));
\endif

-- public.media_transcode_jobs (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."media_transcode_jobs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."media_transcode_jobs";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."media_transcode_jobs" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."media_files" AS "b4c4_transcode_media" WHERE "b4c4_transcode_media"."id" = "media_id" AND ("b4c4_transcode_media"."usage_purpose" IS DISTINCT FROM 'program_item_submission' OR "b4c4_transcode_media"."uploaded_by" = app.current_patient_user_id()) )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."media_files" AS "b4c4_transcode_media" WHERE "b4c4_transcode_media"."id" = "media_id" AND ("b4c4_transcode_media"."usage_purpose" IS DISTINCT FROM 'program_item_submission' OR "b4c4_transcode_media"."uploaded_by" = app.current_patient_user_id()) ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."media_transcode_jobs" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."media_files" AS "b4c4_transcode_media" WHERE "b4c4_transcode_media"."id" = "media_id" AND ("b4c4_transcode_media"."usage_purpose" IS DISTINCT FROM 'program_item_submission' OR "b4c4_transcode_media"."uploaded_by" = app.current_patient_user_id()) ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."media_files" AS "b4c4_transcode_media" WHERE "b4c4_transcode_media"."id" = "media_id" AND ("b4c4_transcode_media"."usage_purpose" IS DISTINCT FROM 'program_item_submission' OR "b4c4_transcode_media"."uploaded_by" = app.current_patient_user_id()) )))));
\endif

-- public.media_upload_sessions (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."media_upload_sessions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."media_upload_sessions";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."media_upload_sessions" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "owner_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "owner_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."media_upload_sessions" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "owner_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "owner_user_id" = app.current_patient_user_id()))));
\endif

-- public.message_log (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."message_log" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."message_log";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."message_log" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."message_log" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))));
\endif

-- public.motivational_quotes (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."motivational_quotes" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."motivational_quotes";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."motivational_quotes" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."motivational_quotes" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.notification_delivery_attempts (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."notification_delivery_attempts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."notification_delivery_attempts";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."notification_delivery_attempts" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."notification_delivery_attempts" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))));
\endif

-- public.online_intake_answers (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."online_intake_answers" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."online_intake_answers";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."online_intake_answers" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."online_intake_requests" AS "b4f_intake_request" WHERE "b4f_intake_request"."id" = "request_id" AND "b4f_intake_request"."user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."online_intake_requests" AS "b4f_intake_request" WHERE "b4f_intake_request"."id" = "request_id" AND "b4f_intake_request"."user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."online_intake_answers" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."online_intake_requests" AS "b4f_intake_request" WHERE "b4f_intake_request"."id" = "request_id" AND "b4f_intake_request"."user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."online_intake_requests" AS "b4f_intake_request" WHERE "b4f_intake_request"."id" = "request_id" AND "b4f_intake_request"."user_id" = app.current_patient_user_id() )))));
\endif

-- public.online_intake_attachments (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."online_intake_attachments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."online_intake_attachments";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."online_intake_attachments" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."online_intake_requests" AS "b4f_intake_request" WHERE "b4f_intake_request"."id" = "request_id" AND "b4f_intake_request"."user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."online_intake_requests" AS "b4f_intake_request" WHERE "b4f_intake_request"."id" = "request_id" AND "b4f_intake_request"."user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."online_intake_attachments" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."online_intake_requests" AS "b4f_intake_request" WHERE "b4f_intake_request"."id" = "request_id" AND "b4f_intake_request"."user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."online_intake_requests" AS "b4f_intake_request" WHERE "b4f_intake_request"."id" = "request_id" AND "b4f_intake_request"."user_id" = app.current_patient_user_id() )))));
\endif

-- public.online_intake_requests (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."online_intake_requests" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."online_intake_requests";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."online_intake_requests" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."online_intake_requests" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))));
\endif

-- public.online_intake_status_history (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."online_intake_status_history" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."online_intake_status_history";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."online_intake_status_history" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."online_intake_requests" AS "b4f_intake_request" WHERE "b4f_intake_request"."id" = "request_id" AND "b4f_intake_request"."user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."online_intake_requests" AS "b4f_intake_request" WHERE "b4f_intake_request"."id" = "request_id" AND "b4f_intake_request"."user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."online_intake_status_history" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."online_intake_requests" AS "b4f_intake_request" WHERE "b4f_intake_request"."id" = "request_id" AND "b4f_intake_request"."user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."online_intake_requests" AS "b4f_intake_request" WHERE "b4f_intake_request"."id" = "request_id" AND "b4f_intake_request"."user_id" = app.current_patient_user_id() )))));
\endif

-- public.operator_health_failure_archive (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."operator_health_failure_archive" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."operator_health_failure_archive";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."operator_health_failure_archive" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."operator_health_failure_archive" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.org_enrollments (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."org_enrollments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."org_enrollments";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."org_enrollments" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."org_enrollments" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))));
\endif

-- public.organization_member_invites (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."organization_member_invites" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."organization_member_invites";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."organization_member_invites" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."organization_member_invites" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.patient_comorbidity (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."patient_comorbidity" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."patient_comorbidity";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_comorbidity" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_comorbidity" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))));
\endif

-- public.patient_content_rating_feedback (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."patient_content_rating_feedback" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."patient_content_rating_feedback";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_content_rating_feedback" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_content_rating_feedback" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))));
\endif

-- public.patient_daily_warmup_presentations (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."patient_daily_warmup_presentations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."patient_daily_warmup_presentations";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_daily_warmup_presentations" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_daily_warmup_presentations" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))));
\endif

-- public.patient_daily_warmup_video_views (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."patient_daily_warmup_video_views" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."patient_daily_warmup_video_views";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."patient_daily_warmup_video_views" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."patient_daily_warmup_video_views" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))));
\endif

-- public.patient_diary_day_snapshots (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."patient_diary_day_snapshots" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."patient_diary_day_snapshots";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_diary_day_snapshots" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_diary_day_snapshots" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))));
\endif

-- public.patient_files (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."patient_files" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."patient_files";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_files" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_files" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))));
\endif

-- public.patient_home_block_items (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."patient_home_block_items" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."patient_home_block_items";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."patient_home_block_items" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."patient_home_block_items" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.patient_home_blocks (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."patient_home_blocks" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."patient_home_blocks";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_home_blocks" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_home_blocks" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.patient_invites (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."patient_invites" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."patient_invites";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_invites" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_invites" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.patient_lfk_assignments (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."patient_lfk_assignments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."patient_lfk_assignments";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_lfk_assignments" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_lfk_assignments" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))));
\endif

-- public.patient_merge_candidates (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."patient_merge_candidates" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."patient_merge_candidates";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_merge_candidates" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_merge_candidates" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.patient_payment (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."patient_payment" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."patient_payment";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_payment" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_payment" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))));
\endif

-- public.patient_practice_completions (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."patient_practice_completions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."patient_practice_completions";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_practice_completions" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_practice_completions" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))));
\endif

-- public.patient_specialist_links (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."patient_specialist_links" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."patient_specialist_links";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_specialist_links" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."patient_specialist_links" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.platform_user_contacts (saas_bootstrap_hybrid_p0_8_6)
ALTER TABLE "public"."platform_user_contacts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_bootstrap_hybrid_p0_8_6" ON "public"."platform_user_contacts";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_bootstrap_hybrid_p0_8_6" ON "public"."platform_user_contacts" FOR ALL USING (((app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()) OR ("organization_id" IS NULL AND app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()))) WITH CHECK (((app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()) OR ("organization_id" IS NULL AND app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff())));
\else
CREATE POLICY "saas_bootstrap_hybrid_p0_8_6" ON "public"."platform_user_contacts" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()) OR ("organization_id" IS NULL AND app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()) OR ("organization_id" IS NULL AND app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()))));
\endif

-- public.product_analytics_events_recent (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."product_analytics_events_recent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."product_analytics_events_recent";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."product_analytics_events_recent" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."product_analytics_events_recent" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))));
\endif

-- public.product_analytics_user_hourly (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."product_analytics_user_hourly" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."product_analytics_user_hourly";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."product_analytics_user_hourly" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."product_analytics_user_hourly" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))));
\endif

-- public.product_push_notifications (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."product_push_notifications" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."product_push_notifications";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."product_push_notifications" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."product_push_notifications" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "user_id" = app.current_patient_user_id()))));
\endif

-- public.program_action_log (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."program_action_log" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."program_action_log";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."program_action_log" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."program_action_log" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))));
\endif

-- public.program_item_discussion_messages (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."program_item_discussion_messages" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."program_item_discussion_messages";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."program_item_discussion_messages" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."program_item_discussion_messages" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))));
\endif

-- public.program_item_discussion_reads (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."program_item_discussion_reads" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."program_item_discussion_reads";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."program_item_discussion_reads" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."program_item_discussion_reads" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))));
\endif

-- public.recommendation_regions (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."recommendation_regions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."recommendation_regions";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."recommendation_regions" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."recommendation_regions" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.recommendations (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."recommendations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."recommendations";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."recommendations" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."recommendations" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.reference_categories (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."reference_categories" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."reference_categories";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."reference_categories" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."reference_categories" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.reference_items (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."reference_items" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."reference_items";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."reference_items" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."reference_items" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.reminder_delivery_events (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."reminder_delivery_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."reminder_delivery_events";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."reminder_delivery_events" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_integrator_user_id() IS NOT NULL AND "integrator_user_id" = app.current_integrator_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_integrator_user_id() IS NOT NULL AND "integrator_user_id" = app.current_integrator_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."reminder_delivery_events" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_integrator_user_id() IS NOT NULL AND "integrator_user_id" = app.current_integrator_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_integrator_user_id() IS NOT NULL AND "integrator_user_id" = app.current_integrator_user_id()))));
\endif

-- public.reminder_journal (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."reminder_journal" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."reminder_journal";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."reminder_journal" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."reminder_rules" AS "b4f_rule" WHERE "b4f_rule"."id" = "rule_id" AND "b4f_rule"."platform_user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."reminder_rules" AS "b4f_rule" WHERE "b4f_rule"."id" = "rule_id" AND "b4f_rule"."platform_user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."reminder_journal" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."reminder_rules" AS "b4f_rule" WHERE "b4f_rule"."id" = "rule_id" AND "b4f_rule"."platform_user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."reminder_rules" AS "b4f_rule" WHERE "b4f_rule"."id" = "rule_id" AND "b4f_rule"."platform_user_id" = app.current_patient_user_id() )))));
\endif

-- public.reminder_occurrence_history (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."reminder_occurrence_history" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."reminder_occurrence_history";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."reminder_occurrence_history" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."platform_users" AS "b4f_reminder_occurrence_platform_user" WHERE "b4f_reminder_occurrence_platform_user"."integrator_user_id" = "public"."reminder_occurrence_history"."integrator_user_id" AND "b4f_reminder_occurrence_platform_user"."id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."platform_users" AS "b4f_reminder_occurrence_platform_user" WHERE "b4f_reminder_occurrence_platform_user"."integrator_user_id" = "public"."reminder_occurrence_history"."integrator_user_id" AND "b4f_reminder_occurrence_platform_user"."id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."reminder_occurrence_history" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."platform_users" AS "b4f_reminder_occurrence_platform_user" WHERE "b4f_reminder_occurrence_platform_user"."integrator_user_id" = "public"."reminder_occurrence_history"."integrator_user_id" AND "b4f_reminder_occurrence_platform_user"."id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."platform_users" AS "b4f_reminder_occurrence_platform_user" WHERE "b4f_reminder_occurrence_platform_user"."integrator_user_id" = "public"."reminder_occurrence_history"."integrator_user_id" AND "b4f_reminder_occurrence_platform_user"."id" = app.current_patient_user_id() )))));
\endif

-- public.reminder_rules (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."reminder_rules" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."reminder_rules";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."reminder_rules" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."reminder_rules" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))));
\endif

-- public.saas_org_entitlement_overrides (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."saas_org_entitlement_overrides" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."saas_org_entitlement_overrides";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."saas_org_entitlement_overrides" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."saas_org_entitlement_overrides" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.saas_organization_trials (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."saas_organization_trials" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."saas_organization_trials";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."saas_organization_trials" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."saas_organization_trials" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.specialist_tasks (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."specialist_tasks" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."specialist_tasks";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."specialist_tasks" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."specialist_tasks" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))));
\endif

-- public.support_conversation_messages (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."support_conversation_messages" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."support_conversation_messages";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."support_conversation_messages" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."support_conversations" AS "b4f_conv" WHERE "b4f_conv"."id" = "conversation_id" AND "b4f_conv"."platform_user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."support_conversations" AS "b4f_conv" WHERE "b4f_conv"."id" = "conversation_id" AND "b4f_conv"."platform_user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."support_conversation_messages" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."support_conversations" AS "b4f_conv" WHERE "b4f_conv"."id" = "conversation_id" AND "b4f_conv"."platform_user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."support_conversations" AS "b4f_conv" WHERE "b4f_conv"."id" = "conversation_id" AND "b4f_conv"."platform_user_id" = app.current_patient_user_id() )))));
\endif

-- public.support_conversations (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."support_conversations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."support_conversations";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."support_conversations" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."support_conversations" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))));
\endif

-- public.support_delivery_events (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."support_delivery_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."support_delivery_events";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."support_delivery_events" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."support_conversation_messages" AS "b4f_msg" JOIN "public"."support_conversations" AS "b4f_conv" ON "b4f_conv"."id" = "b4f_msg"."conversation_id" WHERE "b4f_msg"."id" = "conversation_message_id" AND "b4f_conv"."platform_user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."support_conversation_messages" AS "b4f_msg" JOIN "public"."support_conversations" AS "b4f_conv" ON "b4f_conv"."id" = "b4f_msg"."conversation_id" WHERE "b4f_msg"."id" = "conversation_message_id" AND "b4f_conv"."platform_user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."support_delivery_events" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."support_conversation_messages" AS "b4f_msg" JOIN "public"."support_conversations" AS "b4f_conv" ON "b4f_conv"."id" = "b4f_msg"."conversation_id" WHERE "b4f_msg"."id" = "conversation_message_id" AND "b4f_conv"."platform_user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."support_conversation_messages" AS "b4f_msg" JOIN "public"."support_conversations" AS "b4f_conv" ON "b4f_conv"."id" = "b4f_msg"."conversation_id" WHERE "b4f_msg"."id" = "conversation_message_id" AND "b4f_conv"."platform_user_id" = app.current_patient_user_id() )))));
\endif

-- public.support_question_messages (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."support_question_messages" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."support_question_messages";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."support_question_messages" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."support_questions" AS "b4f_question" JOIN "public"."support_conversations" AS "b4f_conv" ON "b4f_conv"."id" = "b4f_question"."conversation_id" WHERE "b4f_question"."id" = "question_id" AND "b4f_conv"."platform_user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."support_questions" AS "b4f_question" JOIN "public"."support_conversations" AS "b4f_conv" ON "b4f_conv"."id" = "b4f_question"."conversation_id" WHERE "b4f_question"."id" = "question_id" AND "b4f_conv"."platform_user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."support_question_messages" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."support_questions" AS "b4f_question" JOIN "public"."support_conversations" AS "b4f_conv" ON "b4f_conv"."id" = "b4f_question"."conversation_id" WHERE "b4f_question"."id" = "question_id" AND "b4f_conv"."platform_user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."support_questions" AS "b4f_question" JOIN "public"."support_conversations" AS "b4f_conv" ON "b4f_conv"."id" = "b4f_question"."conversation_id" WHERE "b4f_question"."id" = "question_id" AND "b4f_conv"."platform_user_id" = app.current_patient_user_id() )))));
\endif

-- public.support_questions (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."support_questions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."support_questions";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."support_questions" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."support_conversations" AS "b4f_conv" WHERE "b4f_conv"."id" = "conversation_id" AND "b4f_conv"."platform_user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."support_conversations" AS "b4f_conv" WHERE "b4f_conv"."id" = "conversation_id" AND "b4f_conv"."platform_user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."support_questions" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."support_conversations" AS "b4f_conv" WHERE "b4f_conv"."id" = "conversation_id" AND "b4f_conv"."platform_user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."support_conversations" AS "b4f_conv" WHERE "b4f_conv"."id" = "conversation_id" AND "b4f_conv"."platform_user_id" = app.current_patient_user_id() )))));
\endif

-- public.symptom_entries (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."symptom_entries" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."symptom_entries";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."symptom_entries" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."symptom_entries" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))));
\endif

-- public.symptom_trackings (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."symptom_trackings" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."symptom_trackings";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."symptom_trackings" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."symptom_trackings" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "platform_user_id" = app.current_patient_user_id()))));
\endif

-- public.system_settings (saas_bootstrap_hybrid_p0_8_6)
ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_bootstrap_hybrid_p0_8_6" ON "public"."system_settings";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_bootstrap_hybrid_p0_8_6" ON "public"."system_settings" FOR ALL USING (("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK (("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_bootstrap_hybrid_p0_8_6" ON "public"."system_settings" FOR ALL USING (("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK (("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\endif

-- public.system_settings_audit (saas_bootstrap_hybrid_p0_8_6)
ALTER TABLE "public"."system_settings_audit" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_bootstrap_hybrid_p0_8_6" ON "public"."system_settings_audit";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_bootstrap_hybrid_p0_8_6" ON "public"."system_settings_audit" FOR ALL USING (("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK (("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_bootstrap_hybrid_p0_8_6" ON "public"."system_settings_audit" FOR ALL USING (("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK (("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\endif

-- public.test_attempts (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."test_attempts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."test_attempts";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."test_attempts" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."test_attempts" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))));
\endif

-- public.test_results (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."test_results" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."test_results";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."test_results" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."test_attempts" AS "b4f_attempt" WHERE "b4f_attempt"."id" = "attempt_id" AND "b4f_attempt"."patient_user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."test_attempts" AS "b4f_attempt" WHERE "b4f_attempt"."id" = "attempt_id" AND "b4f_attempt"."patient_user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."test_results" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."test_attempts" AS "b4f_attempt" WHERE "b4f_attempt"."id" = "attempt_id" AND "b4f_attempt"."patient_user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."test_attempts" AS "b4f_attempt" WHERE "b4f_attempt"."id" = "attempt_id" AND "b4f_attempt"."patient_user_id" = app.current_patient_user_id() )))));
\endif

-- public.test_set_items (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."test_set_items" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."test_set_items";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."test_set_items" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."test_set_items" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.test_sets (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."test_sets" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."test_sets";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."test_sets" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."test_sets" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.tests (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."tests" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."tests";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."tests" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."tests" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.treatment_program_events (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."treatment_program_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."treatment_program_events";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."treatment_program_events" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instances" AS "b4f_instance" WHERE "b4f_instance"."id" = "instance_id" AND "b4f_instance"."patient_user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instances" AS "b4f_instance" WHERE "b4f_instance"."id" = "instance_id" AND "b4f_instance"."patient_user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."treatment_program_events" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instances" AS "b4f_instance" WHERE "b4f_instance"."id" = "instance_id" AND "b4f_instance"."patient_user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instances" AS "b4f_instance" WHERE "b4f_instance"."id" = "instance_id" AND "b4f_instance"."patient_user_id" = app.current_patient_user_id() )))));
\endif

-- public.treatment_program_instance_stage_groups (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."treatment_program_instance_stage_groups" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."treatment_program_instance_stage_groups";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."treatment_program_instance_stage_groups" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instance_stages" AS "b4f_stage" JOIN "public"."treatment_program_instances" AS "b4f_instance" ON "b4f_instance"."id" = "b4f_stage"."instance_id" WHERE "b4f_stage"."id" = "stage_id" AND "b4f_instance"."patient_user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instance_stages" AS "b4f_stage" JOIN "public"."treatment_program_instances" AS "b4f_instance" ON "b4f_instance"."id" = "b4f_stage"."instance_id" WHERE "b4f_stage"."id" = "stage_id" AND "b4f_instance"."patient_user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."treatment_program_instance_stage_groups" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instance_stages" AS "b4f_stage" JOIN "public"."treatment_program_instances" AS "b4f_instance" ON "b4f_instance"."id" = "b4f_stage"."instance_id" WHERE "b4f_stage"."id" = "stage_id" AND "b4f_instance"."patient_user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instance_stages" AS "b4f_stage" JOIN "public"."treatment_program_instances" AS "b4f_instance" ON "b4f_instance"."id" = "b4f_stage"."instance_id" WHERE "b4f_stage"."id" = "stage_id" AND "b4f_instance"."patient_user_id" = app.current_patient_user_id() )))));
\endif

-- public.treatment_program_instance_stage_items (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."treatment_program_instance_stage_items" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."treatment_program_instance_stage_items";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."treatment_program_instance_stage_items" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instance_stages" AS "b4f_stage" JOIN "public"."treatment_program_instances" AS "b4f_instance" ON "b4f_instance"."id" = "b4f_stage"."instance_id" WHERE "b4f_stage"."id" = "stage_id" AND "b4f_instance"."patient_user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instance_stages" AS "b4f_stage" JOIN "public"."treatment_program_instances" AS "b4f_instance" ON "b4f_instance"."id" = "b4f_stage"."instance_id" WHERE "b4f_stage"."id" = "stage_id" AND "b4f_instance"."patient_user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."treatment_program_instance_stage_items" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instance_stages" AS "b4f_stage" JOIN "public"."treatment_program_instances" AS "b4f_instance" ON "b4f_instance"."id" = "b4f_stage"."instance_id" WHERE "b4f_stage"."id" = "stage_id" AND "b4f_instance"."patient_user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instance_stages" AS "b4f_stage" JOIN "public"."treatment_program_instances" AS "b4f_instance" ON "b4f_instance"."id" = "b4f_stage"."instance_id" WHERE "b4f_stage"."id" = "stage_id" AND "b4f_instance"."patient_user_id" = app.current_patient_user_id() )))));
\endif

-- public.treatment_program_instance_stages (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."treatment_program_instance_stages" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."treatment_program_instance_stages";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."treatment_program_instance_stages" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instances" AS "b4f_instance" WHERE "b4f_instance"."id" = "instance_id" AND "b4f_instance"."patient_user_id" = app.current_patient_user_id() )))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instances" AS "b4f_instance" WHERE "b4f_instance"."id" = "instance_id" AND "b4f_instance"."patient_user_id" = app.current_patient_user_id() ))));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."treatment_program_instance_stages" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instances" AS "b4f_instance" WHERE "b4f_instance"."id" = "instance_id" AND "b4f_instance"."patient_user_id" = app.current_patient_user_id() ))))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS ( SELECT 1 FROM "public"."treatment_program_instances" AS "b4f_instance" WHERE "b4f_instance"."id" = "instance_id" AND "b4f_instance"."patient_user_id" = app.current_patient_user_id() )))));
\endif

-- public.treatment_program_instances (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."treatment_program_instances" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."treatment_program_instances";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."treatment_program_instances" FOR ALL USING (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))) WITH CHECK (((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."treatment_program_instances" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())) OR (app.current_patient_user_id() IS NOT NULL AND "patient_user_id" = app.current_patient_user_id()))));
\endif

-- public.treatment_program_template_stage_groups (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."treatment_program_template_stage_groups" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."treatment_program_template_stage_groups";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."treatment_program_template_stage_groups" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."treatment_program_template_stage_groups" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.treatment_program_template_stage_items (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."treatment_program_template_stage_items" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."treatment_program_template_stage_items";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."treatment_program_template_stage_items" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."treatment_program_template_stage_items" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.treatment_program_template_stages (saas_org_dormant_p0_8_4)
ALTER TABLE "public"."treatment_program_template_stages" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON "public"."treatment_program_template_stages";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."treatment_program_template_stages" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_4" ON "public"."treatment_program_template_stages" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.treatment_program_templates (saas_org_dormant_p0_8_3)
ALTER TABLE "public"."treatment_program_templates" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."treatment_program_templates";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."treatment_program_templates" FOR ALL USING ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))) WITH CHECK ((app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())));
\else
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."treatment_program_templates" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR (app.is_staff() AND (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))));
\endif

-- public.user_phone_history (saas_bootstrap_hybrid_p0_8_6)
ALTER TABLE "public"."user_phone_history" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_bootstrap_hybrid_p0_8_6" ON "public"."user_phone_history";
\if :phase4_enforce_locked_context
CREATE POLICY "saas_bootstrap_hybrid_p0_8_6" ON "public"."user_phone_history" FOR ALL USING (((app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()) OR ("organization_id" IS NULL AND app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()))) WITH CHECK (((app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()) OR ("organization_id" IS NULL AND app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff())));
\else
CREATE POLICY "saas_bootstrap_hybrid_p0_8_6" ON "public"."user_phone_history" FOR ALL USING (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()) OR ("organization_id" IS NULL AND app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff())))) WITH CHECK (((app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()) OR ((app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()) OR ("organization_id" IS NULL AND app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()))));
\endif

COMMIT;
