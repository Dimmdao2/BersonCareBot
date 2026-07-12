-- Phase 2 / P2-C2 patient value-level guards.
--
-- Applies after P2-B protected principal context. These triggers close remaining patient value-level
-- residuals before the role flip: intake initial history rows, preferred auth channel writes, and
-- reminder notification topic routing.

\set ON_ERROR_STOP on
\pset pager off

\if :{?p2_c2_down}
DROP TRIGGER IF EXISTS p2_c2_online_intake_status_history_patient_insert_guard ON public.online_intake_status_history;
DROP TRIGGER IF EXISTS p2_c2_user_channel_preferences_patient_write_guard ON public.user_channel_preferences;
DROP TRIGGER IF EXISTS p2_c2_reminder_rules_patient_write_guard ON public.reminder_rules;
DROP FUNCTION IF EXISTS app.p2_c2_guard_online_intake_status_history();
DROP FUNCTION IF EXISTS app.p2_c2_guard_user_channel_preferences();
DROP FUNCTION IF EXISTS app.p2_c2_guard_reminder_rules();
DROP FUNCTION IF EXISTS app.p2_c2_expected_reminder_notification_topic_code(text, text, text);
DROP FUNCTION IF EXISTS app.p2_c2_user_channel_preference_is_owned(text, uuid);
DROP FUNCTION IF EXISTS app.p2_c2_is_patient_context();
\echo 'P2-C2 patient value guards DOWN complete.'
\quit
\endif

\if :{?p2_c2_staff_role}
\else
\set p2_c2_staff_role app_staff
\endif

\if :{?p2_c2_patient_role}
\else
\set p2_c2_patient_role app_patient
\endif

SELECT (
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'p2_c2_staff_role')
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'p2_c2_patient_role')
)::int AS p2_c2_roles_exist \gset

\if :p2_c2_roles_exist
\else
\echo 'FATAL: P2-C2 explicit grants require p2_c2_staff_role/p2_c2_patient_role to exist.'
SELECT 1 / 0 AS p2_c2_abort;
\endif

CREATE OR REPLACE FUNCTION app.p2_c2_is_patient_context() RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = app, pg_catalog
AS $$
  SELECT app.current_patient_user_id() IS NOT NULL AND NOT app.is_staff()
$$;

CREATE OR REPLACE FUNCTION app.p2_c2_user_channel_preference_is_owned(
  p_user_id text,
  p_platform_user_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = app, public, pg_catalog
AS $$
  SELECT p_platform_user_id = app.current_patient_user_id()
    OR (p_platform_user_id IS NULL AND p_user_id = app.current_patient_user_id()::text)
$$;

CREATE OR REPLACE FUNCTION app.p2_c2_expected_reminder_notification_topic_code(
  p_category text,
  p_linked_object_type text,
  p_reminder_intent text
) RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = app, pg_catalog
AS $$
  SELECT CASE
    WHEN p_category = 'appointment' THEN 'appointment_reminders'
    WHEN p_category = 'important' THEN NULL
    WHEN lower(btrim(COALESCE(p_reminder_intent, ''))) = 'warmup' THEN 'warmup_reminders'
    WHEN p_category = 'lfk' THEN 'training_reminders'
    WHEN p_linked_object_type IN (
      'rehab_program',
      'treatment_program_item',
      'lfk_complex',
      'content_page',
      'content_section'
    ) THEN 'training_reminders'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION app.p2_c2_guard_online_intake_status_history() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_patient_user_id uuid;
  v_org_id uuid;
BEGIN
  IF NOT app.p2_c2_is_patient_context() THEN
    RETURN NEW;
  END IF;

  v_patient_user_id := app.current_patient_user_id();
  v_org_id := app.current_org_id();

  IF NEW.from_status IS NOT NULL
    OR NEW.to_status IS DISTINCT FROM 'new'
    OR NEW.changed_by IS NOT NULL
    OR NEW.note IS NOT NULL THEN
    RAISE EXCEPTION 'patient_intake_initial_history_value_forbidden';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM v_org_id THEN
    RAISE EXCEPTION 'patient_intake_initial_history_org_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.online_intake_requests request
    WHERE request.id = NEW.request_id
      AND request.user_id = v_patient_user_id
      AND request.organization_id = v_org_id
      AND request.status = 'new'
  ) THEN
    RAISE EXCEPTION 'patient_intake_initial_history_request_not_owned';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.online_intake_status_history existing_history
    WHERE existing_history.request_id = NEW.request_id
  ) THEN
    RAISE EXCEPTION 'patient_intake_initial_history_already_exists';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.p2_c2_guard_user_channel_preferences() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = app, public, pg_catalog
AS $$
BEGIN
  IF NOT app.p2_c2_is_patient_context() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NOT app.p2_c2_user_channel_preference_is_owned(OLD.user_id, OLD.platform_user_id) THEN
    RAISE EXCEPTION 'patient_channel_preference_old_row_not_owned';
  END IF;

  IF NOT app.p2_c2_user_channel_preference_is_owned(NEW.user_id, NEW.platform_user_id) THEN
    RAISE EXCEPTION 'patient_channel_preference_new_row_not_owned';
  END IF;

  IF NEW.is_preferred_for_auth
    AND NEW.channel_code NOT IN ('telegram', 'max', 'email', 'sms') THEN
    RAISE EXCEPTION 'patient_channel_preference_auth_channel_forbidden';
  END IF;

  IF NEW.is_preferred_for_auth THEN
    IF TG_OP = 'UPDATE' THEN
      IF EXISTS (
        SELECT 1
        FROM public.user_channel_preferences existing_pref
        WHERE existing_pref.is_preferred_for_auth = true
          AND app.p2_c2_user_channel_preference_is_owned(
            existing_pref.user_id,
            existing_pref.platform_user_id
          )
          AND (
            existing_pref.user_id IS DISTINCT FROM OLD.user_id
            OR existing_pref.channel_code IS DISTINCT FROM OLD.channel_code
            OR existing_pref.platform_user_id IS DISTINCT FROM OLD.platform_user_id
          )
      ) THEN
        RAISE EXCEPTION 'patient_channel_preference_auth_preferred_already_exists';
      END IF;
    ELSE
      IF EXISTS (
        SELECT 1
        FROM public.user_channel_preferences existing_pref
        WHERE existing_pref.is_preferred_for_auth = true
          AND app.p2_c2_user_channel_preference_is_owned(
            existing_pref.user_id,
            existing_pref.platform_user_id
          )
      ) THEN
        RAISE EXCEPTION 'patient_channel_preference_auth_preferred_already_exists';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.p2_c2_guard_reminder_rules() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_patient_user_id uuid;
  v_org_id uuid;
BEGIN
  IF NOT app.p2_c2_is_patient_context() THEN
    RETURN NEW;
  END IF;

  v_patient_user_id := app.current_patient_user_id();
  v_org_id := app.current_org_id();

  IF NOT EXISTS (
    SELECT 1
    FROM public.platform_users pu
    WHERE pu.id = v_patient_user_id
      AND (
        NEW.platform_user_id = v_patient_user_id
        OR (
          NEW.platform_user_id IS NULL
          AND NEW.integrator_user_id IS NOT NULL
          AND pu.integrator_user_id = NEW.integrator_user_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'patient_reminder_rule_not_owned';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM v_org_id THEN
    RAISE EXCEPTION 'patient_reminder_rule_org_mismatch';
  END IF;

  NEW.notification_topic_code := app.p2_c2_expected_reminder_notification_topic_code(
    NEW.category,
    NEW.linked_object_type,
    NEW.reminder_intent
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.p2_c2_is_patient_context() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.p2_c2_user_channel_preference_is_owned(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.p2_c2_expected_reminder_notification_topic_code(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.p2_c2_guard_online_intake_status_history() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.p2_c2_guard_user_channel_preferences() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.p2_c2_guard_reminder_rules() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.p2_c2_is_patient_context()
  TO :"p2_c2_staff_role", :"p2_c2_patient_role";
GRANT EXECUTE ON FUNCTION app.p2_c2_user_channel_preference_is_owned(text, uuid)
  TO :"p2_c2_staff_role", :"p2_c2_patient_role";
GRANT EXECUTE ON FUNCTION app.p2_c2_expected_reminder_notification_topic_code(text, text, text)
  TO :"p2_c2_staff_role", :"p2_c2_patient_role";
GRANT EXECUTE ON FUNCTION app.p2_c2_guard_online_intake_status_history()
  TO :"p2_c2_staff_role", :"p2_c2_patient_role";
GRANT EXECUTE ON FUNCTION app.p2_c2_guard_user_channel_preferences()
  TO :"p2_c2_staff_role", :"p2_c2_patient_role";
GRANT EXECUTE ON FUNCTION app.p2_c2_guard_reminder_rules()
  TO :"p2_c2_staff_role", :"p2_c2_patient_role";

DROP TRIGGER IF EXISTS p2_c2_online_intake_status_history_patient_insert_guard ON public.online_intake_status_history;
CREATE TRIGGER p2_c2_online_intake_status_history_patient_insert_guard
  BEFORE INSERT ON public.online_intake_status_history
  FOR EACH ROW
  EXECUTE FUNCTION app.p2_c2_guard_online_intake_status_history();

DROP TRIGGER IF EXISTS p2_c2_user_channel_preferences_patient_write_guard ON public.user_channel_preferences;
CREATE TRIGGER p2_c2_user_channel_preferences_patient_write_guard
  BEFORE INSERT OR UPDATE ON public.user_channel_preferences
  FOR EACH ROW
  EXECUTE FUNCTION app.p2_c2_guard_user_channel_preferences();

DROP TRIGGER IF EXISTS p2_c2_reminder_rules_patient_write_guard ON public.reminder_rules;
CREATE TRIGGER p2_c2_reminder_rules_patient_write_guard
  BEFORE INSERT OR UPDATE ON public.reminder_rules
  FOR EACH ROW
  EXECUTE FUNCTION app.p2_c2_guard_reminder_rules();

\echo 'P2-C2 patient value guards UP complete.'
