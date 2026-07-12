-- Phase 2 / P2-C1 patient value-level guards.
--
-- Applies after P2-B protected principal context. These triggers close value-level residuals that
-- column grants cannot express: patient-context writes may only carry patient-safe values and must
-- target rows owned by the current patient/org helpers.

\set ON_ERROR_STOP on
\pset pager off

\if :{?p2_c1_down}
DROP TRIGGER IF EXISTS p2_c1_program_item_discussion_patient_insert_guard ON public.program_item_discussion_messages;
DROP TRIGGER IF EXISTS p2_c1_support_conversation_messages_patient_insert_guard ON public.support_conversation_messages;
DROP TRIGGER IF EXISTS p2_c1_treatment_program_events_patient_insert_guard ON public.treatment_program_events;
DROP FUNCTION IF EXISTS app.p2_c1_guard_program_item_discussion_messages();
DROP FUNCTION IF EXISTS app.p2_c1_guard_support_conversation_messages();
DROP FUNCTION IF EXISTS app.p2_c1_guard_treatment_program_events();
DROP FUNCTION IF EXISTS app.p2_c1_is_patient_context();
\echo 'P2-C1 patient value guards DOWN complete.'
\quit
\endif

\if :{?p2_c1_staff_role}
\else
\set p2_c1_staff_role app_staff
\endif

\if :{?p2_c1_patient_role}
\else
\set p2_c1_patient_role app_patient
\endif

SELECT (
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'p2_c1_staff_role')
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'p2_c1_patient_role')
)::int AS p2_c1_roles_exist \gset

\if :p2_c1_roles_exist
\else
\echo 'FATAL: P2-C1 explicit grants require p2_c1_staff_role/p2_c1_patient_role to exist.'
SELECT 1 / 0 AS p2_c1_abort;
\endif

CREATE OR REPLACE FUNCTION app.p2_c1_is_patient_context() RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = app, pg_catalog
AS $$
  SELECT app.current_patient_user_id() IS NOT NULL AND NOT app.is_staff()
$$;

CREATE OR REPLACE FUNCTION app.p2_c1_guard_program_item_discussion_messages() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_patient_user_id uuid;
  v_org_id uuid;
BEGIN
  IF NOT app.p2_c1_is_patient_context() THEN
    RETURN NEW;
  END IF;

  v_patient_user_id := app.current_patient_user_id();
  v_org_id := app.current_org_id();

  IF NEW.patient_user_id IS DISTINCT FROM v_patient_user_id THEN
    RAISE EXCEPTION 'patient_discussion_message_patient_mismatch';
  END IF;

  IF NEW.sender_role IS DISTINCT FROM 'patient'
    OR NEW.origin IS DISTINCT FROM 'patient_observation'
    OR NEW.support_message_id IS NOT NULL THEN
    RAISE EXCEPTION 'patient_discussion_message_value_forbidden';
  END IF;

  IF v_org_id IS NOT NULL AND NEW.organization_id IS DISTINCT FROM v_org_id THEN
    RAISE EXCEPTION 'patient_discussion_message_org_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.treatment_program_instance_stage_items item
    JOIN public.treatment_program_instance_stages stage ON stage.id = item.stage_id
    JOIN public.treatment_program_instances instance ON instance.id = stage.instance_id
    WHERE item.id = NEW.instance_stage_item_id
      AND instance.patient_user_id = v_patient_user_id
      AND (v_org_id IS NULL OR (
        item.organization_id = v_org_id
        AND stage.organization_id = v_org_id
        AND instance.organization_id = v_org_id
      ))
  ) THEN
    RAISE EXCEPTION 'patient_discussion_message_item_not_owned';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.p2_c1_guard_support_conversation_messages() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_patient_user_id uuid;
  v_org_id uuid;
BEGIN
  IF NOT app.p2_c1_is_patient_context() THEN
    RETURN NEW;
  END IF;

  v_patient_user_id := app.current_patient_user_id();
  v_org_id := app.current_org_id();

  IF NEW.sender_role IS DISTINCT FROM 'user' OR NEW.source IS DISTINCT FROM 'webapp' THEN
    RAISE EXCEPTION 'patient_support_message_value_forbidden';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.support_conversations conversation
    WHERE conversation.id = NEW.conversation_id
      AND conversation.platform_user_id = v_patient_user_id
      AND (v_org_id IS NULL OR conversation.organization_id = v_org_id)
      AND (v_org_id IS NULL OR NEW.organization_id = v_org_id)
  ) THEN
    RAISE EXCEPTION 'patient_support_message_conversation_not_owned';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.p2_c1_guard_treatment_program_events() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_patient_user_id uuid;
  v_org_id uuid;
BEGIN
  IF NOT app.p2_c1_is_patient_context() THEN
    RETURN NEW;
  END IF;

  v_patient_user_id := app.current_patient_user_id();
  v_org_id := app.current_org_id();

  IF NEW.actor_id IS NULL THEN
    NEW.actor_id := v_patient_user_id;
  ELSIF NEW.actor_id IS DISTINCT FROM v_patient_user_id THEN
    RAISE EXCEPTION 'patient_treatment_event_actor_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.treatment_program_instances instance
    WHERE instance.id = NEW.instance_id
      AND instance.patient_user_id = v_patient_user_id
      AND (v_org_id IS NULL OR instance.organization_id = v_org_id)
      AND (v_org_id IS NULL OR NEW.organization_id = v_org_id)
  ) THEN
    RAISE EXCEPTION 'patient_treatment_event_instance_not_owned';
  END IF;

  IF NOT (
    (NEW.event_type = 'stage_completed' AND NEW.target_type = 'stage')
    OR (NEW.event_type = 'test_completed' AND NEW.target_type = 'stage_item')
    OR (NEW.event_type = 'status_changed' AND NEW.target_type IN ('stage', 'stage_item'))
  ) THEN
    RAISE EXCEPTION 'patient_treatment_event_shape_forbidden';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.p2_c1_is_patient_context() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.p2_c1_guard_program_item_discussion_messages() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.p2_c1_guard_support_conversation_messages() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.p2_c1_guard_treatment_program_events() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.p2_c1_is_patient_context()
  TO :"p2_c1_staff_role", :"p2_c1_patient_role";
GRANT EXECUTE ON FUNCTION app.p2_c1_guard_program_item_discussion_messages()
  TO :"p2_c1_staff_role", :"p2_c1_patient_role";
GRANT EXECUTE ON FUNCTION app.p2_c1_guard_support_conversation_messages()
  TO :"p2_c1_staff_role", :"p2_c1_patient_role";
GRANT EXECUTE ON FUNCTION app.p2_c1_guard_treatment_program_events()
  TO :"p2_c1_staff_role", :"p2_c1_patient_role";

DROP TRIGGER IF EXISTS p2_c1_program_item_discussion_patient_insert_guard ON public.program_item_discussion_messages;
CREATE TRIGGER p2_c1_program_item_discussion_patient_insert_guard
  BEFORE INSERT ON public.program_item_discussion_messages
  FOR EACH ROW
  EXECUTE FUNCTION app.p2_c1_guard_program_item_discussion_messages();

DROP TRIGGER IF EXISTS p2_c1_support_conversation_messages_patient_insert_guard ON public.support_conversation_messages;
CREATE TRIGGER p2_c1_support_conversation_messages_patient_insert_guard
  BEFORE INSERT ON public.support_conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION app.p2_c1_guard_support_conversation_messages();

DROP TRIGGER IF EXISTS p2_c1_treatment_program_events_patient_insert_guard ON public.treatment_program_events;
CREATE TRIGGER p2_c1_treatment_program_events_patient_insert_guard
  BEFORE INSERT ON public.treatment_program_events
  FOR EACH ROW
  EXECUTE FUNCTION app.p2_c1_guard_treatment_program_events();

\echo 'P2-C1 patient value guards UP complete.'
