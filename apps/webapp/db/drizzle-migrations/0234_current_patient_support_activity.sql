-- 0234_current_patient_support_activity: bounded current-patient conversation activity write.
--
-- The caller supplies only the message id returned by the immediately preceding INSERT in the
-- same transaction. Organization, patient and activity time are server-owned. The current
-- transaction check prevents replaying an old message id merely to reorder the support inbox.
-- Existing primary/unique indexes cover every lookup; no new hot-column index is required.

CREATE OR REPLACE FUNCTION app.touch_current_patient_support_conversation_activity(
  p_message_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_patient_user_id uuid := app.current_patient_user_id();
  v_activity_at timestamptz := transaction_timestamp();
  v_updated_count bigint := 0;
BEGIN
  IF v_organization_id IS NULL OR v_patient_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = v_organization_id
      AND enrollment.platform_user_id = v_patient_user_id
      AND enrollment.status = 'active'
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.support_conversations AS conversation
  SET last_message_at = GREATEST(conversation.last_message_at, v_activity_at),
      updated_at = v_activity_at
  FROM public.support_conversation_messages AS message
  WHERE message.id = p_message_id
    AND message.xmin = pg_current_xact_id()::text::xid
    AND message.organization_id = v_organization_id
    AND message.conversation_id = conversation.id
    AND message.sender_role = 'user'
    AND message.source = 'webapp'
    AND conversation.organization_id = v_organization_id
    AND conversation.platform_user_id = v_patient_user_id
    AND conversation.source = 'webapp'
    AND conversation.admin_scope = 'support';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count > 0;
END
$function$;

REVOKE ALL ON FUNCTION app.touch_current_patient_support_conversation_activity(uuid) FROM PUBLIC;
